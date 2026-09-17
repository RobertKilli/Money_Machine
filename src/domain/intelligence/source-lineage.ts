import {
  AVAILABILITY_CLAIM_CONTRACT_VERSION,
  canonicalSha256,
  type AvailabilityClaim,
  type IngestionAttempt,
  type SourceArtifact,
  type SourceEnvelope,
  type SourceObservation,
} from "@/domain/intelligence/ingestion-provenance";

export const SOURCE_LINEAGE_CONTRACT_VERSION = "m5-source-lineage/v1" as const;
export type SourceLineageContractVersion = typeof SOURCE_LINEAGE_CONTRACT_VERSION;

export type SourceLineage = Readonly<{
  contractVersion: SourceLineageContractVersion;
  sourceLineageId: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  availabilityClaimIds: readonly string[];
  sourceArtifactIds: readonly string[];
  ingestionAttemptIds: readonly string[];
  memberCount: number;
  observedAt: string;
  effectiveAvailableAt: string;
  fingerprint: string;
  recordedAt: string;
}>;

export type SourceLineageMember = Readonly<{
  sourceLineageId: string;
  memberOrdinal: number;
  availabilityClaimId: string;
  sourceArtifactId: string;
  sourceEnvelopeId: string;
  sourceObservationId: string;
  ingestionAttemptId: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  observedAt: string;
  effectiveAvailableAt: string;
  memberFingerprint: string;
}>;

export type SourceLineageMemberInput = Readonly<{
  claim: AvailabilityClaim;
  envelope: SourceEnvelope;
  observation: SourceObservation;
  artifact: SourceArtifact;
  attempt: IngestionAttempt;
  lifecycleStatus: "COMPLETED" | "PARTIAL";
}>;

const HASH = /^[a-f0-9]{64}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const nonBlank = (value: unknown, code: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
};
const timestamp = (value: unknown, code: string): string => {
  const result = nonBlank(value, code);
  if (!TIMESTAMP.test(result) || Number.isNaN(Date.parse(result)) || new Date(result).toISOString() !== result) throw new Error(code);
  return result;
};
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};

