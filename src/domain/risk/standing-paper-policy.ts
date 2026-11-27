import { createHash } from "node:crypto";
import { FEE_POLICY_VERSION, SIMULATION_EXECUTION_POLICY_VERSION, SPREAD_SLIPPAGE_POLICY_VERSION } from "@/domain/execution/simulation-execution";
import { M1_ROUNDING_POLICY_VERSION } from "@/domain/financial/rounding";
import type { FixtureAsset, FixturePriceObservation, ProposedOrder } from "@/domain/strategy/fixture-assets";
import { assertValidStandingPaperCycleConfiguration, type StandingPaperCycleConfiguration } from "@/domain/risk/standing-paper-exit-policy";
import { PAPER_PROFIT_ALLOCATION_VERSION, projectPaperProfitAllocation, type PaperProfitAllocationPolicy } from "@/domain/financial/paper-profit-allocation";

export interface PaperProfitRecordingConfiguration {
  readonly version: typeof PAPER_PROFIT_ALLOCATION_VERSION;
  readonly recordingMode: "RECORD_ONLY";
  readonly enabled: boolean;
  readonly reinvestmentBps: bigint;
}

export interface PaperReserveProtectionConfiguration {
  readonly version: "paper-reserve-protection/v1";
  readonly mode: "PAPER_ONLY";
  readonly enabled: true;
}

export const STANDING_PAPER_POLICY_VERSION = "standing-paper-policy/v1";
export type PaperPolicyStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "STOPPED";
export type PaperDecisionCode = "POLICY_NOT_ACTIVE" | "PRICE_MISSING" | "PRICE_STALE" | "INSTRUMENT_NOT_ALLOWED" | "ORDER_LIMIT_EXCEEDED" | "POSITION_LIMIT_EXCEEDED" | "EXPOSURE_LIMIT_EXCEEDED" | "CAPITAL_BUDGET_EXCEEDED" | "LOSS_LIMIT_EXCEEDED" | "RESERVE_PROTECTION_BLOCKED" | "M1_RISK_REJECTED" | "APPROVED";

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
  readonly cycleConfiguration?: StandingPaperCycleConfiguration;
  /** Records entitlements only; it does not constrain worker spending yet. */
  readonly profitAllocationConfiguration?: PaperProfitRecordingConfiguration;
  readonly reserveProtectionConfiguration?: PaperReserveProtectionConfiguration;
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
  readonly reserveProtection?: {
    readonly version: PaperReserveProtectionConfiguration["version"];
    readonly ledgerCashMinor: string;
    readonly protectedReserveMinor: string | null;
    readonly openOrderReservationsMinor: string;
    readonly buyingPowerMinor: string;
    readonly orderDebitMinor: string;
  };
  readonly resultingExposureMinor: string;
  readonly currentLossMinor: string;
  readonly projectedLossMinor?: string;
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
  /** Optional v2 semantics: virtual contribution budget use, independent of cumulative trade turnover. */
  readonly capitalBudgetUsageMinor?: bigint;
  readonly capitalBudgetProspectiveDebitMinor?: bigint;
  readonly currentCashMinor: bigint;
  readonly protectedReserveMinor?: bigint;
  readonly currentPositionMinor: bigint;
  readonly currentGrossExposureMinor: bigint;
  readonly currentLossMinor: bigint;
  readonly projectedLossMinor?: bigint;
  readonly prospectiveOrderDebitMinor: bigint;
}

export type StandingPaperPolicyTransitionAction = "ACTIVATE" | "PAUSE" | "STOP";

export function assertStandingPaperPolicyTransitionAction(value: unknown): asserts value is StandingPaperPolicyTransitionAction {
  if (value !== "ACTIVATE" && value !== "PAUSE" && value !== "STOP") throw new Error("PAPER_POLICY_ACTION_INVALID");
}

