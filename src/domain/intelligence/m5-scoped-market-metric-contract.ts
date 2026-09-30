/* eslint-disable @typescript-eslint/no-explicit-any -- exact own-data shape checks are the runtime trust boundary in this parser. */
import "server-only";
import { canonicalSha256 } from "./ingestion-provenance";
import {
  M5_COINGECKO_MARKET_SOURCE_QUALIFICATION_VERSION,
  type M5CoinGeckoMarketSourceQualification,
  type M5CoinGeckoMarketMetric,
  isAuthenticM5CoinGeckoMarketSourceQualification,
} from "./m5-coingecko-market-source-qualification";

export const M5_SCOPED_MARKET_METRIC_CONTRACT_VERSION = "m5-scoped-market-metric-contract/v1" as const;
export const M5_SCOPED_MARKET_METRICS = Object.freeze(["NAMED_VENUE_DAILY_CLOSE", "REPORTED_CIRCULATING_MARKET_CAP", "DECLARED_VENUE_SET_ROLLING_24H_VOLUME"] as const);
export type M5ScopedMarketMetricKind = typeof M5_SCOPED_MARKET_METRICS[number];
export type M5ScopedMetricEvidence = Readonly<{ url: string; title: string; evidenceId: string; checkedAt: string }>;
export type M5ScopedMetricQualificationBinding = Readonly<{
  contractVersion: typeof M5_COINGECKO_MARKET_SOURCE_QUALIFICATION_VERSION;
  qualificationId: string;
  qualificationFingerprint: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  metric: M5CoinGeckoMarketMetric;
  metricScopeFingerprint: string;
}>;
type Common = Readonly<{
  metricKind: M5ScopedMarketMetricKind;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  canonicalAssetId: string;
  mappingRevision: string;
  mappingAuthority: Readonly<{ authorityId: string; fingerprint: string; canonicalAssetId: string; representation: string; revision: string }> | null;
  chainId: string | null;
  representation: string | null;
  currency: string;
  observedAt: string;
  asOf: string;
  sourceQualification: M5ScopedMetricQualificationBinding;
  methodologyVersion: string;
  completeness: "COMPLETE_DECLARED_SCOPE";
  evidenceReferences: readonly M5ScopedMetricEvidence[];
  materialId: string;
  fingerprint: string;
  recordedAt: string;
}>;
export type M5NamedVenueDailyClose = Common & Readonly<{
  metricKind: "NAMED_VENUE_DAILY_CLOSE";
  venueId: string; instrumentId: string; baseAsset: string; quoteAsset: string; marketType: "SPOT" | "DEX_SPOT";
  timezone: "UTC"; sessionBoundary: "00:00:00Z"; candleInterval: "P1D"; candleOpen: string; candleClose: string;
  closePriceBasis: "LAST_TRADE_AT_OR_BEFORE_BOUNDARY"; correctionPolicy: "VERSIONED_RESTATEMENT"; gapPolicy: "GAPS_BLOCK";
}>;
export type M5ReportedCirculatingMarketCap = Common & Readonly<{
  metricKind: "REPORTED_CIRCULATING_MARKET_CAP";
  reportedValueAtoms: string; scale: number; supplyBasis: "CIRCULATING";
  providerMethodologyVersion: string; valueKind: "PROVIDER_REPORTED";
}>;
export type M5DeclaredVenueSetRolling24hVolume = Common & Readonly<{
  metricKind: "DECLARED_VENUE_SET_ROLLING_24H_VOLUME";
  venues: readonly Readonly<{ venueId: string; instrumentId: string; marketType: "SPOT" | "DEX_SPOT" }>[];
  windowStart: string; windowEnd: string; aggregationMethodologyVersion: string;
  duplicateMarketPolicy: "CANONICAL_INSTRUMENT_DEDUPLICATION"; correctionPolicy: "VERSIONED_RESTATEMENT";
  reportedValueAtoms: string; scale: number;
}>;
export type M5ScopedMarketMetricContract = M5NamedVenueDailyClose | M5ReportedCirculatingMarketCap | M5DeclaredVenueSetRolling24hVolume;
export type M5ScopedMetricResult = Readonly<{ status: "VALID"; contract: M5ScopedMarketMetricContract }> | Readonly<{ status: "INVALID"; blocker: "M5_SCOPED_METRIC_CONTRACT_INVALID" }>;
export type M5ScopedMetricGuardResult = Readonly<{ status: "READY"; contract: M5ScopedMarketMetricContract }> | Readonly<{ status: "BLOCKED"; blockers: readonly string[] }> | Readonly<{ status: "INVALID"; blockers: readonly ["M5_SCOPED_METRIC_CONTRACT_INVALID"] }>;
export const M5_SCOPED_METRIC_DIRECTION_VERSION = "m5-scoped-market-metric-direction/v1" as const;
export type M5ScopedMetricDirection = Readonly<{ metricKind: M5ScopedMarketMetricKind; selectedDirection: M5ScopedMarketMetricKind; status: "BLOCKED"; blockers: readonly string[]; reviewedAt: string; expiresAt: string; decisionId: string; fingerprint: string; recordedAt: string }>;
export type M5ScopedMetricDirectionConfig = Readonly<{ contractVersion: typeof M5_SCOPED_METRIC_DIRECTION_VERSION; reviewedAt: string; decisions: readonly M5ScopedMetricDirection[]; fingerprint: string; recordedAt: string }>;

