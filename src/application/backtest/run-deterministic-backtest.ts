import { createHash } from "node:crypto";
import { executeSimulationBuy, type SimulationFill } from "@/domain/execution/simulation-execution";
import { money } from "@/domain/financial/money";
import { createLedgerTransaction, createVirtualDepositTransaction, ledgerEntry, type LedgerAccount, type LedgerTransaction } from "@/domain/ledger/ledger";
import { projectPortfolio, type AcquisitionEvidence, type PortfolioEvidence, type PortfolioProjection, type PortfolioLedgerEvidence } from "@/domain/portfolio/portfolio-projection";
import { assessProposal } from "@/domain/risk/m1-risk";
import { CONTRIBUTION_REBALANCING_VERSION, FIXTURE_ASSETS, FIXTURE_ASSET_REGISTRY_VERSION, FIXTURE_DATASET_VERSION, latestAvailablePrice, contributionRebalancing, type FixturePriceObservation, type DecisionPortfolioState, type StrategyDecision } from "@/domain/strategy/fixture-assets";

export const BACKTEST_REPLAY_VERSION = "backtest-replay/v1";
export interface ContributionEvent { readonly eventId: string; readonly availableAt: string; readonly amountMinor: string; readonly currency: "NOK"; }
export interface BacktestRunConfig {
  readonly startAt: string; readonly endAt: string; readonly baseCurrency: "NOK";
  readonly contributionEvents: readonly ContributionEvent[]; readonly valuationTimestamps: readonly string[];
  readonly strategyVersion: typeof CONTRIBUTION_REBALANCING_VERSION; readonly riskPolicyVersion: "m1-risk-policy/v1";
  readonly executionPolicyVersion: "m1-market-execution/v1"; readonly portfolioValuationVersion: "portfolio-valuation/v1";
  readonly fifoCostBasisVersion: "fifo-cost-basis/v1"; readonly assetRegistryVersion: typeof FIXTURE_ASSET_REGISTRY_VERSION;
  readonly marketDatasetVersion: typeof FIXTURE_DATASET_VERSION;
}
export interface BacktestResult {
  readonly runId: string; readonly configHash: string; readonly config: BacktestRunConfig;
  readonly decisions: readonly StrategyDecision[]; readonly riskAssessments: readonly ReturnType<typeof assessProposal>[];
  readonly executions: readonly SimulationFill[]; readonly journals: readonly LedgerTransaction[];
  readonly portfolioSnapshots: readonly PortfolioProjection[]; readonly endingState: PortfolioProjection;
  readonly integrityStatus: "CONSISTENT";
}

const canonical = (value: unknown): string => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v instanceof Date ? v.toISOString() : v, 0);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const id = (run: string, purpose: string) => {
  const h = hash(`${run}:${purpose}`).slice(0, 32).split(""); h[12] = "5"; h[16] = ((Number.parseInt(h[16]!, 16) & 3) | 8).toString(16);
  return `${h.slice(0,8).join("")}-${h.slice(8,12).join("")}-${h.slice(12,16).join("")}-${h.slice(16,20).join("")}-${h.slice(20).join("")}`;
};
const date = (s: string) => { const d = new Date(s); if (!Number.isFinite(d.getTime())) throw new Error("INVALID_REPLAY_TIMESTAMP"); return d; };
function validate(config: BacktestRunConfig): void {
  if (config.strategyVersion !== CONTRIBUTION_REBALANCING_VERSION || config.riskPolicyVersion !== "m1-risk-policy/v1" || config.executionPolicyVersion !== "m1-market-execution/v1" || config.portfolioValuationVersion !== "portfolio-valuation/v1" || config.fifoCostBasisVersion !== "fifo-cost-basis/v1" || config.assetRegistryVersion !== FIXTURE_ASSET_REGISTRY_VERSION || config.marketDatasetVersion !== FIXTURE_DATASET_VERSION) throw new Error("UNSUPPORTED_POLICY_VERSION");
  const start = date(config.startAt).getTime(); const end = date(config.endAt).getTime(); if (start > end) throw new Error("INVALID_REPLAY_RANGE");
  for (const event of config.contributionEvents) { if (event.currency !== config.baseCurrency || BigInt(event.amountMinor) <= 0n) throw new Error("INVALID_CONTRIBUTION"); const t = date(event.availableAt).getTime(); if (t < start || t > end) throw new Error("CONTRIBUTION_OUT_OF_RANGE"); }
}
function account(financialAccountId: string, code: string, commodity: LedgerAccount["commodity"], cls: LedgerAccount["accountClass"], normal: LedgerAccount["normalBalance"], run: string): LedgerAccount { return { id: id(run, `account:${code}`), financialAccountId, code, commodity, accountClass: cls, normalBalance: normal }; }