export function transitionPaperPolicy(policy: StandingPaperPolicy, action: StandingPaperPolicyTransitionAction): StandingPaperPolicy {
  assertStandingPaperPolicyTransitionAction(action);
  assertValidPaperPolicy(policy);
  if (action === "ACTIVATE" && (policy.status === "STOPPED" || policy.status === "ACTIVE")) throw new Error("PAPER_POLICY_TRANSITION_INVALID");
  if (action === "PAUSE" && policy.status !== "ACTIVE") throw new Error("PAPER_POLICY_TRANSITION_INVALID");
  if (action === "STOP" && policy.status === "STOPPED") throw new Error("PAPER_POLICY_TRANSITION_INVALID");
  let status: StandingPaperPolicy["status"];
  switch (action) {
    case "ACTIVATE": status = "ACTIVE"; break;
    case "PAUSE": status = "PAUSED"; break;
    case "STOP": status = "STOPPED"; break;
    default: throw new Error("PAPER_POLICY_ACTION_INVALID");
  }
  return Object.freeze({ ...policy, status });
}

export function assertValidPaperPolicy(policy: StandingPaperPolicy): void {
  if (policy.mode !== "PAPER_ONLY" || policy.version !== STANDING_PAPER_POLICY_VERSION || !policy.policyId.trim() || !policy.identity.trim() || !policy.financialAccountId.trim() ||
    policy.allowedInstrumentIds.length === 0 || new Set(policy.allowedInstrumentIds).size !== policy.allowedInstrumentIds.length ||
    policy.capitalBudgetMinor <= 0n || policy.maxOrderMinor <= 0n || policy.maxPositionMinor <= 0n || policy.maxGrossExposureMinor <= 0n || policy.maxLossMinor < 0n ||
    !Number.isSafeInteger(policy.maxPriceAgeMs) || policy.maxPriceAgeMs <= 0) throw new Error("PAPER_POLICY_INVALID");
  if (policy.cycleConfiguration !== undefined) assertValidStandingPaperCycleConfiguration(policy.cycleConfiguration);
  if (policy.profitAllocationConfiguration !== undefined) {
    const terms = policy.profitAllocationConfiguration;
    if (!terms || !policy.cycleConfiguration || Object.keys(terms).length !== 4 ||
      terms.version !== PAPER_PROFIT_ALLOCATION_VERSION || terms.recordingMode !== "RECORD_ONLY" || typeof terms.enabled !== "boolean" ||
      typeof terms.reinvestmentBps !== "bigint" || terms.reinvestmentBps < 0n || terms.reinvestmentBps > 10_000n) {
      throw new Error("PAPER_PROFIT_CONFIGURATION_INVALID");
    }
  }
  if (policy.reserveProtectionConfiguration !== undefined && (!policy.profitAllocationConfiguration?.enabled ||
    !policy.reserveProtectionConfiguration || policy.reserveProtectionConfiguration.version !== "paper-reserve-protection/v1" || policy.reserveProtectionConfiguration.mode !== "PAPER_ONLY" ||
    policy.reserveProtectionConfiguration.enabled !== true || Object.keys(policy.reserveProtectionConfiguration).length !== 3)) {
    throw new Error("PAPER_RESERVE_PROTECTION_CONFIGURATION_INVALID");
  }
}

const reserveConfirmationMaterial = ({ version, mode, enabled }: PaperReserveProtectionConfiguration) => ({ version, mode, enabled });

