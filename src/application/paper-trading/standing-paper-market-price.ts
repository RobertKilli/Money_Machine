import { CURRENCY_REGISTRY, currencyScale, type CurrencyCode } from "@/domain/financial/currency";
import { price, type Price } from "@/domain/financial/price";
import { canonicalSha256, normalizeIngestionTimestamp } from "@/domain/intelligence/ingestion-provenance";
import { FIXTURE_DATASET_VERSION } from "@/domain/strategy/fixture-assets";

export const STANDING_PAPER_MARKET_PRICE_VERSION = "standing-paper-market-price/v1";
export type PaperPriceKind = "LAST_TRADE" | "BID" | "ASK";

export interface ExternalPaperInstrument {
  readonly instrumentId: `paper.external.${string}`;
  readonly baseAssetId: string;
  readonly quoteCurrency: CurrencyCode;
  readonly venueId: string;
  readonly venueProductId: string;
}

export interface PaperPriceSource {
  readonly providerId: string;
  readonly datasetVersion: string;
  readonly adapterVersion: string;
}

export interface ExternalPaperPriceRequest {
  readonly instrument: ExternalPaperInstrument;
  readonly source: PaperPriceSource;
  readonly kind: PaperPriceKind;
  readonly accountCurrency: CurrencyCode;
  readonly decisionId: string;
  readonly decisionAt: string;
  readonly maxAgeMs: number;
}

/** Output port for an adapter. Acquisition and approval are outside this contract. */
export type ExternalPaperPriceReceipt =
  | { readonly status: "MISSING" | "UNAVAILABLE" }
  | { readonly status: "OBSERVED"; readonly observation: {
      readonly classification: "EXTERNAL_MARKET";
      readonly venueId: string;
      readonly venueProductId: string;
      readonly baseAssetId: string;
      readonly quoteCurrency: string;
      readonly source: PaperPriceSource;
      readonly sourceRecordId: string;
      readonly kind: PaperPriceKind;
      /** Quote major units per whole asset, represented exactly as decimal text. */
      readonly decimalPrice: string;
      readonly observedAt: string;
      readonly availableAt: string;
      readonly retrievedAt: string;
    } };

type PaperPriceFailure = "REQUEST_INVALID" | "SOURCE_UNAVAILABLE" | "PRICE_MISSING" | "SOURCE_MISMATCH" |
  "INSTRUMENT_MISMATCH" | "CURRENCY_MISMATCH" | "PRICE_KIND_MISMATCH" | "PRICE_INVALID" |
  "TIME_INVALID" | "PRICE_FUTURE" | "PRICE_STALE";

const failed = (reason: PaperPriceFailure) => ({ status: "BLOCKED" as const, reason });
const identifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value);
const priceKind = (value: unknown): value is PaperPriceKind => value === "LAST_TRADE" || value === "BID" || value === "ASK";
const currency = (value: unknown): value is CurrencyCode => typeof value === "string" && Object.hasOwn(CURRENCY_REGISTRY, value);

function parsePrice(value: unknown, quoteCurrency: CurrencyCode): Price | null {
  if (typeof value !== "string" || value.length > 32) return null;
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  const minorScale = currencyScale(quoteCurrency);
  const scale = Math.max(0, fraction.length - minorScale);
  const atoms = BigInt(whole + fraction.padEnd(minorScale, "0"));
  return scale <= 8 && atoms > 0n ? price(quoteCurrency, atoms, scale) : null;
}

