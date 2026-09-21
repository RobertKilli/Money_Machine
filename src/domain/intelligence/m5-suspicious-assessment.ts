import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";
import { normalizeM5DatasetPins } from "@/domain/intelligence/m5-dataset-pin";

export const M5_SUSPICIOUS_ASSESSMENT_CONTRACT_VERSION = "m5-suspicious-assessment/v1" as const;
export const M5_SUSPICIOUS_ASSESSMENT_ID_PREFIX = "m5-suspicious-assessment:";
export type M5SuspiciousAssessmentResult = "NO_FINDINGS" | "FINDINGS_PRESENT";

export type M5SuspiciousFindingReference = Readonly<{
  evidenceId: string;
  fingerprint: string;
}>;

export type M5SuspiciousAssessment = Readonly<{
  contractVersion: typeof M5_SUSPICIOUS_ASSESSMENT_CONTRACT_VERSION;
  suspiciousAssessmentId: string;
  fingerprint: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  candidateId: string;
  assetId: string;
  canonicalIdentifier: string;
  assetClass: string;
  mappingRevisionId: string;
  sourceLineageId: string;
  ruleSetVersion: string;
  ruleSetFingerprint: string;
  /** Persisted authority bindings are required by the v2 application path. */
  ruleSetAuthorityId?: string;
  coverageAuthorityId?: string;
  coverageFingerprint?: string;
  evaluatedRuleCount?: number;
  detectorVersion: string;
  coveredRuleIds: readonly string[];
  result: M5SuspiciousAssessmentResult;
  findingReferences: readonly M5SuspiciousFindingReference[];
  asOf: string;
  observedAt: string;
  availableAt: string;
  sourceRecordIds: readonly string[];
  payloadFingerprint: string;
  datasetPins: readonly string[];
  recordedAt: string;
}>;

export type M5SuspiciousAssessmentInput = Omit<M5SuspiciousAssessment, "suspiciousAssessmentId" | "fingerprint"> & {
  readonly suspiciousAssessmentId?: string;
  readonly fingerprint?: string;
};

const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

function nonBlank(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 512) throw new Error(code);
  return value.trim();
}

function id(value: unknown, code: string): string {
  const normalized = nonBlank(value, code);
  if (!ID.test(normalized)) throw new Error(code);
  return normalized;
}

function sha(value: unknown, code: string): string {
  const normalized = nonBlank(value, code);
  if (!SHA.test(normalized)) throw new Error(code);
  return normalized;
}

function timestamp(value: unknown, code: string): string {
  const normalized = nonBlank(value, code);
  if (!UTC.test(normalized) || Number.isNaN(Date.parse(normalized)) || new Date(normalized).toISOString() !== normalized) throw new Error(code);
  return normalized;
}

function sortedUnique(values: readonly string[], code: string, allowEmpty = false): readonly string[] {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) throw new Error(code);
  const normalized = values.map(value => nonBlank(value, code));
  const sorted = [...normalized].sort((a, b) => a.localeCompare(b));
  if (new Set(sorted).size !== sorted.length) throw new Error(code);
  return Object.freeze(sorted);
}

function findingReferences(values: readonly M5SuspiciousFindingReference[]): readonly M5SuspiciousFindingReference[] {
  if (!Array.isArray(values)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_FINDINGS_INVALID");
  const normalized = values.map(value => Object.freeze({
    evidenceId: id(value.evidenceId, "M5_SUSPICIOUS_ASSESSMENT_FINDING_ID_INVALID"),
    fingerprint: sha(value.fingerprint, "M5_SUSPICIOUS_ASSESSMENT_FINDING_FINGERPRINT_INVALID"),
  }));
  normalized.sort((a, b) => a.evidenceId.localeCompare(b.evidenceId) || a.fingerprint.localeCompare(b.fingerprint));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].evidenceId === normalized[index].evidenceId) throw new Error("M5_SUSPICIOUS_ASSESSMENT_DUPLICATE_FINDING");
  }
  return Object.freeze(normalized);
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  }
  return value;
}

