import { canonicalSha256 } from "./ingestion-provenance";

export const M5_COINGECKO_MARKET_SOURCE_QUALIFICATION_VERSION = "m5-coingecko-market-source-qualification/v1" as const;
export const M5_COINGECKO_ENDPOINT_PROFILE = "COINGECKO_ETHEREUM_CONTRACT_MARKET_CHART_RANGE_PRO" as const;
export const M5_COINGECKO_QUERY_PROFILE = "COINGECKO_MARKET_CHART_USD_DAILY" as const;
export const M5_COINGECKO_WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" as const;
export const M5_COINGECKO_METRICS = ["DAILY_CLOSE_SERIES", "MARKET_CAP", "VOLUME_24H"] as const;
export type M5CoinGeckoMarketMetric = typeof M5_COINGECKO_METRICS[number];
export type M5CoinGeckoQualificationStatus = "QUALIFIED" | "PARTIAL" | "BLOCKED";

export const M5_COINGECKO_REQUIRED_SEMANTICS: Readonly<Record<M5CoinGeckoMarketMetric, readonly string[]>> = Object.freeze({
  DAILY_CLOSE_SERIES: Object.freeze(["UTC_DAILY_BOUNDARY", "DAILY_CLOSE_DEFINITION", "CADENCE_AND_HISTORY_COMPLETENESS", "GAP_AND_DUPLICATE_POLICY"]),
  MARKET_CAP: Object.freeze(["MARKET_CAP_FORMULA_AND_BASIS", "QUOTE_CURRENCY", "OBSERVATION_TIME_AND_AS_OF", "MISSING_VALUE_POLICY", "DECIMAL_SCALE"]),
  VOLUME_24H: Object.freeze(["EXACT_ROLLING_24H_WINDOW", "WINDOW_END_BINDS_AS_OF", "QUOTE_CURRENCY", "MARKET_UNIVERSE_COMPLETENESS", "DECIMAL_SCALE"]),
});

const PROVIDER_SEMANTICS = new Set([
  "RANGE_ENDPOINT_RETURNS_PRICES_MARKET_CAPS_TOTAL_VOLUMES",
  "DATA_POINTS_ARE_TIMESTAMP_VALUE_PAIRS",
  "VS_CURRENCY_SELECTS_TARGET_MARKET_CURRENCY",
  "AUTO_GRANULARITY_DAILY_ABOVE_90_DAYS_AT_00_00_UTC",
  "LAST_COMPLETED_UTC_DAY_AVAILABLE_AT_00_35_UTC",
  "PRO_REQUIRES_PRO_HOST_AND_HEADER_KEY",
  "DEMO_USES_PUBLIC_HOST_AND_DEMO_HEADER_KEY",
  "DOCUMENTATION_DOES_NOT_DEFINE_DAILY_CLOSE_FORMULA",
  "DOCUMENTATION_DOES_NOT_DEFINE_MARKET_CAP_FORMULA_OR_NULL_POLICY",
  "DOCUMENTATION_DOES_NOT_DEFINE_ROLLING_24H_WINDOW",
  "DOCUMENTATION_DOES_NOT_PROVE_COMPLETE_ASSET_OR_MARKET_COVERAGE",
  "DOCUMENTATION_DOES_NOT_DEFINE_RESPONSE_TIMESTAMP_AS_OF_RULE",
  "TERMS_RESTRICT_DATA_COPY_STORAGE_AND_DERIVATION",
  "M5_UTC_DAILY_BOUNDARY_DOCUMENTED",
  "M5_DAILY_CLOSE_DEFINITION_DOCUMENTED",
  "M5_CADENCE_AND_HISTORY_COMPLETENESS_DOCUMENTED",
  "M5_GAP_AND_DUPLICATE_POLICY_DOCUMENTED",
  "M5_MARKET_CAP_FORMULA_AND_BASIS_DOCUMENTED",
  "M5_QUOTE_CURRENCY_DOCUMENTED",
  "M5_OBSERVATION_TIME_AND_AS_OF_DOCUMENTED",
  "M5_MISSING_VALUE_POLICY_DOCUMENTED",
  "M5_DECIMAL_SCALE_DOCUMENTED",
  "M5_EXACT_ROLLING_24H_WINDOW_DOCUMENTED",
  "M5_WINDOW_END_BINDS_AS_OF_DOCUMENTED",
  "M5_MARKET_UNIVERSE_COMPLETENESS_DOCUMENTED",
]);
const BLOCKERS = new Set([
  "M5_CLOSE_PRICE_SEMANTICS_NOT_DOCUMENTED",
  "M5_DAILY_CADENCE_AND_COMPLETE_HISTORY_NOT_PROVEN",
  "M5_MARKET_CAP_BASIS_AND_NULL_POLICY_NOT_DOCUMENTED",
  "M5_MARKET_CAP_AS_OF_AND_CURRENCY_BASIS_NOT_FULLY_PROVEN",
  "M5_VOLUME_EXACT_ROLLING_24H_WINDOW_NOT_DOCUMENTED",
  "M5_VOLUME_MARKET_UNIVERSE_COMPLETENESS_NOT_PROVEN",
  "M5_PROVIDER_DATA_USAGE_AND_RETENTION_APPROVAL_REQUIRED",
]);