const INVALID: M5ScopedMetricResult = Object.freeze({ status: "INVALID", blocker: "M5_SCOPED_METRIC_CONTRACT_INVALID" });
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA = /^[a-f0-9]{64}$/;
const SECRET = /(?:api[_-]?key|access[_-]?token|authorization|bearer|password|secret|credential)/i;
const EVIDENCE_HOSTS = new Set(["docs.coingecko.com", "www.coinmarketcap.com", "support.coinmarketcap.com", "www.coinapi.io", "www.kaiko.com", "ethereum.org", "eips.ethereum.org"]);
const clean = (s: unknown, pattern: RegExp, max = 128): s is string => typeof s === "string" && s.length > 0 && s.length <= max && s.trim() === s && !SECRET.test(s) && pattern.test(s);
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/;
const time = (v: unknown): v is string => typeof v === "string" && UTC.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const exact = (v: unknown, keys: readonly string[]): v is Record<string, any> => {
  try { if (!v || typeof v !== "object" || Object.getPrototypeOf(v) !== Object.prototype) return false; const own = Reflect.ownKeys(v); return own.length === keys.length && own.every(k => typeof k === "string" && keys.includes(k) && (() => { const d = Object.getOwnPropertyDescriptor(v, k); return !!d && "value" in d && !d.get && !d.set; })()); } catch { return false; }
};
const array = (v: unknown, max: number): v is unknown[] => {
  try { if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype || v.length < 1 || v.length > max) return false; const keys = Reflect.ownKeys(v); if (keys.length !== v.length + 1 || keys.some(k => typeof k !== "string")) return false; for (let i = 0; i < v.length; i++) { const d = Object.getOwnPropertyDescriptor(v, String(i)); if (!d || !("value" in d) || d.get || d.set) return false; } return true; } catch { return false; }
};
const freeze = <T>(v: T): T => { if (v && typeof v === "object" && !Object.isFrozen(v)) { for (const x of Object.values(v as Record<string, unknown>)) freeze(x); Object.freeze(v); } return v; };
const commonKeys = ["metricKind", "providerId", "datasetId", "datasetVersion", "canonicalAssetId", "mappingRevision", "mappingAuthority", "chainId", "representation", "currency", "observedAt", "asOf", "sourceQualification", "methodologyVersion", "completeness", "evidenceReferences", "fingerprint", "recordedAt"] as const;
const qualificationKeys = ["contractVersion", "qualificationId", "qualificationFingerprint", "providerId", "datasetId", "datasetVersion", "metric", "metricScopeFingerprint"] as const;
const evidenceKeys = ["url", "title", "evidenceId", "checkedAt"] as const;
function build(input: Record<string, any>): M5ScopedMarketMetricContract | null {
  const kind = input.metricKind as M5ScopedMarketMetricKind;
  const extra: readonly string[] = kind === "NAMED_VENUE_DAILY_CLOSE" ? ["venueId", "instrumentId", "baseAsset", "quoteAsset", "marketType", "timezone", "sessionBoundary", "candleInterval", "candleOpen", "candleClose", "closePriceBasis", "correctionPolicy", "gapPolicy"] : kind === "REPORTED_CIRCULATING_MARKET_CAP" ? ["reportedValueAtoms", "scale", "supplyBasis", "providerMethodologyVersion", "valueKind"] : ["venues", "windowStart", "windowEnd", "aggregationMethodologyVersion", "duplicateMarketPolicy", "correctionPolicy", "reportedValueAtoms", "scale"];
  if (!M5_SCOPED_MARKET_METRICS.includes(kind) || !exact(input, [...commonKeys, ...extra])) return null;
  for (const key of ["providerId", "datasetId", "datasetVersion", "canonicalAssetId", "mappingRevision", "currency", "methodologyVersion"]) if (!clean(input[key], ID)) return null;
  if (input.mappingAuthority !== null && (!exact(input.mappingAuthority, ["authorityId", "fingerprint", "canonicalAssetId", "representation", "revision"]) || !clean(input.mappingAuthority.authorityId, ID) || !SHA.test(input.mappingAuthority.fingerprint) || !clean(input.mappingAuthority.canonicalAssetId, ID) || !clean(input.mappingAuthority.representation, ID) || !clean(input.mappingAuthority.revision, ID))) return null;
  if (!(input.chainId === null || clean(input.chainId, ID)) || !(input.representation === null || clean(input.representation, ID)) || input.completeness !== "COMPLETE_DECLARED_SCOPE" || !time(input.observedAt) || !time(input.asOf) || input.observedAt !== input.asOf || !time(input.recordedAt)) return null;
  if (!exact(input.sourceQualification, qualificationKeys) || input.sourceQualification.contractVersion !== M5_COINGECKO_MARKET_SOURCE_QUALIFICATION_VERSION || !SHA.test(input.sourceQualification.qualificationFingerprint) || !SHA.test(input.sourceQualification.metricScopeFingerprint) || !clean(input.sourceQualification.qualificationId, ID) || input.sourceQualification.providerId !== input.providerId || input.sourceQualification.datasetId !== input.datasetId || input.sourceQualification.datasetVersion !== input.datasetVersion) return null;
  const expectedMetric = kind === "NAMED_VENUE_DAILY_CLOSE" ? "DAILY_CLOSE_SERIES" : kind === "REPORTED_CIRCULATING_MARKET_CAP" ? "MARKET_CAP" : "VOLUME_24H";
  if (input.sourceQualification.metric !== expectedMetric) return null;
  if (!array(input.evidenceReferences, 32)) return null;
  const refs: M5ScopedMetricEvidence[] = [];
  for (const ref of input.evidenceReferences) {
    if (!exact(ref, evidenceKeys) || !clean(ref.title, /.+/, 256) || !clean(ref.evidenceId, ID) || !time(ref.checkedAt) || ref.checkedAt > input.asOf || typeof ref.url !== "string") return null;
    try { const u = new URL(ref.url); if (u.protocol !== "https:" || !EVIDENCE_HOSTS.has(u.hostname) || u.username || u.password || u.search || u.hash || u.href !== ref.url || SECRET.test(u.pathname)) return null; } catch { return null; }
    refs.push({ url: ref.url, title: ref.title, evidenceId: ref.evidenceId, checkedAt: ref.checkedAt });
  }
  if (new Set(refs.map(x => x.evidenceId)).size !== refs.length || new Set(refs.map(x => x.url)).size !== refs.length) return null;
  if (kind === "NAMED_VENUE_DAILY_CLOSE") {
    if (!["venueId", "instrumentId", "baseAsset", "quoteAsset"].every(k => clean(input[k], ID)) || !["SPOT", "DEX_SPOT"].includes(input.marketType) || input.timezone !== "UTC" || input.sessionBoundary !== "00:00:00Z" || input.candleInterval !== "P1D" || !time(input.candleOpen) || !time(input.candleClose) || input.candleClose !== input.asOf || Date.parse(input.candleClose) - Date.parse(input.candleOpen) !== 86_400_000 || Date.parse(input.candleOpen) % 86_400_000 !== 0 || input.closePriceBasis !== "LAST_TRADE_AT_OR_BEFORE_BOUNDARY" || input.correctionPolicy !== "VERSIONED_RESTATEMENT" || input.gapPolicy !== "GAPS_BLOCK") return null;
  } else if (kind === "REPORTED_CIRCULATING_MARKET_CAP") {
    if (typeof input.reportedValueAtoms !== "string" || !/^(0|[1-9]\d*)$/.test(input.reportedValueAtoms) || BigInt(input.reportedValueAtoms) >= 2n ** 256n || !Number.isSafeInteger(input.scale) || input.scale < 0 || input.scale > 36 || input.supplyBasis !== "CIRCULATING" || input.valueKind !== "PROVIDER_REPORTED" || !clean(input.providerMethodologyVersion, ID)) return null;
  } else {
    if (!array(input.venues, 64) || !time(input.windowStart) || !time(input.windowEnd) || input.windowEnd !== input.asOf || Date.parse(input.windowEnd) - Date.parse(input.windowStart) !== 86_400_000 || !clean(input.aggregationMethodologyVersion, ID) || input.duplicateMarketPolicy !== "CANONICAL_INSTRUMENT_DEDUPLICATION" || input.correctionPolicy !== "VERSIONED_RESTATEMENT" || typeof input.reportedValueAtoms !== "string" || !/^(0|[1-9]\d*)$/.test(input.reportedValueAtoms) || BigInt(input.reportedValueAtoms) >= 2n ** 256n || !Number.isSafeInteger(input.scale) || input.scale < 0 || input.scale > 36) return null;
    const keys = input.venues.map((v: any) => { if (!exact(v, ["venueId", "instrumentId", "marketType"]) || !clean(v.venueId, ID) || !clean(v.instrumentId, ID) || !["SPOT", "DEX_SPOT"].includes(v.marketType)) return null; return `${v.venueId}/${v.instrumentId}/${v.marketType}`; });
    if (keys.some((x: string | null) => x === null) || new Set(keys).size !== keys.length || [...keys].sort().some((x, i) => x !== keys[i]) || new Set(input.venues.map((v: any) => v.marketType)).size !== 1) return null;
  }
  if (input.sourceQualification.metricScopeFingerprint !== m5ScopedMetricQualificationScopeFingerprint(input)) return null;
  const material = Object.fromEntries(Object.entries(input).filter(([k]) => k !== "fingerprint" && k !== "recordedAt"));
  const fingerprint = canonicalSha256({ contractVersion: M5_SCOPED_MARKET_METRIC_CONTRACT_VERSION, ...material });
  if (input.fingerprint !== fingerprint) return null;
  const body = { ...material, fingerprint, materialId: `m5-scoped-market-metric:${fingerprint}` } as unknown as M5ScopedMarketMetricContract;
  return freeze({ ...body, recordedAt: input.recordedAt });
}

