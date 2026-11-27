import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES, parseKrakenPreTradeResponse,
  type KrakenPreTradeExpectedInstrument,
} from "@/application/paper-trading/kraken-pre-trade-parser";

// Synthetic identities, levels and times only. These do not qualify a real pair.
const expected: KrakenPreTradeExpectedInstrument = {
  symbol: "ETH/USD", baseAsset: "ETH", quoteAsset: "USD", venueMic: "PGSL",
};
const retrievedAt = "2026-11-27T12:34:56.124000001Z";
const level = (side: "BUY" | "SELL", overrides: Record<string, unknown> = {}) => ({
  side, price: "2043.12345678901234567890", qty: "0.01250000", count: 2,
  submission_ts: "2026-11-27T12:34:56.123456789Z",
  publication_ts: "2026-11-27T12:34:56.123999999Z", ...overrides,
});
const book = (overrides: Record<string, unknown> = {}) => ({
  symbol: "ETH/USD", base_asset: "ETH", quote_asset: "USD", venue: "PGSL",
  system: "CLOB", base_notation: "UNIT", quote_notation: "MONE",
  bids: [level("BUY")], asks: [level("SELL", { price: "2044.000" })], ...overrides,
});
const parseRaw = (rawResponse: string, receipt = retrievedAt) =>
  parseKrakenPreTradeResponse({ rawResponse, retrievedAt: receipt, expected });
const parse = (overrides: Record<string, unknown> = {}) =>
  parseRaw(JSON.stringify({ error: [], result: book(overrides) }));

