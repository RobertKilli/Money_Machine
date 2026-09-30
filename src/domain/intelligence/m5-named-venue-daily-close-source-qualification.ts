/* eslint-disable @typescript-eslint/no-explicit-any -- exact own-property parser uses narrow dynamic access after shape checks. */
import "server-only";
import { canonicalSha256 } from "./ingestion-provenance";
import { M5_SCOPED_MARKET_METRIC_CONTRACT_VERSION } from "./m5-scoped-market-metric-contract";

export const M5_NAMED_VENUE_DAILY_CLOSE_QUALIFICATION_VERSION = "m5-named-venue-daily-close-source-qualification/v1" as const;
export type M5SourceQualificationStatus = "QUALIFIED" | "PARTIAL" | "BLOCKED" | "INVALID";
export type M5DailyCloseEvidence = Readonly<{ url: string; title: string; checkedAt: string; classification: "DOCUMENTED" | "INFERRED" | "UNKNOWN" }>;
export type M5NamedVenueDailyCloseSourceQualification = Readonly<{
  version: typeof M5_NAMED_VENUE_DAILY_CLOSE_QUALIFICATION_VERSION;
  scopedContractVersion: typeof M5_SCOPED_MARKET_METRIC_CONTRACT_VERSION;
  metricKind: "NAMED_VENUE_DAILY_CLOSE";
  providerId: "coinbase-exchange" | "kraken";
  datasetId: "product-candles" | "spot-ohlc";
  datasetVersion: string;
  status: "PARTIAL" | "BLOCKED";
  venueId: "coinbase-exchange" | "kraken-spot";
  instrumentId: string;
  baseAsset: "ETH";
  quoteAsset: "USD";
  currency: "USD";
  marketType: "SPOT";
  chainId: "eip155:1";
  representation: "ETH";
  requestedCanonicalAssetId: "eip155:1/native:ETH";
  mappingRevision: "UNMAPPED";
  endpointProfile: string;
  candleSchema: string;
  timezone: "UTC";
  intervalSeconds: 86400;
  bucketStart: string;
  bucketEnd: string;
  closeField: string;
  closePriceBasis: "LAST_TRADE_IN_BUCKET";
  historyPagination: string;
  gapPolicy: string;
  correctionPolicy: string;
  mappingAuthority: "MISSING";
  usageApproval: "NOT_APPROVED" | "APPROVED";
  storageApproval: "NOT_APPROVED" | "APPROVED";
  retentionApproval: "NOT_APPROVED" | "APPROVED";
  redistributionApproval: "NOT_APPROVED" | "APPROVED";
  commercialApproval: "NOT_APPROVED" | "APPROVED";
  metricScopeFingerprint: string;
  evidence: readonly M5DailyCloseEvidence[];
  blockers: readonly string[];
  reviewedAt: string;
  effectiveFrom: string;
  expiresAt: string;
  qualificationId: string;
  fingerprint: string;
  recordedAt: string;
}>;

