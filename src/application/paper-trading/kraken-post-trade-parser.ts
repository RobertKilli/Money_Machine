import { createHash } from "node:crypto";

export const KRAKEN_POST_TRADE_PARSER_VERSION = "kraken-post-trade-parser/v1" as const;
const MAX_RESPONSE_CHARS = 1_048_576;
const MAX_TRADES = 1_000;
const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

export interface KrakenPostTradeExpectedInstrument {
  readonly symbol: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly tradeVenueMic: string;
  readonly publicationVenueMic: string;
}

export interface ParsedKrakenPostTrade {
  readonly tradeId: string;
  readonly symbol: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly tradeVenueMic: string;
  readonly publicationVenueMic: string;
  readonly price: Readonly<{ original: string; coefficient: string; scale: number }>;
  readonly quantity: Readonly<{ original: string; coefficient: string; scale: number }>;
  readonly tradeTsOriginal: string;
  readonly publicationTsOriginal: string;
  readonly observedAt: string;
  readonly availableAt: string;
}

export type KrakenPostTradeParseResult =
  // VALID preserves the response's list and API cursor field; it does not
  // assert that one returned item is the globally latest trade.
  | { readonly status: "VALID"; readonly returnedCount: number; readonly lastTsOriginal: string; readonly retrievedAtOriginal: string; readonly retrievedAt: string; readonly trades: readonly ParsedKrakenPostTrade[]; readonly rawResponse: string; readonly payloadFingerprint: string }
  | { readonly status: "INVALID"; readonly reason: "INPUT_INVALID" | "PAYLOAD_TOO_LARGE" | "JSON_INVALID" | "SHAPE_INVALID" | "PROVIDER_ERROR" | "COUNT_MISMATCH" | "IDENTITY_MISMATCH" | "VENUE_MISMATCH" | "TRADE_INVALID" | "TRADE_ORDER_INVALID" | "LAST_TS_MISMATCH" | "TIME_INVALID" | "TIME_ORDER_INVALID"; readonly rawResponse: string | null; readonly payloadFingerprint: string | null };

interface ExactTimestamp {
  readonly original: string;
  readonly epochNanoseconds: bigint;
}

interface ExactDecimal {
  readonly original: string;
  readonly coefficient: bigint;
  readonly scale: number;
}

const invalid = (reason: Extract<KrakenPostTradeParseResult, { status: "INVALID" }>['reason'], rawResponse: string | null = null) => ({
  status: "INVALID" as const,
  reason,
  rawResponse,
  payloadFingerprint: rawResponse === null ? null : fingerprint(rawResponse),
});

function fingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function floorDivide(value: bigint, divisor: bigint): bigint {
  const quotient = value / divisor;
  return value % divisor < 0n ? quotient - 1n : quotient;
}

function ceilDivide(value: bigint, divisor: bigint): bigint {
  return -floorDivide(-value, divisor);
}

function daysFromCivil(yearValue: bigint, monthValue: bigint, dayValue: bigint): bigint {
  let year = yearValue;
  const month = monthValue;
  const day = dayValue;
  if (month <= 2n) year -= 1n;
  const era = floorDivide(year, 400n);
  const yearOfEra = year - era * 400n;
  const adjustedMonth = month + (month > 2n ? -3n : 9n);
  const dayOfYear = (153n * adjustedMonth + 2n) / 5n + day - 1n;
  const dayOfEra = yearOfEra * 365n + yearOfEra / 4n - yearOfEra / 100n + dayOfYear;
  return era * 146097n + dayOfEra - 719468n;
}

