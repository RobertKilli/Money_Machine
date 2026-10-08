import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestOptions } from "node:https";
import type { IncomingMessage } from "node:http";

const mocks = vi.hoisted(() => ({
  authenticPlan: vi.fn(() => true),
  currentlyQualified: vi.fn(() => true),
  qualificationReference: "sec-edgar-8k-local-smoke-qualification:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  derivePlan: vi.fn((base: Record<string, unknown>, profileId: string, filename: string | null) => ({ ...base, profileId, responseKind: profileId === "FILING_INDEX" ? "HTML" : "JSON", allowedContentTypes: profileId === "FILING_INDEX" ? ["text/html"] : ["application/json"], url: profileId === "SUBMISSIONS_HISTORY_JSON" ? `https://data.sec.gov/submissions/${filename}` : "https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/0001193125-23-255762-index.htm" })),
  request: vi.fn(),
  authorizations: [] as Record<string, unknown>[],
  requestTimes: [] as number[],
}));

vi.mock("node:https", () => ({ request: mocks.request }));
vi.mock("@/domain/intelligence/sec-edgar-8k-event-source-qualification", () => ({
  SEC_EDGAR_8K_ENDPOINT_PROFILES: [
    { profileId: "COMPANY_SUBMISSIONS_JSON", hostname: "data.sec.gov", responseKind: "JSON", allowedContentTypes: ["application/json"] },
    { profileId: "SUBMISSIONS_HISTORY_JSON", hostname: "data.sec.gov", responseKind: "JSON", allowedContentTypes: ["application/json"] },
    { profileId: "FILING_INDEX", hostname: "www.sec.gov", responseKind: "HTML", allowedContentTypes: ["text/html"] },
  ],
  isAuthenticSecEdgar8kRequestPlan: mocks.authenticPlan,
  isCurrentlyQualifiedSecEdgar8kRequestPlan: mocks.currentlyQualified,
  isCurrentlySecEdgar8kLocalSmokeQualifiedRequestPlan: mocks.currentlyQualified,
  getSecEdgar8kLocalSmokeQualificationReferenceForPlan: () => mocks.qualificationReference,
  deriveSecEdgar8kRequestPlanFromSubmissions: mocks.derivePlan,
}));
vi.mock("@/infrastructure/intelligence/sec-edgar-8k-local-smoke-authorization", () => ({ SEC_EDGAR_8K_LOCAL_SMOKE_AUTHORIZATIONS: mocks.authorizations }));

import { acquireSecEdgar8kLocalSmokeExchange, executeSecEdgar8kLocalSmoke, SEC_EDGAR_8K_LOCAL_SMOKE_DRY_RUN } from "@/infrastructure/intelligence/sec-edgar-8k-node-transport";
import { adaptSecEdgar8kTransportExchange } from "@/infrastructure/intelligence/sec-edgar-8k-response-adapter";
import { runSecEdgar8kLocalSmoke } from "@/infrastructure/intelligence/sec-edgar-8k-local-smoke-runner";
import { isAuthenticSecEdgar8kLocalSmokeResult } from "@/infrastructure/intelligence/sec-edgar-8k-local-smoke-runner";
import { buildSecEdgar8kObservationPlan, recordSecEdgar8kSourceObservation } from "@/application/intelligence/record-sec-edgar-8k-source-observation";
import postgres from "postgres";
import { createIngestionProvenanceUnitOfWork } from "@/infrastructure/postgres/ingestion-provenance-repository";
import { readSecEdgar8kObservationReadModel } from "@/infrastructure/postgres/sec-edgar-8k-observation-read-model-repository";
import { createSourceEnvelope } from "@/domain/intelligence/ingestion-provenance";
import type { AsyncIngestionProvenanceRepositories } from "@/application/intelligence/ingestion-provenance-persistence";

const contact = "Synthetic Test Operator <sec-test@example.invalid>";
const scope = {
  authorizationId: "test-only-synthetic-permit",
  qualificationReference: mocks.qualificationReference,
  cik: "0000789019",
  accession: "0001193125-23-255762",
  form: "8-K",
  profileIds: ["COMPANY_SUBMISSIONS_JSON", "SUBMISSIONS_HISTORY_JSON", "FILING_INDEX"],
  userAgentIdentityRef: "approved-identity:synthetic-test",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  maxRequests: 3,
  minimumIntervalMs: 1000,
};
const plans = [
  { method: "GET", url: "https://data.sec.gov/submissions/CIK0000789019.json", profileId: "COMPANY_SUBMISSIONS_JSON", responseKind: "JSON", allowedContentTypes: ["application/json"], cik: "0000789019", accession: "0001193125-23-255762", form: "8-K", userAgentIdentityRef: "approved-identity:synthetic-test", timeoutMs: 10_000, maxResponseBytes: 2048, pageCount: 1, fileCount: 1, attempts: 1, redirectHostPolicy: "SAME_ALLOWLISTED_HOST_ONLY", rawBodyLogging: "FORBIDDEN" },
  { method: "GET", url: "https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/0001193125-23-255762-index.htm", profileId: "FILING_INDEX", responseKind: "HTML", allowedContentTypes: ["text/html"], cik: "0000789019", accession: "0001193125-23-255762", form: "8-K", userAgentIdentityRef: "approved-identity:synthetic-test", timeoutMs: 10_000, maxResponseBytes: 2048, pageCount: 1, fileCount: 1, attempts: 1, redirectHostPolicy: "SAME_ALLOWLISTED_HOST_ONLY", rawBodyLogging: "FORBIDDEN" },
];
const historyPlan = { ...plans[0]!, url: "https://data.sec.gov/submissions/CIK0000789019-submissions-001.json", profileId: "SUBMISSIONS_HISTORY_JSON" };
const accepted = "2023-10-13T08:37:32.000Z";
const postgresIntegrationUrl = process.env.MM_SEC_OBSERVATION_TEST_DATABASE_URL;

function assertDisposablePostgresUrl(value: string): void {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("SEC_OBSERVATION_TEST_DATABASE_URL_INVALID"); }
  if (parsed.protocol !== "postgresql:" || !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.username !== "postgres" || parsed.password !== "postgres" || Number(parsed.port) < 55439 || Number(parsed.port) > 56999 || !/^mm_sec_observation_[a-z0-9_]+$/.test(decodeURIComponent(parsed.pathname.slice(1)))) {
    throw new Error("SEC_OBSERVATION_TEST_REQUIRES_TASK_OWNED_LOOPBACK_DATABASE");
  }
}

const observationTables = ["intelligence_ingestion_requests", "intelligence_ingestion_attempts", "intelligence_ingestion_events", "intelligence_source_artifacts", "intelligence_source_envelopes", "intelligence_ingestion_source_observations", "intelligence_source_availability_claims"] as const;
async function observationTableCounts(sql: postgres.Sql): Promise<Record<string, number>> {
  const rows = await sql`select table_name, (xpath('/row/count/text()', query_to_xml(format('select count(*) as count from public.%I', table_name), false, true, '')))[1]::text::int as count from information_schema.tables where table_schema='public' and table_name in ${sql([...observationTables])}`;
  return Object.fromEntries(observationTables.map(name => [name, Number(rows.find(row => row.table_name === name)?.count ?? 0)]));
}

