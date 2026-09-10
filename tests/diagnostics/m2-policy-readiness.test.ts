import { describe, expect, it } from "vitest";
import { money } from "@/domain/financial/money";
import { projectPortfolio } from "@/domain/portfolio/portfolio-projection";
import { assessProposal } from "@/domain/risk/m1-risk";
import { contributionRebalancing, FIXTURE_ASSETS } from "@/domain/strategy/fixture-assets";
import { AS_OF, portfolioFixture, withBuy } from "../helpers/portfolio-fixtures";

// Deliberately red policy-conformance probes, not new financial implementations.
// Run explicitly with vitest.m2-readiness.config.ts. No hosted state or wall clock.
// Expected results come from FINANCIAL_POLICIES.md section 5.
function scenario(cash: bigint, holdingValue: bigint) {
  const evidence = withBuy(portfolioFixture(cash + holdingValue + 101n), "acquisition",
    holdingValue * 20_000n, holdingValue, 101n);
  const portfolio = projectPortfolio(evidence, AS_OF);
  expect(portfolio.valuationStatus).toBe("COMPLETE");
  expect(portfolio.cash).toBe(cash.toString());
  expect(portfolio.investedMarketValue).toBe(holdingValue.toString());
  const decision = contributionRebalancing({ financialAccountId: evidence.financialAccountId,
    decisionId: "policy-readiness", cash: money("NOK", BigInt(portfolio.cash)),
    decisionTimestamp: AS_OF, assets: evidence.assets, prices: evidence.prices,
    portfolioState: { cashMinor: BigInt(portfolio.cash), decisionNavMinor: BigInt(portfolio.nav!),
      holdings: portfolio.holdings.map(h => ({ assetId: h.assetId, marketValueMinor: BigInt(h.marketValueMinor!) })),
      existingMarketValueByAsset: Object.fromEntries(portfolio.holdings.map(h => [h.assetId, BigInt(h.marketValueMinor!)])),
      priceRecordIds: portfolio.provenance.priceRecordIds } });
  return { evidence, portfolio, decision };
}

describe("M2 prerequisite: existing M1 engines conform to frozen held-portfolio policy", () => {
  it("reserves 11000 minor units from NAV 110000, not 1000 from cash 10000", () => {
    const { decision, portfolio } = scenario(10_000n, 100_000n);
    expect(portfolio.nav).toBe("110000");
    expect(decision.reserve.minorUnits).toBe(11_000n);
    expect(decision.proposedOrders).toHaveLength(0);
  });

  it("does not buy an already-overweight GLOBAL holding", () => {
    const { decision, portfolio } = scenario(60_000n, 140_000n);
    expect(portfolio.nav).toBe("200000");
    // GLOBAL target is 120000; its current value is already 140000.
    expect(decision.proposedOrders.some(order => order.assetId === FIXTURE_ASSETS[0]!.assetId)).toBe(false);
  });

  it("risk vetoes a GLOBAL purchase when existing exposure already exceeds its 65% cap", () => {
    const { portfolio, evidence } = scenario(60_000n, 140_000n);
    const order = contributionRebalancing({ financialAccountId: evidence.financialAccountId, decisionId: "probe", cash: money("NOK", 60_000n), decisionTimestamp: AS_OF, assets: evidence.assets, prices: evidence.prices }).proposedOrders.find(item => item.assetId === FIXTURE_ASSETS[0]!.assetId)!;
    const risk = assessProposal(order, { accountActive: true, simulationMode: true,
      strategyEnabled: true, strategyVersion: "contribution-rebalancing/v1", accountCurrency: "NOK",
      availableCash: money("NOK", 60_000n), decisionNav: money("NOK", BigInt(portfolio.nav!)),
      decisionTimestamp: AS_OF, assets: evidence.assets, prices: evidence.prices,
      portfolioState: { cashMinor: 60_000n, decisionNavMinor: BigInt(portfolio.nav!), holdings: portfolio.holdings.map(h => ({ assetId: h.assetId, marketValueMinor: BigInt(h.marketValueMinor!) })), existingMarketValueByAsset: Object.fromEntries(portfolio.holdings.map(h => [h.assetId, BigInt(h.marketValueMinor!)])), priceRecordIds: portfolio.provenance.priceRecordIds } });
    // The cap is 130000, below the existing 140000 holding before this proposal.
    expect(risk.disposition).toBe("REJECT");
    expect(risk.violations.map(item => item.code)).toContain("ALLOCATION_LIMIT_EXCEEDED");
  });
});
