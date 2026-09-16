import {
  INGESTION_FIXTURE_VERSION,
  createSourceArtifact,
  createSourceEnvelope,
  createSourceObservation,
  assertIngestionRequest,
  assertIngestionAttempt,
  normalizeIngestionTimestamp,
  normalizeSafeMetadata,
  type JsonObject,
  type SourceArtifact,
  type SourceEnvelope,
  type SourceObservation,
  type SafePaginationMetadata,
  type IngestionRequest,
  type IngestionAttempt,
} from "@/domain/intelligence/ingestion-provenance";

export type FixtureParseDiagnostic = Readonly<{
  code: string;
  path?: string;
  sourceArtifactId?: string;
}>;

export type M5IngestionFixtureParseResult = Readonly<{
  fixtureVersion: typeof INGESTION_FIXTURE_VERSION;
  artifacts: readonly SourceArtifact[];
  envelopes: readonly SourceEnvelope[];
  observations: readonly SourceObservation[];
  duplicateArtifactIds: readonly string[];
  diagnostics: readonly FixtureParseDiagnostic[];
}>;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function record(value: unknown, code: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(code);
  return value;
}

function exactKeys(value: UnknownRecord, keys: readonly string[], code: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(code);
}

function requiredString(value: unknown, code: string, max = 512): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(code);
  return value.trim();
}

function optionalString(value: unknown, code: string, max = 512): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, code, max);
}

function requiredInteger(value: unknown, code: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(code);
  return value as number;
}

function jsonObject(value: unknown, code: string): JsonObject {
  if (!isRecord(value)) throw new Error(code);
  return value as JsonObject;
}

function parsePageMetadata(value: unknown): SafePaginationMetadata {
  const item = record(value, "M5_FIXTURE_PAGE_METADATA_INVALID");
  exactKeys(item, ["pageOrdinal", "cursorSafety", "cursor", "cursorHash", "responseUrl", "correlationId"], "M5_FIXTURE_PAGE_METADATA_UNKNOWN_FIELD");
  return normalizeSafeMetadata({
    pageOrdinal: requiredInteger(item.pageOrdinal, "M5_FIXTURE_PAGE_ORDINAL_INVALID"),
    cursorSafety: item.cursorSafety === "NONE" || item.cursorSafety === "HASHED" ? item.cursorSafety : item.cursorSafety === "SAFE" ? (() => { throw new Error("M5_FIXTURE_CURSOR_UNTRUSTED"); })() : (() => { throw new Error("M5_FIXTURE_CURSOR_SAFETY_INVALID"); })(),
    ...(item.cursor === undefined ? {} : { cursor: requiredString(item.cursor, "M5_FIXTURE_CURSOR_INVALID", 256) }),
    ...(item.cursorHash === undefined ? {} : { cursorHash: requiredString(item.cursorHash, "M5_FIXTURE_CURSOR_HASH_INVALID", 128) }),
    ...(item.responseUrl === undefined ? {} : { responseHostPath: requiredString(item.responseUrl, "M5_FIXTURE_RESPONSE_URL_INVALID", 2048) }),
    ...(item.correlationId === undefined ? {} : { correlationId: requiredString(item.correlationId, "M5_FIXTURE_CORRELATION_INVALID", 128) }),
  } as SafePaginationMetadata);
}

function parseRecord(value: unknown): UnknownRecord {
  const item = record(value, "M5_FIXTURE_RECORD_INVALID");
  exactKeys(item, ["providerExternalRecordId", "providerRevision", "payloadFingerprint", "normalizedEnvelope", "selectedAuditableFields", "providerPublishedAt", "observedAt", "itemOrdinal"], "M5_FIXTURE_RECORD_UNKNOWN_FIELD");
  return item;
}