const authentic = new WeakSet<object>();
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const secret = /(?:api[_-]?key|token|authorization|bearer|password|secret|credential)/i;
const hosts = new Set(["docs.cdp.coinbase.com", "www.coinbase.com", "docs.kraken.com", "support.kraken.com", "docs-legacy.kraken.com"]);
const candidateBlockers = {
  "coinbase-exchange": ["M5_DAILY_CLOSE_COMMERCIAL_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_CORRECTION_FINALITY_UNKNOWN", "M5_DAILY_CLOSE_CURRENT_CANDLE_SEMANTICS_UNKNOWN", "M5_DAILY_CLOSE_GAP_POLICY_UNQUALIFIED", "M5_DAILY_CLOSE_HISTORY_COVERAGE_UNPROVEN", "M5_DAILY_CLOSE_MAPPING_AUTHORITY_REQUIRED", "M5_DAILY_CLOSE_PRODUCT_CURRENT_IDENTITY_UNVERIFIED", "M5_DAILY_CLOSE_REDISTRIBUTION_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_RETENTION_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_STORAGE_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_USAGE_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_UTC_BOUNDARY_UNSPECIFIED"],
  "kraken-spot": ["M5_DAILY_CLOSE_CANONICAL_PAIR_ID_UNVERIFIED", "M5_DAILY_CLOSE_COMMERCIAL_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_CORRECTION_FINALITY_UNKNOWN", "M5_DAILY_CLOSE_CURRENT_CANDLE_MUST_BE_FILTERED", "M5_DAILY_CLOSE_GAP_POLICY_UNQUALIFIED", "M5_DAILY_CLOSE_HISTORY_COVERAGE_UNPROVEN", "M5_DAILY_CLOSE_MAPPING_AUTHORITY_REQUIRED", "M5_DAILY_CLOSE_REDISTRIBUTION_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_RETENTION_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_STORAGE_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_USAGE_APPROVAL_REQUIRED", "M5_DAILY_CLOSE_UTC_BOUNDARY_UNSPECIFIED"],
} as const;
const keys = ["version", "scopedContractVersion", "metricKind", "providerId", "datasetId", "datasetVersion", "status", "venueId", "instrumentId", "baseAsset", "quoteAsset", "currency", "marketType", "chainId", "representation", "requestedCanonicalAssetId", "mappingRevision", "endpointProfile", "candleSchema", "timezone", "intervalSeconds", "bucketStart", "bucketEnd", "closeField", "closePriceBasis", "historyPagination", "gapPolicy", "correctionPolicy", "mappingAuthority", "usageApproval", "storageApproval", "retentionApproval", "redistributionApproval", "commercialApproval", "metricScopeFingerprint", "evidence", "blockers", "reviewedAt", "effectiveFrom", "expiresAt", "recordedAt"] as const;
function plain(v: unknown, expected?: readonly string[]): v is Record<string, any> {
  try {
    if (!v || typeof v !== "object" || Object.getPrototypeOf(v) !== Object.prototype) return false;
    const own = Reflect.ownKeys(v);
    return own.every(k => typeof k === "string" && (!expected || expected.includes(k)) && (() => { const d = Object.getOwnPropertyDescriptor(v, k); return !!d && "value" in d && !d.get && !d.set; })());
  } catch { return false; }
}
function iso(s: unknown): s is string { return typeof s === "string" && ISO.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s; }
function freeze<T>(x: T): T { if (x && typeof x === "object" && !Object.isFrozen(x)) { Object.values(x as object).forEach(v => freeze(v)); Object.freeze(x); } return x; }
function material(x: Record<string, any>) { return Object.fromEntries(Object.entries(x).filter(([k]) => k !== "recordedAt" && k !== "qualificationId" && k !== "fingerprint")); }

