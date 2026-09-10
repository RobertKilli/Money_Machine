import { describe, expect, it } from "vitest";

import { money } from "@/domain/financial/money";
import { price } from "@/domain/financial/price";
import { assessProposal } from "@/domain/risk/m1-risk";
import { contributionRebalancing, FIXTURE_ASSETS, FIXTURE_DATASET_VERSION, type FixturePriceObservation } from "@/domain/strategy/fixture-assets";

const decisionTimestamp = new Date("2026-01-01T10:07:00.000Z");
const prices: readonly FixturePriceObservation[] = FIXTURE_ASSETS.map((asset, index) => ({
  recordId: `price-${asset.assetId}`, assetId: asset.assetId, price: price("NOK", BigInt((index + 1) * 10000), 4),
  observedAt: new Date("2026-01-01T10:00:00.000Z"), availableAt: new Date("2026-01-01T10:01:00.000Z"),
  ingestedAt: new Date("2026-01-01T10:02:00.000Z"), datasetVersion: FIXTURE_DATASET_VERSION,
}));

describe("Contribution Rebalancing", () => {
  it("reserves 10% and deterministically proposes the 60/25/15 fixture allocation", () => {
    const first = contributionRebalancing({ financialAccountId: "account", decisionId: "decision", cash: money("NOK", 100_000n), decisionTimestamp, prices });
    const second = contributionRebalancing({ financialAccountId: "account", decisionId: "decision", cash: money("NOK", 100_000n), decisionTimestamp, prices });
    expect(first.reserve.minorUnits).toBe(10_000n);
    expect(first.decisionNav.minorUnits).toBe(100_000n);
    expect(first.investableCash.minorUnits).toBe(90_000n);
    expect(first.proposedOrders).toEqual(second.proposedOrders);
    expect(first.proposedOrders).toHaveLength(3);
    expect(first.residualCash.minorUnits).toBeGreaterThanOrEqual(10_000n);
  });

  it("excludes prices not available at the decision timestamp", () => {
    const future = prices.map((candidate) => ({ ...candidate, availableAt: new Date("2026-01-01T10:10:00.000Z") }));
    const result = contributionRebalancing({ financialAccountId: "account", decisionId: "decision", cash: money("NOK", 100_000n), decisionTimestamp, prices: future });
    expect(result.proposedOrders).toHaveLength(0);
  });
});

describe("M1 risk", () => {
  it("approves a valid proposal independently", () => {
    const proposal = contributionRebalancing({ financialAccountId: "account", decisionId: "decision", cash: money("NOK", 100_000n), decisionTimestamp, prices }).proposedOrders[0]!;
    const result = assessProposal(proposal, { accountActive: true, simulationMode: true, strategyEnabled: true, strategyVersion: "contribution-rebalancing/v1", accountCurrency: "NOK", availableCash: money("NOK", 100_000n), decisionNav: money("NOK", 100_000n), decisionTimestamp, assets: FIXTURE_ASSETS, prices });
    expect(result.disposition).toBe("APPROVE");
    expect(result.violations).toHaveLength(0);
  });

  it("vetoes insufficient cash and future data with stable codes", () => {
    const proposal = contributionRebalancing({ financialAccountId: "account", decisionId: "decision", cash: money("NOK", 100_000n), decisionTimestamp, prices }).proposedOrders[0]!;
    const result = assessProposal(proposal, { accountActive: true, simulationMode: true, strategyEnabled: true, strategyVersion: "contribution-rebalancing/v1", accountCurrency: "NOK", availableCash: money("NOK", 1n), decisionNav: money("NOK", 100_000n), decisionTimestamp, assets: FIXTURE_ASSETS, prices: prices.map((candidate) => ({ ...candidate, availableAt: new Date("2026-01-01T10:10:00.000Z") })) });
    expect(result.disposition).toBe("REJECT");
    expect(result.violations.map((item) => item.code)).toEqual(expect.arrayContaining(["LOOKAHEAD_PRICE", "INSUFFICIENT_CASH", "CASH_RESERVE_VIOLATION"]));
  });
});
