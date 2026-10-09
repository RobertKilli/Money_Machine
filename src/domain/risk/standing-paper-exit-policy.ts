import { createHash } from "node:crypto";

export const STANDING_PAPER_EXIT_POLICY_VERSION = "standing-paper-exit-policy/v1" as const;
export const PAPER_CYCLE_CONTRACT_VERSION = "standing-paper-cycle/v2" as const;

export interface StandingPaperExitPolicy {
  readonly version: typeof STANDING_PAPER_EXIT_POLICY_VERSION;
  /** Trigger when current mark is at least this many bps below open FIFO cost. */
  readonly stopLossBps: bigint;
  /** Trigger when current mark is at least this many bps above open FIFO cost. */
  readonly takeProfitBps: bigint;
  /** Trigger when the oldest still-open FIFO lot has reached this age. */
  readonly maxHoldingMs: number;
}

export type PaperExitAction = "SELL" | "HOLD";
export type PaperExitReasonCode =
  | "STOP_LOSS_TRIGGERED"
  | "TAKE_PROFIT_TRIGGERED"
  | "MAX_HOLD_TIME_TRIGGERED"
  | "HOLD_NO_EXIT_TRIGGER";

export interface PaperExitEvaluation {
  readonly action: PaperExitAction;
  readonly reasonCode: PaperExitReasonCode;
  readonly inputHash: string;
}

export function assertValidStandingPaperExitPolicy(policy: StandingPaperExitPolicy): void {
  if (policy.version !== STANDING_PAPER_EXIT_POLICY_VERSION ||
    typeof policy.stopLossBps !== "bigint" || policy.stopLossBps <= 0n || policy.stopLossBps >= 10_000n ||
    typeof policy.takeProfitBps !== "bigint" || policy.takeProfitBps <= 0n || policy.takeProfitBps > 1_000_000n ||
    !Number.isSafeInteger(policy.maxHoldingMs) || policy.maxHoldingMs <= 0 || policy.maxHoldingMs > 365 * 24 * 60 * 60 * 1_000) {
    throw new Error("PAPER_EXIT_POLICY_INVALID");
  }
}

/**
 * Deterministic exit precedence is stop loss, take profit, then maximum age.
 * Price comparisons use integer cross-products against the remaining FIFO
 * cost basis, which includes allocated BUY fees. Thresholds are scenario
 * inputs; they are not investment guidance.
 */
export function evaluateStandingPaperExit(input: {
  readonly policy: StandingPaperExitPolicy;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly strategyVersion: string;
  readonly assetId: string;
  readonly now: Date;
  readonly priceRecordId: string;
  readonly priceAtoms: bigint;
  readonly priceScale: number;
  readonly availableAt: Date;
  readonly quantityAtoms: bigint;
  readonly quantityScale: number;
  readonly openCostBasisMinor: bigint;
  readonly oldestLotAt: Date;
  readonly markedValueMinor: bigint;
}): PaperExitEvaluation {
  assertValidStandingPaperExitPolicy(input.policy);
  if (!Number.isFinite(input.now.getTime()) || !Number.isFinite(input.availableAt.getTime()) ||
    !Number.isFinite(input.oldestLotAt.getTime()) || input.availableAt.getTime() > input.now.getTime() ||
    input.priceAtoms <= 0n || !Number.isInteger(input.priceScale) || input.priceScale < 0 || input.priceScale > 8 ||
    input.quantityAtoms <= 0n || !Number.isInteger(input.quantityScale) || input.quantityScale < 0 || input.quantityScale > 8 ||
    input.openCostBasisMinor <= 0n || input.markedValueMinor < 0n) throw new Error("PAPER_EXIT_INPUT_INVALID");

  const inputHash = createHash("sha256").update(JSON.stringify({
    exitPolicy: {
      version: input.policy.version,
      stopLossBps: input.policy.stopLossBps.toString(),
      takeProfitBps: input.policy.takeProfitBps.toString(),
      maxHoldingMs: input.policy.maxHoldingMs,
    },
    policyId: input.policyId,
    policyVersion: input.policyVersion,
    strategyVersion: input.strategyVersion,
    assetId: input.assetId,
    now: input.now.toISOString(),
    price: { recordId: input.priceRecordId, priceAtoms: input.priceAtoms.toString(), priceScale: input.priceScale, availableAt: input.availableAt.toISOString() },
    position: { quantityAtoms: input.quantityAtoms.toString(), quantityScale: input.quantityScale, openCostBasisMinor: input.openCostBasisMinor.toString(), oldestLotAt: input.oldestLotAt.toISOString(), markedValueMinor: input.markedValueMinor.toString() },
  })).digest("hex");

  const heldForMs = input.now.getTime() - input.oldestLotAt.getTime();
  const reasonCode: PaperExitReasonCode =
    input.markedValueMinor * 10_000n <= input.openCostBasisMinor * (10_000n - input.policy.stopLossBps) ? "STOP_LOSS_TRIGGERED" :
      input.markedValueMinor * 10_000n >= input.openCostBasisMinor * (10_000n + input.policy.takeProfitBps) ? "TAKE_PROFIT_TRIGGERED" :
        heldForMs >= input.policy.maxHoldingMs ? "MAX_HOLD_TIME_TRIGGERED" : "HOLD_NO_EXIT_TRIGGER";
  return Object.freeze({ action: reasonCode === "HOLD_NO_EXIT_TRIGGER" ? "HOLD" : "SELL", reasonCode, inputHash });
}
