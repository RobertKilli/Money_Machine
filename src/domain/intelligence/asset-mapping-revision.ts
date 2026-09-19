import { createHash } from "node:crypto";

export const ASSET_MAPPING_REVISION_VERSION = "m5-asset-mapping-revision/v1";

export interface AssetMappingRevision {
  readonly mappingRevisionId: string;
  readonly mappingRevisionVersion: string;
  readonly providerId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly sourceLineageId: string;
  readonly providerAssetIdentityAssertionId: string;
  readonly providerAssetNamespace: string;
  readonly providerAssetId: string;
  readonly canonicalAssetId: string;
  readonly canonicalIdentifier: string;
  readonly assetClass: string;
  readonly validFrom: string;
  readonly validTo?: string;
  readonly observedAt: string;
  readonly availableAt: string;
  readonly sourceRecordIds: readonly string[];
  readonly payloadFingerprint: string;
  readonly fingerprint: string;
  readonly recordedAt: string;
}

export type AssetMappingRevisionInput = Omit<AssetMappingRevision, "mappingRevisionId" | "fingerprint"> & {
  readonly mappingRevisionId?: string;
  readonly fingerprint?: string;
};

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const forbiddenNamespaces = new Set(["TICKER", "SYMBOL"]);

function nonBlank(value: unknown, code: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(code);
  return value.trim();
}

function timestamp(value: unknown, code: string): string {
  const normalized = nonBlank(value, code);
  if (!UTC_TIMESTAMP.test(normalized) || Number.isNaN(Date.parse(normalized)) || new Date(normalized).toISOString() !== normalized) throw new Error(code);
  return normalized;
}

function sourceIds(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values) || values.length === 0) throw new Error("M5_MAPPING_SOURCE_RECORDS_INVALID");
  const normalized = [...new Set(values.map(value => nonBlank(value, "M5_MAPPING_SOURCE_RECORDS_INVALID")))].sort((left, right) => left.localeCompare(right));
  if (normalized.length === 0) throw new Error("M5_MAPPING_SOURCE_RECORDS_INVALID");
  return Object.freeze(normalized);
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalize(item)]));
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

function material(input: AssetMappingRevisionInput): Omit<AssetMappingRevision, "mappingRevisionId" | "fingerprint" | "recordedAt"> {
  const providerAssetNamespace = nonBlank(input.providerAssetNamespace, "M5_MAPPING_PROVIDER_NAMESPACE_INVALID");
  if (forbiddenNamespaces.has(providerAssetNamespace.toUpperCase())) throw new Error("M5_MAPPING_TICKER_ONLY_IDENTITY");
  const assetClass = nonBlank(input.assetClass, "M5_MAPPING_ASSET_CLASS_INVALID");
  if (assetClass.toUpperCase() === "UNKNOWN") throw new Error("M5_MAPPING_ASSET_CLASS_UNKNOWN");
  const validFrom = timestamp(input.validFrom, "M5_MAPPING_VALID_FROM_INVALID");
  const validTo = input.validTo === undefined ? undefined : timestamp(input.validTo, "M5_MAPPING_VALID_TO_INVALID");
  if (validTo !== undefined && validTo <= validFrom) throw new Error("M5_MAPPING_INTERVAL_INVALID");
  const observedAt = timestamp(input.observedAt, "M5_MAPPING_OBSERVED_AT_INVALID");
  const availableAt = timestamp(input.availableAt, "M5_MAPPING_AVAILABLE_AT_INVALID");
  if (observedAt > availableAt) throw new Error("M5_MAPPING_TEMPORAL_ORDER_INVALID");
  return Object.freeze({
    mappingRevisionVersion: nonBlank(input.mappingRevisionVersion, "M5_MAPPING_VERSION_INVALID"),
    providerId: nonBlank(input.providerId, "M5_MAPPING_PROVIDER_INVALID"),
    datasetId: nonBlank(input.datasetId, "M5_MAPPING_DATASET_INVALID"),
    datasetVersion: nonBlank(input.datasetVersion, "M5_MAPPING_DATASET_VERSION_INVALID"),
    sourceLineageId: nonBlank(input.sourceLineageId, "M5_MAPPING_SOURCE_LINEAGE_ID_INVALID"),
    providerAssetIdentityAssertionId: nonBlank(input.providerAssetIdentityAssertionId, "M5_MAPPING_PROVIDER_ASSET_IDENTITY_ASSERTION_ID_INVALID"),
    providerAssetNamespace,
    providerAssetId: nonBlank(input.providerAssetId, "M5_MAPPING_PROVIDER_ASSET_ID_INVALID"),
    canonicalAssetId: nonBlank(input.canonicalAssetId, "M5_MAPPING_CANONICAL_ASSET_INVALID"),
    canonicalIdentifier: nonBlank(input.canonicalIdentifier, "M5_MAPPING_CANONICAL_IDENTIFIER_INVALID"),
    assetClass,
    validFrom,
    ...(validTo === undefined ? {} : { validTo }),
    observedAt,
    availableAt,
    sourceRecordIds: sourceIds(input.sourceRecordIds),
    payloadFingerprint: nonBlank(input.payloadFingerprint, "M5_MAPPING_PAYLOAD_FINGERPRINT_INVALID"),
  });
}

export function mappingRevisionIdFor(input: Pick<AssetMappingRevisionInput, "mappingRevisionVersion" | "providerId" | "datasetId" | "datasetVersion" | "providerAssetNamespace" | "providerAssetId">): string {
  return `m5-mapping:${digest({ version: ASSET_MAPPING_REVISION_VERSION, mappingRevisionVersion: input.mappingRevisionVersion, providerId: input.providerId, datasetId: input.datasetId, datasetVersion: input.datasetVersion, providerAssetNamespace: input.providerAssetNamespace, providerAssetId: input.providerAssetId })}`;
}

export function assetMappingRevisionFingerprint(input: Omit<AssetMappingRevision, "fingerprint" | "recordedAt">): string {
  return digest({ version: ASSET_MAPPING_REVISION_VERSION, ...input });
}

export function createAssetMappingRevision(input: AssetMappingRevisionInput): AssetMappingRevision {
  const body = material(input);
  const mappingRevisionId = mappingRevisionIdFor(body);
  if (input.mappingRevisionId !== undefined && nonBlank(input.mappingRevisionId, "M5_MAPPING_ID_INVALID") !== mappingRevisionId) throw new Error("M5_MAPPING_ID_MISMATCH");
  const fingerprint = assetMappingRevisionFingerprint({ ...body, mappingRevisionId });
  if (input.fingerprint !== undefined && nonBlank(input.fingerprint, "M5_MAPPING_FINGERPRINT_INVALID") !== fingerprint) throw new Error("M5_MAPPING_FINGERPRINT_MISMATCH");
  return Object.freeze({ ...body, mappingRevisionId, fingerprint, recordedAt: timestamp(input.recordedAt, "M5_MAPPING_RECORDED_AT_INVALID") });
}

export function assertAssetMappingRevision(record: AssetMappingRevision): void {
  const validated = createAssetMappingRevision(record);
  if (validated.fingerprint !== record.fingerprint) throw new Error("M5_MAPPING_FINGERPRINT_MISMATCH");
}
