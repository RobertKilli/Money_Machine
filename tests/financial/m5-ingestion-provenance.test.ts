import { describe, expect, it } from "vitest";
import {
  availabilityClaimIdFor,
  availabilityClaimFingerprint,
  createIngestionAttempt,
  createIngestionRequest,
  createLifecycleEvent,
  createRetrievalAvailabilityClaim,
  createSourceArtifact,
  createSourceEnvelope,
  createSourceObservation,
  ingestionAttemptIdFor,
  ingestionRequestIdFor,
  reduceIngestionLifecycle,
  sourceEnvelopeFingerprint,
  type LifecycleEvent,
} from "@/domain/intelligence/ingestion-provenance";
import { createInMemoryIngestionProvenanceRepositories } from "@/application/intelligence/ingestion-provenance-repository";
import { parseM5IngestionFixture } from "@/application/intelligence/parse-m5-ingestion-fixture";

const t0 = "2026-01-01T00:00:00.000Z";
const t1 = "2026-01-01T00:01:00.000Z";
const t2 = "2026-01-01T00:02:00.000Z";
const t3 = "2026-01-01T00:03:00.000Z";
const t4 = "2026-01-01T00:04:00.000Z";

const request = (overrides: Record<string, unknown> = {}) => createIngestionRequest({
  idempotencyKey: "operator-request-1",
  providerId: "provider-1",
  datasetId: "dataset-1",
  datasetVersion: "dataset-v1",
  providerSourceNamespace: "FIXTURE",
  envelopeSchemaVersion: "envelope/v1",
  requestScope: { assets: ["asset-1"], pageSize: 100 },
  adapterContractVersion: "adapter/v1",
  parserContractVersion: "parser/v1",
  requestedAt: t0,
  provenance: { system: "fixture-runner", correlationId: "corr-1" },
  ...overrides,
} as never);

const artifact = (overrides: Record<string, unknown> = {}) => createSourceArtifact({
  providerId: "provider-1",
  datasetId: "dataset-1",
  datasetVersion: "dataset-v1",
  providerSourceNamespace: "FIXTURE",
  providerExternalRecordId: "external-1",
  payloadFingerprint: "a".repeat(64),
  recordedAt: t1,
  ...overrides,
} as never);

const envelope = (value = artifact(), overrides: Record<string, unknown> = {}) => createSourceEnvelope({
  sourceArtifactId: value.sourceArtifactId,
  parserContractVersion: "parser/v1",
  envelopeSchemaVersion: "envelope/v1",
  normalizedEnvelope: { kind: "market", value: "100" },
  selectedAuditableFields: { externalRecordId: "external-1" },
  payloadFingerprint: value.payloadFingerprint,
  observedAt: t0,
  temporalQualityStatus: "RESOLVED",
  temporalDiagnosticCodes: [],
  recordedAt: t1,
  ...overrides,
} as never);

const attempt = (repos = createInMemoryIngestionProvenanceRepositories()) => {
  const savedRequest = repos.requests.save(request());
  const value = createIngestionAttempt({ ingestionRequestId: savedRequest.ingestionRequestId, attemptNumber: 1, adapterVersion: "adapter/v1", parserVersion: "parser/v1", executionInput: { pageSize: 100 }, startedAt: t1 });
  repos.attempts.save(value);
  return { repos, value };
};

const event = (attemptId: string, sequence: number, eventType: LifecycleEvent["eventType"], payload: Record<string, unknown> = {}) => createLifecycleEvent({ ingestionAttemptId: attemptId, sequence, eventType, payload: payload as never, recordedAt: t2 });

