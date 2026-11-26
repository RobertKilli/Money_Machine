import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";
import { parseKrakenPostTradeResponse } from "@/application/paper-trading/kraken-post-trade-parser";
import {
  createKrakenPostTradeEvidencePackage,
  readKrakenPostTradeEvidencePackage,
  serializeKrakenPostTradeEvidencePackage,
  verifyKrakenPostTradeEvidencePackage,
  type KrakenPostTradeEvidencePackage,
} from "@/application/paper-trading/external-paper-price-evidence-package";

const instrument = {
  instrumentId: "paper.external.eth-usd-kraken",
  baseAssetId: "ETH",
  quoteCurrency: "USD",
  venueId: "PGSL",
  venueProductId: "ETH/USD",
} as const;
const source = { providerId: "kraken", datasetVersion: "post-trade/v1", adapterVersion: "offline-parser/v1" } as const;
const trade = (overrides: Record<string, unknown> = {}) => ({
  trade_id: "trade-001", symbol: "ETH/USD", base_asset: "ETH", quote_asset: "USD", trade_venue: "PGSL", publication_venue: "PGSL",
  price: "2043.123456789000", quantity: "0.01250000", trade_ts: "2026-11-26T12:34:56.123456789Z",
  publication_ts: "2026-11-26T12:34:56.123999999Z", ...overrides,
});
const response = (trades: readonly unknown[]) => JSON.stringify({ error: [], result: {
  count: trades.length,
  last_ts: trades.length ? (trades.at(-1) as { trade_ts: string }).trade_ts : "2026-11-26T12:34:56Z",
  trades,
} });
const parse = (rawResponse: string) => parseKrakenPostTradeResponse({
  rawResponse, retrievedAt: "2026-11-26T12:34:56.124000001Z",
  expected: { symbol: "ETH/USD", baseAsset: "ETH", quoteAsset: "USD", tradeVenueMic: "PGSL", publicationVenueMic: "PGSL" },
});
const make = () => {
  const parsed = parse(response([trade()]));
  return createKrakenPostTradeEvidencePackage({ parsed, instrument, source, tradeId: "trade-001" });
};

describe("offline external PAPER price evidence package", () => {
  it("roundtrips exact price and original/normalized timestamps without source trust or decision readiness", () => {
    const created = make();
    expect(created.status).toBe("VALID");
    if (created.status !== "VALID") throw new Error(created.reason);
    const serialized = serializeKrakenPostTradeEvidencePackage(created.evidence);
    const replay = readKrakenPostTradeEvidencePackage(serialized, created.evidence.fingerprint);
    expect(replay).toEqual(created);
    expect(replay).toMatchObject({ status: "VALID", evidence: {
      origin: "CALLER_SUPPLIED_UNVERIFIED", sourceApproval: "NOT_APPROVED",
      decisionReadiness: "BLOCKED_UNCLASSIFIED_PRICE_TYPE", priceType: "UNCLASSIFIED_POST_TRADE",
      selectedTrade: {
        price: { original: "2043.123456789000", coefficient: "2043123456789000", scale: 12 },
        timestamps: {
          observedAtOriginal: "2026-11-26T12:34:56.123456789Z", observedAt: "2026-11-26T12:34:56.123Z",
          availableAtOriginal: "2026-11-26T12:34:56.123999999Z", availableAt: "2026-11-26T12:34:56.124Z",
          retrievedAtOriginal: "2026-11-26T12:34:56.124000001Z", retrievedAt: "2026-11-26T12:34:56.125Z",
        },
      },
    } });
    if (replay.status !== "VALID") throw new Error(replay.reason);
    expect(serializeKrakenPostTradeEvidencePackage(replay.evidence)).toBe(serialized);
  });

  it.each([
    ["price", (p: KrakenPostTradeEvidencePackage) => ({ ...p, selectedTrade: { ...p.selectedTrade, price: { ...p.selectedTrade.price, original: "2044.00" } } })],
    ["identity", (p: KrakenPostTradeEvidencePackage) => ({ ...p, instrument: { ...p.instrument, venueProductId: "ETH/EUR" } })],
    ["timestamp", (p: KrakenPostTradeEvidencePackage) => ({ ...p, selectedTrade: { ...p.selectedTrade, timestamps: { ...p.selectedTrade.timestamps, availableAtOriginal: "2026-11-26T12:34:56.120Z" } } })],
  ] as const)("rejects replay after %s mutation", (_name, mutate) => {
    const created = make();
    if (created.status !== "VALID") throw new Error(created.reason);
    expect(verifyKrakenPostTradeEvidencePackage(mutate(created.evidence))).toMatchObject({ status: "INVALID" });
  });

  it("rejects an invalid fingerprint and a conflicting previously observed replay fingerprint", () => {
    const created = make();
    if (created.status !== "VALID") throw new Error(created.reason);
    expect(verifyKrakenPostTradeEvidencePackage({ ...created.evidence, fingerprint: "0".repeat(64) }))
      .toEqual({ status: "INVALID", reason: "FINGERPRINT_MISMATCH" });
    expect(readKrakenPostTradeEvidencePackage(serializeKrakenPostTradeEvidencePackage(created.evidence), "f".repeat(64)))
      .toEqual({ status: "INVALID", reason: "FINGERPRINT_MISMATCH" });
  });

  it("binds selected material to the raw parse and requires a caller-named trade, never the response's final element", () => {
    const raw = response([
      trade({ trade_id: "first", trade_ts: "2026-11-26T12:34:56.100000000Z", publication_ts: "2026-11-26T12:34:56.101000000Z" }),
      trade({ trade_id: "second", trade_ts: "2026-11-26T12:34:56.110000000Z", publication_ts: "2026-11-26T12:34:56.111000000Z" }),
    ]);
    const parsed = parse(raw);
    expect(createKrakenPostTradeEvidencePackage({ parsed, instrument, source, tradeId: "first" })).toMatchObject({
      status: "VALID", evidence: { selectedTrade: { tradeId: "first" }, priceType: "UNCLASSIFIED_POST_TRADE" },
    });
    expect(createKrakenPostTradeEvidencePackage({ parsed, instrument, source, tradeId: "missing" }))
      .toEqual({ status: "INVALID", reason: "TRADE_NOT_FOUND" });
    const created = createKrakenPostTradeEvidencePackage({ parsed, instrument, source, tradeId: "first" });
    if (created.status !== "VALID") throw new Error(created.reason);
    const forged = { ...created.evidence, selectedTrade: { ...created.evidence.selectedTrade, price: { ...created.evidence.selectedTrade.price, original: "2044" } } };
    const material = { ...forged } as Record<string, unknown> & { fingerprint?: string };
    delete material.fingerprint;
    const recomputed = { ...forged, fingerprint: canonicalSha256(material) };
    expect(verifyKrakenPostTradeEvidencePackage(recomputed)).toMatchObject({ status: "INVALID" });
  });

  it("keeps parser failures invalid and empty payloads from becoming price evidence", () => {
    const bad = parse("{\"error\":[\"EGeneral:Temporary lockout\"],\"result\":{\"count\":0,\"last_ts\":\"2026-11-26T12:34:56Z\",\"trades\":[]}} ");
    expect(createKrakenPostTradeEvidencePackage({ parsed: bad, instrument, source, tradeId: "trade-001" }))
      .toEqual({ status: "INVALID", reason: "PARSE_INVALID" });
    const empty = parse(response([]));
    expect(createKrakenPostTradeEvidencePackage({ parsed: empty, instrument, source, tradeId: "trade-001" }))
      .toEqual({ status: "INVALID", reason: "TRADE_NOT_FOUND" });
  });
});
