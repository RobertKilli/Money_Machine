import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
    metricKind: "NAMED_VENUE_DAILY_CLOSE",
    providerId: venueId === "coinbase-exchange" ? "coinbase-exchange" : "kraken",
    datasetId: venueId === "coinbase-exchange" ? "product-candles" : "spot-ohlc",
    datasetVersion: "official-doc-profile-2026-09",
    status: venueId === "coinbase-exchange" ? "PARTIAL" : "BLOCKED",
    venueId,
    instrumentId: venueId === "coinbase-exchange" ? "ETH-USD" : "ETH/USD",
    baseAsset: "ETH", quoteAsset: "USD", currency: "USD", marketType: "SPOT",
    chainId: "eip155:1", representation: "ETH", requestedCanonicalAssetId: "eip155:1/native:ETH", mappingRevision: "UNMAPPED",
    endpointProfile: venueId === "coinbase-exchange" ? "GET /products/{product_id}/candles?granularity=86400" : "GET /0/public/OHLC?interval=1440&assetVersion=1",
    candleSchema: venueId === "coinbase-exchange" ? "[time, low, high, open, close, volume]" : "[time, open, high, low, close, vwap, volume, count]",
    timezone: "UTC", intervalSeconds: 86400,
    bucketStart: "00:00:00Z",
    bucketEnd: "next 00:00:00Z",
    closeField: venueId === "coinbase-exchange" ? "price_close / index 4; last trade in bucket" : "close / index 4",
    closePriceBasis: "LAST_TRADE_IN_BUCKET",
    historyPagination: venueId === "coinbase-exchange" ? "max 300; disjoint start/end ranges; lower bound unknown" : "max 720; since is incremental only and cannot extend older OHLC history",
    gapPolicy: venueId === "coinbase-exchange" ? "GAPS_BLOCK; Coinbase omits no-tick intervals; Coinbase documents no data for intervals with no ticks" : "GAPS_BLOCK; missing-interval semantics unknown",
    correctionPolicy: "VERSIONED_RESTATEMENT; provider correction/finality semantics unknown",
    mappingAuthority: "MISSING", usageApproval: "NOT_APPROVED", storageApproval: "NOT_APPROVED", retentionApproval: "NOT_APPROVED", redistributionApproval: "NOT_APPROVED", commercialApproval: "NOT_APPROVED",
    evidence: [{ url: venueId === "coinbase-exchange" ? "https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles" : "https://docs.kraken.com/api-reference/market-data/get-ohlc-data", title: venueId === "coinbase-exchange" ? "Get product candles - Coinbase Developer Documentation" : "Get OHLC Data - Kraken Developers", checkedAt: "2026-09-30T04:13:11.000Z", classification: "DOCUMENTED" }],
    blockers: venueId === "coinbase-exchange"
      ? ["M5_DAILY_CLOSE_COMMERCIAL_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_CORRECTION_FINALITY_UNKNOWN", "M5_DAILY_CLOSE_CURRENT_CANDLE_SEMANTICS_UNKNOWN", "M5_DAILY_CLOSE_GAP_POLICY_UNQUALIFIED", "M5_DAILY_CLOSE_HISTORY_COVERAGE_UNPROVEN", "M5_DAILY_CLOSE_MAPPING_AUTHORITY_REQUIRED", "M5_DAILY_CLOSE_PRODUCT_CURRENT_IDENTITY_UNVERIFIED", "M5_DAILY_CLOSE_REDISTRIBUTION_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_RETENTION_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_STORAGE_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_USAGE_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_UTC_BOUNDARY_UNSPECIFIED"]
      : ["M5_DAILY_CLOSE_CANONICAL_PAIR_ID_UNVERIFIED", "M5_DAILY_CLOSE_COMMERCIAL_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_CORRECTION_FINALITY_UNKNOWN", "M5_DAILY_CLOSE_CURRENT_CANDLE_MUST_BE_FILTERED", "M5_DAILY_CLOSE_GAP_POLICY_UNQUALIFIED", "M5_DAILY_CLOSE_HISTORY_COVERAGE_UNPROVEN", "M5_DAILY_CLOSE_MAPPING_AUTHORITY_REQUIRED", "M5_DAILY_CLOSE_REDISTRIBUTION_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_RETENTION_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_STORAGE_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_USAGE_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_UTC_BOUNDARY_UNSPECIFIED"],
    reviewedAt: "2026-09-30T04:13:11.000Z", effectiveFrom: "2026-09-30T04:13:11.000Z", expiresAt: "2027-09-30T04:13:11.000Z",
    recordedAt: "2026-09-30T04:13:11.000Z",
  };
  const scope = { scopedContractVersion: material.scopedContractVersion, metricKind: material.metricKind, providerId: material.providerId, datasetId: material.datasetId, datasetVersion: material.datasetVersion, venueId: material.venueId, instrumentId: material.instrumentId, baseAsset: material.baseAsset, quoteAsset: material.quoteAsset, currency: material.currency, marketType: material.marketType, chainId: material.chainId, representation: material.representation, requestedCanonicalAssetId: material.requestedCanonicalAssetId, mappingRevision: material.mappingRevision, endpointProfile: material.endpointProfile, candleSchema: material.candleSchema, timezone: material.timezone, intervalSeconds: material.intervalSeconds, bucketStart: material.bucketStart, bucketEnd: material.bucketEnd, closeField: material.closeField, closePriceBasis: material.closePriceBasis, historyPagination: material.historyPagination, correctionPolicy: material.correctionPolicy, gapPolicy: material.gapPolicy };
  Object.assign(material, { metricScopeFingerprint: canonicalSha256(scope) });
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
    const reRecorded = parseM5NamedVenueDailyCloseSourceQualification({ ...input, recordedAt: "2026-09-30T04:14:19.000Z" });
    expect(reRecorded.status).toBe("VALID");
    if (reRecorded.status === "VALID") expect(reRecorded.qualification.fingerprint).toBe(result.qualification.fingerprint);
  });

  it("rejects unsafe shapes, copied records, and altered evidence", () => {
    const input = candidate();
    expect(parseM5NamedVenueDailyCloseSourceQualification({ ...input, rogue: true }).status).toBe("INVALID");
    const invalid = parseM5NamedVenueDailyCloseSourceQualification({ ...input, rogue: "raw-sensitive-value" });
    expect(invalid).toEqual({ status: "INVALID", blocker: "M5_DAILY_CLOSE_SOURCE_QUALIFICATION_INVALID" });
    expect(parseM5NamedVenueDailyCloseSourceQualification(Object.assign(Object.create({ inherited: true }), input)).status).toBe("INVALID");
    expect(parseM5NamedVenueDailyCloseSourceQualification({ ...input, [Symbol("hidden")]: true }).status).toBe("INVALID");
    const accessor = { ...input };
    Object.defineProperty(accessor, "status", { get: () => "PARTIAL", enumerable: true });
    expect(parseM5NamedVenueDailyCloseSourceQualification(accessor).status).toBe("INVALID");
    expect(parseM5NamedVenueDailyCloseSourceQualification(Object.assign(Object.create(null), input)).status).toBe("INVALID");
    const parsed = parseM5NamedVenueDailyCloseSourceQualification(input);
    expect(parsed.status).toBe("VALID");
    if (parsed.status === "VALID") expect(isAuthenticM5NamedVenueDailyCloseSourceQualification({ ...parsed.qualification })).toBe(false);
    expect(parseM5NamedVenueDailyCloseSourceQualification({ ...input, evidence: [{ ...input.evidence[0], url: "https://user:password@docs.cdp.coinbase.com/a" }] }).status).toBe("INVALID");
    expect(parseM5NamedVenueDailyCloseSourceQualification({ ...input, evidence: [input.evidence[0], input.evidence[0]] }).status).toBe("INVALID");
    expect(parseM5NamedVenueDailyCloseSourceQualification({ ...input, candleSchema: "[time, open, high, low, close]" }).status).toBe("INVALID");
    expect(parseM5NamedVenueDailyCloseSourceQualification({ ...input, status: "QUALIFIED" }).status).toBe("INVALID");
  });

  it("keeps partial and blocked candidates at zero projection and binds exact scope", () => {
    for (const venueId of ["coinbase-exchange", "kraken-spot"] as const) {
      const parsed = parseM5NamedVenueDailyCloseSourceQualification(candidate(venueId));
      expect(parsed.status).toBe("VALID");
      if (parsed.status !== "VALID") continue;
      const q = parsed.qualification;
      expect(q.status).toBe(venueId === "coinbase-exchange" ? "PARTIAL" : "BLOCKED");
      const scope = { scopedContractVersion: q.scopedContractVersion, metricKind: "NAMED_VENUE_DAILY_CLOSE" as const, providerId: q.providerId, datasetId: q.datasetId, datasetVersion: q.datasetVersion, venueId: q.venueId, instrumentId: q.instrumentId, baseAsset: q.baseAsset, quoteAsset: q.quoteAsset, currency: q.currency, marketType: q.marketType, chainId: q.chainId, representation: q.representation, canonicalAssetId: q.requestedCanonicalAssetId, mappingRevision: q.mappingRevision, intervalSeconds: q.intervalSeconds, timezone: q.timezone, bucketStart: q.bucketStart, bucketEnd: q.bucketEnd, closePriceBasis: q.closePriceBasis, asOf: "2026-09-29T00:00:00.000Z" };
      const result = evaluateM5NamedVenueDailyCloseProjection(q, scope, [{ bucketStart: "2026-09-28T00:00:00.000Z", bucketEnd: "2026-09-29T00:00:00.000Z", close: "450000", complete: true }]);
      expect(result.status).toBe("BLOCKED");
      expect(result.projection).toBeNull();
      expect(result.blockers).toContain("M5_DAILY_CLOSE_MAPPING_AUTHORITY_REQUIRED");
      const unfinished = evaluateM5NamedVenueDailyCloseProjection(q, { ...scope, asOf: "2026-09-29T12:00:00.000Z" }, [{ bucketStart: "2026-09-29T00:00:00.000Z", bucketEnd: "2026-09-30T00:00:00.000Z", close: "10", complete: false }]);
      expect(unfinished.blockers).toContain("M5_DAILY_CLOSE_CANDLE_INVALID_OR_INCOMPLETE");
      const current = evaluateM5NamedVenueDailyCloseProjection(q, { ...scope, asOf: "2026-09-29T12:00:00.000Z" }, [{ bucketStart: "2026-09-29T00:00:00.000Z", bucketEnd: "2026-09-30T00:00:00.000Z", close: "10", complete: true }]);
      expect(current.blockers).toContain("M5_DAILY_CLOSE_CURRENT_CANDLE_UNFINISHED");
      const gap = evaluateM5NamedVenueDailyCloseProjection(q, { ...scope, asOf: "2026-09-30T00:00:00.000Z" }, [{ bucketStart: "2026-09-27T00:00:00.000Z", bucketEnd: "2026-09-28T00:00:00.000Z", close: "10", complete: true }, { bucketStart: "2026-09-29T00:00:00.000Z", bucketEnd: "2026-09-30T00:00:00.000Z", close: "11", complete: true }]);
      expect(gap.blockers).toContain("M5_DAILY_CLOSE_GAP_DUPLICATE_OR_ORDER_INVALID");
      expect(evaluateM5NamedVenueDailyCloseProjection(q, { ...scope, instrumentId: "wrong" }, []).blockers).toContain("M5_DAILY_CLOSE_SCOPE_MISMATCH");
      expect(evaluateM5NamedVenueDailyCloseProjection(q, { ...scope, baseAsset: "WETH", representation: "WETH", canonicalAssetId: "eip155:1/erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" }, []).projection).toBeNull();
      expect(evaluateM5NamedVenueDailyCloseProjection(q, { ...scope, mappingRevision: "mapping:forged" }, []).blockers).toContain("M5_DAILY_CLOSE_SCOPE_MISMATCH");
      const overLimit = Array.from({ length: q.venueId === "coinbase-exchange" ? 301 : 721 }, (_, i) => ({ bucketStart: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), bucketEnd: new Date(Date.UTC(2026, 0, 2 + i)).toISOString(), close: "1", complete: true }));
      expect(evaluateM5NamedVenueDailyCloseProjection(q, scope, overLimit).blockers).toContain("M5_DAILY_CLOSE_PROVIDER_PAGE_LIMIT_EXCEEDED");
      const duplicate = [{ bucketStart: "2026-09-28T00:00:00.000Z", bucketEnd: "2026-09-29T00:00:00.000Z", close: "1", complete: true }, { bucketStart: "2026-09-28T00:00:00.000Z", bucketEnd: "2026-09-29T00:00:00.000Z", close: "1", complete: true }];
      expect(evaluateM5NamedVenueDailyCloseProjection(q, scope, duplicate).blockers).toContain("M5_DAILY_CLOSE_GAP_DUPLICATE_OR_ORDER_INVALID");
      const noFinalBucket = evaluateM5NamedVenueDailyCloseProjection(q, scope, [{ bucketStart: "2026-09-27T00:00:00.000Z", bucketEnd: "2026-09-28T00:00:00.000Z", close: "1", complete: true }]);
      expect(noFinalBucket.blockers).toContain("M5_DAILY_CLOSE_CANDLE_ASOF_MISMATCH");
      expect(evaluateM5NamedVenueDailyCloseProjection({ ...q }, scope, []).status).toBe("INVALID");
      const serialized = JSON.parse(JSON.stringify(q));
      expect(evaluateM5NamedVenueDailyCloseProjection(serialized, scope, []).status).toBe("INVALID");
      expect(evaluateM5NamedVenueDailyCloseProjection(q, { ...scope, intervalSeconds: 3600 }, []).blockers).toContain("M5_DAILY_CLOSE_SCOPE_MISMATCH");
      expect(evaluateM5NamedVenueDailyCloseProjection(q, { ...scope, timezone: "Europe/Oslo" }, []).blockers).toContain("M5_DAILY_CLOSE_SCOPE_MISMATCH");
      expect(evaluateM5NamedVenueDailyCloseProjection(q, { ...scope, bucketStart: "08:00:00Z" }, []).blockers).toContain("M5_DAILY_CLOSE_SCOPE_MISMATCH");
      expect(evaluateM5NamedVenueDailyCloseProjection(q, { ...scope, quoteAsset: "EUR" }, []).blockers).toContain("M5_DAILY_CLOSE_SCOPE_MISMATCH");
      expect(evaluateM5NamedVenueDailyCloseProjection(q, { ...scope, currency: "EUR" }, []).blockers).toContain("M5_DAILY_CLOSE_SCOPE_MISMATCH");
      expect(evaluateM5NamedVenueDailyCloseProjection(q, { ...scope, baseAsset: "WETH" }, []).blockers).toContain("M5_DAILY_CLOSE_SCOPE_MISMATCH");
      expect(evaluateM5NamedVenueDailyCloseProjection(q, { ...scope, marketType: "DEX_SPOT" }, []).blockers).toContain("M5_DAILY_CLOSE_SCOPE_MISMATCH");
      const pageLimit = q.venueId === "coinbase-exchange" ? 300 : 720;
      const atLimit = Array.from({ length: pageLimit }, (_, i) => ({ bucketStart: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), bucketEnd: new Date(Date.UTC(2026, 0, 2 + i)).toISOString(), close: "1", complete: true }));
      const atLimitResult = evaluateM5NamedVenueDailyCloseProjection(q, { ...scope, asOf: atLimit[pageLimit - 1].bucketEnd }, atLimit);
      expect(atLimitResult.blockers).not.toContain("M5_DAILY_CLOSE_PROVIDER_PAGE_LIMIT_EXCEEDED");
      expect(evaluateM5NamedVenueDailyCloseProjection(q, scope, [{ bucketStart: "2026-09-27T00:00:00.000Z", bucketEnd: "2026-09-28T00:00:00.000Z", close: "1", complete: true }, { bucketStart: "2026-09-26T00:00:00.000Z", bucketEnd: "2026-09-27T00:00:00.000Z", close: "1", complete: true }]).blockers).toContain("M5_DAILY_CLOSE_GAP_DUPLICATE_OR_ORDER_INVALID");
    }
  });

  it("keeps the production decision fail-closed", () => {
    const decision = JSON.parse(readFileSync(new URL("../../config/m5/named-venue-daily-close-source-qualification.production.json", import.meta.url), "utf8")) as { productionStatus: string; selectedSource: unknown; candidates: Array<{ qualificationStatus: string; selected: boolean; mappingAuthority: unknown; usageApproval: string; storageApproval: string; retentionApproval: string; redistributionApproval: string; commercialApproval: string }> };
    expect(decision.productionStatus).toBe("BLOCKED");
    expect(decision.selectedSource).toBeNull();
    expect(decision.candidates.map(x => x.qualificationStatus)).toEqual(["PARTIAL", "BLOCKED"]);
    expect(decision.candidates.every(x => !x.selected && x.mappingAuthority === null && x.usageApproval === "NOT_APPROVED" && x.storageApproval === "NOT_APPROVED" && x.retentionApproval === "NOT_APPROVED" && x.redistributionApproval === "NOT_APPROVED" && x.commercialApproval === "NOT_APPROVED")).toBe(true);
  });
});