/** Strictly parses reviewed provider evidence. recordedAt is excluded from identity. */
export function parseM5NamedVenueDailyCloseSourceQualification(input: unknown): Readonly<{ status: "VALID"; qualification: M5NamedVenueDailyCloseSourceQualification }> | Readonly<{ status: "INVALID"; blocker: "M5_DAILY_CLOSE_SOURCE_QUALIFICATION_INVALID" }> {
  try {
    if (!plain(input, [...keys, "qualificationId", "fingerprint"]) || Reflect.ownKeys(input).length !== keys.length + 2) throw new Error();
    const x = input as Record<string, any>;
    if (x.version !== M5_NAMED_VENUE_DAILY_CLOSE_QUALIFICATION_VERSION || x.scopedContractVersion !== M5_SCOPED_MARKET_METRIC_CONTRACT_VERSION || x.metricKind !== "NAMED_VENUE_DAILY_CLOSE" || !["PARTIAL", "BLOCKED"].includes(x.status)) throw new Error();
    if (!["coinbase-exchange", "kraken-spot"].includes(x.venueId) || x.providerId !== (x.venueId === "coinbase-exchange" ? "coinbase-exchange" : "kraken") || x.datasetId !== (x.venueId === "coinbase-exchange" ? "product-candles" : "spot-ohlc") || x.datasetVersion !== "official-doc-profile-2026-09" || typeof x.instrumentId !== "string" || !ID.test(x.instrumentId) || x.baseAsset !== "ETH" || x.quoteAsset !== "USD" || x.currency !== "USD" || x.marketType !== "SPOT" || x.chainId !== "eip155:1" || x.representation !== "ETH" || x.requestedCanonicalAssetId !== "eip155:1/native:ETH" || x.mappingRevision !== "UNMAPPED" || x.timezone !== "UTC" || x.intervalSeconds !== 86400 || x.mappingAuthority !== "MISSING") throw new Error();
    const isCoinbase = x.venueId === "coinbase-exchange";
    if (x.status !== (isCoinbase ? "PARTIAL" : "BLOCKED") || x.mappingAuthority !== "MISSING" || ["usageApproval", "storageApproval", "retentionApproval", "redistributionApproval", "commercialApproval"].some(key => x[key] !== "NOT_APPROVED")) throw new Error();
    const exactProfile = isCoinbase
      ? x.instrumentId === "ETH-USD" && x.endpointProfile === "GET /products/{product_id}/candles?granularity=86400" && x.candleSchema === "[time, low, high, open, close, volume]" && x.closeField === "price_close / index 4; last trade in bucket" && x.historyPagination === "max 300; disjoint start/end ranges; lower bound unknown" && x.gapPolicy === "GAPS_BLOCK; Coinbase omits no-tick intervals; Coinbase documents no data for intervals with no ticks"
      : x.instrumentId === "ETH/USD" && x.endpointProfile === "GET /0/public/OHLC?interval=1440&assetVersion=1" && x.candleSchema === "[time, open, high, low, close, vwap, volume, count]" && x.closeField === "close / index 4" && x.historyPagination === "max 720; since is incremental only and cannot extend older OHLC history" && x.gapPolicy === "GAPS_BLOCK; missing-interval semantics unknown";
    if (!exactProfile || x.bucketStart !== "00:00:00Z" || x.bucketEnd !== "next 00:00:00Z" || x.closePriceBasis !== "LAST_TRADE_IN_BUCKET" || x.correctionPolicy !== "VERSIONED_RESTATEMENT; provider correction/finality semantics unknown") throw new Error();
    for (const key of ["usageApproval", "storageApproval", "retentionApproval", "redistributionApproval", "commercialApproval"]) if (!["NOT_APPROVED", "APPROVED"].includes(x[key])) throw new Error();
    const scopeMaterial = { scopedContractVersion: x.scopedContractVersion, metricKind: x.metricKind, providerId: x.providerId, datasetId: x.datasetId, datasetVersion: x.datasetVersion, venueId: x.venueId, instrumentId: x.instrumentId, baseAsset: x.baseAsset, quoteAsset: x.quoteAsset, currency: x.currency, marketType: x.marketType, chainId: x.chainId, representation: x.representation, requestedCanonicalAssetId: x.requestedCanonicalAssetId, mappingRevision: x.mappingRevision, endpointProfile: x.endpointProfile, candleSchema: x.candleSchema, timezone: x.timezone, intervalSeconds: x.intervalSeconds, bucketStart: x.bucketStart, bucketEnd: x.bucketEnd, closeField: x.closeField, closePriceBasis: x.closePriceBasis, historyPagination: x.historyPagination, correctionPolicy: x.correctionPolicy, gapPolicy: x.gapPolicy };
    if (x.metricScopeFingerprint !== canonicalSha256(scopeMaterial)) throw new Error();
    const strictArray = (v: unknown, allowEmpty: boolean): v is unknown[] => {
      try { if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype || (!allowEmpty && v.length === 0)) return false; const own = Reflect.ownKeys(v); if (own.length !== v.length + 1 || own.some(k => typeof k !== "string")) return false; for (let i = 0; i < v.length; i++) { const d = Object.getOwnPropertyDescriptor(v, String(i)); if (!d || !("value" in d) || d.get || d.set) return false; } return true; } catch { return false; }
    };
    if (!strictArray(x.evidence, false) || x.evidence.length > 32 || !strictArray(x.blockers, false)) throw new Error();
    const seen = new Set<string>();
    for (const e of x.evidence) {
      if (!plain(e, ["url", "title", "checkedAt", "classification"]) || Reflect.ownKeys(e).length !== 4 || typeof e.url !== "string" || e.url.length > 2048 || typeof e.title !== "string" || !e.title.trim() || e.title.length > 256 || secret.test(e.title) || !iso(e.checkedAt) || e.checkedAt > x.reviewedAt || !["DOCUMENTED", "INFERRED", "UNKNOWN"].includes(e.classification)) throw new Error();
      const u = new URL(e.url);
      if (u.protocol !== "https:" || !hosts.has(u.hostname) || u.username || u.password || u.search || u.hash || u.href !== e.url || secret.test(u.href) || seen.has(u.href)) throw new Error();
      seen.add(u.href);
    }
    const requiredEvidence = isCoinbase ? "https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles" : "https://docs.kraken.com/api-reference/market-data/get-ohlc-data";
    if (!seen.has(requiredEvidence)) throw new Error();
    const blockerCodes = x.blockers as string[];
    if (blockerCodes.some(b => !/^M5_[A-Z0-9_]+$/.test(b)) || new Set(blockerCodes).size !== blockerCodes.length || blockerCodes.length !== candidateBlockers[x.venueId as keyof typeof candidateBlockers].length || blockerCodes.some((b, i) => b !== candidateBlockers[x.venueId as keyof typeof candidateBlockers][i])) throw new Error();
    if (!iso(x.reviewedAt) || !iso(x.effectiveFrom) || !iso(x.expiresAt) || !iso(x.recordedAt) || x.effectiveFrom > x.reviewedAt || x.reviewedAt >= x.expiresAt) throw new Error();
    const fp = canonicalSha256({ version: M5_NAMED_VENUE_DAILY_CLOSE_QUALIFICATION_VERSION, ...material(x) });
    if (x.fingerprint !== fp || x.qualificationId !== `m5-daily-close-source:${fp}`) throw new Error();
    const result = freeze({ ...x }) as M5NamedVenueDailyCloseSourceQualification;
    authentic.add(result);
    return Object.freeze({ status: "VALID", qualification: result });
  } catch { return Object.freeze({ status: "INVALID", blocker: "M5_DAILY_CLOSE_SOURCE_QUALIFICATION_INVALID" }); }
}

