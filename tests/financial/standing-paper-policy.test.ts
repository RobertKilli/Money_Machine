import { describe, expect, it } from "vitest";
import { runDeterministicBacktest, type BacktestRunConfig } from "@/application/backtest/run-deterministic-backtest";
import { StandingPaperPolicyRunner } from "@/application/paper-trading/run-standing-paper-policy";
import { price } from "@/domain/financial/price";
import { money } from "@/domain/financial/money";
import { assessStandingPaperPolicy, transitionPaperPolicy, type PaperPolicyContext, type StandingPaperPolicy } from "@/domain/risk/standing-paper-policy";
import { contributionRebalancing, FIXTURE_ASSETS, FIXTURE_DATASET_VERSION, type FixturePriceObservation } from "@/domain/strategy/fixture-assets";

const now = new Date("2026-01-01T10:07:00.000Z");
const prices: readonly FixturePriceObservation[] = FIXTURE_ASSETS.map((asset, index) => ({
  recordId: `paper-price-${index}`, assetId: asset.assetId, price: price("NOK", BigInt((index + 1) * 10_000), 4),
  observedAt: new Date("2026-01-01T10:00:00.000Z"), availableAt: new Date("2026-01-01T10:01:00.000Z"),
  ingestedAt: new Date("2026-01-01T10:02:00.000Z"), datasetVersion: FIXTURE_DATASET_VERSION,
}));
const draft: StandingPaperPolicy = {
  policyId: "paper-test-v1", version: "standing-paper-policy/v1", identity: "synthetic-test",
  mode: "PAPER_ONLY", status: "DRAFT", financialAccountId: "paper-test-account",
  allowedInstrumentIds: FIXTURE_ASSETS.map((asset) => asset.assetId), capitalBudgetMinor: 1_000_000n,
  maxOrderMinor: 1_000_000n, maxPositionMinor: 1_000_000n, maxGrossExposureMinor: 1_000_000n,
  maxLossMinor: 1_000_000n, maxPriceAgeMs: 7 * 24 * 60 * 60 * 1_000,
};
const policy = transitionPaperPolicy(draft, "ACTIVATE");
const decision = contributionRebalancing({ financialAccountId: policy.financialAccountId, decisionId: "decision-1", cash: money("NOK", 100_000n), decisionTimestamp: now, prices });
const order = decision.proposedOrders[0]!;
const context = (overrides: Partial<PaperPolicyContext> = {}): PaperPolicyContext => ({
  now, assets: FIXTURE_ASSETS, prices, openOrderReservationsMinor: [], committedCapitalMinor: 0n,
  currentCashMinor: 100_000n, currentPositionMinor: 0n, currentGrossExposureMinor: 0n,
  currentLossMinor: 0n, prospectiveOrderDebitMinor: 1_000n, ...overrides,
});
const config: Omit<BacktestRunConfig, "standingPaperPolicy"> = {
  startAt: "2026-01-01T10:00:00.000Z", endAt: "2026-01-01T13:00:00.000Z", baseCurrency: "NOK", financialAccountId: policy.financialAccountId,
  contributionEvents: [10, 11, 12].map((hour) => ({ eventId: `round-${hour}`, availableAt: `2026-01-01T${hour}:07:00.000Z`, amountMinor: "100000", currency: "NOK" })),
  valuationTimestamps: [], strategyVersion: "contribution-rebalancing/v1", riskPolicyVersion: "m1-risk-policy/v1",
  executionPolicyVersion: "m1-market-execution/v1", portfolioValuationVersion: "portfolio-valuation/v1",
  fifoCostBasisVersion: "fifo-cost-basis/v1", assetRegistryVersion: "fixture-asset-registry/v1", marketDatasetVersion: FIXTURE_DATASET_VERSION,
};