/** Hashes the exact DRAFT terms the owner sees before first activation. */
export function standingPaperActivationConfirmationHash(policy: StandingPaperPolicy): string {
  assertValidPaperPolicy(policy);
  return createHash("sha256").update(JSON.stringify({
    policyId: policy.policyId,
    version: policy.version,
    identity: policy.identity,
    mode: policy.mode,
    status: policy.status,
    financialAccountId: policy.financialAccountId,
    allowedInstrumentIds: [...policy.allowedInstrumentIds].sort(),
    capitalBudgetMinor: policy.capitalBudgetMinor.toString(),
    maxOrderMinor: policy.maxOrderMinor.toString(),
    maxPositionMinor: policy.maxPositionMinor.toString(),
    maxGrossExposureMinor: policy.maxGrossExposureMinor.toString(),
    maxLossMinor: policy.maxLossMinor.toString(),
    maxPriceAgeMs: policy.maxPriceAgeMs,
    cycleConfiguration: policy.cycleConfiguration ? {
      contractVersion: policy.cycleConfiguration.contractVersion,
      fifoCostBasisVersion: policy.cycleConfiguration.fifoCostBasisVersion,
      exitPolicy: {
        version: policy.cycleConfiguration.exitPolicy.version,
        stopLossBps: policy.cycleConfiguration.exitPolicy.stopLossBps.toString(),
        takeProfitBps: policy.cycleConfiguration.exitPolicy.takeProfitBps.toString(),
        maxHoldingMs: policy.cycleConfiguration.exitPolicy.maxHoldingMs,
      },
    } : null,
    ...(policy.profitAllocationConfiguration ? { profitAllocationConfiguration: {
      version: policy.profitAllocationConfiguration.version,
      recordingMode: policy.profitAllocationConfiguration.recordingMode,
      enabled: policy.profitAllocationConfiguration.enabled,
      reinvestmentBps: policy.profitAllocationConfiguration.reinvestmentBps.toString(),
    } } : {}),
    ...(policy.reserveProtectionConfiguration ? { reserveProtectionConfiguration: reserveConfirmationMaterial(policy.reserveProtectionConfiguration) } : {}),
  })).digest("hex");
}

export function paperProfitAllocationPolicy(policy: StandingPaperPolicy, ownerId: string): PaperProfitAllocationPolicy {
  assertValidPaperPolicy(policy);
  if (!policy.profitAllocationConfiguration) throw new Error("PAPER_PROFIT_CONFIGURATION_MISSING");
  return Object.freeze({ version: policy.profitAllocationConfiguration.version, policyId: policy.policyId,
    financialAccountId: policy.financialAccountId, ownerId, currency: "NOK", mode: "PAPER_ONLY",
    enabled: policy.profitAllocationConfiguration.enabled, reinvestmentBps: policy.profitAllocationConfiguration.reinvestmentBps });
}

/** Separate consent to RECORD_ONLY terms; generic dashboard activation cannot supply it. */
export function paperProfitAllocationConfirmationHash(policy: StandingPaperPolicy, ownerId: string): string {
  const model = projectPaperProfitAllocation({ policy: paperProfitAllocationPolicy(policy, ownerId), settlements: [] });
  return createHash("sha256").update(JSON.stringify({ recordingMode: "RECORD_ONLY", policyHash: model.policyHash,
    ...(policy.reserveProtectionConfiguration ? { reserveProtection: reserveConfirmationMaterial(policy.reserveProtectionConfiguration) } : {}) })).digest("hex");
}

