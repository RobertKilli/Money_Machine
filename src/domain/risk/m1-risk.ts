import { assertQuantityIncrement } from "@/domain/financial/quantity";
import { buySettlementNotional } from "@/domain/financial/rounding";
import { CASH_RESERVE_BPS, CONTRIBUTION_REBALANCING_VERSION, FIXTURE_ASSET_REGISTRY_VERSION, FIXTURE_DATASET_VERSION, M1_RISK_POLICY_VERSION, type DecisionPortfolioState, type FixtureAsset, type FixturePriceObservation, type ProposedOrder } from "@/domain/strategy/fixture-assets";
import type { Money } from "@/domain/financial/money";

export type RiskViolationCode = "ACCOUNT_NOT_ACTIVE" | "ACCOUNT_NOT_SIMULATION" | "STRATEGY_DISABLED" | "STRATEGY_VERSION_MISMATCH" | "ASSET_NOT_ACTIVE" | "PRICE_NOT_AVAILABLE" | "LOOKAHEAD_PRICE" | "INVALID_QUANTITY_INCREMENT" | "INSUFFICIENT_CASH" | "CASH_RESERVE_VIOLATION" | "ALLOCATION_LIMIT_EXCEEDED" | "INVALID_PROPOSAL_STATE";
export interface RiskViolation { readonly code: RiskViolationCode; readonly message: string; readonly evidence: Readonly<Record<string, string>>; }
export interface RiskDecision { readonly policyVersion: typeof M1_RISK_POLICY_VERSION; readonly disposition: "APPROVE" | "REJECT"; readonly violations: readonly RiskViolation[]; readonly explanation: string; }

export interface RiskContext {
  readonly accountActive: boolean;
  readonly simulationMode: boolean;
  readonly strategyEnabled: boolean;
  readonly strategyVersion: string;
  readonly accountCurrency: "NOK";
  readonly availableCash: Money;
  readonly decisionNav: Money;
  readonly decisionTimestamp: Date;
  readonly assets: readonly FixtureAsset[];
  readonly prices: readonly FixturePriceObservation[];
  readonly portfolioState?: DecisionPortfolioState;
}

function violation(code: RiskViolationCode, message: string, evidence: Record<string, string> = {}): RiskViolation { return Object.freeze({ code, message, evidence: Object.freeze(evidence) }); }

export function assessProposal(order: ProposedOrder, context: RiskContext): RiskDecision {
  const violations: RiskViolation[] = [];
  if (!context.accountActive) violations.push(violation("ACCOUNT_NOT_ACTIVE", "Financial account is not active"));
  if (!context.simulationMode) violations.push(violation("ACCOUNT_NOT_SIMULATION", "Only simulation accounts are eligible"));
  if (!context.strategyEnabled) violations.push(violation("STRATEGY_DISABLED", "Strategy assignment is disabled"));
  if (context.strategyVersion !== CONTRIBUTION_REBALANCING_VERSION || order.strategyVersion !== context.strategyVersion) violations.push(violation("STRATEGY_VERSION_MISMATCH", "Proposal strategy version is not enabled"));
  const asset = context.assets.find((candidate) => candidate.assetId === order.assetId);
  if (!asset?.active || asset.registryVersion !== FIXTURE_ASSET_REGISTRY_VERSION) violations.push(violation("ASSET_NOT_ACTIVE", "Asset is not active in the fixture registry"));
  if (order.side !== "BUY" || order.orderType !== "MARKET") violations.push(violation("INVALID_PROPOSAL_STATE", "Only MARKET BUY proposals are eligible"));
  if (order.referencePrice.currencyCode !== context.accountCurrency || order.referenceNotional.currencyCode !== context.accountCurrency) violations.push(violation("PRICE_NOT_AVAILABLE", "Proposal currency does not match account currency"));
  const price = context.prices.find((candidate) => candidate.recordId === order.referencePriceRecordId);
  if (!price || price.datasetVersion !== FIXTURE_DATASET_VERSION) violations.push(violation("PRICE_NOT_AVAILABLE", "Reference fixture price is missing"));
  else if (price.availableAt.getTime() > context.decisionTimestamp.getTime()) violations.push(violation("LOOKAHEAD_PRICE", "Reference price was not available at decision time"));
  if (asset) {
    try { assertQuantityIncrement(order.quantity, asset.minimumQuantityIncrementAtoms); } catch { violations.push(violation("INVALID_QUANTITY_INCREMENT", "Quantity is not aligned to the registry increment")); }
    if (order.quantity.quantityScale !== asset.quantityScale || order.quantity.atomicUnits <= 0n) violations.push(violation("INVALID_QUANTITY_INCREMENT", "Quantity scale or amount is invalid"));
  }
  const notional = buySettlementNotional(order.quantity, order.referencePrice);
  if (notional.minorUnits > context.availableCash.minorUnits) violations.push(violation("INSUFFICIENT_CASH", "Proposal exceeds available ledger cash"));
  const state = context.portfolioState;
  if (state && (state.decisionNavMinor !== context.decisionNav.minorUnits || state.cashMinor !== context.availableCash.minorUnits)) violations.push(violation("INVALID_PROPOSAL_STATE", "Decision portfolio snapshot does not match risk inputs"));
  const reserve = (context.decisionNav.minorUnits * CASH_RESERVE_BPS + 9_999n) / 10_000n;
  if (context.availableCash.minorUnits - notional.minorUnits < reserve) violations.push(violation("CASH_RESERVE_VIOLATION", "Proposal would breach the frozen cash reserve"));
  const existing = state?.existingMarketValueByAsset[order.assetId] ?? 0n;
  if (asset && (existing + notional.minorUnits) * 10_000n > context.decisionNav.minorUnits * (asset.targetWeightBps + 500n)) violations.push(violation("ALLOCATION_LIMIT_EXCEEDED", "Existing plus proposed exposure exceeds the deterministic fixture allocation cap"));
  return Object.freeze({ policyVersion: M1_RISK_POLICY_VERSION, disposition: violations.length ? "REJECT" : "APPROVE", violations: Object.freeze(violations), explanation: violations.length ? violations.map((item) => item.message).join("; ") : "Proposal satisfies all deterministic M1 risk rules" });
}
