import { canonicalSha256 } from "./ingestion-provenance";

export const M5_MARKET_METRIC_SOURCE_GAP_DECISION_VERSION = "m5-market-metric-source-gap-decision/v1" as const;
export const M5_MARKET_METRICS = Object.freeze(["DAILY_CLOSE_SERIES", "MARKET_CAP", "VOLUME_24H"] as const);
export type M5MarketMetric = typeof M5_MARKET_METRICS[number];
export type M5MarketSourceDecision = "EXTERNAL_PROVIDER" | "INTERNAL_DERIVATION" | "CONTRACT_CHANGE_REQUIRED" | "BLOCKED";
export type M5SourceEvidenceLevel = "DOCUMENTED" | "OBSERVED" | "INFERRED" | "UNKNOWN";
export type M5SourceApproval = "APPROVED" | "REQUIRES_APPROVAL" | "NOT_APPROVED" | "UNKNOWN" | "NOT_ASSESSED";
export type M5SourcePriceStatus = "PUBLIC" | "METERED" | "CUSTOM" | "UNKNOWN";
export const M5_SOURCE_USAGES = Object.freeze(["NETWORK_ACQUISITION", "RAW_PAYLOAD_PROCESSING", "RAW_PAYLOAD_STORAGE", "NORMALIZED_STORAGE", "AUTHORITY_PERSISTENCE", "REDISTRIBUTION", "COMMERCIAL_USE"] as const);
export type M5SourceUsage = typeof M5_SOURCE_USAGES[number];

export type M5MarketMetricSourceDecisionEvidence = Readonly<{
  url: string;
  title: string;
  evidenceLevel: M5SourceEvidenceLevel;
  checkedAt: string;
  claims: readonly string[];
}>;
export type M5SourceUsageApproval = Readonly<{ usage: M5SourceUsage; approval: M5SourceApproval }>;
export type M5MarketMetricSourceDecision = Readonly<{
  metric: M5MarketMetric;
  decision: M5MarketSourceDecision;
  recommendation: M5MarketSourceDecision;
  sourceCandidateId: string | null;
  methodologyId: string;
  sourceScope: string;
  requiredInputs: readonly string[];
  methodology: string;
  completeness: "PROVEN" | "PARTIAL" | "UNKNOWN";
  evidenceReferences: readonly M5MarketMetricSourceDecisionEvidence[];
  usageApprovals: readonly M5SourceUsageApproval[];
  retentionApproval: M5SourceApproval;
  pricing: Readonly<{ status: M5SourcePriceStatus; currency: "USD" | null; monthlyFrom: number | null; note: string }>;
  blockers: readonly string[];
  reviewedAt: string;
  expiresAt: string;
  decisionId: string;
  fingerprint: string;
  recordedAt: string;
}>;
export type M5MarketMetricSourceGapDecisionConfig = Readonly<{
  contractVersion: typeof M5_MARKET_METRIC_SOURCE_GAP_DECISION_VERSION;
  reviewedAt: string;
  decisions: readonly M5MarketMetricSourceDecision[];
  configFingerprint: string;
  recordedAt: string;
}>;
export type M5MarketMetricDecisionParseResult =
  | Readonly<{ status: "VALID"; config: M5MarketMetricSourceGapDecisionConfig }>
  | Readonly<{ status: "INVALID"; blocker: "M5_MARKET_SOURCE_DECISION_CONFIG_INVALID" }>;

