import type { BacktestResult, PaperCycleDecision } from "@/application/backtest/run-deterministic-backtest";
import type { StandingPaperStatusDecision, StandingPaperStatusFill } from "./standing-paper-status";
import type { DisposalEvidence } from "@/domain/portfolio/portfolio-projection";
import type { ProposedOrder } from "@/domain/strategy/fixture-assets";

export interface StandingPaperLedgerSettlement {
  readonly id: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly entries: readonly {
    readonly id: string; readonly code: string; readonly direction: string;
    readonly amountAtoms: string; readonly commodity: string; readonly recordedAt: string;
  }[];
}

type SavedPolicyDecision = BacktestResult["paperPolicyDecisions"][number];
type SavedRun = Partial<Pick<BacktestResult, "config" | "decisions">>;

export function projectStandingPaperDecisionDetail(input: {
  policyId: string; accountId: string; decision: StandingPaperStatusDecision;
  policyDecision?: SavedPolicyDecision; cycleDecision?: PaperCycleDecision;
  run?: SavedRun; roundRecordedAt: string;
  fill: StandingPaperStatusFill | null; cashChangeMinor: string | null;
  execution?: Pick<BacktestResult["executions"][number], "executionPrice" | "feePolicyVersion" | "spreadSlippagePolicyVersion" | "roundingPolicyVersion">;
  disposal?: DisposalEvidence; settlement: StandingPaperLedgerSettlement | null;
}) {
  const { policyId, accountId, decision, policyDecision, cycleDecision, run, fill, execution, disposal } = input;
  const policyEvidence = policyDecision?.evidence;
  const cycleEvidence = cycleDecision?.evidence;
  const config = run?.config?.financialAccountId === accountId ? run.config : undefined;
  const savedPolicy = config?.standingPaperPolicy;
  const limits = savedPolicy?.policyId === policyId && savedPolicy.financialAccountId === accountId ? savedPolicy : undefined;
  const savedDecisions: BacktestResult["decisions"] = Array.isArray(run?.decisions) ? run.decisions : [];
  const strategy = policyDecision ? savedDecisions.find(item =>
    item?.decisionId === policyDecision.decisionId && item.financialAccountId === accountId &&
    Array.isArray(item.proposedOrders) && item.proposedOrders.some((order: ProposedOrder) => order?.proposalId === decision.orderId && order.financialAccountId === accountId),
  ) : undefined;
  const order = strategy?.proposedOrders.find(item => item.proposalId === decision.orderId);
  const decisionTimestamp = strategy?.decisionTimestamp;
  const lots = disposal?.lotConsumptions;
  return {
    policyId, decision, roundRecordedAt: input.roundRecordedAt,
    instrumentId: cycleEvidence?.assetId ?? order?.assetId ?? fill?.instrumentId ?? null,
    decisionAt: cycleEvidence?.decisionAt ?? (decisionTimestamp instanceof Date && Number.isFinite(decisionTimestamp.getTime()) ? decisionTimestamp.toISOString() : null),
    price: {
      recordId: cycleEvidence?.priceRecordId ?? policyEvidence?.priceRecordId ?? null,
      availableAt: cycleEvidence?.priceAvailableAt ?? policyEvidence?.priceAvailableAt ?? null,
      atoms: cycleEvidence?.priceAtoms ?? policyEvidence?.referencePriceAtoms ?? null,
      scale: cycleEvidence?.priceScale ?? policyEvidence?.referencePriceScale ?? null,
      datasetVersion: policyEvidence?.datasetVersion ?? config?.marketDatasetVersion ?? null,
    },
    versions: {
      strategy: cycleEvidence?.strategyVersion ?? policyEvidence?.strategyVersion ?? null,
      standingPolicy: cycleEvidence?.policyVersion ?? policyEvidence?.policyVersion ?? null,
      risk: config?.riskPolicyVersion ?? null,
      execution: fill?.executionPolicyVersion ?? policyEvidence?.executionPolicyVersions?.execution ?? null,
      fee: execution?.feePolicyVersion ?? policyEvidence?.executionPolicyVersions?.fee ?? null,
      spread: execution?.spreadSlippagePolicyVersion ?? policyEvidence?.executionPolicyVersions?.spreadSlippage ?? null,
      rounding: execution?.roundingPolicyVersion ?? policyEvidence?.executionPolicyVersions?.rounding ?? null,
      cycle: config?.paperCycleContractVersion ?? null,
      exit: cycleEvidence?.exitPolicyVersion ?? null,
      fifo: config?.fifoCostBasisVersion ?? null,
    },
    risk: {
      inputHash: policyEvidence?.inputHash ?? cycleEvidence?.inputHash ?? null,
      riskCodes: Array.isArray(policyDecision?.riskCodes) ? policyDecision.riskCodes.filter(code => typeof code === "string") : null,
      reservedMinor: policyEvidence?.reservedOpenOrdersMinor ?? null,
      resultingExposureMinor: policyEvidence?.resultingExposureMinor ?? null,
      currentLossMinor: policyEvidence?.currentLossMinor ?? null,
      projectedLossMinor: policyEvidence?.projectedLossMinor ?? null,
      maxLossMinor: policyEvidence?.maxLossMinor ?? limits?.maxLossMinor?.toString() ?? null,
      maxOrderMinor: limits?.maxOrderMinor?.toString() ?? null,
      maxPositionMinor: limits?.maxPositionMinor?.toString() ?? null,
      maxExposureMinor: limits?.maxGrossExposureMinor?.toString() ?? null,
      capitalBudgetMinor: limits?.capitalBudgetMinor?.toString() ?? null,
      maxPriceAgeMs: limits?.maxPriceAgeMs ?? null,
      stopLossBps: limits?.cycleConfiguration?.exitPolicy.stopLossBps?.toString() ?? null,
      takeProfitBps: limits?.cycleConfiguration?.exitPolicy.takeProfitBps?.toString() ?? null,
      maxHoldingMs: limits?.cycleConfiguration?.exitPolicy.maxHoldingMs ?? null,
      triggerReason: cycleEvidence?.triggerReason ?? null,
    },
    fill: fill ? { ...fill, cashChangeMinor: input.cashChangeMinor,
      executionPriceAtoms: execution?.executionPrice?.priceAtoms?.toString() ?? null,
      executionPriceScale: execution?.executionPrice?.priceScale ?? null,
    } : null,
    settlement: input.settlement,
    fifo: Array.isArray(lots) && lots.every(lot => lot && typeof lot.fillId === "string" &&
      typeof lot.quantityAtoms === "bigint" && typeof lot.costBasisMinor === "bigint")
      ? lots.map(lot => ({ fillId: lot.fillId, quantityAtoms: lot.quantityAtoms.toString(), costBasisMinor: lot.costBasisMinor.toString() })) : null,
  };
}

export type StandingPaperDecisionDetail = ReturnType<typeof projectStandingPaperDecisionDetail>;
