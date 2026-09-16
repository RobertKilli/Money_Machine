import { createHash } from "node:crypto";
import { M5_EVIDENCE_MANIFEST_VERSION, normalizeM5EvidenceManifest, normalizeM5EvidenceSemanticCompatibility, type M5DatasetPin, type M5EvidenceManifest, type M5EvidenceSemanticCompatibility } from "@/application/intelligence/assemble-m5-evidence";
import { canonicalContextIdForProducerContext, normalizeProducerDatasetPins, validateCanonicalProducerSourceContext, type CanonicalProducerSourceContext } from "@/application/intelligence/canonical-producer-context";
import { normalizeM5DatasetPinValues, type M5DatasetPinValue } from "@/domain/intelligence/m5-dataset-pin";

export const M5_MANIFEST_AUTHORITY_TYPE = "CONFIGURED" as const;
export const M5_MANIFEST_AUTHORITY_VERSION = "m5-manifest-authority/v1";

export interface M5ManifestAuthorityRecord {
  readonly manifestAuthorityId: string;
  readonly authorityType: typeof M5_MANIFEST_AUTHORITY_TYPE;
  readonly authorityVersion: string;
  readonly candidateId: string;
  readonly assetId: string;
  readonly canonicalIdentifier: string;
  readonly assetClass: string;
  readonly canonicalContextId: string;
  readonly asOf: string;
  readonly manifestSchemaVersion: typeof M5_EVIDENCE_MANIFEST_VERSION;
  readonly manifest: M5EvidenceManifest;
  readonly compatibility: M5EvidenceSemanticCompatibility;
  readonly allowedDatasetPins: readonly M5DatasetPinValue[];
  readonly fingerprint: string;
  readonly createdAt: Date;
}

export interface CreateM5ManifestAuthorityInput {
  readonly sourceContext: CanonicalProducerSourceContext;
  readonly authorityVersion: string;
  readonly manifest: M5EvidenceManifest;
  readonly compatibility: M5EvidenceSemanticCompatibility;
  readonly allowedDatasetPins: readonly M5DatasetPin[];
  readonly createdAt?: Date;
}

const nonBlank = (value: unknown, code: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
};

const validDate = (value: Date, code: string): Date => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error(code);
  return new Date(value.getTime());
};

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  return value;
};

const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");

export function m5ManifestAuthorityIdFor(canonicalContextId: string, authorityVersion: string): string {
  return `m5-manifest-authority:${digest({ canonicalContextId: nonBlank(canonicalContextId, "M5_MANIFEST_AUTHORITY_CONTEXT_INVALID"), authorityVersion: nonBlank(authorityVersion, "M5_MANIFEST_AUTHORITY_VERSION_INVALID") })}`;
}

function authorityMaterial(record: Omit<M5ManifestAuthorityRecord, "manifestAuthorityId" | "fingerprint" | "createdAt">): unknown {
  return {
    authorityType: record.authorityType,
    authorityVersion: record.authorityVersion,
    candidateId: record.candidateId,
    assetId: record.assetId,
    canonicalIdentifier: record.canonicalIdentifier,
    assetClass: record.assetClass,
    canonicalContextId: record.canonicalContextId,
    asOf: record.asOf,
    manifestSchemaVersion: record.manifestSchemaVersion,
    manifest: record.manifest,
    compatibility: record.compatibility,
    allowedDatasetPins: record.allowedDatasetPins,
  };
}

export function m5ManifestAuthorityFingerprint(record: Omit<M5ManifestAuthorityRecord, "manifestAuthorityId" | "fingerprint" | "createdAt">): string {
  return digest(authorityMaterial(record));
}

function normalizedPins(values: readonly M5DatasetPin[]): readonly M5DatasetPinValue[] {
  return normalizeM5DatasetPinValues(values).map(value => Object.freeze({ ...value }));
}

function pinsMatchSource(sourceContext: CanonicalProducerSourceContext, allowed: readonly M5DatasetPinValue[]): void {
  const source = normalizeProducerDatasetPins(sourceContext.providerDatasetPins);
  const identity = (value: { readonly providerId: string; readonly datasetVersion: string }): string => `${value.providerId}\u0000${value.datasetVersion}`;
  const allowedIdentities = new Set(allowed.map(identity));
  if (allowed.some(value => !source.some(pin => identity(pin) === identity(value))) || source.some(value => !allowedIdentities.has(identity(value)))) throw new Error("M5_MANIFEST_AUTHORITY_PINS_SOURCE_MISMATCH");
}

