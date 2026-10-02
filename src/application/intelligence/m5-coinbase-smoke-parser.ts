import "server-only";
import { createHash } from "node:crypto";
import { COINBASE_SMOKE_LIMITS, COINBASE_SMOKE_SCOPE, COINBASE_SMOKE_STATUS, smokeSha256, smokeArray, smokeByteSnapshot, smokeError, smokeFreeze, smokeRecord, smokeTime, validateCoinbaseSmokeRequest } from "./m5-coinbase-smoke-contract";

export const COINBASE_SMOKE_PARSER_VERSION = "m5-coinbase-exchange-smoke-parser/v2" as const;
class DecimalToken { constructor(readonly text: string) { Object.freeze(this); } }
/** Preserve every JSON number lexeme. Financial values never pass through binary floating point. */
function losslessJson(body: Uint8Array): unknown {
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body); } catch { return smokeError("UTF8_INVALID"); }
  let offset = 0, nodes = 0;
  const fail = () => smokeError("JSON_INVALID");
  const space = () => { while (/[\t\r\n ]/.test(source[offset] ?? "x")) offset++; };
  const string = (): string => {
    const start = offset;
    if (source[offset++] !== '"') return fail();
    while (offset < source.length) {
      if (source.charCodeAt(offset) < 32) return fail();
      if (source[offset] === "\\") {
        offset++;
        const escape = source[offset++];
        if (escape === "u") { if (!/^[a-fA-F0-9]{4}$/.test(source.slice(offset, offset + 4))) return fail(); offset += 4; }
        else if (!escape || !/["\\/bfnrt]/.test(escape)) return fail();
      } else if (source[offset++] === '"') {
        try { const value = JSON.parse(source.slice(start, offset)) as string; if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) return fail(); return value; } catch { return fail(); }
      }
    }
    return fail();
  };
  const value = (depth: number): unknown => {
    space(); if (++nodes > 4096 || depth > 16) return fail();
    const char = source[offset];
    if (char === '"') return string();
    if (char === "{") {
      offset++; space(); const object: Record<string, unknown> = Object.create(null);
      if (source[offset] === "}") { offset++; return object; }
      while (true) {
        space(); const key = string(); if (Object.hasOwn(object, key)) return fail();
        space(); if (source[offset++] !== ":") return fail(); object[key] = value(depth + 1); space();
        const separator = source[offset++]; if (separator === "}") return object; if (separator !== ",") return fail();
      }
    }
    if (char === "[") {
      offset++; space(); const array: unknown[] = [];
      if (source[offset] === "]") { offset++; return array; }
      while (true) { array.push(value(depth + 1)); space(); const separator = source[offset++]; if (separator === "]") return array; if (separator !== ",") return fail(); }
    }
    for (const [literal, result] of [["true", true], ["false", false], ["null", null]] as const) if (source.startsWith(literal, offset)) { offset += literal.length; return result; }
    const match = source.slice(offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) return fail(); offset += match[0].length; return new DecimalToken(match[0]);
  };
  const parsed = value(0); space(); if (offset !== source.length) return fail(); return parsed;
}
export type SmokeDecimal = Readonly<{ coefficient: string; scale: number; decimal: string }>;
function decimal(input: unknown, numeric: boolean): SmokeDecimal {
  const text = numeric && input instanceof DecimalToken ? input.text : !numeric && typeof input === "string" ? input : "";
  // Explicit local parser bound, including exact exponent expansion. Never round.
  if (text.length > 128) return smokeError("DECIMAL_INVALID");
  const match = text.match(/^(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/);
  if (!match) return smokeError("DECIMAL_INVALID");
  const fraction = match[2] ?? "", exponent = match[3] ? Number(match[3]) : 0;
  let coefficient = `${match[1]}${fraction}`.replace(/^0+(?=\d)/, ""), scale = fraction.length - exponent;
  if (Math.abs(scale) > 128 || coefficient.length > 128) return smokeError("DECIMAL_INVALID");
  if (scale < 0) { coefficient += "0".repeat(-scale); scale = 0; }
  if (coefficient.length > 128) return smokeError("DECIMAL_INVALID");
  if (BigInt(coefficient) === 0n) { coefficient = "0"; scale = 0; }
  while (scale > 0 && coefficient.endsWith("0")) { coefficient = coefficient.slice(0, -1) || "0"; scale--; }
  const padded = coefficient.padStart(scale + 1, "0");
  return smokeFreeze({ coefficient, scale, decimal: scale ? `${padded.slice(0, -scale)}.${padded.slice(-scale)}` : coefficient });
}
function compare(left: SmokeDecimal, right: SmokeDecimal): number {
  const scale = Math.max(left.scale, right.scale);
  const l = BigInt(left.coefficient) * 10n ** BigInt(scale - left.scale), r = BigInt(right.coefficient) * 10n ** BigInt(scale - right.scale);
  return l < r ? -1 : l > r ? 1 : 0;
}
const PRODUCT_FIELDS = ["id", "base_currency", "quote_currency", "display_name", "status", "status_message", "quote_increment", "base_increment", "min_market_funds", "margin_enabled", "post_only", "limit_only", "cancel_only", "auction_mode", "trading_disabled", "fx_stablecoin", "max_slippage_percentage", "high_bid_limit_percentage"];
const AVAILABILITY = ["margin_enabled", "post_only", "limit_only", "cancel_only", "auction_mode", "trading_disabled", "fx_stablecoin"];
const STATS_FIELDS = ["open", "high", "low", "last", "volume", "volume_30day", "rfq_volume_24hour", "conversions_volume_24hour", "rfq_volume_30day", "conversions_volume_30day"];
export function parseCoinbaseSmokeResponse(input: unknown) {
  const root = smokeRecord(input, ["request", "body", "receivedAt", "evaluationAt"]);
  const request = validateCoinbaseSmokeRequest(root.request);
  const bytes = smokeByteSnapshot(root.body, COINBASE_SMOKE_LIMITS.maximumResponseBytes, "BODY_INVALID");
  if (bytes.byteLength === 0) return smokeError("BODY_INVALID");
  const receivedAt = smokeTime(root.receivedAt), evaluationAt = smokeTime(root.evaluationAt);
  if (receivedAt > evaluationAt) return smokeError("RECEIPT_INVALID");
  const parsed = losslessJson(bytes);
  const payloadFingerprint = createHash("sha256").update(bytes).digest("hex");
  const product = { id: "ETH-USD", baseCurrency: "ETH", quoteCurrency: "USD", displayName: "ETH/USD", status: "" };
  const availability: Record<string, boolean> = {};
  const candles: { bucketStart: string; low: SmokeDecimal; high: SmokeDecimal; open: SmokeDecimal; close: SmokeDecimal; volume: SmokeDecimal }[] = [];
  const statsFieldsPresent: string[] = [];
  const capabilities: string[] = [];
  let providerCandleCount = 0, excludedBeforeStart = 0, excludedAtOrAfterEnd = 0;
  if (request.profile === "PRODUCT_IDENTITY") {
    const row = smokeRecord(parsed, PRODUCT_FIELDS, ["id", "base_currency", "quote_currency", "display_name", "status"]);
    if (row.id !== "ETH-USD" || row.base_currency !== "ETH" || row.quote_currency !== "USD" || row.display_name !== "ETH/USD" || !["online", "offline", "internal", "delisted"].includes(row.status as string)) return smokeError("PRODUCT_IDENTITY_MISMATCH");
    product.status = row.status as string;
    for (const field of AVAILABILITY) if (Object.hasOwn(row, field)) { if (typeof row[field] !== "boolean") return smokeError("PRODUCT_INVALID"); availability[field] = row[field] as boolean; }
    for (const field of ["quote_increment", "base_increment", "min_market_funds", "max_slippage_percentage", "high_bid_limit_percentage"]) if (Object.hasOwn(row, field)) decimal(row[field], false);
    if (Object.hasOwn(row, "status_message") && (typeof row.status_message !== "string" || row.status_message.length > 256)) return smokeError("PRODUCT_INVALID");
    capabilities.push("PRODUCT_IDENTITY_FIELDS", "PRODUCT_STATUS_FIELDS");
  } else if (request.profile === "DAILY_CANDLES") {
    if (!Array.isArray(parsed)) return smokeError("CANDLE_INVALID");
    if (parsed.length > COINBASE_SMOKE_LIMITS.maximumProviderCandles) return smokeError("PROVIDER_CANDLE_LIMIT_EXCEEDED");
    const rows = smokeArray(parsed, COINBASE_SMOKE_LIMITS.maximumProviderCandles), start = request.query[2]!.value, end = request.query[0]!.value;
    providerCandleCount = rows.length;
    const expected = (Date.parse(end) - Date.parse(start)) / 86_400_000;
    let previous: bigint | undefined, direction = 0;
    for (const raw of rows) {
      const row = smokeArray(raw);
      if (row.length !== 6 || !(row[0] instanceof DecimalToken) || !/^(0|[1-9]\d*)$/.test(row[0].text)) return smokeError("CANDLE_INVALID");
      const seconds = BigInt(row[0].text);
      if (seconds > 253402300799n) return smokeError("CANDLE_TIMESTAMP_INVALID");
      if (previous !== undefined) {
        const nextDirection = seconds > previous ? 1 : seconds < previous ? -1 : 0;
        if (!nextDirection || (direction && nextDirection !== direction) || (seconds > previous ? seconds - previous : previous - seconds) < 86400n) return smokeError("CANDLE_ORDER_INVALID");
        direction = nextDirection;
      }
      previous = seconds;
      const [low, high, open, close, volume] = row.slice(1).map(value => decimal(value, true));
      if (BigInt(low!.coefficient) === 0n || compare(low!, high!) > 0 || compare(open!, low!) < 0 || compare(open!, high!) > 0 || compare(close!, low!) < 0 || compare(close!, high!) > 0) return smokeError("CANDLE_OHLC_INVALID");
      if (seconds * 1000n < BigInt(Date.parse(start))) { excludedBeforeStart++; continue; }
      if (seconds * 1000n >= BigInt(Date.parse(end))) { excludedAtOrAfterEnd++; continue; }
      if (candles.length >= expected || candles.length >= COINBASE_SMOKE_LIMITS.maximumDailyBuckets) return smokeError("CANDLE_SELECTION_BUDGET_EXCEEDED");
      // This is the observed bucket start, not a qualified UTC-close or provider publication time.
      candles.push({ bucketStart: new Date(Number(seconds * 1000n)).toISOString(), low: low!, high: high!, open: open!, close: close!, volume: volume! });
    }
    candles.sort((a, b) => a.bucketStart < b.bucketStart ? -1 : a.bucketStart > b.bucketStart ? 1 : 0);
    if (candles.length) capabilities.push("DAILY_CANDLE_FIELDS", "CLOSE_FIELD_PRESENCE", "CANDLE_VOLUME_FIELD_PRESENCE");
  } else {
    const row = smokeRecord(parsed, STATS_FIELDS, ["open", "high", "low", "last", "volume"]);
    for (const field of STATS_FIELDS) if (Object.hasOwn(row, field)) { decimal(row[field], false); statsFieldsPresent.push(field); }
    capabilities.push("STATS_FIELD_PRESENCE");
  }
  const observation = { authorityStatus: COINBASE_SMOKE_STATUS, scope: COINBASE_SMOKE_SCOPE, endpointProfile: request.profile, requestCount: 1, responseByteLength: bytes.byteLength, receivedAt, evaluationAt, providerTimestamp: null, parserContractVersion: COINBASE_SMOKE_PARSER_VERSION, payloadFingerprint, product: request.profile === "PRODUCT_IDENTITY" ? { ...product, availability } : null, candles, candleCount: candles.length, providerCandleCount, excludedBeforeStart, excludedAtOrAfterEnd, statsFieldsPresent, capabilityObservations: capabilities.map(capability => ({ capability, outcome: "OBSERVED_FIELD_ONLY" })) };
  return smokeFreeze({ ...observation, observationFingerprint: smokeSha256({ ...observation, request }) });
}
