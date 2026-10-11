import { createHash } from "node:crypto";
import { executeSimulationBuy, executeSimulationSell, type SimulationFill, type SimulationSellFill } from "@/domain/execution/simulation-execution";
import { money } from "@/domain/financial/money";
import { createLedgerTransaction, createVirtualDepositTransaction, ledgerEntry, type LedgerAccount, type LedgerTransaction } from "@/domain/ledger/ledger";
import { planFifoLotConsumption, projectPortfolio, type AcquisitionEvidence, type DisposalEvidence, type PortfolioEvidence, type PortfolioProjection, type PortfolioLedgerEvidence } from "@/domain/portfolio/portfolio-projection";
import { assessProposal } from "@/domain/risk/m1-risk";
import { assessStandingPaperPolicy, type PaperPolicyEvidence, type StandingPaperPolicy } from "@/domain/risk/standing-paper-policy";
import { basisPoints } from "@/domain/financial/basis-points";
import { feeCeiling, buyExecutionPrice, buySettlementNotional } from "@/domain/financial/rounding";
import { CONTRIBUTION_REBALANCING_VERSION, FIXTURE_ASSETS, FIXTURE_ASSET_REGISTRY_VERSION, FIXTURE_DATASET_VERSION, latestAvailablePrice, contributionRebalancing, type FixturePriceObservation, type DecisionPortfolioState, type StrategyDecision } from "@/domain/strategy/fixture-assets";
import { evaluateStandingPaperExit, PAPER_CYCLE_CONTRACT_VERSION, type PaperExitReasonCode, type StandingPaperExitPolicy, assertValidStandingPaperExitPolicy } from "@/domain/risk/standing-paper-exit-policy";
import { sellExecutionPrice, sellSettlementProceeds } from "@/domain/financial/rounding";

export const BACKTEST_REPLAY_VERSION = "backtest-replay/v1";
export interface ContributionEvent { readonly eventId: string; readonly availableAt: string; readonly amountMinor: string; readonly currency: "NOK"; }
export interface BacktestRunConfig {
  readonly startAt: string; readonly endAt: string; readonly baseCurrency: "NOK";
  readonly financialAccountId?: string;
  readonly contributionEvents: readonly ContributionEvent[]; readonly valuationTimestamps: readonly string[];
  /** Strategy checks without adding capital; used by standing paper worker rounds. */
  readonly strategyEvaluationTimestamps?: readonly string[];
  readonly strategyVersion: typeof CONTRIBUTION_REBALANCING_VERSION; readonly riskPolicyVersion: "m1-risk-policy/v1";
  readonly executionPolicyVersion: "m1-market-execution/v1"; readonly portfolioValuationVersion: "portfolio-valuation/v1";
  readonly fifoCostBasisVersion: "fifo-cost-basis/v1" | "fifo-cost-basis/v2"; readonly assetRegistryVersion: typeof FIXTURE_ASSET_REGISTRY_VERSION;
  readonly marketDatasetVersion: typeof FIXTURE_DATASET_VERSION;
  readonly standingPaperPolicy?: StandingPaperPolicy;
  /** Opt-in; absent configurations retain the unchanged BUY-only v1 contract. */
  readonly paperCycleContractVersion?: typeof PAPER_CYCLE_CONTRACT_VERSION;
  readonly standingPaperExitPolicy?: StandingPaperExitPolicy;
}
export interface BacktestResult {
  readonly runId: string; readonly configHash: string; readonly config: BacktestRunConfig;
  readonly decisions: readonly StrategyDecision[]; readonly riskAssessments: readonly ReturnType<typeof assessProposal>[];
  readonly executions: readonly (SimulationFill | SimulationSellFill)[]; readonly journals: readonly LedgerTransaction[];
  readonly portfolioSnapshots: readonly PortfolioProjection[]; readonly endingState: PortfolioProjection;
  readonly integrityStatus: "CONSISTENT";
  readonly paperPolicyDecisions: readonly { readonly decisionId: string; readonly orderId: string; readonly outcome: "SIMULATED_FILLED" | "REJECTED"; readonly riskCodes: readonly string[]; readonly evidence: PaperPolicyEvidence }[];
  readonly persistentState: DeterministicBacktestState;
  readonly paperCycleDecisions?: readonly PaperCycleDecision[];
}

/** Ledger-derived continuation material; serializable at database boundaries. */
export interface DeterministicBacktestState {
  readonly ledger: readonly PortfolioLedgerEvidence[];
  readonly acquisitions: readonly AcquisitionEvidence[];
  readonly netContributionsMinor: bigint;
  readonly adjustedEquityHighWaterMinor: bigint;
  readonly committedCapitalMinor: bigint;
  readonly lastProcessedAt: Date | null;
  readonly disposals?: readonly DisposalEvidence[];
  readonly realizedPnlMinor?: bigint;
  readonly cumulativeTurnoverMinor?: bigint;
}

