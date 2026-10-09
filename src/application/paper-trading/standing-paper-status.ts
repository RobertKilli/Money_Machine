import type { BacktestResult, DeterministicBacktestState } from "@/application/backtest/run-deterministic-backtest";
import type { StandingPaperPolicy } from "@/domain/risk/standing-paper-policy";

const maxBigInt = (left: bigint, right: bigint) => left > right ? left : right;

export type StandingPaperStatus = "NO_POLICY" | "NO_ROUNDS" | "AVAILABLE" | "INCOMPLETE" | "INVALID";
export type StandingPaperWorkerInstanceStatus = "RUNNING" | "WAITING_PAUSED" | "WAITING_INTERVAL" | "ENDED" | "STALE";

export interface StandingPaperWorkerInstanceStatusRecord {
  readonly workerId: string;
  readonly processInstanceId: string;
  readonly status: StandingPaperWorkerInstanceStatus;
  readonly lastHeartbeatAt: string;
}

export interface StandingPaperStatusDecision {
  readonly orderId: string;
  readonly decisionId: string;
  readonly outcome: "SIMULATED_FILLED" | "REJECTED";
  readonly reasonCode: string;
  readonly disposition: "APPROVE" | "REJECT";
  readonly recordedAt: string;
}

export interface StandingPaperStatusFill {
  readonly fillId: string;
  readonly orderId: string;
  readonly instrumentId: string;
  readonly quantityAtoms: string;
  readonly quantityScale: number;
  readonly grossMinor: string;
  readonly feeMinor: string;
  readonly currency: "NOK";
  readonly simulatedAt: string;
  readonly executionPolicyVersion: string;
}

export interface StandingPaperPolicyStatusCard {
  readonly status: Exclude<StandingPaperStatus, "NO_POLICY">;
  readonly policyId: string;
  readonly identity: string | null;
  readonly version: string | null;
  readonly policyStatus: "DRAFT" | "ACTIVE" | "PAUSED" | "STOPPED" | "UNKNOWN";
  readonly mode: "PAPER_ONLY" | "UNKNOWN";
  readonly workerStatus: StandingPaperWorkerInstanceStatus | "UNKNOWN";
  readonly workerInstances: readonly StandingPaperWorkerInstanceStatusRecord[];
  readonly workerInstanceCount: number;
  readonly workerInstancesTruncated: boolean;
  readonly allowedInstrumentIds: readonly string[];
  readonly riskLimits: {
    readonly capitalBudgetMinor: string | null;
    readonly maxOrderMinor: string | null;
    readonly maxPositionMinor: string | null;
    readonly maxGrossExposureMinor: string | null;
    readonly maxLossMinor: string | null;
    readonly maxPriceAgeMs: number | null;
  };
  readonly lastRound: null | { readonly id: string; readonly completedAt: string; readonly asOf: string };
  readonly netContributionsMinor: string | null;
  readonly committedCapitalMinor: string | null;
  readonly remainingCapitalBudgetMinor: string | null;
  readonly portfolioValueMinor: string | null;
  readonly portfolioValueAsOf: string | null;
  readonly currentLossMinor: string | null;
  readonly remainingLossMarginMinor: string | null;
  readonly decisions: readonly StandingPaperStatusDecision[];
  readonly fills: readonly StandingPaperStatusFill[];
  readonly issueCode: "PAPER_MATERIAL_INVALID" | "PAPER_VALUATION_INCOMPLETE" | null;
}

export interface StandingPaperStatusReadModel {
  readonly status: StandingPaperStatus;
  readonly classification: "PAPER_ONLY_SYNTHETIC_SIMULATION";
  readonly workerStatus: "UNKNOWN";
  readonly policies: readonly StandingPaperPolicyStatusCard[];
}

