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
  status: Exclude<M5SourceQualificationStatus, "INVALID">;
  venueId: "coinbase-exchange" | "kraken-spot";
  instrumentId: string;
  baseAsset: "ETH";
  quoteAsset: "USD";
  marketType: "SPOT";
  endpointProfile: string;
  candleSchema: string;
  timezone: "UTC";
  intervalSeconds: 86400;
  bucketStart: string;
  bucketEnd: string;
  closeField: string;
  historyPagination: string;
  gapPolicy: string;
  correctionPolicy: string;
  mappingAuthority: "MISSING" | Readonly<{ mappingId: string; fingerprint: string; revision: string; scopeFingerprint: string }>;
  usageStorageApproval: "NOT_APPROVED" | "APPROVED";
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
const keys = ["version", "scopedContractVersion", "status", "venueId", "instrumentId", "baseAsset", "quoteAsset", "marketType", "endpointProfile", "candleSchema", "timezone", "intervalSeconds", "bucketStart", "bucketEnd", "closeField", "historyPagination", "gapPolicy", "correctionPolicy", "mappingAuthority", "usageStorageApproval", "evidence", "blockers", "reviewedAt", "effectiveFrom", "expiresAt", "recordedAt"] as const;
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
    if (x.version !== M5_NAMED_VENUE_DAILY_CLOSE_QUALIFICATION_VERSION || x.scopedContractVersion !== M5_SCOPED_MARKET_METRIC_CONTRACT_VERSION || !["PARTIAL", "BLOCKED", "QUALIFIED"].includes(x.status)) throw new Error();
    if (!["coinbase-exchange", "kraken-spot"].includes(x.venueId) || typeof x.instrumentId !== "string" || !ID.test(x.instrumentId) || x.baseAsset !== "ETH" || x.quoteAsset !== "USD" || x.marketType !== "SPOT" || x.timezone !== "UTC" || x.intervalSeconds !== 86400) throw new Error();
    for (const k of ["endpointProfile", "candleSchema", "bucketStart", "bucketEnd", "closeField", "historyPagination", "gapPolicy", "correctionPolicy"]) if (typeof x[k] !== "string" || !x[k].trim() || x[k].trim() !== x[k] || secret.test(x[k])) throw new Error();
    if (x.mappingAuthority !== "MISSING") {
      if (!plain(x.mappingAuthority, ["mappingId", "fingerprint", "revision", "scopeFingerprint"]) || Reflect.ownKeys(x.mappingAuthority).length !== 4 || !ID.test(x.mappingAuthority.mappingId) || !ID.test(x.mappingAuthority.revision) || !/^[a-f0-9]{64}$/.test(x.mappingAuthority.fingerprint) || !/^[a-f0-9]{64}$/.test(x.mappingAuthority.scopeFingerprint)) throw new Error();
    }
    if (!["NOT_APPROVED", "APPROVED"].includes(x.usageStorageApproval)) throw new Error();
    if (!Array.isArray(x.evidence) || x.evidence.length < 1 || Object.getPrototypeOf(x.evidence) !== Array.prototype || !Array.isArray(x.blockers) || !x.blockers.length || Object.getPrototypeOf(x.blockers) !== Array.prototype) throw new Error();
    const seen = new Set<string>();
    for (const e of x.evidence) {
      if (!plain(e, ["url", "title", "checkedAt", "classification"]) || Reflect.ownKeys(e).length !== 4 || typeof e.url !== "string" || typeof e.title !== "string" || !e.title.trim() || !iso(e.checkedAt) || !["DOCUMENTED", "INFERRED", "UNKNOWN"].includes(e.classification)) throw new Error();
      const u = new URL(e.url);
      if (u.protocol !== "https:" || !hosts.has(u.hostname) || u.username || u.password || u.search || u.hash || u.href !== e.url || secret.test(u.href) || seen.has(u.href)) throw new Error();
      seen.add(u.href);
    }
    if (x.blockers.some((b: unknown) => typeof b !== "string" || !/^M5_[A-Z0-9_]+$/.test(b)) || new Set(x.blockers).size !== x.blockers.length) throw new Error();
    if (!iso(x.reviewedAt) || !iso(x.effectiveFrom) || !iso(x.expiresAt) || !iso(x.recordedAt) || x.reviewedAt >= x.expiresAt || x.effectiveFrom >= x.expiresAt) throw new Error();
    if (x.status === "QUALIFIED" && (x.blockers.length !== 0 || x.mappingAuthority === "MISSING" || x.usageStorageApproval !== "APPROVED")) throw new Error();
    const fp = canonicalSha256({ version: M5_NAMED_VENUE_DAILY_CLOSE_QUALIFICATION_VERSION, ...material(x) });
    if (x.fingerprint !== fp || x.qualificationId !== `m5-daily-close-source:${fp}`) throw new Error();
    const result = freeze({ ...x }) as M5NamedVenueDailyCloseSourceQualification;
    authentic.add(result);
    return Object.freeze({ status: "VALID", qualification: result });
  } catch { return Object.freeze({ status: "INVALID", blocker: "M5_DAILY_CLOSE_SOURCE_QUALIFICATION_INVALID" }); }
}

