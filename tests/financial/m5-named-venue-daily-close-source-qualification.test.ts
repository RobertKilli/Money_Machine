import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";
import { M5_SCOPED_MARKET_METRIC_CONTRACT_VERSION } from "@/domain/intelligence/m5-scoped-market-metric-contract";
import {
  M5_NAMED_VENUE_DAILY_CLOSE_QUALIFICATION_VERSION as VERSION,
  evaluateM5NamedVenueDailyCloseProjection,
  isAuthenticM5NamedVenueDailyCloseSourceQualification,
  parseM5NamedVenueDailyCloseSourceQualification,
} from "@/domain/intelligence/m5-named-venue-daily-close-source-qualification";

function candidate(venueId: "coinbase-exchange" | "kraken-spot" = "coinbase-exchange") {
  const material = {
    version: VERSION,
    scopedContractVersion: M5_SCOPED_MARKET_METRIC_CONTRACT_VERSION,
    status: venueId === "coinbase-exchange" ? "PARTIAL" : "BLOCKED",
    venueId,
    instrumentId: venueId === "coinbase-exchange" ? "ETH-USD" : "ETH/USD",
    baseAsset: "ETH", quoteAsset: "USD", marketType: "SPOT",
    endpointProfile: venueId === "coinbase-exchange" ? "GET /products/{product_id}/candles?granularity=86400" : "GET /0/public/OHLC?interval=1440",
    candleSchema: venueId === "coinbase-exchange" ? "[time, low, high, open, close, volume]" : "[time, open, high, low, close, vwap, volume, count]",
    timezone: "UTC", intervalSeconds: 86400,
    bucketStart: "unix epoch bucket start; exact UTC day origin undocumented",
    bucketEnd: "bucketStart + 86400s (contract expected; provider promise incomplete)",
    closeField: venueId === "coinbase-exchange" ? "price_close / index 4; last trade in bucket" : "close / index 4",
    historyPagination: venueId === "coinbase-exchange" ? "max 300; disjoint start/end ranges; lower bound unknown" : "max 720 OHLC points; since does not extend history",
    gapPolicy: "GAPS_BLOCK; Coinbase omits no-tick intervals; Kraken gap behavior unqualified",
    correctionPolicy: "versioned restatement; provider correction/finality behavior undocumented",
    mappingAuthority: "MISSING", usageStorageApproval: "NOT_APPROVED",
    evidence: [{ url: venueId === "coinbase-exchange" ? "https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles" : "https://docs.kraken.com/api-reference/market-data/get-ohlc-data", title: venueId === "coinbase-exchange" ? "Get product candles - Coinbase Developer Documentation" : "Get OHLC Data - Kraken Developers", checkedAt: "2026-09-30T03:57:19.000Z", classification: "DOCUMENTED" }],
    blockers: ["M5_DAILY_CLOSE_MAPPING_AUTHORITY_REQUIRED", "M5_DAILY_CLOSE_USAGE_STORAGE_APPROVAL_REQUIRED"],
    reviewedAt: "2026-09-30T03:57:19.000Z", effectiveFrom: "2026-09-30T03:57:19.000Z", expiresAt: "2027-09-30T03:57:19.000Z",
    recordedAt: "2026-09-30T03:57:19.000Z",
  };
  const fingerprint = canonicalSha256({ version: VERSION, ...Object.fromEntries(Object.entries(material).filter(([k]) => k !== "recordedAt")) });
  return { ...material, qualificationId: `m5-daily-close-source:${fingerprint}`, fingerprint };
}

