import { describe, expect, it, vi } from "vitest";
import { createM5DailySeriesAuthority } from "@/domain/intelligence/m5-daily-series-authority";
import { createProviderAssetIdentityAssertion } from "@/domain/intelligence/provider-asset-identity-assertion";
import { createAssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import { persistM5DailySeriesEvidence, type M5DailySeriesEvidenceRepositories, type M5DailySeriesEvidenceUnitOfWork } from "@/application/intelligence/m5-daily-series-evidence";
import type { RawEligibilityEvidence } from "@/domain/intelligence/eligibility-evidence";

const t = (day: number) => `2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z`;
const address = `0x${"1".repeat(40)}`;
const F = 1_000_000_000_000n;
const prices = [100n, 200n, 400n, 800n, 1600n, 3200n, 6400n, 12800n, 25600n, 51200n, 102400n, 204800n, 409600n, 819200n, 2457600n];
const observations = prices.map((price, i) => ({ ordinal: i, observationId: `observation-${i}`, sourceArtifactId: `artifact-${i}`, sourceEnvelopeId: `envelope-${i}`, sourceObservationId: `source-observation-${i}`, providerExternalRecordId: `external-${i}`, observedAt: t(i + 1), availableAt: t(i + 2), closeValue: price * F, priceScale: 12, quoteUnit: "USD", payloadFingerprint: (i.toString(16).padStart(64, "0")) }));
const built = createM5DailySeriesAuthority({ providerId: "provider", datasetId: "daily", datasetVersion: "v1", providerSourceNamespace: "fixture:daily", sourceLineageId: "lineage-1", chainId: "eip155:1", contractAddress: address, providerAssetIdentity: "asset-1", observations, asOf: t(16), recordedAt: t(16) });
if (built.status !== "READY") throw new Error("fixture");
const aggregate = { authority: built.authority, historySpan: built.historySpan, volatility: built.volatility };
const lineage = { sourceLineageId: "lineage-1", providerId: "provider", datasetId: "daily", datasetVersion: "v1", observedAt: built.authority.latestObservedAt, effectiveAvailableAt: built.authority.availableAt, sourceArtifactIds: built.authority.sourceArtifactIds, fingerprint: "a".repeat(64) } as never;
const assertion = createProviderAssetIdentityAssertion({ providerId: "provider", datasetId: "daily", datasetVersion: "v1", providerSourceNamespace: "fixture:daily", providerAssetId: "asset-1", sourceArtifactId: "artifact-0", sourceEnvelopeId: "envelope-0", parserVersion: "parser/v1", envelopeSchemaVersion: "schema/v1", identityType: "EVM_CONTRACT_ADDRESS", identityNamespace: "eip155:1", identityValue: address, sourcePayloadFingerprint: "b".repeat(64), recordedAt: t(16) });
const mapping = createAssetMappingRevision({ mappingRevisionVersion: "mapping/v1", providerId: "provider", datasetId: "daily", datasetVersion: "v1", sourceLineageId: "lineage-1", providerAssetIdentityAssertionId: assertion.providerAssetIdentityAssertionId, providerAssetNamespace: "fixture:daily", providerAssetId: "asset-1", canonicalAssetId: "canonical-1", canonicalIdentifier: "asset:one", assetClass: "CRYPTO", validFrom: "2025-01-01T00:00:00.000Z", observedAt: built.authority.latestObservedAt, availableAt: built.authority.availableAt, sourceRecordIds: built.authority.sourceArtifactIds, payloadFingerprint: "a".repeat(64), recordedAt: t(16) });

type Save = (value: RawEligibilityEvidence) => Promise<RawEligibilityEvidence>;
const repositories = (save: Save, dailySeries: { readonly readById: () => Promise<typeof aggregate | undefined> }): M5DailySeriesEvidenceRepositories => ({ mapping: { readById: async () => mapping }, lineage: { readById: async () => lineage, validateForRawEvidenceCreation: async () => lineage }, assertion: { readById: async () => assertion }, dailySeries, evidence: { save } });
const uow = (save: Save = async (value) => value): M5DailySeriesEvidenceUnitOfWork => ({ withTransaction: async <T>(work: (value: M5DailySeriesEvidenceRepositories) => Promise<T>) => work(repositories(save, { readById: async () => aggregate })) });

describe("M5 daily-series quantitative evidence binding", () => {
  it("persists exactly HISTORY_SPAN and VOLATILITY from the persisted pair", async () => {
    const save = vi.fn<Save>(async (value) => value);
    const result = await persistM5DailySeriesEvidence({ unitOfWork: uow(save), mappingRevisionId: mapping.mappingRevisionId, authorityId: aggregate.authority.authorityId, candidateId: "candidate-1" });
    expect(result.status).toBe("PERSISTED");
    expect(save).toHaveBeenCalledTimes(2);
    const quantitative = save.mock.calls.map(([e]) => {
      expect(e.evidenceKind).toBe("QUANTITATIVE");
      if (e.evidenceKind !== "QUANTITATIVE") throw new Error("unexpected evidence kind");
      return e;
    });
    expect(quantitative.map(e => e.metricKind)).toEqual(["HISTORY_SPAN", "VOLATILITY"]);
    expect(quantitative[0]!.valueAtoms).toBe(14n);
    expect(quantitative[1]!.valueAtoms).toBe(2575n);
    expect(quantitative[0]!.dailySeriesAuthorityFingerprint).toBe(aggregate.authority.fingerprint);
    expect(quantitative[0]!.dailySeriesDerivationFingerprint).toBe(aggregate.historySpan.fingerprint);
    expect(quantitative[1]!.dailySeriesDerivationFingerprint).toBe(aggregate.volatility.fingerprint);
  });

  it("does not write when daily authority is missing and propagates the second-write failure", async () => {
    const missing = await persistM5DailySeriesEvidence({ unitOfWork: { withTransaction: async <T>(work: (value: M5DailySeriesEvidenceRepositories) => Promise<T>) => work(repositories(async value => value, { readById: async () => undefined })) }, mappingRevisionId: mapping.mappingRevisionId, authorityId: "missing", candidateId: "candidate-1" });
    expect(missing.status).toBe("INCOMPLETE");
    let writes = 0;
    const save: Save = async (value) => {
      writes += 1;
      if (writes === 2) throw new Error("M5_RAW_EVIDENCE_CONFLICT");
      return value;
    };
    await expect(persistM5DailySeriesEvidence({ unitOfWork: uow(save), mappingRevisionId: mapping.mappingRevisionId, authorityId: aggregate.authority.authorityId, candidateId: "candidate-1" })).rejects.toThrow("M5_RAW_EVIDENCE_CONFLICT");
  });
});
