import { createHash } from "node:crypto";
import { SIMULATION_EXECUTION_POLICY_VERSION } from "@/domain/execution/simulation-execution";
import type { CurrencyCode } from "@/domain/financial/currency";
import { money } from "@/domain/financial/money";
import { floorDivision } from "@/domain/financial/rounding";
import { FIXTURE_DATASET_VERSION, latestAvailablePrice, type FixtureAsset, type FixturePriceObservation } from "@/domain/strategy/fixture-assets";

export const PORTFOLIO_PROJECTION_VERSION = "portfolio-projection/v1";
export const PORTFOLIO_VALUATION_VERSION = "portfolio-valuation/v1";
export const FIFO_VERSION = "fifo-cost-basis/v1";

export interface PortfolioLedgerEvidence {
  entryId: string; transactionId: string; financialAccountId: string;
  code: string; commodityKind: "MONEY" | "ASSET"; currency: CurrencyCode | null;
  assetId: string | null; direction: "DEBIT" | "CREDIT"; amountAtoms: bigint;
  occurredAt: Date; recordedAt: Date;
}
export interface AcquisitionEvidence {
  fillId: string; executionId: string; ledgerTransactionId: string; financialAccountId: string;
  assetId: string; quantityAtoms: bigint; quantityScale: number; currency: CurrencyCode;
  grossMinor: bigint; feeMinor: bigint; executedAt: Date; recordedAt: Date;
  executionPolicyVersion: string; executionMatchesFill: boolean;
}
export interface PortfolioEvidence {
  financialAccountId: string; baseCurrency: CurrencyCode;
  ledger: readonly PortfolioLedgerEvidence[]; acquisitions: readonly AcquisitionEvidence[];
  assets: readonly FixtureAsset[]; prices: readonly FixturePriceObservation[];
}
export type PortfolioViolation = "NEGATIVE_CASH" | "NEGATIVE_ASSET_QUANTITY" | "MISSING_ASSET_METADATA" | "MISSING_MARKET_PRICE" | "LEDGER_FILL_QUANTITY_MISMATCH" | "INCOMPLETE_COST_BASIS" | "SETTLEMENT_EVIDENCE_MISMATCH";
export interface OpenCostBasisLot {
  lotId: string; fillId: string; executionId: string; ledgerTransactionId: string;
  acquiredAt: string; quantityAtoms: string; remainingQuantityAtoms: string;
  executedNotionalMinor: string; allocatedBuyFeeMinor: string; openCostBasisMinor: string;
  fifoVersion: typeof FIFO_VERSION;
}
export interface PortfolioHolding {
  assetId: string; code: string; quantityAtoms: string; quantityScale: number | null;
  selectedPrice: null | { recordId: string; priceAtoms: string; priceScale: number; currency: CurrencyCode; availableAt: string; observedAt: string; datasetVersion: string };
  marketValueMinor: string | null; openCostBasisMinor: string | null; unrealizedPnlMinor: string | null;
  portfolioWeightBps: string | null; lots: OpenCostBasisLot[]; ledgerEntryIds: string[];
  violations: PortfolioViolation[];
}
export interface PortfolioProjection {
  financialAccountId: string; asOf: string; baseCurrency: CurrencyCode;
  cash: string; investedMarketValue: string | null; nav: string | null;
  totalOpenCostBasis: string | null; unrealizedPnl: string | null;
  valuationStatus: "COMPLETE" | "INCOMPLETE";
  integrityStatus: "CONSISTENT" | "INCOMPLETE";
  cashWeightBps: string | null; allocationRoundingResidueBps: string | null;
  holdings: PortfolioHolding[]; missingPriceAssets: string[]; violations: PortfolioViolation[];
  provenance: { sourceHash: string; ledgerEntryIds: string[]; ledgerTransactionIds: string[]; fillIds: string[]; executionIds: string[]; priceRecordIds: string[]; temporalPolicy: "effective-and-recorded-at-or-before-asOf" };
  versions: { projection: typeof PORTFOLIO_PROJECTION_VERSION; valuation: typeof PORTFOLIO_VALUATION_VERSION; fifo: typeof FIFO_VERSION; dataset: typeof FIXTURE_DATASET_VERSION };
}

const sum = (values: readonly bigint[]) => values.reduce((a, b) => a + b, 0n);
const signed = (e: PortfolioLedgerEvidence) => e.direction === "DEBIT" ? e.amountAtoms : -e.amountAtoms;
const unique = (values: readonly string[]) => [...new Set(values)].sort();
const eligible = (effective: Date, recorded: Date, asOf: Date) => effective <= asOf && recorded <= asOf;