export type M5CoinGeckoQualificationEvidence = Readonly<{
  url: string;
  title: string;
  evidenceLevel: "DOCUMENTED" | "OBSERVED" | "INFERRED" | "UNKNOWN";
  checkedAt: string;
  claims: readonly string[];
}>;
export type M5CoinGeckoMarketSourceQualification = Readonly<{
  contractVersion: typeof M5_COINGECKO_MARKET_SOURCE_QUALIFICATION_VERSION;
  qualificationId: string;
  qualificationFingerprint: string;
  providerId: "coingecko";
  datasetId: "coingecko-market-chart";
  datasetVersion: "coingecko-market-chart/range-v1";
  endpointProfile: typeof M5_COINGECKO_ENDPOINT_PROFILE;
  queryProfile: typeof M5_COINGECKO_QUERY_PROFILE;
  endpointHost: "pro-api.coingecko.com";
  endpointPath: "/api/v3/coins/ethereum/contract/{address}/market_chart/range";
  chainId: "eip155:1";
  assetSymbol: "WETH";
  contractAddress: typeof M5_COINGECKO_WETH_ADDRESS;
  metric: M5CoinGeckoMarketMetric;
  providerField: "prices" | "market_caps" | "total_volumes";
  requiredM5Semantics: readonly string[];
  documentedProviderSemantics: readonly string[];
  evidenceReferences: readonly M5CoinGeckoQualificationEvidence[];
  reviewedAt: string;
  effectiveFrom: string;
  expiresAt: string;
  blockers: readonly string[];
  status: M5CoinGeckoQualificationStatus;
  recordedAt: string;
}>;
export type M5CoinGeckoQualificationParseResult =
  | Readonly<{ status: "VALID"; qualification: M5CoinGeckoMarketSourceQualification }>
  | Readonly<{ status: "INVALID"; blockers: readonly ["M5_CG_QUALIFICATION_INVALID"] }>;