const INVALID: M5MarketMetricDecisionParseResult = Object.freeze({ status: "INVALID", blocker: "M5_MARKET_SOURCE_DECISION_CONFIG_INVALID" });
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const APPROVALS = new Set<M5SourceApproval>(["APPROVED", "REQUIRES_APPROVAL", "NOT_APPROVED", "UNKNOWN", "NOT_ASSESSED"]);
const DECISIONS = new Set<M5MarketSourceDecision>(["EXTERNAL_PROVIDER", "INTERNAL_DERIVATION", "CONTRACT_CHANGE_REQUIRED", "BLOCKED"]);
const LEVELS = new Set<M5SourceEvidenceLevel>(["DOCUMENTED", "OBSERVED", "INFERRED", "UNKNOWN"]);
const USAGES = new Set<M5SourceUsage>(M5_SOURCE_USAGES);
const PRICES = new Set<M5SourcePriceStatus>(["PUBLIC", "METERED", "CUSTOM", "UNKNOWN"]);
const BLOCKER_CODES = new Set([
  "M5_DAILY_CLOSE_VENUE_AND_WETH_SYMBOL_UNDECIDED", "M5_COINAPI_WETH_INSTRUMENT_COVERAGE_UNVERIFIED", "M5_CORRECTIONS_AND_GAP_POLICY_UNPROVEN", "M5_PROVIDER_USAGE_AND_STORAGE_RIGHTS_UNAPPROVED",
  "M5_CURRENT_AUTHORITY_REQUIRES_MARKET_CAP_REPORTED_BASIS", "M5_TOTAL_WETH_SUPPLY_IS_NOT_CIRCULATING_SUPPLY", "M5_PRICE_SOURCE_AND_SAME_AS_OF_BINDING_UNSELECTED", "M5_ARCHIVE_STATE_AND_FINALITY_POLICY_UNSPECIFIED", "M5_CONTRACT_CHANGE_AND_PRODUCT_APPROVAL_REQUIRED",
  "M5_EXACT_ROLLING_WINDOW_START_END_NOT_PROVEN", "M5_AS_OF_BINDING_AND_HISTORICAL_COVERAGE_UNPROVEN", "M5_SPOT_VENUE_UNIVERSE_AND_EXCLUSIONS_UNDECIDED", "M5_UTC_BUCKET_SUBSTITUTION_REQUIRES_CONTRACT_CHANGE",
]);
const HOSTS = new Set(["docs.coingecko.com", "www.coingecko.com", "coinmarketcap.com", "www.coinmarketcap.com", "pro.coinmarketcap.com", "support.coinmarketcap.com", "www.coinapi.io", "rest.coinapi.io", "www.kaiko.com", "marketing.kaiko.com", "developers.binance.com", "eips.ethereum.org", "ethereum.org", "ercs.ethereum.org"]);
const CANDIDATE_METRIC: Readonly<Record<string, M5MarketMetric>> = Object.freeze({
  "coinapi-venue-candles": "DAILY_CLOSE_SERIES",
  "ethereum-weth-total-supply-times-approved-price": "MARKET_CAP",
  "coinmarketcap-spot-volume-candidate": "VOLUME_24H",
});
const CANDIDATE_METHODOLOGY: Readonly<Record<string, string>> = Object.freeze({
  "coinapi-venue-candles": "SINGLE_VENUE_UTC_1DAY_CLOSE_V1",
  "ethereum-weth-total-supply-times-approved-price": "WETH_TOTAL_SUPPLY_X_APPROVED_PRICE_V1",
  "coinmarketcap-spot-volume-candidate": "CMC_AGGREGATE_SPOT_ROLLING_24H_CANDIDATE_V1",
});
const CANDIDATE_HOSTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "coinapi-venue-candles": Object.freeze(["www.coinapi.io"]),
  "ethereum-weth-total-supply-times-approved-price": Object.freeze(["eips.ethereum.org", "ethereum.org", "docs.coingecko.com", "www.coingecko.com"]),
  "coinmarketcap-spot-volume-candidate": Object.freeze(["support.coinmarketcap.com", "coinmarketcap.com", "www.coinmarketcap.com", "docs.coingecko.com"]),
});

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  try {
    if (typeof value !== "object" || value === null || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const own = Reflect.ownKeys(value);
    return own.length === keys.length && own.every(key => typeof key === "string" && keys.includes(key) && Object.hasOwn(value, key) && (() => { const d = Object.getOwnPropertyDescriptor(value, key); return !!d && "value" in d && d.get === undefined && d.set === undefined; })());
  } catch { return false; }
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && UTC.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function safeText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && value.trim() === value && !/(?:api[_-]?key|access[_-]?token|authorization|bearer|password|secret|credential|terms[_-]?text)/i.test(value);
}
function strings(value: unknown, allowEmpty = false): value is string[] {
  return strictArray(value) && (allowEmpty || value.length > 0) && value.every(item => safeText(item, 512)) && new Set(value).size === value.length;
}
function strictArray(value: unknown, maxLength = 128): value is unknown[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maxLength) return false;
    const own = Reflect.ownKeys(value);
    if (own.some(key => typeof key !== "string")) return false;
    if (own.length !== value.length + 1 || !own.includes("length")) return false;
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) return false;
    }
    return own.every(key => typeof key === "string" && (key === "length" || (/^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length)));
  } catch { return false; }
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function safeUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && HOSTS.has(url.hostname) && !url.port && !url.username && !url.password && !url.search && !url.hash && !/(?:api[_-]?key|access[_-]?token|authorization|bearer|password|secret|credential)/i.test(url.pathname) && url.href === value;
  } catch { return false; }
}
const evidenceKeys = ["url", "title", "evidenceLevel", "checkedAt", "claims"] as const;
const decisionKeys = ["metric", "decision", "recommendation", "sourceCandidateId", "methodologyId", "sourceScope", "requiredInputs", "methodology", "completeness", "evidenceReferences", "usageApprovals", "retentionApproval", "pricing", "blockers", "reviewedAt", "expiresAt", "recordedAt"] as const;