export function projectStandingPaperStatusCard(input: {
  readonly policy: StandingPaperPolicy;
  readonly state: DeterministicBacktestState;
  readonly run: null | { readonly id: string; readonly createdAt: string; readonly result: BacktestResult; readonly valuation: { readonly navMinor: string | null; readonly asOf: string; readonly complete: boolean } };
  readonly decisions?: readonly StandingPaperStatusDecision[];
  readonly fills?: readonly StandingPaperStatusFill[];
  readonly workers?: readonly StandingPaperWorkerInstanceStatusRecord[];
  readonly workerSummary?: { readonly status: StandingPaperWorkerInstanceStatus | "UNKNOWN"; readonly count: number; readonly truncated: boolean };
}): StandingPaperPolicyStatusCard {
  const { policy, state, run } = input;
  const decisions = input.decisions ?? (run?.result.paperPolicyDecisions.map(item => {
    const strategyDecision = run.result.decisions.find(decision => decision.decisionId === item.decisionId);
    return { orderId: item.orderId, decisionId: item.decisionId, outcome: item.outcome, reasonCode: item.evidence.reasonCode, disposition: item.evidence.disposition, recordedAt: strategyDecision?.decisionTimestamp.toISOString() ?? run.createdAt };
  }) ?? []);
  const fills = input.fills ?? (run?.result.executions.flatMap(fill => {
    const acquisition = run.result.persistentState.acquisitions.find(item => item.fillId === fill.fillId);
    if (!acquisition) return [];
    return [{ fillId: fill.fillId, orderId: fill.proposalId, instrumentId: acquisition.assetId, quantityAtoms: fill.quantity.atomicUnits.toString(), quantityScale: fill.quantity.quantityScale, grossMinor: fill.grossNotional.minorUnits.toString(), feeMinor: fill.fee.minorUnits.toString(), currency: "NOK" as const, simulatedAt: fill.executionTimestamp.toISOString(), executionPolicyVersion: fill.executionPolicyVersion }];
  }) ?? []);
  const workers = input.workers ?? [];
  const workerStatus = input.workerSummary?.status ?? (workers.length === 0 ? "UNKNOWN"
    : workers.some(worker => worker.status === "RUNNING") ? "RUNNING"
      : workers.some(worker => worker.status === "WAITING_PAUSED") ? "WAITING_PAUSED"
        : workers.some(worker => worker.status === "WAITING_INTERVAL") ? "WAITING_INTERVAL"
          : workers.some(worker => worker.status === "STALE") ? "STALE" : "ENDED");
  const workerInstanceCount = input.workerSummary?.count ?? workers.length;
  const workerInstancesTruncated = input.workerSummary?.truncated ?? false;
  const loss = run?.valuation.navMinor === null || !run ? null : maxBigInt(0n, state.adjustedEquityHighWaterMinor - (BigInt(run.valuation.navMinor) - state.netContributionsMinor));
  const remainingBudget = maxBigInt(0n, policy.capitalBudgetMinor - state.committedCapitalMinor);
  const remainingLoss = loss === null ? null : maxBigInt(0n, policy.maxLossMinor - loss);
  const status = !run ? "NO_ROUNDS" : run.valuation.complete ? "AVAILABLE" : "INCOMPLETE";
  return {
    status, policyId: policy.policyId, identity: policy.identity, version: policy.version,
    policyStatus: policy.status, mode: policy.mode, workerStatus, workerInstances: [...workers], workerInstanceCount, workerInstancesTruncated,
    allowedInstrumentIds: [...policy.allowedInstrumentIds].sort(),
    riskLimits: {
      capitalBudgetMinor: policy.capitalBudgetMinor.toString(), maxOrderMinor: policy.maxOrderMinor.toString(),
      maxPositionMinor: policy.maxPositionMinor.toString(), maxGrossExposureMinor: policy.maxGrossExposureMinor.toString(),
      maxLossMinor: policy.maxLossMinor.toString(), maxPriceAgeMs: policy.maxPriceAgeMs,
    },
    lastRound: run ? { id: run.id, completedAt: run.createdAt, asOf: run.valuation.asOf } : null,
    netContributionsMinor: state.netContributionsMinor.toString(), committedCapitalMinor: state.committedCapitalMinor.toString(),
    remainingCapitalBudgetMinor: remainingBudget.toString(), portfolioValueMinor: run?.valuation.navMinor ?? null,
    portfolioValueAsOf: run?.valuation.asOf ?? null, currentLossMinor: loss?.toString() ?? null,
    remainingLossMarginMinor: remainingLoss?.toString() ?? null, decisions, fills,
    issueCode: !run || run.valuation.complete ? null : "PAPER_VALUATION_INCOMPLETE",
  };
}

/** Shared server projection for repository responses and positive UI fixtures. */
export function projectStandingPaperStatusReadModel(policies: readonly StandingPaperPolicyStatusCard[]): StandingPaperStatusReadModel {
  const status: StandingPaperStatus = policies.length === 0 ? "NO_POLICY"
    : policies.some(policy => policy.status === "AVAILABLE") ? "AVAILABLE"
      : policies.some(policy => policy.status === "INCOMPLETE") ? "INCOMPLETE"
        : policies.some(policy => policy.status === "INVALID") ? "INVALID" : "NO_ROUNDS";
  return { status, classification: "PAPER_ONLY_SYNTHETIC_SIMULATION", workerStatus: "UNKNOWN", policies: [...policies] };
}
