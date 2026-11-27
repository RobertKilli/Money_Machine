import { createHash } from "node:crypto";
import { normalizeTimestamp, parsePositiveDecimal, parseTimestamp } from "./kraken-exact-values";

export const KRAKEN_PRE_TRADE_PARSER_VERSION = "kraken-pre-trade-parser/v1" as const;
// Local parser limits, not a claim about API access rights or transport behavior.
export const KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES = 65_536;
export const KRAKEN_PRE_TRADE_MAX_LEVELS_PER_SIDE = 10;

export interface KrakenPreTradeExpectedInstrument {
  readonly symbol: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly venueMic: string;
}

interface ExactDecimalEvidence {
  readonly original: string;
  readonly coefficient: string;
  readonly scale: number;
}

export interface ParsedKrakenPreTradeLevel {
  readonly side: "BUY" | "SELL";
  readonly responseIndex: number;
  readonly price: ExactDecimalEvidence;
  readonly quantity: ExactDecimalEvidence;
  readonly orderCount: number;
  readonly submissionTsOriginal: string;
  readonly publicationTsOriginal: string;
  // Deliberately not observedAt/availableAt: their economic mapping is unresolved.
  readonly submissionAtFloor: string;
  readonly publicationAtCeil: string;
}

type InvalidReason = "INPUT_INVALID" | "PAYLOAD_TOO_LARGE" | "JSON_INVALID" |
  "SHAPE_INVALID" | "PROVIDER_ERROR" | "IDENTITY_MISMATCH" | "VENUE_MISMATCH" |
  "LEVEL_LIMIT_EXCEEDED" | "LEVEL_INVALID" | "SIDE_MISMATCH" | "TIME_INVALID" | "TIME_ORDER_INVALID";

export type KrakenPreTradeParseResult =
  | Readonly<{
    status: "VALID";
    parserVersion: typeof KRAKEN_PRE_TRADE_PARSER_VERSION;
    instrument: Readonly<KrakenPreTradeExpectedInstrument>;
    system: "CLOB";
    baseNotation: "UNIT";
    quoteNotation: "MONE";
    bids: readonly ParsedKrakenPreTradeLevel[];
    asks: readonly ParsedKrakenPreTradeLevel[];
    retrievedAtOriginal: string;
    retrievedAtCeil: string;
    rawResponse: string;
    payloadFingerprint: string;
    sourceOrigin: "CALLER_SUPPLIED_UNVERIFIED";
    sourceApproval: "NOT_APPROVED";
    snapshotSemantics: "UNVERIFIED";
    decisionReadiness: "BLOCKED_UNVERIFIED_QUOTE_SEMANTICS";
  }>
  | Readonly<{ status: "INVALID"; reason: InvalidReason }>;