/** Validates one normalized adapter receipt at a supplied decision cutoff. Pure and fail-closed. */
export function resolveExternalPaperPrice(request: ExternalPaperPriceRequest, receipt: ExternalPaperPriceReceipt | null) {
  const { instrument, source, kind, decisionId, maxAgeMs } = request;
  if (!identifier(instrument.instrumentId) || !instrument.instrumentId.startsWith("paper.external.") || instrument.instrumentId === "paper.external." ||
    !identifier(instrument.baseAssetId) || instrument.baseAssetId.toLowerCase().startsWith("mm.fixture.") ||
    !identifier(instrument.venueId) || !identifier(instrument.venueProductId) || !currency(instrument.quoteCurrency) || !currency(request.accountCurrency) ||
    !identifier(source.providerId) || !identifier(source.datasetVersion) || source.datasetVersion === FIXTURE_DATASET_VERSION || !identifier(source.adapterVersion) ||
    !priceKind(kind) || !identifier(decisionId) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) return failed("REQUEST_INVALID");
  if (instrument.quoteCurrency !== request.accountCurrency) return failed("CURRENCY_MISMATCH");

  let decisionAt: string;
  try { decisionAt = normalizeIngestionTimestamp(request.decisionAt); }
  catch { return failed("REQUEST_INVALID"); }
  if (!receipt || receipt.status === "MISSING") return failed("PRICE_MISSING");
  if (receipt.status !== "OBSERVED") return failed("SOURCE_UNAVAILABLE");
  const observation = receipt.observation;
  if (!observation || observation.classification !== "EXTERNAL_MARKET" ||
    observation.source?.providerId !== source.providerId || observation.source.datasetVersion !== source.datasetVersion ||
    observation.source.adapterVersion !== source.adapterVersion || !identifier(observation.sourceRecordId)) return failed("SOURCE_MISMATCH");
  if (observation.venueId !== instrument.venueId || observation.venueProductId !== instrument.venueProductId ||
    observation.baseAssetId !== instrument.baseAssetId) return failed("INSTRUMENT_MISMATCH");
  if (observation.quoteCurrency !== instrument.quoteCurrency) return failed("CURRENCY_MISMATCH");
  if (observation.kind !== kind) return failed("PRICE_KIND_MISMATCH");
  const validatedPrice = parsePrice(observation.decimalPrice, instrument.quoteCurrency);
  if (!validatedPrice) return failed("PRICE_INVALID");

  let observedAt: string, availableAt: string, retrievedAt: string;
  try {
    observedAt = normalizeIngestionTimestamp(observation.observedAt);
    availableAt = normalizeIngestionTimestamp(observation.availableAt);
    retrievedAt = normalizeIngestionTimestamp(observation.retrievedAt);
  } catch { return failed("TIME_INVALID"); }
  if (observedAt > availableAt || availableAt > retrievedAt) return failed("TIME_INVALID");
  if (retrievedAt > decisionAt) return failed("PRICE_FUTURE");
  if (Date.parse(decisionAt) - Date.parse(observedAt) > maxAgeMs) return failed("PRICE_STALE");

  const priceEvidence = Object.freeze({
    contractVersion: STANDING_PAPER_MARKET_PRICE_VERSION, classification: "EXTERNAL_MARKET" as const,
    instrument: Object.freeze({ instrumentId: instrument.instrumentId, baseAssetId: instrument.baseAssetId,
      quoteCurrency: instrument.quoteCurrency, venueId: instrument.venueId, venueProductId: instrument.venueProductId }),
    source: Object.freeze({ providerId: source.providerId, datasetVersion: source.datasetVersion, adapterVersion: source.adapterVersion }),
    sourceRecordId: observation.sourceRecordId, kind, observedAt, availableAt, retrievedAt,
    decimalPrice: observation.decimalPrice, priceAtoms: validatedPrice.priceAtoms.toString(), priceScale: validatedPrice.priceScale,
  });
  const decisionInput = { contractVersion: STANDING_PAPER_MARKET_PRICE_VERSION, decisionId, decisionAt,
    maxAgeMs, accountCurrency: request.accountCurrency, priceFingerprint: canonicalSha256(priceEvidence) };
  return { status: "AVAILABLE" as const, price: validatedPrice, priceEvidence,
    decisionEvidence: Object.freeze({ ...decisionInput, inputHash: canonicalSha256(decisionInput) }) };
}