/** Pure, reconstructable read model. No state, clock reads, randomness, writes or lot consumption. */
export function projectPortfolio(source: PortfolioEvidence, asOf: Date): PortfolioProjection {
  if (!Number.isFinite(asOf.getTime())) throw new Error("INVALID_AS_OF");
  for (const row of [...source.ledger, ...source.acquisitions]) {
    if (row.financialAccountId !== source.financialAccountId) throw new Error("SOURCE_ACCOUNT_MISMATCH");
    if (!Number.isFinite(row.recordedAt.getTime())) throw new Error("INVALID_SOURCE_TIMESTAMP");
  }
  if (new Set(source.ledger.map(e => e.entryId)).size !== source.ledger.length || new Set(source.acquisitions.map(e => e.fillId)).size !== source.acquisitions.length) throw new Error("DUPLICATE_SOURCE_EVIDENCE");
  const ledger = source.ledger.filter(e => {
    if (!Number.isFinite(e.occurredAt.getTime()) || e.amountAtoms <= 0n) throw new Error("INVALID_LEDGER_EVIDENCE");
    return eligible(e.occurredAt, e.recordedAt, asOf);
  }).sort((a, b) => a.entryId.localeCompare(b.entryId));
  const fills = source.acquisitions.filter(f => {
    if (!Number.isFinite(f.executedAt.getTime())) throw new Error("INVALID_SOURCE_TIMESTAMP");
    return eligible(f.executedAt, f.recordedAt, asOf);
  }).sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime() || a.fillId.localeCompare(b.fillId));
  const cash = money(source.baseCurrency, sum(ledger.filter(e => e.code === "CASH" && e.commodityKind === "MONEY" && e.currency === source.baseCurrency).map(signed))).minorUnits;
  const assetIds = unique([...ledger.filter(e => e.commodityKind === "ASSET" && e.code === `ASSET_HOLDING:${e.assetId}`).map(e => e.assetId!), ...fills.map(f => f.assetId)]);
  const holdings: PortfolioHolding[] = [];
  for (const assetId of assetIds) {
    const entries = ledger.filter(e => e.commodityKind === "ASSET" && e.assetId === assetId && e.code === `ASSET_HOLDING:${assetId}`);
    const atoms = sum(entries.map(signed));
    const acquisitions = fills.filter(f => f.assetId === assetId);
    if (atoms === 0n && acquisitions.length === 0) continue;
    const asset = source.assets.find(a => a.assetId === assetId);
    const violations: PortfolioViolation[] = [];
    if (!asset || !asset.active || asset.quoteCurrencyCode !== source.baseCurrency) violations.push("MISSING_ASSET_METADATA");
    if (atoms < 0n) violations.push("NEGATIVE_ASSET_QUANTITY");
    if (sum(acquisitions.map(f => f.quantityAtoms)) !== atoms) violations.push("LEDGER_FILL_QUANTITY_MISMATCH");
    if (atoms !== 0n && acquisitions.length === 0) violations.push("INCOMPLETE_COST_BASIS");
    for (const f of acquisitions) {
      const journal = ledger.filter(e => e.transactionId === f.ledgerTransactionId);
      const amount = (code: string) => sum(journal.filter(e => e.code === code).map(signed));
      if (!f.executionMatchesFill || f.executionPolicyVersion !== SIMULATION_EXECUTION_POLICY_VERSION || f.quantityAtoms <= 0n || f.grossMinor < 0n || f.feeMinor < 0n || f.currency !== source.baseCurrency || f.quantityScale !== asset?.quantityScale ||
        amount(`ASSET_HOLDING:${assetId}`) !== f.quantityAtoms || amount(`ASSET_CLEARING:${assetId}`) !== -f.quantityAtoms ||
        amount("CASH") !== -(f.grossMinor + f.feeMinor) || amount(`ASSET_COST_BASIS:${assetId}`) !== f.grossMinor || amount("FEE_EXPENSE") !== f.feeMinor) {
        violations.push("SETTLEMENT_EVIDENCE_MISMATCH");
      }
    }
    const basisComplete = violations.length === 0;
    const lots: OpenCostBasisLot[] = basisComplete ? acquisitions.map(f => ({ lotId: f.fillId, fillId: f.fillId, executionId: f.executionId, ledgerTransactionId: f.ledgerTransactionId, acquiredAt: f.executedAt.toISOString(), quantityAtoms: f.quantityAtoms.toString(), remainingQuantityAtoms: f.quantityAtoms.toString(), executedNotionalMinor: f.grossMinor.toString(), allocatedBuyFeeMinor: f.feeMinor.toString(), openCostBasisMinor: (f.grossMinor + f.feeMinor).toString(), fifoVersion: FIFO_VERSION })) : [];
    const basis = basisComplete ? sum(acquisitions.map(f => f.grossMinor + f.feeMinor)) : null;
    const price = asset?.active ? latestAvailablePrice(source.prices.filter(p => p.datasetVersion === FIXTURE_DATASET_VERSION && p.price.currencyCode === source.baseCurrency && p.price.priceAtoms > 0n), assetId, asOf) : undefined;
    if (!price && atoms !== 0n) violations.push("MISSING_MARKET_PRICE");
    const value = atoms === 0n ? 0n : price && asset && atoms > 0n ? floorDivision(atoms * price.price.priceAtoms, 10n ** BigInt(asset.quantityScale + price.price.priceScale)) : null;
    holdings.push({ assetId, code: asset?.symbol ?? assetId, quantityAtoms: atoms.toString(), quantityScale: asset?.quantityScale ?? null,
      selectedPrice: price ? { recordId: price.recordId, priceAtoms: price.price.priceAtoms.toString(), priceScale: price.price.priceScale, currency: price.price.currencyCode, availableAt: price.availableAt.toISOString(), observedAt: price.observedAt.toISOString(), datasetVersion: price.datasetVersion } : null,
      marketValueMinor: value?.toString() ?? null, openCostBasisMinor: basis?.toString() ?? null,
      unrealizedPnlMinor: value !== null && basis !== null ? (value - basis).toString() : null,
      portfolioWeightBps: null, lots, ledgerEntryIds: entries.map(e => e.entryId), violations: [...new Set(violations)].sort() });
  }
  const violations = [...new Set([...holdings.flatMap(h => h.violations), ...(cash < 0n ? ["NEGATIVE_CASH" as const] : [])])].sort();
  const complete = violations.length === 0;
  const invested = complete ? sum(holdings.map(h => BigInt(h.marketValueMinor!))) : null;
  const nav = invested !== null ? cash + invested : null;
  const costBasis = holdings.every(h => h.openCostBasisMinor !== null) ? sum(holdings.map(h => BigInt(h.openCostBasisMinor!))) : null;
  const pnl = complete ? sum(holdings.map(h => BigInt(h.unrealizedPnlMinor!))) : null;
  const cashWeight = nav !== null && nav > 0n ? floorDivision(cash * 10_000n, nav) : null;
  if (nav !== null && nav > 0n) for (const holding of holdings) holding.portfolioWeightBps = floorDivision(BigInt(holding.marketValueMinor!) * 10_000n, nav).toString();
  const residue = cashWeight !== null ? 10_000n - cashWeight - sum(holdings.map(h => BigInt(h.portfolioWeightBps!))) : null;
  const sourceHash = createHash("sha256").update(JSON.stringify({ asOf, account: source.financialAccountId, currency: source.baseCurrency, ledger, fills, holdings }, (_, v) => typeof v === "bigint" ? v.toString() : v)).digest("hex");
  return { financialAccountId: source.financialAccountId, asOf: asOf.toISOString(), baseCurrency: source.baseCurrency, cash: cash.toString(), investedMarketValue: invested?.toString() ?? null, nav: nav?.toString() ?? null, totalOpenCostBasis: costBasis?.toString() ?? null, unrealizedPnl: pnl?.toString() ?? null,
    valuationStatus: complete ? "COMPLETE" : "INCOMPLETE", integrityStatus: violations.some(v => v !== "MISSING_MARKET_PRICE") ? "INCOMPLETE" : "CONSISTENT", cashWeightBps: cashWeight?.toString() ?? null, allocationRoundingResidueBps: residue?.toString() ?? null,
    holdings, missingPriceAssets: holdings.filter(h => h.violations.includes("MISSING_MARKET_PRICE")).map(h => h.assetId), violations,
    provenance: { sourceHash, ledgerEntryIds: ledger.map(e => e.entryId), ledgerTransactionIds: unique(ledger.map(e => e.transactionId)), fillIds: fills.map(f => f.fillId), executionIds: unique(fills.map(f => f.executionId)), priceRecordIds: unique(holdings.flatMap(h => h.selectedPrice ? [h.selectedPrice.recordId] : [])), temporalPolicy: "effective-and-recorded-at-or-before-asOf" },
    versions: { projection: PORTFOLIO_PROJECTION_VERSION, valuation: PORTFOLIO_VALUATION_VERSION, fifo: FIFO_VERSION, dataset: FIXTURE_DATASET_VERSION } };
}
