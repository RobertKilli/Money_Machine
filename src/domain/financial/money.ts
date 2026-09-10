import { assertCurrencyCode, currencyScale, type CurrencyCode } from "./currency";

export interface Money {
  readonly currencyCode: CurrencyCode;
  readonly minorUnits: bigint;
}

export interface MoneyDto {
  readonly currencyCode: CurrencyCode;
  readonly minorUnits: string;
}

export function money(currencyCode: CurrencyCode, minorUnits: bigint): Money {
  return Object.freeze({ currencyCode, minorUnits });
}

export function moneyFromDto(dto: MoneyDto): Money {
  assertCurrencyCode(dto.currencyCode);
  if (!/^-?\d+$/.test(dto.minorUnits)) {
    throw new Error("Money minor units must be a decimal integer string");
  }

  return money(dto.currencyCode, BigInt(dto.minorUnits));
}

export function moneyToDto(value: Money): MoneyDto {
  return { currencyCode: value.currencyCode, minorUnits: value.minorUnits.toString() };
}

export function moneyFromDecimalInput(currencyCode: CurrencyCode, value: string): Money {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) {
    throw new Error("Money input must be a decimal string");
  }

  const [, sign, whole, fraction = ""] = match;
  const scale = currencyScale(currencyCode);
  if (fraction.length > scale) {
    throw new Error(`Money input exceeds ${currencyCode} scale of ${scale}`);
  }

  const paddedFraction = fraction.padEnd(scale, "0");
  const atoms = BigInt(whole) * 10n ** BigInt(scale) + BigInt(paddedFraction || "0");
  return money(currencyCode, sign === "-" ? -atoms : atoms);
}

export function assertSameCurrency(left: Money, right: Money): void {
  if (left.currencyCode !== right.currencyCode) {
    throw new Error(`Currency mismatch: ${left.currencyCode} and ${right.currencyCode}`);
  }
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(left.currencyCode, left.minorUnits + right.minorUnits);
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(left.currencyCode, left.minorUnits - right.minorUnits);
}

export function subtractNonNegativeMoney(left: Money, right: Money): Money {
  const result = subtractMoney(left, right);
  if (result.minorUnits < 0n) {
    throw new Error("Money result cannot be negative");
  }
  return result;
}

export function compareMoney(left: Money, right: Money): -1 | 0 | 1 {
  assertSameCurrency(left, right);
  if (left.minorUnits === right.minorUnits) return 0;
  return left.minorUnits < right.minorUnits ? -1 : 1;
}

export function assertPositiveMoney(value: Money): void {
  if (value.minorUnits <= 0n) {
    throw new Error("Money amount must be positive");
  }
}

/** Presentation only: preserves the authoritative bigint value throughout. */
export function formatMoney(value: Money): string {
  const scale = currencyScale(value.currencyCode);
  const sign = value.minorUnits < 0n ? "-" : "";
  const absolute = value.minorUnits < 0n ? -value.minorUnits : value.minorUnits;
  const divisor = 10n ** BigInt(scale);
  const whole = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(scale, "0");
  return `${sign}${whole.toString()}.${fraction} ${value.currencyCode}`;
}
