import { createHash } from "node:crypto";

export const INGESTION_PROVENANCE_VERSION = "m5-ingestion-provenance/v1" as const;
export const INGESTION_FIXTURE_VERSION = "m5-ingestion-fixture/v1" as const;
export const INGESTION_REQUEST_CONTRACT_VERSION = "m5-ingestion-request/v1" as const;
export const INGESTION_ATTEMPT_CONTRACT_VERSION = "m5-ingestion-attempt/v1" as const;
export const INGESTION_EVENT_CONTRACT_VERSION = "m5-ingestion-event/v1" as const;
export const SOURCE_ARTIFACT_CONTRACT_VERSION = "m5-source-artifact/v1" as const;
export const SOURCE_ENVELOPE_CONTRACT_VERSION = "m5-source-envelope/v1" as const;
export const SOURCE_OBSERVATION_CONTRACT_VERSION = "m5-source-observation/v1" as const;
export const AVAILABILITY_CLAIM_CONTRACT_VERSION = "m5-availability-claim/v1" as const;

export type Primitive = string | number | boolean | null;
export type JsonValue = Primitive | JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export type SecretSafeProvenance = Readonly<{
  operatorId?: string;
  system?: string;
  reviewReference?: string;
  correlationId?: string;
}>;

export type IngestionRequest = Readonly<{
  ingestionRequestId: string;
  contractVersion: typeof INGESTION_REQUEST_CONTRACT_VERSION;
  idempotencyKey: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  requestScope: JsonObject;
  adapterContractVersion: string;
  parserContractVersion: string;
  requestFingerprint: string;
  requestedAt: string;
  provenance: SecretSafeProvenance;
}>;

export type IngestionAttempt = Readonly<{
  ingestionAttemptId: string;
  ingestionRequestId: string;
  contractVersion: typeof INGESTION_ATTEMPT_CONTRACT_VERSION;
  attemptNumber: number;
  adapterVersion: string;
  parserVersion: string;
  executionInput: JsonObject;
  attemptFingerprint: string;
  startedAt: string;
}>;

export type LifecycleEventType =
  | "STARTED"
  | "SOURCE_OBSERVED"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

export type LifecycleEvent = Readonly<{
  lifecycleEventId: string;
  ingestionAttemptId: string;
  contractVersion: typeof INGESTION_EVENT_CONTRACT_VERSION;
  sequence: number;
  eventType: LifecycleEventType;
  payload: JsonObject;
  eventFingerprint: string;
  recordedAt: string;
}>;

export type LifecycleState = Readonly<{
  status: "NOT_STARTED" | "OPEN" | LifecycleEventType;
  nextSequence: number;
  terminalEvent?: LifecycleEvent;
  events: readonly LifecycleEvent[];
}>;

export type SourceArtifact = Readonly<{
  sourceArtifactId: string;
  contractVersion: typeof SOURCE_ARTIFACT_CONTRACT_VERSION;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  providerSourceNamespace: string;
  providerExternalRecordId: string;
  providerRevision?: string;
  payloadFingerprint: string;
  sourceArtifactFingerprint: string;
  recordedAt: string;
}>;

export type TemporalQualityStatus = "RESOLVED" | "QUARANTINED";

export type SourceEnvelope = Readonly<{
  sourceEnvelopeId: string;
  contractVersion: typeof SOURCE_ENVELOPE_CONTRACT_VERSION;
  sourceArtifactId: string;
  parserContractVersion: string;
  envelopeSchemaVersion: string;
  normalizedEnvelope: JsonObject;
  selectedAuditableFields: JsonObject;
  payloadFingerprint: string;
  sourceEnvelopeFingerprint: string;
  providerPublishedAt?: string;
  observedAt: string;
  temporalQualityStatus: TemporalQualityStatus;
  temporalDiagnosticCodes: readonly string[];
  recordedAt: string;
}>;

export type SafePaginationMetadata = Readonly<{
  pageOrdinal: number;
  cursorSafety: "NONE" | "SAFE" | "HASHED";
  cursor?: string;
  cursorHash?: string;
  responseHostPath?: string;
  correlationId?: string;
}>;

export type SourceObservation = Readonly<{
  sourceObservationId: string;
  contractVersion: typeof SOURCE_OBSERVATION_CONTRACT_VERSION;
  ingestionAttemptId: string;
  sourceArtifactId: string;
  responsePageOrdinal: number;
  itemOrdinal: number;
  retrievedAt: string;
  metadata: SafePaginationMetadata;
  observationFingerprint: string;
  recordedAt: string;
}>;