function parseTimestamp(value: unknown): ExactTimestamp | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText = ""] = match;
  const year = BigInt(yearText);
  const month = BigInt(monthText);
  const day = BigInt(dayText);
  const hour = BigInt(hourText);
  const minute = BigInt(minuteText);
  const second = BigInt(secondText);
  if (year < 1n || month < 1n || month > 12n || hour > 23n || minute > 59n || second > 59n) return null;
  const leapYear = year % 4n === 0n && (year % 100n !== 0n || year % 400n === 0n);
  const daysInMonth = month === 2n ? (leapYear ? 29n : 28n) : month === 4n || month === 6n || month === 9n || month === 11n ? 30n : 31n;
  if (day < 1n || day > daysInMonth) return null;
  const seconds = daysFromCivil(year, month, day) * 86_400n + hour * 3_600n + minute * 60n + second;
  const fractionNanoseconds = BigInt(fractionText.padEnd(9, "0") || "0");
  return { original: value, epochNanoseconds: seconds * NANOSECONDS_PER_SECOND + fractionNanoseconds };
}

function normalizeTimestamp(timestamp: ExactTimestamp, direction: "FLOOR" | "CEIL"): string | null {
  const millis = direction === "FLOOR"
    ? floorDivide(timestamp.epochNanoseconds, NANOSECONDS_PER_MILLISECOND)
    : ceilDivide(timestamp.epochNanoseconds, NANOSECONDS_PER_MILLISECOND);
  const maxDateMillis = 8_640_000_000_000_000n;
  if (millis < -maxDateMillis || millis > maxDateMillis) return null;
  const date = new Date(Number(millis));
  if (!Number.isFinite(date.getTime())) return null;
  const normalized = date.toISOString();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(normalized) ? normalized : null;
}

function parsePositiveDecimal(value: unknown): ExactDecimal | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  const coefficient = BigInt(`${whole}${fraction}`);
  if (coefficient <= 0n) return null;
  return { original: value, coefficient, scale: fraction.length };
}

function isCanonicalIdentifier(value: unknown, maxLength = 64): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && value.trim() === value;
}

function parseTrade(value: unknown, expected: KrakenPostTradeExpectedInstrument): ParsedKrakenPostTrade | KrakenPostTradeParseResult {
  if (!isRecord(value)) return invalid("TRADE_INVALID");
  const tradeId = value.trade_id;
  const symbol = value.symbol;
  const baseAsset = value.base_asset;
  const quoteAsset = value.quote_asset;
  const tradeVenueMic = value.trade_venue;
  const publicationVenueMic = value.publication_venue;
  if (!isCanonicalIdentifier(tradeId, 19) || !isCanonicalIdentifier(symbol) || !isCanonicalIdentifier(baseAsset) || !isCanonicalIdentifier(quoteAsset)) return invalid("TRADE_INVALID");
  if (symbol !== expected.symbol || baseAsset !== expected.baseAsset || quoteAsset !== expected.quoteAsset) return invalid("IDENTITY_MISMATCH");
  if (!isCanonicalIdentifier(tradeVenueMic, 12) || !isCanonicalIdentifier(publicationVenueMic, 12)) return invalid("TRADE_INVALID");
  if (tradeVenueMic !== expected.tradeVenueMic || publicationVenueMic !== expected.publicationVenueMic) return invalid("VENUE_MISMATCH");
  const price = parsePositiveDecimal(value.price);
  const quantity = parsePositiveDecimal(value.quantity);
  if (!price || !quantity) return invalid("TRADE_INVALID");
  const tradeTime = parseTimestamp(value.trade_ts);
  const publicationTime = parseTimestamp(value.publication_ts);
  if (!tradeTime || !publicationTime) return invalid("TIME_INVALID");
  return {
    tradeId,
    symbol,
    baseAsset,
    quoteAsset,
    tradeVenueMic,
    publicationVenueMic,
    price: { original: price.original, coefficient: price.coefficient.toString(), scale: price.scale },
    quantity: { original: quantity.original, coefficient: quantity.coefficient.toString(), scale: quantity.scale },
    tradeTsOriginal: tradeTime.original,
    publicationTsOriginal: publicationTime.original,
    observedAt: normalizeTimestamp(tradeTime, "FLOOR") ?? "",
    availableAt: normalizeTimestamp(publicationTime, "CEIL") ?? "",
  };
}

/**
 * Parses a supplied Kraken Post-Trade JSON response only. It performs no I/O,
 * source selection, `LAST_TRADE` assignment, or assumption that count=1 is latest.
 */
