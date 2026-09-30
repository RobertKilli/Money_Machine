/* eslint-disable @typescript-eslint/no-explicit-any -- the parser inspects exact own data descriptors before reading input. */
import "server-only";
import { canonicalSha256 } from "./ingestion-provenance";

export const M5_DECLARED_VENUE_SET_ROLLING_24H_VOLUME_QUALIFICATION_VERSION = "m5-declared-venue-set-rolling-24h-volume-source-qualification/v1" as const;
export const M5_DECLARED_VOLUME_USAGES = Object.freeze(["AUTHORITY_PERSISTENCE", "COMMERCIAL_USE", "NETWORK_ACQUISITION", "NORMALIZED_STORAGE", "RAW_PAYLOAD_PROCESSING", "RAW_PAYLOAD_STORAGE", "REDISTRIBUTION"] as const);
export type M5DeclaredVolumeUsage = typeof M5_DECLARED_VOLUME_USAGES[number];
export type M5DeclaredVolumeStatus = "QUALIFIED" | "PARTIAL" | "BLOCKED" | "INVALID";
export type M5DeclaredVenueMember = Readonly<{
  venueId: string; stableVenueId: string; instrumentId: string; marketType: "SPOT" | "DEX_SPOT";
  baseAsset: string; quoteAsset: string; volumeUnit: "BASE_ASSET" | "QUOTE_ASSET" | "QUOTE_NOTIONAL" | "UNKNOWN";
  volumeField: string; windowKind: "ROLLING_EXACT_24H" | "UTC_DAY" | "BUCKET" | "UNKNOWN";
  windowStart: string; windowEnd: string; asOf: string; currentOrIncompleteIncluded: boolean;
  tradeCoverage: "COMPLETE" | "PAGINATED_UNPROVEN" | "UNKNOWN";
  venueCoverage: "EXPLICIT_SEALED" | "TOP_N" | "SAMPLED" | "PROVIDER_SELECTED" | "UNKNOWN";
  paginationTermination: "PROVEN" | "UNPROVEN" | "NOT_APPLICABLE";
  gapPolicy: string; duplicatePolicy: string; correctionPolicy: string; freshnessPolicy: string; finality: "FINAL" | "NON_FINAL" | "UNKNOWN";
}>;
export type M5DeclaredVolumeQualification = Readonly<{
  contractVersion: typeof M5_DECLARED_VENUE_SET_ROLLING_24H_VOLUME_QUALIFICATION_VERSION;
  scopedContractVersion: "m5-scoped-market-metric-contract/v1"; metricKind: "DECLARED_VENUE_SET_ROLLING_24H_VOLUME";
  providerId: "coinbase-exchange" | "kraken-spot" | "coinmarketcap";
  datasetId: string; datasetVersion: string; canonicalAssetId: string; representation: string; chainId: string; contractAddress: string | null;
  mappingRevisionId: string | null; mappingRevisionFingerprint: string | null;
  scopedMetricContractFingerprint: string;
  venueUniverse: "EXPLICIT_SEALED_DECLARED" | "TOP_N" | "SAMPLE" | "PROVIDER_SELECTED" | "UNKNOWN";
  venues: readonly M5DeclaredVenueMember[]; quoteCurrency: string; aggregationVolumeUnit: "BASE_ASSET" | "QUOTE_ASSET" | "QUOTE_NOTIONAL" | "UNKNOWN";
  aggregationPolicy: string; currencyConversionPolicy: "NONE" | "SEPARATE_AUTHORITY_REQUIRED";
  evidenceReferences: readonly Readonly<{ url: string; title: string; evidenceId: string; checkedAt: string; classification: "DOCUMENTED" | "OBSERVED" | "INFERRED" | "UNKNOWN"; claims: readonly string[] }>[];
  usageApprovals: readonly Readonly<{ usage: M5DeclaredVolumeUsage; approval: "APPROVED" | "REQUIRES_APPROVAL" | "NOT_APPROVED" }>[];
  storageApproval: "APPROVED" | "REQUIRES_APPROVAL" | "NOT_APPROVED"; retentionApproval: "APPROVED" | "REQUIRES_APPROVAL" | "NOT_APPROVED";
  redistributionApproval: "APPROVED" | "REQUIRES_APPROVAL" | "NOT_APPROVED"; commercialApproval: "APPROVED" | "REQUIRES_APPROVAL" | "NOT_APPROVED";
  blockers: readonly string[]; reviewedAt: string; effectiveFrom: string; expiresAt: string; recordedAt: string;
  status: M5DeclaredVolumeStatus; qualificationId: string; qualificationFingerprint: string;
}>;
export type M5DeclaredVolumeParse = Readonly<{ status: "VALID"; qualification: M5DeclaredVolumeQualification }> | Readonly<{ status: "INVALID"; blocker: "M5_DECLARED_VOLUME_QUALIFICATION_INVALID" }>;
const INVALID: M5DeclaredVolumeParse = Object.freeze({ status: "INVALID", blocker: "M5_DECLARED_VOLUME_QUALIFICATION_INVALID" });
const authentic = new WeakSet<object>();
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const SHA = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SECRET = /(?:https?:|ftp:|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|dev|app|co|uk|de|xyz)\b|api[_-]?key|token|authorization|bearer|password|secret|credential)/i;
const time = (x: unknown): x is string => typeof x === "string" && ISO.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
const sha = (x: unknown): x is string => typeof x === "string" && SHA.test(x);
const safeId = (x: unknown): x is string => typeof x === "string" && ID.test(x) && !SECRET.test(x);
const safeField = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/\[\]-]{0,127}$/.test(x) && !SECRET.test(x);
const exact = (x: unknown, keys: readonly string[]): x is Record<string, any> => {
  try { if (!x || typeof x !== "object" || Object.getPrototypeOf(x) !== Object.prototype) return false; const ks = Reflect.ownKeys(x); return ks.length === keys.length && ks.every(k => typeof k === "string" && keys.includes(k) && (() => { const d = Object.getOwnPropertyDescriptor(x, k); return !!d && "value" in d && !d.get && !d.set; })()); } catch { return false; }
};
const strictArray = (x: unknown, min = 0, max = 128): x is unknown[] => {
  try { if (!Array.isArray(x) || Object.getPrototypeOf(x) !== Array.prototype || x.length < min || x.length > max) return false; const ks = Reflect.ownKeys(x); if (ks.length !== x.length + 1 || ks.some(k => typeof k !== "string")) return false; for (let i = 0; i < x.length; i++) { const d = Object.getOwnPropertyDescriptor(x, String(i)); if (!d || !("value" in d) || d.get || d.set) return false; } return true; } catch { return false; }
};
const freeze = <T>(v: T): T => { if (v && typeof v === "object" && !Object.isFrozen(v)) { for (const x of Object.values(v as Record<string, unknown>)) freeze(x); Object.freeze(v); } return v; };
const memberKeys = ["venueId", "stableVenueId", "instrumentId", "marketType", "baseAsset", "quoteAsset", "volumeUnit", "volumeField", "windowKind", "windowStart", "windowEnd", "asOf", "currentOrIncompleteIncluded", "tradeCoverage", "venueCoverage", "paginationTermination", "gapPolicy", "duplicatePolicy", "correctionPolicy", "freshnessPolicy", "finality"] as const;
const refKeys = ["url", "title", "evidenceId", "checkedAt", "classification", "claims"] as const;
const rawKeys = ["contractVersion", "scopedContractVersion", "metricKind", "providerId", "datasetId", "datasetVersion", "canonicalAssetId", "representation", "chainId", "contractAddress", "mappingRevisionId", "mappingRevisionFingerprint", "scopedMetricContractFingerprint", "venueUniverse", "venues", "quoteCurrency", "aggregationVolumeUnit", "aggregationPolicy", "currencyConversionPolicy", "evidenceReferences", "usageApprovals", "storageApproval", "retentionApproval", "redistributionApproval", "commercialApproval", "blockers", "reviewedAt", "effectiveFrom", "expiresAt", "recordedAt"] as const;
const approvals = ["APPROVED", "REQUIRES_APPROVAL", "NOT_APPROVED"] as const;
const expected = {
  "coinbase-exchange": ["coinbase-exchange", "product-stats", "coinbase-exchange-product-stats/v1", "coinbase-exchange", "ETH-USD"],
  "kraken-spot": ["kraken-spot", "spot-ticker", "kraken-spot-ticker/v1", "kraken-spot", "ETH/USD"],
  coinmarketcap: ["coinmarketcap", "cryptocurrency-quotes", "coinmarketcap-pro/v1", "coinmarketcap", "aggregate"]
} as const;

