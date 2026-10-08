import { createHash } from "node:crypto";
import { FEE_POLICY_VERSION, SIMULATION_EXECUTION_POLICY_VERSION, SPREAD_SLIPPAGE_POLICY_VERSION } from "@/domain/execution/simulation-execution";
import { M1_ROUNDING_POLICY_VERSION } from "@/domain/financial/rounding";
import type { FixtureAsset, FixturePriceObservation, ProposedOrder } from "@/domain/strategy/fixture-assets";

export const STANDING_PAPER_POLICY_VERSION = "standing-paper-policy/v1";
export type PaperPolicyStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "STOPPED";
export type PaperDecisionCode = "POLICY_NOT_ACTIVE" | "PRICE_MISSING" | "PRICE_STALE" | "INSTRUMENT_NOT_ALLOWED" | "ORDER_LIMIT_EXCEEDED" | "POSITION_LIMIT_EXCEEDED" | "EXPOSURE_LIMIT_EXCEEDED" | "CAPITAL_BUDGET_EXCEEDED" | "LOSS_LIMIT_EXCEEDED" | "M1_RISK_REJECTED" | "APPROVED";

export interface StandingPaperPolicy {
  readonly policyId: string;
  readonly version: typeof STANDING_PAPER_POLICY_VERSION;
  readonly identity: string;
  readonly mode: "PAPER_ONLY";
  readonly status: PaperPolicyStatus;
  readonly financialAccountId: string;
  readonly allowedInstrumentIds: readonly string[];
  readonly capitalBudgetMinor: bigint;
  readonly maxOrderMinor: bigint;
  readonly maxPositionMinor: bigint;
  readonly maxGrossExposureMinor: bigint;
  readonly maxLossMinor: bigint;
  readonly maxPriceAgeMs: number;
}

export interface PaperPolicyEvidence {
  readonly policyId: string;
  readonly policyVersion: typeof STANDING_PAPER_POLICY_VERSION;
  readonly inputHash: string;
  readonly priceRecordId: string | null;
  readonly priceAvailableAt: string | null;
  readonly referencePriceAtoms: string | null;
  readonly referencePriceScale: number | null;
  readonly datasetVersion: string | null;
  readonly strategyVersion: string;
  readonly assetRegistryVersion: string;
  readonly executionPolicyVersions: {
    readonly execution: typeof SIMULATION_EXECUTION_POLICY_VERSION;
    readonly spreadSlippage: typeof SPREAD_SLIPPAGE_POLICY_VERSION;
    readonly fee: typeof FEE_POLICY_VERSION;
    readonly rounding: typeof M1_ROUNDING_POLICY_VERSION;
    readonly fillAssumption: "SIMULATED_FULL_OR_NONE";
  };
  readonly reservedOpenOrdersMinor: string;
  readonly resultingExposureMinor: string;
  readonly currentLossMinor: string;
  readonly maxLossMinor: string;
  readonly reasonCode: PaperDecisionCode;
  readonly disposition: "APPROVE" | "REJECT";
}

export interface PaperPolicyContext {
  readonly now: Date;
  readonly assets: readonly FixtureAsset[];
  readonly prices: readonly FixturePriceObservation[];
  readonly openOrderReservationsMinor: readonly bigint[];
  readonly committedCapitalMinor: bigint;
  readonly currentCashMinor: bigint;
  readonly currentPositionMinor: bigint;
  readonly currentGrossExposureMinor: bigint;
  readonly currentLossMinor: bigint;
  readonly prospectiveOrderDebitMinor: bigint;
}

export function transitionPaperPolicy(policy: StandingPaperPolicy, action: "ACTIVATE" | "PAUSE" | "STOP"): StandingPaperPolicy {
  assertValidPaperPolicy(policy);
  if (action === "ACTIVATE" && (policy.status === "STOPPED" || policy.status === "ACTIVE")) throw new Error("PAPER_POLICY_TRANSITION_INVALID");
  if (action === "PAUSE" && policy.status !== "ACTIVE") throw new Error("PAPER_POLICY_TRANSITION_INVALID");
  if (action === "STOP" && policy.status === "STOPPED") throw new Error("PAPER_POLICY_TRANSITION_INVALID");
  return Object.freeze({ ...policy, status: action === "ACTIVATE" ? "ACTIVE" : action === "PAUSE" ? "PAUSED" : "STOPPED" });
}

