import { describe, expect, it } from "vitest";
import { createAssetMappingRevisionFromSourceLineage } from "@/application/intelligence/create-asset-mapping-revision-from-source-lineage";

describe("M5 mapping/source-lineage transaction boundary", () => {
  it("passes one repository pair from one unit-of-work transaction", async () => {
    const lineage = { contractVersion: "m5-source-lineage/v1", sourceLineageId: "lineage-1", providerId: "p", datasetId: "d", datasetVersion: "v", availabilityClaimIds: ["claim"], sourceArtifactIds: ["artifact"], ingestionAttemptIds: ["attempt"], memberCount: 1, observedAt: "2026-01-01T00:00:00.000Z", effectiveAvailableAt: "2026-01-01T00:01:00.000Z", fingerprint: "f".repeat(64), recordedAt: "2026-01-01T00:02:00.000Z" } as const;
    const sourceLineageRepository = { readById: async () => lineage, readMembers: async () => [], createFromClaims: async () => lineage };
    const mappingRepository = { save: async <T>(mapping: T) => mapping, readCandidatesAt: async () => [] };
    const unitOfWork = { withTransaction: async <T>(work: (repositories: { sourceLineageRepository: typeof sourceLineageRepository; mappingRepository: typeof mappingRepository }) => Promise<T>): Promise<T> => work({ sourceLineageRepository, mappingRepository }) };
    const result = await createAssetMappingRevisionFromSourceLineage({ unitOfWork, value: { sourceLineageId: "lineage-1", providerId: "p", datasetId: "d", datasetVersion: "v", providerSourceNamespace: "CHAIN:TEST", providerAssetId: "asset", canonicalAssetId: "canonical", canonicalIdentifier: "canonical:asset", assetClass: "CRYPTO", mappingRevisionVersion: "mapping/v1", validFrom: "2026-01-01T00:00:00.000Z", recordedAt: "2026-01-01T00:02:00.000Z" } });
    expect(result.sourceLineageId).toBe("lineage-1");
  });
});