export function createM5ManifestAuthority(input: CreateM5ManifestAuthorityInput): M5ManifestAuthorityRecord {
  const sourceContext = validateCanonicalProducerSourceContext(input.sourceContext);
  const authorityVersion = nonBlank(input.authorityVersion, "M5_MANIFEST_AUTHORITY_VERSION_INVALID");
  const manifest = normalizeM5EvidenceManifest(input.manifest);
  const compatibility = normalizeM5EvidenceSemanticCompatibility(input.compatibility);
  const allowedDatasetPins = normalizedPins(input.allowedDatasetPins);
  pinsMatchSource(sourceContext, allowedDatasetPins);
  const canonicalContextId = canonicalContextIdForProducerContext(sourceContext);
  const material = {
    authorityType: M5_MANIFEST_AUTHORITY_TYPE,
    authorityVersion,
    candidateId: sourceContext.candidateId,
    assetId: sourceContext.assetId,
    canonicalIdentifier: sourceContext.canonicalIdentifier,
    assetClass: sourceContext.assetClass,
    canonicalContextId,
    asOf: sourceContext.asOf,
    manifestSchemaVersion: M5_EVIDENCE_MANIFEST_VERSION,
    manifest,
    compatibility,
    allowedDatasetPins,
  } as const;
  const record: M5ManifestAuthorityRecord = {
    ...material,
    manifestAuthorityId: m5ManifestAuthorityIdFor(canonicalContextId, authorityVersion),
    fingerprint: m5ManifestAuthorityFingerprint(material),
    createdAt: validDate(input.createdAt ?? new Date(), "M5_MANIFEST_AUTHORITY_CREATED_AT_INVALID"),
  };
  assertM5ManifestAuthorityRecord(record);
  return Object.freeze({ ...record, allowedDatasetPins: Object.freeze([...record.allowedDatasetPins]) });
}

export function assertM5ManifestAuthorityRecord(record: M5ManifestAuthorityRecord): void {
  if (record.authorityType !== M5_MANIFEST_AUTHORITY_TYPE) throw new Error("M5_MANIFEST_AUTHORITY_TYPE_INVALID");
  const authorityVersion = nonBlank(record.authorityVersion, "M5_MANIFEST_AUTHORITY_VERSION_INVALID");
  const candidateId = nonBlank(record.candidateId, "M5_MANIFEST_AUTHORITY_CANDIDATE_INVALID");
  const assetId = nonBlank(record.assetId, "M5_MANIFEST_AUTHORITY_ASSET_INVALID");
  const canonicalIdentifier = nonBlank(record.canonicalIdentifier, "M5_MANIFEST_AUTHORITY_IDENTIFIER_INVALID");
  const assetClass = nonBlank(record.assetClass, "M5_MANIFEST_AUTHORITY_ASSET_CLASS_INVALID");
  const asOf = nonBlank(record.asOf, "M5_MANIFEST_AUTHORITY_AS_OF_INVALID");
  const context: CanonicalProducerSourceContext = { candidateId, assetId, canonicalIdentifier, assetClass, asOf, providerDatasetPins: record.allowedDatasetPins.map(pin => ({ providerId: pin.providerId, datasetVersion: pin.datasetVersion })), relevantEvidence: [] };
  const canonicalContextId = canonicalContextIdForProducerContext(context);
  if (record.canonicalContextId !== canonicalContextId) throw new Error("M5_MANIFEST_AUTHORITY_CONTEXT_MISMATCH");
  if (record.manifestSchemaVersion !== M5_EVIDENCE_MANIFEST_VERSION || record.manifest.version !== record.manifestSchemaVersion) throw new Error("M5_MANIFEST_AUTHORITY_MANIFEST_VERSION_INVALID");
  const manifest = normalizeM5EvidenceManifest(record.manifest);
  const compatibility = normalizeM5EvidenceSemanticCompatibility(record.compatibility);
  const allowedDatasetPins = normalizedPins(record.allowedDatasetPins as M5DatasetPin[]);
  if (JSON.stringify(canonicalize(record.manifest)) !== JSON.stringify(canonicalize(manifest)) || JSON.stringify(canonicalize(record.compatibility)) !== JSON.stringify(canonicalize(compatibility)) || JSON.stringify(canonicalize(record.allowedDatasetPins)) !== JSON.stringify(canonicalize(allowedDatasetPins))) throw new Error("M5_MANIFEST_AUTHORITY_NOT_NORMALIZED");
  const material = { authorityType: M5_MANIFEST_AUTHORITY_TYPE, authorityVersion, candidateId, assetId, canonicalIdentifier, assetClass, canonicalContextId, asOf, manifestSchemaVersion: record.manifestSchemaVersion, manifest, compatibility, allowedDatasetPins } as const;
  if (record.manifestAuthorityId !== m5ManifestAuthorityIdFor(canonicalContextId, authorityVersion)) throw new Error("M5_MANIFEST_AUTHORITY_ID_INVALID");
  if (record.fingerprint !== m5ManifestAuthorityFingerprint(material)) throw new Error("M5_MANIFEST_AUTHORITY_FINGERPRINT_MISMATCH");
  validDate(record.createdAt, "M5_MANIFEST_AUTHORITY_CREATED_AT_INVALID");
}