function sortedUnique(values: readonly string[], code: string): readonly string[] {
  const normalized = values.map(value => nonBlank(value, code));
  const unique = [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
  if (unique.length !== normalized.length) throw new Error(code);
  return Object.freeze(unique);
}

function derivedUnique(values: readonly string[], code: string): readonly string[] {
  return Object.freeze([...new Set(values.map(value => nonBlank(value, code)))].sort((a, b) => a.localeCompare(b)));
}

function memberFingerprint(member: Omit<SourceLineageMember, "memberFingerprint">): string {
  return canonicalSha256({
    version: SOURCE_LINEAGE_CONTRACT_VERSION,
    sourceLineageId: member.sourceLineageId,
    memberOrdinal: member.memberOrdinal,
    availabilityClaimId: member.availabilityClaimId,
    sourceArtifactId: member.sourceArtifactId,
    sourceEnvelopeId: member.sourceEnvelopeId,
    sourceObservationId: member.sourceObservationId,
    ingestionAttemptId: member.ingestionAttemptId,
    providerId: member.providerId,
    datasetId: member.datasetId,
    datasetVersion: member.datasetVersion,
    observedAt: member.observedAt,
    effectiveAvailableAt: member.effectiveAvailableAt,
  });
}

export function sourceLineageIdFor(input: Pick<SourceLineage, "providerId" | "datasetId" | "datasetVersion" | "availabilityClaimIds">): string {
  return `m5-source-lineage:${canonicalSha256({ version: SOURCE_LINEAGE_CONTRACT_VERSION, providerId: input.providerId, datasetId: input.datasetId, datasetVersion: input.datasetVersion, availabilityClaimIds: [...input.availabilityClaimIds] })}`;
}

export function sourceLineageFingerprint(input: Pick<SourceLineage, "providerId" | "datasetId" | "datasetVersion" | "availabilityClaimIds" | "sourceArtifactIds" | "ingestionAttemptIds" | "memberCount" | "observedAt" | "effectiveAvailableAt">): string {
  return canonicalSha256({
    version: SOURCE_LINEAGE_CONTRACT_VERSION,
    providerId: input.providerId,
    datasetId: input.datasetId,
    datasetVersion: input.datasetVersion,
    availabilityClaimIds: [...input.availabilityClaimIds],
    sourceArtifactIds: [...input.sourceArtifactIds],
    ingestionAttemptIds: [...input.ingestionAttemptIds],
    memberCount: input.memberCount,
    observedAt: input.observedAt,
    effectiveAvailableAt: input.effectiveAvailableAt,
  });
}

export function createSourceLineage(input: {
  readonly providerId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly members: readonly SourceLineageMemberInput[];
  readonly recordedAt: string;
}): { readonly lineage: SourceLineage; readonly members: readonly SourceLineageMember[] } {
  if (input.members.length === 0) throw new Error("M5_SOURCE_LINEAGE_EMPTY");
  const providerId = nonBlank(input.providerId, "M5_SOURCE_LINEAGE_SCOPE_MISMATCH");
  const datasetId = nonBlank(input.datasetId, "M5_SOURCE_LINEAGE_SCOPE_MISMATCH");
  const datasetVersion = nonBlank(input.datasetVersion, "M5_SOURCE_LINEAGE_SCOPE_MISMATCH");
  const claimIds = input.members.map(member => member.claim.availabilityClaimId);
  const availabilityClaimIds = sortedUnique(claimIds, "M5_SOURCE_LINEAGE_CLAIM_INVALID");
  const byClaim = new Map(input.members.map(member => [member.claim.availabilityClaimId, member]));
  if (byClaim.size !== input.members.length) throw new Error("M5_SOURCE_LINEAGE_CLAIM_INVALID");
  for (const member of input.members) {
    const { claim, envelope, observation, artifact, attempt, lifecycleStatus } = member;
    if (claim.contractVersion !== AVAILABILITY_CLAIM_CONTRACT_VERSION || claim.basis !== "RETRIEVAL_OBSERVED") throw new Error("M5_SOURCE_LINEAGE_CLAIM_INVALID");
    if (envelope.temporalQualityStatus !== "RESOLVED" || envelope.sourceArtifactId !== artifact.sourceArtifactId || observation.sourceArtifactId !== artifact.sourceArtifactId || claim.sourceEnvelopeId !== envelope.sourceEnvelopeId || claim.sourceObservationId !== observation.sourceObservationId) throw new Error("M5_SOURCE_LINEAGE_CLAIM_INVALID");
    if (artifact.providerId !== providerId || artifact.datasetId !== datasetId || artifact.datasetVersion !== datasetVersion) throw new Error("M5_SOURCE_LINEAGE_SCOPE_MISMATCH");
    if (attempt.ingestionAttemptId !== observation.ingestionAttemptId) throw new Error("M5_SOURCE_LINEAGE_CLAIM_INVALID");
    if (lifecycleStatus !== "COMPLETED" && lifecycleStatus !== "PARTIAL") throw new Error("M5_SOURCE_LINEAGE_ATTEMPT_INVALID");
    if (claim.effectiveAvailableAt !== observation.retrievedAt || envelope.observedAt > observation.retrievedAt) throw new Error("M5_SOURCE_LINEAGE_CLAIM_INVALID");
    if (!HASH.test(artifact.payloadFingerprint) || !HASH.test(artifact.sourceArtifactFingerprint) || !HASH.test(envelope.payloadFingerprint) || !HASH.test(envelope.sourceEnvelopeFingerprint) || !HASH.test(claim.claimFingerprint)) throw new Error("M5_SOURCE_LINEAGE_CLAIM_INVALID");
  }
  const sourceArtifactIds = derivedUnique(input.members.map(member => member.artifact.sourceArtifactId), "M5_SOURCE_LINEAGE_CLAIM_INVALID");
  const ingestionAttemptIds = derivedUnique(input.members.map(member => member.attempt.ingestionAttemptId), "M5_SOURCE_LINEAGE_CLAIM_INVALID");
  const observedAt = input.members.map(member => member.envelope.observedAt).sort().at(-1)!;
  const effectiveAvailableAt = input.members.map(member => member.claim.effectiveAvailableAt).sort().at(-1)!;
  if (observedAt > effectiveAvailableAt) throw new Error("M5_SOURCE_LINEAGE_CLAIM_INVALID");
  const sourceLineageId = sourceLineageIdFor({ providerId, datasetId, datasetVersion, availabilityClaimIds });
  const lineage: SourceLineage = freeze({
    contractVersion: SOURCE_LINEAGE_CONTRACT_VERSION,
    sourceLineageId,
    providerId,
    datasetId,
    datasetVersion,
    availabilityClaimIds,
    sourceArtifactIds,
    ingestionAttemptIds,
    memberCount: availabilityClaimIds.length,
    observedAt: timestamp(observedAt, "M5_SOURCE_LINEAGE_TIMESTAMP_INVALID"),
    effectiveAvailableAt: timestamp(effectiveAvailableAt, "M5_SOURCE_LINEAGE_TIMESTAMP_INVALID"),
    fingerprint: sourceLineageFingerprint({ providerId, datasetId, datasetVersion, availabilityClaimIds, sourceArtifactIds, ingestionAttemptIds, memberCount: availabilityClaimIds.length, observedAt, effectiveAvailableAt }),
    recordedAt: timestamp(input.recordedAt, "M5_SOURCE_LINEAGE_RECORDED_INVALID"),
  });
  const members = freeze(availabilityClaimIds.map((availabilityClaimId, memberOrdinal) => {
    const inputMember = byClaim.get(availabilityClaimId)!;
    const base = {
      sourceLineageId,
      memberOrdinal,
      availabilityClaimId,
      sourceArtifactId: inputMember.artifact.sourceArtifactId,
      sourceEnvelopeId: inputMember.envelope.sourceEnvelopeId,
      sourceObservationId: inputMember.observation.sourceObservationId,
      ingestionAttemptId: inputMember.attempt.ingestionAttemptId,
      providerId,
      datasetId,
      datasetVersion,
      observedAt: inputMember.envelope.observedAt,
      effectiveAvailableAt: inputMember.claim.effectiveAvailableAt,
    } satisfies Omit<SourceLineageMember, "memberFingerprint">;
    return freeze({ ...base, memberFingerprint: memberFingerprint(base) });
  }));
  return Object.freeze({ lineage, members });
}

export function assertSourceLineage(record: SourceLineage): void {
  if (record.contractVersion !== SOURCE_LINEAGE_CONTRACT_VERSION || record.memberCount !== record.availabilityClaimIds.length || record.sourceLineageId !== sourceLineageIdFor(record) || record.fingerprint !== sourceLineageFingerprint(record)) throw new Error("M5_SOURCE_LINEAGE_STORED_FINGERPRINT_INVALID");
}

export function assertSourceLineageMember(record: SourceLineageMember): void {
  const { memberFingerprint: stored, ...base } = record;
  if (!HASH.test(stored) || stored !== memberFingerprint(base)) throw new Error("M5_SOURCE_LINEAGE_MEMBER_FINGERPRINT_INVALID");
}
