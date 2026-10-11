import { describe, expect, it } from "vitest";
import { projectPortfolio, type PortfolioEvidence, type PortfolioLedgerEvidence } from "@/domain/portfolio/portfolio-projection";
import { FIXTURE_ASSETS } from "@/domain/strategy/fixture-assets";
import { portfolioFixture, withBuy } from "../helpers/portfolio-fixtures";

const asset = FIXTURE_ASSETS[0]!;
const at = new Date("2026-01-01T10:00:00.000Z");
const asOf = new Date("2026-01-02T12:00:00.000Z");

function entry(id: string, transactionId: string, code: string, amountAtoms: bigint, direction: "DEBIT" | "CREDIT", commodityKind: "MONEY" | "ASSET" = "MONEY"): PortfolioLedgerEvidence {
  return { entryId: id, transactionId, financialAccountId: "account", code, amountAtoms, direction, commodityKind, currency: commodityKind === "MONEY" ? "NOK" : null, assetId: commodityKind === "ASSET" ? asset.assetId : null, occurredAt: at, recordedAt: at };
}

function saleEvidence(quantity: bigint, gross: bigint, sellFee: bigint): PortfolioEvidence {
  const buyGross = 10_000n;
  const buyFee = 100n;
  const buyQuantity = 1_000_000n;
  const source = withBuy(portfolioFixture(), "cycle-buy", buyQuantity, buyGross, buyFee, asset.assetId);
  const buyLedger = source.ledger
    .filter(item => item.transactionId !== "cycle-buy" || item.code !== "FEE_EXPENSE")
    .map(item => item.transactionId === "cycle-buy" && item.code === `ASSET_COST_BASIS:${asset.assetId}` ? { ...item, amountAtoms: buyGross + buyFee } : item);
  const basisRemoved = buyGross + buyFee === 0n ? 0n : (buyGross + buyFee) * quantity / buyQuantity;
  const realizedPnlMinor = gross - sellFee - basisRemoved;
  const gain = gross > basisRemoved ? gross - basisRemoved : 0n;
  const loss = basisRemoved > gross ? basisRemoved - gross : 0n;
  const sellEntries = [
    entry("sell-cash", "cycle-sell", "CASH", gross, "DEBIT"),
    entry("sell-cash-fee", "cycle-sell", "CASH", sellFee, "CREDIT"),
    entry("sell-fee-expense", "cycle-sell", "FEE_EXPENSE", sellFee, "DEBIT"),
    entry("sell-cost", "cycle-sell", `ASSET_COST_BASIS:${asset.assetId}`, basisRemoved, "CREDIT"),
    entry("sell-holding", "cycle-sell", `ASSET_HOLDING:${asset.assetId}`, quantity, "CREDIT", "ASSET"),
    entry("sell-clearing", "cycle-sell", `ASSET_CLEARING:${asset.assetId}`, quantity, "DEBIT", "ASSET"),
    ...(gain > 0n ? [entry("sell-gain", "cycle-sell", "REALIZED_GAIN", gain, "CREDIT")] : []),
    ...(loss > 0n ? [entry("sell-loss", "cycle-sell", "REALIZED_LOSS", loss, "DEBIT")] : []),
  ];
  const disposal = {
    fillId: "cycle-sell", executionId: "cycle-sell-execution", ledgerTransactionId: "cycle-sell", financialAccountId: "account",
    assetId: asset.assetId, quantityAtoms: quantity, quantityScale: asset.quantityScale, currency: "NOK" as const,
    grossMinor: gross, feeMinor: sellFee, executedAt: at, recordedAt: at, executionPolicyVersion: "standing-paper-sell-execution/v1",
    executionMatchesFill: true, lotConsumptions: [{ fillId: "cycle-buy", quantityAtoms: quantity, costBasisMinor: basisRemoved }], realizedPnlMinor,
  };
  return { ...source, ledger: [...buyLedger, ...sellEntries], disposals: [disposal] };
}

function ledgerRealizedResult(source: PortfolioEvidence): bigint {
  return source.ledger.filter(item => ["REALIZED_GAIN", "REALIZED_LOSS", "FEE_EXPENSE"].includes(item.code)).reduce((total, item) => {
    if (item.code === "REALIZED_GAIN") return total + (item.direction === "CREDIT" ? item.amountAtoms : -item.amountAtoms);
    return total - (item.direction === "DEBIT" ? item.amountAtoms : -item.amountAtoms);
  }, 0n);
}

describe("standing paper cycle FIFO and ledger accounting", () => {
  it.each([
    { name: "partial realization", quantity: 500_000n, gross: 7_000n, openQuantity: "500000", openBasis: "5050" },
    { name: "full realization", quantity: 1_000_000n, gross: 12_000n, openQuantity: "0", openBasis: "0" },
  ])("reconciles $name and includes the BUY fee in FIFO basis", ({ quantity, gross, openQuantity, openBasis }) => {
    const source = saleEvidence(quantity, gross, 100n);
    const projection = projectPortfolio(source, asOf);
    const holding = projection.holdings[0]!;

    expect(projection.integrityStatus).toBe("CONSISTENT");
    expect(projection.violations).toEqual([]);
    expect(holding).toMatchObject({ quantityAtoms: openQuantity, openCostBasisMinor: openBasis });
    expect(holding.lots).toHaveLength(openQuantity === "0" ? 0 : 1);
    expect(projection.realizedPnlMinor).toBe(ledgerRealizedResult(source).toString());
    expect(projection.realizedPnlMinor).toBe((gross - 100n - (10_100n * quantity / 1_000_000n)).toString());
  });
});