function failAfterActualRepositoryWrite(repositories: AsyncIngestionProvenanceRepositories, failAt: string): AsyncIngestionProvenanceRepositories {
  const injected = <T>(stage: string, save: (input: T) => Promise<T>) => async (input: T): Promise<T> => {
    const saved = await save(input);
    if (failAt === stage) throw new Error("SYNTHETIC_POSTGRES_WRITE_FAILURE");
    return saved;
  };
  const eventsSave = repositories.events.save;
  return {
    ...repositories,
    requests: { ...repositories.requests, save: injected("request", repositories.requests.save) },
    attempts: { ...repositories.attempts, save: injected("attempt", repositories.attempts.save) },
    events: { ...repositories.events, save: async input => {
      const saved = await eventsSave(input);
      if (failAt === `event:${input.eventType}`) throw new Error("SYNTHETIC_POSTGRES_WRITE_FAILURE");
      return saved;
    } },
    artifacts: { ...repositories.artifacts, save: injected("artifact", repositories.artifacts.save) },
    envelopes: { ...repositories.envelopes, save: injected("envelope", repositories.envelopes.save) },
    observations: { ...repositories.observations, save: injected("observation", repositories.observations.save) },
  };
}

function memoryObservationUnitOfWork(failWrite?: string) {
  type Collection = Map<string, Record<string, unknown>>;
  type State = { requests: Collection; attempts: Collection; events: Collection; artifacts: Collection; envelopes: Collection; observations: Collection };
  let state: State = { requests: new Map(), attempts: new Map(), events: new Map(), artifacts: new Map(), envelopes: new Map(), observations: new Map() };
  const availabilityClaimsSave = vi.fn();
  const counts = () => Object.fromEntries(Object.entries(state).map(([key, value]) => [key, value.size]));
  const repositorySet = (draft: State) => {
    const save = (collection: keyof State, idKey: string, fingerprintKey: string) => async (input: unknown) => {
      const record = input as Record<string, unknown>;
      if (`${collection}:${collection === "events" ? record.eventType : "save"}` === failWrite) throw new Error("SYNTHETIC_TRANSACTION_FAILURE");
      const id = String(record[idKey]);
      const existing = draft[collection].get(id);
      if (existing && existing[fingerprintKey] !== record[fingerprintKey]) throw new Error("SYNTHETIC_IDEMPOTENCY_CONFLICT");
      draft[collection].set(id, existing ?? record);
      return existing ?? record;
    };
    const read = (collection: keyof State, id: string) => draft[collection].get(id);
    return {
      requests: { save: save("requests", "ingestionRequestId", "requestFingerprint"), readById: async (id: string) => read("requests", id) },
      attempts: { save: save("attempts", "ingestionAttemptId", "attemptFingerprint"), readById: async (id: string) => read("attempts", id) },
      events: { save: save("events", "lifecycleEventId", "eventFingerprint"), readByAttempt: async (id: string) => [...draft.events.values()].filter(event => event.ingestionAttemptId === id) },
      artifacts: { save: save("artifacts", "sourceArtifactId", "sourceArtifactFingerprint"), readById: async (id: string) => read("artifacts", id) },
      envelopes: { save: save("envelopes", "sourceEnvelopeId", "sourceEnvelopeFingerprint"), readById: async (id: string) => read("envelopes", id) },
      observations: { save: save("observations", "sourceObservationId", "observationFingerprint"), readById: async (id: string) => read("observations", id), readByArtifact: async () => [] },
      availabilityClaims: { save: availabilityClaimsSave, readById: async () => undefined },
    };
  };
  return {
    counts,
    availabilityClaimsSave,
    unitOfWork: { withTransaction: async (work: (repositories: never) => Promise<unknown>) => {
      const draft: State = { requests: new Map(state.requests), attempts: new Map(state.attempts), events: new Map(state.events), artifacts: new Map(state.artifacts), envelopes: new Map(state.envelopes), observations: new Map(state.observations) };
      const result = await work(repositorySet(draft) as never);
      state = draft;
      return result;
    } },
  };
}

async function verifiedSyntheticRunnerResult() {
  freshPermit();
  installBodySequence([JSON.stringify(recentSubmission()), filingIndex()]);
  return runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact });
}
const freshPermit = () => mocks.authorizations.splice(0, mocks.authorizations.length, { ...scope });
const recentSubmission = (overrides: Record<string, unknown> = {}) => ({
  cik: "789019",
  name: "MICROSOFT CORP",
  filings: {
    recent: {
      accessionNumber: ["0001193125-23-255762"], form: ["8-K"], filingDate: ["2023-10-13"], reportDate: ["2023-10-13"],
      acceptanceDateTime: [accepted], primaryDocument: ["d537928d8k.htm"], primaryDocDescription: ["Current report"],
    },
    files: [{ name: "CIK0000789019-submissions-001.json", filingCount: 2, filingFrom: "2023-10-01", filingTo: "2023-10-31" }],
  },
  ...overrides,
});
function recentSubmissionWithRows(rowCount: number) {
  const accessionNumber = Array.from({ length: rowCount }, (_, index) => index === 0 ? "0001193125-23-255762" : "0000320193-23-106611");
  const form = Array.from({ length: rowCount }, (_, index) => index === 0 ? "8-K" : "10-K");
  const filingDate = Array.from({ length: rowCount }, () => "2023-10-13");
  const primaryDocument = Array.from({ length: rowCount }, (_, index) => index === 0 ? "d537928d8k.htm" : "");
  return {
    cik: "789019",
    filings: {
      recent: { accessionNumber, form, filingDate, primaryDocument },
      files: [{ name: "CIK0000789019-submissions-001.json", filingCount: 2, filingFrom: "2023-10-01", filingTo: "2023-10-31" }],
    },
  };
}
const filingIndex = (overrides: Record<string, string> = {}) => `<!DOCTYPE html><html><body>
<div id="filerDiv"><span class="companyName">MICROSOFT CORP (Filer)</span> CIK: <a href="/Archives/edgar/data/789019">0000789019</a></div>
<div class="formContent">Form 8-K - Current report:<div class="formGrouping"><div class="infoHead">Form</div><div class="info">8-K - Current report</div></div>
<div class="formGrouping"><div class="infoHead">Filing Date</div><div class="info">2023-10-13</div></div>
<div class="formGrouping"><div class="infoHead">Accepted</div><div class="info">${overrides.accepted ?? "2023-10-13 08:37:32"}</div></div>
<div>SEC Accession No. ${overrides.accession ?? "0001193125-23-255762"}</div></div>
<table class="tableFile" summary="Document Format Files"><tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th><th>Size</th></tr>
<tr><td>1</td><td>8-K</td><td><a href="${overrides.href ?? "d537928d8k.htm"}">${overrides.label ?? "d537928d8k.htm"}</a></td><td>${overrides.type ?? "8-K"}</td><td>27513</td></tr></table></body></html>`;

function fakeResponse(options: { status?: number; contentType?: string; contentLength?: string | string[]; contentEncoding?: string; location?: string; body?: string } = {}) {
  const response = new EventEmitter() as EventEmitter & IncomingMessage;
  Object.assign(response, { statusCode: options.status ?? 200, headers: { "content-type": options.contentType ?? "application/json; charset=utf-8", ...(options.contentLength === undefined ? {} : { "content-length": options.contentLength }), ...(options.contentEncoding === undefined ? {} : { "content-encoding": options.contentEncoding }), ...(options.location === undefined ? {} : { location: options.location }) } });
  response.resume = vi.fn();
  response.destroy = vi.fn();
  return { response, body: options.body ?? "{\"synthetic\":true}" };
}

function installResponse(options: Parameters<typeof fakeResponse>[0] = {}) {
  mocks.request.mockImplementation((requestOptions: RequestOptions, callback: (response: IncomingMessage) => void) => {
    mocks.requestTimes.push(performance.now());
    const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    request.destroy = vi.fn();
    request.end = () => {
      const { response, body } = fakeResponse({ ...options, contentType: options.contentType ?? (requestOptions.hostname === "www.sec.gov" ? "text/html; charset=utf-8" : "application/json; charset=utf-8") });
      callback(response);
      queueMicrotask(() => { response.emit("data", Buffer.from(body)); response.emit("end"); });
    };
    return request;
  });
}