describe("M5 named venue daily close source qualification", () => {
  it("parses immutable Coinbase evidence and excludes recordedAt from identity", () => {
    const input = candidate();
    const result = parseM5NamedVenueDailyCloseSourceQualification(input);
    expect(result.status).toBe("VALID");
    if (result.status !== "VALID") return;
    expect(Object.isFrozen(result.qualification)).toBe(true);
    expect(Object.isFrozen(result.qualification.evidence)).toBe(true);
    expect(isAuthenticM5NamedVenueDailyCloseSourceQualification(result.qualification)).toBe(true);
    expect(parseM5NamedVenueDailyCloseSourceQualification({ ...input, recordedAt: "2026-09-30T03:58:19.000Z" }).status).toBe("VALID");
  });

  it("rejects unsafe shapes, copied records, and altered evidence", () => {
    const input = candidate();
    expect(parseM5NamedVenueDailyCloseSourceQualification({ ...input, rogue: true }).status).toBe("INVALID");
    expect(parseM5NamedVenueDailyCloseSourceQualification(Object.assign(Object.create({ inherited: true }), input)).status).toBe("INVALID");
    const parsed = parseM5NamedVenueDailyCloseSourceQualification(input);
    expect(parsed.status).toBe("VALID");
    if (parsed.status === "VALID") expect(isAuthenticM5NamedVenueDailyCloseSourceQualification({ ...parsed.qualification })).toBe(false);
    expect(parseM5NamedVenueDailyCloseSourceQualification({ ...input, evidence: [{ ...input.evidence[0], url: "https://user:password@docs.cdp.coinbase.com/a" }] }).status).toBe("INVALID");
  });

  it("keeps partial and blocked candidates at zero projection and binds exact scope", () => {
    for (const venueId of ["coinbase-exchange", "kraken-spot"] as const) {
      const parsed = parseM5NamedVenueDailyCloseSourceQualification(candidate(venueId));
      expect(parsed.status).toBe("VALID");
      if (parsed.status !== "VALID") continue;
      const q = parsed.qualification;
      const result = evaluateM5NamedVenueDailyCloseProjection(q, { venueId: q.venueId, instrumentId: q.instrumentId, baseAsset: q.baseAsset, quoteAsset: q.quoteAsset, marketType: q.marketType, intervalSeconds: q.intervalSeconds, timezone: q.timezone, bucketStart: q.bucketStart, bucketEnd: q.bucketEnd }, [{ bucketStart: "2026-09-28T00:00:00.000Z", bucketEnd: "2026-09-29T00:00:00.000Z", close: "450000", complete: true }]);
      expect(result.status).toBe("BLOCKED");
      expect(result.projection).toBeNull();
      expect(result.blockers).toContain("M5_DAILY_CLOSE_MAPPING_AUTHORITY_REQUIRED");
      const unfinished = evaluateM5NamedVenueDailyCloseProjection(q, { venueId: q.venueId, instrumentId: q.instrumentId, baseAsset: q.baseAsset, quoteAsset: q.quoteAsset, marketType: q.marketType, intervalSeconds: q.intervalSeconds, timezone: q.timezone, bucketStart: "2026-09-29T00:00:00.000Z", bucketEnd: "2026-09-30T00:00:00.000Z" }, [{ bucketStart: "2026-09-29T00:00:00.000Z", bucketEnd: "2026-09-30T00:00:00.000Z", close: "10", complete: false }]);
      expect(unfinished.blockers).toContain("M5_DAILY_CLOSE_CANDLE_INVALID_OR_INCOMPLETE");
      const gap = evaluateM5NamedVenueDailyCloseProjection(q, { venueId: q.venueId, instrumentId: q.instrumentId, baseAsset: q.baseAsset, quoteAsset: q.quoteAsset, marketType: q.marketType, intervalSeconds: q.intervalSeconds, timezone: q.timezone, bucketStart: "2026-09-27T00:00:00.000Z", bucketEnd: "2026-09-28T00:00:00.000Z" }, [{ bucketStart: "2026-09-27T00:00:00.000Z", bucketEnd: "2026-09-28T00:00:00.000Z", close: "10", complete: true }, { bucketStart: "2026-09-29T00:00:00.000Z", bucketEnd: "2026-09-30T00:00:00.000Z", close: "11", complete: true }]);
      expect(gap.blockers).toContain("M5_DAILY_CLOSE_GAP_DUPLICATE_OR_ORDER_INVALID");
      expect(evaluateM5NamedVenueDailyCloseProjection(q, { venueId: q.venueId, instrumentId: "wrong", baseAsset: q.baseAsset, quoteAsset: q.quoteAsset, marketType: q.marketType, intervalSeconds: q.intervalSeconds, timezone: q.timezone, bucketStart: q.bucketStart, bucketEnd: q.bucketEnd }, []).blockers).toContain("M5_DAILY_CLOSE_SCOPE_MISMATCH");
    }
  });
});
