import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";
import { KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES } from "@/application/paper-trading/kraken-pre-trade-parser";
import {
  createKrakenPreTradeEvidencePackage, verifyKrakenPreTradeEvidencePackage,
  serializeKrakenPreTradeEvidencePackage, readKrakenPreTradeEvidencePackage,
  KRAKEN_PRE_TRADE_MAX_SERIALIZED_PACKAGE_CHARS,
} from "@/application/paper-trading/kraken-pre-trade-evidence-package";

const instrument = {
  instrumentId: "paper.external.eth-usd-kraken", baseAssetId: "ETH", quoteCurrency: "USD",
  venueId: "PGSL", venueProductId: "ETH/USD",
} as const;
const source = { providerId: "kraken", datasetVersion: "pre-trade/synthetic-v1", adapterVersion: "offline-parser/v1" };
const retrievedAt = "2026-11-27T12:34:56.124000001Z";
const level = (side: "BUY" | "SELL", price = "2043.1234567890123456789") => ({
  side, price, qty: "0.01250000", count: 2,
  submission_ts: "2026-11-27T12:34:56.123456789Z", publication_ts: "2026-11-27T12:34:56.123999999Z",
});
const payload = (overrides: Record<string, unknown> = {}) => ({ error: [], result: {
  symbol: "ETH/USD", base_asset: "ETH", quote_asset: "USD", venue: "PGSL", system: "CLOB",
  base_notation: "UNIT", quote_notation: "MONE", bids: [level("BUY")], asks: [level("SELL", "2044.000")], ...overrides,
} });
const make = (rawResponse = JSON.stringify(payload()), receipt = retrievedAt) => createKrakenPreTradeEvidencePackage({
  rawResponse, retrievedAt: receipt, instrument, source,
});
const evidence = () => {
  const result = make();
  if (result.status !== "VALID") throw new Error(result.reason);
  return result.evidence;
};
const mutable = () => JSON.parse(serializeKrakenPreTradeEvidencePackage(evidence()));