export interface PaperCycleDecision {
  readonly decisionId: string;
  readonly orderId: string;
  readonly action: "BUY" | "SELL" | "HOLD";
  readonly reasonCode: "BUY_FILLED" | "BUY_RISK_REJECTED" | "SELL_STOP_LOSS" | "SELL_TAKE_PROFIT" | "SELL_MAX_HOLD" | "SELL_ORDER_LIMIT_REJECTED" | "HOLD_NO_EXIT_TRIGGER";
  readonly evidence: {
    readonly policyId: string; readonly policyVersion: string; readonly exitPolicyVersion: string;
    readonly strategyVersion: string; readonly inputHash: string; readonly assetId: string;
    readonly priceRecordId: string; readonly priceAvailableAt: string; readonly decisionAt: string; readonly priceAtoms: string; readonly priceScale: number;
    readonly quantityAtoms: string; readonly quantityScale: number; readonly disposition: "EXECUTED" | "REJECTED" | "HOLD";
    readonly triggerReason: PaperExitReasonCode | null;
  };
}

const canonical = (value: unknown): string => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v instanceof Date ? v.toISOString() : v, 0);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const id = (run: string, purpose: string) => {
  const h = hash(`${run}:${purpose}`).slice(0, 32).split(""); h[12] = "5"; h[16] = ((Number.parseInt(h[16]!, 16) & 3) | 8).toString(16);
  return `${h.slice(0,8).join("")}-${h.slice(8,12).join("")}-${h.slice(12,16).join("")}-${h.slice(16,20).join("")}-${h.slice(20).join("")}`;
};
const date = (s: string) => { const d = new Date(s); if (!Number.isFinite(d.getTime())) throw new Error("INVALID_REPLAY_TIMESTAMP"); return d; };
function validate(config: BacktestRunConfig): void {
  const cycle = config.paperCycleContractVersion === PAPER_CYCLE_CONTRACT_VERSION;
  if (config.strategyVersion !== CONTRIBUTION_REBALANCING_VERSION || config.riskPolicyVersion !== "m1-risk-policy/v1" || config.executionPolicyVersion !== "m1-market-execution/v1" || config.portfolioValuationVersion !== "portfolio-valuation/v1" || config.fifoCostBasisVersion !== (cycle ? "fifo-cost-basis/v2" : "fifo-cost-basis/v1") || config.assetRegistryVersion !== FIXTURE_ASSET_REGISTRY_VERSION || config.marketDatasetVersion !== FIXTURE_DATASET_VERSION ||
    (cycle ? (!config.standingPaperExitPolicy || !config.standingPaperPolicy) : config.standingPaperExitPolicy !== undefined)) throw new Error("UNSUPPORTED_POLICY_VERSION");
  if (cycle) {
    assertValidStandingPaperExitPolicy(config.standingPaperExitPolicy!);
    if (config.standingPaperPolicy!.mode !== "PAPER_ONLY" || config.standingPaperPolicy!.status !== "ACTIVE") throw new Error("PAPER_POLICY_NOT_ACTIVE");
  }
  const start = date(config.startAt).getTime(); const end = date(config.endAt).getTime(); if (start > end) throw new Error("INVALID_REPLAY_RANGE");
  for (const event of config.contributionEvents) { if (event.currency !== config.baseCurrency || BigInt(event.amountMinor) <= 0n) throw new Error("INVALID_CONTRIBUTION"); const t = date(event.availableAt).getTime(); if (t < start || t > end) throw new Error("CONTRIBUTION_OUT_OF_RANGE"); }
  for (const timestamp of config.strategyEvaluationTimestamps ?? []) { const t = date(timestamp).getTime(); if (t < start || t > end) throw new Error("STRATEGY_EVALUATION_OUT_OF_RANGE"); }
}
function account(financialAccountId: string, code: string, commodity: LedgerAccount["commodity"], cls: LedgerAccount["accountClass"], normal: LedgerAccount["normalBalance"], run: string): LedgerAccount { return { id: id(run, `account:${code}`), financialAccountId, code, commodity, accountClass: cls, normalBalance: normal }; }

function quantityWithinSellOrderLimit(input: { assetId: string; availableAtoms: bigint; quantityScale: number; incrementAtoms: bigint; executionPrice: ReturnType<typeof sellExecutionPrice>; maxOrderMinor: bigint }): bigint {
  const maxUnits = input.availableAtoms / input.incrementAtoms;
  let low = 0n; let high = maxUnits;
  while (low < high) {
    const units = (low + high + 1n) / 2n;
    const quantity = { assetId: input.assetId, atomicUnits: units * input.incrementAtoms, quantityScale: input.quantityScale };
    const gross = sellSettlementProceeds(quantity, input.executionPrice);
    const fee = feeCeiling(gross, basisPoints(10n), money("NOK", 100n));
    if (gross.minorUnits > fee.minorUnits && gross.minorUnits + fee.minorUnits <= input.maxOrderMinor) low = units;
    else high = units - 1n;
  }
  return low * input.incrementAtoms;
}