export function parseKrakenPostTradeResponse(input: {
  readonly rawResponse: string;
  readonly retrievedAt: string;
  readonly expected: KrakenPostTradeExpectedInstrument;
}): KrakenPostTradeParseResult {
  if (!input || typeof input.rawResponse !== "string" || typeof input.retrievedAt !== "string" || !isRecord(input.expected) ||
    ![input.expected.symbol, input.expected.baseAsset, input.expected.quoteAsset, input.expected.tradeVenueMic, input.expected.publicationVenueMic].every(item => isCanonicalIdentifier(item, 64))) {
    return invalid("INPUT_INVALID");
  }
  const rawResponse = input.rawResponse;
  if (rawResponse.length > MAX_RESPONSE_CHARS) return invalid("PAYLOAD_TOO_LARGE");
  let payload: unknown;
  try { payload = JSON.parse(rawResponse); } catch { return invalid("JSON_INVALID", rawResponse); }
  const retrievalTime = parseTimestamp(input.retrievedAt);
  if (!retrievalTime) return invalid("TIME_INVALID", rawResponse);
  const normalizedRetrieval = normalizeTimestamp(retrievalTime, "CEIL");
  if (!normalizedRetrieval) return invalid("TIME_INVALID", rawResponse);
  if (!isRecord(payload) || !Array.isArray(payload.error) || !isRecord(payload.result) ||
    !Array.isArray(payload.result.trades) || !Number.isSafeInteger(payload.result.count) ||
    typeof payload.result.last_ts !== "string" || payload.result.trades.length > MAX_TRADES) return invalid("SHAPE_INVALID", rawResponse);
  if (payload.error.length > 0) return invalid("PROVIDER_ERROR", rawResponse);
  const trades = payload.result.trades;
  const count = payload.result.count as number;
  if (count !== trades.length) return invalid("COUNT_MISMATCH", rawResponse);
  const lastTs = parseTimestamp(payload.result.last_ts);
  if (!lastTs) return invalid("TIME_INVALID", rawResponse);
  const parsedTrades: ParsedKrakenPostTrade[] = [];
  const seenTradeIds = new Set<string>();
  let previousTradeTime: ExactTimestamp | null = null;
  let latestTradeTime: ExactTimestamp | null = null;
  for (const rawTrade of trades) {
    const parsed = parseTrade(rawTrade, input.expected);
    if ("status" in parsed) return { ...parsed, rawResponse, payloadFingerprint: fingerprint(rawResponse) };
    const tradeTime = parseTimestamp(parsed.tradeTsOriginal)!;
    const publicationTime = parseTimestamp(parsed.publicationTsOriginal)!;
    if (tradeTime.epochNanoseconds > publicationTime.epochNanoseconds || publicationTime.epochNanoseconds > retrievalTime.epochNanoseconds) return invalid("TIME_ORDER_INVALID", rawResponse);
    if (previousTradeTime && tradeTime.epochNanoseconds < previousTradeTime.epochNanoseconds) return invalid("TRADE_ORDER_INVALID", rawResponse);
    if (seenTradeIds.has(parsed.tradeId)) return invalid("TRADE_INVALID", rawResponse);
    seenTradeIds.add(parsed.tradeId);
    previousTradeTime = tradeTime;
    latestTradeTime = tradeTime;
    if (!parsed.observedAt || !parsed.availableAt) return invalid("TIME_INVALID", rawResponse);
    if (parsed.availableAt > normalizedRetrieval) return invalid("TIME_ORDER_INVALID", rawResponse);
    parsedTrades.push(parsed);
  }
  if (latestTradeTime && latestTradeTime.epochNanoseconds !== lastTs.epochNanoseconds) return invalid("LAST_TS_MISMATCH", rawResponse);
  return {
    status: "VALID",
    returnedCount: count,
    lastTsOriginal: lastTs.original,
    retrievedAtOriginal: retrievalTime.original,
    retrievedAt: normalizedRetrieval,
    trades: parsedTrades,
    rawResponse,
    payloadFingerprint: fingerprint(rawResponse),
  };
}