describe("offline Kraken Pre-Trade evidence package", () => {
  it("roundtrips every level, exact decimals and original/normalized timestamps with stable serialization", () => {
    const created = evidence();
    const serialized = serializeKrakenPreTradeEvidencePackage(created);
    const replay = readKrakenPreTradeEvidencePackage(serialized, created.fingerprint);
    expect(replay).toEqual({ status: "VALID", evidence: created });
    if (replay.status !== "VALID") throw new Error(replay.reason);
    expect(serializeKrakenPreTradeEvidencePackage(replay.evidence)).toBe(serialized);
    expect(replay.evidence).toMatchObject({
      contractVersion: "kraken-pre-trade-evidence-package/v1", origin: "CALLER_SUPPLIED_UNVERIFIED",
      sourceApproval: "NOT_APPROVED", snapshotSemantics: "UNVERIFIED",
      decisionReadiness: "BLOCKED_UNVERIFIED_QUOTE_SEMANTICS", instrument, source,
      parser: { contractVersion: "kraken-pre-trade-parser/v1" },
      timestamps: { retrievedAtOriginal: retrievedAt, retrievedAtCeil: "2026-11-27T12:34:56.125Z" },
      book: { bids: [{ responseIndex: 0, side: "BUY",
        price: { original: "2043.1234567890123456789", coefficient: "20431234567890123456789", scale: 19 },
        quantity: { original: "0.01250000", coefficient: "1250000", scale: 8 },
        submissionTsOriginal: "2026-11-27T12:34:56.123456789Z", publicationTsOriginal: "2026-11-27T12:34:56.123999999Z",
        submissionAtFloor: "2026-11-27T12:34:56.123Z", publicationAtCeil: "2026-11-27T12:34:56.124Z",
      }] },
    });
    expect(replay.evidence).not.toHaveProperty("selectedLevel");
    expect(replay.evidence).not.toHaveProperty("priceType");
    expect(replay.evidence).not.toHaveProperty("bestBid");
  });

  it("binds retrieval and source assertions even when the raw response fingerprint stays the same", () => {
    const first = evidence();
    const later = make(first.rawResponse, "2026-11-27T12:35:00Z");
    const other = createKrakenPreTradeEvidencePackage({ rawResponse: first.rawResponse, retrievedAt, instrument,
      source: { ...source, datasetVersion: "pre-trade/other" } });
    for (const result of [later, other]) {
      if (result.status !== "VALID") throw new Error(result.reason);
      expect(result.evidence.parser.payloadFingerprint).toBe(first.parser.payloadFingerprint);
      expect(result.evidence.fingerprint).not.toBe(first.fingerprint);
      expect(verifyKrakenPreTradeEvidencePackage(result.evidence, first.fingerprint))
        .toEqual({ status: "INVALID", reason: "FINGERPRINT_MISMATCH" });
    }
  });

  it("returns reconstructed deeply frozen objects for creation, verification and readback without aliases", () => {
    const binding = { ...instrument };
    const suppliedSource = { ...source };
    const result = createKrakenPreTradeEvidencePackage({ rawResponse: JSON.stringify(payload()), retrievedAt, instrument: binding, source: suppliedSource });
    if (result.status !== "VALID") throw new Error(result.reason);
    suppliedSource.datasetVersion = "mutated";
    binding.baseAssetId = "OTHER" as never;
    expect(result.evidence.source.datasetVersion).toBe(source.datasetVersion);
    expect(result.evidence.instrument.baseAssetId).toBe("ETH");
    const candidate = mutable();
    const verified = verifyKrakenPreTradeEvidencePackage(candidate);
    const read = readKrakenPreTradeEvidencePackage(JSON.stringify(candidate));
    candidate.book.bids[0].price.coefficient = "1";
    candidate.instrument.quoteCurrency = "NOK";
    for (const entry of [result, verified, read]) {
      if (entry.status !== "VALID") throw new Error(entry.reason);
      const e = entry.evidence;
      for (const value of [e, e.instrument, e.source, e.parser, e.timestamps, e.book, e.book.bids, e.book.asks,
        e.book.bids[0], e.book.bids[0].price, e.book.bids[0].quantity]) expect(Object.isFrozen(value)).toBe(true);
      expect(e.instrument.quoteCurrency).toBe("USD");
      expect(e.book.bids[0].price.coefficient).toBe("20431234567890123456789");
    }
  });

  it.each([
    "price", "quantity", "side", "count", "index", "submission", "publication", "normalized", "parser", "version",
    "origin", "approval", "snapshot", "readiness", "source", "instrument", "raw", "retrieval", "extra",
  ])("rejects altered %s evidence with the original content commitment", field => {
    const e = mutable();
    switch (field) {
      case "price": e.book.bids[0].price.coefficient = "1"; break;
      case "quantity": e.book.bids[0].quantity.scale = 0; break;
      case "side": e.book.bids[0].side = "SELL"; break;
      case "count": e.book.bids[0].orderCount = 3; break;
      case "index": e.book.bids[0].responseIndex = 1; break;
      case "submission": e.book.bids[0].submissionTsOriginal = "2000-01-01T00:00:00Z"; break;
      case "publication": e.book.bids[0].publicationTsOriginal = "2000-01-01T00:00:00Z"; break;
      case "normalized": e.timestamps.retrievedAtCeil = "2000-01-01T00:00:00.000Z"; break;
      case "parser": e.parser.payloadFingerprint = "0".repeat(64); break;
      case "version": e.parser.contractVersion = "unknown/v9"; break;
      case "origin": e.origin = "VERIFIED"; break;
      case "approval": e.sourceApproval = "APPROVED"; break;
      case "snapshot": e.snapshotSemantics = "COHERENT"; break;
      case "readiness": e.decisionReadiness = "READY"; break;
      case "source": e.source.datasetVersion = "other/v1"; break;
      case "instrument": e.instrument.instrumentId = "paper.external.other"; break;
      case "raw": e.rawResponse = e.rawResponse.replace("2044.000", "2045.000"); break;
      case "retrieval": e.timestamps.retrievedAtOriginal = "2026-11-27T12:35:00Z"; break;
      case "extra": e.book.bestBid = e.book.bids[0]; break;
    }
    expect(verifyKrakenPreTradeEvidencePackage(e).status).toBe("INVALID");
    expect(readKrakenPreTradeEvidencePackage(JSON.stringify(e)).status).toBe("INVALID");
  });

  it("reparses raw evidence even when a caller recomputes the hash of a fabricated projection", () => {
    const e = mutable();
    delete e.fingerprint;
    e.book.bids[0].price.original = "9999";
    e.fingerprint = canonicalSha256(e);
    expect(verifyKrakenPreTradeEvidencePackage(e)).toEqual({ status: "INVALID", reason: "FINGERPRINT_MISMATCH" });
  });

  it("accepts a newly committed source assertion but does not authenticate it or grant permission", () => {
    const e = mutable();
    delete e.fingerprint;
    e.source.datasetVersion = "caller-assertion/v2";
    e.fingerprint = canonicalSha256(e);
    expect(verifyKrakenPreTradeEvidencePackage(e)).toMatchObject({ status: "VALID", evidence: {
      sourceApproval: "NOT_APPROVED", origin: "CALLER_SUPPLIED_UNVERIFIED", decisionReadiness: "BLOCKED_UNVERIFIED_QUOTE_SEMANTICS",
    } });
    expect(verifyKrakenPreTradeEvidencePackage(e, evidence().fingerprint).status).toBe("INVALID");
  });

  it("preserves empty, duplicate, unsorted and crossed sides through replay without selecting a quote", () => {
    for (const result of [make(JSON.stringify(payload({ bids: [], asks: [] }))), make(JSON.stringify(payload({
      bids: [level("BUY", "4000"), level("BUY", "5000"), level("BUY", "4000")], asks: [level("SELL", "3000")],
    })))]) {
      if (result.status !== "VALID") throw new Error(result.reason);
      expect(readKrakenPreTradeEvidencePackage(serializeKrakenPreTradeEvidencePackage(result.evidence))).toEqual(result);
    }
  });

  it.each([
    { quoteCurrency: "NOK" }, { baseAssetId: "BTC" }, { venueId: "XXXX" }, { venueProductId: "BTC/USD" },
  ])("rejects a mismatched instrument (%j)", override => {
    expect(createKrakenPreTradeEvidencePackage({ rawResponse: JSON.stringify(payload()), retrievedAt,
      instrument: { ...instrument, ...override } as typeof instrument, source })).toEqual({ status: "INVALID", reason: "PARSE_INVALID" });
  });

  it("rejects malformed bindings, provider errors and invalid timestamps with fixed diagnostics", () => {
    for (const binding of [{ ...instrument, instrumentId: "paper.external." }, { ...instrument, baseAssetId: "mm.fixture.fake" },
      { ...instrument, quoteCurrency: "__proto__" }, null]) {
      expect(createKrakenPreTradeEvidencePackage({ rawResponse: "{}", retrievedAt, instrument: binding as never, source }))
        .toEqual({ status: "INVALID", reason: "INPUT_INVALID" });
    }
    expect(createKrakenPreTradeEvidencePackage({ rawResponse: "{}", retrievedAt, instrument, source: { ...source, providerId: "other" } }))
      .toEqual({ status: "INVALID", reason: "INPUT_INVALID" });
    expect(make(JSON.stringify({ error: ["PRIVATE_PROVIDER_VALUE"] }))).toEqual({ status: "INVALID", reason: "PARSE_INVALID" });
    expect(make("{")).toEqual({ status: "INVALID", reason: "PARSE_INVALID" });
    expect(make(JSON.stringify(payload()), "invalid")).toEqual({ status: "INVALID", reason: "PARSE_INVALID" });
  });

  it("roundtrips escape-heavy raw JSON at the full UTF-8 byte limit with twenty levels", () => {
    const p = { ...payload({ bids: Array.from({ length: 10 }, () => level("BUY")), asks: Array.from({ length: 10 }, () => level("SELL")) }), note: "" };
    const initial = JSON.stringify(p);
    const count = Math.floor((KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES - Buffer.byteLength(initial)) / 2);
    p.note = '"'.repeat(count);
    let raw = JSON.stringify(p);
    raw += " ".repeat(KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES - Buffer.byteLength(raw));
    expect(Buffer.byteLength(raw)).toBe(KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES);
    const result = make(raw);
    if (result.status !== "VALID") throw new Error(result.reason);
    const serialized = serializeKrakenPreTradeEvidencePackage(result.evidence);
    expect(serialized.length).toBeLessThanOrEqual(KRAKEN_PRE_TRADE_MAX_SERIALIZED_PACKAGE_CHARS);
    expect(readKrakenPreTradeEvidencePackage(serialized, result.evidence.fingerprint)).toEqual(result);
    expect(make(raw + " ")).toEqual({ status: "INVALID", reason: "PACKAGE_TOO_LARGE" });
    expect(make(JSON.stringify({ ...payload(), note: "ø".repeat(33_000) }))).toEqual({ status: "INVALID", reason: "PACKAGE_TOO_LARGE" });
  });

  it("rejects oversized serialized material, invalid JSON and missing fields", () => {
    expect(readKrakenPreTradeEvidencePackage(" ".repeat(KRAKEN_PRE_TRADE_MAX_SERIALIZED_PACKAGE_CHARS + 1)))
      .toEqual({ status: "INVALID", reason: "PACKAGE_TOO_LARGE" });
    for (const value of ["{", "null", "[]", "{}", "7"]) expect(readKrakenPreTradeEvidencePackage(value).status).toBe("INVALID");
    const e = mutable();
    delete e.book;
    expect(verifyKrakenPreTradeEvidencePackage(e)).toEqual({ status: "INVALID", reason: "PACKAGE_INVALID" });
  });

  it("rejects cyclic/deep extras without recursing into the caller graph", () => {
    const e = mutable();
    e.book.extra = e;
    expect(verifyKrakenPreTradeEvidencePackage(e)).toEqual({ status: "INVALID", reason: "PACKAGE_INVALID" });
    const cycle = mutable();
    cycle.book.bids[0].price = cycle;
    expect(verifyKrakenPreTradeEvidencePackage(cycle)).toEqual({ status: "INVALID", reason: "PACKAGE_INVALID" });
  });

  it("rejects serialization of altered evidence and a different externally expected fingerprint", () => {
    const e = mutable();
    e.book.bids[0].price.original = "1";
    expect(() => serializeKrakenPreTradeEvidencePackage(e)).toThrow("PAPER_PRE_TRADE_EVIDENCE_PACKAGE_INVALID");
    expect(verifyKrakenPreTradeEvidencePackage(evidence(), "0".repeat(64)))
      .toEqual({ status: "INVALID", reason: "FINGERPRINT_MISMATCH" });
    expect(readKrakenPreTradeEvidencePackage(serializeKrakenPreTradeEvidencePackage(evidence()), "not-a-hash"))
      .toEqual({ status: "INVALID", reason: "FINGERPRINT_MISMATCH" });
  });
});