export type AvailabilityClaim = Readonly<{
  availabilityClaimId: string;
  sourceEnvelopeId: string;
  sourceObservationId: string;
  contractVersion: typeof AVAILABILITY_CLAIM_CONTRACT_VERSION;
  basis: "RETRIEVAL_OBSERVED";
  effectiveAvailableAt: string;
  claimFingerprint: string;
  recordedAt: string;
}>;

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TERMINAL_EVENTS = new Set<LifecycleEventType>(["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"]);
const SECRET_KEYS = /authorization|cookie|password|secret|token|api[_-]?key|signed[_-]?url/i;
const SAFE_CORRELATION = /^[A-Za-z0-9._:-]{1,128}$/;
const HASH = /^[a-f0-9]{64}$/;

function nonBlank(value: unknown, code: string, max = 512): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(code);
  return value.trim();
}

function timestamp(value: unknown, code: string): string {
  const normalized = nonBlank(value, code);
  if (!UTC_TIMESTAMP.test(normalized) || Number.isNaN(Date.parse(normalized)) || new Date(normalized).toISOString() !== normalized) throw new Error(code);
  return normalized;
}

function integer(value: unknown, code: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) throw new Error(code);
  return value as number;
}

function jsonValue(value: unknown, code: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(item => jsonValue(item, code));
  if (value && typeof value === "object") {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (SECRET_KEYS.test(key)) throw new Error("M5_INGESTION_SECRET_METADATA_REJECTED");
      return [nonBlank(key, code), jsonValue(item, code)];
    })));
  }
  throw new Error(code);
}