export function mapM5ManifestAuthorityRow(row: Record<string, unknown>): M5ManifestAuthorityRecord {
  const jsonObject = (value: unknown, code: string): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
    return value as Record<string, unknown>;
  };
  const jsonArray = (value: unknown, code: string): readonly unknown[] => {
    if (!Array.isArray(value)) throw new Error(code);
    return value;
  };
  const record: M5ManifestAuthorityRecord = {
    manifestAuthorityId: nonBlank(row.manifest_authority_id, "M5_MANIFEST_AUTHORITY_ID_INVALID"),
    authorityType: nonBlank(row.authority_type, "M5_MANIFEST_AUTHORITY_TYPE_INVALID") as typeof M5_MANIFEST_AUTHORITY_TYPE,
    authorityVersion: nonBlank(row.authority_version, "M5_MANIFEST_AUTHORITY_VERSION_INVALID"),
    candidateId: nonBlank(row.candidate_id, "M5_MANIFEST_AUTHORITY_CANDIDATE_INVALID"),
    assetId: nonBlank(row.asset_id, "M5_MANIFEST_AUTHORITY_ASSET_INVALID"),
    canonicalIdentifier: nonBlank(row.canonical_identifier, "M5_MANIFEST_AUTHORITY_IDENTIFIER_INVALID"),
    assetClass: nonBlank(row.asset_class, "M5_MANIFEST_AUTHORITY_ASSET_CLASS_INVALID"),
    canonicalContextId: nonBlank(row.canonical_context_id, "M5_MANIFEST_AUTHORITY_CONTEXT_INVALID"),
    asOf: nonBlank(row.as_of instanceof Date ? row.as_of.toISOString() : row.as_of, "M5_MANIFEST_AUTHORITY_AS_OF_INVALID"),
    manifestSchemaVersion: nonBlank(row.manifest_schema_version, "M5_MANIFEST_AUTHORITY_MANIFEST_VERSION_INVALID") as typeof M5_EVIDENCE_MANIFEST_VERSION,
    manifest: jsonObject(row.manifest, "M5_MANIFEST_AUTHORITY_MANIFEST_INVALID") as unknown as M5EvidenceManifest,
    compatibility: jsonObject(row.compatibility, "M5_MANIFEST_AUTHORITY_COMPATIBILITY_INVALID") as unknown as M5EvidenceSemanticCompatibility,
    allowedDatasetPins: jsonArray(row.allowed_dataset_pins, "M5_MANIFEST_AUTHORITY_PINS_INVALID") as M5DatasetPinValue[],
    fingerprint: nonBlank(row.fingerprint, "M5_MANIFEST_AUTHORITY_FINGERPRINT_INVALID"),
    createdAt: validDate(row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)), "M5_MANIFEST_AUTHORITY_CREATED_AT_INVALID"),
  };
  assertM5ManifestAuthorityRecord(record);
  return Object.freeze({ ...record, allowedDatasetPins: Object.freeze([...record.allowedDatasetPins]) });
}
