import { basisPoints } from "@/domain/financial/basis-points";
import { feeCeiling, buyExecutionPrice, buySettlementNotional } from "@/domain/financial/rounding";
import { money, type Money } from "@/domain/financial/money";
import { assertQuantityIncrement, type AssetQuantity } from "@/domain/financial/quantity";
import type { Price } from "@/domain/financial/price";
import type { FixtureAsset, FixturePriceObservation, ProposedOrder } from "@/domain/strategy/fixture-assets";

export const SIMULATION_EXECUTION_POLICY_VERSION = "m1-market-execution/v1";
export const SPREAD_SLIPPAGE_POLICY_VERSION = "m1-spread-slippage/v1";
export const FEE_POLICY_VERSION = "m1-fee/v1";
export const TOTAL_SPREAD_BPS = 10n;
export const HALF_SPREAD_BPS = 5n;
export const SLIPPAGE_BPS = 5n;

export type ExecutionRejectionCode = "ACCOUNT_NOT_ACTIVE" | "ACCOUNT_NOT_SIMULATION" | "DECISION_NOT_APPROVED" | "RISK_NOT_APPROVED" | "ASSET_NOT_ACTIVE" | "PRICE_NOT_AVAILABLE" | "LOOKAHEAD_PRICE" | "INVALID_QUANTITY" | "INSUFFICIENT_CASH" | "CASH_RESERVE_VIOLATION" | "ALREADY_SETTLED";
export interface ExecutionRejection { readonly code: ExecutionRejectionCode; readonly message: string; }

export interface SimulationExecutionInput {
  readonly financialAccountId: string;
  readonly actorId: string;
  readonly accountActive: boolean;
  readonly simulationMode: boolean;
  readonly decisionApproved: boolean;
  readonly riskApproved: boolean;
  readonly proposal: ProposedOrder;
  readonly asset: FixtureAsset;
  readonly referencePrice: FixturePriceObservation;
  readonly availableCash: Money;
  readonly decisionNav: Money;
  readonly executionTimestamp: Date;
  readonly alreadySettled: boolean;
}

export interface SimulationFill {
  readonly fillId: string;
  readonly financialAccountId: string;
  readonly proposalId: string;
  readonly quantity: AssetQuantity;
  readonly referencePrice: Price;
  readonly executionPrice: Price;
  readonly grossNotional: Money;
  readonly fee: Money;
  readonly totalCashDebit: Money;
  readonly executionPolicyVersion: typeof SIMULATION_EXECUTION_POLICY_VERSION;
  readonly spreadSlippagePolicyVersion: typeof SPREAD_SLIPPAGE_POLICY_VERSION;
  readonly feePolicyVersion: typeof FEE_POLICY_VERSION;
  readonly roundingPolicyVersion: "m1-rounding/v1";
  readonly executionTimestamp: Date;
}

export function executeSimulationBuy(input: SimulationExecutionInput): SimulationFill {
  if (!input.accountActive) throw new Error("ACCOUNT_NOT_ACTIVE");
  if (!input.simulationMode) throw new Error("ACCOUNT_NOT_SIMULATION");
  if (!input.decisionApproved) throw new Error("DECISION_NOT_APPROVED");
  if (!input.riskApproved) throw new Error("RISK_NOT_APPROVED");
  if (input.alreadySettled) throw new Error("ALREADY_SETTLED");
  if (!input.asset.active || input.asset.classification !== "SYNTHETIC_FIXTURE") throw new Error("ASSET_NOT_ACTIVE");
  if (input.referencePrice.availableAt.getTime() > input.proposal.decisionTimestamp.getTime()) throw new Error("LOOKAHEAD_PRICE");
  if (input.referencePrice.assetId !== input.asset.assetId || input.referencePrice.price.currencyCode !== input.availableCash.currencyCode) throw new Error("PRICE_NOT_AVAILABLE");
  if (input.proposal.side !== "BUY" || input.proposal.orderType !== "MARKET" || input.proposal.quantity.atomicUnits <= 0n || input.proposal.quantity.quantityScale !== input.asset.quantityScale) throw new Error("INVALID_QUANTITY");
  try { assertQuantityIncrement(input.proposal.quantity, input.asset.minimumQuantityIncrementAtoms); } catch { throw new Error("INVALID_QUANTITY"); }
  const executionPrice = buyExecutionPrice(input.referencePrice.price, basisPoints(HALF_SPREAD_BPS), basisPoints(SLIPPAGE_BPS));
  const grossNotional = buySettlementNotional(input.proposal.quantity, executionPrice);
  const fee = feeCeiling(grossNotional, basisPoints(10n), money(input.availableCash.currencyCode, 100n));
  const totalCashDebit = money(grossNotional.currencyCode, grossNotional.minorUnits + fee.minorUnits);
  const reserve = (input.decisionNav.minorUnits * 1_000n + 9_999n) / 10_000n;
  if (totalCashDebit.minorUnits > input.availableCash.minorUnits) throw new Error("INSUFFICIENT_CASH");
  if (input.availableCash.minorUnits - totalCashDebit.minorUnits < reserve) throw new Error("CASH_RESERVE_VIOLATION");
  return Object.freeze({ fillId: input.proposal.proposalId, financialAccountId: input.financialAccountId, proposalId: input.proposal.proposalId, quantity: input.proposal.quantity, referencePrice: input.referencePrice.price, executionPrice, grossNotional, fee, totalCashDebit, executionPolicyVersion: SIMULATION_EXECUTION_POLICY_VERSION, spreadSlippagePolicyVersion: SPREAD_SLIPPAGE_POLICY_VERSION, feePolicyVersion: FEE_POLICY_VERSION, roundingPolicyVersion: "m1-rounding/v1", executionTimestamp: input.executionTimestamp });
}
