import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { parseKrakenPostTradeResponse, type KrakenPostTradeExpectedInstrument } from "@/application/paper-trading/kraken-post-trade-parser";

const expected = {
  symbol: "ETH/USD",
  baseAsset: "ETH",
  quoteAsset: "USD",
  tradeVenueMic: "PGSL",
  publicationVenueMic: "PGSL",
} as const satisfies KrakenPostTradeExpectedInstrument;

const trade = (overrides: Record<string, unknown> = {}) => ({
  trade_id: "TGBB7L-HT5LX-J3BZ4A",
  symbol: "ETH/USD",
  base_asset: "ETH",
  quote_asset: "USD",
  trade_venue: "PGSL",
  publication_venue: "PGSL",
  price: "2043.123456789",
  quantity: "0.01250000",
  trade_ts: "2026-11-26T12:34:56.123456789Z",
  publication_ts: "2026-11-26T12:34:56.123999999Z",
  ...overrides,
});

const response = (trades: readonly unknown[], error: readonly unknown[] = []) => JSON.stringify({
  error,
  result: {
    count: trades.length,
    last_ts: trades.length > 0 ? (trades[trades.length - 1] as { trade_ts: string }).trade_ts : "2026-11-26T12:34:56.000000000Z",
    trades,
  },
});

const parse = (trades: readonly unknown[], retrievedAt = "2026-11-26T12:34:56.124000001Z") => parseKrakenPostTradeResponse({
  rawResponse: response(trades),
  retrievedAt,
  expected,
});

