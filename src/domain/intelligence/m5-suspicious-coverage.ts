import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";

export const M5_SUSPICIOUS_COVERAGE_CONTRACT_VERSION = "m5-suspicious-coverage-authority/v1" as const;
export type M5SuspiciousCoverageStatus = "COMPLETE" | "INCOMPLETE" | "INVALID";
export type M5SuspiciousCoverageMaterial = Readonly<{
  materialId: string;
  artifactId: string;
  envelopeId: string;
  observationId: string;
  payloadFingerprint: string;
  observedAt: string;
  availableAt: string;
}>;
export type M5SuspiciousCoverageAuthority = Readonly<{
  contractVersion: typeof M5_SUSPICIOUS_COVERAGE_CONTRACT_VERSION;
  coverageAuthorityId: string;
  ruleSetAuthorityId: string;
  ruleSetFingerprint: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  mappingRevisionId: string;
  providerAssetIdentityAssertionId: string;
  sourceLineageId: string;
  sourceLineageFingerprint: string;
  candidateId: string;
  assetId: string;
  canonicalIdentifier: string;
  assetClass: string;
  asOf: string;
  requiredRuleIds: readonly string[];
  evaluatedRuleIds: readonly string[];
  materials: readonly M5SuspiciousCoverageMaterial[];
  status: M5SuspiciousCoverageStatus;
  observedAt: string;
  availableAt: string;
  fingerprint: string;
  recordedAt: string;
}>;
export type M5SuspiciousCoverageInput = Omit<M5SuspiciousCoverageAuthority, "coverageAuthorityId" | "fingerprint"> & { readonly coverageAuthorityId?: string; readonly fingerprint?: string };