const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};
const INVALID: M5CoinGeckoQualificationParseResult = freeze({ status: "INVALID" as const, blockers: ["M5_CG_QUALIFICATION_INVALID"] as const });
const authenticQualifications = new WeakSet<object>();
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  try {
    if (typeof value !== "object" || value === null || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some(key => typeof key !== "string") || ownKeys.length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return false;
    return ownKeys.every(key => { const descriptor = Object.getOwnPropertyDescriptor(value, key); return descriptor !== undefined && "value" in descriptor && descriptor.get === undefined && descriptor.set === undefined; });
  } catch { return false; }
};
const time = (value: unknown): value is string => typeof value === "string" && UTC.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const canonicalSet = (value: unknown, allowed?: Set<string>, allowEmpty = false): value is string[] => Array.isArray(value) && (allowEmpty || value.length > 0) && value.every(item => typeof item === "string" && item.length > 0 && item.trim() === item && (allowed === undefined || allowed.has(item))) && new Set(value).size === value.length;
const FIELD: Readonly<Record<M5CoinGeckoMarketMetric, "prices" | "market_caps" | "total_volumes">> = Object.freeze({ DAILY_CLOSE_SERIES: "prices", MARKET_CAP: "market_caps", VOLUME_24H: "total_volumes" });
export const M5_COINGECKO_REQUIRED_PROOFS: Readonly<Record<string, string>> = Object.freeze({
  UTC_DAILY_BOUNDARY: "M5_UTC_DAILY_BOUNDARY_DOCUMENTED",
  DAILY_CLOSE_DEFINITION: "M5_DAILY_CLOSE_DEFINITION_DOCUMENTED",
  CADENCE_AND_HISTORY_COMPLETENESS: "M5_CADENCE_AND_HISTORY_COMPLETENESS_DOCUMENTED",
  GAP_AND_DUPLICATE_POLICY: "M5_GAP_AND_DUPLICATE_POLICY_DOCUMENTED",
  MARKET_CAP_FORMULA_AND_BASIS: "M5_MARKET_CAP_FORMULA_AND_BASIS_DOCUMENTED",
  QUOTE_CURRENCY: "M5_QUOTE_CURRENCY_DOCUMENTED",
  OBSERVATION_TIME_AND_AS_OF: "M5_OBSERVATION_TIME_AND_AS_OF_DOCUMENTED",
  MISSING_VALUE_POLICY: "M5_MISSING_VALUE_POLICY_DOCUMENTED",
  DECIMAL_SCALE: "M5_DECIMAL_SCALE_DOCUMENTED",
  EXACT_ROLLING_24H_WINDOW: "M5_EXACT_ROLLING_24H_WINDOW_DOCUMENTED",
  WINDOW_END_BINDS_AS_OF: "M5_WINDOW_END_BINDS_AS_OF_DOCUMENTED",
  MARKET_UNIVERSE_COMPLETENESS: "M5_MARKET_UNIVERSE_COMPLETENESS_DOCUMENTED",
});