const invalid = (reason: InvalidReason) => Object.freeze({ status: "INVALID" as const, reason });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const identifier = (value: unknown, limit: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= limit && /^[A-Za-z0-9/._-]+$/.test(value);

function decimalEvidence(value: NonNullable<ReturnType<typeof parsePositiveDecimal>>): ExactDecimalEvidence {
  return Object.freeze({ original: value.original, coefficient: value.coefficient.toString(), scale: value.scale });
}

function parseLevels(
  values: readonly unknown[], side: "BUY" | "SELL", retrievalTime: NonNullable<ReturnType<typeof parseTimestamp>>,
): readonly ParsedKrakenPreTradeLevel[] | Extract<KrakenPreTradeParseResult, { status: "INVALID" }> {
  if (values.length > KRAKEN_PRE_TRADE_MAX_LEVELS_PER_SIDE) return invalid("LEVEL_LIMIT_EXCEEDED");
  const levels: ParsedKrakenPreTradeLevel[] = [];
  for (const [responseIndex, value] of values.entries()) {
    if (!isRecord(value)) return invalid("LEVEL_INVALID");
    if (value.side !== side) return invalid("SIDE_MISMATCH");
    const price = parsePositiveDecimal(value.price);
    const quantity = parsePositiveDecimal(value.qty);
    if (!price || !quantity || typeof value.count !== "number" || !Number.isSafeInteger(value.count) || value.count <= 0) {
      return invalid("LEVEL_INVALID");
    }
    const submission = parseTimestamp(value.submission_ts);
    const publication = parseTimestamp(value.publication_ts);
    if (!submission || !publication) return invalid("TIME_INVALID");
    // Local acceptance restriction; no guarantee of snapshot coherence or age.
    if (submission.epochNanoseconds > publication.epochNanoseconds || publication.epochNanoseconds > retrievalTime.epochNanoseconds) {
      return invalid("TIME_ORDER_INVALID");
    }
    const submissionAtFloor = normalizeTimestamp(submission, "FLOOR");
    const publicationAtCeil = normalizeTimestamp(publication, "CEIL");
    if (!submissionAtFloor || !publicationAtCeil) return invalid("TIME_INVALID");
    levels.push(Object.freeze({
      responseIndex, side, price: decimalEvidence(price), quantity: decimalEvidence(quantity), orderCount: value.count,
      submissionTsOriginal: submission.original, publicationTsOriginal: publication.original,
      submissionAtFloor, publicationAtCeil,
    }));
  }
  return Object.freeze(levels);
}

/**
 * Offline, single-book parser for caller-supplied JSON text. It preserves array
 * order and empty sides; it does not choose best levels, assign an executable
 * BID/ASK, enforce price age, or authorize a source. No I/O is performed.
 */
export function parseKrakenPreTradeResponse(input: {
  readonly rawResponse: string;
  readonly retrievedAt: string;
  readonly expected: KrakenPreTradeExpectedInstrument;
}): KrakenPreTradeParseResult {
  if (!input || typeof input.rawResponse !== "string" || typeof input.retrievedAt !== "string" || !isRecord(input.expected) ||
    !identifier(input.expected.symbol, 32) || !identifier(input.expected.baseAsset, 64) ||
    !identifier(input.expected.quoteAsset, 64) || !identifier(input.expected.venueMic, 12)) return invalid("INPUT_INVALID");
  const { rawResponse } = input;
  if (rawResponse.length > KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES || Buffer.byteLength(rawResponse, "utf8") > KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES) {
    return invalid("PAYLOAD_TOO_LARGE");
  }
  let payload: unknown;
  try { payload = JSON.parse(rawResponse); } catch { return invalid("JSON_INVALID"); }
  if (!isRecord(payload) || !Array.isArray(payload.error) || !payload.error.every(item => typeof item === "string")) {
    return invalid("SHAPE_INVALID");
  }
  if (payload.error.length > 0) return invalid("PROVIDER_ERROR");
  const book = payload.result;
  // Multi-book/alternate shapes need a separately reviewed contract.
  if (!isRecord(book) || !Array.isArray(book.bids) || !Array.isArray(book.asks)) return invalid("SHAPE_INVALID");
  if (book.symbol !== input.expected.symbol || book.base_asset !== input.expected.baseAsset || book.quote_asset !== input.expected.quoteAsset) {
    return invalid("IDENTITY_MISMATCH");
  }
  if (book.venue !== input.expected.venueMic) return invalid("VENUE_MISMATCH");
  if (book.system !== "CLOB" || book.base_notation !== "UNIT" || book.quote_notation !== "MONE") return invalid("SHAPE_INVALID");
  const retrieval = parseTimestamp(input.retrievedAt);
  if (!retrieval) return invalid("TIME_INVALID");
  const retrievedAtCeil = normalizeTimestamp(retrieval, "CEIL");
  if (!retrievedAtCeil) return invalid("TIME_INVALID");
  const bids = parseLevels(book.bids, "BUY", retrieval);
  if ("status" in bids) return bids;
  const asks = parseLevels(book.asks, "SELL", retrieval);
  if ("status" in asks) return asks;
  return Object.freeze({
    status: "VALID", parserVersion: KRAKEN_PRE_TRADE_PARSER_VERSION,
    instrument: Object.freeze({ symbol: book.symbol as string, baseAsset: book.base_asset as string,
      quoteAsset: book.quote_asset as string, venueMic: book.venue as string }),
    system: "CLOB", baseNotation: "UNIT", quoteNotation: "MONE", bids, asks,
    retrievedAtOriginal: retrieval.original, retrievedAtCeil, rawResponse,
    payloadFingerprint: createHash("sha256").update(rawResponse, "utf8").digest("hex"),
    sourceOrigin: "CALLER_SUPPLIED_UNVERIFIED", sourceApproval: "NOT_APPROVED",
    snapshotSemantics: "UNVERIFIED", decisionReadiness: "BLOCKED_UNVERIFIED_QUOTE_SEMANTICS",
  });
}