/** Scope proof a source qualification must cover; venue sets are intentionally material. */
export function m5ScopedMetricQualificationScopeFingerprint(input: Readonly<Record<string, any>>): string {
  const scope = input.metricKind === "NAMED_VENUE_DAILY_CLOSE"
    ? { metricKind: input.metricKind, providerId: input.providerId, datasetId: input.datasetId, datasetVersion: input.datasetVersion, canonicalAssetId: input.canonicalAssetId, mappingRevision: input.mappingRevision, chainId: input.chainId, representation: input.representation, currency: input.currency, venueId: input.venueId, instrumentId: input.instrumentId, baseAsset: input.baseAsset, quoteAsset: input.quoteAsset, marketType: input.marketType, timezone: input.timezone, sessionBoundary: input.sessionBoundary, candleInterval: input.candleInterval, closePriceBasis: input.closePriceBasis, correctionPolicy: input.correctionPolicy, gapPolicy: input.gapPolicy, methodologyVersion: input.methodologyVersion }
    : input.metricKind === "REPORTED_CIRCULATING_MARKET_CAP"
      ? { metricKind: input.metricKind, providerId: input.providerId, datasetId: input.datasetId, datasetVersion: input.datasetVersion, canonicalAssetId: input.canonicalAssetId, mappingRevision: input.mappingRevision, chainId: input.chainId, representation: input.representation, currency: input.currency, supplyBasis: input.supplyBasis, providerMethodologyVersion: input.providerMethodologyVersion }
      : { metricKind: input.metricKind, providerId: input.providerId, datasetId: input.datasetId, datasetVersion: input.datasetVersion, canonicalAssetId: input.canonicalAssetId, mappingRevision: input.mappingRevision, chainId: input.chainId, representation: input.representation, currency: input.currency, venues: input.venues, aggregationMethodologyVersion: input.aggregationMethodologyVersion, duplicateMarketPolicy: input.duplicateMarketPolicy, correctionPolicy: input.correctionPolicy };
  return canonicalSha256(scope);
}

