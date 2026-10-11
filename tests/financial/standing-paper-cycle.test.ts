import { describe, expect, it } from "vitest";
import { runDeterministicBacktest, type BacktestRunConfig } from "@/application/backtest/run-deterministic-backtest";
import { StandingPaperWorker } from "@/application/paper-trading/run-standing-paper-worker";
import { executeSimulationSell } from "@/domain/execution/simulation-execution";
import { price } from "@/domain/financial/price";
import { planFifoLotConsumption, type OpenCostBasisLot } from "@/domain/portfolio/portfolio-projection";
import { evaluateStandingPaperExit, PAPER_CYCLE_CONTRACT_VERSION, STANDING_PAPER_EXIT_POLICY_VERSION } from "@/domain/risk/standing-paper-exit-policy";
import { transitionPaperPolicy, type StandingPaperPolicy } from "@/domain/risk/standing-paper-policy";
import { FIXTURE_ASSETS, FIXTURE_DATASET_VERSION, type FixturePriceObservation } from "@/domain/strategy/fixture-assets";

const t0 = new Date("2026-01-01T10:00:00.000Z");
const t1 = new Date("2026-01-01T11:00:00.000Z");
const asset = FIXTURE_ASSETS[0]!;
const exitPolicy = { version: STANDING_PAPER_EXIT_POLICY_VERSION, stopLossBps: 2_000n, takeProfitBps: 1_000n, maxHoldingMs: 5 * 24 * 60 * 60 * 1_000 } as const;
const prices: FixturePriceObservation[] = FIXTURE_ASSETS.flatMap((item, index) => [
  { recordId: `cycle-before-${index}`, assetId: item.assetId, price: price("NOK", BigInt((index + 1) * 1_000_000), 4), observedAt: t0, availableAt: t0, ingestedAt: t0, datasetVersion: FIXTURE_DATASET_VERSION },
  { recordId: `cycle-rise-${index}`, assetId: item.assetId, price: price("NOK", BigInt((index + 1) * 2_000_000), 4), observedAt: t1, availableAt: t1, ingestedAt: t1, datasetVersion: FIXTURE_DATASET_VERSION },
]);
const activePolicy = transitionPaperPolicy({
  policyId: "cycle-v2-synthetic", version: "standing-paper-policy/v1", identity: "cycle-test",
  mode: "PAPER_ONLY", status: "DRAFT", financialAccountId: "cycle-account",
  allowedInstrumentIds: FIXTURE_ASSETS.map(item => item.assetId), capitalBudgetMinor: 20_000n,
  maxOrderMinor: 20_000n, maxPositionMinor: 20_000n, maxGrossExposureMinor: 20_000n,
  maxLossMinor: 20_000n, maxPriceAgeMs: 7 * 24 * 60 * 60 * 1_000,
} satisfies StandingPaperPolicy, "ACTIVATE");
const cycleConfig: Omit<BacktestRunConfig, "standingPaperPolicy"> = {
  startAt: t0.toISOString(), endAt: t1.toISOString(), baseCurrency: "NOK", financialAccountId: activePolicy.financialAccountId,
  contributionEvents: [{ eventId: "one-virtual-deposit", availableAt: t0.toISOString(), amountMinor: "20000", currency: "NOK" }],
  strategyEvaluationTimestamps: [t1.toISOString()], valuationTimestamps: [t0.toISOString(), t1.toISOString()],
  strategyVersion: "contribution-rebalancing/v1", riskPolicyVersion: "m1-risk-policy/v1", executionPolicyVersion: "m1-market-execution/v1",
  portfolioValuationVersion: "portfolio-valuation/v1", fifoCostBasisVersion: "fifo-cost-basis/v2", paperCycleContractVersion: PAPER_CYCLE_CONTRACT_VERSION,
  standingPaperExitPolicy: exitPolicy, assetRegistryVersion: "fixture-asset-registry/v1", marketDatasetVersion: FIXTURE_DATASET_VERSION,
};