function parseEvidence(input: unknown, reviewedAt: string): M5MarketMetricSourceDecisionEvidence | null {
  if (!exact(input, evidenceKeys)) return null;
  if (!safeUrl(input.url) || !safeText(input.title, 256) || !LEVELS.has(input.evidenceLevel as M5SourceEvidenceLevel) || !timestamp(input.checkedAt) || input.checkedAt > reviewedAt || !strings(input.claims)) return null;
  return freeze({ url: input.url, title: input.title, evidenceLevel: input.evidenceLevel as M5SourceEvidenceLevel, checkedAt: input.checkedAt, claims: [...input.claims as string[]].sort() });
}
function parseDecision(input: unknown, configReviewedAt: string): M5MarketMetricSourceDecision | null {
  if (!exact(input, decisionKeys)) return null;
  if (!M5_MARKET_METRICS.includes(input.metric as M5MarketMetric) || !DECISIONS.has(input.decision as M5MarketSourceDecision) || !DECISIONS.has(input.recommendation as M5MarketSourceDecision)) return null;
  if (!(input.sourceCandidateId === null || (typeof input.sourceCandidateId === "string" && /^[a-z0-9][a-z0-9-]{1,63}$/.test(input.sourceCandidateId)))) return null;
  if (typeof input.methodologyId !== "string" || !/^[A-Z0-9_]{3,96}$/.test(input.methodologyId)) return null;
  if (!safeText(input.sourceScope, 256) || !safeText(input.methodology, 2048)) return null;
  if (!strings(input.requiredInputs) || !strings(input.blockers, true) || (input.blockers as string[]).some(code => !BLOCKER_CODES.has(code)) || !["PROVEN", "PARTIAL", "UNKNOWN"].includes(String(input.completeness))) return null;
  if (!APPROVALS.has(input.retentionApproval as M5SourceApproval) || !strictArray(input.usageApprovals, M5_SOURCE_USAGES.length) || input.usageApprovals.length !== M5_SOURCE_USAGES.length) return null;
  const usageApprovals: M5SourceUsageApproval[] = [];
  for (const item of input.usageApprovals) {
    if (!exact(item, ["usage", "approval"]) || !USAGES.has(item.usage as M5SourceUsage) || !APPROVALS.has(item.approval as M5SourceApproval)) return null;
    usageApprovals.push(freeze({ usage: item.usage as M5SourceUsage, approval: item.approval as M5SourceApproval }));
  }
  if (new Set(usageApprovals.map(item => item.usage)).size !== M5_SOURCE_USAGES.length) return null;
  if (!timestamp(input.reviewedAt) || !timestamp(input.expiresAt) || !timestamp(input.recordedAt) || input.reviewedAt > configReviewedAt || input.reviewedAt >= input.expiresAt) return null;
  if (!strictArray(input.evidenceReferences, 32) || input.evidenceReferences.length === 0) return null;
  const evidence = input.evidenceReferences.map(item => parseEvidence(item, input.reviewedAt as string));
  if (evidence.some(item => item === null) || new Set(evidence.map(item => item!.url)).size !== evidence.length) return null;
  if (input.sourceCandidateId !== null && (CANDIDATE_METRIC[input.sourceCandidateId] !== input.metric || CANDIDATE_METHODOLOGY[input.sourceCandidateId] !== input.methodologyId || !(evidence as M5MarketMetricSourceDecisionEvidence[]).some(item => CANDIDATE_HOSTS[input.sourceCandidateId as string]?.includes(new URL(item.url).hostname)))) return null;
  if (!exact(input.pricing, ["status", "currency", "monthlyFrom", "note"])) return null;
  const pricing = input.pricing;
  if (!PRICES.has(pricing.status as M5SourcePriceStatus) || !(pricing.currency === null || pricing.currency === "USD") || !(pricing.monthlyFrom === null || (Number.isSafeInteger(pricing.monthlyFrom) && (pricing.monthlyFrom as number) >= 0)) || !safeText(pricing.note, 512)) return null;
  if ((pricing.status === "UNKNOWN" || pricing.status === "CUSTOM") && (pricing.currency !== null || pricing.monthlyFrom !== null)) return null;
  if (pricing.status === "PUBLIC" && (pricing.currency !== "USD" || pricing.monthlyFrom === null)) return null;
  if (pricing.status === "METERED" && pricing.currency !== "USD") return null;
  const blockers = [...input.blockers as string[]].sort();
  // A decision cannot claim completeness or approval based on inferred/unknown evidence.
  const refs = evidence as M5MarketMetricSourceDecisionEvidence[];
  if (input.decision !== "BLOCKED" && (input.completeness !== "PROVEN" || refs.some(item => item.evidenceLevel === "UNKNOWN" || item.evidenceLevel === "INFERRED") || usageApprovals.some(item => item.approval !== "APPROVED") || input.retentionApproval !== "APPROVED" || blockers.length > 0)) return null;
  const body = {
    metric: input.metric as M5MarketMetric, decision: input.decision as M5MarketSourceDecision, recommendation: input.recommendation as M5MarketSourceDecision,
    sourceCandidateId: input.sourceCandidateId as string | null, methodologyId: input.methodologyId, sourceScope: input.sourceScope, requiredInputs: [...input.requiredInputs as string[]].sort(), methodology: input.methodology,
    completeness: input.completeness as M5MarketMetricSourceDecision["completeness"], evidenceReferences: refs.sort((a, b) => a.url.localeCompare(b.url)),
    usageApprovals: usageApprovals.sort((a, b) => a.usage.localeCompare(b.usage)), retentionApproval: input.retentionApproval as M5SourceApproval,
    pricing: freeze({ status: pricing.status as M5SourcePriceStatus, currency: pricing.currency as "USD" | null, monthlyFrom: pricing.monthlyFrom as number | null, note: pricing.note }),
    blockers, reviewedAt: input.reviewedAt, expiresAt: input.expiresAt,
  };
  const fingerprint = canonicalSha256({ contractVersion: M5_MARKET_METRIC_SOURCE_GAP_DECISION_VERSION, ...body });
  return freeze({ ...body, decisionId: `m5-market-source-decision:${fingerprint}`, fingerprint, recordedAt: input.recordedAt });
}