export function assessStandingPaperPolicy(policy: StandingPaperPolicy, order: ProposedOrder, context: PaperPolicyContext): PaperPolicyEvidence {
  assertValidPaperPolicy(policy);
  if (!Number.isFinite(context.now.getTime()) || context.openOrderReservationsMinor.some((value) => value < 0n) || context.committedCapitalMinor < 0n ||
    (context.capitalBudgetUsageMinor !== undefined && context.capitalBudgetUsageMinor < 0n) || (context.capitalBudgetProspectiveDebitMinor !== undefined && context.capitalBudgetProspectiveDebitMinor < 0n) ||
    context.currentCashMinor < 0n || context.currentPositionMinor < 0n || context.currentGrossExposureMinor < 0n || context.currentLossMinor < 0n ||
    (context.projectedLossMinor !== undefined && context.projectedLossMinor < 0n) || context.prospectiveOrderDebitMinor <= 0n) throw new Error("PAPER_POLICY_CONTEXT_INVALID");
  const price = context.prices.find((item) => item.recordId === order.referencePriceRecordId && item.assetId === order.assetId);
  const reserved = context.openOrderReservationsMinor.reduce((sum, value) => sum + value, 0n);
  const reserveMinor = context.protectedReserveMinor;
  const availableAfterReserve = reserveMinor !== undefined && reserveMinor >= 0n
    ? context.currentCashMinor - reserved - reserveMinor : 0n;
  const buyingPowerMinor = availableAfterReserve > 0n ? availableAfterReserve : 0n;
  const reserveProtection = policy.reserveProtectionConfiguration && order.side === "BUY" ? Object.freeze({
    version: policy.reserveProtectionConfiguration.version, ledgerCashMinor: context.currentCashMinor.toString(),
    protectedReserveMinor: reserveMinor !== undefined && reserveMinor >= 0n ? reserveMinor.toString() : null,
    openOrderReservationsMinor: reserved.toString(), buyingPowerMinor: buyingPowerMinor.toString(),
    orderDebitMinor: context.prospectiveOrderDebitMinor.toString(),
  }) : undefined;
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
    ...(reserveProtection ? { reserveProtection } : {}),
    now: context.now.toISOString(), committed: context.committedCapitalMinor.toString(),
    ...(context.capitalBudgetUsageMinor === undefined ? {} : { capitalBudgetUsage: context.capitalBudgetUsageMinor.toString() }),
    ...(context.capitalBudgetProspectiveDebitMinor === undefined ? {} : { capitalBudgetProspectiveDebit: context.capitalBudgetProspectiveDebitMinor.toString() }),
    ...(context.projectedLossMinor === undefined ? {} : { projectedLoss: context.projectedLossMinor.toString() }),
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
  else if (reserveProtection && (reserveProtection.protectedReserveMinor === null || context.prospectiveOrderDebitMinor > buyingPowerMinor)) reasonCode = "RESERVE_PROTECTION_BLOCKED";
  else if ((context.capitalBudgetUsageMinor ?? context.committedCapitalMinor) + reserved + (context.capitalBudgetProspectiveDebitMinor ?? context.prospectiveOrderDebitMinor) > policy.capitalBudgetMinor || context.currentCashMinor < reserved + context.prospectiveOrderDebitMinor) reasonCode = "CAPITAL_BUDGET_EXCEEDED";
  else if (context.currentLossMinor > policy.maxLossMinor || (context.projectedLossMinor ?? 0n) > policy.maxLossMinor) reasonCode = "LOSS_LIMIT_EXCEEDED";
  return Object.freeze({ policyId: policy.policyId, policyVersion: policy.version, inputHash: digest,
    priceRecordId: price?.recordId ?? null, priceAvailableAt: price?.availableAt.toISOString() ?? null,
    referencePriceAtoms: price?.price.priceAtoms.toString() ?? null, referencePriceScale: price?.price.priceScale ?? null,
    datasetVersion: price?.datasetVersion ?? null, strategyVersion: order.strategyVersion, assetRegistryVersion: order.registryVersion,
    executionPolicyVersions: Object.freeze({ execution: SIMULATION_EXECUTION_POLICY_VERSION, spreadSlippage: SPREAD_SLIPPAGE_POLICY_VERSION, fee: FEE_POLICY_VERSION, rounding: M1_ROUNDING_POLICY_VERSION, fillAssumption: "SIMULATED_FULL_OR_NONE" }),
    ...(reserveProtection ? { reserveProtection } : {}),
    reservedOpenOrdersMinor: reserved.toString(), resultingExposureMinor: exposure.toString(),
    ...(context.projectedLossMinor === undefined ? {} : { projectedLossMinor: context.projectedLossMinor.toString() }),
    currentLossMinor: context.currentLossMinor.toString(), maxLossMinor: policy.maxLossMinor.toString(), reasonCode,
    disposition: reasonCode === "APPROVED" ? "APPROVE" : "REJECT" });
}
