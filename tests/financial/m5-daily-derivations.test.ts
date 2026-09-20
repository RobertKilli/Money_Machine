import { describe, expect, it } from "vitest";
import {
  CRYPTO_DAILY_CADENCE_POLICY_VERSION,
  deriveHistorySpan,
  deriveM5CryptoDailyMetrics,
  deriveVolatility,
  integerSquareRoot,
  normalizeCryptoDailyCloseSeries,
  type DailyCloseObservationInput,
} from "@/domain/intelligence/m5-daily-derivations";
import { floorDivision } from "@/domain/financial/rounding";

const asOf = "2026-01-20T00:00:00.000Z";

function series(values: readonly bigint[] = Array.from({ length: 15 }, () => 100n), options: Partial<DailyCloseObservationInput> = {}): DailyCloseObservationInput[] {
  return values.map((closeValue, index) => ({
    observationId: `observation-${index + 1}`,
    observedAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    availableAt: new Date(Date.UTC(2026, 0, 1 + index, 1)).toISOString(),
    closeValue,
    priceScale: 2,
    quoteUnit: "USD",
    ...options,
  }));
}

describe("M5 crypto daily derivations", () => {
  it("normalizes an unordered valid 15-day series and freezes output", () => {
    const input = series().reverse();
    const result = normalizeCryptoDailyCloseSeries(input, asOf);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.series.map(row => row.observationId)).toEqual(input.slice().reverse().map(row => row.observationId));
    expect(result.returnCount).toBe(14);
    expect(result.maximumObservedGap).toBe(86_400_000n);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.series)).toBe(true);
    expect(Object.isFrozen(result.series[0])).toBe(true);
    expect(result.seriesFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ["empty", [] as DailyCloseObservationInput[], "M5_DAILY_SERIES_EMPTY"],
    ["14 observations", series().slice(0, 14), "M5_DAILY_SERIES_INSUFFICIENT_OBSERVATIONS"],
    ["under 14 days", series().map((row, index) => ({ ...row, observedAt: new Date(Date.UTC(2026, 0, 1, index)).toISOString() })), "M5_DAILY_SERIES_INSUFFICIENT_COVERAGE"],
    ["gap over 48 hours", series().map((row, index) => index >= 8 ? { ...row, observedAt: new Date(Date.UTC(2026, 0, index + 4)).toISOString(), availableAt: new Date(Date.UTC(2026, 0, index + 4, 1)).toISOString() } : row), "M5_DAILY_SERIES_GAP_EXCEEDED"],
  ])("classifies %s as incomplete", (_name, input, code) => {
    const result = normalizeCryptoDailyCloseSeries(input, asOf);
    expect(result.status).toBe("INCOMPLETE");
    if (result.status === "INCOMPLETE") expect(result.diagnostics).toContain(code);
  });

  it.each([
    ["duplicate timestamp", () => series().map((row, index) => index === 1 ? { ...row, observedAt: series()[0]!.observedAt } : row), "M5_DAILY_SERIES_DUPLICATE_TIMESTAMP"],
    ["duplicate observation", () => series().map((row, index) => index === 1 ? { ...row, observationId: series()[0]!.observationId } : row), "M5_DAILY_SERIES_DUPLICATE_OBSERVATION"],
    ["mixed scale", () => series().map((row, index) => index === 1 ? { ...row, priceScale: 3 } : row), "M5_DAILY_SERIES_SCALE_MISMATCH"],
    ["mixed unit", () => series().map((row, index) => index === 1 ? { ...row, quoteUnit: "EUR" } : row), "M5_DAILY_SERIES_UNIT_MISMATCH"],
    ["nonpositive price", () => series().map((row, index) => index === 1 ? { ...row, closeValue: 0n } : row), "M5_DAILY_SERIES_PRICE_INVALID"],
    ["noncanonical timestamp", () => series().map((row, index) => index === 1 ? { ...row, observedAt: "2026-01-02T00:00:00Z" } : row), "M5_DAILY_SERIES_TIME_INVALID"],
    ["observed after available", () => series().map((row, index) => index === 1 ? { ...row, availableAt: "2026-01-01T00:00:00.000Z" } : row), "M5_DAILY_SERIES_TIME_INVALID"],
    ["future availability", () => series().map((row, index) => index === 1 ? { ...row, availableAt: "2026-02-01T00:00:00.000Z" } : row), "M5_DAILY_SERIES_FUTURE_AVAILABILITY"],
    ["range violation", () => series().map((row, index) => index === 1 ? { ...row, closeValue: 1n << 63n } : row), "M5_DAILY_SERIES_RANGE_INVALID"],
  ])("classifies %s as invalid", (_name, makeInput, code) => {
    const result = normalizeCryptoDailyCloseSeries(makeInput(), asOf);
    expect(result.status).toBe("INVALID");
    if (result.status === "INVALID") expect(result.diagnostics).toContain(code);
  });

  it("allows the exact 48-hour gap and exact 14-day coverage boundary", () => {
    const input = series().map((row, index) => index >= 1 ? { ...row, observedAt: new Date(Date.UTC(2026, 0, index + 2)).toISOString(), availableAt: new Date(Date.UTC(2026, 0, index + 2, 1)).toISOString() } : row);
    const result = normalizeCryptoDailyCloseSeries(input, asOf);
    expect(result.status).toBe("READY");
  });

  it("derives history span with elapsed UTC days and no evaluator threshold", () => {
    const result = deriveHistorySpan(series(), asOf);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.material.metricKind).toBe("HISTORY_SPAN");
    expect(result.material.value).toBe(14n);
    expect(result.material.unit).toBe("DAYS");
    expect(result.material.scale).toBe(0);
    expect(result.material.derivationVersion).toBe("history-span/crypto-daily/v1");
    expect(result.material.cadencePolicyVersion).toBe(CRYPTO_DAILY_CADENCE_POLICY_VERSION);
    expect(result.material.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("floors intraday history span and crosses month/leap boundaries without a calendar", () => {
    const input = series().map((row, index) => ({ ...row, observedAt: new Date(Date.UTC(2024, 1, 28 + index, 12)).toISOString(), availableAt: new Date(Date.UTC(2024, 1, 28 + index, 13)).toISOString() }));
    const result = deriveHistorySpan(input, "2024-03-20T00:00:00.000Z");
    expect(result.status).toBe("READY");
    if (result.status === "READY") expect(result.material.value).toBe(14n);
  });

  it("computes signed floor returns and population volatility using integers", () => {
    const prices = [10000n, 11000n, 10000n, ...Array.from({ length: 12 }, () => 10000n)];
    const result = deriveVolatility(series(prices), asOf);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.material.metricKind).toBe("VOLATILITY");
    expect(result.material.value).toBe(361n);
    expect(result.material.unit).toBe("BPS");
    expect(result.material.scale).toBe(0);
    expect(result.material.returnCount).toBe(14);
    // Independent hand vector: returns are [1000, -910, 0 × 12].
    // sum = 90, sumSquares = 1_828_100, variance numerator =
    // 14 × 1_828_100 − 90² = 25_585_300, floor(sqrt(...)/14) = 361.
    expect([1000n, -910n, ...Array.from({ length: 12 }, () => 0n)]).toHaveLength(14);
    expect(14n * 1_828_100n - 90n * 90n).toBe(25_585_300n);
    expect(result.material.value).toBe(361n);
  });

  it("supports constant prices, signed floor division and deterministic integer sqrt", () => {
    const constant = deriveVolatility(series(), asOf);
    expect(constant.status).toBe("READY");
    if (constant.status === "READY") expect(constant.material.value).toBe(0n);
    expect(floorDivision(0n, 3n)).toBe(0n);
    expect(floorDivision(4n, 3n)).toBe(1n);
    expect(floorDivision(-1n, 3n)).toBe(-1n);
    expect(floorDivision(-4n, 3n)).toBe(-2n);
    expect(floorDivision(-3n, 3n)).toBe(-1n);
    expect(() => floorDivision(1n, 0n)).toThrow("Divisor must be positive");
    expect(integerSquareRoot(25n)).toBe(5n);
    expect(integerSquareRoot(26n)).toBe(5n);
    expect(integerSquareRoot(0n)).toBe(0n);
    expect(integerSquareRoot(1n)).toBe(1n);
    expect(integerSquareRoot(24n)).toBe(4n);
    expect(integerSquareRoot(26n)).toBe(5n);
    expect(integerSquareRoot(10n ** 30n)).toBe(10n ** 15n);
    expect(() => integerSquareRoot(-1n)).toThrow("M5_DAILY_SERIES_RANGE_INVALID");
    for (const value of [0n, 1n, 2n, 3n, 24n, 25n, 26n, 10n ** 30n]) {
      const root = integerSquareRoot(value);
      expect(root * root <= value).toBe(true);
      expect(value < (root + 1n) * (root + 1n)).toBe(true);
    }
  });

  it("accepts the database bigint upper boundary and freezes material output", () => {
    const result = deriveM5CryptoDailyMetrics(series(Array.from({ length: 15 }, () => (1n << 63n) - 1n)), asOf);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.historySpan)).toBe(true);
    expect(Object.isFrozen(result.historySpan.orderedObservationIds)).toBe(true);
    expect(result.historySpan.value).toBe(14n);
  });

  it("is permutation invariant and changes fingerprint for every material mutation", () => {
    const input = series();
    const a = deriveM5CryptoDailyMetrics(input, asOf);
    const b = deriveM5CryptoDailyMetrics([...input].reverse(), asOf);
    expect(b).toEqual(a);
    if (a.status !== "READY") return;
    const changedPrice = deriveHistorySpan(input.map((row, index) => index === 5 ? { ...row, closeValue: 101n } : row), asOf);
    const changedObserved = deriveHistorySpan(input.map((row, index) => index === 5 ? { ...row, observedAt: "2026-01-06T01:00:00.000Z" } : row), asOf);
    const changedAvailable = deriveHistorySpan(input.map((row, index) => index === 5 ? { ...row, availableAt: "2026-01-06T02:00:00.000Z" } : row), asOf);
    const changedId = deriveHistorySpan(input.map((row, index) => index === 5 ? { ...row, observationId: "changed" } : row), asOf);
    const changedScale = deriveHistorySpan(input.map(row => ({ ...row, priceScale: 3 })), asOf);
    const changedUnit = deriveHistorySpan(input.map(row => ({ ...row, quoteUnit: "EUR" })), asOf);
    for (const result of [changedPrice, changedObserved, changedAvailable, changedId]) {
      expect(result.status).toBe("READY");
      if (result.status === "READY") expect(result.material.fingerprint).not.toBe(a.historySpan.fingerprint);
    }
    expect(changedScale.status).toBe("READY");
    expect(changedUnit.status).toBe("READY");
    if (changedScale.status === "READY") expect(changedScale.material.fingerprint).not.toBe(a.historySpan.fingerprint);
    if (changedUnit.status === "READY") expect(changedUnit.material.fingerprint).not.toBe(a.historySpan.fingerprint);
    expect(a.historySpan.derivationVersion).not.toBe(a.volatility.derivationVersion);
    expect(a.historySpan.fingerprint).not.toBe(a.volatility.fingerprint);
    expect(a.historySpan).not.toHaveProperty("evidenceId");
    expect(a.historySpan).not.toHaveProperty("mappingRevisionId");
    expect(a.historySpan).not.toHaveProperty("sourceLineageId");
  });
});
