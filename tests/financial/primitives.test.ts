import { describe, expect, it } from "vitest";

import { basisPoints } from "@/domain/financial/basis-points";
import { addMoney, compareMoney, money, moneyFromDecimalInput, moneyFromDto, moneyToDto, subtractMoney, subtractNonNegativeMoney } from "@/domain/financial/money";
import { price } from "@/domain/financial/price";
import { assertQuantityIncrement, quantity } from "@/domain/financial/quantity";
import { allocationFloor, applyBasisPointsCeiling, applyBasisPointsFloor, buyExecutionPrice, buySettlementNotional, ceilingDivision, feeCeiling, floorDivision, sellExecutionPrice } from "@/domain/financial/rounding";

describe("Money", () => {
  it("adds, subtracts, compares, and serializes without Number conversion", () => {
    const initial = money("NOK", 125_050n);
    const added = addMoney(initial, money("NOK", 4_950n));
    expect(added.minorUnits).toBe(130_000n);
    expect(subtractMoney(added, initial).minorUnits).toBe(4_950n);
    expect(compareMoney(initial, added)).toBe(-1);
    expect(moneyToDto(initial)).toEqual({ currencyCode: "NOK", minorUnits: "125050" });
    expect(moneyFromDto({ currencyCode: "NOK", minorUnits: "125050" }).minorUnits).toBe(125_050n);
  });

  it("rejects currency mismatch, unsupported precision, and negative non-negative result", () => {
    expect(() => addMoney(money("NOK", 1n), money("USD", 1n))).toThrow("Currency mismatch");
    expect(() => moneyFromDecimalInput("NOK", "1.001")).toThrow("scale");
    expect(() => subtractNonNegativeMoney(money("NOK", 1n), money("NOK", 2n))).toThrow("cannot be negative");
  });

  it("parses deposit decimal text directly to minor units without binary floating point", () => {
    expect(moneyFromDecimalInput("NOK", "1000").minorUnits).toBe(100_000n);
    expect(moneyFromDecimalInput("NOK", "1000.00").minorUnits).toBe(100_000n);
    expect(moneyFromDecimalInput("NOK", "250.50").minorUnits).toBe(25_050n);
    for (const invalid of ["NaN", "Infinity", "1e6", "1.234", "", " ", "+1", "1."]) {
      expect(() => moneyFromDecimalInput("NOK", invalid)).toThrow();
    }
  });
});

describe("basis points and explicit rounding", () => {
  it("treats 100 bps as one percent with floor and ceiling operations", () => {
    const value = money("NOK", 10_099n);
    expect(applyBasisPointsFloor(value, basisPoints(100n)).minorUnits).toBe(100n);
    expect(applyBasisPointsCeiling(value, basisPoints(100n)).minorUnits).toBe(101n);
    expect(allocationFloor(money("NOK", 10_001n), basisPoints(6_000n)).minorUnits).toBe(6_000n);
  });

  it("uses deterministic floor and ceiling division", () => {
    expect(floorDivision(10n, 3n)).toBe(3n);
    expect(ceilingDivision(10n, 3n)).toBe(4n);
    expect(floorDivision(-10n, 3n)).toBe(-4n);
    expect(ceilingDivision(-10n, 3n)).toBe(-3n);
  });

  it("rounds buy and sell execution prices conservatively", () => {
    const mid = price("NOK", 10_001n, 0);
    expect(buyExecutionPrice(mid, basisPoints(5n), basisPoints(5n)).priceAtoms).toBe(10_012n);
    expect(sellExecutionPrice(mid, basisPoints(5n), basisPoints(5n)).priceAtoms).toBe(9_990n);
  });

  it("rounds buy settlement up and fees up with a minimum", () => {
    const notional = buySettlementNotional(quantity("asset", 1n, 1), price("NOK", 101n, 1));
    expect(notional.minorUnits).toBe(2n);
    expect(feeCeiling(money("NOK", 1_000_001n), basisPoints(10n), money("NOK", 100n)).minorUnits).toBe(1_001n);
    expect(feeCeiling(money("NOK", 100n), basisPoints(10n), money("NOK", 100n)).minorUnits).toBe(100n);
  });
});

describe("quantity and price precision", () => {
  it("enforces the asset-defined quantity increment and scale boundary", () => {
    expect(() => assertQuantityIncrement(quantity("asset", 5n, 4), 2n)).toThrow("minimum increment");
    expect(() => quantity("asset", 1n, 9)).toThrow("0 through 8");
    expect(() => price("NOK", 1n, 9)).toThrow("0 through 8");
  });
});