export function assertValidPaperPolicy(policy: StandingPaperPolicy): void {
  if (policy.mode !== "PAPER_ONLY" || policy.version !== STANDING_PAPER_POLICY_VERSION || !policy.policyId.trim() || !policy.identity.trim() || !policy.financialAccountId.trim() ||
    policy.allowedInstrumentIds.length === 0 || new Set(policy.allowedInstrumentIds).size !== policy.allowedInstrumentIds.length ||
    policy.capitalBudgetMinor <= 0n || policy.maxOrderMinor <= 0n || policy.maxPositionMinor <= 0n || policy.maxGrossExposureMinor <= 0n || policy.maxLossMinor < 0n ||
    !Number.isSafeInteger(policy.maxPriceAgeMs) || policy.maxPriceAgeMs <= 0) throw new Error("PAPER_POLICY_INVALID");
}

export function assessStandingPaperPolicy(policy: StandingPaperPolicy, order: ProposedOrder, context: PaperPolicyContext): PaperPolicyEvidence {
  assertValidPaperPolicy(policy);
  if (!Number.isFinite(context.now.getTime()) || context.openOrderReservationsMinor.some((value) => value < 0n) || context.committedCapitalMinor < 0n || context.currentCashMinor < 0n || context.currentPositionMinor < 0n || context.currentGrossExposureMinor < 0n || context.currentLossMinor < 0n || context.prospectiveOrderDebitMinor <= 0n) throw new Error("PAPER_POLICY_CONTEXT_INVALID");
  const price = context.prices.find((item) => item.recordId === order.referencePriceRecordId && item.assetId === order.assetId);
  const reserved = context.openOrderReservationsMinor.reduce((sum, value) => sum + value, 0n);
  const exposure = context.currentGrossExposureMinor + reserved + context.prospectiveOrderDebitMinor;
  const selectedAsset = context.assets.find((asset) => asset.assetId === order.assetId);
  const digest = createHash("sha256").update(JSON.stringify({
    policyMaterial: {
      policyId: policy.policyId, version: policy.version, identity: policy.identity, mode: policy.mode,
      status: policy.status, financialAccountId: policy.financialAccountId,
      allowedInstrumentIds: [...policy.allowedInstrumentIds].sort(),
      capitalBudgetMinor: policy.capitalBudgetMinor.toString(), maxOrderMinor: policy.maxOrderMinor.toString(),
      maxPositionMinor: policy.maxPositionMinor.toString(), maxGrossExposureMinor: policy.maxGrossExposureMinor.toString(),
      maxLossMinor: policy.maxLossMinor.toString(), maxPriceAgeMs: policy.maxPriceAgeMs,
    },
    order: {
      proposalId: order.proposalId, financialAccountId: order.financialAccountId, assetId: order.assetId,
      side: order.side, orderType: order.orderType,
      quantityAtoms: order.quantity.atomicUnits.toString(), quantityScale: order.quantity.quantityScale,
      referencePriceRecordId: order.referencePriceRecordId,
      referencePriceAtoms: order.referencePrice.priceAtoms.toString(), referencePriceScale: order.referencePrice.priceScale,
      referencePriceCurrency: order.referencePrice.currencyCode,
      referenceNotionalMinor: order.referenceNotional.minorUnits.toString(), referenceNotionalCurrency: order.referenceNotional.currencyCode,
      decisionTimestamp: order.decisionTimestamp.toISOString(), strategyVersion: order.strategyVersion,
      assetRegistryVersion: order.registryVersion, datasetVersion: order.datasetVersion,
    },
    selectedAsset: selectedAsset ? { ...selectedAsset, minimumQuantityIncrementAtoms: selectedAsset.minimumQuantityIncrementAtoms.toString(), targetWeightBps: selectedAsset.targetWeightBps.toString() } : null,
    priceRecord: price ? { recordId: price.recordId, assetId: price.assetId, priceAtoms: price.price.priceAtoms.toString(), priceScale: price.price.priceScale, currencyCode: price.price.currencyCode, datasetVersion: price.datasetVersion, observedAt: price.observedAt.toISOString(), availableAt: price.availableAt.toISOString(), ingestedAt: price.ingestedAt.toISOString() } : null,
    strategyVersion: order.strategyVersion, assetRegistryVersion: order.registryVersion,
    now: context.now.toISOString(), committed: context.committedCapitalMinor.toString(),
    cash: context.currentCashMinor.toString(), position: context.currentPositionMinor.toString(), exposure: context.currentGrossExposureMinor.toString(),
    reservations: context.openOrderReservationsMinor.map(String), loss: context.currentLossMinor.toString(), debit: context.prospectiveOrderDebitMinor.toString(),
  }, (_, value) => typeof value === "bigint" ? value.toString() : value)).digest("hex");
  let reasonCode: PaperDecisionCode = "APPROVED";
  if (policy.mode !== "PAPER_ONLY" || policy.status !== "ACTIVE" || order.financialAccountId !== policy.financialAccountId) reasonCode = "POLICY_NOT_ACTIVE";
  else if (!price || price.datasetVersion !== order.datasetVersion || price.availableAt.getTime() > context.now.getTime()) reasonCode = "PRICE_MISSING";
  else if (context.now.getTime() - price.availableAt.getTime() > policy.maxPriceAgeMs) reasonCode = "PRICE_STALE";
  else if (!policy.allowedInstrumentIds.includes(order.assetId) || !context.assets.some((asset) => asset.assetId === order.assetId && asset.active && asset.classification === "SYNTHETIC_FIXTURE")) reasonCode = "INSTRUMENT_NOT_ALLOWED";
  else if (context.prospectiveOrderDebitMinor > policy.maxOrderMinor) reasonCode = "ORDER_LIMIT_EXCEEDED";
  else if (context.currentPositionMinor + context.prospectiveOrderDebitMinor > policy.maxPositionMinor) reasonCode = "POSITION_LIMIT_EXCEEDED";
  else if (exposure > policy.maxGrossExposureMinor) reasonCode = "EXPOSURE_LIMIT_EXCEEDED";
  else if (context.committedCapitalMinor + reserved + context.prospectiveOrderDebitMinor > policy.capitalBudgetMinor || context.currentCashMinor < reserved + context.prospectiveOrderDebitMinor) reasonCode = "CAPITAL_BUDGET_EXCEEDED";
  else if (context.currentLossMinor > policy.maxLossMinor) reasonCode = "LOSS_LIMIT_EXCEEDED";
  return Object.freeze({ policyId: policy.policyId, policyVersion: policy.version, inputHash: digest,
    priceRecordId: price?.recordId ?? null, priceAvailableAt: price?.availableAt.toISOString() ?? null,
    referencePriceAtoms: price?.price.priceAtoms.toString() ?? null, referencePriceScale: price?.price.priceScale ?? null,
    datasetVersion: price?.datasetVersion ?? null, strategyVersion: order.strategyVersion, assetRegistryVersion: order.registryVersion,
    executionPolicyVersions: Object.freeze({ execution: SIMULATION_EXECUTION_POLICY_VERSION, spreadSlippage: SPREAD_SLIPPAGE_POLICY_VERSION, fee: FEE_POLICY_VERSION, rounding: M1_ROUNDING_POLICY_VERSION, fillAssumption: "SIMULATED_FULL_OR_NONE" }),
    reservedOpenOrdersMinor: reserved.toString(), resultingExposureMinor: exposure.toString(),
    currentLossMinor: context.currentLossMinor.toString(), maxLossMinor: policy.maxLossMinor.toString(), reasonCode,
    disposition: reasonCode === "APPROVED" ? "APPROVE" : "REJECT" });
}