describe("standing PAPER_ONLY risk policy", () => {
  it("approves eligible synthetic trades without a per-trade approval state", () => {
    const result = assessStandingPaperPolicy(policy, order, context());
    expect(result.disposition).toBe("APPROVE");
    expect(result.policyVersion).toBe("standing-paper-policy/v1");
    expect(result.priceRecordId).toBe(order.referencePriceRecordId);
    expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ["ORDER_LIMIT_EXCEEDED", { maxOrderMinor: 1n }, { prospectiveOrderDebitMinor: 2n }],
    ["POSITION_LIMIT_EXCEEDED", { maxPositionMinor: 1n }, { currentPositionMinor: 1n, prospectiveOrderDebitMinor: 1n }],
    ["EXPOSURE_LIMIT_EXCEEDED", { maxGrossExposureMinor: 1n }, { prospectiveOrderDebitMinor: 2n }],
    ["CAPITAL_BUDGET_EXCEEDED", { capitalBudgetMinor: 3n }, { committedCapitalMinor: 1n, prospectiveOrderDebitMinor: 3n }],
    ["LOSS_LIMIT_EXCEEDED", { maxLossMinor: 1n }, { currentLossMinor: 2n }],
  ] as const)("vetoes %s", (code, policyChange, contextChange) => {
    const result = assessStandingPaperPolicy({ ...policy, ...policyChange }, order, context(contextChange));
    expect(result.reasonCode).toBe(code);
    expect(result.disposition).toBe("REJECT");
  });

  it("rejects stale and missing price evidence", () => {
    const stale = prices.map((item) => ({ ...item, availableAt: new Date("2026-01-01T09:00:00.000Z") }));
    expect(assessStandingPaperPolicy({ ...policy, maxPriceAgeMs: 60_000 }, order, context({ prices: stale })).reasonCode).toBe("PRICE_STALE");
    expect(assessStandingPaperPolicy(policy, order, context({ prices: [] })).reasonCode).toBe("PRICE_MISSING");
  });

  it("requires explicit activation, allows pause and stop, and rejects while inactive", () => {
    expect(assessStandingPaperPolicy(draft, order, context()).reasonCode).toBe("POLICY_NOT_ACTIVE");
    const paused = transitionPaperPolicy(policy, "PAUSE");
    expect(assessStandingPaperPolicy(paused, order, context()).reasonCode).toBe("POLICY_NOT_ACTIVE");
    expect(assessStandingPaperPolicy(transitionPaperPolicy(policy, "STOP"), order, context()).reasonCode).toBe("POLICY_NOT_ACTIVE");
    expect(() => transitionPaperPolicy(transitionPaperPolicy(policy, "STOP"), "ACTIVATE")).toThrow("PAPER_POLICY_TRANSITION_INVALID");
  });

  it("binds open-order reservations against cash and total budget", () => {
    const reserved = assessStandingPaperPolicy({ ...policy, capitalBudgetMinor: 5_000n }, order, context({ openOrderReservationsMinor: [4_500n], prospectiveOrderDebitMinor: 1_000n }));
    expect(reserved.reservedOpenOrdersMinor).toBe("4500");
    expect(reserved.reasonCode).toBe("CAPITAL_BUDGET_EXCEEDED");
  });

  it("runs multiple automatic rounds and labels fills as simulated", () => {
    const result = runDeterministicBacktest({ ...config, standingPaperPolicy: policy }, prices);
    expect(result.decisions).toHaveLength(3);
    expect(result.executions.length).toBeGreaterThan(1);
    expect(result.paperPolicyDecisions.every((item) => item.evidence.policyVersion === policy.version)).toBe(true);
    expect(result.endingState.integrityStatus).toBe("CONSISTENT");
  });

  it("returns one result under replay and simultaneous attempts, and rejects changed input on a reused key", async () => {
    const runner = new StandingPaperPolicyRunner();
    const [first, concurrent, replay] = await Promise.all([
      runner.run(policy, config, prices, "same-command"), runner.run(policy, config, prices, "same-command"), runner.run(policy, config, prices, "same-command"),
    ]);
    expect(concurrent).toBe(first);
    expect(replay).toBe(first);
    await expect(runner.run(policy, { ...config, endAt: "2026-01-01T14:00:00.000Z" }, prices, "same-command")).rejects.toThrow("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_INPUT");
  });
});