/** Strictly parses a declarative record. Its result is data, not runtime trust. */
function parseQualification(input: unknown): M5CoinGeckoQualificationParseResult {
  const keys = ["contractVersion", "providerId", "datasetId", "datasetVersion", "endpointProfile", "queryProfile", "endpointHost", "endpointPath", "chainId", "assetSymbol", "contractAddress", "metric", "providerField", "requiredM5Semantics", "documentedProviderSemantics", "evidenceReferences", "reviewedAt", "effectiveFrom", "expiresAt", "blockers", "recordedAt"] as const;
  if (!exact(input, keys)) return INVALID;
  const row = input;
  if (row.contractVersion !== M5_COINGECKO_MARKET_SOURCE_QUALIFICATION_VERSION || row.providerId !== "coingecko" || row.datasetId !== "coingecko-market-chart" || row.datasetVersion !== "coingecko-market-chart/range-v1" || row.endpointProfile !== M5_COINGECKO_ENDPOINT_PROFILE || row.queryProfile !== M5_COINGECKO_QUERY_PROFILE || row.endpointHost !== "pro-api.coingecko.com" || row.endpointPath !== "/api/v3/coins/ethereum/contract/{address}/market_chart/range" || row.chainId !== "eip155:1" || row.assetSymbol !== "WETH" || row.contractAddress !== M5_COINGECKO_WETH_ADDRESS) return INVALID;
  if (!M5_COINGECKO_METRICS.includes(row.metric as M5CoinGeckoMarketMetric) || row.providerField !== FIELD[row.metric as M5CoinGeckoMarketMetric]) return INVALID;
  const metric = row.metric as M5CoinGeckoMarketMetric;
  if (!Array.isArray(row.requiredM5Semantics) || row.requiredM5Semantics.length !== M5_COINGECKO_REQUIRED_SEMANTICS[metric].length || row.requiredM5Semantics.some((item, index) => item !== M5_COINGECKO_REQUIRED_SEMANTICS[metric][index])) return INVALID;
  if (!canonicalSet(row.documentedProviderSemantics, PROVIDER_SEMANTICS, true) || !canonicalSet(row.blockers, BLOCKERS, true)) return INVALID;
  if (!time(row.reviewedAt) || !time(row.effectiveFrom) || !time(row.expiresAt) || !time(row.recordedAt) || row.reviewedAt > row.effectiveFrom || row.effectiveFrom >= row.expiresAt) return INVALID;
  if (!Array.isArray(row.evidenceReferences) || row.evidenceReferences.length === 0) return INVALID;
  const evidenceKeys = ["url", "title", "evidenceLevel", "checkedAt", "claims"] as const;
  const evidence: M5CoinGeckoQualificationEvidence[] = [];
  for (const candidate of row.evidenceReferences) {
    if (!exact(candidate, evidenceKeys)) return INVALID;
    const item = candidate;
    if (typeof item.url !== "string" || typeof item.title !== "string" || item.title.length === 0 || item.title.trim() !== item.title || item.title.length > 256 || !["DOCUMENTED", "OBSERVED", "INFERRED", "UNKNOWN"].includes(String(item.evidenceLevel)) || !time(item.checkedAt) || item.checkedAt > row.reviewedAt || !canonicalSet(item.claims, PROVIDER_SEMANTICS)) return INVALID;
    let url: URL;
    try { url = new URL(item.url); } catch { return INVALID; }
    if (url.protocol !== "https:" || !["docs.coingecko.com", "www.coingecko.com"].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash || url.href !== item.url) return INVALID;
    evidence.push(freeze({ url: item.url, title: item.title, evidenceLevel: item.evidenceLevel as M5CoinGeckoQualificationEvidence["evidenceLevel"], checkedAt: item.checkedAt, claims: [...item.claims] }));
  }
  if (new Set(evidence.map(item => item.url)).size !== evidence.length) return INVALID;
  const evidenceSorted = evidence.map(item => ({ ...item, claims: [...item.claims].sort() })).sort((left, right) => left.url.localeCompare(right.url));
  const claimSet = new Set(evidenceSorted.filter(item => item.evidenceLevel === "DOCUMENTED").flatMap(item => item.claims));
  if ((row.documentedProviderSemantics as string[]).some(claim => !claimSet.has(claim))) return INVALID;
  const documented = [...row.documentedProviderSemantics as string[]].sort();
  const blockers = [...row.blockers as string[]].sort();
  const allRequiredDocumented = M5_COINGECKO_REQUIRED_SEMANTICS[metric].every(semantic => documented.includes(M5_COINGECKO_REQUIRED_PROOFS[semantic]!));
  const status: M5CoinGeckoQualificationStatus = blockers.length === 0 && allRequiredDocumented ? "QUALIFIED" : documented.length === 0 ? "BLOCKED" : "PARTIAL";
  if (status !== "QUALIFIED" && blockers.length === 0) return INVALID;
  const body = {
    contractVersion: M5_COINGECKO_MARKET_SOURCE_QUALIFICATION_VERSION,
    providerId: "coingecko" as const, datasetId: "coingecko-market-chart" as const,
    datasetVersion: "coingecko-market-chart/range-v1" as const, endpointProfile: M5_COINGECKO_ENDPOINT_PROFILE, queryProfile: M5_COINGECKO_QUERY_PROFILE,
    endpointHost: "pro-api.coingecko.com" as const, endpointPath: "/api/v3/coins/ethereum/contract/{address}/market_chart/range" as const,
    chainId: "eip155:1" as const, assetSymbol: "WETH" as const, contractAddress: M5_COINGECKO_WETH_ADDRESS,
    metric, providerField: FIELD[metric], requiredM5Semantics: [...row.requiredM5Semantics as string[]],
    documentedProviderSemantics: documented, evidenceReferences: evidenceSorted,
    reviewedAt: row.reviewedAt, effectiveFrom: row.effectiveFrom, expiresAt: row.expiresAt,
    blockers, status,
  };
  const qualificationFingerprint = canonicalSha256(body);
  const qualification = freeze({ ...body, qualificationId: `m5-coingecko-market-source-qualification:${qualificationFingerprint}`, qualificationFingerprint, recordedAt: row.recordedAt });
  authenticQualifications.add(qualification);
  return freeze({ status: "VALID", qualification });
}

/** Runtime-local provenance check for guards that consume parsed qualifications. */
export function isAuthenticM5CoinGeckoMarketSourceQualification(value: unknown): value is M5CoinGeckoMarketSourceQualification {
  return typeof value === "object" && value !== null && authenticQualifications.has(value);
}

export function parseM5CoinGeckoMarketSourceQualification(input: unknown): M5CoinGeckoQualificationParseResult {
  try { return parseQualification(input); } catch { return INVALID; }
}

export function isM5CoinGeckoQualificationActive(value: M5CoinGeckoMarketSourceQualification, asOf: string): boolean {
  return time(asOf) && value.reviewedAt <= asOf && value.effectiveFrom <= asOf && asOf < value.expiresAt;
}