/** Parse an evidence-bound source candidate. The parser is not a qualification issuer: candidates stay PARTIAL/BLOCKED. */
export function parseM5DeclaredVenueSetRolling24hVolumeQualification(input: unknown): M5DeclaredVolumeParse {
  try {
    if (!exact(input, rawKeys)) return INVALID;
    const x = input;
    if (x.contractVersion !== M5_DECLARED_VENUE_SET_ROLLING_24H_VOLUME_QUALIFICATION_VERSION || x.scopedContractVersion !== "m5-scoped-market-metric-contract/v1" || x.metricKind !== "DECLARED_VENUE_SET_ROLLING_24H_VOLUME" || typeof x.providerId !== "string" || !Object.hasOwn(expected, x.providerId)) return INVALID;
    const [, dataset, version, venue, instrument] = expected[x.providerId as keyof typeof expected];
    if (x.datasetId !== dataset || x.datasetVersion !== version || x.canonicalAssetId !== "eip155:1/native:ETH" || x.representation !== "ETH" || x.chainId !== "eip155:1" || x.contractAddress !== null || x.mappingRevisionId !== null || x.mappingRevisionFingerprint !== null) return INVALID;
    if (!safeId(x.canonicalAssetId) || !safeId(x.representation) || !safeId(x.chainId) || !safeId(x.datasetId) || !safeId(x.datasetVersion) || !safeId(x.quoteCurrency) || x.quoteCurrency !== "USD" || !safeId(x.aggregationPolicy) || !sha(x.scopedMetricContractFingerprint) || !["NONE", "SEPARATE_AUTHORITY_REQUIRED"].includes(x.currencyConversionPolicy)) return INVALID;
    if (!(x.venueUniverse === "EXPLICIT_SEALED_DECLARED" || x.venueUniverse === "TOP_N" || x.venueUniverse === "SAMPLE" || x.venueUniverse === "PROVIDER_SELECTED" || x.venueUniverse === "UNKNOWN") || !strictArray(x.venues, 1, 16)) return INVALID;
    const venues: M5DeclaredVenueMember[] = [];
    for (const raw of x.venues) {
      if (!exact(raw, memberKeys) || !["SPOT", "DEX_SPOT"].includes(raw.marketType) || !["BASE_ASSET", "QUOTE_ASSET", "QUOTE_NOTIONAL", "UNKNOWN"].includes(raw.volumeUnit) || !["ROLLING_EXACT_24H", "UTC_DAY", "BUCKET", "UNKNOWN"].includes(raw.windowKind) || !["COMPLETE", "PAGINATED_UNPROVEN", "UNKNOWN"].includes(raw.tradeCoverage) || !["EXPLICIT_SEALED", "TOP_N", "SAMPLED", "PROVIDER_SELECTED", "UNKNOWN"].includes(raw.venueCoverage) || !["PROVEN", "UNPROVEN", "NOT_APPLICABLE"].includes(raw.paginationTermination) || !["FINAL", "NON_FINAL", "UNKNOWN"].includes(raw.finality) || typeof raw.currentOrIncompleteIncluded !== "boolean") return INVALID;
      for (const key of ["venueId", "stableVenueId", "instrumentId", "baseAsset", "quoteAsset", "gapPolicy", "duplicatePolicy", "correctionPolicy", "freshnessPolicy"]) if (!safeId(raw[key])) return INVALID;
      if (!safeField(raw.volumeField)) return INVALID;
      if (raw.venueId !== venue || raw.instrumentId !== instrument || raw.baseAsset !== "ETH" || raw.quoteAsset !== "USD" || !time(raw.windowStart) || !time(raw.windowEnd) || !time(raw.asOf) || Date.parse(raw.windowEnd) - Date.parse(raw.windowStart) !== 86_400_000 || raw.windowEnd !== raw.asOf) return INVALID;
      venues.push({ ...raw } as M5DeclaredVenueMember);
    }
    const order = venues.map(v => `${v.venueId}/${v.stableVenueId}/${v.instrumentId}`).join("\n");
    if (venues.some((v, i) => i > 0 && `${venues[i - 1].venueId}/${venues[i - 1].stableVenueId}/${venues[i - 1].instrumentId}` >= `${v.venueId}/${v.stableVenueId}/${v.instrumentId}`) || new Set(venues.map(v => v.venueId)).size !== venues.length || new Set(venues.map(v => v.instrumentId)).size !== venues.length || !order) return INVALID;
    const first = venues[0];
    if (venues.some(v => v.windowStart !== first.windowStart || v.windowEnd !== first.windowEnd || v.asOf !== first.asOf || v.volumeUnit !== x.aggregationVolumeUnit || v.quoteAsset !== x.quoteCurrency)) return INVALID;
    if (x.venueUniverse === "EXPLICIT_SEALED_DECLARED" && venues.some(v => v.venueCoverage !== "EXPLICIT_SEALED")) return INVALID;
    if (!strictArray(x.evidenceReferences, 1, 32) || !strictArray(x.usageApprovals, 7, 7) || !strictArray(x.blockers, 1, 64)) return INVALID;
    for (const t of [x.reviewedAt, x.effectiveFrom, x.expiresAt, x.recordedAt]) if (!time(t)) return INVALID;
    if (x.reviewedAt > x.effectiveFrom || x.effectiveFrom >= x.expiresAt) return INVALID;
    const refs: any[] = []; const claims = new Set<string>();
    for (const r of x.evidenceReferences) {
      if (!exact(r, refKeys) || typeof r.url !== "string" || !time(r.checkedAt) || r.checkedAt > x.reviewedAt || typeof r.title !== "string" || !r.title.trim() || SECRET.test(r.title) || !safeId(r.evidenceId) || !strictArray(r.claims, 1, 32) || !["DOCUMENTED", "OBSERVED", "INFERRED", "UNKNOWN"].includes(r.classification)) return INVALID;
      const url = new URL(r.url); const hosts = x.providerId === "coinbase-exchange" ? ["docs.cdp.coinbase.com", "www.coinbase.com"] : x.providerId === "kraken-spot" ? ["docs.kraken.com", "support.kraken.com", "docs-legacy.kraken.com", "www.kraken.com"] : ["coinmarketcap.com", "support.coinmarketcap.com"];
      if (url.protocol !== "https:" || !hosts.some(h => url.hostname === h || url.hostname.endsWith(`.${h}`)) || url.username || url.password || url.search || url.hash || url.href !== r.url) return INVALID;
      for (const c of r.claims) { if (typeof c !== "string" || !/^[A-Z][A-Z0-9_]{1,95}$/.test(c) || claims.has(c)) return INVALID; claims.add(c); }
      refs.push({ ...r, claims: [...r.claims].sort() });
    }
    if (new Set(refs.map(r => r.url)).size !== refs.length || new Set(refs.map(r => r.evidenceId)).size !== refs.length) return INVALID;
    refs.sort((a, b) => a.url < b.url ? -1 : a.url > b.url ? 1 : 0);
    const usageMap = new Map<string, string>();
    for (const a of x.usageApprovals) { if (!exact(a, ["usage", "approval"]) || !M5_DECLARED_VOLUME_USAGES.includes(a.usage) || !approvals.includes(a.approval) || usageMap.has(a.usage)) return INVALID; usageMap.set(a.usage, a.approval); }
    if (M5_DECLARED_VOLUME_USAGES.some(u => !usageMap.has(u)) || ![x.storageApproval, x.retentionApproval, x.redistributionApproval, x.commercialApproval].every(a => approvals.includes(a))) return INVALID;
    if (!x.blockers.every((b: unknown) => typeof b === "string" && /^M5_[A-Z0-9_]+$/.test(b)) || new Set(x.blockers).size !== x.blockers.length) return INVALID;
    const status: M5DeclaredVolumeStatus = x.providerId === "coinmarketcap" || ["TOP_N", "SAMPLE", "PROVIDER_SELECTED"].includes(x.venueUniverse) || venues.some(v => ["TOP_N", "SAMPLED", "PROVIDER_SELECTED"].includes(v.venueCoverage)) ? "BLOCKED" : "PARTIAL";
    if (x.blockers.length === 0) return INVALID;
    const material: Record<string, unknown> = { ...x, venues, evidenceReferences: refs, usageApprovals: M5_DECLARED_VOLUME_USAGES.map(usage => ({ usage, approval: usageMap.get(usage) })), blockers: [...x.blockers].sort(), status };
    delete material.recordedAt;
    const fp = canonicalSha256({ contractVersion: M5_DECLARED_VENUE_SET_ROLLING_24H_VOLUME_QUALIFICATION_VERSION, ...material });
    const q = freeze({ ...material, recordedAt: x.recordedAt, qualificationFingerprint: fp, qualificationId: `m5-declared-volume-source:${fp}` }) as unknown as M5DeclaredVolumeQualification;
    authentic.add(q);
    return freeze({ status: "VALID" as const, qualification: q });
  } catch { return INVALID; }
}
export const isAuthenticM5DeclaredVenueSetRolling24hVolumeQualification = (x: unknown): x is M5DeclaredVolumeQualification => !!x && typeof x === "object" && authentic.has(x);