describe("offline Kraken Spot Post-Trade response parser", () => {
  it("preserves exact source material and decimal/timestamp precision with conservative millisecond normalization", () => {
    const rawResponse = response([trade()]);
    const parsed = parseKrakenPostTradeResponse({ rawResponse, retrievedAt: "2026-11-26T12:34:56.124000001Z", expected });
    expect(parsed.status).toBe("VALID");
    if (parsed.status !== "VALID") throw new Error(parsed.reason);
    expect(parsed.rawResponse).toBe(rawResponse);
    expect(parsed.payloadFingerprint).toBe(createHash("sha256").update(rawResponse, "utf8").digest("hex"));
    expect(parsed.trades).toHaveLength(1);
    expect(parsed.trades[0]).toMatchObject({
      tradeId: "TGBB7L-HT5LX-J3BZ4A",
      price: { original: "2043.123456789", coefficient: "2043123456789", scale: 9 },
      quantity: { original: "0.01250000", coefficient: "1250000", scale: 8 },
      tradeTsOriginal: "2026-11-26T12:34:56.123456789Z",
      publicationTsOriginal: "2026-11-26T12:34:56.123999999Z",
      observedAt: "2026-11-26T12:34:56.123Z",
      availableAt: "2026-11-26T12:34:56.124Z",
    });
    expect(parsed).toMatchObject({
      retrievedAtOriginal: "2026-11-26T12:34:56.124000001Z",
      retrievedAt: "2026-11-26T12:34:56.125Z",
      lastTsOriginal: "2026-11-26T12:34:56.123456789Z",
    });
    expect(parsed.trades[0]).not.toHaveProperty("kind");
    expect(parsed.trades[0]).not.toHaveProperty("latest");
  });

  it("uses exact source ordering before flooring/ceiling values inside the same millisecond", () => {
    const valid = parse([trade({
      trade_ts: "2026-11-26T12:34:56.123000000Z",
      publication_ts: "2026-11-26T12:34:56.123000001Z",
    })], "2026-11-26T12:34:56.123999999Z");
    expect(valid).toMatchObject({ status: "VALID", trades: [{ observedAt: "2026-11-26T12:34:56.123Z", availableAt: "2026-11-26T12:34:56.124Z" }], retrievedAt: "2026-11-26T12:34:56.124Z" });

    const reversedWithinMillisecond = parse([trade({
      trade_ts: "2026-11-26T12:34:56.123900000Z",
      publication_ts: "2026-11-26T12:34:56.123800000Z",
    })]);
    expect(reversedWithinMillisecond).toMatchObject({ status: "INVALID", reason: "TIME_ORDER_INVALID" });
  });

  it.each([
    [{ symbol: "BTC/USD" }, "IDENTITY_MISMATCH"],
    [{ base_asset: "WETH" }, "IDENTITY_MISMATCH"],
    [{ quote_asset: "EUR" }, "IDENTITY_MISMATCH"],
    [{ trade_venue: "XXXX" }, "VENUE_MISMATCH"],
    [{ publication_venue: "XXXX" }, "VENUE_MISMATCH"],
    [{ trade_id: "" }, "TRADE_INVALID"],
    [{ trade_id: "12345678901234567890" }, "TRADE_INVALID"],
    [{ price: "0" }, "TRADE_INVALID"],
    [{ price: "-1.25" }, "TRADE_INVALID"],
    [{ price: "1e3" }, "TRADE_INVALID"],
    [{ price: "01.25" }, "TRADE_INVALID"],
    [{ quantity: "0" }, "TRADE_INVALID"],
    [{ trade_ts: "2026-11-26T12:34:56.123456789+00:00" }, "TIME_INVALID"],
    [{ trade_ts: "2026-02-30T12:34:56.123456789Z" }, "TIME_INVALID"],
  ] as const)("rejects malformed or mismatched trade fields (%j)", (override, reason) => {
    expect(parse([trade(override)])).toMatchObject({ status: "INVALID", reason });
  });

  it("rejects a trade whose publication or retrieval time precedes the trade at original precision", () => {
    expect(parse([trade({
      trade_ts: "2026-11-26T12:34:56.123900000Z",
      publication_ts: "2026-11-26T12:34:56.124000000Z",
    })], "2026-11-26T12:34:56.123999999Z")).toMatchObject({ status: "INVALID", reason: "TIME_ORDER_INVALID" });
  });

  it("returns an empty validated response without manufacturing a price", () => {
    const parsed = parse([]);
    expect(parsed).toMatchObject({ status: "VALID", returnedCount: 0, trades: [] });
    if (parsed.status !== "VALID") throw new Error(parsed.reason);
    expect(parsed.trades).toHaveLength(0);
  });

  it("rejects provider errors, malformed JSON, and inconsistent response counts", () => {
    expect(parseKrakenPostTradeResponse({ rawResponse: response([trade()], ["EGeneral:Temporary lockout"]), retrievedAt: "2026-11-26T12:34:56.124Z", expected }))
      .toMatchObject({ status: "INVALID", reason: "PROVIDER_ERROR" });
    expect(parseKrakenPostTradeResponse({ rawResponse: "{", retrievedAt: "2026-11-26T12:34:56.124Z", expected }))
      .toMatchObject({ status: "INVALID", reason: "JSON_INVALID" });
    expect(parseKrakenPostTradeResponse({ rawResponse: JSON.stringify({ error: [], result: { count: 2, last_ts: "2026-11-26T12:34:56.123456789Z", trades: [trade()] } }), retrievedAt: "2026-11-26T12:34:56.124Z", expected }))
      .toMatchObject({ status: "INVALID", reason: "COUNT_MISMATCH" });
  });

  it("rejects unsorted trades and a last_ts that does not match the last returned item", () => {
    const first = trade({ trade_id: "trade-1", trade_ts: "2026-11-26T12:34:56.100000000Z", publication_ts: "2026-11-26T12:34:56.101000000Z" });
    const second = trade({ trade_id: "trade-2", trade_ts: "2026-11-26T12:34:56.090000000Z", publication_ts: "2026-11-26T12:34:56.091000000Z" });
    expect(parse([first, second])).toMatchObject({ status: "INVALID", reason: "TRADE_ORDER_INVALID" });
    expect(parseKrakenPostTradeResponse({ rawResponse: JSON.stringify({ error: [], result: { count: 1, last_ts: "2026-11-26T12:34:56.120000000Z", trades: [trade()] } }), retrievedAt: "2026-11-26T12:34:56.124Z", expected }))
      .toMatchObject({ status: "INVALID", reason: "LAST_TS_MISMATCH" });
  });
});
