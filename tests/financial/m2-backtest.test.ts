import { describe, expect, it } from "vitest";
import { price } from "@/domain/financial/price";
import { FIXTURE_ASSETS, FIXTURE_DATASET_VERSION, CONTRIBUTION_REBALANCING_VERSION, FIXTURE_ASSET_REGISTRY_VERSION } from "@/domain/strategy/fixture-assets";
import { runDeterministicBacktest, BACKTEST_REPLAY_VERSION, type BacktestRunConfig } from "@/application/backtest/run-deterministic-backtest";

const t0 = "2026-01-01T00:00:00.000Z";
const prices = FIXTURE_ASSETS.map((a, i) => ({ recordId: `m2-price-${i}`, assetId: a.assetId, price: price("NOK", BigInt(5000 + i * 100), 4), observedAt: new Date(t0), availableAt: new Date(t0), ingestedAt: new Date(t0), datasetVersion: FIXTURE_DATASET_VERSION as typeof FIXTURE_DATASET_VERSION }));
const config = (overrides: Partial<BacktestRunConfig> = {}): BacktestRunConfig => ({ startAt: t0, endAt: "2026-01-03T00:00:00.000Z", baseCurrency: "NOK", contributionEvents: [{ eventId: "initial", availableAt: "2026-01-01T00:00:00.000Z", amountMinor: "100000", currency: "NOK" }], valuationTimestamps: ["2026-01-02T00:00:00.000Z"], strategyVersion: CONTRIBUTION_REBALANCING_VERSION, riskPolicyVersion: "m1-risk-policy/v1", executionPolicyVersion: "m1-market-execution/v1", portfolioValuationVersion: "portfolio-valuation/v1", fifoCostBasisVersion: "fifo-cost-basis/v1", assetRegistryVersion: FIXTURE_ASSET_REGISTRY_VERSION, marketDatasetVersion: FIXTURE_DATASET_VERSION, ...overrides });

describe("M2 deterministic historical replay", () => {
  it("replays explicitly configured contributions and valuation-only timestamps", () => {
    const result = runDeterministicBacktest(config(), prices);
    expect(result.configHash).toHaveLength(64); expect(result.runId).toHaveLength(64); expect(result.portfolioSnapshots.length).toBe(2);
    expect(result.decisions).toHaveLength(1); expect(result.endingState.nav).not.toBeNull();
  });
  it("is reproducible and isolated from future rows and dataset changes", () => {
    const a = runDeterministicBacktest(config(), prices); const future = [...prices, { ...prices[0]!, recordId: "future", availableAt: new Date("2027-01-01T00:00:00Z") }]; const b = runDeterministicBacktest(config(), future);
    expect(b).toEqual(a);
    const other = runDeterministicBacktest({ ...config(), contributionEvents: [{ ...config().contributionEvents[0]!, amountMinor: "100001" }] }, prices); expect(other.configHash).not.toBe(a.configHash);
  });
  it("rejects unsupported pinned versions", () => expect(() => runDeterministicBacktest({ ...config(), strategyVersion: "unsupported" as never }, prices)).toThrow("UNSUPPORTED_POLICY_VERSION"));
  it("uses deterministic IDs and preserves balanced isolated journals", () => {
    const result = runDeterministicBacktest(config(), prices); const again = runDeterministicBacktest(config(), prices);
    expect(result.decisions.map(d => d.decisionId)).toEqual(again.decisions.map(d => d.decisionId));
    for (const journal of result.journals) for (const commodity of ["MONEY:NOK", ...FIXTURE_ASSETS.map(a => `ASSET:${a.assetId}`)]) {
      const entries = journal.entries.filter(e => e.ledgerAccount.commodity.kind === "MONEY" ? commodity === `MONEY:${e.ledgerAccount.commodity.currencyCode}` : commodity === `ASSET:${e.ledgerAccount.commodity.assetId}`);
      const signed = entries.reduce((n, e) => n + (e.direction === "DEBIT" ? e.amountAtoms : -e.amountAtoms), 0n); expect(signed).toBe(0n);
    }
  });
  it("exports the frozen replay protocol version", () => expect(BACKTEST_REPLAY_VERSION).toBe("backtest-replay/v1"));
});
