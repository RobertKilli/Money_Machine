import { BASIS_POINTS_PER_WHOLE, type BasisPoints } from "./basis-points";
import { money, type Money } from "./money";
import { price, type Price } from "./price";
import type { AssetQuantity } from "./quantity";

export const M1_ROUNDING_POLICY_VERSION = "m1-rounding/v1";

function assertPositiveDivisor(divisor: bigint): void {
  if (divisor <= 0n) throw new Error("Divisor must be positive");
}

export function floorDivision(dividend: bigint, divisor: bigint): bigint {
  assertPositiveDivisor(divisor);
  const quotient = dividend / divisor;
  const remainder = dividend % divisor;
  return remainder < 0n ? quotient - 1n : quotient;
}

export function ceilingDivision(dividend: bigint, divisor: bigint): bigint {
  return -floorDivision(-dividend, divisor);
}

export function allocationFloor(total: Money, target: BasisPoints): Money {
  if (total.minorUnits < 0n) throw new Error("Allocation total cannot be negative");
  return money(total.currencyCode, floorDivision(total.minorUnits * target.value, BASIS_POINTS_PER_WHOLE));
}

export function applyBasisPointsFloor(total: Money, rate: BasisPoints): Money {
  return allocationFloor(total, rate);
}

export function applyBasisPointsCeiling(total: Money, rate: BasisPoints): Money {
  if (total.minorUnits < 0n) throw new Error("Basis point total cannot be negative");
  return money(total.currencyCode, ceilingDivision(total.minorUnits * rate.value, BASIS_POINTS_PER_WHOLE));
}

export function buyExecutionPrice(midPrice: Price, halfSpread: BasisPoints, slippage: BasisPoints): Price {
  const adjustment = BASIS_POINTS_PER_WHOLE + halfSpread.value + slippage.value;
  return price(midPrice.currencyCode, ceilingDivision(midPrice.priceAtoms * adjustment, BASIS_POINTS_PER_WHOLE), midPrice.priceScale);
}

export function sellExecutionPrice(midPrice: Price, halfSpread: BasisPoints, slippage: BasisPoints): Price {
  const adjustment = BASIS_POINTS_PER_WHOLE - halfSpread.value - slippage.value;
  if (adjustment <= 0n) throw new Error("Sell execution adjustment must remain positive");
  return price(midPrice.currencyCode, floorDivision(midPrice.priceAtoms * adjustment, BASIS_POINTS_PER_WHOLE), midPrice.priceScale);
}

function settlementDenominator(quantity: AssetQuantity, executionPrice: Price): bigint {
  return 10n ** BigInt(quantity.quantityScale + executionPrice.priceScale);
}

export function buySettlementNotional(quantity: AssetQuantity, executionPrice: Price): Money {
  if (quantity.atomicUnits < 0n) throw new Error("Quantity cannot be negative");
  return money(executionPrice.currencyCode, ceilingDivision(quantity.atomicUnits * executionPrice.priceAtoms, settlementDenominator(quantity, executionPrice)));
}

export function sellSettlementProceeds(quantity: AssetQuantity, executionPrice: Price): Money {
  if (quantity.atomicUnits < 0n) throw new Error("Quantity cannot be negative");
  return money(executionPrice.currencyCode, floorDivision(quantity.atomicUnits * executionPrice.priceAtoms, settlementDenominator(quantity, executionPrice)));
}

export function feeCeiling(notional: Money, feeRate: BasisPoints, minimumFee: Money): Money {
  if (notional.minorUnits < 0n) throw new Error("Fee notional cannot be negative");
  if (notional.currencyCode !== minimumFee.currencyCode) throw new Error("Fee currency mismatch");
  const proportional = ceilingDivision(notional.minorUnits * feeRate.value, BASIS_POINTS_PER_WHOLE);
  return money(notional.currencyCode, proportional > minimumFee.minorUnits ? proportional : minimumFee.minorUnits);
}