function installBodySequence(bodies: (string | Buffer)[], contentTypes: string[] = []) {
  let index = 0;
  mocks.request.mockImplementation((requestOptions: RequestOptions, callback: (response: IncomingMessage) => void) => {
    mocks.requestTimes.push(performance.now());
    const body = bodies[index] ?? "";
    const contentType = contentTypes[index] ?? (requestOptions.hostname === "www.sec.gov" ? "text/html; charset=utf-8" : "application/json; charset=utf-8");
    index++;
    const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    request.destroy = vi.fn();
    request.end = () => {
      const { response } = fakeResponse({ contentType });
      callback(response);
      queueMicrotask(() => { response.emit("data", Buffer.isBuffer(body) ? body : Buffer.from(body)); response.emit("end"); });
    };
    return request;
  });
}

describe.skipIf(!postgresIntegrationUrl)("SEC EDGAR observation PostgreSQL Unit of Work integration", () => {
  it("commits the complete metadata-only transition, replays idempotently, and serializes concurrent replays", async () => {
    assertDisposablePostgresUrl(postgresIntegrationUrl!);
    const sql = postgres(postgresIntegrationUrl!, { max: 2, prepare: true });
    try {
      await sql`insert into public.intelligence_providers(provider_id,name,provider_type,canonical_source,provenance_policy_version,content_storage_mode) values ('SEC_EDGAR','SEC EDGAR','SEC_PUBLIC','sec.gov','sec-provenance/v1','METADATA_ONLY') on conflict (provider_id) do nothing`;
      await sql`insert into public.intelligence_datasets(dataset_id,provider_id,dataset_version,source_description,content_storage_mode) values ('FILING_METADATA','SEC_EDGAR','sec-edgar-8k-metadata/v1','Synthetic local metadata observation','METADATA_ONLY') on conflict (dataset_id) do nothing`;
      const missing = await sql`select name from (values ('intelligence_ingestion_requests'),('intelligence_ingestion_attempts'),('intelligence_ingestion_events'),('intelligence_source_artifacts'),('intelligence_source_envelopes'),('intelligence_ingestion_source_observations'),('intelligence_source_availability_claims')) expected(name) where not exists(select 1 from information_schema.tables t where t.table_schema='public' and t.table_name=expected.name)`;
      expect(missing).toEqual([]);
      const constraintCount = await sql`select count(*)::int as count from information_schema.table_constraints where constraint_schema='public' and table_name in ('intelligence_ingestion_requests','intelligence_ingestion_attempts','intelligence_ingestion_events','intelligence_source_artifacts','intelligence_source_envelopes','intelligence_ingestion_source_observations') and constraint_type in ('CHECK','FOREIGN KEY','UNIQUE')`;
      expect(Number(constraintCount[0]?.count)).toBeGreaterThan(0);
      const uow = createIngestionProvenanceUnitOfWork(sql);
      expect(await readSecEdgar8kObservationReadModel(sql)).toMatchObject({ status: "NO_RECORDED_OBSERVATIONS", observations: [], incomplete: [] });
      const runResult = await verifiedSyntheticRunnerResult();
      expect(runResult.status).toBe("VERIFIED");
      if (runResult.status !== "VERIFIED") return;

      const actualUow = createIngestionProvenanceUnitOfWork(sql);
      const failStages = ["request", "attempt", "event:STARTED", "artifact", "envelope", "observation", "event:SOURCE_OBSERVED", "event:COMPLETED"];
      for (const failAt of failStages) {
        const beforeFailure = await observationTableCounts(sql);
        const injectedUow = { withTransaction: <T>(work: (repositories: AsyncIngestionProvenanceRepositories) => Promise<T>) => actualUow.withTransaction(repositories => work(failAfterActualRepositoryWrite(repositories, failAt))) };
        await expect(recordSecEdgar8kSourceObservation({ runResult, unitOfWork: injectedUow })).rejects.toThrow("SYNTHETIC_POSTGRES_WRITE_FAILURE");
        expect(await observationTableCounts(sql), `rollback after ${failAt}`).toEqual(beforeFailure);
      }

      const before = await observationTableCounts(sql);
      const concurrent = await Promise.all([
        recordSecEdgar8kSourceObservation({ runResult, unitOfWork: uow }),
        recordSecEdgar8kSourceObservation({ runResult, unitOfWork: uow }),
      ]);
      expect(concurrent[0]).toEqual(concurrent[1]);
      const first = concurrent[0]!;
      expect(first).toMatchObject({ status: "OBSERVATION_RECORDED", authority: "NON_AUTHORITATIVE_SOURCE_OBSERVATION", lifecycleStatus: "COMPLETED", eventDate: null });
      const readModel = await readSecEdgar8kObservationReadModel(sql);
      expect(readModel).toMatchObject({ status: "OBSERVATIONS_AVAILABLE", observations: [{ requestId: first.requestId, attemptId: first.attemptId, sourceObservationId: first.sourceObservationId, lifecycleStatus: "COMPLETED", cik: { value: "0000789019" }, accession: { value: "0001193125-23-255762" }, form: { value: "8-K" }, filingDate: { value: "2023-10-13" }, acceptanceDateTime: { value: accepted }, authority: "NON_AUTHORITATIVE_SOURCE_OBSERVATION", eventDate: { status: "UNKNOWN", value: null }, primaryDocumentContent: "NOT_RETRIEVED" }] });
      expect(readModel.observations[0]!.retrievedAt.value).toBe(runResult.evidence.retrievedAt);
      const afterFirst = await observationTableCounts(sql);
      expect(afterFirst).toEqual({ ...before, intelligence_ingestion_requests: before.intelligence_ingestion_requests + 1, intelligence_ingestion_attempts: before.intelligence_ingestion_attempts + 1, intelligence_ingestion_events: before.intelligence_ingestion_events + 3, intelligence_source_artifacts: before.intelligence_source_artifacts + 1, intelligence_source_envelopes: before.intelligence_source_envelopes + 1, intelligence_ingestion_source_observations: before.intelligence_ingestion_source_observations + 1 });

      const lifecycle = await sql`select sequence,event_type from public.intelligence_ingestion_events where ingestion_attempt_id=${first.attemptId} order by sequence`;
      expect(lifecycle.map(row => [Number(row.sequence), row.event_type])).toEqual([[1, "STARTED"], [2, "SOURCE_OBSERVED"], [3, "COMPLETED"]]);
      const rows = await sql`select r.provider_id,r.dataset_id,r.dataset_version,e.normalized_envelope,o.metadata from public.intelligence_ingestion_requests r join public.intelligence_ingestion_attempts a using(ingestion_request_id) join public.intelligence_source_artifacts ar using(provider_id,dataset_id,dataset_version) join public.intelligence_source_envelopes e using(source_artifact_id) join public.intelligence_ingestion_source_observations o using(source_artifact_id) where a.ingestion_attempt_id=${first.attemptId}`;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ provider_id: "SEC_EDGAR", dataset_id: "FILING_METADATA", dataset_version: "sec-edgar-8k-metadata/v1" });
      expect((rows[0]!.normalized_envelope as Record<string, unknown>).identity).toMatchObject({ filingDate: { value: "2023-10-13" }, acceptanceDateTime: { value: accepted }, eventDate: { value: null, sources: [] }, primaryDocument: { contentRetrieved: false } });
      expect(JSON.stringify(rows[0])).not.toMatch(/Current Report|<html/i);
      expect(rows[0]!.metadata).toEqual({ pageOrdinal: 0, cursorSafety: "NONE", responseHostPath: "https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/0001193125-23-255762-index.htm" });
      const claims = await sql`select count(*)::int as count from public.intelligence_source_availability_claims where source_artifact_id=${first.sourceArtifactId}`;
      expect(claims[0]?.count).toBe(0);
      let constraintFailure: { code?: string } | undefined;
      try {
        await sql`insert into public.intelligence_ingestion_events(lifecycle_event_id,ingestion_attempt_id,contract_version,sequence,event_type,payload,event_fingerprint,recorded_at,source_observation_id) values (${"invalid-source-observed-" + first.attemptId},${first.attemptId},'m5-ingestion-event/v1',4,'SOURCE_OBSERVED','{}'::jsonb,${"a".repeat(64)},now(),null)`;
      } catch (error) { constraintFailure = error as { code?: string }; }
      expect(constraintFailure?.code).toBe("23514");

      const plan = buildSecEdgar8kObservationPlan(runResult);
      const alternateSchemaEnvelope = createSourceEnvelope({ sourceArtifactId: plan.artifact.sourceArtifactId, parserContractVersion: plan.request.parserContractVersion, envelopeSchemaVersion: "sec-edgar-8k-test-alternate/v1", normalizedEnvelope: plan.envelope.normalizedEnvelope, selectedAuditableFields: plan.envelope.selectedAuditableFields, payloadFingerprint: plan.envelope.payloadFingerprint, observedAt: plan.envelope.observedAt, temporalQualityStatus: plan.envelope.temporalQualityStatus, temporalDiagnosticCodes: plan.envelope.temporalDiagnosticCodes, recordedAt: plan.envelope.recordedAt });
      await actualUow.withTransaction(repositories => repositories.envelopes.save(alternateSchemaEnvelope));
      const withSeparateSchema = await readSecEdgar8kObservationReadModel(sql);
      expect(withSeparateSchema).toMatchObject({ status: "OBSERVATIONS_AVAILABLE", observations: [{ sourceObservationId: first.sourceObservationId, filingDate: { value: "2023-10-13" } }] });

      await sql`insert into public.intelligence_source_envelopes(source_envelope_id,contract_version,source_artifact_id,parser_contract_version,envelope_schema_version,normalized_envelope,selected_auditable_fields,payload_fingerprint,source_envelope_fingerprint,provider_published_at,observed_at,temporal_quality_status,temporal_diagnostic_codes,recorded_at) select ${"synthetic-ambiguous-envelope:" + first.attemptId},contract_version,source_artifact_id,parser_contract_version,envelope_schema_version,normalized_envelope,selected_auditable_fields,payload_fingerprint,${"f".repeat(64)},provider_published_at,observed_at,temporal_quality_status,temporal_diagnostic_codes,recorded_at from public.intelligence_source_envelopes where source_artifact_id=${first.sourceArtifactId} and parser_contract_version=(select parser_contract_version from public.intelligence_ingestion_requests where ingestion_request_id=${first.requestId}) and envelope_schema_version=(select envelope_schema_version from public.intelligence_ingestion_requests where ingestion_request_id=${first.requestId})`;
      const ambiguous = await readSecEdgar8kObservationReadModel(sql);
      expect(ambiguous).toMatchObject({ status: "INGESTION_INCOMPLETE", observations: [], incomplete: [{ requestId: first.requestId, lifecycleStatus: "COMPLETED" }] });

      expect(await recordSecEdgar8kSourceObservation({ runResult, unitOfWork: uow })).toEqual(first);
      expect(await observationTableCounts(sql)).toEqual({ ...afterFirst, intelligence_source_envelopes: afterFirst.intelligence_source_envelopes + 2 });

    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 30000);
});