const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA = /^[a-f0-9]{64}$/;
function text(value: unknown, code: string): string { if (typeof value !== "string" || !value.trim() || value.length > 512) throw new Error(code); return value.trim(); }
function sha(value: unknown, code: string): string { const v = text(value, code); if (!SHA.test(v)) throw new Error(code); return v; }
function time(value: unknown, code: string): string { const v = text(value, code); if (!UTC.test(v) || Number.isNaN(Date.parse(v)) || new Date(v).toISOString() !== v) throw new Error(code); return v; }
function ids(values: readonly string[], code: string): readonly string[] { if (!Array.isArray(values)) throw new Error(code); const v = values.map(x => text(x, code)).sort((a, b) => a.localeCompare(b)); if (new Set(v).size !== v.length) throw new Error(code); return Object.freeze(v); }
function deep<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deep(child); } return value; }
function material(input: M5SuspiciousCoverageInput): Omit<M5SuspiciousCoverageAuthority, "coverageAuthorityId" | "fingerprint"> {
  if (input.contractVersion !== M5_SUSPICIOUS_COVERAGE_CONTRACT_VERSION) throw new Error("M5_SUSPICIOUS_COVERAGE_CONTRACT_INVALID");
  const required = ids(input.requiredRuleIds, "M5_SUSPICIOUS_COVERAGE_REQUIRED_RULES_INVALID");
  const evaluated = ids(input.evaluatedRuleIds, "M5_SUSPICIOUS_COVERAGE_EVALUATED_RULES_INVALID");
  const mats = [...input.materials].map((m) => ({ materialId: text(m.materialId, "M5_SUSPICIOUS_COVERAGE_MATERIAL_INVALID"), artifactId: text(m.artifactId, "M5_SUSPICIOUS_COVERAGE_ARTIFACT_INVALID"), envelopeId: text(m.envelopeId, "M5_SUSPICIOUS_COVERAGE_ENVELOPE_INVALID"), observationId: text(m.observationId, "M5_SUSPICIOUS_COVERAGE_OBSERVATION_INVALID"), payloadFingerprint: sha(m.payloadFingerprint, "M5_SUSPICIOUS_COVERAGE_PAYLOAD_INVALID"), observedAt: time(m.observedAt, "M5_SUSPICIOUS_COVERAGE_OBSERVED_INVALID"), availableAt: time(m.availableAt, "M5_SUSPICIOUS_COVERAGE_AVAILABLE_INVALID") })).sort((a, b) => a.materialId.localeCompare(b.materialId));
  if (new Set(mats.map(m => m.materialId)).size !== mats.length) throw new Error("M5_SUSPICIOUS_COVERAGE_DUPLICATE_MATERIAL");
  if (mats.some(m => m.observedAt > m.availableAt || m.availableAt > input.asOf)) throw new Error("M5_SUSPICIOUS_COVERAGE_TEMPORAL_INVALID");
  const status = input.status;
  if (!["COMPLETE", "INCOMPLETE", "INVALID"].includes(status)) throw new Error("M5_SUSPICIOUS_COVERAGE_STATUS_INVALID");
  const equal = required.length === evaluated.length && required.every((r, i) => r === evaluated[i]);
  if (status === "COMPLETE" && (!equal || mats.length === 0)) throw new Error("M5_SUSPICIOUS_COVERAGE_NOT_COMPLETE");
  const out = { contractVersion: input.contractVersion, ruleSetAuthorityId: text(input.ruleSetAuthorityId, "M5_SUSPICIOUS_COVERAGE_RULE_SET_INVALID"), ruleSetFingerprint: sha(input.ruleSetFingerprint, "M5_SUSPICIOUS_COVERAGE_RULE_SET_FINGERPRINT_INVALID"), providerId: text(input.providerId, "M5_SUSPICIOUS_COVERAGE_PROVIDER_INVALID"), datasetId: text(input.datasetId, "M5_SUSPICIOUS_COVERAGE_DATASET_INVALID"), datasetVersion: text(input.datasetVersion, "M5_SUSPICIOUS_COVERAGE_DATASET_VERSION_INVALID"), mappingRevisionId: text(input.mappingRevisionId, "M5_SUSPICIOUS_COVERAGE_MAPPING_INVALID"), providerAssetIdentityAssertionId: text(input.providerAssetIdentityAssertionId, "M5_SUSPICIOUS_COVERAGE_IDENTITY_INVALID"), sourceLineageId: text(input.sourceLineageId, "M5_SUSPICIOUS_COVERAGE_LINEAGE_INVALID"), sourceLineageFingerprint: sha(input.sourceLineageFingerprint, "M5_SUSPICIOUS_COVERAGE_LINEAGE_FINGERPRINT_INVALID"), candidateId: text(input.candidateId, "M5_SUSPICIOUS_COVERAGE_CANDIDATE_INVALID"), assetId: text(input.assetId, "M5_SUSPICIOUS_COVERAGE_ASSET_INVALID"), canonicalIdentifier: text(input.canonicalIdentifier, "M5_SUSPICIOUS_COVERAGE_IDENTIFIER_INVALID"), assetClass: text(input.assetClass, "M5_SUSPICIOUS_COVERAGE_ASSET_CLASS_INVALID"), asOf: time(input.asOf, "M5_SUSPICIOUS_COVERAGE_AS_OF_INVALID"), requiredRuleIds: required, evaluatedRuleIds: evaluated, materials: Object.freeze(mats), status, observedAt: time(input.observedAt, "M5_SUSPICIOUS_COVERAGE_OBSERVED_INVALID"), availableAt: time(input.availableAt, "M5_SUSPICIOUS_COVERAGE_AVAILABLE_INVALID"), recordedAt: time(input.recordedAt, "M5_SUSPICIOUS_COVERAGE_RECORDED_INVALID") };
  if (out.observedAt > out.availableAt || out.availableAt > out.asOf) throw new Error("M5_SUSPICIOUS_COVERAGE_TEMPORAL_INVALID");
  return out;
}
export function m5SuspiciousCoverageFingerprint(input: M5SuspiciousCoverageInput): string { const value = material(input); const body = { ...value }; delete (body as { recordedAt?: string }).recordedAt; return canonicalSha256(body); }
export function createM5SuspiciousCoverageAuthority(input: M5SuspiciousCoverageInput): M5SuspiciousCoverageAuthority { const value = material(input); const base = { ...value }; delete (base as { recordedAt?: string }).recordedAt; const fingerprint = canonicalSha256(base); const id = input.coverageAuthorityId ?? `m5-suspicious-coverage:${canonicalSha256({ ruleSetAuthorityId: value.ruleSetAuthorityId, providerId: value.providerId, datasetId: value.datasetId, datasetVersion: value.datasetVersion, candidateId: value.candidateId, assetId: value.assetId, asOf: value.asOf })}`; if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) throw new Error("M5_SUSPICIOUS_COVERAGE_FINGERPRINT_MISMATCH"); return deep({ ...value, coverageAuthorityId: id, fingerprint }); }
export function assertM5SuspiciousCoverageAuthority(record: M5SuspiciousCoverageAuthority): void { const checked = createM5SuspiciousCoverageAuthority(record); if (checked.coverageAuthorityId !== record.coverageAuthorityId || checked.fingerprint !== record.fingerprint) throw new Error("M5_SUSPICIOUS_COVERAGE_CORRUPT"); }