function object(value: unknown, code: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return jsonValue(value, code) as JsonObject;
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function fingerprint(value: unknown): string { return digest(value); }

function safeProvenance(input: SecretSafeProvenance): SecretSafeProvenance {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("M5_INGESTION_PROVENANCE_INVALID");
  const allowed = new Set(["operatorId", "system", "reviewReference", "correlationId"]);
  for (const key of Object.keys(input)) if (!allowed.has(key) || SECRET_KEYS.test(key)) throw new Error("M5_INGESTION_SECRET_METADATA_REJECTED");
  const output: Record<string, string> = {};
  for (const key of allowed) {
    const value = input[key as keyof SecretSafeProvenance];
    if (value !== undefined) output[key] = nonBlank(value, "M5_INGESTION_PROVENANCE_INVALID", 256);
  }
  if (output.correlationId !== undefined && !SAFE_CORRELATION.test(output.correlationId)) throw new Error("M5_INGESTION_CORRELATION_INVALID");
  return Object.freeze(output);
}

function safeMetadata(input: SafePaginationMetadata): SafePaginationMetadata {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("M5_INGESTION_METADATA_INVALID");
  const allowed = new Set(["pageOrdinal", "cursorSafety", "cursor", "cursorHash", "responseHostPath", "correlationId"]);
  for (const key of Object.keys(input)) if (!allowed.has(key) || SECRET_KEYS.test(key)) throw new Error("M5_INGESTION_SECRET_METADATA_REJECTED");
  const pageOrdinal = integer(input.pageOrdinal, "M5_INGESTION_PAGE_ORDINAL_INVALID");
  if (input.cursorSafety !== "NONE" && input.cursorSafety !== "SAFE" && input.cursorSafety !== "HASHED") throw new Error("M5_INGESTION_CURSOR_SAFETY_INVALID");
  if (input.cursorSafety === "SAFE") {
    if (input.cursorHash !== undefined || input.cursor === undefined) throw new Error("M5_INGESTION_CURSOR_INVALID");
    const cursor = nonBlank(input.cursor, "M5_INGESTION_CURSOR_INVALID", 256);
    if (SECRET_KEYS.test(cursor)) throw new Error("M5_INGESTION_SECRET_METADATA_REJECTED");
    const responseHostPath = input.responseHostPath === undefined ? undefined : normalizeHostPath(input.responseHostPath);
    return Object.freeze({ pageOrdinal, cursorSafety: "SAFE", cursor, ...(responseHostPath === undefined ? {} : { responseHostPath }), ...(input.correlationId === undefined ? {} : { correlationId: safeCorrelation(input.correlationId) }) });
  }
  if (input.cursorSafety === "HASHED") {
    if (input.cursor !== undefined || !HASH.test(nonBlank(input.cursorHash, "M5_INGESTION_CURSOR_HASH_INVALID"))) throw new Error("M5_INGESTION_CURSOR_HASH_INVALID");
  } else if (input.cursor !== undefined || input.cursorHash !== undefined) throw new Error("M5_INGESTION_CURSOR_INVALID");
  const responseHostPath = input.responseHostPath === undefined ? undefined : normalizeHostPath(input.responseHostPath);
  return Object.freeze({ pageOrdinal, cursorSafety: input.cursorSafety, ...(input.cursorHash === undefined ? {} : { cursorHash: input.cursorHash }), ...(responseHostPath === undefined ? {} : { responseHostPath }), ...(input.correlationId === undefined ? {} : { correlationId: safeCorrelation(input.correlationId) }) });
}

function safeCorrelation(value: string): string { const normalized = nonBlank(value, "M5_INGESTION_CORRELATION_INVALID", 128); if (!SAFE_CORRELATION.test(normalized)) throw new Error("M5_INGESTION_CORRELATION_INVALID"); return normalized; }

function normalizeHostPath(value: string): string {
  const normalized = nonBlank(value, "M5_INGESTION_RESPONSE_URL_INVALID", 2048);
  let parsed: URL;
  try { parsed = new URL(normalized); } catch { throw new Error("M5_INGESTION_RESPONSE_URL_INVALID"); }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("M5_INGESTION_SECRET_METADATA_REJECTED");
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
}

export function ingestionRequestIdFor(idempotencyKey: string): string {
  return `m5-ingestion-request:${digest({ version: INGESTION_REQUEST_CONTRACT_VERSION, idempotencyKey: nonBlank(idempotencyKey, "M5_INGESTION_IDEMPOTENCY_KEY_INVALID") })}`;
}

export function ingestionRequestFingerprint(input: Omit<IngestionRequest, "ingestionRequestId" | "requestFingerprint" | "requestedAt">): string {
  return fingerprint({ version: INGESTION_REQUEST_CONTRACT_VERSION, ...input });
}

export function createIngestionRequest(input: Omit<IngestionRequest, "ingestionRequestId" | "contractVersion" | "requestFingerprint"> & { readonly contractVersion?: typeof INGESTION_REQUEST_CONTRACT_VERSION }): IngestionRequest {
  if (input.contractVersion !== undefined && input.contractVersion !== INGESTION_REQUEST_CONTRACT_VERSION) throw new Error("M5_INGESTION_REQUEST_CONTRACT_INVALID");
  const idempotencyKey = nonBlank(input.idempotencyKey, "M5_INGESTION_IDEMPOTENCY_KEY_INVALID");
  const providerId = nonBlank(input.providerId, "M5_INGESTION_PROVIDER_INVALID");
  const datasetId = nonBlank(input.datasetId, "M5_INGESTION_DATASET_INVALID");
  const datasetVersion = nonBlank(input.datasetVersion, "M5_INGESTION_DATASET_VERSION_INVALID");
  const requestScope = object(input.requestScope, "M5_INGESTION_REQUEST_SCOPE_INVALID");
  const adapterContractVersion = nonBlank(input.adapterContractVersion, "M5_INGESTION_ADAPTER_VERSION_INVALID");
  const parserContractVersion = nonBlank(input.parserContractVersion, "M5_INGESTION_PARSER_VERSION_INVALID");
  const provenance = safeProvenance(input.provenance);
  const material = { contractVersion: INGESTION_REQUEST_CONTRACT_VERSION, idempotencyKey, providerId, datasetId, datasetVersion, requestScope, adapterContractVersion, parserContractVersion, provenance };
  const requestFingerprint = ingestionRequestFingerprint(material);
  return Object.freeze({ ...material, ingestionRequestId: ingestionRequestIdFor(idempotencyKey), requestFingerprint, requestedAt: timestamp(input.requestedAt, "M5_INGESTION_REQUESTED_AT_INVALID") });
}

export function assertIngestionRequest(record: IngestionRequest): void {
  const validated = createIngestionRequest(record);
  if (validated.ingestionRequestId !== record.ingestionRequestId || validated.requestFingerprint !== record.requestFingerprint) throw new Error("M5_INGESTION_REQUEST_FINGERPRINT_MISMATCH");
}

export function ingestionAttemptIdFor(ingestionRequestId: string, attemptNumber: number): string {
  return `m5-ingestion-attempt:${digest({ version: INGESTION_ATTEMPT_CONTRACT_VERSION, ingestionRequestId: nonBlank(ingestionRequestId, "M5_INGESTION_REQUEST_ID_INVALID"), attemptNumber: integer(attemptNumber, "M5_INGESTION_ATTEMPT_NUMBER_INVALID", 1) })}`;
}

export function ingestionAttemptFingerprint(input: Omit<IngestionAttempt, "ingestionAttemptId" | "attemptFingerprint" | "startedAt">): string { return fingerprint({ version: INGESTION_ATTEMPT_CONTRACT_VERSION, ...input }); }

export function createIngestionAttempt(input: Omit<IngestionAttempt, "ingestionAttemptId" | "contractVersion" | "attemptFingerprint"> & { readonly contractVersion?: typeof INGESTION_ATTEMPT_CONTRACT_VERSION }): IngestionAttempt {
  if (input.contractVersion !== undefined && input.contractVersion !== INGESTION_ATTEMPT_CONTRACT_VERSION) throw new Error("M5_INGESTION_ATTEMPT_CONTRACT_INVALID");
  const attemptNumber = integer(input.attemptNumber, "M5_INGESTION_ATTEMPT_NUMBER_INVALID", 1);
  const ingestionRequestId = nonBlank(input.ingestionRequestId, "M5_INGESTION_REQUEST_ID_INVALID");
  const adapterVersion = nonBlank(input.adapterVersion, "M5_INGESTION_ADAPTER_VERSION_INVALID");
  const parserVersion = nonBlank(input.parserVersion, "M5_INGESTION_PARSER_VERSION_INVALID");
  const executionInput = object(input.executionInput, "M5_INGESTION_EXECUTION_INPUT_INVALID");
  const material = { contractVersion: INGESTION_ATTEMPT_CONTRACT_VERSION, ingestionRequestId, attemptNumber, adapterVersion, parserVersion, executionInput };
  return Object.freeze({ ...material, ingestionAttemptId: ingestionAttemptIdFor(ingestionRequestId, attemptNumber), attemptFingerprint: ingestionAttemptFingerprint(material), startedAt: timestamp(input.startedAt, "M5_INGESTION_STARTED_AT_INVALID") });
}

export function assertIngestionAttempt(record: IngestionAttempt): void {
  const validated = createIngestionAttempt(record);
  if (validated.ingestionAttemptId !== record.ingestionAttemptId || validated.attemptFingerprint !== record.attemptFingerprint) throw new Error("M5_INGESTION_ATTEMPT_FINGERPRINT_MISMATCH");
}

function lifecyclePayload(value: unknown): JsonObject { return object(value, "M5_INGESTION_EVENT_PAYLOAD_INVALID"); }

export function lifecycleEventIdFor(attemptId: string, sequence: number): string {
  return `m5-ingestion-event:${digest({ version: INGESTION_EVENT_CONTRACT_VERSION, ingestionAttemptId: nonBlank(attemptId, "M5_INGESTION_ATTEMPT_ID_INVALID"), sequence: integer(sequence, "M5_INGESTION_SEQUENCE_INVALID", 1) })}`;
}

export function lifecycleEventFingerprint(input: Omit<LifecycleEvent, "lifecycleEventId" | "eventFingerprint" | "recordedAt">): string { return fingerprint({ version: INGESTION_EVENT_CONTRACT_VERSION, eventType: input.eventType, payload: input.payload }); }

export function createLifecycleEvent(input: Omit<LifecycleEvent, "lifecycleEventId" | "contractVersion" | "eventFingerprint"> & { readonly contractVersion?: typeof INGESTION_EVENT_CONTRACT_VERSION }): LifecycleEvent {
  if (input.contractVersion !== undefined && input.contractVersion !== INGESTION_EVENT_CONTRACT_VERSION) throw new Error("M5_INGESTION_EVENT_CONTRACT_INVALID");
  const sequence = integer(input.sequence, "M5_INGESTION_SEQUENCE_INVALID", 1);
  if (!new Set<LifecycleEventType>(["STARTED", "SOURCE_OBSERVED", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED"]).has(input.eventType)) throw new Error("M5_INGESTION_EVENT_TYPE_INVALID");
  const payload = lifecyclePayload(input.payload);
  const material = { contractVersion: INGESTION_EVENT_CONTRACT_VERSION, ingestionAttemptId: nonBlank(input.ingestionAttemptId, "M5_INGESTION_ATTEMPT_ID_INVALID"), sequence, eventType: input.eventType, payload } as const;
  return Object.freeze({ ...material, lifecycleEventId: lifecycleEventIdFor(material.ingestionAttemptId, sequence), eventFingerprint: lifecycleEventFingerprint(material), recordedAt: timestamp(input.recordedAt, "M5_INGESTION_RECORDED_AT_INVALID") });
}

export function reduceIngestionLifecycle(events: readonly LifecycleEvent[]): LifecycleState {
  let state: LifecycleState = { status: "NOT_STARTED", nextSequence: 1, events: Object.freeze([]) };
  const byId = new Map<string, LifecycleEvent>();
  const bySequence = new Map<number, LifecycleEvent>();
  for (const event of events) {
    const existingId = byId.get(event.lifecycleEventId);
    if (existingId) {
      if (existingId.eventFingerprint !== event.eventFingerprint) throw new Error("M5_INGESTION_LIFECYCLE_EVENT_CONFLICT");
      continue;
    }
    const existingSequence = bySequence.get(event.sequence);
    if (existingSequence) throw new Error("M5_INGESTION_LIFECYCLE_SEQUENCE_INVALID");
    if (event.sequence !== state.nextSequence) throw new Error("M5_INGESTION_LIFECYCLE_SEQUENCE_INVALID");
    if (event.sequence === 1 && event.eventType !== "STARTED") throw new Error("M5_INGESTION_LIFECYCLE_TRANSITION_INVALID");
    if (event.sequence > 1 && state.status === "NOT_STARTED") throw new Error("M5_INGESTION_LIFECYCLE_TRANSITION_INVALID");
    if (TERMINAL_EVENTS.has(state.status as LifecycleEventType)) throw new Error("M5_INGESTION_LIFECYCLE_TERMINAL_CONFLICT");
    if (event.eventType === "STARTED" && event.sequence !== 1) throw new Error("M5_INGESTION_LIFECYCLE_TRANSITION_INVALID");
    if (event.eventType === "SOURCE_OBSERVED" && state.status !== "OPEN" && state.status !== "SOURCE_OBSERVED") throw new Error("M5_INGESTION_LIFECYCLE_TRANSITION_INVALID");
    if (TERMINAL_EVENTS.has(event.eventType)) {
      state = { status: event.eventType, nextSequence: event.sequence + 1, terminalEvent: event, events: Object.freeze([...state.events, event]) };
    } else {
      state = { status: event.eventType === "STARTED" ? "OPEN" : "SOURCE_OBSERVED", nextSequence: event.sequence + 1, events: Object.freeze([...state.events, event]) };
    }
    byId.set(event.lifecycleEventId, event);
    bySequence.set(event.sequence, event);
  }
  return state;
}

function artifactMaterial(input: Pick<SourceArtifact, "providerId" | "datasetId" | "datasetVersion" | "providerSourceNamespace" | "providerExternalRecordId" | "providerRevision">): JsonObject { return { version: SOURCE_ARTIFACT_CONTRACT_VERSION, providerId: input.providerId, datasetId: input.datasetId, datasetVersion: input.datasetVersion, providerSourceNamespace: input.providerSourceNamespace, providerExternalRecordId: input.providerExternalRecordId, providerRevision: input.providerRevision ?? null }; }
export function sourceArtifactIdFor(input: Pick<SourceArtifact, "providerId" | "datasetId" | "datasetVersion" | "providerSourceNamespace" | "providerExternalRecordId" | "providerRevision">): string { return `m5-source-artifact:${digest(artifactMaterial(input))}`; }
export function sourceArtifactFingerprint(input: Pick<SourceArtifact, "providerId" | "datasetId" | "datasetVersion" | "providerSourceNamespace" | "providerExternalRecordId" | "providerRevision" | "payloadFingerprint">): string { return fingerprint({ ...artifactMaterial(input), payloadFingerprint: nonBlank(input.payloadFingerprint, "M5_INGESTION_PAYLOAD_FINGERPRINT_INVALID") }); }

export function createSourceArtifact(input: Omit<SourceArtifact, "sourceArtifactId" | "contractVersion" | "sourceArtifactFingerprint"> & { readonly contractVersion?: typeof SOURCE_ARTIFACT_CONTRACT_VERSION }): SourceArtifact {
  if (input.contractVersion !== undefined && input.contractVersion !== SOURCE_ARTIFACT_CONTRACT_VERSION) throw new Error("M5_SOURCE_ARTIFACT_CONTRACT_INVALID");
  const material = { providerId: nonBlank(input.providerId, "M5_INGESTION_PROVIDER_INVALID"), datasetId: nonBlank(input.datasetId, "M5_INGESTION_DATASET_INVALID"), datasetVersion: nonBlank(input.datasetVersion, "M5_INGESTION_DATASET_VERSION_INVALID"), providerSourceNamespace: nonBlank(input.providerSourceNamespace, "M5_INGESTION_SOURCE_NAMESPACE_INVALID"), providerExternalRecordId: nonBlank(input.providerExternalRecordId, "M5_INGESTION_EXTERNAL_RECORD_ID_INVALID"), ...(input.providerRevision === undefined ? {} : { providerRevision: nonBlank(input.providerRevision, "M5_INGESTION_PROVIDER_REVISION_INVALID") }), payloadFingerprint: nonBlank(input.payloadFingerprint, "M5_INGESTION_PAYLOAD_FINGERPRINT_INVALID") } as const;
  return Object.freeze({ ...material, sourceArtifactId: sourceArtifactIdFor(material), contractVersion: SOURCE_ARTIFACT_CONTRACT_VERSION, sourceArtifactFingerprint: sourceArtifactFingerprint(material), recordedAt: timestamp(input.recordedAt, "M5_INGESTION_RECORDED_AT_INVALID") });
}

export function assertSourceArtifact(record: SourceArtifact): void { const validated = createSourceArtifact(record); if (validated.sourceArtifactId !== record.sourceArtifactId || validated.sourceArtifactFingerprint !== record.sourceArtifactFingerprint) throw new Error("M5_SOURCE_ARTIFACT_FINGERPRINT_MISMATCH"); }

function envelopeMaterial(input: Pick<SourceEnvelope, "sourceArtifactId" | "parserContractVersion" | "envelopeSchemaVersion" | "normalizedEnvelope" | "selectedAuditableFields" | "payloadFingerprint" | "providerPublishedAt" | "observedAt" | "temporalQualityStatus" | "temporalDiagnosticCodes">): unknown { return { version: SOURCE_ENVELOPE_CONTRACT_VERSION, sourceArtifactId: input.sourceArtifactId, parserContractVersion: input.parserContractVersion, envelopeSchemaVersion: input.envelopeSchemaVersion, normalizedEnvelope: input.normalizedEnvelope, selectedAuditableFields: input.selectedAuditableFields, payloadFingerprint: input.payloadFingerprint, ...(input.providerPublishedAt === undefined ? {} : { providerPublishedAt: input.providerPublishedAt }), observedAt: input.observedAt, temporalQualityStatus: input.temporalQualityStatus, temporalDiagnosticCodes: [...input.temporalDiagnosticCodes].sort() }; }
export function sourceEnvelopeIdFor(input: Pick<SourceEnvelope, "sourceArtifactId" | "parserContractVersion" | "envelopeSchemaVersion">): string { return `m5-source-envelope:${digest({ version: SOURCE_ENVELOPE_CONTRACT_VERSION, sourceArtifactId: input.sourceArtifactId, parserContractVersion: nonBlank(input.parserContractVersion, "M5_INGESTION_PARSER_VERSION_INVALID"), envelopeSchemaVersion: nonBlank(input.envelopeSchemaVersion, "M5_INGESTION_ENVELOPE_SCHEMA_INVALID") })}`; }
export function sourceEnvelopeFingerprint(input: Pick<SourceEnvelope, "sourceArtifactId" | "parserContractVersion" | "envelopeSchemaVersion" | "normalizedEnvelope" | "selectedAuditableFields" | "payloadFingerprint" | "providerPublishedAt" | "observedAt" | "temporalQualityStatus" | "temporalDiagnosticCodes">): string { return fingerprint(envelopeMaterial(input)); }

export function createSourceEnvelope(input: Omit<SourceEnvelope, "sourceEnvelopeId" | "contractVersion" | "sourceEnvelopeFingerprint"> & { readonly contractVersion?: typeof SOURCE_ENVELOPE_CONTRACT_VERSION }): SourceEnvelope {
  if (input.contractVersion !== undefined && input.contractVersion !== SOURCE_ENVELOPE_CONTRACT_VERSION) throw new Error("M5_SOURCE_ENVELOPE_CONTRACT_INVALID");
  const observedAt = timestamp(input.observedAt, "M5_INGESTION_OBSERVED_AT_INVALID");
  const providerPublishedAt = input.providerPublishedAt === undefined ? undefined : timestamp(input.providerPublishedAt, "M5_INGESTION_PUBLISHED_AT_INVALID");
  if (input.temporalQualityStatus !== "RESOLVED" && input.temporalQualityStatus !== "QUARANTINED") throw new Error("M5_INGESTION_TEMPORAL_STATUS_INVALID");
  const temporalDiagnosticCodes = Object.freeze([...new Set(input.temporalDiagnosticCodes.map(code => nonBlank(code, "M5_INGESTION_TEMPORAL_DIAGNOSTIC_INVALID", 128)))].sort());
  if (input.temporalQualityStatus === "QUARANTINED" && temporalDiagnosticCodes.length === 0) throw new Error("M5_INGESTION_TEMPORAL_DIAGNOSTIC_INVALID");
  if (input.temporalQualityStatus === "RESOLVED" && temporalDiagnosticCodes.length > 0) throw new Error("M5_INGESTION_TEMPORAL_STATUS_INVALID");
  const material = { sourceArtifactId: nonBlank(input.sourceArtifactId, "M5_INGESTION_SOURCE_ARTIFACT_ID_INVALID"), parserContractVersion: nonBlank(input.parserContractVersion, "M5_INGESTION_PARSER_VERSION_INVALID"), envelopeSchemaVersion: nonBlank(input.envelopeSchemaVersion, "M5_INGESTION_ENVELOPE_SCHEMA_INVALID"), normalizedEnvelope: object(input.normalizedEnvelope, "M5_INGESTION_ENVELOPE_INVALID"), selectedAuditableFields: object(input.selectedAuditableFields, "M5_INGESTION_AUDIT_FIELDS_INVALID"), payloadFingerprint: nonBlank(input.payloadFingerprint, "M5_INGESTION_PAYLOAD_FINGERPRINT_INVALID"), ...(providerPublishedAt === undefined ? {} : { providerPublishedAt }), observedAt, temporalQualityStatus: input.temporalQualityStatus, temporalDiagnosticCodes } as const;
  return Object.freeze({ ...material, sourceEnvelopeId: sourceEnvelopeIdFor(material), contractVersion: SOURCE_ENVELOPE_CONTRACT_VERSION, sourceEnvelopeFingerprint: sourceEnvelopeFingerprint(material), recordedAt: timestamp(input.recordedAt, "M5_INGESTION_RECORDED_AT_INVALID") });
}

export function assertSourceEnvelope(record: SourceEnvelope): void { const validated = createSourceEnvelope(record); if (validated.sourceEnvelopeId !== record.sourceEnvelopeId || validated.sourceEnvelopeFingerprint !== record.sourceEnvelopeFingerprint) throw new Error("M5_SOURCE_ENVELOPE_FINGERPRINT_MISMATCH"); }

export function sourceObservationIdFor(input: Pick<SourceObservation, "ingestionAttemptId" | "sourceArtifactId" | "responsePageOrdinal" | "itemOrdinal">): string { return `m5-source-observation:${digest({ version: SOURCE_OBSERVATION_CONTRACT_VERSION, ingestionAttemptId: input.ingestionAttemptId, sourceArtifactId: input.sourceArtifactId, responsePageOrdinal: input.responsePageOrdinal, itemOrdinal: input.itemOrdinal })}`; }
export function sourceObservationFingerprint(input: Pick<SourceObservation, "ingestionAttemptId" | "sourceArtifactId" | "responsePageOrdinal" | "itemOrdinal" | "retrievedAt" | "metadata">): string { return fingerprint({ version: SOURCE_OBSERVATION_CONTRACT_VERSION, ...input }); }

export function createSourceObservation(input: Omit<SourceObservation, "sourceObservationId" | "contractVersion" | "observationFingerprint"> & { readonly contractVersion?: typeof SOURCE_OBSERVATION_CONTRACT_VERSION }): SourceObservation {
  if (input.contractVersion !== undefined && input.contractVersion !== SOURCE_OBSERVATION_CONTRACT_VERSION) throw new Error("M5_SOURCE_OBSERVATION_CONTRACT_INVALID");
  const retrievedAt = timestamp(input.retrievedAt, "M5_INGESTION_RETRIEVED_AT_INVALID");
  const recordedAt = timestamp(input.recordedAt, "M5_INGESTION_RECORDED_AT_INVALID");
  if (retrievedAt > recordedAt) throw new Error("M5_INGESTION_RETRIEVED_AFTER_RECORDED");
  const metadata = safeMetadata(input.metadata);
  if (metadata.pageOrdinal !== input.responsePageOrdinal) throw new Error("M5_INGESTION_PAGE_ORDINAL_MISMATCH");
  const material = { ingestionAttemptId: nonBlank(input.ingestionAttemptId, "M5_INGESTION_ATTEMPT_ID_INVALID"), sourceArtifactId: nonBlank(input.sourceArtifactId, "M5_INGESTION_SOURCE_ARTIFACT_ID_INVALID"), responsePageOrdinal: integer(input.responsePageOrdinal, "M5_INGESTION_PAGE_ORDINAL_INVALID"), itemOrdinal: integer(input.itemOrdinal, "M5_INGESTION_ITEM_ORDINAL_INVALID"), retrievedAt, metadata } as const;
  return Object.freeze({ ...material, sourceObservationId: sourceObservationIdFor(material), contractVersion: SOURCE_OBSERVATION_CONTRACT_VERSION, observationFingerprint: sourceObservationFingerprint(material), recordedAt });
}

export function assertSourceObservation(record: SourceObservation): void { const validated = createSourceObservation(record); if (validated.sourceObservationId !== record.sourceObservationId || validated.observationFingerprint !== record.observationFingerprint) throw new Error("M5_SOURCE_OBSERVATION_FINGERPRINT_MISMATCH"); }

export function availabilityClaimIdFor(input: Pick<AvailabilityClaim, "sourceEnvelopeId" | "sourceObservationId" | "basis">): string { return `m5-availability-claim:${digest({ version: AVAILABILITY_CLAIM_CONTRACT_VERSION, sourceEnvelopeId: input.sourceEnvelopeId, sourceObservationId: input.sourceObservationId, basis: input.basis })}`; }
export function availabilityClaimFingerprint(input: Pick<AvailabilityClaim, "sourceEnvelopeId" | "sourceObservationId" | "basis" | "effectiveAvailableAt">): string { return fingerprint({ version: AVAILABILITY_CLAIM_CONTRACT_VERSION, sourceEnvelopeId: input.sourceEnvelopeId, sourceObservationId: input.sourceObservationId, basis: input.basis, effectiveAvailableAt: input.effectiveAvailableAt }); }

export function createRetrievalAvailabilityClaim(input: { readonly envelope: SourceEnvelope; readonly observation: SourceObservation; readonly recordedAt: string }): AvailabilityClaim {
  assertSourceEnvelope(input.envelope); assertSourceObservation(input.observation);
  if (input.envelope.sourceArtifactId !== input.observation.sourceArtifactId) throw new Error("M5_INGESTION_AVAILABILITY_ARTIFACT_MISMATCH");
  if (input.envelope.temporalQualityStatus !== "RESOLVED") throw new Error("M5_INGESTION_TEMPORAL_QUALITY_UNRESOLVED");
  if (input.envelope.observedAt > input.observation.retrievedAt) throw new Error("M5_INGESTION_OBSERVED_AFTER_RETRIEVED");
  const recordedAt = timestamp(input.recordedAt, "M5_INGESTION_RECORDED_AT_INVALID");
  if (input.observation.retrievedAt > recordedAt) throw new Error("M5_INGESTION_RETRIEVED_AFTER_RECORDED");
  const material = { sourceEnvelopeId: input.envelope.sourceEnvelopeId, sourceObservationId: input.observation.sourceObservationId, contractVersion: AVAILABILITY_CLAIM_CONTRACT_VERSION, basis: "RETRIEVAL_OBSERVED" as const, effectiveAvailableAt: input.observation.retrievedAt };
  return Object.freeze({ ...material, availabilityClaimId: availabilityClaimIdFor(material), claimFingerprint: availabilityClaimFingerprint(material), recordedAt });
}

export function assertAvailabilityClaim(record: AvailabilityClaim): void {
  if (record.basis !== "RETRIEVAL_OBSERVED") throw new Error("M5_INGESTION_AVAILABILITY_CLAIM_INVALID");
  const sourceEnvelopeId = nonBlank(record.sourceEnvelopeId, "M5_INGESTION_SOURCE_ENVELOPE_ID_INVALID");
  const sourceObservationId = nonBlank(record.sourceObservationId, "M5_INGESTION_SOURCE_OBSERVATION_ID_INVALID");
  const effectiveAvailableAt = timestamp(record.effectiveAvailableAt, "M5_INGESTION_AVAILABLE_AT_INVALID");
  const recordedAt = timestamp(record.recordedAt, "M5_INGESTION_RECORDED_AT_INVALID");
  const material = { sourceEnvelopeId, sourceObservationId, basis: record.basis, effectiveAvailableAt } as const;
  if (record.availabilityClaimId !== availabilityClaimIdFor(material) || record.claimFingerprint !== availabilityClaimFingerprint(material)) throw new Error("M5_INGESTION_AVAILABILITY_CLAIM_FINGERPRINT_MISMATCH");
  if (effectiveAvailableAt > recordedAt) throw new Error("M5_INGESTION_AVAILABLE_AFTER_RECORDED");
}

export function normalizeSafeMetadata(input: SafePaginationMetadata): SafePaginationMetadata { return safeMetadata(input); }