/** Strictly parse immutable decision records. The parser does not grant provider, usage, or persistence authority. */
export function parseM5MarketMetricSourceGapDecisionConfig(input: unknown): M5MarketMetricDecisionParseResult {
  try {
    if (!exact(input, ["contractVersion", "reviewedAt", "decisions", "recordedAt"])) return INVALID;
    if (input.contractVersion !== M5_MARKET_METRIC_SOURCE_GAP_DECISION_VERSION || !timestamp(input.reviewedAt) || !timestamp(input.recordedAt) || !strictArray(input.decisions, M5_MARKET_METRICS.length) || input.decisions.length !== M5_MARKET_METRICS.length) return INVALID;
    const parsed = input.decisions.map(item => parseDecision(item, input.reviewedAt as string));
    if (parsed.some(item => item === null)) return INVALID;
    const decisions = (parsed as M5MarketMetricSourceDecision[]).sort((a, b) => a.metric.localeCompare(b.metric));
    if (new Set(decisions.map(item => item.metric)).size !== decisions.length) return INVALID;
    const configFingerprint = canonicalSha256({ contractVersion: M5_MARKET_METRIC_SOURCE_GAP_DECISION_VERSION, reviewedAt: input.reviewedAt, decisions: decisions.map(item => Object.fromEntries(Object.entries(item).filter(([key]) => key !== "recordedAt"))) });
    return freeze({ status: "VALID" as const, config: freeze({ contractVersion: M5_MARKET_METRIC_SOURCE_GAP_DECISION_VERSION, reviewedAt: input.reviewedAt, decisions, configFingerprint, recordedAt: input.recordedAt }) });
  } catch { return INVALID; }
}

/** Production config is deliberately incapable of turning this advisory record into READY. */
export function evaluateM5MarketMetricSourceGapDecision(config: M5MarketMetricSourceGapDecisionConfig, metric: M5MarketMetric, at: string): Readonly<{ status: "BLOCKED"; blockers: readonly string[]; decision: M5MarketMetricSourceDecision | null }> {
  const decision = config.decisions.find(item => item.metric === metric) ?? null;
  const blockers = [...(decision?.blockers ?? ["M5_MARKET_SOURCE_DECISION_MISSING"])];
  if (!timestamp(at) || at < config.reviewedAt || !decision || at >= decision.expiresAt) blockers.push("M5_MARKET_SOURCE_DECISION_REVIEW_INACTIVE");
  if (decision?.decision === "BLOCKED" || decision?.retentionApproval !== "APPROVED" || decision?.usageApprovals.some(item => item.approval !== "APPROVED")) blockers.push("M5_MARKET_SOURCE_DECISION_NOT_AUTHORIZED");
  return freeze({ status: "BLOCKED" as const, blockers: [...new Set(blockers)].sort(), decision });
}
