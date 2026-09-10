import { price } from "@/domain/financial/price";
import type { AcquisitionEvidence, PortfolioEvidence, PortfolioLedgerEvidence } from "@/domain/portfolio/portfolio-projection";
import { FIXTURE_ASSETS, FIXTURE_DATASET_VERSION } from "@/domain/strategy/fixture-assets";

export const AS_OF = new Date("2026-01-02T12:00:00Z");
export const EARLY = new Date("2026-01-01T12:00:00Z");
export function portfolioFixture(cash = 100_000n): PortfolioEvidence {
  return { financialAccountId: "account", baseCurrency: "NOK", assets: FIXTURE_ASSETS,
    ledger: cash > 0n ? [entry("deposit", "CASH", cash, "DEBIT"), entry("deposit", "VIRTUAL_CONTRIBUTED_CAPITAL", cash, "CREDIT")] : [],
    acquisitions: [], prices: FIXTURE_ASSETS.map(a => ({ recordId: `price-${a.assetId}`, assetId: a.assetId, price: price("NOK", 5_000n, 4), availableAt: EARLY, observedAt: EARLY, ingestedAt: EARLY, datasetVersion: FIXTURE_DATASET_VERSION })) };
}
function entry(journal: string, code: string, amount: bigint, direction: "DEBIT" | "CREDIT", at = EARLY, assetId?: string): PortfolioLedgerEvidence {
  return { entryId: `${journal}-${code}-${direction}`, transactionId: journal, financialAccountId: "account", code, amountAtoms: amount, direction, commodityKind: assetId ? "ASSET" : "MONEY", currency: assetId ? null : "NOK", assetId: assetId ?? null, occurredAt: at, recordedAt: at };
}
export function withBuy(source: PortfolioEvidence, id: string, atoms: bigint, gross = 100n, fee = 1n, assetId = FIXTURE_ASSETS[0]!.assetId, at = EARLY): PortfolioEvidence {
  const fill: AcquisitionEvidence = { fillId: id, executionId: `execution-${id}`, ledgerTransactionId: id, financialAccountId: source.financialAccountId, assetId, quantityAtoms: atoms, quantityScale: 4, grossMinor: gross, feeMinor: fee, currency: "NOK", executedAt: at, recordedAt: at, executionPolicyVersion: "m1-market-execution/v1", executionMatchesFill: true };
  return { ...source, acquisitions: [...source.acquisitions, fill], ledger: [...source.ledger,
    entry(id, "CASH", gross + fee, "CREDIT", at), entry(id, `ASSET_COST_BASIS:${assetId}`, gross, "DEBIT", at),
    entry(id, "FEE_EXPENSE", fee, "DEBIT", at), entry(id, `ASSET_HOLDING:${assetId}`, atoms, "DEBIT", at, assetId), entry(id, `ASSET_CLEARING:${assetId}`, atoms, "CREDIT", at, assetId)] };
}