describe("SEC EDGAR bounded local smoke transport", () => {
  beforeEach(() => { mocks.request.mockReset(); mocks.requestTimes.splice(0); mocks.authenticPlan.mockReturnValue(true); mocks.currentlyQualified.mockReturnValue(true); mocks.authorizations.splice(0, mocks.authorizations.length, { ...scope }); });

  it("requests only the two pinned profiles and returns sanitized observations, not response bodies", async () => {
    installResponse();
    const result = await executeSecEdgar8kLocalSmoke({ plans, operatorContact: contact });
    expect(result.status).toBe("COMPLETED");
    if (result.status !== "COMPLETED") return;
    expect(result.observations.map(({ profileId, statusCode, contentType }) => ({ profileId, statusCode, contentType }))).toEqual([
      { profileId: "COMPANY_SUBMISSIONS_JSON", statusCode: 200, contentType: "application/json" },
      { profileId: "FILING_INDEX", statusCode: 200, contentType: "text/html" },
    ]);
    expect("body" in result.observations[0]!).toBe(false);
    expect(result.observations.every((observation) => observation.byteLength > 0 && /^[0-9a-f]{64}$/.test(observation.sha256))).toBe(true);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.requestTimes[1]! - mocks.requestTimes[0]!).toBeGreaterThanOrEqual(1000);
    expect(mocks.request.mock.calls[0]![0]).toMatchObject({ hostname: "data.sec.gov", method: "GET", path: "/submissions/CIK0000789019.json", rejectUnauthorized: true, minVersion: "TLSv1.2", headers: { "Accept-Encoding": "identity", "User-Agent": `MoneyMachine/1.0 (${contact})` } });
  });

  it("fails closed without a pinned permit or recognizable operator contact before any socket call", async () => {
    mocks.authorizations.splice(0);
    expect(await executeSecEdgar8kLocalSmoke({ plans, operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_AUTHORIZATION_REQUIRED" });
    expect(await executeSecEdgar8kLocalSmoke({ plans, operatorContact: "Money Machine" })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_OPERATOR_CONTACT_REQUIRED" });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("binds the request plan to the permit identity reference", async () => {
    freshPermit();
    const mismatched = { ...plans[0]!, userAgentIdentityRef: "approved-identity:other" };
    expect(await executeSecEdgar8kLocalSmoke({ plans: [mismatched, plans[1]], operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_AUTHORIZATION_REQUIRED" });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("honors an exact staged permit reference instead of substituting another permit", async () => {
    freshPermit();
    expect(await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact, authorizationId: "different-permit-id" })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_AUTHORIZATION_REQUIRED" });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects a permit whose qualification reference differs from the authentic plan before network", async () => {
    freshPermit();
    (mocks.authorizations[0] as Record<string, unknown>).qualificationReference = `sec-edgar-8k-local-smoke-qualification:${"b".repeat(64)}`;
    expect(await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_AUTHORIZATION_REQUIRED" });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("consumes an operational permit for one run so repeated calls cannot reset its budget", async () => {
    installResponse();
    expect((await executeSecEdgar8kLocalSmoke({ plans, operatorContact: contact })).status).toBe("COMPLETED");
    expect(await executeSecEdgar8kLocalSmoke({ plans, operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_AUTHORIZATION_ALREADY_USED" });
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it("rechecks runtime-pinned qualification before the first network call", async () => {
    mocks.currentlyQualified.mockReturnValue(false);
    expect(await executeSecEdgar8kLocalSmoke({ plans, operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_SOURCE_NOT_CURRENTLY_QUALIFIED" });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects an already-aborted run before opening a socket", async () => {
    installResponse();
    const controller = new AbortController();
    controller.abort();
    expect(await executeSecEdgar8kLocalSmoke({ plans, operatorContact: contact, signal: controller.signal })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_ABORTED" });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("cleans up an in-flight request when its caller aborts", async () => {
    const controller = new AbortController();
    let requestRef: EventEmitter & { end: () => void; destroy: () => void } | undefined;
    mocks.request.mockImplementation(() => {
      const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
      request.destroy = vi.fn(() => queueMicrotask(() => request.emit("error", Object.assign(new Error("aborted"), { code: "ECONNRESET" }))));
      request.end = () => { requestRef = request; };
      return request;
    });
    const pending = executeSecEdgar8kLocalSmoke({ plans, operatorContact: contact, signal: controller.signal });
    await vi.waitFor(() => expect(requestRef).toBeDefined(), { timeout: 5000, interval: 25 });
    controller.abort();
    expect(await pending).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_ABORTED" });
    expect(requestRef?.destroy).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("orchestrates request-plan to metadata evidence but cannot cross the empty operational authorization gate", async () => {
    mocks.authorizations.splice(0);
    expect(await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_AUTHORIZATION_REQUIRED" });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects altered endpoints, unsupported plans and more than three requests without fallback", async () => {
    const altered = { ...plans[0]!, url: "https://data.sec.gov/submissions/CIK0000789019.json?next=https://evil.invalid" };
    expect(await executeSecEdgar8kLocalSmoke({ plans: [altered, plans[1]], operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_REQUEST_PLAN_INVALID" });
    expect(await executeSecEdgar8kLocalSmoke({ plans: [plans[0], plans[1], plans[0], plans[1]], operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_RUN_LIMIT_EXCEEDED" });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("does not retry a rate-limited response", async () => {
    installResponse({ status: 429 });
    const result = await executeSecEdgar8kLocalSmoke({ plans, operatorContact: contact });
    expect(result).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_HTTP_STATUS_REJECTED" });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("times out without retries and without exposing native errors", async () => {
    mocks.request.mockImplementation(() => {
      const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
      request.destroy = vi.fn();
      request.end = () => queueMicrotask(() => request.emit("timeout"));
      return request;
    });
    const result = await executeSecEdgar8kLocalSmoke({ plans, operatorContact: contact });
    expect(result).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_TIMEOUT" });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["outside-host redirect", { status: 302, location: "https://example.invalid/collect" }, "SEC_SMOKE_REDIRECT_REJECTED"],
    ["same-host path redirect", { status: 302, location: "/unapproved" }, "SEC_SMOKE_REDIRECT_REJECTED"],
    ["429 response", { status: 429 }, "SEC_SMOKE_HTTP_STATUS_REJECTED"],
    ["unexpected content type", { contentType: "text/html" }, "SEC_SMOKE_CONTENT_TYPE_REJECTED"],
    ["unsupported character set", { contentType: "application/json; charset=iso-8859-1" }, "SEC_SMOKE_CONTENT_TYPE_REJECTED"],
    ["compressed response", { contentEncoding: "gzip" }, "SEC_SMOKE_CONTENT_TYPE_REJECTED"],
    ["declared oversized response", { contentLength: "2049" }, "SEC_SMOKE_RESPONSE_TOO_LARGE"],
    ["malformed content length", { contentLength: ["1", "2"] }, "SEC_SMOKE_RESPONSE_TOO_LARGE"],
    ["streamed oversized response", { body: "x".repeat(2049) }, "SEC_SMOKE_RESPONSE_TOO_LARGE"],
  ] as const)("applies bounded transport handling to %s", async (_name, responseOptions, expected) => {
    installResponse(responseOptions as Parameters<typeof fakeResponse>[0]);
    const result = await executeSecEdgar8kLocalSmoke({ plans, operatorContact: contact });
    if (expected) expect(result).toEqual({ status: "BLOCKED", code: expected });
    else expect(result.status).toBe("COMPLETED");
    expect(mocks.request).toHaveBeenCalledTimes(expected ? 1 : 2);
  });

  it("exposes a no-network fixed request proposal without stale runtime blocker claims", () => {
    expect(SEC_EDGAR_8K_LOCAL_SMOKE_DRY_RUN.networkRequests).toBe(0);
    expect(SEC_EDGAR_8K_LOCAL_SMOKE_DRY_RUN.requests.map((request) => request.profileId)).toEqual(["COMPANY_SUBMISSIONS_JSON", "FILING_INDEX"]);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("reconciles authentic SEC submissions JSON and filing-index HTML without exposing response bodies", async () => {
    installBodySequence([JSON.stringify(recentSubmission()), filingIndex()]);
    const exchange = await acquireSecEdgar8kLocalSmokeExchange({ plans, operatorContact: contact });
    expect(exchange.status).toBe("COMPLETED");
    if (exchange.status !== "COMPLETED") return;
    const result = adaptSecEdgar8kTransportExchange(exchange, "2026-10-06T12:00:00.000Z");
    expect(result.status).toBe("VERIFIED");
    if (result.status !== "VERIFIED") return;
    expect(result.evidence).toMatchObject({
      status: "RECONCILED_METADATA_ONLY", authority: "NON_AUTHORITATIVE_SOURCE_METADATA",
      identity: { cik: "0000789019", accession: "0001193125-23-255762", form: "8-K" },
      filingDate: "2023-10-13", acceptanceDateTime: accepted, eventDate: null,
      primaryDocument: { filename: "d537928d8k.htm", contentRetrieved: false },
    });
    expect(result.evidence.evidence.primaryDocument.sources).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("Item 2.01");
    expect(JSON.stringify(exchange)).not.toContain("MICROSOFT CORP");
    expect(Object.isFrozen(result.evidence.evidence.primaryDocument.sources)).toBe(true);
    expect(adaptSecEdgar8kTransportExchange(exchange, "2026-10-06T12:00:01.000Z")).toEqual({ status: "BLOCKED", code: "SEC_RESPONSE_EXCHANGE_UNAUTHENTIC" });
  });

  it("explicitly requests one referenced history file when the target is absent from recent", async () => {
    const current = recentSubmission();
    const filings = current.filings as Record<string, unknown>;
    const recent = filings.recent as Record<string, string[]>;
    for (const value of Object.values(recent)) value.splice(0, value.length);
    installBodySequence([JSON.stringify(current), filingIndex()]);
    const exchange = await acquireSecEdgar8kLocalSmokeExchange({ plans, operatorContact: contact });
    expect(exchange.status).toBe("COMPLETED");
    if (exchange.status !== "COMPLETED") return;
    expect(adaptSecEdgar8kTransportExchange(exchange, "2026-10-06T12:00:00.000Z")).toEqual({
      status: "BLOCKED", code: "SEC_HISTORY_FILE_REQUIRED",
      historyRequest: { filename: "CIK0000789019-submissions-001.json", url: "https://data.sec.gov/submissions/CIK0000789019-submissions-001.json" },
    });
  });

  it("blocks a preassembled history request before networking because manifest preflight has not run", async () => {
    expect(await acquireSecEdgar8kLocalSmokeExchange({ plans: [plans[0], historyPlan, plans[1]], operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_HISTORY_PREFLIGHT_REQUIRED" });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("runs the recent-manifest branch in order under a single authorization", async () => {
    installBodySequence([JSON.stringify(recentSubmission()), filingIndex()]);
    const result = await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact });
    expect(result.status).toBe("VERIFIED");
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.request.mock.calls.map((call) => (call[0] as RequestOptions).path)).toEqual([
      "/submissions/CIK0000789019.json",
      "/Archives/edgar/data/789019/000119312523255762/0001193125-23-255762-index.htm",
    ]);
  }, 15000);

  it("uses filing-index acceptance time only when submissions omits the optional field", async () => {
    const current = recentSubmission();
    delete (current.filings.recent as Record<string, unknown>).acceptanceDateTime;
    installBodySequence([JSON.stringify(current), filingIndex()]);
    const result = await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact });
    expect(result.status).toBe("VERIFIED");
    if (result.status === "VERIFIED") {
      expect(result.evidence.acceptanceDateTime).toBe(accepted);
      expect(result.evidence.evidence.acceptanceDateTime.sources).toEqual(["https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/0001193125-23-255762-index.htm#Accepted"]);
    }
    expect(mocks.request).toHaveBeenCalledTimes(2);
  }, 15000);

  it("reports invalid optional timestamp types and unequal parallel arrays without echoing response values", async () => {
    installResponse({ status: 503, body: "PRIVATE_HTTP_BODY_MARKER" });
    const httpResult = await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact });
    expect(httpResult).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_HTTP_STATUS_REJECTED", diagnostic: { stage: "TRANSPORT", reason: "HTTP_STATUS_REJECTED" } });
    expect(JSON.stringify(httpResult)).not.toContain("PRIVATE_HTTP_BODY_MARKER");
    expect(JSON.stringify(httpResult)).not.toContain(contact);

    mocks.request.mockReset();
    freshPermit();
    installResponse({ contentType: "text/html", body: "PRIVATE_CONTENT_TYPE_BODY_MARKER" });
    const contentTypeResult = await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact });
    expect(contentTypeResult).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_CONTENT_TYPE_REJECTED", diagnostic: { stage: "TRANSPORT", reason: "CONTENT_TYPE_REJECTED" } });
    expect(JSON.stringify(contentTypeResult)).not.toContain("PRIVATE_CONTENT_TYPE_BODY_MARKER");
    expect(JSON.stringify(contentTypeResult)).not.toContain(contact);

    mocks.request.mockReset();
    freshPermit();
    installBodySequence(["PRIVATE_JSON_BODY_MARKER"]);
    const jsonResult = await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact });
    expect(jsonResult).toEqual({ status: "BLOCKED", code: "SEC_RESPONSE_BODY_INVALID", diagnostic: { stage: "JSON", reason: "INVALID_JSON" } });
    expect(JSON.stringify(jsonResult)).not.toContain("PRIVATE_JSON_BODY_MARKER");
    expect(JSON.stringify(jsonResult)).not.toContain(contact);

    mocks.request.mockReset();
    freshPermit();
    installBodySequence([Buffer.from([0xff, 0xfe])]);
    const utf8Result = await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact });
    expect(utf8Result).toEqual({ status: "BLOCKED", code: "SEC_RESPONSE_BODY_INVALID", diagnostic: { stage: "JSON", reason: "INVALID_UTF8" } });
    expect(JSON.stringify(utf8Result)).not.toContain(contact);
    expect("bytes" in utf8Result).toBe(false);

    mocks.request.mockReset();
    freshPermit();
    const invalid = recentSubmission();
    (invalid.filings.recent as Record<string, unknown>).acceptanceDateTime = ["PRIVATE_RESPONSE_VALUE"];
    installBodySequence([JSON.stringify(invalid)]);
    const invalidResult = await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact });
    expect(invalidResult).toEqual({ status: "BLOCKED", code: "SEC_SUBMISSIONS_SCHEMA_INVALID", diagnostic: { stage: "SUBMISSIONS", reason: "ROW_INVALID", field: "filings.recent.acceptanceDateTime" } });
    expect(JSON.stringify(invalidResult)).not.toContain("PRIVATE_RESPONSE_VALUE");
    expect(JSON.stringify(invalidResult)).not.toContain(contact);

    mocks.request.mockReset();
    freshPermit();
    const invalidType = recentSubmission();
    (invalidType.filings.recent as Record<string, unknown>).acceptanceDateTime = 12;
    installBodySequence([JSON.stringify(invalidType)]);
    const invalidTypeResult = await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact });
    expect(invalidTypeResult).toEqual({ status: "BLOCKED", code: "SEC_SUBMISSIONS_SCHEMA_INVALID", diagnostic: { stage: "SUBMISSIONS", reason: "FIELD_INVALID", field: "filings.recent.acceptanceDateTime" } });
    expect(JSON.stringify(invalidTypeResult)).not.toContain(contact);

    mocks.request.mockReset();
    freshPermit();
    const unequal = recentSubmission();
    (unequal.filings.recent as Record<string, unknown>).acceptanceDateTime = [];
    installBodySequence([JSON.stringify(unequal)]);
    const unequalResult = await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact });
    expect(unequalResult).toEqual({ status: "BLOCKED", code: "SEC_SUBMISSIONS_PARALLEL_ARRAYS_MISMATCH", diagnostic: { stage: "SUBMISSIONS", reason: "PARALLEL_ARRAY_LENGTH_MISMATCH", field: "filings.recent" } });
    expect(JSON.stringify(unequalResult)).not.toContain(contact);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  }, 20000);

  it("distinguishes missing arrays, wrong field types, and invalid array elements", async () => {
    const missing = recentSubmission();
    delete ((missing.filings as Record<string, unknown>).recent as Record<string, unknown>).accessionNumber;
    installBodySequence([JSON.stringify(missing)]);
    expect(await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_SUBMISSIONS_SCHEMA_INVALID", diagnostic: { stage: "SUBMISSIONS", reason: "FIELD_MISSING", field: "filings.recent.accessionNumber" } });

    mocks.request.mockReset();
    freshPermit();
    const wrongType = recentSubmission();
    (wrongType.filings.recent as Record<string, unknown>).accessionNumber = 12;
    installBodySequence([JSON.stringify(wrongType)]);
    expect(await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_SUBMISSIONS_SCHEMA_INVALID", diagnostic: { stage: "SUBMISSIONS", reason: "FIELD_INVALID", field: "filings.recent.accessionNumber" } });

    mocks.request.mockReset();
    freshPermit();
    const invalidElement = recentSubmission();
    (invalidElement.filings.recent as Record<string, unknown>).accessionNumber = [null];
    installBodySequence([JSON.stringify(invalidElement)]);
    const result = await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact });
    expect(result).toEqual({ status: "BLOCKED", code: "SEC_SUBMISSIONS_SCHEMA_INVALID", diagnostic: { stage: "SUBMISSIONS", reason: "ARRAY_ELEMENT_INVALID", field: "filings.recent.accessionNumber" } });
    expect(JSON.stringify(result)).not.toContain("null");
    expect(JSON.stringify(result)).not.toContain(contact);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  }, 20000);

  it("validates recent-list structure but applies target filing identity only to the selected accession", async () => {
    const current = recentSubmission();
    const recent = current.filings.recent as Record<string, unknown[]>;
    const otherRow: Record<string, string> = {
      accessionNumber: "0000320193-23-106611", form: "10-K", filingDate: "2023-10-02", reportDate: "2023-09-30",
      acceptanceDateTime: "2023-10-02T12:00:00.000Z", primaryDocument: "annual-report.htm", primaryDocDescription: "Annual report",
    };
    for (const [key, values] of Object.entries(recent)) values.unshift(otherRow[key]!);
    installBodySequence([JSON.stringify(current), filingIndex()]);
    const result = await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact });
    expect(result.status).toBe("VERIFIED");
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain(contact);
  }, 15000);

  it("accepts the bounded recent-array limit and gives a distinct size diagnostic above it", async () => {
    const maxRecentRows = 40_000;
    const boundedPlan = { ...plans[0]!, maxResponseBytes: 2 * 1024 * 1024 };
    const atLimit = recentSubmissionWithRows(maxRecentRows);
    const atLimitBody = JSON.stringify(atLimit);
    expect(Buffer.byteLength(atLimitBody)).toBeLessThanOrEqual(boundedPlan.maxResponseBytes);
    installBodySequence([atLimitBody, filingIndex()]);
    const acceptedResult = await runSecEdgar8kLocalSmoke({ initialPlan: boundedPlan, operatorContact: contact });
    expect(acceptedResult.status).toBe("VERIFIED");
    expect(mocks.request).toHaveBeenCalledTimes(2);

    mocks.request.mockReset();
    freshPermit();
    const overLimit = recentSubmissionWithRows(maxRecentRows + 1);
    installBodySequence([JSON.stringify(overLimit)]);
    const rejectedResult = await runSecEdgar8kLocalSmoke({ initialPlan: boundedPlan, operatorContact: contact });
    expect(rejectedResult).toEqual({ status: "BLOCKED", code: "SEC_SUBMISSIONS_SCHEMA_INVALID", diagnostic: { stage: "SUBMISSIONS", reason: "ARRAY_LIMIT_EXCEEDED", field: "filings.recent.accessionNumber" } });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(rejectedResult)).not.toContain(contact);
  }, 30_000);

  it("rejects conflicting available acceptance timestamps rather than choosing a source", async () => {
    const current = recentSubmission();
    installBodySequence([JSON.stringify(current), filingIndex({ accepted: "2023-10-13 08:37:33" })]);
    const result = await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact });
    expect(result).toEqual({ status: "BLOCKED", code: "SEC_FILING_IDENTITY_MISMATCH" });
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain(contact);
  }, 15000);

  it("binds the observation plan to the exact runner result and records SOURCE_OBSERVED atomically without claims", async () => {
    const runResult = await verifiedSyntheticRunnerResult();
    expect(runResult.status).toBe("VERIFIED");
    expect(isAuthenticSecEdgar8kLocalSmokeResult(runResult)).toBe(true);
    if (runResult.status !== "VERIFIED") return;
    expect(Object.isFrozen(runResult)).toBe(true);
    expect(Object.isFrozen(runResult.evidence)).toBe(true);
    expect(Object.isFrozen(runResult.evidence.evidence)).toBe(true);
    expect(Object.isFrozen(runResult.evidence.evidence.filingDate.sources)).toBe(true);
    expect(Reflect.set(runResult.evidence.evidence.filingDate, "value", "1900-01-01")).toBe(false);
    expect(runResult.evidence.evidence.filingDate.value).toBe("2023-10-13");
    expect(() => buildSecEdgar8kObservationPlan({ ...runResult })).toThrow("SEC_8K_RUN_RESULT_UNAUTHENTIC");
    const plan = buildSecEdgar8kObservationPlan(runResult);
    expect(buildSecEdgar8kObservationPlan(runResult).request.idempotencyKey).toBe(plan.request.idempotencyKey);
    expect(plan.request.idempotencyKey).toContain(plan.artifact.payloadFingerprint);
    expect(plan.events.map(event => event.eventType)).toEqual(["STARTED", "SOURCE_OBSERVED", "COMPLETED"]);
    expect(plan.envelope.normalizedEnvelope).toMatchObject({
      evidenceKind: "TRANSPORT_RECONCILED_SEC_METADATA",
      identity: { filingDate: { value: "2023-10-13" }, eventDate: { value: null }, primaryDocument: { contentRetrieved: false } },
    });
    expect(JSON.stringify(plan.envelope.normalizedEnvelope)).toContain("#Filing-Date");
    expect(JSON.stringify(plan)).not.toContain("Current Report");

    const uow = memoryObservationUnitOfWork();
    const first = await recordSecEdgar8kSourceObservation({ runResult, unitOfWork: uow.unitOfWork as never });
    const second = await recordSecEdgar8kSourceObservation({ runResult, unitOfWork: uow.unitOfWork as never });
    expect(first).toEqual(second);
    expect(first).toMatchObject({ status: "OBSERVATION_RECORDED", authority: "NON_AUTHORITATIVE_SOURCE_OBSERVATION", lifecycleStatus: "COMPLETED", eventDate: null });
    expect(uow.counts()).toEqual({ requests: 1, attempts: 1, events: 3, artifacts: 1, envelopes: 1, observations: 1 });
    expect(uow.availabilityClaimsSave).not.toHaveBeenCalled();
    expect(plan.envelope.normalizedEnvelope.identity).toMatchObject({
      cik: { value: "0000789019", sources: expect.arrayContaining([expect.stringContaining("#/cik")]) },
      accession: { value: "0001193125-23-255762", sources: expect.arrayContaining([expect.stringContaining("accessionNumber")]) },
      filingDate: { value: "2023-10-13", sources: expect.arrayContaining([expect.stringContaining("filingDate")]) },
      eventDate: { value: null, sources: [] },
    });
  }, 15000);

  it("rolls back every observation write stage when that stage fails", async () => {
    const runResult = await verifiedSyntheticRunnerResult();
    expect(runResult.status).toBe("VERIFIED");
    if (runResult.status !== "VERIFIED") return;
    for (const failWrite of ["requests:save", "attempts:save", "events:STARTED", "artifacts:save", "envelopes:save", "observations:save", "events:SOURCE_OBSERVED", "events:COMPLETED"]) {
      const uow = memoryObservationUnitOfWork(failWrite);
      await expect(recordSecEdgar8kSourceObservation({ runResult, unitOfWork: uow.unitOfWork as never })).rejects.toThrow("SYNTHETIC_TRANSACTION_FAILURE");
      expect(uow.counts()).toEqual({ requests: 0, attempts: 0, events: 0, artifacts: 0, envelopes: 0, observations: 0 });
    }
  }, 15000);

  it("selects and validates one manifest history file before requesting the filing index", async () => {
    const current = recentSubmission();
    const recent = (current.filings as Record<string, unknown>).recent as Record<string, string[]>;
    for (const values of Object.values(recent)) values.splice(0, values.length);
    const history = { cik: "789019", accessionNumber: ["0001193125-23-255762"], form: ["8-K"], filingDate: ["2023-10-13"], acceptanceDateTime: [accepted], primaryDocument: ["d537928d8k.htm"] };
    installBodySequence([JSON.stringify(current), JSON.stringify(history), filingIndex()]);
    const result = await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact });
    expect(result.status).toBe("VERIFIED");
    expect(mocks.request).toHaveBeenCalledTimes(3);
    expect(mocks.request.mock.calls.map((call) => (call[0] as RequestOptions).path)).toEqual([
      "/submissions/CIK0000789019.json", "/submissions/CIK0000789019-submissions-001.json",
      "/Archives/edgar/data/789019/000119312523255762/0001193125-23-255762-index.htm",
    ]);
  }, 20000);

  it("stops before index on ambiguous/missing history and invalid history identity", async () => {
    const current = recentSubmission();
    const filings = current.filings as Record<string, unknown>;
    const recent = filings.recent as Record<string, string[]>;
    for (const values of Object.values(recent)) values.splice(0, values.length);
    (filings.files as Record<string, unknown>[]).push({ name: "CIK0000789019-submissions-002.json", filingCount: 2, filingFrom: "2023-10-12", filingTo: "2023-10-14" });
    installBodySequence([JSON.stringify(current)]);
    expect(await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_HISTORY_FILE_AMBIGUOUS" });
    expect(mocks.request).toHaveBeenCalledTimes(1);

    mocks.request.mockReset();
    freshPermit();
    const noAccession = { cik: "789019", accessionNumber: ["0001193125-23-255761"], form: ["8-K"], filingDate: ["2023-10-13"], acceptanceDateTime: [accepted], primaryDocument: ["d537928d8k.htm"] };
    installBodySequence([JSON.stringify(recentSubmission().filings ? (() => { const c = recentSubmission(); for (const a of Object.values((c.filings as Record<string, unknown>).recent as Record<string,string[]>)) a.splice(0,a.length); return c; })() : {}), JSON.stringify(noAccession)]);
    const missing = await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact });
    expect(missing).toEqual({ status: "BLOCKED", code: "SEC_TARGET_ACCESSION_NOT_FOUND" });
    expect(mocks.request).toHaveBeenCalledTimes(2);
  }, 20000);

  it("revalidates authorization between stages and leaves concurrent runs isolated", async () => {
    const current = recentSubmission();
    for (const values of Object.values((current.filings as Record<string, unknown>).recent as Record<string, string[]>)) values.splice(0, values.length);
    const history = { cik: "789019", accessionNumber: ["0001193125-23-255762"], form: ["8-K"], filingDate: ["2023-10-13"], acceptanceDateTime: [accepted], primaryDocument: ["d537928d8k.htm"] };
    installBodySequence([JSON.stringify(current), JSON.stringify(history), filingIndex()]);
    const permit = mocks.authorizations[0]!;
    const originalEnd = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation((options: RequestOptions, callback: (response: IncomingMessage) => void) => {
      const request = originalEnd(options, callback);
      if (mocks.request.mock.calls.length === 1) (permit as Record<string, unknown>).expiresAt = "2020-01-01T00:00:00.000Z";
      return request;
    });
    const expired = await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact });
    expect(expired).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_AUTHORIZATION_REQUIRED" });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  }, 15000);

  it("rejects invalid manifest paths and conflicting history identity before filing-index retrieval", async () => {
    const current = recentSubmission();
    for (const values of Object.values((current.filings as Record<string, unknown>).recent as Record<string, string[]>)) values.splice(0, values.length);
    (current.filings as Record<string, unknown>).files = [{ name: "CIK0000789019-submissions-../1.json", filingCount: 1, filingFrom: "2023-10-13", filingTo: "2023-10-13" }];
    installBodySequence([JSON.stringify(current)]);
    expect(await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_SUBMISSIONS_SCHEMA_INVALID", diagnostic: { stage: "HISTORY_MANIFEST", reason: "FIELD_INVALID", field: "filings.files[].name" } });
    expect(mocks.request).toHaveBeenCalledTimes(1);

    mocks.request.mockReset();
    freshPermit();
    const validCurrent = recentSubmission();
    for (const values of Object.values((validCurrent.filings as Record<string, unknown>).recent as Record<string, string[]>)) values.splice(0, values.length);
    const conflict = { cik: "789019", accessionNumber: ["0001193125-23-255762"], form: ["8-K"], filingDate: ["2023-10-14"], acceptanceDateTime: [accepted], primaryDocument: ["d537928d8k.htm"] };
    installBodySequence([JSON.stringify(validCurrent), JSON.stringify(conflict)]);
    expect(await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_FILING_IDENTITY_MISMATCH" });
    expect(mocks.request).toHaveBeenCalledTimes(2);
  }, 20000);

  it("aborts between manifest and history stages and keeps separate concurrent permits isolated", async () => {
    const controller = new AbortController();
    const current = recentSubmission();
    for (const values of Object.values((current.filings as Record<string, unknown>).recent as Record<string, string[]>)) values.splice(0, values.length);
    const history = { cik: "789019", accessionNumber: ["0001193125-23-255762"], form: ["8-K"], filingDate: ["2023-10-13"], acceptanceDateTime: [accepted], primaryDocument: ["d537928d8k.htm"] };
    let sequence = 0;
    mocks.request.mockImplementation((_options: RequestOptions, callback: (response: IncomingMessage) => void) => {
      const body = sequence++ === 0 ? JSON.stringify(current) : JSON.stringify(history);
      const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
      request.destroy = vi.fn();
      request.end = () => {
        const { response } = fakeResponse({ body });
        callback(response);
        queueMicrotask(() => { response.emit("data", Buffer.from(body)); response.emit("end"); if (sequence === 1) controller.abort(); });
      };
      return request;
    });
    expect(await runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact, signal: controller.signal })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_ABORTED" });
    expect(mocks.request).toHaveBeenCalledTimes(1);

    mocks.request.mockReset();
    freshPermit();
    mocks.authorizations.push({ ...scope });
    const currentA = recentSubmission();
    const currentB = recentSubmission({ cik: "789019", name: "SECOND SYNTHETIC RUN" });
    const bodyQueue = [JSON.stringify(currentA), JSON.stringify(currentB), filingIndex(), filingIndex()];
    installBodySequence(bodyQueue);
    const [a, b] = await Promise.all([
      runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact }),
      runSecEdgar8kLocalSmoke({ initialPlan: plans[0], operatorContact: contact }),
    ]);
    expect(a.status).toBe("VERIFIED");
    expect(b.status).toBe("VERIFIED");
    expect(mocks.request).toHaveBeenCalledTimes(4);
    expect(mocks.requestTimes.every((time, index, all) => index === 0 || time - all[index - 1]! >= 1000)).toBe(true);
  }, 25000);

  it("rejects unequal parallel arrays, conflicting source identity, unsafe document paths and copied exchanges", async () => {
    const unequal = recentSubmission();
    (((unequal.filings as Record<string, unknown>).recent as Record<string, unknown>).reportDate as string[]).push("2023-10-13");
    installBodySequence([JSON.stringify(unequal), filingIndex()]);
    const first = await acquireSecEdgar8kLocalSmokeExchange({ plans, operatorContact: contact });
    expect(first.status).toBe("COMPLETED");
    if (first.status === "COMPLETED") expect(adaptSecEdgar8kTransportExchange(first, "2026-10-06T12:00:00.000Z")).toEqual({ status: "BLOCKED", code: "SEC_SUBMISSIONS_PARALLEL_ARRAYS_MISMATCH", diagnostic: { stage: "SUBMISSIONS", reason: "PARALLEL_ARRAY_LENGTH_MISMATCH", field: "filings.recent" } });

    installBodySequence([JSON.stringify(recentSubmission()), filingIndex({ accession: "0001193125-23-255763" })]);
    freshPermit();
    const conflict = await acquireSecEdgar8kLocalSmokeExchange({ plans, operatorContact: contact });
    expect(conflict.status).toBe("COMPLETED");
    if (conflict.status === "COMPLETED") expect(adaptSecEdgar8kTransportExchange(conflict, "2026-10-06T12:00:00.000Z")).toEqual({ status: "BLOCKED", code: "SEC_FILING_IDENTITY_MISMATCH" });
    expect(adaptSecEdgar8kTransportExchange({ ...conflict } as never, "2026-10-06T12:00:00.000Z")).toEqual({ status: "BLOCKED", code: "SEC_RESPONSE_EXCHANGE_UNAUTHENTIC" });

    installBodySequence([JSON.stringify(recentSubmission()), filingIndex({ href: "../d537928d8k.htm", label: "../d537928d8k.htm" })]);
    freshPermit();
    const unsafe = await acquireSecEdgar8kLocalSmokeExchange({ plans, operatorContact: contact });
    expect(unsafe.status).toBe("COMPLETED");
    if (unsafe.status === "COMPLETED") expect(adaptSecEdgar8kTransportExchange(unsafe, "2026-10-06T12:00:00.000Z")).toEqual({ status: "BLOCKED", code: "SEC_FILING_DOCUMENT_PATH_INVALID" });
  }, 20000);

  it("blocks ambiguous manifest ranges and caller-preassembled history requests", async () => {
    const current = recentSubmission();
    (current.filings.files as Record<string, unknown>[]).push({ name: "CIK0000789019-submissions-002.json", filingCount: 1, filingFrom: "2023-10-12", filingTo: "2023-10-14" });
    const recent = current.filings.recent as Record<string, string[]>;
    for (const value of Object.values(recent)) value.splice(0, value.length);
    installBodySequence([JSON.stringify(current), filingIndex()]);
    const exchange = await acquireSecEdgar8kLocalSmokeExchange({ plans, operatorContact: contact });
    expect(exchange.status).toBe("COMPLETED");
    if (exchange.status === "COMPLETED") expect(adaptSecEdgar8kTransportExchange(exchange, "2026-10-06T12:00:00.000Z")).toEqual({ status: "BLOCKED", code: "SEC_HISTORY_FILE_AMBIGUOUS" });
    mocks.request.mockReset();
    expect(await executeSecEdgar8kLocalSmoke({ plans: [plans[0], historyPlan, plans[1]], operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_HISTORY_PREFLIGHT_REQUIRED" });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("does not accept malformed content types or response bodies above the bounded transport limit", async () => {
    installBodySequence([JSON.stringify(recentSubmission()), filingIndex()], ["text/html"]);
    expect(await acquireSecEdgar8kLocalSmokeExchange({ plans, operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_CONTENT_TYPE_REJECTED" });
    installBodySequence([JSON.stringify(recentSubmission()), "x".repeat(2049)]);
    const smallPlans = plans.map((plan) => ({ ...plan, maxResponseBytes: 2048 }));
    freshPermit();
    expect(await acquireSecEdgar8kLocalSmokeExchange({ plans: smallPlans, operatorContact: contact })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_RESPONSE_TOO_LARGE" });
  }, 10000);
});