describe("M5 ingestion provenance domain", () => {
  it("uses stable request IDs while fingerprints include request material", () => {
    const first = request();
    const replay = request({ requestedAt: t4, provenance: { system: "other-run" } });
    expect(first.ingestionRequestId).toBe(ingestionRequestIdFor("operator-request-1"));
    expect(first.ingestionRequestId).toBe(replay.ingestionRequestId);
    expect(first.requestFingerprint).toBe(replay.requestFingerprint);
    expect(request({ idempotencyKey: "operator-request-2" }).ingestionRequestId).not.toBe(first.ingestionRequestId);
    expect(request({ providerSourceNamespace: "OTHER" }).ingestionRequestId).toBe(first.ingestionRequestId);
    expect(request({ providerSourceNamespace: "OTHER" }).requestFingerprint).not.toBe(first.requestFingerprint);
  });

  it("rejects a reused idempotency key with different material", () => {
    const repos = createInMemoryIngestionProvenanceRepositories();
    repos.requests.save(request());
    expect(() => repos.requests.save(request({ requestScope: { assets: ["other-asset"] } }))).toThrow("M5_INGESTION_REQUEST_CONFLICT");
  });

  it("makes attempts deterministic and requires explicit positive numbers", () => {
    const first = attempt().value;
    const replay = createIngestionAttempt({ ingestionRequestId: first.ingestionRequestId, attemptNumber: 1, adapterVersion: "adapter/v1", parserVersion: "parser/v1", executionInput: { pageSize: 100 }, startedAt: t4 });
    expect(first.ingestionAttemptId).toBe(ingestionAttemptIdFor(first.ingestionRequestId, 1));
    expect(first.attemptFingerprint).toBe(replay.attemptFingerprint);
    expect(() => createIngestionAttempt({ ingestionRequestId: first.ingestionRequestId, attemptNumber: 0, adapterVersion: "adapter/v1", parserVersion: "parser/v1", executionInput: {}, startedAt: t1 })).toThrow("M5_INGESTION_ATTEMPT_NUMBER_INVALID");
  });

  it("rejects same attempt ID with different execution material", () => {
    const { repos, value } = attempt();
    expect(() => repos.attempts.save(createIngestionAttempt({ ingestionRequestId: value.ingestionRequestId, attemptNumber: 1, adapterVersion: "adapter/v1", parserVersion: "parser/v1", executionInput: { changed: true }, startedAt: t4 }))).toThrow("M5_INGESTION_ATTEMPT_CONFLICT");
  });

  it("enforces attempt parser and adapter contracts at repository save", () => {
    const repos = createInMemoryIngestionProvenanceRepositories();
    const savedRequest = repos.requests.save(request());
    const parserMismatch = createIngestionAttempt({ ingestionRequestId: savedRequest.ingestionRequestId, attemptNumber: 1, adapterVersion: "adapter/v1", parserVersion: "parser/v2", executionInput: {}, startedAt: t1 });
    expect(() => repos.attempts.save(parserMismatch)).toThrow("M5_INGESTION_ATTEMPT_PARSER_REQUEST_MISMATCH");
    const adapterMismatch = createIngestionAttempt({ ingestionRequestId: savedRequest.ingestionRequestId, attemptNumber: 2, adapterVersion: "adapter/v2", parserVersion: "parser/v1", executionInput: {}, startedAt: t1 });
    expect(() => repos.attempts.save(adapterMismatch)).toThrow("M5_INGESTION_ATTEMPT_ADAPTER_REQUEST_MISMATCH");
  });

  it("reduces STARTED, observations and each alternative terminal state", () => {
    for (const terminal of ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"] as const) {
      const attemptId = "attempt-" + terminal;
      const result = reduceIngestionLifecycle([event(attemptId, 1, "STARTED"), event(attemptId, 2, "SOURCE_OBSERVED", { sourceObservationId: "obs-1" }), event(attemptId, 3, terminal)]);
      expect(result.status).toBe(terminal);
      expect(result.terminalEvent?.eventType).toBe(terminal);
    }
  });

  it("keeps an open attempt non-authoritative", () => {
    const result = reduceIngestionLifecycle([event("open", 1, "STARTED"), event("open", 2, "SOURCE_OBSERVED", { sourceObservationId: "obs-1" })]);
    expect(result.status).toBe("SOURCE_OBSERVED");
    expect(result.terminalEvent).toBeUndefined();
  });

  it("rejects missing STARTED, skipped/duplicate sequences and post-terminal events", () => {
    expect(() => reduceIngestionLifecycle([event("bad", 1, "SOURCE_OBSERVED", { sourceObservationId: "x" })])).toThrow("M5_INGESTION_LIFECYCLE_TRANSITION_INVALID");
    expect(() => reduceIngestionLifecycle([event("bad", 1, "STARTED"), event("bad", 3, "COMPLETED")])).toThrow("M5_INGESTION_LIFECYCLE_SEQUENCE_INVALID");
    const started = event("bad", 1, "STARTED");
    expect(() => reduceIngestionLifecycle([started, event("bad", 2, "SOURCE_OBSERVED", { sourceObservationId: "x" }), event("bad", 2, "SOURCE_OBSERVED", { sourceObservationId: "y" })])).toThrow("M5_INGESTION_LIFECYCLE_EVENT_CONFLICT");
    expect(() => reduceIngestionLifecycle([event("bad", 1, "STARTED"), event("bad", 2, "COMPLETED"), event("bad", 3, "SOURCE_OBSERVED", { sourceObservationId: "x" })])).toThrow("M5_INGESTION_LIFECYCLE_TERMINAL_CONFLICT");
  });

  it("allows exact lifecycle replay but rejects conflicting terminal events", () => {
    const started = event("replay", 1, "STARTED");
    const done = event("replay", 2, "COMPLETED");
    expect(reduceIngestionLifecycle([started, done, done]).status).toBe("COMPLETED");
    expect(() => reduceIngestionLifecycle([started, done, event("replay", 2, "FAILED")])).toThrow("M5_INGESTION_LIFECYCLE_EVENT_CONFLICT");
  });

  it("separates stable source artifacts from parser-versioned envelopes", () => {
    const source = artifact();
    const v1 = envelope(source);
    const v2 = envelope(source, { parserContractVersion: "parser/v2" });
    expect(v1.sourceArtifactId).toBe(source.sourceArtifactId);
    expect(v1.sourceEnvelopeId).not.toBe(v2.sourceEnvelopeId);
    expect(v1.sourceEnvelopeFingerprint).not.toBe(v2.sourceEnvelopeFingerprint);
  });

  it("keeps availability out of envelope fingerprints", () => {
    const source = artifact();
    const first = envelope(source);
    const second = envelope(source, { recordedAt: t4, temporalDiagnosticCodes: [], temporalQualityStatus: "RESOLVED" });
    expect(sourceEnvelopeFingerprint(first)).toBe(sourceEnvelopeFingerprint(second));
    expect(first.sourceEnvelopeFingerprint).toBe(second.sourceEnvelopeFingerprint);
  });

  it("rejects provider artifact conflicts and preserves replay", () => {
    const repos = createInMemoryIngestionProvenanceRepositories();
    const source = artifact();
    expect(repos.artifacts.save(source)).toStrictEqual(source);
    expect(repos.artifacts.save(artifact({ recordedAt: t4 }))).toStrictEqual(source);
    expect(() => repos.artifacts.save(artifact({ payloadFingerprint: "b".repeat(64) }))).toThrow("M5_SOURCE_ARTIFACT_CONFLICT");
    expect(() => repos.artifacts.save(artifact({ providerRevision: "2", payloadFingerprint: "b".repeat(64) }))).not.toThrow();
  });

  it("supports observations of one artifact across attempts and idempotent occurrence replay", () => {
    const repos = createInMemoryIngestionProvenanceRepositories();
    const first = attempt(repos);
    const source = artifact();
    repos.artifacts.save(source);
    const observation = createSourceObservation({ ingestionAttemptId: first.value.ingestionAttemptId, sourceArtifactId: source.sourceArtifactId, responsePageOrdinal: 0, itemOrdinal: 0, retrievedAt: t2, metadata: { pageOrdinal: 0, cursorSafety: "NONE" }, recordedAt: t3 });
    expect(repos.observations.save(observation)).toStrictEqual(observation);
    expect(repos.observations.save(observation)).toStrictEqual(observation);
    const secondAttempt = createIngestionAttempt({ ingestionRequestId: first.value.ingestionRequestId, attemptNumber: 2, adapterVersion: "adapter/v1", parserVersion: "parser/v1", executionInput: {}, startedAt: t3 });
    repos.attempts.save(secondAttempt);
    const secondObservation = createSourceObservation({ ingestionAttemptId: secondAttempt.ingestionAttemptId, sourceArtifactId: source.sourceArtifactId, responsePageOrdinal: 0, itemOrdinal: 0, retrievedAt: t0, metadata: { pageOrdinal: 0, cursorSafety: "NONE" }, recordedAt: t3 });
    repos.observations.save(secondObservation);
    expect(repos.observations.readByArtifact(source.sourceArtifactId)).toHaveLength(2);
  });

  it("creates exact retrieval availability claims and never a claim for quarantined envelopes", () => {
    const repos = createInMemoryIngestionProvenanceRepositories();
    const { value: attemptValue } = attempt(repos);
    const source = artifact();
    const goodEnvelope = envelope(source);
    repos.artifacts.save(source); repos.envelopes.save(goodEnvelope);
    const observation = createSourceObservation({ ingestionAttemptId: attemptValue.ingestionAttemptId, sourceArtifactId: source.sourceArtifactId, responsePageOrdinal: 0, itemOrdinal: 0, retrievedAt: t2, metadata: { pageOrdinal: 0, cursorSafety: "NONE" }, recordedAt: t3 });
    repos.observations.save(observation);
    const claim = createRetrievalAvailabilityClaim({ envelope: goodEnvelope, observation, recordedAt: t3 });
    expect(claim.effectiveAvailableAt).toBe(t2);
    expect(claim.availabilityClaimId).toBe(availabilityClaimIdFor(claim));
    expect(repos.availabilityClaims.save(claim)).toStrictEqual(claim);
    const quarantined = envelope(source, { temporalQualityStatus: "QUARANTINED", temporalDiagnosticCodes: ["M5_INGESTION_PROVIDER_CLOCK_SKEW"] });
    expect(() => createRetrievalAvailabilityClaim({ envelope: quarantined, observation, recordedAt: t3 })).toThrow("M5_INGESTION_TEMPORAL_QUALITY_UNRESOLVED");
  });

  it("validates artifact/envelope/observation temporal and identity boundaries", () => {
    const source = artifact();
    const parsed = envelope(source);
    const other = artifact({ providerExternalRecordId: "other" });
    const { value: attemptValue } = attempt();
    const observation = createSourceObservation({ ingestionAttemptId: attemptValue.ingestionAttemptId, sourceArtifactId: other.sourceArtifactId, responsePageOrdinal: 0, itemOrdinal: 0, retrievedAt: t2, metadata: { pageOrdinal: 0, cursorSafety: "NONE" }, recordedAt: t3 });
    expect(() => createRetrievalAvailabilityClaim({ envelope: parsed, observation, recordedAt: t3 })).toThrow("M5_INGESTION_AVAILABILITY_ARTIFACT_MISMATCH");
    expect(() => createSourceObservation({ ingestionAttemptId: attemptValue.ingestionAttemptId, sourceArtifactId: source.sourceArtifactId, responsePageOrdinal: 0, itemOrdinal: 0, retrievedAt: t4, metadata: { pageOrdinal: 0, cursorSafety: "NONE" }, recordedAt: t3 })).toThrow("M5_INGESTION_RETRIEVED_AFTER_RECORDED");
  });

  it("parses a strict fixture deterministically and reports duplicates", () => {
    const fixture = {
      fixtureVersion: "m5-ingestion-fixture/v1",
      providerId: "provider-1", datasetId: "dataset-1", datasetVersion: "dataset-v1", providerSourceNamespace: "FIXTURE",
      parserContractVersion: "parser/v1", envelopeSchemaVersion: "envelope/v1",
      pageMetadata: { pageOrdinal: 0, cursorSafety: "NONE", correlationId: "corr-1" },
      records: [
        { providerExternalRecordId: "b", payloadFingerprint: "b".repeat(64), normalizedEnvelope: { value: "2" }, selectedAuditableFields: { id: "b" }, observedAt: t0, itemOrdinal: 1 },
        { providerExternalRecordId: "a", payloadFingerprint: "c".repeat(64), normalizedEnvelope: { value: "1" }, selectedAuditableFields: { id: "a" }, observedAt: t0, itemOrdinal: 0 },
        { providerExternalRecordId: "a", payloadFingerprint: "c".repeat(64), normalizedEnvelope: { value: "1" }, selectedAuditableFields: { id: "a" }, observedAt: t0, itemOrdinal: 0 },
      ],
    };
    const contextRequest = request();
    const contextAttempt = createIngestionAttempt({ ingestionRequestId: contextRequest.ingestionRequestId, attemptNumber: 1, adapterVersion: "adapter/v1", parserVersion: "parser/v1", executionInput: {}, startedAt: t1 });
    const result = parseM5IngestionFixture(fixture, { request: contextRequest, attempt: contextAttempt, retrievedAt: t1, recordedAt: t2 });
    expect(result.artifacts).toHaveLength(2);
    expect(result.observations.map(value => value.itemOrdinal)).toEqual([0, 0, 1]);
    expect(result.duplicateArtifactIds).toHaveLength(1);
  });

  it("rejects unknown fields, invalid timestamps, conflicting duplicates and secret metadata", () => {
    const baseFixture = { fixtureVersion: "m5-ingestion-fixture/v1", providerId: "p", datasetId: "d", datasetVersion: "v", providerSourceNamespace: "FIXTURE", parserContractVersion: "p/v1", envelopeSchemaVersion: "e/v1", pageMetadata: { pageOrdinal: 0, cursorSafety: "NONE" }, records: [] };
    const contextRequest = createIngestionRequest({ idempotencyKey: "fixture", providerId: "p", datasetId: "d", datasetVersion: "v", providerSourceNamespace: "FIXTURE", envelopeSchemaVersion: "e/v1", requestScope: {}, adapterContractVersion: "adapter/v1", parserContractVersion: "p/v1", requestedAt: t0, provenance: {} });
    const contextAttempt = createIngestionAttempt({ ingestionRequestId: contextRequest.ingestionRequestId, attemptNumber: 1, adapterVersion: "adapter/v1", parserVersion: "p/v1", executionInput: {}, startedAt: t1 });
    const options = { request: contextRequest, attempt: contextAttempt, retrievedAt: t1, recordedAt: t2 };
    expect(() => parseM5IngestionFixture({ ...baseFixture, unknown: true }, options)).toThrow("M5_FIXTURE_UNKNOWN_FIELD");
    expect(() => parseM5IngestionFixture({ ...baseFixture, records: [{ providerExternalRecordId: "x", payloadFingerprint: "a".repeat(64), normalizedEnvelope: {}, selectedAuditableFields: {}, observedAt: "bad", itemOrdinal: 0 }] }, options)).toThrow("M5_INGESTION_OBSERVED_AT_INVALID");
    expect(() => parseM5IngestionFixture({ ...baseFixture, pageMetadata: { pageOrdinal: 0, cursorSafety: "SAFE", cursor: "authorization=secret" } }, options)).toThrow("M5_FIXTURE_CURSOR_UNTRUSTED");
    expect(() => parseM5IngestionFixture({ ...baseFixture, records: [{ providerExternalRecordId: "x", payloadFingerprint: "a".repeat(64), normalizedEnvelope: { token: "secret" }, selectedAuditableFields: {}, observedAt: t0, itemOrdinal: 0 }] }, options)).toThrow("M5_INGESTION_SECRET_METADATA_REJECTED");
    expect(() => parseM5IngestionFixture({ ...baseFixture, records: [{ providerExternalRecordId: "x", payloadFingerprint: "a".repeat(64), normalizedEnvelope: {}, selectedAuditableFields: {}, observedAt: t0, itemOrdinal: 0 }, { providerExternalRecordId: "x", payloadFingerprint: "b".repeat(64), normalizedEnvelope: {}, selectedAuditableFields: {}, observedAt: t0, itemOrdinal: 1 }] }, options)).toThrow("M5_INGESTION_FIXTURE_CONFLICT");
  });

  it("validates fixture execution timestamps before empty record processing", () => {
    const fixture = { fixtureVersion: "m5-ingestion-fixture/v1", providerId: "p", datasetId: "d", datasetVersion: "v", providerSourceNamespace: "FIXTURE", parserContractVersion: "p/v1", envelopeSchemaVersion: "e/v1", pageMetadata: { pageOrdinal: 0, cursorSafety: "NONE" }, records: [] };
    const contextRequest = createIngestionRequest({ idempotencyKey: "empty-time", providerId: "p", datasetId: "d", datasetVersion: "v", providerSourceNamespace: "FIXTURE", envelopeSchemaVersion: "e/v1", requestScope: {}, adapterContractVersion: "adapter/v1", parserContractVersion: "p/v1", requestedAt: t0, provenance: {} });
    const contextAttempt = createIngestionAttempt({ ingestionRequestId: contextRequest.ingestionRequestId, attemptNumber: 1, adapterVersion: "adapter/v1", parserVersion: "p/v1", executionInput: {}, startedAt: t1 });
    expect(() => parseM5IngestionFixture(fixture, { request: contextRequest, attempt: contextAttempt, retrievedAt: "bad", recordedAt: t2 })).toThrow("M5_FIXTURE_RETRIEVED_AT_INVALID");
    expect(() => parseM5IngestionFixture(fixture, { request: contextRequest, attempt: contextAttempt, retrievedAt: t1, recordedAt: "bad" })).toThrow("M5_FIXTURE_RECORDED_AT_INVALID");
    expect(() => parseM5IngestionFixture(fixture, { request: contextRequest, attempt: contextAttempt, retrievedAt: t2, recordedAt: t1 })).toThrow("M5_FIXTURE_RETRIEVED_AFTER_RECORDED");
    expect(parseM5IngestionFixture(fixture, { request: contextRequest, attempt: contextAttempt, retrievedAt: t1, recordedAt: t2 }).observations).toHaveLength(0);
  });

  it("preserves an explicit temporal quarantine diagnostic without raw provider data", () => {
    const fixture = { fixtureVersion: "m5-ingestion-fixture/v1", providerId: "p", datasetId: "d", datasetVersion: "v", providerSourceNamespace: "FIXTURE", parserContractVersion: "p/v1", envelopeSchemaVersion: "e/v1", pageMetadata: { pageOrdinal: 0, cursorSafety: "NONE" }, records: [{ providerExternalRecordId: "x", payloadFingerprint: "a".repeat(64), normalizedEnvelope: {}, selectedAuditableFields: {}, providerPublishedAt: t4, observedAt: t0, itemOrdinal: 0 }] };
    const contextRequest = createIngestionRequest({ idempotencyKey: "fixture-skew", providerId: "p", datasetId: "d", datasetVersion: "v", providerSourceNamespace: "FIXTURE", envelopeSchemaVersion: "e/v1", requestScope: {}, adapterContractVersion: "adapter/v1", parserContractVersion: "p/v1", requestedAt: t0, provenance: {} });
    const contextAttempt = createIngestionAttempt({ ingestionRequestId: contextRequest.ingestionRequestId, attemptNumber: 1, adapterVersion: "adapter/v1", parserVersion: "p/v1", executionInput: {}, startedAt: t1 });
    const result = parseM5IngestionFixture(fixture, { request: contextRequest, attempt: contextAttempt, retrievedAt: t1, recordedAt: t2 });
    expect(result.envelopes[0]?.temporalQualityStatus).toBe("QUARANTINED");
    expect(result.envelopes[0]?.temporalDiagnosticCodes).toEqual(["M5_INGESTION_PROVIDER_CLOCK_SKEW"]);
  });

  it("validates lifecycle identities, payloads and attempt ownership", () => {
    const started = event("attempt-a", 1, "STARTED");
    expect(() => reduceIngestionLifecycle([{ ...started, eventFingerprint: "b".repeat(64) } as never])).toThrow("M5_INGESTION_LIFECYCLE_EVENT_FINGERPRINT_MISMATCH");
    expect(() => reduceIngestionLifecycle([started, event("attempt-b", 2, "COMPLETED")])).toThrow("M5_INGESTION_LIFECYCLE_ATTEMPT_MISMATCH");
    expect(() => createLifecycleEvent({ ingestionAttemptId: "x", sequence: 1, eventType: "STARTED", payload: { unexpected: true } as never, recordedAt: t1 })).toThrow("M5_INGESTION_STARTED_PAYLOAD_INVALID");
    expect(() => createLifecycleEvent({ ingestionAttemptId: "x", sequence: 2, eventType: "SOURCE_OBSERVED", payload: {} as never, recordedAt: t1 })).toThrow("M5_INGESTION_SOURCE_OBSERVED_PAYLOAD_INVALID");
  });

  it("deep freezes material JSON and validates payload fingerprints", () => {
    const value = request({ requestScope: { nested: { values: ["a"] } } });
    expect(() => ((value.requestScope.nested as { readonly values: string[] }).values).push("b")).toThrow();
    expect(() => artifact({ payloadFingerprint: "payload-1" })).toThrow("M5_INGESTION_PAYLOAD_FINGERPRINT_INVALID");
    expect(() => envelope(artifact(), { payloadFingerprint: "payload-1" })).toThrow("M5_INGESTION_PAYLOAD_FINGERPRINT_INVALID");
  });

  it("binds envelopes and observations to their trusted parents", () => {
    const repos = createInMemoryIngestionProvenanceRepositories();
    const { value: attemptValue } = attempt(repos);
    const source = artifact();
    repos.artifacts.save(source);
    expect(() => repos.envelopes.save(envelope(source, { payloadFingerprint: "b".repeat(64) }))).toThrow("M5_SOURCE_ENVELOPE_PAYLOAD_MISMATCH");
    for (const dimension of [{ providerId: "provider-other" }, { datasetId: "dataset-other" }, { datasetVersion: "dataset-v2" }]) {
      const otherRequest = request({ idempotencyKey: `other-${Object.keys(dimension)[0]}`, ...dimension });
      const otherAttempt = createIngestionAttempt({ ingestionRequestId: otherRequest.ingestionRequestId, attemptNumber: 1, adapterVersion: "adapter/v1", parserVersion: "parser/v1", executionInput: {}, startedAt: t1 });
      repos.requests.save(otherRequest); repos.attempts.save(otherAttempt);
      const observation = createSourceObservation({ ingestionAttemptId: otherAttempt.ingestionAttemptId, sourceArtifactId: source.sourceArtifactId, responsePageOrdinal: 0, itemOrdinal: 0, retrievedAt: t2, metadata: { pageOrdinal: 0, cursorSafety: "NONE" }, recordedAt: t3 });
      expect(() => repos.observations.save(observation)).toThrow("M5_INGESTION_OBSERVATION_REQUEST_MISMATCH");
    }
    const goodObservation = createSourceObservation({ ingestionAttemptId: attemptValue.ingestionAttemptId, sourceArtifactId: source.sourceArtifactId, responsePageOrdinal: 0, itemOrdinal: 0, retrievedAt: t2, metadata: { pageOrdinal: 0, cursorSafety: "NONE" }, recordedAt: t3 });
    expect(() => repos.events.save(event(attemptValue.ingestionAttemptId, 1, "STARTED"))).not.toThrow();
    expect(() => repos.events.save(event(attemptValue.ingestionAttemptId, 2, "SOURCE_OBSERVED", { sourceObservationId: goodObservation.sourceObservationId }))).toThrow("M5_INGESTION_EVENT_OBSERVATION_MISMATCH");
  });

  it("persists a complete positive lifecycle with source observation", () => {
    const repos = createInMemoryIngestionProvenanceRepositories();
    const { value: attemptValue } = attempt(repos);
    const source = artifact();
    repos.artifacts.save(source);
    const observation = createSourceObservation({ ingestionAttemptId: attemptValue.ingestionAttemptId, sourceArtifactId: source.sourceArtifactId, responsePageOrdinal: 0, itemOrdinal: 0, retrievedAt: t2, metadata: { pageOrdinal: 0, cursorSafety: "NONE" }, recordedAt: t3 });
    repos.observations.save(observation);
    repos.events.save(event(attemptValue.ingestionAttemptId, 1, "STARTED"));
    repos.events.save(event(attemptValue.ingestionAttemptId, 2, "SOURCE_OBSERVED", { sourceObservationId: observation.sourceObservationId }));
    repos.events.save(event(attemptValue.ingestionAttemptId, 3, "COMPLETED"));
    const history = repos.events.readByAttempt(attemptValue.ingestionAttemptId);
    expect(reduceIngestionLifecycle(history).status).toBe("COMPLETED");
  });

  it("canonicalizes caller-owned nested JSON before storage", () => {
    const repos = createInMemoryIngestionProvenanceRepositories();
    const original = request({ requestScope: { nested: { values: ["original"] } } });
    const mutableScope = { nested: { values: ["original"] } };
    const callerRecord = { ...original, requestScope: mutableScope } as never;
    const stored = repos.requests.save(callerRecord);
    mutableScope.nested.values[0] = "mutated";
    expect((stored.requestScope.nested as unknown as { readonly values: readonly string[] }).values[0]).toBe("original");
    expect(Object.isFrozen(stored.requestScope)).toBe(true);
  });

  it("revalidates availability claims instead of trusting their fingerprint", () => {
    const repos = createInMemoryIngestionProvenanceRepositories();
    const { value: attemptValue } = attempt(repos);
    const source = artifact();
    const parsed = envelope(source);
    repos.artifacts.save(source); repos.envelopes.save(parsed);
    const observation = createSourceObservation({ ingestionAttemptId: attemptValue.ingestionAttemptId, sourceArtifactId: source.sourceArtifactId, responsePageOrdinal: 0, itemOrdinal: 0, retrievedAt: t2, metadata: { pageOrdinal: 0, cursorSafety: "NONE" }, recordedAt: t3 });
    repos.observations.save(observation);
    const forged = createRetrievalAvailabilityClaim({ envelope: parsed, observation, recordedAt: t3 });
    const invalid = { ...forged, effectiveAvailableAt: t1, claimFingerprint: availabilityClaimFingerprint({ ...forged, effectiveAvailableAt: t1 }) } as never;
    expect(() => repos.availabilityClaims.save(invalid)).toThrow("M5_INGESTION_AVAILABILITY_CLAIM_INVALID");
  });
});
