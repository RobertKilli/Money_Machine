import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createIngestionAttempt,
  createRetrievalAvailabilityClaim,
  createSourceArtifact,
  createSourceEnvelope,
  createSourceObservation,
} from "@/domain/intelligence/ingestion-provenance";
import { createSourceLineage, sourceLineageFingerprint, sourceLineageIdFor } from "@/domain/intelligence/source-lineage";
import { mapSourceLineageMemberRow, mapSourceLineageRow } from "@/infrastructure/postgres/source-lineage-repository";

const t0 = "2026-01-01T00:00:00.000Z";
const t1 = "2026-01-01T00:01:00.000Z";
const t3 = "2026-01-01T00:03:00.000Z";
const hash = "a".repeat(64);

function authority(external: string, retrievedAt = t1) {
  const artifact = createSourceArtifact({ providerId: "p", datasetId: "d", datasetVersion: "v1", providerSourceNamespace: "FIXTURE", providerExternalRecordId: external, payloadFingerprint: hash, recordedAt: t1 });
  const envelope = createSourceEnvelope({ sourceArtifactId: artifact.sourceArtifactId, parserContractVersion: "parser/v1", envelopeSchemaVersion: "envelope/v1", normalizedEnvelope: { external }, selectedAuditableFields: { external }, payloadFingerprint: hash, observedAt: t0, temporalQualityStatus: "RESOLVED", temporalDiagnosticCodes: [], recordedAt: t1 });
  const attempt = createIngestionAttempt({ ingestionRequestId: "request-1", attemptNumber: 1, adapterVersion: "adapter/v1", parserVersion: "parser/v1", executionInput: {}, startedAt: t0 });
  const recordedAt = retrievedAt > t1 ? t3 : t1;
  const observation = createSourceObservation({ ingestionAttemptId: attempt.ingestionAttemptId, sourceArtifactId: artifact.sourceArtifactId, responsePageOrdinal: 0, itemOrdinal: 0, retrievedAt, metadata: { pageOrdinal: 0, cursorSafety: "NONE" }, recordedAt });
  const claim = createRetrievalAvailabilityClaim({ envelope, observation, recordedAt });
  return { artifact, envelope, observation, claim, attempt, lifecycleStatus: "COMPLETED" as const };
}

