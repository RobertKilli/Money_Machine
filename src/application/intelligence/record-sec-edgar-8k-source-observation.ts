import "server-only";

import {
  canonicalSha256,
  createIngestionAttempt,
  createIngestionRequest,
  createLifecycleEvent,
  createSourceArtifact,
  createSourceEnvelope,
  createSourceObservation,
  reduceIngestionLifecycle,
  type JsonObject,
  type LifecycleEvent,
  type SourceArtifact,
  type SourceEnvelope,
  type SourceObservation,
} from "@/domain/intelligence/ingestion-provenance";
import { SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE } from "@/domain/intelligence/sec-edgar-8k-local-smoke-scope";
import type { AsyncIngestionProvenanceRepositories, IngestionProvenanceUnitOfWork } from "@/application/intelligence/ingestion-provenance-persistence";
import { isAuthenticSecEdgar8kLocalSmokeResult, type SecEdgar8kLocalSmokeRunResult } from "@/infrastructure/intelligence/sec-edgar-8k-local-smoke-runner";

const PARSER_VERSION = "sec-edgar-8k-reconciled-metadata/v1";
const ENVELOPE_VERSION = "sec-edgar-8k-metadata-envelope/v1";
const SOURCE_URL = "https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/0001193125-23-255762-index.htm";

export type SecEdgar8kObservationPlan = Readonly<{
  request: ReturnType<typeof createIngestionRequest>;
  attempt: ReturnType<typeof createIngestionAttempt>;
  artifact: SourceArtifact;
  envelope: SourceEnvelope;
  observation: SourceObservation;
  events: readonly LifecycleEvent[];
}>;

export type SecEdgar8kObservationResult = Readonly<{
  status: "OBSERVATION_RECORDED";
  authority: "NON_AUTHORITATIVE_SOURCE_OBSERVATION";
  requestId: string;
  attemptId: string;
  sourceArtifactId: string;
  sourceEnvelopeId: string;
  sourceObservationId: string;
  lifecycleStatus: "COMPLETED";
  eventDate: null;
}>;

function metadataEnvelope(evidence: Extract<SecEdgar8kLocalSmokeRunResult, { status: "VERIFIED" }>["evidence"]): JsonObject {
  const field = (value: string | null, sources: readonly string[]) => ({ value, sources: [...sources] });
  return {
    evidenceKind: "TRANSPORT_RECONCILED_SEC_METADATA",
    evidenceContractVersion: evidence.contractVersion,
    identity: {
      cik: field(evidence.identity.cik, evidence.evidence.cik.sources),
      accession: field(evidence.identity.accession, evidence.evidence.accession.sources),
      form: field(evidence.identity.form, evidence.evidence.form.sources),
      filingDate: field(evidence.filingDate, evidence.evidence.filingDate.sources),
      acceptanceDateTime: field(evidence.acceptanceDateTime, evidence.evidence.acceptanceDateTime.sources),
      eventDate: field(null, []),
      primaryDocument: {
        filename: field(evidence.primaryDocument.filename, evidence.evidence.primaryDocument.sources),
        url: field(evidence.primaryDocument.url, evidence.evidence.primaryDocument.sources),
        contentRetrieved: false,
      },
    },
    temporalMeaning: "FILING_DATE_IS_NOT_EVENT_DATE",
    retrievedAt: evidence.retrievedAt,
  } as JsonObject;
}