export function runDeterministicBacktest(config: BacktestRunConfig, prices: readonly FixturePriceObservation[], initialState?: DeterministicBacktestState): BacktestResult {
  validate(config);
  const canonicalConfig = canonical({ ...config, contributionEvents: [...config.contributionEvents].sort((a,b) => date(a.availableAt).getTime()-date(b.availableAt).getTime() || a.eventId.localeCompare(b.eventId)), valuationTimestamps: [...config.valuationTimestamps].sort() });
  const configHash = hash(canonicalConfig); const runId = hash(`${configHash}:${config.marketDatasetVersion}`);
  const financialAccountId = config.financialAccountId ?? id(runId, "account");
  if (!financialAccountId.trim()) throw new Error("INVALID_FINANCIAL_ACCOUNT_ID");
  const cash = account(financialAccountId, "CASH", { kind: "MONEY", currencyCode: "NOK" }, "ASSET", "DEBIT", runId);
  const capital = account(financialAccountId, "VIRTUAL_CONTRIBUTED_CAPITAL", { kind: "MONEY", currencyCode: "NOK" }, "EQUITY", "CREDIT", runId);
  const fee = account(financialAccountId, "FEE_EXPENSE", { kind: "MONEY", currencyCode: "NOK" }, "EXPENSE", "DEBIT", runId);
  const cycleMode = config.paperCycleContractVersion === PAPER_CYCLE_CONTRACT_VERSION;
  const ledger: PortfolioLedgerEvidence[] = [...(initialState?.ledger ?? [])]; const journals: LedgerTransaction[] = []; const acquisitions: AcquisitionEvidence[] = [...(initialState?.acquisitions ?? [])];
  const disposals: DisposalEvidence[] = [...(initialState?.disposals ?? [])];
  const decisions: StrategyDecision[] = []; const risks: ReturnType<typeof assessProposal>[] = []; const executions: (SimulationFill | SimulationSellFill)[] = []; const snapshots: PortfolioProjection[] = [];
  const paperPolicyDecisions: { decisionId: string; orderId: string; outcome: "SIMULATED_FILLED" | "REJECTED"; riskCodes: readonly string[]; evidence: PaperPolicyEvidence }[] = [];
  const paperCycleDecisions: PaperCycleDecision[] = [];
  let committedCapitalMinor = initialState?.committedCapitalMinor ?? 0n; let netContributionsMinor = initialState?.netContributionsMinor ?? 0n; let adjustedEquityHighWaterMinor = initialState?.adjustedEquityHighWaterMinor ?? 0n;
  let realizedPnlMinor = initialState?.realizedPnlMinor ?? 0n;
  let cumulativeTurnoverMinor = initialState?.cumulativeTurnoverMinor ?? 0n;
  let lastProcessedAt = initialState?.lastProcessedAt ?? null;
  const source = (): PortfolioEvidence => ({ financialAccountId, baseCurrency: "NOK", ledger, acquisitions, ...(cycleMode ? { disposals } : {}), assets: FIXTURE_ASSETS, prices: prices.filter(p => p.datasetVersion === config.marketDatasetVersion) });
  const stateAt = (at: Date): { projection: PortfolioProjection; state: DecisionPortfolioState } => { const projection = projectPortfolio(source(), at); if (projection.valuationStatus === "INCOMPLETE" || projection.nav === null) throw new Error(`INCOMPLETE_DECISION_PORTFOLIO:${projection.violations.join(",")}`); const values = Object.fromEntries(projection.holdings.map(h => [h.assetId, BigInt(h.marketValueMinor!)])); return { projection, state: { cashMinor: BigInt(projection.cash), decisionNavMinor: BigInt(projection.nav), holdings: projection.holdings.map(h => ({ assetId: h.assetId, marketValueMinor: BigInt(h.marketValueMinor!) })), existingMarketValueByAsset: values, priceRecordIds: projection.provenance.priceRecordIds } }; };
  const appendJournal = (transaction: LedgerTransaction, at: Date): void => {
    journals.push(transaction);
    transaction.entries.forEach((entry, index) => ledger.push({
      entryId: id(runId, `entry:${transaction.id}:${index}`), transactionId: transaction.id, financialAccountId,
      code: entry.ledgerAccount.code, commodityKind: entry.ledgerAccount.commodity.kind,
      currency: entry.ledgerAccount.commodity.kind === "MONEY" ? entry.ledgerAccount.commodity.currencyCode : null,
      assetId: entry.ledgerAccount.commodity.kind === "ASSET" ? entry.ledgerAccount.commodity.assetId : null,
      direction: entry.direction, amountAtoms: entry.amountAtoms, occurredAt: at, recordedAt: at,
    }));
  };
  const sellReason = (reason: PaperExitReasonCode): PaperCycleDecision["reasonCode"] => reason === "STOP_LOSS_TRIGGERED" ? "SELL_STOP_LOSS" : reason === "TAKE_PROFIT_TRIGGERED" ? "SELL_TAKE_PROFIT" : "SELL_MAX_HOLD";
  const events = [
    ...config.contributionEvents.map(e => ({ kind: "CONTRIBUTION" as const, at: date(e.availableAt), eventId: e.eventId, contribution: e })),
    ...(config.strategyEvaluationTimestamps ?? []).map(t => ({ kind: "STRATEGY_EVALUATION" as const, at: date(t), eventId: `strategy-evaluation-${date(t).toISOString()}`, contribution: null })),
    ...config.valuationTimestamps.map(t => ({ kind: "VALUATION" as const, at: date(t), eventId: `valuation-${date(t).toISOString()}`, contribution: null })),
  ].sort((a,b) => a.at.getTime()-b.at.getTime() || ({ CONTRIBUTION: 0, STRATEGY_EVALUATION: 1, VALUATION: 2 }[a.kind] - { CONTRIBUTION: 0, STRATEGY_EVALUATION: 1, VALUATION: 2 }[b.kind]) || a.eventId.localeCompare(b.eventId));
  const evaluatedAt = new Set<number>();
  for (const event of events) {
    if (lastProcessedAt && event.at.getTime() < lastProcessedAt.getTime()) throw new Error("PAPER_ROUND_TIMESTAMP_REGRESSION");
    if (!lastProcessedAt || event.at.getTime() > lastProcessedAt.getTime()) lastProcessedAt = event.at;
    if (event.kind === "CONTRIBUTION") {
      const preContributionPortfolio = stateAt(event.at).projection;
      if (preContributionPortfolio.nav !== null) {
        const adjustedEquity = BigInt(preContributionPortfolio.nav) - netContributionsMinor;
        if (adjustedEquity > adjustedEquityHighWaterMinor) adjustedEquityHighWaterMinor = adjustedEquity;
      }
      netContributionsMinor += BigInt(event.contribution.amountMinor);
      const transaction = createVirtualDepositTransaction({ id: id(runId, `journal:${event.eventId}:deposit`), financialAccountId, occurredAt: event.at, amount: money("NOK", BigInt(event.contribution.amountMinor)), idempotencyRecordId: id(runId, `command:${event.eventId}`), cashAccount: cash, contributedCapitalAccount: capital });
      journals.push(transaction); transaction.entries.forEach((entry, i) => ledger.push({ entryId: id(runId, `entry:${transaction.id}:${i}`), transactionId: transaction.id, financialAccountId, code: entry.ledgerAccount.code, commodityKind: entry.ledgerAccount.commodity.kind, currency: entry.ledgerAccount.commodity.kind === "MONEY" ? entry.ledgerAccount.commodity.currencyCode : null, assetId: entry.ledgerAccount.commodity.kind === "ASSET" ? entry.ledgerAccount.commodity.assetId : null, direction: entry.direction, amountAtoms: entry.amountAtoms, occurredAt: event.at, recordedAt: event.at }));
      const openingPortfolio = stateAt(event.at).projection;
      if (openingPortfolio.nav !== null) {
        const adjustedEquity = BigInt(openingPortfolio.nav) - netContributionsMinor;
        if (adjustedEquity > adjustedEquityHighWaterMinor) adjustedEquityHighWaterMinor = adjustedEquity;
      }
    }
    if (cycleMode && (event.kind === "CONTRIBUTION" || event.kind === "STRATEGY_EVALUATION") && !evaluatedAt.has(event.at.getTime())) {
      for (const instrumentId of config.standingPaperPolicy!.allowedInstrumentIds) {
        const inputPrice = latestAvailablePrice(prices.filter(item => item.datasetVersion === config.marketDatasetVersion), instrumentId, event.at);
        if (!inputPrice) throw new Error("PAPER_CYCLE_PRICE_MISSING");
        if (event.at.getTime() - inputPrice.availableAt.getTime() > config.standingPaperPolicy!.maxPriceAgeMs) throw new Error("PAPER_CYCLE_PRICE_STALE");
      }
      const { projection } = stateAt(event.at);
      for (const holdingState of projection.holdings.filter(item => BigInt(item.quantityAtoms) > 0n)) {
        const asset = FIXTURE_ASSETS.find(item => item.assetId === holdingState.assetId);
        if (!asset) throw new Error("MISSING_ASSET_METADATA");
        const reference = latestAvailablePrice(prices.filter(item => item.datasetVersion === config.marketDatasetVersion), asset.assetId, event.at);
        if (!reference) throw new Error("PAPER_CYCLE_PRICE_MISSING");
        if (event.at.getTime() - reference.availableAt.getTime() > config.standingPaperPolicy!.maxPriceAgeMs) throw new Error("PAPER_CYCLE_PRICE_STALE");
        const oldestLot = holdingState.lots[0];
        if (!oldestLot) throw new Error("INCOMPLETE_COST_BASIS");
        const evaluation = evaluateStandingPaperExit({
          policy: config.standingPaperExitPolicy!, policyId: config.standingPaperPolicy!.policyId,
          policyVersion: config.standingPaperPolicy!.version, strategyVersion: config.strategyVersion,
          assetId: asset.assetId, now: event.at, priceRecordId: reference.recordId, priceAtoms: reference.price.priceAtoms,
          priceScale: reference.price.priceScale, availableAt: reference.availableAt,
          quantityAtoms: BigInt(holdingState.quantityAtoms), quantityScale: asset.quantityScale,
          openCostBasisMinor: BigInt(holdingState.openCostBasisMinor ?? "0"), oldestLotAt: new Date(oldestLot.acquiredAt),
          markedValueMinor: BigInt(holdingState.marketValueMinor ?? "0"),
        });
        const orderId = id(runId, `cycle-order:${event.eventId}:${asset.assetId}`);
        const decisionId = id(runId, `cycle-decision:${event.eventId}:${asset.assetId}`);
        const baseEvidence = {
          policyId: config.standingPaperPolicy!.policyId, policyVersion: config.standingPaperPolicy!.version,
          exitPolicyVersion: config.standingPaperExitPolicy!.version, strategyVersion: config.strategyVersion,
          inputHash: hash(canonical({ evaluationInputHash: evaluation.inputHash, standingPaperPolicy: config.standingPaperPolicy, exitPolicy: config.standingPaperExitPolicy, strategyVersion: config.strategyVersion, assetId: asset.assetId, priceRecordId: reference.recordId, price: reference.price, priceAvailableAt: reference.availableAt, decisionAt: event.at })), assetId: asset.assetId, priceRecordId: reference.recordId,
          priceAvailableAt: reference.availableAt.toISOString(), priceAtoms: reference.price.priceAtoms.toString(), priceScale: reference.price.priceScale,
          decisionAt: event.at.toISOString(),
          quantityAtoms: holdingState.quantityAtoms, quantityScale: asset.quantityScale,
        };
        if (evaluation.action === "HOLD") {
          paperCycleDecisions.push({ decisionId, orderId, action: "HOLD", reasonCode: "HOLD_NO_EXIT_TRIGGER", evidence: { ...baseEvidence, disposition: "HOLD", triggerReason: evaluation.reasonCode } });
          continue;
        }
        const executionPrice = sellExecutionPrice(reference.price, basisPoints(5n), basisPoints(5n));
        const quantityAtoms = quantityWithinSellOrderLimit({ assetId: asset.assetId, availableAtoms: BigInt(holdingState.quantityAtoms), quantityScale: asset.quantityScale, incrementAtoms: asset.minimumQuantityIncrementAtoms, executionPrice, maxOrderMinor: config.standingPaperPolicy!.maxOrderMinor });
        if (quantityAtoms === 0n) {
          paperCycleDecisions.push({ decisionId, orderId, action: "SELL", reasonCode: "SELL_ORDER_LIMIT_REJECTED", evidence: { ...baseEvidence, quantityAtoms: "0", disposition: "REJECTED", triggerReason: evaluation.reasonCode } });
          continue;
        }
        const order = { proposalId: orderId, financialAccountId, assetId: asset.assetId, quantity: { assetId: asset.assetId, atomicUnits: quantityAtoms, quantityScale: asset.quantityScale }, decisionTimestamp: event.at, side: "SELL" as const, orderType: "MARKET" as const };
        const fill = executeSimulationSell({ financialAccountId, accountActive: true, simulationMode: true, decisionApproved: true, riskApproved: true, order, asset, referencePrice: reference, availableQuantity: { assetId: asset.assetId, atomicUnits: BigInt(holdingState.quantityAtoms), quantityScale: asset.quantityScale }, executionTimestamp: event.at, alreadySettled: false });
        const lotConsumptions = planFifoLotConsumption(holdingState.lots, quantityAtoms);
        const basisRemoved = lotConsumptions.reduce((total, item) => total + item.costBasisMinor, 0n);
        const realized = fill.grossNotional.minorUnits - fill.fee.minorUnits - basisRemoved;
        const executionId = id(runId, `execution:${event.eventId}:SELL:${asset.assetId}`);
        const transaction = createLedgerTransaction({
          id: id(runId, `journal:${event.eventId}:SELL:${asset.assetId}`), financialAccountId, type: "SIMULATED_SELL_SETTLEMENT", occurredAt: event.at,
          narrative: "Deterministic PAPER_ONLY SELL settlement", entries: [
            ledgerEntry(cash, "DEBIT", fill.grossNotional.minorUnits), ledgerEntry(cash, "CREDIT", fill.fee.minorUnits), ledgerEntry(fee, "DEBIT", fill.fee.minorUnits),
            ledgerEntry(account(financialAccountId, `ASSET_HOLDING:${asset.assetId}`, { kind: "ASSET", assetId: asset.assetId }, "ASSET", "DEBIT", runId), "CREDIT", quantityAtoms),
            ledgerEntry(account(financialAccountId, `ASSET_CLEARING:${asset.assetId}`, { kind: "ASSET", assetId: asset.assetId }, "CLEARING", "CREDIT", runId), "DEBIT", quantityAtoms),
            ledgerEntry(account(financialAccountId, `ASSET_COST_BASIS:${asset.assetId}`, { kind: "MONEY", currencyCode: "NOK" }, "ASSET", "DEBIT", runId), "CREDIT", basisRemoved),
            ...(fill.grossNotional.minorUnits > basisRemoved ? [ledgerEntry(account(financialAccountId, "REALIZED_GAIN", { kind: "MONEY", currencyCode: "NOK" }, "INCOME", "CREDIT", runId), "CREDIT", fill.grossNotional.minorUnits - basisRemoved)] : []),
            ...(basisRemoved > fill.grossNotional.minorUnits ? [ledgerEntry(account(financialAccountId, "REALIZED_LOSS", { kind: "MONEY", currencyCode: "NOK" }, "EXPENSE", "DEBIT", runId), "DEBIT", basisRemoved - fill.grossNotional.minorUnits)] : []),
          ],
        });
        appendJournal(transaction, event.at);
        const disposal: DisposalEvidence = {
          fillId: fill.fillId, executionId, ledgerTransactionId: transaction.id, financialAccountId, assetId: asset.assetId,
          quantityAtoms, quantityScale: asset.quantityScale, currency: "NOK", grossMinor: fill.grossNotional.minorUnits,
          feeMinor: fill.fee.minorUnits, executedAt: event.at, recordedAt: event.at, executionPolicyVersion: fill.executionPolicyVersion,
          executionMatchesFill: true, lotConsumptions, realizedPnlMinor: realized,
        };
        disposals.push(disposal);
        executions.push(fill);
        realizedPnlMinor += realized;
        cumulativeTurnoverMinor += fill.grossNotional.minorUnits;
        paperCycleDecisions.push({ decisionId, orderId, action: "SELL", reasonCode: sellReason(evaluation.reasonCode), evidence: { ...baseEvidence, quantityAtoms: quantityAtoms.toString(), disposition: "EXECUTED", triggerReason: evaluation.reasonCode } });
        const afterSale = stateAt(event.at).projection;
        if (afterSale.nav !== null) {
          const adjustedEquity = BigInt(afterSale.nav) - netContributionsMinor;
          if (adjustedEquity > adjustedEquityHighWaterMinor) adjustedEquityHighWaterMinor = adjustedEquity;
        }
      }
    }
    if ((event.kind === "CONTRIBUTION" || event.kind === "STRATEGY_EVALUATION") && !evaluatedAt.has(event.at.getTime())) {
      evaluatedAt.add(event.at.getTime());
      const { state } = stateAt(event.at); const decision = contributionRebalancing({ financialAccountId, decisionId: id(runId, `decision:${event.eventId}`), cash: money("NOK", state.cashMinor), decisionTimestamp: event.at, prices: prices.filter(p => p.datasetVersion === config.marketDatasetVersion), portfolioState: state }); decisions.push(decision);
      for (const order of decision.proposedOrders) {
        const live = stateAt(event.at);
        if (live.projection.nav === null) throw new Error("INCOMPLETE_DECISION_PORTFOLIO");
        const asset = FIXTURE_ASSETS.find(a => a.assetId === order.assetId)!;
        const reference = latestAvailablePrice(prices.filter(p => p.datasetVersion === config.marketDatasetVersion), order.assetId, event.at);
        if (!reference && cycleMode) throw new Error("PAPER_CYCLE_PRICE_MISSING");
        if (!reference) continue;
        if (cycleMode && event.at.getTime() - reference.availableAt.getTime() > config.standingPaperPolicy!.maxPriceAgeMs) throw new Error("PAPER_CYCLE_PRICE_STALE");
        const risk = assessProposal(order, { accountActive: true, simulationMode: true, strategyEnabled: true, strategyVersion: decision.strategyVersion, accountCurrency: "NOK", availableCash: money("NOK", live.state.cashMinor), decisionNav: money("NOK", live.state.decisionNavMinor), decisionTimestamp: event.at, assets: FIXTURE_ASSETS, prices: prices.filter(p => p.datasetVersion === config.marketDatasetVersion), portfolioState: live.state });
        risks.push(risk);
        let policyEvidence: PaperPolicyEvidence | undefined;
        if (config.standingPaperPolicy) {
          const executionPrice = buyExecutionPrice(reference.price, basisPoints(5n), basisPoints(5n));
          const notional = buySettlementNotional(order.quantity, executionPrice);
          const estimatedFee = feeCeiling(notional, basisPoints(10n), money("NOK", 100n));
          const holdingValue = live.projection.holdings.find(item => item.assetId === asset.assetId)?.marketValueMinor;
          const grossExposure = live.projection.holdings.reduce((sum, item) => sum + BigInt(item.marketValueMinor ?? "0"), 0n);
          policyEvidence = assessStandingPaperPolicy(config.standingPaperPolicy, order, {
            now: event.at, assets: FIXTURE_ASSETS, prices, openOrderReservationsMinor: [], committedCapitalMinor,
            ...(cycleMode ? { capitalBudgetUsageMinor: netContributionsMinor, capitalBudgetProspectiveDebitMinor: 0n } : {}),
            currentCashMinor: live.state.cashMinor, currentPositionMinor: BigInt(holdingValue ?? "0"),
            currentGrossExposureMinor: grossExposure,
            currentLossMinor: adjustedEquityHighWaterMinor > BigInt(live.projection.nav) - netContributionsMinor ? adjustedEquityHighWaterMinor - (BigInt(live.projection.nav) - netContributionsMinor) : 0n,
            prospectiveOrderDebitMinor: notional.minorUnits + estimatedFee.minorUnits,
          });
        }
        const cycleBuyInputHash = cycleMode && policyEvidence ? hash(canonical({
          paperCycleContractVersion: PAPER_CYCLE_CONTRACT_VERSION, riskDecisionInputHash: policyEvidence.inputHash,
          standingPaperPolicy: config.standingPaperPolicy, standingPaperExitPolicy: config.standingPaperExitPolicy,
          strategyVersion: decision.strategyVersion, orderId: order.proposalId, assetId: order.assetId,
          priceRecordId: reference.recordId, price: reference.price, priceAvailableAt: reference.availableAt,
          decisionAt: event.at, quantityAtoms: order.quantity.atomicUnits, quantityScale: order.quantity.quantityScale,
        })) : policyEvidence?.inputHash;
        if (risk.disposition !== "APPROVE") {
          if (config.standingPaperPolicy && policyEvidence) paperPolicyDecisions.push({ decisionId: decision.decisionId, orderId: order.proposalId, outcome: "REJECTED", riskCodes: risk.violations.map(item => item.code), evidence: { ...policyEvidence, disposition: "REJECT", reasonCode: "M1_RISK_REJECTED" } });
          if (cycleMode && policyEvidence) paperCycleDecisions.push({ decisionId: id(runId, `cycle-buy-decision:${event.eventId}:${order.assetId}`), orderId: order.proposalId, action: "BUY", reasonCode: "BUY_RISK_REJECTED", evidence: { policyId: config.standingPaperPolicy!.policyId, policyVersion: config.standingPaperPolicy!.version, exitPolicyVersion: config.standingPaperExitPolicy!.version, strategyVersion: decision.strategyVersion, inputHash: cycleBuyInputHash!, assetId: order.assetId, priceRecordId: reference.recordId, priceAvailableAt: reference.availableAt.toISOString(), decisionAt: event.at.toISOString(), priceAtoms: reference.price.priceAtoms.toString(), priceScale: reference.price.priceScale, quantityAtoms: order.quantity.atomicUnits.toString(), quantityScale: order.quantity.quantityScale, disposition: "REJECTED", triggerReason: null } });
          continue;
        }
        if (policyEvidence?.disposition === "REJECT") {
          paperPolicyDecisions.push({ decisionId: decision.decisionId, orderId: order.proposalId, outcome: "REJECTED", riskCodes: [], evidence: policyEvidence });
          if (cycleMode) paperCycleDecisions.push({ decisionId: id(runId, `cycle-buy-decision:${event.eventId}:${order.assetId}`), orderId: order.proposalId, action: "BUY", reasonCode: "BUY_RISK_REJECTED", evidence: { policyId: config.standingPaperPolicy!.policyId, policyVersion: config.standingPaperPolicy!.version, exitPolicyVersion: config.standingPaperExitPolicy!.version, strategyVersion: decision.strategyVersion, inputHash: cycleBuyInputHash!, assetId: order.assetId, priceRecordId: reference.recordId, priceAvailableAt: reference.availableAt.toISOString(), decisionAt: event.at.toISOString(), priceAtoms: reference.price.priceAtoms.toString(), priceScale: reference.price.priceScale, quantityAtoms: order.quantity.atomicUnits.toString(), quantityScale: order.quantity.quantityScale, disposition: "REJECTED", triggerReason: null } });
          continue;
        }
        const fill = executeSimulationBuy({ financialAccountId, actorId: financialAccountId, accountActive: true, simulationMode: true, decisionApproved: true, riskApproved: true, proposal: order, asset, referencePrice: reference, availableCash: money("NOK", live.state.cashMinor), decisionNav: money("NOK", live.state.decisionNavMinor), executionTimestamp: event.at, alreadySettled: false });
        if (policyEvidence) paperPolicyDecisions.push({ decisionId: decision.decisionId, orderId: order.proposalId, outcome: "SIMULATED_FILLED", riskCodes: [], evidence: policyEvidence });
        if (cycleMode && policyEvidence) paperCycleDecisions.push({ decisionId: id(runId, `cycle-buy-decision:${event.eventId}:${order.assetId}`), orderId: order.proposalId, action: "BUY", reasonCode: "BUY_FILLED", evidence: { policyId: config.standingPaperPolicy!.policyId, policyVersion: config.standingPaperPolicy!.version, exitPolicyVersion: config.standingPaperExitPolicy!.version, strategyVersion: decision.strategyVersion, inputHash: cycleBuyInputHash!, assetId: order.assetId, priceRecordId: reference.recordId, priceAvailableAt: reference.availableAt.toISOString(), decisionAt: event.at.toISOString(), priceAtoms: reference.price.priceAtoms.toString(), priceScale: reference.price.priceScale, quantityAtoms: fill.quantity.atomicUnits.toString(), quantityScale: fill.quantity.quantityScale, disposition: "EXECUTED", triggerReason: null } });
        executions.push(fill); committedCapitalMinor += fill.totalCashDebit.minorUnits;
        if (cycleMode) cumulativeTurnoverMinor += fill.grossNotional.minorUnits;
        const holding = account(financialAccountId, `ASSET_HOLDING:${asset.assetId}`, { kind: "ASSET", assetId: asset.assetId }, "ASSET", "DEBIT", runId); const clearing = account(financialAccountId, `ASSET_CLEARING:${asset.assetId}`, { kind: "ASSET", assetId: asset.assetId }, "CLEARING", "CREDIT", runId); const cost = account(financialAccountId, `ASSET_COST_BASIS:${asset.assetId}`, { kind: "MONEY", currencyCode: "NOK" }, "ASSET", "DEBIT", runId);
        const tx = createLedgerTransaction({ id: id(runId, `journal:${event.eventId}:${order.assetId}`), financialAccountId, type: "SIMULATED_BUY_SETTLEMENT", occurredAt: event.at, narrative: "Deterministic paper simulation BUY settlement", entries: [ledgerEntry(cost, "DEBIT", fill.grossNotional.minorUnits), ledgerEntry(cash, "CREDIT", fill.grossNotional.minorUnits), ledgerEntry(fee, "DEBIT", fill.fee.minorUnits), ledgerEntry(cash, "CREDIT", fill.fee.minorUnits), ledgerEntry(holding, "DEBIT", fill.quantity.atomicUnits), ledgerEntry(clearing, "CREDIT", fill.quantity.atomicUnits)] }); journals.push(tx);
        tx.entries.forEach((entry,i) => ledger.push({ entryId:id(runId,`entry:${tx.id}:${i}`), transactionId:tx.id, financialAccountId, code:entry.ledgerAccount.code, commodityKind:entry.ledgerAccount.commodity.kind, currency:entry.ledgerAccount.commodity.kind === "MONEY" ? entry.ledgerAccount.commodity.currencyCode : null, assetId:entry.ledgerAccount.commodity.kind === "ASSET" ? entry.ledgerAccount.commodity.assetId : null, direction:entry.direction, amountAtoms:entry.amountAtoms, occurredAt:event.at, recordedAt:event.at }));
        acquisitions.push({ fillId: fill.fillId, executionId: id(runId, `execution:${event.eventId}:${order.assetId}`), ledgerTransactionId: tx.id, financialAccountId, assetId: order.assetId, quantityAtoms: fill.quantity.atomicUnits, quantityScale: fill.quantity.quantityScale, currency: "NOK", grossMinor: fill.grossNotional.minorUnits, feeMinor: fill.fee.minorUnits, executedAt: event.at, recordedAt: event.at, executionPolicyVersion: fill.executionPolicyVersion, executionMatchesFill: true });
        const afterFill = stateAt(event.at);
        if (afterFill.projection.nav !== null) {
          const adjustedEquity = BigInt(afterFill.projection.nav) - netContributionsMinor;
          if (adjustedEquity > adjustedEquityHighWaterMinor) adjustedEquityHighWaterMinor = adjustedEquity;
        }
      }
    }
    const snapshot = projectPortfolio(source(), event.at);
    if (snapshot.nav !== null) {
      const adjustedEquity = BigInt(snapshot.nav) - netContributionsMinor;
      if (adjustedEquity > adjustedEquityHighWaterMinor) adjustedEquityHighWaterMinor = adjustedEquity;
    }
    snapshots.push(snapshot);
  }
  const endingState = snapshots.at(-1) ?? projectPortfolio(source(), date(config.endAt));
  const persistentState: DeterministicBacktestState = { ledger: [...ledger], acquisitions: [...acquisitions], netContributionsMinor, adjustedEquityHighWaterMinor, committedCapitalMinor, lastProcessedAt, ...(cycleMode ? { disposals: [...disposals], realizedPnlMinor, cumulativeTurnoverMinor } : {}) };
  return Object.freeze({ runId, configHash, config, decisions: Object.freeze(decisions), riskAssessments: Object.freeze(risks), executions: Object.freeze(executions), journals: Object.freeze(journals), portfolioSnapshots: Object.freeze(snapshots), endingState, integrityStatus: "CONSISTENT" as const, paperPolicyDecisions: Object.freeze(paperPolicyDecisions), persistentState, ...(cycleMode ? { paperCycleDecisions: Object.freeze(paperCycleDecisions) } : {}) });
}
