import { describe, expect, it } from "vitest";
import { createM5MarketMetricsAuthority } from "@/domain/intelligence/m5-market-metrics-authority";

const asOf = "2026-02-01T00:00:00.000Z";
const sha = "a".repeat(64);
const base = { sourceArtifactId: "artifact", sourceEnvelopeId: "envelope", sourceObservationId: "observation", providerExternalRecordId: "provider", payloadFingerprint: sha, scale: 2, quoteCurrency: "USD", observedAt: "2026-01-31T23:00:00.000Z", availableAt: "2026-01-31T23:30:00.000Z" };
const materials = [
  { ...base, metricKind: "MARKET_CAP" as const, valueAtoms: 15_000_000n, basis: "MARKET_CAP_REPORTED" },
  { ...base, metricKind: "VOLUME" as const, sourceObservationId: "observation-volume", valueAtoms: 750_000n, basis: "ROLLING_24H_REPORTED", windowStart: "2026-01-31T00:00:00.000Z", windowEnd: "2026-01-31T23:00:00.000Z" },
  { ...base, metricKind: "LIQUIDITY" as const, sourceObservationId: "observation-liquidity", valueAtoms: 1_250_000n, basis: "COMPLETE_LIQUIDITY_UNIVERSE", coverageVersion: "universe/v1", componentIds: ["pool-a", "pool-b"], components: [{ id: "pool-a", valueAtoms: 750_000n, scale: 2, quoteCurrency: "USD" }, { id: "pool-b", valueAtoms: 500_000n, scale: 2, quoteCurrency: "USD" }] },
];

describe("M5 market metrics authority", () => {
  it("creates exactly three distinct, immutable derivations", () => {
    const result = createM5MarketMetricsAuthority({ providerId: "provider", datasetId: "dataset", datasetVersion: "fixture/v1", sourceLineageId: "lineage", asOf, quoteCurrency: "USD", materials, recordedAt: asOf });
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.derivations.map(d => [d.metricKind, d.valueAtoms])).toEqual([["MARKET_CAP", 15000000n], ["VOLUME", 750000n], ["LIQUIDITY", 1250000n]]);
    expect(new Set(result.derivations.map(d => d.fingerprint)).size).toBe(3);
    expect(Object.isFrozen(result.authority)).toBe(true);
  });

  it("rejects FDV fallback, incomplete liquidity and invalid volume window", () => {
    expect(createM5MarketMetricsAuthority({ providerId: "p", datasetId: "d", datasetVersion: "v", sourceLineageId: "l", asOf, quoteCurrency: "USD", materials: materials.map(m => m.metricKind === "MARKET_CAP" ? { ...m, basis: "FDV" } : m), recordedAt: asOf }).status).toBe("INVALID");
    expect(createM5MarketMetricsAuthority({ providerId: "p", datasetId: "d", datasetVersion: "v", sourceLineageId: "l", asOf, quoteCurrency: "USD", materials: materials.map(m => m.metricKind === "LIQUIDITY" ? { ...m, componentIds: ["pool-a"], components: [{ id: "pool-a", valueAtoms: 1_250_000n, scale: 2, quoteCurrency: "USD" }] } : m), recordedAt: asOf }).status).toBe("INCOMPLETE");
    expect(createM5MarketMetricsAuthority({ providerId: "p", datasetId: "d", datasetVersion: "v", sourceLineageId: "l", asOf, quoteCurrency: "USD", materials: materials.map(m => m.metricKind === "VOLUME" ? { ...m, windowEnd: "2026-02-02T00:00:00.000Z" } : m), recordedAt: asOf }).status).toBe("INVALID");
  });

  it("is permutation invariant and handles bigint values beyond Number", () => {
    const huge = materials.map(m => m.metricKind === "LIQUIDITY" ? { ...m, valueAtoms: m.valueAtoms + 18_014_398_509_481_984n, components: m.components!.map((c, i) => ({ ...c, valueAtoms: c.valueAtoms + (i === 0 ? 9_007_199_254_740_992n : 9_007_199_254_740_992n) })) } : { ...m, valueAtoms: m.valueAtoms + 9_007_199_254_740_992n });
    const first = createM5MarketMetricsAuthority({ providerId: "p", datasetId: "d", datasetVersion: "v", sourceLineageId: "l", asOf, quoteCurrency: "USD", materials: huge, recordedAt: "2026-02-01T00:01:00.000Z" });
    const second = createM5MarketMetricsAuthority({ providerId: "p", datasetId: "d", datasetVersion: "v", sourceLineageId: "l", asOf, quoteCurrency: "USD", materials: [...huge].reverse(), recordedAt: "2026-02-01T00:02:00.000Z" });
    expect(first.status).toBe("READY"); expect(second.status).toBe("READY");
    if (first.status !== "READY" || second.status !== "READY") return;
    expect(first.authority.fingerprint).toBe(second.authority.fingerprint);
    expect(first.authority.authorityId).toBe(second.authority.authorityId);
  });
});