describe("standing paper cycle v2", () => {
  it("performs one virtual deposit, synthetic buy, take-profit sale, and a later buy from sale proceeds", () => {
    const result = runDeterministicBacktest({ ...cycleConfig, standingPaperPolicy: activePolicy }, prices);
    expect(result.persistentState.netContributionsMinor).toBe(20_000n);
    expect(result.executions.some(fill => !("side" in fill))).toBe(true);
    expect(result.executions.some(fill => "side" in fill && fill.side === "SELL")).toBe(true);
    expect(result.paperCycleDecisions?.some(item => item.action === "SELL" && item.reasonCode === "SELL_TAKE_PROFIT")).toBe(true);
    expect(result.paperCycleDecisions?.some(item => item.action === "BUY" && item.reasonCode === "BUY_FILLED" && item.evidence.priceRecordId === "cycle-rise-0")).toBe(true);
    expect(result.persistentState.disposals?.length).toBeGreaterThan(0);
    expect(result.persistentState.realizedPnlMinor).toBeDefined();
    expect(result.persistentState.cumulativeTurnoverMinor).toBeGreaterThan(0n);
    expect(result.persistentState.cumulativeTurnoverMinor).toBeGreaterThan(result.persistentState.netContributionsMinor);
    expect(result.persistentState.netContributionsMinor).toBeLessThanOrEqual(activePolicy.capitalBudgetMinor);
    expect(result.endingState.integrityStatus).toBe("CONSISTENT");
    expect(result.endingState.holdings.every(item => BigInt(item.quantityAtoms) >= 0n)).toBe(true);
    expect(result.persistentState.netContributionsMinor).toBe(20_000n);
  });

  it.each([
    ["STOP_LOSS_TRIGGERED", 5_000n, 10_000n, t1],
    ["TAKE_PROFIT_TRIGGERED", 20_000n, 10_000n, t1],
    ["MAX_HOLD_TIME_TRIGGERED", 10_000n, 10_000n, new Date(t0.getTime() + exitPolicy.maxHoldingMs)],
  ] as const)("evaluates %s independently", (reasonCode, markedValueMinor, cost, now) => {
    const result = evaluateStandingPaperExit({ policy: exitPolicy, policyId: activePolicy.policyId, policyVersion: activePolicy.version, strategyVersion: "contribution-rebalancing/v1", assetId: asset.assetId, now, priceRecordId: "synthetic-mark", priceAtoms: 1_000_000n, priceScale: 4, availableAt: now, oldestLotAt: t0, quantityAtoms: 10_000n, quantityScale: 4, openCostBasisMinor: cost, markedValueMinor });
    expect(result).toMatchObject({ action: "SELL", reasonCode });
    expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses FIFO partial cost basis and rejects an oversell", () => {
    const lot: OpenCostBasisLot = { lotId: "lot-1", fillId: "lot-1", executionId: "exec-1", ledgerTransactionId: "buy-1", acquiredAt: t0.toISOString(), quantityAtoms: "1000000", remainingQuantityAtoms: "1000000", executedNotionalMinor: "9000", allocatedBuyFeeMinor: "100", openCostBasisMinor: "9100", fifoVersion: "fifo-cost-basis/v2" };
    expect(planFifoLotConsumption([lot], 500_000n)).toEqual([{ fillId: "lot-1", quantityAtoms: 500_000n, costBasisMinor: 4_550n }]);
    const reference: FixturePriceObservation = { recordId: "sell-ref", assetId: asset.assetId, price: price("NOK", 1_000_000n, 4), observedAt: t1, availableAt: t1, ingestedAt: t1, datasetVersion: FIXTURE_DATASET_VERSION };
    const order = { proposalId: "sell-order", financialAccountId: activePolicy.financialAccountId, assetId: asset.assetId, side: "SELL" as const, orderType: "MARKET" as const, quantity: { assetId: asset.assetId, atomicUnits: 1_000_000n, quantityScale: 4 }, decisionTimestamp: t1 };
    const fill = executeSimulationSell({ financialAccountId: order.financialAccountId, accountActive: true, simulationMode: true, decisionApproved: true, riskApproved: true, order, asset, referencePrice: reference, availableQuantity: order.quantity, executionTimestamp: t1, alreadySettled: false });
    expect(fill.netCashCredit.minorUnits).toBe(fill.grossNotional.minorUnits - fill.fee.minorUnits);
    expect(fill.fee.minorUnits).toBeGreaterThan(0n);
    expect(fill.executionPrice.priceAtoms).toBeLessThan(reference.price.priceAtoms);
    expect(() => executeSimulationSell({ financialAccountId: order.financialAccountId, accountActive: true, simulationMode: true, decisionApproved: true, riskApproved: true, order: { ...order, quantity: { ...order.quantity, atomicUnits: 1_000_001n } }, asset, referencePrice: reference, availableQuantity: order.quantity, executionTimestamp: t1, alreadySettled: false })).toThrow("INSUFFICIENT_POSITION");
  });

  it("fails closed on missing or stale cycle prices and requires a one-time seed for workers", () => {
    const missing = prices.filter(item => item.recordId !== "cycle-before-0");
    expect(() => runDeterministicBacktest({ ...cycleConfig, standingPaperPolicy: activePolicy }, missing)).toThrow("PAPER_CYCLE_PRICE_MISSING");
    const stale = prices.map(item => ({ ...item, availableAt: new Date(t0.getTime() - 8 * 24 * 60 * 60 * 1_000), observedAt: new Date(t0.getTime() - 8 * 24 * 60 * 60 * 1_000) }));
    expect(() => runDeterministicBacktest({ ...cycleConfig, standingPaperPolicy: { ...activePolicy, maxPriceAgeMs: 1 } }, stale)).toThrow("PAPER_CYCLE_PRICE_STALE");
    expect(() => new StandingPaperWorker(null as never, { policyId: activePolicy.policyId, workerId: "cycle-requires-seed", maxRounds: 1, exitPolicy })).toThrow("PAPER_CYCLE_INITIAL_CAPITAL_REQUIRED");
  });
});