function material(input: M5SuspiciousAssessmentInput): Omit<M5SuspiciousAssessment, "suspiciousAssessmentId" | "fingerprint"> {
  const contractVersion = input.contractVersion;
  if (contractVersion !== M5_SUSPICIOUS_ASSESSMENT_CONTRACT_VERSION) throw new Error("M5_SUSPICIOUS_ASSESSMENT_CONTRACT_INVALID");
  const result = input.result;
  if (result !== "NO_FINDINGS" && result !== "FINDINGS_PRESENT") throw new Error("M5_SUSPICIOUS_ASSESSMENT_RESULT_INVALID");
  const coveredRuleIds = sortedUnique(input.coveredRuleIds, "M5_SUSPICIOUS_ASSESSMENT_RULES_INVALID");
  const references = findingReferences(input.findingReferences);
  if (result === "NO_FINDINGS" && references.length !== 0) throw new Error("M5_SUSPICIOUS_ASSESSMENT_NO_FINDINGS_HAS_FINDINGS");
  if (result === "FINDINGS_PRESENT" && references.length === 0) throw new Error("M5_SUSPICIOUS_ASSESSMENT_FINDINGS_EMPTY");
  const observedAt = timestamp(input.observedAt, "M5_SUSPICIOUS_ASSESSMENT_OBSERVED_INVALID");
  const availableAt = timestamp(input.availableAt, "M5_SUSPICIOUS_ASSESSMENT_AVAILABLE_INVALID");
  const asOf = timestamp(input.asOf, "M5_SUSPICIOUS_ASSESSMENT_AS_OF_INVALID");
  if (observedAt > availableAt || availableAt > asOf) throw new Error("M5_SUSPICIOUS_ASSESSMENT_TEMPORAL_ORDER_INVALID");
  const datasetPins = normalizeM5DatasetPins(input.datasetPins);
  const ruleSetAuthorityId = input.ruleSetAuthorityId === undefined ? undefined : nonBlank(input.ruleSetAuthorityId, "M5_SUSPICIOUS_ASSESSMENT_RULE_SET_AUTHORITY_INVALID");
  const coverageAuthorityId = input.coverageAuthorityId === undefined ? undefined : nonBlank(input.coverageAuthorityId, "M5_SUSPICIOUS_ASSESSMENT_COVERAGE_AUTHORITY_INVALID");
  const coverageFingerprint = input.coverageFingerprint === undefined ? undefined : sha(input.coverageFingerprint, "M5_SUSPICIOUS_ASSESSMENT_COVERAGE_FINGERPRINT_INVALID");
  const evaluatedRuleCount = input.evaluatedRuleCount === undefined ? undefined : input.evaluatedRuleCount;
  if ((coverageAuthorityId === undefined) !== (coverageFingerprint === undefined) || (coverageAuthorityId === undefined) !== (evaluatedRuleCount === undefined)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_COVERAGE_BINDING_INCOMPLETE");
  if (evaluatedRuleCount !== undefined && (!Number.isInteger(evaluatedRuleCount) || evaluatedRuleCount !== coveredRuleIds.length)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_EVALUATED_RULE_COUNT_INVALID");
  const primaryPin = `m5-pin/v1:${Buffer.from(JSON.stringify([nonBlank(input.providerId, "M5_SUSPICIOUS_ASSESSMENT_PROVIDER_INVALID"), nonBlank(input.datasetId, "M5_SUSPICIOUS_ASSESSMENT_DATASET_INVALID"), nonBlank(input.datasetVersion, "M5_SUSPICIOUS_ASSESSMENT_DATASET_VERSION_INVALID")]), "utf8").toString("base64url")}`;
  if (!datasetPins.includes(primaryPin)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_PIN_SCOPE_INVALID");
  return {
    contractVersion,
    fingerprint: "",
    providerId: nonBlank(input.providerId, "M5_SUSPICIOUS_ASSESSMENT_PROVIDER_INVALID"),
    datasetId: nonBlank(input.datasetId, "M5_SUSPICIOUS_ASSESSMENT_DATASET_INVALID"),
    datasetVersion: nonBlank(input.datasetVersion, "M5_SUSPICIOUS_ASSESSMENT_DATASET_VERSION_INVALID"),
    candidateId: nonBlank(input.candidateId, "M5_SUSPICIOUS_ASSESSMENT_CANDIDATE_INVALID"),
    assetId: nonBlank(input.assetId, "M5_SUSPICIOUS_ASSESSMENT_ASSET_INVALID"),
    canonicalIdentifier: nonBlank(input.canonicalIdentifier, "M5_SUSPICIOUS_ASSESSMENT_IDENTIFIER_INVALID"),
    assetClass: nonBlank(input.assetClass, "M5_SUSPICIOUS_ASSESSMENT_ASSET_CLASS_INVALID"),
    mappingRevisionId: nonBlank(input.mappingRevisionId, "M5_SUSPICIOUS_ASSESSMENT_MAPPING_INVALID"),
    sourceLineageId: nonBlank(input.sourceLineageId, "M5_SUSPICIOUS_ASSESSMENT_LINEAGE_INVALID"),
    ruleSetVersion: nonBlank(input.ruleSetVersion, "M5_SUSPICIOUS_ASSESSMENT_RULE_SET_INVALID"),
    ruleSetFingerprint: sha(input.ruleSetFingerprint, "M5_SUSPICIOUS_ASSESSMENT_RULE_SET_FINGERPRINT_INVALID"),
    ruleSetAuthorityId,
    coverageAuthorityId,
    coverageFingerprint,
    evaluatedRuleCount,
    detectorVersion: nonBlank(input.detectorVersion, "M5_SUSPICIOUS_ASSESSMENT_DETECTOR_INVALID"),
    coveredRuleIds,
    result,
    findingReferences: references,
    asOf,
    observedAt,
    availableAt,
    sourceRecordIds: sortedUnique(input.sourceRecordIds, "M5_SUSPICIOUS_ASSESSMENT_SOURCE_RECORDS_INVALID"),
    payloadFingerprint: sha(input.payloadFingerprint, "M5_SUSPICIOUS_ASSESSMENT_PAYLOAD_FINGERPRINT_INVALID"),
    datasetPins,
    recordedAt: timestamp(input.recordedAt, "M5_SUSPICIOUS_ASSESSMENT_RECORDED_INVALID"),
  } as Omit<M5SuspiciousAssessment, "suspiciousAssessmentId" | "fingerprint">;
}

export function m5SuspiciousAssessmentIdFor(input: M5SuspiciousAssessmentInput): string {
  const value = material(input);
  return `${M5_SUSPICIOUS_ASSESSMENT_ID_PREFIX}${canonicalSha256({
    contractVersion: M5_SUSPICIOUS_ASSESSMENT_CONTRACT_VERSION,
    providerId: value.providerId,
    datasetId: value.datasetId,
    datasetVersion: value.datasetVersion,
    candidateId: value.candidateId,
    assetId: value.assetId,
    canonicalIdentifier: value.canonicalIdentifier,
    assetClass: value.assetClass,
    mappingRevisionId: value.mappingRevisionId,
    sourceLineageId: value.sourceLineageId,
    ruleSetVersion: value.ruleSetVersion,
    ruleSetFingerprint: value.ruleSetFingerprint,
    detectorVersion: value.detectorVersion,
    asOf: value.asOf,
  })}`;
}

export function m5SuspiciousAssessmentFingerprint(input: M5SuspiciousAssessmentInput): string {
  const value = material(input);
  const suspiciousAssessmentId = m5SuspiciousAssessmentIdFor(value);
  const materialValue: Record<string, unknown> = { ...value };
  delete materialValue.recordedAt;
  return canonicalSha256({ suspiciousAssessmentId, ...materialValue });
}

export function createM5SuspiciousAssessment(input: M5SuspiciousAssessmentInput): M5SuspiciousAssessment {
  const value = material(input);
  const suspiciousAssessmentId = m5SuspiciousAssessmentIdFor(value);
  const fingerprint = m5SuspiciousAssessmentFingerprint({ ...value, suspiciousAssessmentId });
  if (input.suspiciousAssessmentId !== undefined && input.suspiciousAssessmentId !== suspiciousAssessmentId) throw new Error("M5_SUSPICIOUS_ASSESSMENT_ID_MISMATCH");
  if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) throw new Error("M5_SUSPICIOUS_ASSESSMENT_FINGERPRINT_MISMATCH");
  return freezeDeep({ ...value, suspiciousAssessmentId, fingerprint });
}

export function assertM5SuspiciousAssessment(record: M5SuspiciousAssessment): void {
  const validated = createM5SuspiciousAssessment(record);
  if (validated.fingerprint !== record.fingerprint) throw new Error("M5_SUSPICIOUS_ASSESSMENT_FINGERPRINT_MISMATCH");
}
