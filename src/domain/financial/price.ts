import type { CurrencyCode } from "./currency";

export interface Price {
  readonly currencyCode: CurrencyCode;
  readonly priceAtoms: bigint;
  readonly priceScale: number;
}

export function price(currencyCode: CurrencyCode, priceAtoms: bigint, priceScale: number): Price {
  if (!Number.isInteger(priceScale) || priceScale < 0 || priceScale > 8) {
    throw new Error("Price scale must be an integer from 0 through 8");
  }
  if (priceAtoms <= 0n) {
    throw new Error("Price atoms must be positive");
  }
  return Object.freeze({ currencyCode, priceAtoms, priceScale });
}