export function isAuthenticM5NamedVenueDailyCloseSourceQualification(value: unknown): value is M5NamedVenueDailyCloseSourceQualification { return !!value && typeof value === "object" && authentic.has(value); }

/** Projection is intentionally zero unless a future, reviewed qualification can satisfy every required approval. */
export function evaluateM5NamedVenueDailyCloseProjection(qualification: unknown, scope: Readonly<{ venueId: string; instrumentId: string; baseAsset: string; quoteAsset: string; marketType: string; intervalSeconds: number; timezone: string; bucketStart: string; bucketEnd: string }>, candles: readonly Readonly<{ bucketStart: string; bucketEnd: string; close: string; complete: boolean }>[]): Readonly<{ status: "BLOCKED" | "INVALID"; projection: null; blockers: readonly string[] }> {
  if (!isAuthenticM5NamedVenueDailyCloseSourceQualification(qualification) || !scope || typeof scope !== "object" || !Array.isArray(candles) || !candles.every(c => c && typeof c === "object")) return Object.freeze({ status: "INVALID", projection: null, blockers: Object.freeze(["M5_DAILY_CLOSE_SOURCE_QUALIFICATION_INVALID"]) });
  const q = qualification;
  const matches = q.venueId === scope.venueId && q.instrumentId === scope.instrumentId && q.baseAsset === scope.baseAsset && q.quoteAsset === scope.quoteAsset && q.marketType === scope.marketType && q.intervalSeconds === scope.intervalSeconds && q.timezone === scope.timezone && q.bucketStart === scope.bucketStart && q.bucketEnd === scope.bucketEnd;
  const blockers = [...(matches ? [] : ["M5_DAILY_CLOSE_SCOPE_MISMATCH"]), ...q.blockers];
  if (!candles.length) blockers.push("M5_DAILY_CLOSE_CANDLES_MISSING");
  let priorEnd: number | null = null;
  for (const candle of candles) {
    const start = typeof candle.bucketStart === "string" && iso(candle.bucketStart) ? Date.parse(candle.bucketStart) : NaN;
    const end = typeof candle.bucketEnd === "string" && iso(candle.bucketEnd) ? Date.parse(candle.bucketEnd) : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start !== 86_400_000 || start % 86_400_000 !== 0 || candle.complete !== true || typeof candle.close !== "string" || !/^(0|[1-9]\d*)$/.test(candle.close)) blockers.push("M5_DAILY_CLOSE_CANDLE_INVALID_OR_INCOMPLETE");
    if (priorEnd !== null && start !== priorEnd) blockers.push("M5_DAILY_CLOSE_GAP_DUPLICATE_OR_ORDER_INVALID");
    if (Number.isFinite(end) && end > Date.parse(scope.bucketEnd)) blockers.push("M5_DAILY_CLOSE_CURRENT_CANDLE_UNFINISHED");
    priorEnd = end;
  }
  if (q.status !== "QUALIFIED") blockers.push("M5_DAILY_CLOSE_QUALIFICATION_NOT_COMPLETE");
  if (q.mappingAuthority === "MISSING") blockers.push("M5_DAILY_CLOSE_MAPPING_AUTHORITY_REQUIRED");
  if (q.usageStorageApproval !== "APPROVED") blockers.push("M5_DAILY_CLOSE_USAGE_STORAGE_APPROVAL_REQUIRED");
  return Object.freeze({ status: "BLOCKED", projection: null, blockers: Object.freeze([...new Set(blockers)].sort()) });
}

export function fingerprintM5DailyCloseSourceQualification(input: Readonly<Record<string, unknown>>): string { return canonicalSha256({ version: M5_NAMED_VENUE_DAILY_CLOSE_QUALIFICATION_VERSION, ...material(input as Record<string, any>) }); }
