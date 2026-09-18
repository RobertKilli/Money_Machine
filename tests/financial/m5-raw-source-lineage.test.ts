import { describe, expect, it, vi } from "vitest";
import { createRawEligibilityEvidenceFromMapping } from "@/application/intelligence/create-raw-eligibility-evidence-from-mapping";
import { createAssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import { createRawEligibilityEvidenceReadRepository } from "@/infrastructure/postgres/eligibility-evidence-repository";

const t = "2026-01-01T00:00:00.000Z";
const a = "2026-01-01T00:01:00.000Z";
const lineageData = { sourceLineageId: "lineage-1", providerId: "p", datasetId: "d", datasetVersion: "v1", sourceArtifactIds: ["artifact-a", "artifact-b"], ingestionAttemptIds: ["attempt-a"], observedAt: t, effectiveAvailableAt: a, fingerprint: "f".repeat(64) };
const lineage = lineageData as never;
const mapping = createAssetMappingRevision({ mappingRevisionVersion: "mapping/v1", providerId: "p", datasetId: "d", datasetVersion: "v1", sourceLineageId: "lineage-1", providerAssetNamespace: "FIXTURE", providerAssetId: "external", canonicalAssetId: "asset-1", canonicalIdentifier: "asset:1", assetClass: "CRYPTO", validFrom: "2025-01-01T00:00:00.000Z", observedAt: t, availableAt: a, sourceRecordIds: ["artifact-a", "artifact-b"], payloadFingerprint: lineageData.fingerprint, recordedAt: a });

const input = (overrides: Record<string, unknown> = {}) => ({ evidenceId: "evidence-1", mappingRevisionId: mapping.mappingRevisionId, candidateId: "candidate-1", family: "VENUE" as const, payload: { venueId: "venue-1", eligibilityState: "ELIGIBLE" as const }, ...overrides });

describe("M5 raw source-lineage creation", () => {
  it("keeps autocommit provisioning read-only", () => {
    const reader = createRawEligibilityEvidenceReadRepository(({} as never));
    expect(typeof reader.readAt).toBe("function");
    expect("save" in reader).toBe(false);
  });
  it("derives all shared authority fields and saves once", async () => {
    const save = vi.fn(async (record) => record);
    const result = await createRawEligibilityEvidenceFromMapping({ unitOfWork: { withTransaction: async work => work({ mappingRepository: { readById: async () => mapping } as never, sourceLineageRepository: { validateForRawEvidenceCreation: async () => lineage } as never, rawEvidenceRepository: { save } }) }, value: input() });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ evidenceId: "evidence-1", sourceLineageId: "lineage-1", providerId: "p", datasetId: "d", datasetVersion: "v1", assetId: "asset-1", observedAt: t, availableAt: a, provenance: { sourceType: "M5_SOURCE_LINEAGE", sourceRecordIds: ["artifact-a", "artifact-b"], payloadFingerprint: "f".repeat(64) } });
  });

  it("does not allow caller-derived provenance to override lineage", async () => {
    const save = vi.fn();
    await expect(createRawEligibilityEvidenceFromMapping({ unitOfWork: { withTransaction: async work => work({ mappingRepository: { readById: async () => mapping } as never, sourceLineageRepository: { validateForRawEvidenceCreation: async () => lineage } as never, rawEvidenceRepository: { save } }) }, value: input({ payload: { venueId: "venue-1", eligibilityState: "ELIGIBLE", sourceLineageId: "forged", observedAt: "2027-01-01T00:00:00.000Z" } }) as never })).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects a source lineage that cannot be authoritative", async () => {
    const save = vi.fn();
    await expect(createRawEligibilityEvidenceFromMapping({ unitOfWork: { withTransaction: async work => work({ mappingRepository: { readById: async () => mapping } as never, sourceLineageRepository: { validateForRawEvidenceCreation: async () => { throw new Error("M5_RAW_SOURCE_LINEAGE_ATTEMPT_PARTIAL"); } } as never, rawEvidenceRepository: { save } }) }, value: input() })).rejects.toThrow("M5_RAW_SOURCE_LINEAGE_ATTEMPT_PARTIAL");
    expect(save).not.toHaveBeenCalled();
  });
});