export function isAuthenticM5NamedVenueDailyCloseSourceQualification(value: unknown): value is M5NamedVenueDailyCloseSourceQualification { return !!value && typeof value === "object" && authentic.has(value); }

/** Projection is intentionally zero unless a future, reviewed qualification can satisfy every required approval. */
export function evaluateM5NamedVenueDailyCloseProjection(qualification: unknown, scope: Readonly<{ scopedContractVersion: string; metricKind: "NAMED_VENUE_DAILY_CLOSE"; providerId: string; datasetId: string; datasetVersion: string; venueId: string; instrumentId: string; baseAsset: string; quoteAsset: string; currency: string; marketType: string; chainId: string; representation: string; canonicalAssetId: string; mappingRevision: string; intervalSeconds: number; timezone: string; bucketStart: string; bucketEnd: string; closePriceBasis: string; asOf: string }>, candles: readonly Readonly<{ bucketStart: string; bucketEnd: string; close: string; complete: boolean }>[]): Readonly<{ status: "BLOCKED" | "INVALID"; projection: null; blockers: readonly string[] }> {
  const scopeKeys = ["scopedContractVersion", "metricKind", "providerId", "datasetId", "datasetVersion", "venueId", "instrumentId", "baseAsset", "quoteAsset", "currency", "marketType", "chainId", "representation", "canonicalAssetId", "mappingRevision", "intervalSeconds", "timezone", "bucketStart", "bucketEnd", "closePriceBasis", "asOf"];
  const strictArray = (v: unknown): v is unknown[] => { try { if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype) return false; const own = Reflect.ownKeys(v); if (own.length !== v.length + 1 || own.some(k => typeof k !== "string")) return false; for (let i = 0; i < v.length; i++) { const d = Object.getOwnPropertyDescriptor(v, String(i)); if (!d || !("value" in d) || d.get || d.set) return false; } return true; } catch { return false; } };
  if (!isAuthenticM5NamedVenueDailyCloseSourceQualification(qualification) || !plain(scope, scopeKeys) || Reflect.ownKeys(scope).length !== scopeKeys.length || !iso(scope.asOf) || scope.metricKind !== "NAMED_VENUE_DAILY_CLOSE" || !strictArray(candles) || candles.some(c => !plain(c, ["bucketStart", "bucketEnd", "close", "complete"]) || Reflect.ownKeys(c).length !== 4)) return Object.freeze({ status: "INVALID", projection: null, blockers: Object.freeze(["M5_DAILY_CLOSE_SOURCE_QUALIFICATION_INVALID"]) });
  const q = qualification;
  const matches = q.scopedContractVersion === scope.scopedContractVersion && q.metricKind === scope.metricKind && q.providerId === scope.providerId && q.datasetId === scope.datasetId && q.datasetVersion === scope.datasetVersion && q.venueId === scope.venueId && q.instrumentId === scope.instrumentId && q.baseAsset === scope.baseAsset && q.quoteAsset === scope.quoteAsset && q.currency === scope.currency && q.marketType === scope.marketType && q.chainId === scope.chainId && q.representation === scope.representation && q.requestedCanonicalAssetId === scope.canonicalAssetId && q.mappingRevision === scope.mappingRevision && q.intervalSeconds === scope.intervalSeconds && q.timezone === scope.timezone && q.bucketStart === scope.bucketStart && q.bucketEnd === scope.bucketEnd && q.closePriceBasis === scope.closePriceBasis;
  const blockers = [...(matches ? [] : ["M5_DAILY_CLOSE_SCOPE_MISMATCH"]), ...q.blockers];
  if (!candles.length) blockers.push("M5_DAILY_CLOSE_CANDLES_MISSING");
  if (candles.length > (q.venueId === "coinbase-exchange" ? 300 : 720)) blockers.push("M5_DAILY_CLOSE_PROVIDER_PAGE_LIMIT_EXCEEDED");
  let priorEnd: number | null = null;
  for (const candle of candles) {
    const start = typeof candle.bucketStart === "string" && iso(candle.bucketStart) ? Date.parse(candle.bucketStart) : NaN;
    const end = typeof candle.bucketEnd === "string" && iso(candle.bucketEnd) ? Date.parse(candle.bucketEnd) : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start !== 86_400_000 || start % 86_400_000 !== 0 || candle.complete !== true || typeof candle.close !== "string" || !/^(0|[1-9]\d*)$/.test(candle.close)) blockers.push("M5_DAILY_CLOSE_CANDLE_INVALID_OR_INCOMPLETE");
    if (priorEnd !== null && start !== priorEnd) blockers.push("M5_DAILY_CLOSE_GAP_DUPLICATE_OR_ORDER_INVALID");
    if (Number.isFinite(end) && end > Date.parse(scope.asOf)) blockers.push("M5_DAILY_CLOSE_CURRENT_CANDLE_UNFINISHED");
    priorEnd = end;
  }
  blockers.push("M5_DAILY_CLOSE_QUALIFICATION_NOT_COMPLETE");
  blockers.push("M5_DAILY_CLOSE_MAPPING_AUTHORITY_REQUIRED", "M5_DAILY_CLOSE_MAPPING_RUNTIME_PROOF_UNAVAILABLE");
  if (q.usageApproval !== "APPROVED") blockers.push("M5_DAILY_CLOSE_USAGE_APPROVAL_REQUIRED");
  if (q.storageApproval !== "APPROVED") blockers.push("M5_DAILY_CLOSE_STORAGE_APPROVAL_REQUIRED");
  if (q.retentionApproval !== "APPROVED") blockers.push("M5_DAILY_CLOSE_RETENTION_APPROVAL_REQUIRED");
  if (q.redistributionApproval !== "APPROVED") blockers.push("M5_DAILY_CLOSE_REDISTRIBUTION_APPROVAL_REQUIRED");
  if (q.commercialApproval !== "APPROVED") blockers.push("M5_DAILY_CLOSE_COMMERCIAL_APPROVAL_REQUIRED");
  if (candles.length && candles[candles.length - 1].bucketEnd !== scope.asOf) blockers.push("M5_DAILY_CLOSE_CANDLE_ASOF_MISMATCH");
  return Object.freeze({ status: "BLOCKED", projection: null, blockers: Object.freeze([...new Set(blockers)].sort()) });
}

export function fingerprintM5DailyCloseSourceQualification(input: Readonly<Record<string, unknown>>): string { return canonicalSha256({ version: M5_NAMED_VENUE_DAILY_CLOSE_QUALIFICATION_VERSION, ...material(input as Record<string, any>) }); }
