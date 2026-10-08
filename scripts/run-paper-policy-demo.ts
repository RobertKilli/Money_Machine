import { createHash } from "node:crypto";
import { StandingPaperPolicyRunner } from "../src/application/paper-trading/run-standing-paper-policy";
import { FIXTURE_ASSETS, FIXTURE_DATASET_VERSION, type FixturePriceObservation } from "../src/domain/strategy/fixture-assets";
import { transitionPaperPolicy, type StandingPaperPolicy } from "../src/domain/risk/standing-paper-policy";
import type { BacktestRunConfig } from "../src/application/backtest/run-deterministic-backtest";

const accountId = "paper-demo-synthetic-account";
const policy: StandingPaperPolicy = transitionPaperPolicy({
  policyId: "paper-policy-local-demo-v1", version: "standing-paper-policy/v1", identity: "synthetic-review-demo",
  mode: "PAPER_ONLY", status: "DRAFT", financialAccountId: accountId,
  allowedInstrumentIds: FIXTURE_ASSETS.map((asset) => asset.assetId), capitalBudgetMinor: 500_000n,
  maxOrderMinor: 100_000n, maxPositionMinor: 350_000n, maxGrossExposureMinor: 800_000n,
  maxLossMinor: 25_000n, maxPriceAgeMs: 7 * 24 * 60 * 60 * 1_000,
}, "ACTIVATE");
const prices: readonly FixturePriceObservation[] = FIXTURE_ASSETS.map((asset, index) => ({
  recordId: `synthetic-price-${index + 1}`, assetId: asset.assetId,
  price: { currencyCode: "NOK", priceAtoms: BigInt((index + 1) * 10_000), priceScale: 4 },
  observedAt: new Date("2026-01-01T09:00:00.000Z"), availableAt: new Date("2026-01-01T09:00:00.000Z"),
  ingestedAt: new Date("2026-01-01T09:00:01.000Z"), datasetVersion: FIXTURE_DATASET_VERSION,
}));
const config: Omit<BacktestRunConfig, "standingPaperPolicy"> = {
  startAt: "2026-01-01T10:00:00.000Z", endAt: "2026-01-01T13:00:00.000Z", baseCurrency: "NOK", financialAccountId: accountId,
  contributionEvents: [10, 11, 12].map((hour) => ({ eventId: `synthetic-round-${hour}`, availableAt: `2026-01-01T${hour}:00:00.000Z`, amountMinor: "100000", currency: "NOK" })),
  valuationTimestamps: [], strategyVersion: "contribution-rebalancing/v1", riskPolicyVersion: "m1-risk-policy/v1",
  executionPolicyVersion: "m1-market-execution/v1", portfolioValuationVersion: "portfolio-valuation/v1",
  fifoCostBasisVersion: "fifo-cost-basis/v1", assetRegistryVersion: "fixture-asset-registry/v1", marketDatasetVersion: FIXTURE_DATASET_VERSION,
};
const key = createHash("sha256").update(JSON.stringify(config)).digest("hex");
const result = await new StandingPaperPolicyRunner().run(policy, config, prices, key);
const output = {
  classification: "LOCAL SYNTHETIC PAPER SIMULATION ONLY",
  note: "A policy-authorized simulated fill is not an exchange execution, investment forecast, or live mandate.",
  policy: { id: policy.policyId, version: policy.version, mode: policy.mode, status: policy.status, identity: policy.identity },
  rounds: result.decisions.length,
  decisions: result.paperPolicyDecisions.map(({ decisionId, orderId, outcome, riskCodes, evidence }) => ({ decisionId, orderId, outcome, riskCodes, ...evidence })),
  simulatedFills: result.executions.map((fill) => ({ type: "SIMULATED_PAPER_FILL", orderId: fill.proposalId, assetId: fill.quantity.assetId, quantityAtoms: fill.quantity.atomicUnits.toString(), referencePriceAtoms: fill.referencePrice.priceAtoms.toString(), simulatedExecutionPriceAtoms: fill.executionPrice.priceAtoms.toString(), feeMinor: fill.fee.minorUnits.toString(), policyVersions: { execution: fill.executionPolicyVersion, spreadSlippage: fill.spreadSlippagePolicyVersion, fee: fill.feePolicyVersion, rounding: fill.roundingPolicyVersion } })),
  endingPortfolio: result.endingState,
};
process.stdout.write(`${JSON.stringify(output, (_, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`);