/** Build only from the exact verified runner result; caller document bytes are not accepted here. */
export function buildSecEdgar8kObservationPlan(runResult: unknown): SecEdgar8kObservationPlan {
  if (!isAuthenticSecEdgar8kLocalSmokeResult(runResult)) throw new Error("SEC_8K_RUN_RESULT_UNAUTHENTIC");
  const evidence = runResult.evidence;
  const scope = SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE;
  if (evidence.identity.cik !== scope.cik || evidence.identity.accession !== scope.accession || evidence.identity.form !== scope.form || evidence.filingDate !== scope.filingDate || evidence.eventDate !== null || evidence.primaryDocument.filename !== scope.primaryDocument || evidence.primaryDocument.contentRetrieved !== false) {
    throw new Error("SEC_8K_RUN_RESULT_SCOPE_MISMATCH");
  }
  const retrievedAt = evidence.retrievedAt;
  const envelopeMaterial = metadataEnvelope(evidence);
  const payloadFingerprint = canonicalSha256(envelopeMaterial);
  const request = createIngestionRequest({
    idempotencyKey: `sec-edgar-8k:${scope.cik}:${scope.accession}:${retrievedAt}:${payloadFingerprint}`,
    providerId: "SEC_EDGAR",
    datasetId: "FILING_METADATA",
    datasetVersion: "sec-edgar-8k-metadata/v1",
    providerSourceNamespace: "SEC_EDGAR",
    envelopeSchemaVersion: ENVELOPE_VERSION,
    requestScope: { cik: scope.cik, accession: scope.accession, form: scope.form, filingDate: scope.filingDate, stage: "SUBMISSIONS_AND_FILING_INDEX_METADATA_ONLY" },
    adapterContractVersion: "sec-edgar-8k-response-adapter/v1",
    parserContractVersion: PARSER_VERSION,
    requestedAt: retrievedAt,
    provenance: { system: "sec-edgar-local-smoke" },
  });
  const attempt = createIngestionAttempt({
    ingestionRequestId: request.ingestionRequestId,
    attemptNumber: 1,
    adapterVersion: "sec-edgar-8k-response-adapter/v1",
    parserVersion: PARSER_VERSION,
    executionInput: { mode: "LOCAL_SMOKE_METADATA_ONLY", rawBytesRetained: false },
    startedAt: retrievedAt,
  });
  const artifact = createSourceArtifact({
    providerId: request.providerId,
    datasetId: request.datasetId,
    datasetVersion: request.datasetVersion,
    providerSourceNamespace: request.providerSourceNamespace,
    providerExternalRecordId: scope.accession,
    providerRevision: scope.filingDate,
    payloadFingerprint,
    recordedAt: retrievedAt,
  });
  const envelope = createSourceEnvelope({
    sourceArtifactId: artifact.sourceArtifactId,
    parserContractVersion: PARSER_VERSION,
    envelopeSchemaVersion: ENVELOPE_VERSION,
    normalizedEnvelope: envelopeMaterial,
    selectedAuditableFields: envelopeMaterial.identity as JsonObject,
    payloadFingerprint,
    observedAt: retrievedAt,
    temporalQualityStatus: "RESOLVED",
    temporalDiagnosticCodes: [],
    recordedAt: retrievedAt,
  });
  const observation = createSourceObservation({
    ingestionAttemptId: attempt.ingestionAttemptId,
    sourceArtifactId: artifact.sourceArtifactId,
    responsePageOrdinal: 0,
    itemOrdinal: 0,
    retrievedAt,
    metadata: { pageOrdinal: 0, cursorSafety: "NONE", responseHostPath: SOURCE_URL },
    recordedAt: retrievedAt,
  });
  const events = Object.freeze([
    createLifecycleEvent({ ingestionAttemptId: attempt.ingestionAttemptId, sequence: 1, eventType: "STARTED", payload: {}, recordedAt: retrievedAt }),
    createLifecycleEvent({ ingestionAttemptId: attempt.ingestionAttemptId, sequence: 2, eventType: "SOURCE_OBSERVED", payload: { sourceObservationId: observation.sourceObservationId }, recordedAt: retrievedAt }),
    createLifecycleEvent({ ingestionAttemptId: attempt.ingestionAttemptId, sequence: 3, eventType: "COMPLETED", payload: {}, recordedAt: retrievedAt }),
  ]);
  if (reduceIngestionLifecycle(events).status !== "COMPLETED") throw new Error("SEC_8K_OBSERVATION_LIFECYCLE_INVALID");
  return Object.freeze({ request, attempt, artifact, envelope, observation, events });
}

function assertSame<T>(saved: T, expected: T, fingerprintKey: keyof T, code: string): void {
  if (saved === undefined || saved === null || saved[fingerprintKey] !== expected[fingerprintKey]) throw new Error(code);
}

/** Persist one observation and its STARTED → SOURCE_OBSERVED → COMPLETED lifecycle atomically. */
export async function recordSecEdgar8kSourceObservation(input: Readonly<{ runResult: unknown; unitOfWork: IngestionProvenanceUnitOfWork }>): Promise<SecEdgar8kObservationResult> {
  const plan = buildSecEdgar8kObservationPlan(input.runResult);
  return input.unitOfWork.withTransaction(async (repositories: AsyncIngestionProvenanceRepositories) => {
    const request = await repositories.requests.save(plan.request);
    assertSame(request, plan.request, "requestFingerprint", "SEC_8K_INGESTION_REQUEST_CONFLICT");
    const attempt = await repositories.attempts.save(plan.attempt);
    assertSame(attempt, plan.attempt, "attemptFingerprint", "SEC_8K_INGESTION_ATTEMPT_CONFLICT");
    await repositories.events.save(plan.events[0]!);
    const artifact = await repositories.artifacts.save(plan.artifact);
    assertSame(artifact, plan.artifact, "sourceArtifactFingerprint", "SEC_8K_SOURCE_ARTIFACT_CONFLICT");
    const envelope = await repositories.envelopes.save(plan.envelope);
    assertSame(envelope, plan.envelope, "sourceEnvelopeFingerprint", "SEC_8K_SOURCE_ENVELOPE_CONFLICT");
    const observation = await repositories.observations.save(plan.observation);
    assertSame(observation, plan.observation, "observationFingerprint", "SEC_8K_SOURCE_OBSERVATION_CONFLICT");
    for (const event of plan.events.slice(1)) await repositories.events.save(event);
    const lifecycle = reduceIngestionLifecycle(await repositories.events.readByAttempt(plan.attempt.ingestionAttemptId));
    if (lifecycle.status !== "COMPLETED" || lifecycle.events.length !== 3) throw new Error("SEC_8K_INGESTION_LIFECYCLE_CONFLICT");
    return Object.freeze({ status: "OBSERVATION_RECORDED", authority: "NON_AUTHORITATIVE_SOURCE_OBSERVATION", requestId: request.ingestionRequestId, attemptId: attempt.ingestionAttemptId, sourceArtifactId: artifact.sourceArtifactId, sourceEnvelopeId: envelope.sourceEnvelopeId, sourceObservationId: observation.sourceObservationId, lifecycleStatus: "COMPLETED", eventDate: null });
  });
}