export function parseM5IngestionFixture(input: unknown, options: { readonly request: IngestionRequest; readonly attempt: IngestionAttempt; readonly recordedAt: string; readonly retrievedAt: string }): M5IngestionFixtureParseResult {
  assertIngestionRequest(options.request);
  assertIngestionAttempt(options.attempt);
  if (options.attempt.ingestionRequestId !== options.request.ingestionRequestId) throw new Error("M5_FIXTURE_ATTEMPT_REQUEST_MISMATCH");
  const retrievedAt = normalizeIngestionTimestamp(options.retrievedAt, "M5_FIXTURE_RETRIEVED_AT_INVALID");
  const recordedAt = normalizeIngestionTimestamp(options.recordedAt, "M5_FIXTURE_RECORDED_AT_INVALID");
  if (retrievedAt > recordedAt) throw new Error("M5_FIXTURE_RETRIEVED_AFTER_RECORDED");
  const root = record(input, "M5_FIXTURE_SCHEMA_INVALID");
  exactKeys(root, ["fixtureVersion", "providerId", "datasetId", "datasetVersion", "providerSourceNamespace", "parserContractVersion", "envelopeSchemaVersion", "pageMetadata", "records"], "M5_FIXTURE_UNKNOWN_FIELD");
  if (root.fixtureVersion !== INGESTION_FIXTURE_VERSION) throw new Error("M5_FIXTURE_SCHEMA_VERSION_INVALID");
  const providerId = requiredString(root.providerId, "M5_FIXTURE_PROVIDER_INVALID");
  const datasetId = requiredString(root.datasetId, "M5_FIXTURE_DATASET_INVALID");
  const datasetVersion = requiredString(root.datasetVersion, "M5_FIXTURE_DATASET_VERSION_INVALID");
  const providerSourceNamespace = requiredString(root.providerSourceNamespace, "M5_FIXTURE_SOURCE_NAMESPACE_INVALID");
  const parserContractVersion = requiredString(root.parserContractVersion, "M5_FIXTURE_PARSER_VERSION_INVALID");
  if (providerId !== options.request.providerId) throw new Error("M5_FIXTURE_REQUEST_PROVIDER_MISMATCH");
  if (datasetId !== options.request.datasetId) throw new Error("M5_FIXTURE_REQUEST_DATASET_MISMATCH");
  if (datasetVersion !== options.request.datasetVersion) throw new Error("M5_FIXTURE_REQUEST_DATASET_VERSION_MISMATCH");
  if (providerSourceNamespace !== options.request.providerSourceNamespace) throw new Error("M5_FIXTURE_REQUEST_SOURCE_NAMESPACE_MISMATCH");
  if (parserContractVersion !== options.request.parserContractVersion || options.attempt.parserVersion !== options.request.parserContractVersion) throw new Error("M5_FIXTURE_REQUEST_PARSER_MISMATCH");
  if (options.attempt.adapterVersion !== options.request.adapterContractVersion) throw new Error("M5_FIXTURE_REQUEST_ADAPTER_MISMATCH");
  const envelopeSchemaVersion = requiredString(root.envelopeSchemaVersion, "M5_FIXTURE_ENVELOPE_SCHEMA_INVALID");
  if (envelopeSchemaVersion !== options.request.envelopeSchemaVersion) throw new Error("M5_FIXTURE_REQUEST_ENVELOPE_SCHEMA_MISMATCH");
  const pageMetadata = parsePageMetadata(root.pageMetadata);
  if (!Array.isArray(root.records)) throw new Error("M5_FIXTURE_RECORDS_INVALID");
  const artifacts = new Map<string, SourceArtifact>();
  const envelopes = new Map<string, SourceEnvelope>();
  const observations: SourceObservation[] = [];
  const duplicateArtifactIds = new Set<string>();

  root.records.forEach(value => {
    const item = parseRecord(value);
    const providerExternalRecordId = requiredString(item.providerExternalRecordId, "M5_FIXTURE_EXTERNAL_RECORD_ID_INVALID");
    const providerRevision = optionalString(item.providerRevision, "M5_FIXTURE_PROVIDER_REVISION_INVALID");
    const payloadFingerprint = requiredString(item.payloadFingerprint, "M5_FIXTURE_PAYLOAD_FINGERPRINT_INVALID");
    const artifact = createSourceArtifact({ providerId, datasetId, datasetVersion, providerSourceNamespace, providerExternalRecordId, ...(providerRevision === undefined ? {} : { providerRevision }), payloadFingerprint, recordedAt });
    const existingArtifact = artifacts.get(artifact.sourceArtifactId);
    if (existingArtifact) {
      if (existingArtifact.sourceArtifactFingerprint !== artifact.sourceArtifactFingerprint) throw new Error("M5_INGESTION_FIXTURE_CONFLICT");
      duplicateArtifactIds.add(artifact.sourceArtifactId);
    } else artifacts.set(artifact.sourceArtifactId, artifact);
    const providerPublishedAt = item.providerPublishedAt === undefined ? undefined : requiredString(item.providerPublishedAt, "M5_FIXTURE_PUBLISHED_AT_INVALID");
    const observedAt = requiredString(item.observedAt, "M5_FIXTURE_OBSERVED_AT_INVALID");
    const temporalStatus = providerPublishedAt !== undefined && providerPublishedAt > options.retrievedAt ? "QUARANTINED" : observedAt > options.retrievedAt ? "QUARANTINED" : "RESOLVED";
    const temporalCodes = temporalStatus === "QUARANTINED" ? Object.freeze([providerPublishedAt !== undefined && providerPublishedAt > options.retrievedAt ? "M5_INGESTION_PROVIDER_CLOCK_SKEW" : "M5_INGESTION_OBSERVED_AFTER_RETRIEVED"]) : Object.freeze([]);
    const envelope = createSourceEnvelope({ sourceArtifactId: artifact.sourceArtifactId, parserContractVersion, envelopeSchemaVersion, normalizedEnvelope: jsonObject(item.normalizedEnvelope, "M5_FIXTURE_ENVELOPE_INVALID"), selectedAuditableFields: jsonObject(item.selectedAuditableFields, "M5_FIXTURE_AUDIT_FIELDS_INVALID"), payloadFingerprint, ...(providerPublishedAt === undefined ? {} : { providerPublishedAt }), observedAt, temporalQualityStatus: temporalStatus, temporalDiagnosticCodes: temporalCodes, recordedAt });
    const existingEnvelope = envelopes.get(envelope.sourceEnvelopeId);
    if (existingEnvelope && existingEnvelope.sourceEnvelopeFingerprint !== envelope.sourceEnvelopeFingerprint) throw new Error("M5_INGESTION_FIXTURE_CONFLICT");
    envelopes.set(envelope.sourceEnvelopeId, envelope);
    const itemOrdinal = requiredInteger(item.itemOrdinal, "M5_FIXTURE_ITEM_ORDINAL_INVALID");
    observations.push(createSourceObservation({ ingestionAttemptId: options.attempt.ingestionAttemptId, sourceArtifactId: artifact.sourceArtifactId, responsePageOrdinal: pageMetadata.pageOrdinal, itemOrdinal, retrievedAt, metadata: pageMetadata, recordedAt }));
  });

  observations.sort((a, b) => a.responsePageOrdinal - b.responsePageOrdinal || a.itemOrdinal - b.itemOrdinal || a.sourceArtifactId.localeCompare(b.sourceArtifactId));
  return Object.freeze({ fixtureVersion: INGESTION_FIXTURE_VERSION, artifacts: Object.freeze([...artifacts.values()].sort((a, b) => a.sourceArtifactId.localeCompare(b.sourceArtifactId))), envelopes: Object.freeze([...envelopes.values()].sort((a, b) => a.sourceEnvelopeId.localeCompare(b.sourceEnvelopeId))), observations: Object.freeze(observations), duplicateArtifactIds: Object.freeze([...duplicateArtifactIds].sort()), diagnostics: Object.freeze([]) });
}
