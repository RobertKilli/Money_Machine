import { describe, expect, it } from "vitest";
import { consumeFifoLots } from "@/domain/portfolio/portfolio-projection";
import {
  PAPER_PROFIT_ALLOCATION_VERSION, projectPaperProfitAllocation,
  type PaperProfitAllocationPolicy, type PaperProfitSettlement,
} from "@/domain/financial/paper-profit-allocation";

const policy: PaperProfitAllocationPolicy = {
  version: PAPER_PROFIT_ALLOCATION_VERSION, policyId: "profit-policy-1", financialAccountId: "paper-account-1",
  ownerId: "owner-1", mode: "PAPER_ONLY", currency: "NOK", enabled: true, reinvestmentBps: 5_000n,
};
const settlement = (sequence: bigint, netProfit: bigint, overrides: Partial<PaperProfitSettlement> = {}): PaperProfitSettlement => ({
  type: "SIMULATED_SELL_SETTLEMENT", settlementId: `sale-${sequence}`, fillId: `fill-${sequence}`,
  financialAccountId: policy.financialAccountId, ownerId: policy.ownerId, currency: policy.currency, sequence,
  settledAt: "2026-11-27T12:00:00.000Z", grossProceedsMinor: 100_100n + (netProfit > 0n ? netProfit : 0n),
  sellFeeMinor: 100n, fifoCostBasisMinor: 100_000n + (netProfit < 0n ? -netProfit : 0n), ...overrides,
});
const project = (settlements: readonly PaperProfitSettlement[], override: Partial<PaperProfitAllocationPolicy> = {}) =>
  projectPaperProfitAllocation({ policy: { ...policy, ...override }, settlements });
const sum = (values: readonly bigint[]) => values.reduce((total, value) => total + value, 0n);