describe("M5 source-lineage authority", () => {
  it("normalizes claim membership and derives artifacts/attempts/timestamps", () => {
    const first = authority("a");
    const second = authority("b", "2026-01-01T00:02:00.000Z");
    const result = createSourceLineage({ providerId: "p", datasetId: "d", datasetVersion: "v1", members: [second, first], recordedAt: t1 });
    expect(result.lineage.availabilityClaimIds).toEqual([...result.lineage.availabilityClaimIds].sort());
    expect(result.lineage.sourceArtifactIds).toHaveLength(2);
    expect(result.lineage.ingestionAttemptIds).toHaveLength(1);
    expect(result.lineage.memberCount).toBe(2);
    expect(result.lineage.effectiveAvailableAt).toBe("2026-01-01T00:02:00.000Z");
    expect(Object.isFrozen(result.lineage)).toBe(true);
    expect(Object.isFrozen(result.lineage.availabilityClaimIds)).toBe(true);
    expect(Object.isFrozen(result.members[0])).toBe(true);
  });

  it("excludes recordedAt from deterministic identity and fingerprint", () => {
    const first = authority("a");
    const one = createSourceLineage({ providerId: "p", datasetId: "d", datasetVersion: "v1", members: [first], recordedAt: t1 });
    const two = createSourceLineage({ providerId: "p", datasetId: "d", datasetVersion: "v1", members: [first], recordedAt: "2026-01-01T00:09:00.000Z" });
    expect(two.lineage.sourceLineageId).toBe(one.lineage.sourceLineageId);
    expect(two.lineage.fingerprint).toBe(one.lineage.fingerprint);
    expect(sourceLineageIdFor(one.lineage)).toBe(one.lineage.sourceLineageId);
    expect(sourceLineageFingerprint(one.lineage)).toBe(one.lineage.fingerprint);
  });

  it("keeps source lineage independent from downstream candidate and identity authorities", () => {
    const source = readFileSync("src/domain/intelligence/source-lineage.ts", "utf8");
    for (const forbidden of ["candidateId", "mappingRevisionId", "canonicalAssetId", "canonicalIdentifier", "assetClass", "purpose"]) expect(source).not.toContain(forbidden);
  });

  it("rejects duplicate claims and unsupported attempt status", () => {
    const first = authority("a");
    expect(() => createSourceLineage({ providerId: "p", datasetId: "d", datasetVersion: "v1", members: [first, first], recordedAt: t1 })).toThrow("M5_SOURCE_LINEAGE_CLAIM_INVALID");
    expect(() => createSourceLineage({ providerId: "p", datasetId: "d", datasetVersion: "v1", members: [{ ...first, lifecycleStatus: "FAILED" as never }], recordedAt: t1 })).toThrow("M5_SOURCE_LINEAGE_ATTEMPT_INVALID");
  });

  it("accepts PARTIAL but rejects a cross-scope claim", () => {
    const partial = { ...authority("a"), lifecycleStatus: "PARTIAL" as const };
    expect(createSourceLineage({ providerId: "p", datasetId: "d", datasetVersion: "v1", members: [partial], recordedAt: t1 }).lineage.memberCount).toBe(1);
    expect(() => createSourceLineage({ providerId: "other", datasetId: "d", datasetVersion: "v1", members: [partial], recordedAt: t1 })).toThrow("M5_SOURCE_LINEAGE_SCOPE_MISMATCH");
  });

  it("keeps migration server-only and forward-only", () => {
    const sql = readFileSync("supabase/migrations/20260917012625_m5_source_lineage.sql", "utf8");
    expect(sql).toContain("create table public.intelligence_source_lineages");
    expect(sql).toContain("create table public.intelligence_source_lineage_members");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.intelligence_source_lineages from anon, authenticated");
    expect(sql).toContain("reject_intelligence_mutation()");
    expect(sql).toContain("M5_SOURCE_LINEAGE_REQUIRES_EMPTY_PROVENANCE_TABLES");
    expect(sql).not.toMatch(/\binsert\s+into\s+public\./i);
    expect(sql).not.toMatch(/\b(update|delete)\s+public\./i);
    expect(sql).not.toContain("SECURITY DEFINER");
  });

  it("rejects corrupted stored parent and member rows", () => {
    const value = authority("mapper");
    const built = createSourceLineage({ providerId: "p", datasetId: "d", datasetVersion: "v1", members: [value], recordedAt: t1 });
    const parentRow = {
      contract_version: built.lineage.contractVersion,
      source_lineage_id: built.lineage.sourceLineageId,
      provider_id: built.lineage.providerId,
      dataset_id: built.lineage.datasetId,
      dataset_version: built.lineage.datasetVersion,
      availability_claim_ids: built.lineage.availabilityClaimIds,
      source_artifact_ids: built.lineage.sourceArtifactIds,
      ingestion_attempt_ids: built.lineage.ingestionAttemptIds,
      member_count: built.lineage.memberCount,
      observed_at: built.lineage.observedAt,
      effective_available_at: built.lineage.effectiveAvailableAt,
      fingerprint: built.lineage.fingerprint,
      recorded_at: built.lineage.recordedAt,
    };
    expect(Object.isFrozen(mapSourceLineageRow(parentRow))).toBe(true);
    expect(() => mapSourceLineageRow({ ...parentRow, source_lineage_id: "forged" })).toThrow("M5_SOURCE_LINEAGE_STORED_FINGERPRINT_INVALID");
    expect(() => mapSourceLineageRow({ ...parentRow, fingerprint: "b".repeat(64) })).toThrow("M5_SOURCE_LINEAGE_STORED_FINGERPRINT_INVALID");
    expect(() => mapSourceLineageRow({ ...parentRow, contract_version: "m5-source-lineage/v999" })).toThrow("M5_SOURCE_LINEAGE_STORED_CONTRACT_INVALID");
    const member = built.members[0];
    const memberRow = {
      source_lineage_id: member.sourceLineageId,
      member_ordinal: member.memberOrdinal,
      availability_claim_id: member.availabilityClaimId,
      source_artifact_id: member.sourceArtifactId,
      source_envelope_id: member.sourceEnvelopeId,
      source_observation_id: member.sourceObservationId,
      ingestion_attempt_id: member.ingestionAttemptId,
      provider_id: member.providerId,
      dataset_id: member.datasetId,
      dataset_version: member.datasetVersion,
      observed_at: member.observedAt,
      effective_available_at: member.effectiveAvailableAt,
      member_fingerprint: member.memberFingerprint,
    };
    expect(Object.isFrozen(mapSourceLineageMemberRow(memberRow))).toBe(true);
    expect(() => mapSourceLineageMemberRow({ ...memberRow, member_fingerprint: "b".repeat(64) })).toThrow("M5_SOURCE_LINEAGE_MEMBER_FINGERPRINT_INVALID");
    expect(() => mapSourceLineageMemberRow({ ...memberRow, member_ordinal: 1 })).toThrow("M5_SOURCE_LINEAGE_MEMBER_FINGERPRINT_INVALID");
  });

  it("keeps creation transaction-only and locks attempts before rereading lifecycle history", () => {
    const source = readFileSync("src/infrastructure/postgres/source-lineage-repository.ts", "utf8");
    expect(source).toMatch(/function createRepository\(client: TransactionSql\)/);
    expect(source).not.toMatch(/export function createRepository/);
    expect(source).toMatch(/for update`;/);
    expect(source.indexOf("for update`;")).toBeLessThan(source.indexOf("from public.intelligence_ingestion_events"));
    expect(source).toMatch(/client\.begin\(async transaction => work\(createRepository\(transaction\)\)\)/);
  });
});