export function runDeterministicBacktest(config: BacktestRunConfig, prices: readonly FixturePriceObservation[]): BacktestResult {
  validate(config);
  const canonicalConfig = canonical({ ...config, contributionEvents: [...config.contributionEvents].sort((a,b) => date(a.availableAt).getTime()-date(b.availableAt).getTime() || a.eventId.localeCompare(b.eventId)), valuationTimestamps: [...config.valuationTimestamps].sort() });
  const configHash = hash(canonicalConfig); const runId = hash(`${configHash}:${config.marketDatasetVersion}`);
  const financialAccountId = id(runId, "account");
  const cash = account(financialAccountId, "CASH", { kind: "MONEY", currencyCode: "NOK" }, "ASSET", "DEBIT", runId);
  const capital = account(financialAccountId, "VIRTUAL_CONTRIBUTED_CAPITAL", { kind: "MONEY", currencyCode: "NOK" }, "EQUITY", "CREDIT", runId);
  const fee = account(financialAccountId, "FEE_EXPENSE", { kind: "MONEY", currencyCode: "NOK" }, "EXPENSE", "DEBIT", runId);
  const ledger: PortfolioLedgerEvidence[] = []; const journals: LedgerTransaction[] = []; const acquisitions: AcquisitionEvidence[] = [];
  const decisions: StrategyDecision[] = []; const risks: ReturnType<typeof assessProposal>[] = []; const executions: SimulationFill[] = []; const snapshots: PortfolioProjection[] = [];
  const source = (): PortfolioEvidence => ({ financialAccountId, baseCurrency: "NOK", ledger, acquisitions, assets: FIXTURE_ASSETS, prices: prices.filter(p => p.datasetVersion === config.marketDatasetVersion) });
  const stateAt = (at: Date): { projection: PortfolioProjection; state: DecisionPortfolioState } => { const projection = projectPortfolio(source(), at); if (projection.valuationStatus === "INCOMPLETE" || projection.nav === null) throw new Error("INCOMPLETE_DECISION_PORTFOLIO"); const values = Object.fromEntries(projection.holdings.map(h => [h.assetId, BigInt(h.marketValueMinor!)])); return { projection, state: { cashMinor: BigInt(projection.cash), decisionNavMinor: BigInt(projection.nav), holdings: projection.holdings.map(h => ({ assetId: h.assetId, marketValueMinor: BigInt(h.marketValueMinor!) })), existingMarketValueByAsset: values, priceRecordIds: projection.provenance.priceRecordIds } }; };
  const events = [...config.contributionEvents.map(e => ({ kind: "CONTRIBUTION" as const, at: date(e.availableAt), event: e })), ...config.valuationTimestamps.map(t => ({ kind: "VALUATION" as const, at: date(t) }))].sort((a,b) => a.at.getTime()-b.at.getTime() || (a.kind === "CONTRIBUTION" ? -1 : 1) || (a.kind === "CONTRIBUTION" && b.kind === "CONTRIBUTION" ? a.event.eventId.localeCompare(b.event.eventId) : 0));
  for (const event of events) {
    if (event.kind === "CONTRIBUTION") {
      const transaction = createVirtualDepositTransaction({ id: id(runId, `journal:${event.event.eventId}:deposit`), financialAccountId, occurredAt: event.at, amount: money("NOK", BigInt(event.event.amountMinor)), idempotencyRecordId: id(runId, `command:${event.event.eventId}`), cashAccount: cash, contributedCapitalAccount: capital });
      journals.push(transaction); transaction.entries.forEach((entry, i) => ledger.push({ entryId: id(runId, `entry:${transaction.id}:${i}`), transactionId: transaction.id, financialAccountId, code: entry.ledgerAccount.code, commodityKind: entry.ledgerAccount.commodity.kind, currency: entry.ledgerAccount.commodity.kind === "MONEY" ? entry.ledgerAccount.commodity.currencyCode : null, assetId: entry.ledgerAccount.commodity.kind === "ASSET" ? entry.ledgerAccount.commodity.assetId : null, direction: entry.direction, amountAtoms: entry.amountAtoms, occurredAt: event.at, recordedAt: event.at }));
      const { state } = stateAt(event.at); const decision = contributionRebalancing({ financialAccountId, decisionId: id(runId, `decision:${event.event.eventId}`), cash: money("NOK", state.cashMinor), decisionTimestamp: event.at, prices: prices.filter(p => p.datasetVersion === config.marketDatasetVersion), portfolioState: state }); decisions.push(decision);
      for (const order of decision.proposedOrders) { const asset = FIXTURE_ASSETS.find(a => a.assetId === order.assetId)!; const reference = latestAvailablePrice(prices.filter(p => p.datasetVersion === config.marketDatasetVersion), order.assetId, event.at); if (!reference) continue; const risk = assessProposal(order, { accountActive: true, simulationMode: true, strategyEnabled: true, strategyVersion: decision.strategyVersion, accountCurrency: "NOK", availableCash: money("NOK", state.cashMinor), decisionNav: money("NOK", state.decisionNavMinor), decisionTimestamp: event.at, assets: FIXTURE_ASSETS, prices: prices.filter(p => p.datasetVersion === config.marketDatasetVersion), portfolioState: state }); risks.push(risk); if (risk.disposition !== "APPROVE") continue; const fill = executeSimulationBuy({ financialAccountId, actorId: financialAccountId, accountActive: true, simulationMode: true, decisionApproved: true, riskApproved: true, proposal: order, asset, referencePrice: reference, availableCash: money("NOK", state.cashMinor), decisionNav: money("NOK", state.decisionNavMinor), executionTimestamp: event.at, alreadySettled: false }); executions.push(fill); const holding = account(financialAccountId, `ASSET_HOLDING:${asset.assetId}`, { kind: "ASSET", assetId: asset.assetId }, "ASSET", "DEBIT", runId); const clearing = account(financialAccountId, `ASSET_CLEARING:${asset.assetId}`, { kind: "ASSET", assetId: asset.assetId }, "CLEARING", "CREDIT", runId); const cost = account(financialAccountId, `ASSET_COST_BASIS:${asset.assetId}`, { kind: "MONEY", currencyCode: "NOK" }, "ASSET", "DEBIT", runId); const tx = createLedgerTransaction({ id: id(runId, `journal:${event.event.eventId}:${order.assetId}`), financialAccountId, type: "SIMULATED_BUY_SETTLEMENT", occurredAt: event.at, narrative: "Deterministic backtest BUY settlement", entries: [ledgerEntry(cost, "DEBIT", fill.grossNotional.minorUnits), ledgerEntry(cash, "CREDIT", fill.grossNotional.minorUnits), ledgerEntry(fee, "DEBIT", fill.fee.minorUnits), ledgerEntry(cash, "CREDIT", fill.fee.minorUnits), ledgerEntry(holding, "DEBIT", fill.quantity.atomicUnits), ledgerEntry(clearing, "CREDIT", fill.quantity.atomicUnits)] }); journals.push(tx); tx.entries.forEach((entry,i) => ledger.push({ entryId:id(runId,`entry:${tx.id}:${i}`), transactionId:tx.id, financialAccountId, code:entry.ledgerAccount.code, commodityKind:entry.ledgerAccount.commodity.kind, currency:entry.ledgerAccount.commodity.kind === "MONEY" ? entry.ledgerAccount.commodity.currencyCode : null, assetId:entry.ledgerAccount.commodity.kind === "ASSET" ? entry.ledgerAccount.commodity.assetId : null, direction:entry.direction, amountAtoms:entry.amountAtoms, occurredAt:event.at, recordedAt:event.at })); acquisitions.push({ fillId: fill.fillId, executionId: id(runId, `execution:${event.event.eventId}:${order.assetId}`), ledgerTransactionId: tx.id, financialAccountId, assetId: order.assetId, quantityAtoms: fill.quantity.atomicUnits, quantityScale: fill.quantity.quantityScale, currency: "NOK", grossMinor: fill.grossNotional.minorUnits, feeMinor: fill.fee.minorUnits, executedAt: event.at, recordedAt: event.at, executionPolicyVersion: fill.executionPolicyVersion, executionMatchesFill: true }); }
    }
    snapshots.push(projectPortfolio(source(), event.at));
  }
  const endingState = snapshots.at(-1) ?? projectPortfolio(source(), date(config.endAt));
  return Object.freeze({ runId, configHash, config, decisions: Object.freeze(decisions), riskAssessments: Object.freeze(risks), executions: Object.freeze(executions), journals: Object.freeze(journals), portfolioSnapshots: Object.freeze(snapshots), endingState, integrityStatus: "CONSISTENT" as const });
}
