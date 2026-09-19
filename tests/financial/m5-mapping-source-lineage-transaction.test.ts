import { describe, expect, it } from "vitest";
import { createAssetMappingRevisionFromSourceLineage } from "@/application/intelligence/create-asset-mapping-revision-from-source-lineage";
import { createProviderAssetIdentityAssertion } from "@/domain/intelligence/provider-asset-identity-assertion";

const lineage = (overrides: Record<string, unknown> = {}) => ({ contractVersion: "m5-source-lineage/v1", sourceLineageId: "lineage-1", providerId: "p", datasetId: "d", datasetVersion: "v", availabilityClaimIds: ["claim"], sourceArtifactIds: ["artifact-b", "artifact-a"], ingestionAttemptIds: ["attempt"], memberCount: 1, observedAt: "2026-01-01T00:00:00.000Z", effectiveAvailableAt: "2026-01-01T00:01:00.000Z", fingerprint: "f".repeat(64), recordedAt: "2026-01-01T00:02:00.000Z", ...overrides });
const assertion = createProviderAssetIdentityAssertion({ providerId: "p", datasetId: "d", datasetVersion: "v", providerSourceNamespace: "CHAIN:TEST", providerAssetId: "asset", identityType: "EVM_CONTRACT_ADDRESS", identityNamespace: "eip155:1", identityValue: "0xabcdef0123456789abcdef0123456789abcdef01", sourceArtifactId: "artifact", sourceEnvelopeId: "envelope", parserVersion: "parser/v1", envelopeSchemaVersion: "schema/v1", sourcePayloadFingerprint: "f".repeat(64), recordedAt: "2026-01-01T00:02:00.000Z" });
const value = (overrides: Record<string, unknown> = {}) => ({ sourceLineageId: "lineage-1", providerAssetIdentityAssertionId: assertion.providerAssetIdentityAssertionId, canonicalAssetId: "canonical", canonicalIdentifier: "canonical:asset", assetClass: "CRYPTO", mappingRevisionVersion: "mapping/v1", validFrom: "2026-01-01T00:00:00.000Z", recordedAt: "2026-01-01T00:02:00.000Z", ...overrides });
const execute = async (lineageOverrides: Record<string, unknown> = {}, valueOverrides: Record<string, unknown> = {}, validator?: () => Promise<never>) => {
  const saves: unknown[] = [];
  const sourceLineageRepository = { readById: async () => lineage(lineageOverrides), readMembers: async () => [{ sourceArtifactId: "artifact", sourceEnvelopeId: "envelope", providerId: "p", datasetId: "d", datasetVersion: "v" }], createFromClaims: async () => lineage(), ...(validator ? { validateForMappingCreation: validator } : {}) };
  const providerAssetIdentityAssertionRepository = { readById: async () => assertion };
  const mappingRepository = { save: async (mapping: unknown) => { saves.push(mapping); return mapping; }, readCandidatesAt: async () => [] };
  let transactions = 0;
  const unitOfWork = { withTransaction: async <T>(work: (repositories: { sourceLineageRepository: typeof sourceLineageRepository; providerAssetIdentityAssertionRepository: typeof providerAssetIdentityAssertionRepository; mappingRepository: typeof mappingRepository }) => Promise<T>): Promise<T> => { transactions += 1; return work({ sourceLineageRepository, providerAssetIdentityAssertionRepository, mappingRepository }); } };
  const result = await createAssetMappingRevisionFromSourceLineage({ unitOfWork: unitOfWork as never, value: value(valueOverrides) });
  return { result, saves, transactions };
};

describe("M5 mapping/source-lineage application authority", () => {
  it("validates one lineage, derives all provenance fields, and returns the authoritative save result", async () => {
    const { result, saves, transactions } = await execute();
    expect(transactions).toBe(1);
    expect(saves).toHaveLength(1);
    expect(result).toBe(saves[0]);
    expect(result).toMatchObject({ sourceRecordIds: ["artifact-a", "artifact-b"], payloadFingerprint: "f".repeat(64), observedAt: "2026-01-01T00:00:00.000Z", availableAt: "2026-01-01T00:01:00.000Z" });
  });

  it.each([["providerId", "other"], ["datasetId", "other"], ["datasetVersion", "other"]])("rejects %s scope mismatch before save", async (field, other) => {
    await expect(execute({ [field]: "lineage-value" }, { [field]: other })).rejects.toThrow("M5_MAPPING_SOURCE_LINEAGE_SCOPE_MISMATCH");
  });

  it.each([["PARTIAL", "M5_MAPPING_SOURCE_LINEAGE_ATTEMPT_PARTIAL"], ["FAILED", "M5_MAPPING_SOURCE_LINEAGE_ATTEMPT_FAILED"], ["CANCELLED", "M5_MAPPING_SOURCE_LINEAGE_ATTEMPT_CANCELLED"], ["OPEN", "M5_MAPPING_SOURCE_LINEAGE_ATTEMPT_OPEN"]])("rejects %s authoritative lifecycle before save", async (_status, code) => {
    await expect(execute({}, {}, async () => { throw new Error(code); })).rejects.toThrow(code);
  });

  it("propagates missing, corrupt, and sealed-lineage failures without saving", async () => {
    const cases = ["M5_MAPPING_SOURCE_LINEAGE_NOT_FOUND", "M5_SOURCE_LINEAGE_STORED_FINGERPRINT_INVALID", "M5_SOURCE_LINEAGE_SEAL_INCOMPLETE", "M5_SOURCE_LINEAGE_MEMBER_MISMATCH"];
    for (const code of cases) await expect(execute({}, {}, async () => { throw new Error(code); })).rejects.toThrow(code);
  });

  it("does not accept caller overrides for derived provenance", async () => {
    const { result } = await execute({}, { sourceRecordIds: ["forged"], payloadFingerprint: "forged", observedAt: "2027-01-01T00:00:00.000Z", availableAt: "2027-01-01T00:01:00.000Z" });
    expect(result.sourceRecordIds).toEqual(["artifact-a", "artifact-b"]);
    expect(result.payloadFingerprint).toBe("f".repeat(64));
    expect(result.observedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result.availableAt).toBe("2026-01-01T00:01:00.000Z");
  });

  it("propagates transaction/database failures and never saves", async () => {
    const saves: unknown[] = [];
    const unitOfWork = { withTransaction: async () => { throw new Error("DATABASE_FAILURE"); } };
    await expect(createAssetMappingRevisionFromSourceLineage({ unitOfWork: unitOfWork as never, value: value() })).rejects.toThrow("DATABASE_FAILURE");
    expect(saves).toHaveLength(0);
  });
});
