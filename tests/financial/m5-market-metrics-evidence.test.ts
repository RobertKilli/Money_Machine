import { describe, expect, it, vi } from "vitest";
import { createM5MarketMetricsAuthority, type M5MarketMetricsAuthorityAggregate } from "@/domain/intelligence/m5-market-metrics-authority";
import { createProviderAssetIdentityAssertion } from "@/domain/intelligence/provider-asset-identity-assertion";
import { createAssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import { persistM5MarketMetricsEvidence, type M5MarketMetricsEvidenceRepositories, type M5MarketMetricsEvidenceUnitOfWork } from "@/application/intelligence/m5-market-metrics-evidence";
import type { RawEligibilityEvidence } from "@/domain/intelligence/eligibility-evidence";

const asOf = "2026-02-01T00:00:00.000Z"; const sha = "a".repeat(64);
const materials = [
  { metricKind: "MARKET_CAP" as const, sourceArtifactId: "artifact-cap", sourceEnvelopeId: "envelope-cap", sourceObservationId: "observation-cap", providerExternalRecordId: "cap", payloadFingerprint: sha, valueAtoms: 15_000_000n, scale: 2, quoteCurrency: "USD", observedAt: "2026-01-31T23:00:00.000Z", availableAt: "2026-01-31T23:30:00.000Z", basis: "MARKET_CAP_REPORTED" },
  { metricKind: "VOLUME" as const, sourceArtifactId: "artifact-volume", sourceEnvelopeId: "envelope-volume", sourceObservationId: "observation-volume", providerExternalRecordId: "volume", payloadFingerprint: sha, valueAtoms: 750_000n, scale: 2, quoteCurrency: "USD", observedAt: "2026-01-31T23:00:00.000Z", availableAt: "2026-01-31T23:30:00.000Z", basis: "ROLLING_24H_REPORTED", windowStart: "2026-01-31T00:00:00.000Z", windowEnd: "2026-02-01T00:00:00.000Z" },
  { metricKind: "LIQUIDITY" as const, sourceArtifactId: "artifact-liquidity", sourceEnvelopeId: "envelope-liquidity", sourceObservationId: "observation-liquidity", providerExternalRecordId: "liquidity", payloadFingerprint: sha, valueAtoms: 1_250_000n, scale: 2, quoteCurrency: "USD", observedAt: "2026-01-31T23:00:00.000Z", availableAt: "2026-01-31T23:30:00.000Z", basis: "COMPLETE_LIQUIDITY_UNIVERSE", coverageVersion: "universe/v1", coverageComplete: true, expectedComponentCount: 2, componentIds: ["pool-a", "pool-b"], components: [{ id: "pool-a", valueAtoms: 750_000n, scale: 2, quoteCurrency: "USD" }, { id: "pool-b", valueAtoms: 500_000n, scale: 2, quoteCurrency: "USD" }] },
];
const built = createM5MarketMetricsAuthority({ providerId: "provider", datasetId: "market", datasetVersion: "v1", sourceLineageId: "lineage-1", asOf, quoteCurrency: "USD", materials, recordedAt: asOf });
if (built.status !== "READY") throw new Error("market fixture");
const aggregate: M5MarketMetricsAuthorityAggregate = { authority: built.authority, derivations: built.derivations };
const lineage = { sourceLineageId: "lineage-1", providerId: "provider", datasetId: "market", datasetVersion: "v1", observedAt: aggregate.authority.observedAt, effectiveAvailableAt: aggregate.authority.effectiveAvailableAt, sourceArtifactIds: ["artifact-cap", "artifact-volume", "artifact-liquidity"], fingerprint: sha } as never;
const assertion = createProviderAssetIdentityAssertion({ providerId: "provider", datasetId: "market", datasetVersion: "v1", providerSourceNamespace: "fixture:market", providerAssetId: "asset-1", sourceArtifactId: "artifact-cap", sourceEnvelopeId: "envelope-cap", parserVersion: "parser/v1", envelopeSchemaVersion: "schema/v1", identityType: "EVM_CONTRACT_ADDRESS", identityNamespace: "eip155:1", identityValue: `0x${"1".repeat(40)}`, sourcePayloadFingerprint: sha, recordedAt: asOf });
const mapping = createAssetMappingRevision({ mappingRevisionVersion: "mapping/v1", providerId: "provider", datasetId: "market", datasetVersion: "v1", sourceLineageId: "lineage-1", providerAssetIdentityAssertionId: assertion.providerAssetIdentityAssertionId, providerAssetNamespace: "fixture:market", providerAssetId: "asset-1", canonicalAssetId: "canonical-1", canonicalIdentifier: "asset:one", assetClass: "CRYPTO", validFrom: "2025-01-01T00:00:00.000Z", observedAt: aggregate.authority.observedAt, availableAt: aggregate.authority.effectiveAvailableAt, sourceRecordIds: ["artifact"], payloadFingerprint: sha, recordedAt: asOf });
type Save = (value: RawEligibilityEvidence) => Promise<RawEligibilityEvidence>;
const repositories = (save: Save, market = aggregate): M5MarketMetricsEvidenceRepositories => ({ mapping: { readById: async () => mapping }, lineage: { readById: async () => lineage, validateForRawEvidenceCreation: async () => lineage }, assertion: { readById: async () => assertion }, market: { readById: async () => market }, evidence: { save } });
const uow = (save: Save = async value => value, market = aggregate): M5MarketMetricsEvidenceUnitOfWork => ({ withTransaction: async work => work(repositories(save, market)) });

describe("M5 market metrics evidence binding", () => {
  it("persists the exact three metric pair atomically from authority", async () => {
    const save = vi.fn<Save>(async value => value);
    const result = await persistM5MarketMetricsEvidence({ unitOfWork: uow(save), mappingRevisionId: mapping.mappingRevisionId, authorityId: aggregate.authority.authorityId, candidateId: "candidate-1" });
    expect(result.status).toBe("PERSISTED"); expect(save).toHaveBeenCalledTimes(3);
    const rows = save.mock.calls.map(([row]) => row); expect(rows.map(row => row.evidenceKind === "QUANTITATIVE" ? row.metricKind : "")).toEqual(["MARKET_CAP", "VOLUME", "LIQUIDITY"]);
    expect(rows.every(row => row.evidenceKind === "QUANTITATIVE" && row.marketMetricsAuthorityFingerprint === aggregate.authority.fingerprint)).toBe(true);
  });

  it("returns incomplete for top-pool-only and propagates database failure", async () => {
    const incomplete = createM5MarketMetricsAuthority({ providerId: "provider", datasetId: "market", datasetVersion: "v1", sourceLineageId: "lineage-1", asOf, quoteCurrency: "USD", materials: materials.map(material => material.metricKind === "LIQUIDITY" ? { ...material, componentIds: ["pool-a"], components: [material.components![0]!] } : material), recordedAt: asOf });
    expect(incomplete.status).toBe("INCOMPLETE");
    let writes = 0;
    await expect(persistM5MarketMetricsEvidence({ unitOfWork: uow(async value => { writes += 1; if (writes === 2) throw new Error("M5_RAW_EVIDENCE_CONFLICT"); return value; }), mappingRevisionId: mapping.mappingRevisionId, authorityId: aggregate.authority.authorityId, candidateId: "candidate-1" })).rejects.toThrow("M5_RAW_EVIDENCE_CONFLICT");
  });
});