describe("PAPER profit allocation model", () => {
  it("starts empty without inventing capital, profit or reserve", () => {
    expect(project([])).toMatchObject({ operationalStatus: "MODEL_ONLY", evidenceStatus: "CALLER_SUPPLIED_PAPER_SETTLEMENTS",
      cumulativeRealizedPnlMinor: 0n, realizedProfitHighWaterMinor: 0n, lossCarryForwardMinor: 0n,
      totalReinvestmentAllocatedMinor: 0n, protectedReserveMinor: 0n, allocations: [], lastSequence: 0n, asOf: null });
  });

  it("splits only 50 NOK net profit from 550 NOK proceeds and 500 NOK fee-inclusive cost", () => {
    const result = project([settlement(1n, 0n, { grossProceedsMinor: 55_100n, sellFeeMinor: 100n, fifoCostBasisMinor: 50_000n })]);
    expect(result).toMatchObject({ cumulativeRealizedPnlMinor: 5_000n, realizedProfitHighWaterMinor: 5_000n,
      totalReinvestmentAllocatedMinor: 2_500n, protectedReserveMinor: 2_500n });
    expect(result.allocations[0]).toMatchObject({ netRealizedPnlMinor: 5_000n, newDistributableProfitMinor: 5_000n,
      reinvestmentAllocationMinor: 2_500n, reserveAllocationMinor: 2_500n, reason: "PROFIT_ALLOCATED" });
  });

  it("recovers early losses before the first allocation", () => {
    const result = project([settlement(1n, -2_000n), settlement(2n, 1_000n), settlement(3n, 1_500n)]);
    expect(result.allocations.map(item => item.newDistributableProfitMinor)).toEqual([0n, 0n, 500n]);
    expect(result.allocations.map(item => item.reason)).toEqual(["LOSS_RECORDED", "LOSS_RECOVERY", "PROFIT_ALLOCATED"]);
    expect(result).toMatchObject({ cumulativeRealizedPnlMinor: 500n, protectedReserveMinor: 250n, lossCarryForwardMinor: 0n });
  });

  it("retains the previous high-water mark and reserve through losses and recovery", () => {
    const result = project([settlement(1n, 10_000n), settlement(2n, -5_000n), settlement(3n, 5_000n), settlement(4n, 1_000n)]);
    expect(result.allocations.map(item => item.newDistributableProfitMinor)).toEqual([10_000n, 0n, 0n, 1_000n]);
    expect(result.allocations.map(item => item.cumulativeProtectedReserveMinor)).toEqual([5_000n, 5_000n, 5_000n, 5_500n]);
    expect(result.allocations.map(item => item.lossCarryForwardMinor)).toEqual([0n, 5_000n, 0n, 0n]);
    expect(result).toMatchObject({ realizedProfitHighWaterMinor: 11_000n, totalReinvestmentAllocatedMinor: 5_500n, protectedReserveMinor: 5_500n });
  });

  it.each([0n, 1n, 3_333n, 5_000n, 9_999n, 10_000n])("conserves profits and is fragmentation-invariant at %s bps", reinvestmentBps => {
    const events = Array.from({ length: 57 }, (_value, index) => settlement(BigInt(index + 1), 1n));
    const split = project(events, { reinvestmentBps });
    const combined = project([settlement(1n, 57n)], { reinvestmentBps });
    expect(split.totalReinvestmentAllocatedMinor).toBe(combined.totalReinvestmentAllocatedMinor);
    expect(split.protectedReserveMinor).toBe(combined.protectedReserveMinor);
    expect(split.totalReinvestmentAllocatedMinor + split.protectedReserveMinor).toBe(57n);
    expect(sum(split.allocations.map(item => item.reinvestmentAllocationMinor))).toBe(split.totalReinvestmentAllocatedMinor);
    expect(sum(split.allocations.map(item => item.reserveAllocationMinor))).toBe(split.protectedReserveMinor);
    for (const item of split.allocations) {
      expect(item.reinvestmentAllocationMinor >= 0n).toBe(true);
      expect(item.reserveAllocationMinor >= 0n).toBe(true);
      expect(item.reinvestmentAllocationMinor + item.reserveAllocationMinor).toBe(item.newDistributableProfitMinor);
    }
  });

  it("assigns rounding residue to reserve and releases no already reserved amount on the next sale", () => {
    const result = project([settlement(1n, 1n), settlement(2n, 1n)]);
    expect(result.allocations.map(item => [item.reinvestmentAllocationMinor, item.reserveAllocationMinor])).toEqual([[0n, 1n], [1n, 0n]]);
    expect(result.protectedReserveMinor).toBe(1n);
  });

  it("disabled allocation retains all new profit for trading while still tracking losses", () => {
    const result = project([settlement(1n, 100n), settlement(2n, -50n), settlement(3n, 75n)], { enabled: false });
    expect(result).toMatchObject({ totalReinvestmentAllocatedMinor: 125n, protectedReserveMinor: 0n, realizedProfitHighWaterMinor: 125n });
    expect(result.allocations[0].reason).toBe("ALLOCATION_DISABLED");
    expect(result.allocations[1].reason).toBe("LOSS_RECORDED");
    expect(result.allocations[2].newDistributableProfitMinor).toBe(25n);
  });

  it("does not allocate a break-even sale or manufacture a platform fee", () => {
    const result = project([settlement(1n, 0n)]);
    expect(result.allocations[0]).toMatchObject({ netRealizedPnlMinor: 0n, newDistributableProfitMinor: 0n, reason: "NO_PROFIT" });
    expect(result).not.toHaveProperty("platformFeeMinor");
    expect(result).not.toHaveProperty("availableTradingCashMinor");
  });

  it("counts BUY and SELL fees once using the existing FIFO consumption result", () => {
    // Internal FIFO input uses bigint; 10,100 includes 10,000 BUY notional + 100 BUY fee.
    const lot = { fillId: "buy-1", remainingQuantityAtoms: 2n, openCostBasisMinor: 10_100n };
    const firstBasis = sum(consumeFifoLots([lot], 1n).map(item => item.costBasisMinor));
    const secondBasis = sum(consumeFifoLots([lot], 1n).map(item => item.costBasisMinor));
    expect(firstBasis + secondBasis).toBe(10_100n);
    const result = project([settlement(1n, 0n, { grossProceedsMinor: 6_000n, sellFeeMinor: 100n, fifoCostBasisMinor: firstBasis }),
      settlement(2n, 0n, { grossProceedsMinor: 6_000n, sellFeeMinor: 100n, fifoCostBasisMinor: secondBasis })]);
    expect(result.cumulativeRealizedPnlMinor).toBe(1_700n); // 12,000 - 200 SELL fees - 10,100 fee-inclusive BUY basis.
    expect(result.protectedReserveMinor).toBe(850n);
    expect(lot.remainingQuantityAtoms).toBe(0n);
    expect(lot.openCostBasisMinor).toBe(0n);
  });

  it("deduplicates exact settlement replay, including old events after later events", () => {
    const first = settlement(1n, 500n);
    const second = settlement(2n, 1_000n);
    expect(project([first, first, second, first, second])).toEqual(project([first, second]));
    expect(project([first, second])).toEqual(project([structuredClone(first), structuredClone(second)]));
  });

  it("rejects an idempotency collision and a second settlement referring to the same fill", () => {
    const first = settlement(1n, 500n);
    expect(() => project([first, { ...first, grossProceedsMinor: first.grossProceedsMinor + 1n }]))
      .toThrow("PAPER_PROFIT_IDEMPOTENCY_CONFLICT");
    expect(() => project([first, settlement(2n, 100n, { fillId: first.fillId })])).toThrow("PAPER_PROFIT_FILL_ALREADY_ALLOCATED");
  });

  it.each([{ financialAccountId: "other-account" }, { ownerId: "other-owner" }, { currency: "USD" }])("rejects mixed account, owner or currency (case %#)", override => {
    expect(() => project([settlement(1n, 500n, override as Partial<PaperProfitSettlement>)])).toThrow("PAPER_PROFIT_SCOPE_MISMATCH");
  });

  it("keeps another owner's matching projection separate and binds all policy terms to hashes", () => {
    const original = project([settlement(1n, 500n)]);
    for (const override of [{ policyId: "policy-2" }, { enabled: false }, { reinvestmentBps: 7_000n }]) {
      const other = project([settlement(1n, 500n)], override);
      expect(other.policyHash).not.toBe(original.policyHash);
      expect(other.fingerprint).not.toBe(original.fingerprint);
      expect(other.allocations[0].inputHash).not.toBe(original.allocations[0].inputHash);
    }
    const other = project([settlement(1n, 500n, { financialAccountId: "account-2", ownerId: "owner-2", currency: "USD" })],
      { financialAccountId: "account-2", ownerId: "owner-2", currency: "USD" });
    expect(other.policyHash).not.toBe(original.policyHash);
    expect(other.protectedReserveMinor).toBe(250n);
  });

  it.each([
    [settlement(2n, 1n)],
    [settlement(1n, 1n), settlement(3n, 1n)],
    [settlement(1n, 1n), settlement(2n, 1n, { settledAt: "2026-11-26T12:00:00.000Z" })],
  ])("rejects missing or reversed history (case %#)", (...events) => {
    expect(() => project(events as PaperProfitSettlement[])).toThrow("PAPER_PROFIT_HISTORY_ORDER_INVALID");
  });

  it.each([
    { reinvestmentBps: -1n }, { reinvestmentBps: 10_001n }, { reinvestmentBps: 5_000 },
    { enabled: "true" }, { mode: "LIVE" }, { version: "unknown" }, { currency: "__proto__" }, { ownerId: "" },
  ])("rejects invalid or non-PAPER policy (case %#)", override => {
    expect(() => project([], override as Partial<PaperProfitAllocationPolicy>)).toThrow("PAPER_PROFIT_POLICY_INVALID");
  });

  it.each([
    { type: "VIRTUAL_DEPOSIT" }, { type: "VALUATION" }, { type: "SIMULATED_BUY_SETTLEMENT" },
    { grossProceedsMinor: 0n }, { grossProceedsMinor: 100.5 }, { sellFeeMinor: -1n },
    { grossProceedsMinor: 100n, sellFeeMinor: 100n }, { fifoCostBasisMinor: -1n },
    { fifoCostBasisMinor: "100" }, { sequence: 0n }, { sequence: 1 },
    { settledAt: "2026-02-30T12:00:00.000Z" }, { settledAt: "2026-11-27T12:00:00Z" }, { fillId: "" },
  ])("rejects non-sale events, invalid precision and malformed evidence (case %#)", override => {
    expect(() => project([settlement(1n, 100n, override as Partial<PaperProfitSettlement>)])).toThrow("PAPER_PROFIT_SETTLEMENT_INVALID");
  });

  it("uses exact integer arithmetic beyond Number.MAX_SAFE_INTEGER and fails on numeric(38,0) overflow", () => {
    const profit = 9_007_199_254_740_993n;
    const exact = project([settlement(1n, profit)]);
    expect(exact.totalReinvestmentAllocatedMinor).toBe(4_503_599_627_370_496n);
    expect(exact.protectedReserveMinor).toBe(4_503_599_627_370_497n);
    const max = 10n ** 38n - 1n;
    const first = settlement(1n, 0n, { grossProceedsMinor: max, sellFeeMinor: 0n, fifoCostBasisMinor: 0n });
    expect(project([first]).realizedProfitHighWaterMinor).toBe(max);
    expect(() => project([first, settlement(2n, 1n)])).toThrow("PAPER_PROFIT_AMOUNT_OVERFLOW");
    expect(() => project([settlement(1n, 0n, { grossProceedsMinor: max + 1n })])).toThrow("PAPER_PROFIT_SETTLEMENT_INVALID");
  });

  it("returns frozen, independent policy/settlement/trace material without mutating caller input", () => {
    const mutablePolicy = { ...policy };
    const event = { ...settlement(1n, 5_000n) };
    const input = { policy: mutablePolicy, settlements: [event] };
    const before = structuredClone(input);
    const result = projectPaperProfitAllocation(input);
    expect(input).toEqual(before);
    mutablePolicy.reinvestmentBps = 0n;
    event.grossProceedsMinor = 1n;
    input.settlements.length = 0;
    expect(result.totalReinvestmentAllocatedMinor).toBe(2_500n);
    for (const item of [result, result.policy, result.allocations, result.allocations[0], result.allocations[0].settlement]) {
      expect(Object.isFrozen(item)).toBe(true);
    }
  });
});