describe("offline Kraken Pre-Trade parser", () => {
  it("preserves exact decimals, original times and raw-text fingerprint without deciding a price", () => {
    const rawResponse = JSON.stringify({ error: [], result: book({ description: "synthetic metadata" }) });
    const result = parseRaw(rawResponse);
    expect(result.status).toBe("VALID");
    if (result.status !== "VALID") throw new Error(result.reason);
    expect(result).toMatchObject({
      parserVersion: "kraken-pre-trade-parser/v1", instrument: expected,
      system: "CLOB", baseNotation: "UNIT", quoteNotation: "MONE",
      sourceOrigin: "CALLER_SUPPLIED_UNVERIFIED", sourceApproval: "NOT_APPROVED",
      snapshotSemantics: "UNVERIFIED", decisionReadiness: "BLOCKED_UNVERIFIED_QUOTE_SEMANTICS",
      retrievedAtOriginal: retrievedAt, retrievedAtCeil: "2026-11-27T12:34:56.125Z", rawResponse,
      payloadFingerprint: createHash("sha256").update(rawResponse, "utf8").digest("hex"),
    });
    expect(result.bids[0]).toEqual({
      responseIndex: 0, side: "BUY", orderCount: 2,
      price: { original: "2043.12345678901234567890", coefficient: "204312345678901234567890", scale: 20 },
      quantity: { original: "0.01250000", coefficient: "1250000", scale: 8 },
      submissionTsOriginal: "2026-11-27T12:34:56.123456789Z",
      publicationTsOriginal: "2026-11-27T12:34:56.123999999Z",
      submissionAtFloor: "2026-11-27T12:34:56.123Z", publicationAtCeil: "2026-11-27T12:34:56.124Z",
    });
    for (const key of ["bestBid", "bestAsk", "kind", "observedAt", "availableAt", "decisionPrice"]) {
      expect(result).not.toHaveProperty(key);
      expect(result.bids[0]).not.toHaveProperty(key);
    }
  });

  it("preserves supplied order, duplicate levels and crossed prices without selecting or asserting a snapshot", () => {
    const result = parse({ bids: [level("BUY", { price: "3000" }), level("BUY", { price: "4000" }), level("BUY", { price: "3000" })] });
    if (result.status !== "VALID") throw new Error(result.reason);
    expect(result.bids.map(item => [item.responseIndex, item.price.original])).toEqual([[0, "3000"], [1, "4000"], [2, "3000"]]);
    expect(result.snapshotSemantics).toBe("UNVERIFIED");
  });

  it.each([{ bids: [], asks: [] }, { bids: [] }, { asks: [] }])("accepts empty sides as evidence, never a manufactured quote (%j)", overrides => {
    expect(parse(overrides)).toMatchObject({ status: "VALID", ...overrides, decisionReadiness: "BLOCKED_UNVERIFIED_QUOTE_SEMANTICS" });
  });

  it("returns independent deeply frozen data and stable fingerprints for replay", () => {
    const binding = { ...expected };
    const rawResponse = JSON.stringify({ error: [], result: book() });
    const input = { rawResponse, retrievedAt, expected: binding };
    const result = parseKrakenPreTradeResponse(input);
    if (result.status !== "VALID") throw new Error(result.reason);
    binding.quoteAsset = "NOK";
    input.rawResponse = "{}";
    expect(result.instrument.quoteAsset).toBe("USD");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.instrument)).toBe(true);
    expect(Object.isFrozen(result.bids)).toBe(true);
    expect(Object.isFrozen(result.asks)).toBe(true);
    expect(Object.isFrozen(result.bids[0])).toBe(true);
    expect(Object.isFrozen(result.bids[0].price)).toBe(true);
    expect(Object.isFrozen(result.bids[0].quantity)).toBe(true);
    expect(parseRaw(rawResponse)).toEqual(result);
    const changed = parseRaw(rawResponse.replace("2044.000", "2045.000"));
    expect(changed.status === "VALID" && changed.payloadFingerprint).not.toBe(result.payloadFingerprint);
  });

  it.each([
    [{ symbol: "BTC/USD" }, "IDENTITY_MISMATCH"], [{ base_asset: "WETH" }, "IDENTITY_MISMATCH"],
    [{ quote_asset: "NOK" }, "IDENTITY_MISMATCH"], [{ venue: "XXXX" }, "VENUE_MISMATCH"],
    [{ symbol: undefined }, "IDENTITY_MISMATCH"], [{ system: "OTHER" }, "SHAPE_INVALID"],
    [{ base_notation: "MONE" }, "SHAPE_INVALID"], [{ quote_notation: "UNIT" }, "SHAPE_INVALID"],
    [{ bids: null }, "SHAPE_INVALID"], [{ asks: {} }, "SHAPE_INVALID"],
  ] as const)("rejects identity, system and envelope conflicts (%j)", (overrides, reason) => {
    expect(parse(overrides)).toEqual({ status: "INVALID", reason });
  });

  it.each(["bids", "asks"] as const)("enforces a local ten-level bound on %s", side => {
    const entry = level(side === "bids" ? "BUY" : "SELL");
    expect(parse({ [side]: Array.from({ length: 10 }, () => entry) }).status).toBe("VALID");
    expect(parse({ [side]: Array.from({ length: 11 }, () => entry) })).toEqual({ status: "INVALID", reason: "LEVEL_LIMIT_EXCEEDED" });
  });

  it.each([
    { price: "0" }, { price: "-1" }, { price: "1e3" }, { price: "01.2" }, { price: 2.3 },
    { price: ".2" }, { price: "2." }, { price: " 2" }, { price: "9".repeat(65) },
    { qty: "0" }, { qty: "-1" }, { qty: 1 }, { qty: "0.1e2" },
    { count: 0 }, { count: -1 }, { count: 1.5 }, { count: "2" }, { count: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects malformed/non-positive decimal or count (%j)", overrides => {
    expect(parse({ bids: [level("BUY", overrides)] })).toEqual({ status: "INVALID", reason: "LEVEL_INVALID" });
  });

  it.each([null, [], "BUY"])("rejects malformed levels (%j)", value => {
    expect(parse({ asks: [value] })).toEqual({ status: "INVALID", reason: "LEVEL_INVALID" });
  });

  it.each([{ bids: [level("SELL")] }, { asks: [level("BUY")] }, { bids: [level("BUY", { side: "BID" })] }])("rejects misplaced or unknown sides (%j)", overrides => {
    expect(parse(overrides)).toEqual({ status: "INVALID", reason: "SIDE_MISMATCH" });
  });

  it.each([
    "2026-02-30T12:34:56Z", "2026-11-27T25:00:00Z", "2026-11-27T12:34:56+00:00",
    "2026-11-27T12:34:56.1234567891Z", "0000-01-01T00:00:00Z", "invalid",
  ])("rejects invalid original times (%s)", submission_ts => {
    expect(parse({ bids: [level("BUY", { submission_ts })] })).toEqual({ status: "INVALID", reason: "TIME_INVALID" });
  });

  it("checks original nanosecond order before rounding in the same millisecond", () => {
    const reversed = level("BUY", { submission_ts: "2026-11-27T12:34:56.123900001Z", publication_ts: "2026-11-27T12:34:56.123900000Z" });
    expect(parse({ bids: [reversed] })).toEqual({ status: "INVALID", reason: "TIME_ORDER_INVALID" });
    expect(parseRaw(JSON.stringify({ error: [], result: book() }), "2026-11-27T12:34:56.123999998Z"))
      .toEqual({ status: "INVALID", reason: "TIME_ORDER_INVALID" });
  });

  it("handles leap dates, pre-epoch flooring and sub-ms day rollover exactly", () => {
    const times = level("BUY", { submission_ts: "1969-12-31T23:59:59.999000001Z", publication_ts: "1969-12-31T23:59:59.999999999Z" });
    const result = parseRaw(JSON.stringify({ error: [], result: book({ bids: [times], asks: [] }) }), "1970-01-01T00:00:00Z");
    expect(result).toMatchObject({ status: "VALID", bids: [{ submissionAtFloor: "1969-12-31T23:59:59.999Z", publicationAtCeil: "1970-01-01T00:00:00.000Z" }] });
    const leap = level("SELL", { submission_ts: "2024-02-29T23:59:59.999999999Z", publication_ts: "2024-02-29T23:59:59.999999999Z" });
    expect(parse({ bids: [], asks: [leap] })).toMatchObject({ status: "VALID", asks: [{ publicationAtCeil: "2024-03-01T00:00:00.000Z" }] });
  });

  it("does not treat old timestamps as a fresh or decision-ready quote", () => {
    const old = level("BUY", { submission_ts: "2020-01-01T00:00:00Z", publication_ts: "2020-01-01T00:00:00Z" });
    expect(parse({ bids: [old], asks: [] })).toMatchObject({ status: "VALID", decisionReadiness: "BLOCKED_UNVERIFIED_QUOTE_SEMANTICS" });
  });

  it("bounds UTF-8 bytes, including non-ASCII metadata, at the exact response limit", () => {
    const minimal = JSON.stringify({ error: [], result: book(), note: "" });
    const raw = minimal.slice(0, -2) + "a".repeat(KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES - Buffer.byteLength(minimal)) + minimal.slice(-2);
    expect(Buffer.byteLength(raw)).toBe(KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES);
    expect(parseRaw(raw).status).toBe("VALID");
    expect(parseRaw(raw + " ")).toEqual({ status: "INVALID", reason: "PAYLOAD_TOO_LARGE" });
    const multiByte = JSON.stringify({ error: [], result: book(), note: "ø".repeat(33_000) });
    expect(multiByte.length).toBeLessThan(KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES);
    expect(parseRaw(multiByte)).toEqual({ status: "INVALID", reason: "PAYLOAD_TOO_LARGE" });
  });

  it.each([
    ["{", "JSON_INVALID"], ["null", "SHAPE_INVALID"], ["[]", "SHAPE_INVALID"],
    [JSON.stringify({ error: [7], result: book() }), "SHAPE_INVALID"],
    [JSON.stringify({ error: ["PRIVATE_PROVIDER_ERROR"] }), "PROVIDER_ERROR"],
    [JSON.stringify({ error: [], result: [book()] }), "SHAPE_INVALID"],
    [JSON.stringify({ result: book() }), "SHAPE_INVALID"],
  ])("returns fixed diagnostics without payload text (%s)", (raw, reason) => {
    expect(parseRaw(raw)).toEqual({ status: "INVALID", reason });
  });

  it("rejects invalid retrieval and expected binding without throwing", () => {
    expect(parseRaw(JSON.stringify({ error: [], result: book() }), "invalid")).toEqual({ status: "INVALID", reason: "TIME_INVALID" });
    expect(parseKrakenPreTradeResponse({ rawResponse: "{}", retrievedAt, expected: { ...expected, symbol: " ETH/USD" } }))
      .toEqual({ status: "INVALID", reason: "INPUT_INVALID" });
    expect(parseKrakenPreTradeResponse(null as never)).toEqual({ status: "INVALID", reason: "INPUT_INVALID" });
  });
});