/** Parse and normalize a versioned scoped metric. IDs/fingerprints exclude recordedAt. */
export function parseM5ScopedMarketMetricContract(input: unknown): M5ScopedMetricResult {
  try {
    if (!input || typeof input !== "object" || Object.getPrototypeOf(input) !== Object.prototype) return INVALID;
    const own = Reflect.ownKeys(input);
    if (own.some(k => typeof k !== "string") || own.some(k => { const d = Object.getOwnPropertyDescriptor(input, k); return !d || !("value" in d) || !!d.get || !!d.set; })) return INVALID;
    if (!Object.hasOwn(input, "contractVersion") || (input as any).contractVersion !== M5_SCOPED_MARKET_METRIC_CONTRACT_VERSION) return INVALID;
    const row = { ...(input as Record<string, unknown>) }; delete (row as any).contractVersion;
    const parsed = build(row); return parsed ? Object.freeze({ status: "VALID" as const, contract: parsed }) : INVALID;
  } catch { return INVALID; }
}

/** Side-effect-free gate. Qualification must be parser-authenticated and exactly match the contract scope. */
export function evaluateM5ScopedMarketMetricContract(contract: unknown, qualification: unknown): M5ScopedMetricGuardResult {
  const result = parseM5ScopedMarketMetricContract(contract);
  if (result.status !== "VALID") return Object.freeze({ status: "INVALID", blockers: ["M5_SCOPED_METRIC_CONTRACT_INVALID"] as const });
  const row = qualification as M5CoinGeckoMarketSourceQualification | null;
  if (!isAuthenticM5CoinGeckoMarketSourceQualification(row) || row.qualificationId !== result.contract.sourceQualification.qualificationId || row.qualificationFingerprint !== result.contract.sourceQualification.qualificationFingerprint || row.providerId !== result.contract.providerId || row.datasetId !== result.contract.datasetId || row.datasetVersion !== result.contract.datasetVersion || row.metric !== result.contract.sourceQualification.metric) return freeze({ status: "BLOCKED" as const, blockers: ["M5_SCOPED_METRIC_QUALIFICATION_MISMATCH"] });
  const blockers: string[] = [];
  if (row.status !== "QUALIFIED") blockers.push("M5_SCOPED_METRIC_QUALIFICATION_NOT_QUALIFIED");
  // The legacy CoinGecko qualification fingerprint has no binding for the scoped contract hash.
  blockers.push("M5_SCOPED_METRIC_QUALIFICATION_SCOPE_BINDING_UNAVAILABLE");
  // This pure guard does not resolve an authority record from the mapping repository.
  blockers.push("M5_SCOPED_METRIC_MAPPING_AUTHORITY_RUNTIME_PROOF_UNAVAILABLE");
  // The existing CoinGecko qualification is a contract-address aggregate, not a named venue or declared venue-set qualification.
  if (result.contract.metricKind === "NAMED_VENUE_DAILY_CLOSE") blockers.push("M5_SCOPED_METRIC_NAMED_VENUE_SCOPE_NOT_QUALIFIED");
  if (result.contract.metricKind === "DECLARED_VENUE_SET_ROLLING_24H_VOLUME") blockers.push("M5_SCOPED_METRIC_DECLARED_VENUE_SET_NOT_QUALIFIED");
  if (result.contract.metricKind === "REPORTED_CIRCULATING_MARKET_CAP" && result.contract.currency !== "USD") blockers.push("M5_SCOPED_METRIC_QUALIFICATION_CURRENCY_MISMATCH");
  if (result.contract.recordedAt < row.effectiveFrom || result.contract.recordedAt >= row.expiresAt) blockers.push("M5_SCOPED_METRIC_QUALIFICATION_INACTIVE");
  if (result.contract.chainId !== null && row.chainId !== result.contract.chainId) blockers.push("M5_SCOPED_METRIC_QUALIFICATION_SCOPE_MISMATCH");
  if (result.contract.representation === "WETH" && !result.contract.canonicalAssetId.toLowerCase().endsWith(`/erc20:${row.contractAddress}`)) blockers.push("M5_SCOPED_METRIC_QUALIFICATION_ASSET_MISMATCH");
  if (!result.contract.mappingAuthority || result.contract.mappingRevision === "UNMAPPED" || result.contract.mappingAuthority.canonicalAssetId !== result.contract.canonicalAssetId || result.contract.mappingAuthority.representation !== result.contract.representation || result.contract.mappingAuthority.revision !== result.contract.mappingRevision) blockers.push("M5_SCOPED_METRIC_ASSET_MAPPING_UNAUTHORIZED");
  if (blockers.length) return freeze({ status: "BLOCKED" as const, blockers: [...new Set(blockers)].sort() });
  return freeze({ status: "READY" as const, contract: result.contract });
}

