import { createHash } from "node:crypto";
import { BASIS_POINTS_PER_WHOLE } from "./basis-points";
import { CURRENCY_REGISTRY, type CurrencyCode } from "./currency";
import { floorDivision } from "./rounding";

export const PAPER_PROFIT_ALLOCATION_VERSION = "paper-profit-allocation/v1" as const;
const MAX_MINOR = 10n ** 38n - 1n;

export interface PaperProfitAllocationPolicy {
  readonly version: typeof PAPER_PROFIT_ALLOCATION_VERSION;
  readonly policyId: string;
  readonly financialAccountId: string;
  readonly ownerId: string;
  readonly mode: "PAPER_ONLY";
  readonly currency: CurrencyCode;
  readonly enabled: boolean;
  readonly reinvestmentBps: bigint;
}

/** A caller-supplied projection of an already settled sale, not ledger authority. */
export interface PaperProfitSettlement {
  readonly type: "SIMULATED_SELL_SETTLEMENT";
  readonly settlementId: string;
  readonly fillId: string;
  readonly financialAccountId: string;
  readonly ownerId: string;
  readonly currency: CurrencyCode;
  readonly sequence: bigint;
  readonly settledAt: string;
  readonly grossProceedsMinor: bigint;
  readonly sellFeeMinor: bigint;
  /** Consumed FIFO cost including its allocated BUY fee. */
  readonly fifoCostBasisMinor: bigint;
}

export interface PaperProfitAllocation {
  readonly settlement: Readonly<PaperProfitSettlement>;
  readonly inputHash: string;
  readonly netRealizedPnlMinor: bigint;
  readonly cumulativeRealizedPnlMinor: bigint;
  readonly realizedProfitHighWaterMinor: bigint;
  readonly lossCarryForwardMinor: bigint;
  readonly newDistributableProfitMinor: bigint;
  readonly reinvestmentAllocationMinor: bigint;
  readonly reserveAllocationMinor: bigint;
  readonly cumulativeReinvestmentAllocatedMinor: bigint;
  readonly cumulativeProtectedReserveMinor: bigint;
  readonly reason: "PROFIT_ALLOCATED" | "ALLOCATION_DISABLED" | "LOSS_RECORDED" | "LOSS_RECOVERY" | "NO_PROFIT";
}

export interface PaperProfitAllocationProjection {
  readonly version: typeof PAPER_PROFIT_ALLOCATION_VERSION;
  readonly policy: Readonly<PaperProfitAllocationPolicy>;
  readonly policyHash: string;
  readonly evidenceStatus: "CALLER_SUPPLIED_PAPER_SETTLEMENTS";
  readonly operationalStatus: "MODEL_ONLY";
  readonly allocations: readonly PaperProfitAllocation[];
  readonly cumulativeRealizedPnlMinor: bigint;
  readonly realizedProfitHighWaterMinor: bigint;
  readonly lossCarryForwardMinor: bigint;
  readonly totalReinvestmentAllocatedMinor: bigint;
  readonly protectedReserveMinor: bigint;
  readonly lastSequence: bigint;
  readonly asOf: string | null;
  readonly fingerprint: string;
}

const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value);
const currency = (value: unknown): value is CurrencyCode => typeof value === "string" && Object.hasOwn(CURRENCY_REGISTRY, value);
const boundedUnsigned = (value: unknown): value is bigint => typeof value === "bigint" && value >= 0n && value <= MAX_MINOR;

function hash(value: unknown): string {
  // Called only on our bounded, explicitly constructed policy/settlement/output material.
  return createHash("sha256").update(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)).digest("hex");
}

function withinRange(value: bigint): bigint {
  if (value < -MAX_MINOR || value > MAX_MINOR) throw new Error("PAPER_PROFIT_AMOUNT_OVERFLOW");
  return value;
}

function snapshotPolicy(value: PaperProfitAllocationPolicy): Readonly<PaperProfitAllocationPolicy> {
  if (!value || value.version !== PAPER_PROFIT_ALLOCATION_VERSION || value.mode !== "PAPER_ONLY" ||
    !identifier(value.policyId) || !identifier(value.financialAccountId) || !identifier(value.ownerId) || !currency(value.currency) ||
    typeof value.enabled !== "boolean" || typeof value.reinvestmentBps !== "bigint" ||
    value.reinvestmentBps < 0n || value.reinvestmentBps > BASIS_POINTS_PER_WHOLE) throw new Error("PAPER_PROFIT_POLICY_INVALID");
  return Object.freeze({ version: value.version, policyId: value.policyId, financialAccountId: value.financialAccountId,
    ownerId: value.ownerId, mode: value.mode, currency: value.currency, enabled: value.enabled, reinvestmentBps: value.reinvestmentBps });
}

