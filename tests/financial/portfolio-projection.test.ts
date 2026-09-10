import { describe, expect, it } from "vitest";
import { projectPortfolio } from "@/domain/portfolio/portfolio-projection";
import { price } from "@/domain/financial/price";
import { FIXTURE_ASSETS } from "@/domain/strategy/fixture-assets";
import { GetPortfolioProjection } from "@/application/portfolio/get-portfolio-projection";
import { AS_OF, EARLY, portfolioFixture, withBuy } from "../helpers/portfolio-fixtures";

const project = (source = portfolioFixture()) => projectPortfolio(source, AS_OF);
const buy = (atoms = 270_000_000n) => withBuy(portfolioFixture(), "buy", atoms, 13_514n, 100n);

describe("ledger-derived portfolio", () => {
  it("cash-only needs no prices", () => { const p = project({ ...portfolioFixture(), prices: [] }); expect(p).toMatchObject({ cash: "100000", nav: "100000", investedMarketValue: "0", unrealizedPnl: "0", holdings: [], cashWeightBps: "10000" }); });
  it("empty portfolio is complete with undefined zero-NAV weights", () => { expect(project(portfolioFixture(0n))).toMatchObject({ cash: "0", nav: "0", totalOpenCostBasis: "0", unrealizedPnl: "0", holdings: [], valuationStatus: "COMPLETE", cashWeightBps: null, allocationRoundingResidueBps: null }); });
  it("one BUY reconciles cash, holding and fee-inclusive lot basis", () => { const p = project(buy()); expect(p.cash).toBe("86386"); expect(p.holdings[0]).toMatchObject({ quantityAtoms: "270000000", marketValueMinor: "13500", openCostBasisMinor: "13614", unrealizedPnlMinor: "-114" }); });
  it("multiple BUY fills aggregate ledger quantity and basis", () => { const p = project(withBuy(buy(), "second", 10_000n, 2n, 1n)); expect(p.holdings[0]).toMatchObject({ quantityAtoms: "270010000", openCostBasisMinor: "13617" }); expect(p.holdings[0]!.lots).toHaveLength(2); });
  it("multiple assets remain distinct", () => { const p = project(withBuy(buy(), "second", 20_000n, 1n, 1n, FIXTURE_ASSETS[1]!.assetId)); expect(p.holdings).toHaveLength(2); expect(p.investedMarketValue).toBe("13501"); });
  it("clearing and NOK cost debits are not holdings or extra NAV", () => { const p = project(buy()); expect(p.nav).toBe("99886"); expect(p.holdings).toHaveLength(1); });
  it("FIFO orders by acquisition time then lot ID", () => { let s = withBuy(portfolioFixture(), "z", 10_000n); s = withBuy(s, "a", 10_000n); s = withBuy(s, "earlier", 10_000n, 100n, 1n, FIXTURE_ASSETS[0]!.assetId, new Date("2025-12-31")); expect(project(s).holdings[0]!.lots.map(l => l.lotId)).toEqual(["earlier", "a", "z"]); });
  it("BUY lots remain fully open with explicit allocated fees", () => { const l = project(buy()).holdings[0]!.lots[0]!; expect(l).toMatchObject({ quantityAtoms: "270000000", remainingQuantityAtoms: "270000000", executedNotionalMinor: "13514", allocatedBuyFeeMinor: "100", openCostBasisMinor: "13614", fifoVersion: "fifo-cost-basis/v1" }); });
  it("exact minor-unit valuation", () => { expect(project(buy(20_000n)).holdings[0]!.marketValueMinor).toBe("1"); });
  it("fractional minor-unit valuation floors", () => { expect(project(buy(30_001n)).holdings[0]!.marketValueMinor).toBe("1"); });
  it("scaled price multiplication uses declared scale", () => { const s = buy(12_345n); s.prices = s.prices.map(p => ({ ...p, price: price("NOK", 123_456n, 2) })); expect(project(s).holdings[0]!.marketValueMinor).toBe("1524"); });
  it("aggregated holding rounds once, not per lot", () => { const s = withBuy(withBuy(portfolioFixture(), "a", 15_000n), "b", 15_000n); expect(project(s).holdings[0]!.marketValueMinor).toBe("1"); });
  it("one fill versus multiple fills has identical market value", () => { const one = project(withBuy(portfolioFixture(), "one", 30_000n, 200n, 2n)); const many = project(withBuy(withBuy(portfolioFixture(), "a", 15_000n), "b", 15_000n)); expect(one.holdings[0]!.marketValueMinor).toBe(many.holdings[0]!.marketValueMinor); expect(one.nav).toBe(many.nav); });
  it("NAV sums individually rounded holdings, not unrounded portfolio", () => { const s = withBuy(withBuy(portfolioFixture(), "a", 15_000n), "b", 15_000n, 100n, 1n, FIXTURE_ASSETS[1]!.assetId); const p = project(s); expect(p.investedMarketValue).toBe("0"); expect(p.nav).toBe(p.cash); });
  it("unrealized P&L uses rounded market value", () => { expect(project(buy(30_001n)).unrealizedPnl).toBe("-13613"); });
  it("allocation and cash weights FLOOR without redistribution", () => { const p = project(withBuy(portfolioFixture(3n), "a", 20_000n, 1n, 1n)); expect(p.nav).toBe("2"); expect(p.holdings[0]!.portfolioWeightBps).toBe("5000"); expect(p.cashWeightBps).toBe("5000"); const q = project(withBuy(portfolioFixture(4n), "a", 20_000n, 1n, 1n)); expect(q.holdings[0]!.portfolioWeightBps).toBe("3333"); expect(q.cashWeightBps).toBe("6666"); expect(q.allocationRoundingResidueBps).toBe("1"); });
  it("selected price is available by cutoff and provenance is retained", () => { const p = project(buy()); expect(p.holdings[0]!.selectedPrice?.availableAt).toBe(EARLY.toISOString()); expect(p.provenance.priceRecordIds).toHaveLength(1); expect(p.versions.valuation).toBe("portfolio-valuation/v1"); });
  it("future prices are excluded", () => { const s = buy(); const p = s.prices[0]!; s.prices = [...s.prices, { ...p, recordId: "future", availableAt: new Date("2027-01-01"), price: price("NOK", 999_999n, 4) }]; expect(project(s).holdings[0]!.selectedPrice?.recordId).toBe(p.recordId); });
  it("latest eligible price has deterministic timestamp and ID tiebreaks", () => { const s = buy(); const p = s.prices[0]!; s.prices = [{ ...p, recordId: "a" }, { ...p, recordId: "z" }, { ...p, recordId: "old", availableAt: new Date("2025-01-01") }]; expect(project(s).holdings[0]!.selectedPrice?.recordId).toBe("z"); });
  it("asOf excludes later fills and their ledger effects", () => { const s = withBuy(buy(), "later", 20_000n, 1n, 1n, FIXTURE_ASSETS[1]!.assetId, new Date("2027-01-01")); expect(project(s)).toEqual(project(buy())); });
  it("later-recorded backdated evidence is not leaked into history", () => { const s = buy(); s.ledger = s.ledger.map(e => e.transactionId === "buy" ? { ...e, recordedAt: new Date("2027-01-01") } : e); s.acquisitions = s.acquisitions.map(f => ({ ...f, recordedAt: new Date("2027-01-01") })); expect(project(s).holdings).toEqual([]); expect(project(s).cash).toBe("100000"); });
  it("missing price returns INCOMPLETE without fake zero NAV or P&L", () => { const p = project({ ...buy(), prices: [] }); expect(p).toMatchObject({ valuationStatus: "INCOMPLETE", nav: null, unrealizedPnl: null, cash: "86386", totalOpenCostBasis: "13614" }); expect(p.holdings[0]!.marketValueMinor).toBeNull(); expect(p.missingPriceAssets).toHaveLength(1); });
  it("one missing price prevents a partial total being called complete", () => { const s = withBuy(buy(), "b", 20_000n, 1n, 1n, FIXTURE_ASSETS[1]!.assetId); s.prices = s.prices.filter(p => p.assetId === FIXTURE_ASSETS[0]!.assetId); const p = project(s); expect(p.holdings[0]!.marketValueMinor).not.toBeNull(); expect(p.nav).toBeNull(); });
  it("ledger/fill quantity mismatch does not fabricate basis", () => { const s = buy(); s.acquisitions = s.acquisitions.map(f => ({ ...f, quantityAtoms: f.quantityAtoms + 1n })); const p = project(s); expect(p.violations).toContain("LEDGER_FILL_QUANTITY_MISMATCH"); expect(p.holdings[0]!.openCostBasisMinor).toBeNull(); expect(p.holdings[0]!.lots).toEqual([]); });
  it("absent acquisition evidence is explicit", () => { const p = project({ ...buy(), acquisitions: [] }); expect(p.violations).toContain("INCOMPLETE_COST_BASIS"); expect(p.totalOpenCostBasis).toBeNull(); });
  it("inconsistent settlement cash is rejected for basis", () => { const s = buy(); s.ledger = s.ledger.map(e => e.transactionId === "buy" && e.code === "CASH" ? { ...e, amountAtoms: e.amountAtoms + 1n } : e); expect(project(s).violations).toContain("SETTLEMENT_EVIDENCE_MISMATCH"); });
  it("execution/fill disagreement is explicit", () => { const s = buy(); s.acquisitions = s.acquisitions.map(f => ({ ...f, executionMatchesFill: false })); expect(project(s).integrityStatus).toBe("INCOMPLETE"); });
  it("unsupported acquisition policy cannot produce verified cost basis", () => {
    const s = buy();
    s.acquisitions = s.acquisitions.map(f => ({ ...f, executionPolicyVersion: "unsupported/v2" }));
    expect(project(s)).toMatchObject({ integrityStatus: "INCOMPLETE", totalOpenCostBasis: null, nav: null, unrealizedPnl: null });
    expect(project(s).violations).toContain("SETTLEMENT_EVIDENCE_MISMATCH");
  });
  it("identical evidence and cutoff returns identical result, independent of input ordering", () => { const s = withBuy(buy(), "second", 10_000n); expect(project(s)).toEqual(project({ ...s, ledger: [...s.ledger].reverse(), acquisitions: [...s.acquisitions].reverse(), prices: [...s.prices].reverse() })); });
  it("foreign account evidence fails closed", () => { const s = buy(); s.ledger = s.ledger.map(e => ({ ...e, financialAccountId: "foreign" })); expect(() => project(s)).toThrow("SOURCE_ACCOUNT_MISMATCH"); });
  it("invalid asOf and duplicate evidence fail closed", () => { const s = buy(); expect(() => projectPortfolio(s, new Date("invalid"))).toThrow("INVALID_AS_OF"); expect(() => project({ ...s, ledger: [...s.ledger, s.ledger[0]!] })).toThrow("DUPLICATE_SOURCE_EVIDENCE"); });
  it("application read requires authentication and preserves ownership failure", async () => { const read = new GetPortfolioProjection({ loadOwnedEvidence: async () => undefined }); await expect(read.execute({ actorId: "", asOf: AS_OF })).rejects.toThrow("AUTHENTICATION_REQUIRED"); expect(await read.execute({ actorId: "other", financialAccountId: "account", asOf: AS_OF })).toBeUndefined(); });
});
