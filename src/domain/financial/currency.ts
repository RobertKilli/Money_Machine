export const CURRENCY_REGISTRY = {
  NOK: { code: "NOK", monetaryScale: 2, minorUnitName: "ore" },
  USD: { code: "USD", monetaryScale: 2, minorUnitName: "cent" },
  EUR: { code: "EUR", monetaryScale: 2, minorUnitName: "cent" },
} as const;

export type CurrencyCode = keyof typeof CURRENCY_REGISTRY;

export function assertCurrencyCode(value: string): asserts value is CurrencyCode {
  if (!(value in CURRENCY_REGISTRY)) {
    throw new Error(`Unsupported currency: ${value}`);
  }
}

export function currencyScale(currency: CurrencyCode): number {
  return CURRENCY_REGISTRY[currency].monetaryScale;
}