function snapshotSettlement(value: PaperProfitSettlement, policy: PaperProfitAllocationPolicy): Readonly<PaperProfitSettlement> {
  if (!value || value.type !== "SIMULATED_SELL_SETTLEMENT" || !identifier(value.settlementId) || !identifier(value.fillId) ||
    !boundedUnsigned(value.sequence) || value.sequence === 0n || typeof value.settledAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.settledAt) ||
    !Number.isFinite(Date.parse(value.settledAt)) || new Date(value.settledAt).toISOString() !== value.settledAt ||
    !boundedUnsigned(value.grossProceedsMinor) || value.grossProceedsMinor === 0n ||
    !boundedUnsigned(value.sellFeeMinor) || value.sellFeeMinor >= value.grossProceedsMinor ||
    !boundedUnsigned(value.fifoCostBasisMinor)) throw new Error("PAPER_PROFIT_SETTLEMENT_INVALID");
  if (value.financialAccountId !== policy.financialAccountId || value.ownerId !== policy.ownerId || value.currency !== policy.currency) {
    throw new Error("PAPER_PROFIT_SCOPE_MISMATCH");
  }
  return Object.freeze({ type: value.type, settlementId: value.settlementId, fillId: value.fillId,
    financialAccountId: value.financialAccountId, ownerId: value.ownerId, currency: value.currency,
    sequence: value.sequence, settledAt: value.settledAt, grossProceedsMinor: value.grossProceedsMinor,
    sellFeeMinor: value.sellFeeMinor, fifoCostBasisMinor: value.fifoCostBasisMinor });
}

/**
 * Pure replay of complete, ordered settlement history under one fixed policy.
 * No deposits, valuations, ledger writes, worker controls or live execution.
 * The application must later prove ownership, history completeness and settlement
 * authenticity. This projection alone cannot protect funds or approve spending.
 */
export function projectPaperProfitAllocation(input: {
  readonly policy: PaperProfitAllocationPolicy;
  readonly settlements: readonly PaperProfitSettlement[];
}): PaperProfitAllocationProjection {
  if (!input || !Array.isArray(input.settlements)) throw new Error("PAPER_PROFIT_INPUT_INVALID");
  const policy = snapshotPolicy(input.policy);
  const policyHash = hash(policy);
  const effectiveBps = policy.enabled ? policy.reinvestmentBps : BASIS_POINTS_PER_WHOLE;
  const receipts = new Map<string, string>();
  const fills = new Set<string>();
  const allocations: PaperProfitAllocation[] = [];
  let cumulative = 0n;
  let highWater = 0n;
  let reinvested = 0n;
  let reserve = 0n;
  let sequence = 0n;
  let asOf: string | null = null;

  for (const value of input.settlements) {
    const settlement = snapshotSettlement(value, policy);
    const inputHash = hash({ policyHash, settlement });
    const previousHash = receipts.get(settlement.settlementId);
    if (previousHash !== undefined) {
      if (previousHash !== inputHash) throw new Error("PAPER_PROFIT_IDEMPOTENCY_CONFLICT");
      continue;
    }
    if (fills.has(settlement.fillId)) throw new Error("PAPER_PROFIT_FILL_ALREADY_ALLOCATED");
    if (settlement.sequence !== sequence + 1n || (asOf !== null && settlement.settledAt < asOf)) {
      throw new Error("PAPER_PROFIT_HISTORY_ORDER_INVALID");
    }
    const netRealizedPnlMinor = settlement.grossProceedsMinor - settlement.sellFeeMinor - settlement.fifoCostBasisMinor;
    cumulative = withinRange(cumulative + netRealizedPnlMinor);
    const nextHighWater = cumulative > highWater ? cumulative : highWater;
    const newProfit = nextHighWater - highWater;
    // Round the cumulative target once, not each sale independently. This makes
    // allocation fragmentation-invariant, with rounding residue in the reserve.
    const nextReinvested = floorDivision(nextHighWater * effectiveBps, BASIS_POINTS_PER_WHOLE);
    const nextReserve = nextHighWater - nextReinvested;
    const allocation = Object.freeze({
      settlement, inputHash, netRealizedPnlMinor, cumulativeRealizedPnlMinor: cumulative,
      realizedProfitHighWaterMinor: nextHighWater, lossCarryForwardMinor: withinRange(nextHighWater - cumulative),
      newDistributableProfitMinor: newProfit, reinvestmentAllocationMinor: nextReinvested - reinvested,
      reserveAllocationMinor: nextReserve - reserve, cumulativeReinvestmentAllocatedMinor: nextReinvested,
      cumulativeProtectedReserveMinor: nextReserve,
      reason: newProfit > 0n ? (policy.enabled ? "PROFIT_ALLOCATED" as const : "ALLOCATION_DISABLED" as const) :
        netRealizedPnlMinor < 0n ? "LOSS_RECORDED" as const : netRealizedPnlMinor > 0n ? "LOSS_RECOVERY" as const : "NO_PROFIT" as const,
    });
    allocations.push(allocation);
    receipts.set(settlement.settlementId, inputHash);
    fills.add(settlement.fillId);
    highWater = nextHighWater;
    reinvested = nextReinvested;
    reserve = nextReserve;
    sequence = settlement.sequence;
    asOf = settlement.settledAt;
  }
  const material = {
    version: PAPER_PROFIT_ALLOCATION_VERSION, policy, policyHash,
    evidenceStatus: "CALLER_SUPPLIED_PAPER_SETTLEMENTS" as const, operationalStatus: "MODEL_ONLY" as const,
    allocations: Object.freeze(allocations), cumulativeRealizedPnlMinor: cumulative,
    realizedProfitHighWaterMinor: highWater, lossCarryForwardMinor: withinRange(highWater - cumulative),
    totalReinvestmentAllocatedMinor: reinvested, protectedReserveMinor: reserve, lastSequence: sequence, asOf,
  };
  return Object.freeze({ ...material, fingerprint: hash(material) });
}
