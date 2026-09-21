import { describe, expect, it } from "vitest";
import { createM5DailySeriesAuthority } from "@/domain/intelligence/m5-daily-series-authority";
import { deriveM5CryptoDailyMetrics } from "@/domain/intelligence/m5-daily-derivations";

const F = 1_000_000_000_000n;
const prices = [100n, 200n, 400n, 800n, 1600n, 3200n, 6400n, 12800n, 25600n, 51200n, 102400n, 204800n, 409600n, 819200n, 2457600n].map(value => value * F);
const asOf = "2026-02-01T00:00:00.000Z";
const observations = prices.map((closeValue, index) => ({ ordinal: index, observationId: `daily-${index}`, sourceArtifactId: `artifact-${index}`, sourceEnvelopeId: `envelope-${index}`, sourceObservationId: `observation-${index}`, providerExternalRecordId: `provider-${index}`, payloadFingerprint: `${index.toString(16).padStart(2, "0")}${"a".repeat(62)}`, observedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`, availableAt: `2026-01-${String(index + 2).padStart(2, "0")}T00:00:00.000Z`, closeValue, priceScale: 12, quoteUnit: "USD" as const }));
const floorSqrt = (value: bigint): bigint => { if (value < 0n) throw new Error("negative"); let low = 0n; let high = value + 1n; while (high - low > 1n) { const mid = (low + high) / 2n; if (mid * mid <= value) low = mid; else high = mid; } return low; };

describe("M5 daily series authority", () => {
  it("reuses the existing derivations and produces exact known values", () => {
    const result = deriveM5CryptoDailyMetrics(observations.map(({ observationId, observedAt, availableAt, closeValue, priceScale, quoteUnit }) => ({ observationId, observedAt, availableAt, closeValue, priceScale, quoteUnit })), asOf);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.historySpan.value).toBe(14n);
    expect(result.volatility.value).toBe(2575n);
    const returns = prices.slice(1).map((price, index) => ((price - prices[index]!) * 10_000n) / prices[index]!);
    const meanNumerator = returns.reduce((sum, value) => sum + value, 0n);
    const sumSquares = returns.reduce((sum, value) => sum + value * value, 0n);
    const varianceNumerator = 14n * sumSquares - meanNumerator * meanNumerator;
    expect(returns).toEqual([...Array(13).fill(10_000n), 20_000n]);
    expect(meanNumerator).toBe(150_000n);
    expect(sumSquares).toBe(1_700_000_000n);
    expect(varianceNumerator).toBe(1_300_000_000n);
    expect(floorSqrt(varianceNumerator)).toBe(36_055n);
    expect(floorSqrt(varianceNumerator) / 14n).toBe(2_575n);
  });

  it("creates a deep immutable authority and excludes recordedAt from its fingerprint", () => {
    const first = createM5DailySeriesAuthority({ providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "fixture/v1", providerSourceNamespace: "fixture:daily", sourceLineageId: "lineage-1", chainId: "eip155:1", contractAddress: "0x0000000000000000000000000000000000000001", providerAssetIdentity: "fixture-asset", observations, asOf, recordedAt: "2026-02-01T00:01:00.000Z" });
    const second = createM5DailySeriesAuthority({ providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "fixture/v1", providerSourceNamespace: "fixture:daily", sourceLineageId: "lineage-1", chainId: "eip155:1", contractAddress: "0x0000000000000000000000000000000000000001", providerAssetIdentity: "fixture-asset", observations: [...observations].reverse(), asOf, recordedAt: "2026-02-01T00:02:00.000Z" });
    expect(first.status).toBe("READY"); expect(second.status).toBe("READY");
    if (first.status !== "READY" || second.status !== "READY") return;
    expect(first.authority.fingerprint).toBe(second.authority.fingerprint);
    expect(first.authority.authorityId).toBe(second.authority.authorityId);
    expect(Object.isFrozen(first.authority)).toBe(true);
    expect(Object.isFrozen(first.authority.observations)).toBe(true);
    expect(first.historySpan.value).toBe(14n);
    expect(first.volatility.value).toBe(2575n);
    expect(first.authority.observations[0]!.closeValue).toBe(100n * F);
  });

  it("fails closed for duplicate timestamps and insufficient material", () => {
    const duplicate = createM5DailySeriesAuthority({ providerId: "p", datasetId: "d", datasetVersion: "v", providerSourceNamespace: "n", sourceLineageId: "l", chainId: "eip155:1", contractAddress: "0x0000000000000000000000000000000000000001", providerAssetIdentity: "a", observations: observations.map((row, i) => i === 1 ? { ...row, observedAt: observations[0]!.observedAt } : row), asOf, recordedAt: asOf });
    expect(duplicate.status).toBe("INVALID");
    const incomplete = createM5DailySeriesAuthority({ providerId: "p", datasetId: "d", datasetVersion: "v", providerSourceNamespace: "n", sourceLineageId: "l", chainId: "eip155:1", contractAddress: "0x0000000000000000000000000000000000000001", providerAssetIdentity: "a", observations: observations.slice(0, 2), asOf, recordedAt: asOf });
    expect(incomplete.status).toBe("INCOMPLETE");
  });
});