/** Material identity helper used by fixtures and later ingestion adapters; recordedAt is excluded. */
export function fingerprintM5ScopedMarketMetricContract(input: Readonly<Record<string, unknown>>): string {
  const body = Object.fromEntries(Object.entries(input).filter(([k]) => k !== "contractVersion" && k !== "fingerprint" && k !== "materialId" && k !== "recordedAt"));
  return canonicalSha256({ contractVersion: M5_SCOPED_MARKET_METRIC_CONTRACT_VERSION, ...body });
}

/** Versioned product-direction config is descriptive only and cannot grant source readiness. */
export function parseM5ScopedMetricDirectionConfig(input: unknown): Readonly<{ status: "VALID"; config: M5ScopedMetricDirectionConfig }> | Readonly<{ status: "INVALID"; blocker: "M5_SCOPED_METRIC_DIRECTION_INVALID" }> {
  try {
    const keys = ["contractVersion", "reviewedAt", "decisions", "recordedAt"];
    if (!exact(input, keys) || input.contractVersion !== M5_SCOPED_METRIC_DIRECTION_VERSION || !time(input.reviewedAt) || !time(input.recordedAt) || !array(input.decisions, 3) || input.decisions.length !== 3) throw new Error();
    const decisions: M5ScopedMetricDirection[] = [];
    for (const raw of input.decisions) {
      if (!exact(raw, ["metricKind", "selectedDirection", "status", "blockers", "reviewedAt", "expiresAt", "recordedAt"]) || !M5_SCOPED_MARKET_METRICS.includes(raw.metricKind) || raw.selectedDirection !== raw.metricKind || raw.status !== "BLOCKED" || !array(raw.blockers, 16) || !time(raw.reviewedAt) || !time(raw.expiresAt) || raw.reviewedAt >= raw.expiresAt || raw.reviewedAt > input.reviewedAt || !time(raw.recordedAt)) throw new Error();
      const blockers = raw.blockers as string[];
      if (blockers.some(x => !clean(x, /^M5_[A-Z0-9_]+$/, 96)) || new Set(blockers).size !== blockers.length) throw new Error();
      const material = { metricKind: raw.metricKind, selectedDirection: raw.selectedDirection, status: raw.status, blockers: [...blockers].sort(), reviewedAt: raw.reviewedAt, expiresAt: raw.expiresAt };
      const fingerprint = canonicalSha256({ contractVersion: M5_SCOPED_METRIC_DIRECTION_VERSION, ...material });
      decisions.push(freeze({ ...material, decisionId: `m5-scoped-metric-direction:${fingerprint}`, fingerprint, recordedAt: raw.recordedAt }));
    }
    if (new Set(decisions.map(x => x.metricKind)).size !== 3 || M5_SCOPED_MARKET_METRICS.some(metric => !decisions.some(x => x.metricKind === metric))) throw new Error();
    decisions.sort((a, b) => a.metricKind.localeCompare(b.metricKind));
    const fingerprint = canonicalSha256({ contractVersion: M5_SCOPED_METRIC_DIRECTION_VERSION, reviewedAt: input.reviewedAt, decisions: decisions.map(x => Object.fromEntries(Object.entries(x).filter(([key]) => key !== "recordedAt"))) });
    return freeze({ status: "VALID" as const, config: { contractVersion: M5_SCOPED_METRIC_DIRECTION_VERSION, reviewedAt: input.reviewedAt, decisions, fingerprint, recordedAt: input.recordedAt } });
  } catch { return Object.freeze({ status: "INVALID" as const, blocker: "M5_SCOPED_METRIC_DIRECTION_INVALID" as const }); }
}
