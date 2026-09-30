import "server-only";
import { canonicalSha256 } from "./ingestion-provenance";

export const EVENT_INTELLIGENCE_SOURCE_DECISION_VERSION = "event-intelligence-source-decision/v1" as const;
export const EVENT_INTELLIGENCE_EVENT_TYPES = Object.freeze([
  "PURCHASE_INTENT_ANNOUNCED", "BOARD_AUTHORIZATION", "FINANCING_ANNOUNCED", "DEFINITIVE_PURCHASE_AGREEMENT", "PURCHASE_COMPLETED", "HOLDING_DISCLOSED", "SALE_INTENT_ANNOUNCED", "SALE_COMPLETED", "POLICY_REVERSED_OR_CANCELLED",
  "ACQUISITION_RUMOR", "NON_BINDING_PROPOSAL", "DEFINITIVE_AGREEMENT", "REGULATORY_APPROVAL", "SHAREHOLDER_APPROVAL", "TRANSACTION_COMPLETED", "TRANSACTION_TERMINATED",
  "MATERIAL_PARTNERSHIP", "PRODUCT_OR_NETWORK_LAUNCH", "SECURITY_INCIDENT", "REGULATORY_ACTION", "EXCHANGE_LISTING_OR_DELISTING", "CORRECTION_OR_RETRACTION",
] as const);
export const EVENT_INTELLIGENCE_USAGES = Object.freeze(["RAW_ACQUISITION", "RAW_ARTIFACT_STORAGE", "NORMALIZED_CLAIM_STORAGE", "AUTHORITY_ISSUANCE", "REDISTRIBUTION", "COMMERCIAL_USE", "SIGNAL_RESEARCH"] as const);
export const SEC_8K_ITEM_SEMANTICS = Object.freeze({
  "1.01": Object.freeze({ meaning: "MATERIAL_DEFINITIVE_AGREEMENT_ENTERED", completionProven: false }),
  "2.01": Object.freeze({ meaning: "SIGNIFICANT_ASSET_ACQUISITION_OR_DISPOSITION_CONSUMMATED", completionProven: true }),
} as const);
export type EventIntelligenceEventType = typeof EVENT_INTELLIGENCE_EVENT_TYPES[number];
export type EventIntelligenceUsage = typeof EVENT_INTELLIGENCE_USAGES[number];
export type EventIntelligenceSourceDecision = Readonly<{
  contractVersion: typeof EVENT_INTELLIGENCE_SOURCE_DECISION_VERSION;
  sourceId: string; sourceKind: "REGULATORY_FILING" | "ISSUER_CONTROLLED" | "EXCHANGE_OR_REGULATOR" | "ISSUER_DISTRIBUTOR" | "DISCOVERY_AGGREGATOR";
  authorityTier: "REGULATORY_PRIMARY" | "ISSUER_PRIMARY" | "EXCHANGE_OR_REGULATOR_PRIMARY" | "ISSUER_DISTRIBUTION" | "DISCOVERY_ONLY";
  decisionStatus: "CANDIDATE_AUTHORITATIVE" | "CANDIDATE_CORROBORATION" | "DISCOVERY_ONLY" | "BLOCKED";
  jurisdictions: readonly string[]; issuerCoverage: "SEC_FILERS" | "ISSUER_SPECIFIC" | "LISTED_ISSUERS_JURISDICTION" | "AGGREGATED_GLOBAL" | "UNKNOWN";
  supportedForms: readonly string[]; supportedEventTypes: readonly EventIntelligenceEventType[]; stableIdentifiers: readonly string[]; timestampSemantics: readonly string[];
  correctionRetraction: "EXPLICIT_VERSIONED" | "PARTIAL" | "UNKNOWN"; paginationHistory: "DOCUMENTED_BOUNDED" | "DOCUMENTED_ARCHIVE" | "UNKNOWN";
  completeness: "PROVEN_FOR_SCOPE" | "PARTIAL" | "UNKNOWN"; latency: "DOCUMENTED_NEAR_REAL_TIME" | "DOCUMENTED_DELAYED" | "UNKNOWN";
  requiredRequestIdentity: "DECLARED_USER_AGENT" | "ISSUER_ORIGIN_AND_DOCUMENT_ID" | "PROVIDER_CREDENTIAL" | "NONE_DOCUMENTED" | "UNKNOWN";
  rawStoragePolicy: "NOT_APPROVED" | "UNKNOWN"; normalizedStoragePolicy: "NOT_APPROVED" | "UNKNOWN";
  usageApprovals: readonly Readonly<{ usage: EventIntelligenceUsage; approval: "NOT_APPROVED" | "REQUIRES_REVIEW" | "APPROVED" }>[];
  retentionApproval: "NOT_APPROVED" | "REQUIRES_REVIEW" | "APPROVED"; redistributionApproval: "NOT_APPROVED" | "REQUIRES_REVIEW" | "APPROVED"; commercialApproval: "NOT_APPROVED" | "REQUIRES_REVIEW" | "APPROVED";
  pricing: Readonly<{ status: "NO_FEE_DOCUMENTED" | "PUBLIC_PLAN" | "CUSTOM" | "UNKNOWN"; note: string }>;
  evidenceReferences: readonly Readonly<{ url: string; title: string; checkedAt: string; classification: "DOCUMENTED" | "OBSERVED" | "INFERRED" | "UNKNOWN"; claims: readonly string[] }>[];
  blockers: readonly string[]; reviewedAt: string; effectiveFrom: string; expiresAt: string; recordedAt: string;
  decisionId: string; fingerprint: string;
}>;
export type EventIntelligenceSourceDecisionParse = Readonly<{ status: "VALID"; decision: EventIntelligenceSourceDecision }> | Readonly<{ status: "INVALID"; blocker: "EVENT_INTELLIGENCE_SOURCE_DECISION_INVALID" }>;

const INVALID: EventIntelligenceSourceDecisionParse = Object.freeze({ status: "INVALID", blocker: "EVENT_INTELLIGENCE_SOURCE_DECISION_INVALID" });
const trusted = new WeakSet<object>();
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,95}$/;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const SECRET = /(?:https?:|ftp:|www\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:[/?#]|$)|api[_-]?(?:key|token)|access[_-]?token|authorization|bearer|password|secret|credential)/i;
const usages = new Set<string>(EVENT_INTELLIGENCE_USAGES);
const eventTypes = new Set<string>(EVENT_INTELLIGENCE_EVENT_TYPES);
const sourceShapes: Readonly<Record<string, readonly [EventIntelligenceSourceDecision["sourceKind"], EventIntelligenceSourceDecision["authorityTier"], EventIntelligenceSourceDecision["decisionStatus"], readonly string[]]>> = Object.freeze({
  "sec-edgar": ["REGULATORY_FILING", "REGULATORY_PRIMARY", "CANDIDATE_AUTHORITATIVE", ["www.sec.gov", "data.sec.gov"]],
  "issuer-ir": ["ISSUER_CONTROLLED", "ISSUER_PRIMARY", "CANDIDATE_CORROBORATION", ["www.sec.gov", "www.nasdaq.com", "www.nyse.com"]],
  "exchange-regulator": ["EXCHANGE_OR_REGULATOR", "EXCHANGE_OR_REGULATOR_PRIMARY", "CANDIDATE_CORROBORATION", ["www.nyse.com", "www.nasdaq.com"]],
  "globenewswire-distribution": ["ISSUER_DISTRIBUTOR", "ISSUER_DISTRIBUTION", "CANDIDATE_CORROBORATION", ["www.globenewswire.com"]],
  "businesswire-distribution": ["ISSUER_DISTRIBUTOR", "ISSUER_DISTRIBUTION", "CANDIDATE_CORROBORATION", ["www.businesswire.com"]],
  "gdelt-discovery": ["DISCOVERY_AGGREGATOR", "DISCOVERY_ONLY", "DISCOVERY_ONLY", ["www.gdeltproject.org", "gdeltproject.org"]],
  "newsapi-discovery": ["DISCOVERY_AGGREGATOR", "DISCOVERY_ONLY", "DISCOVERY_ONLY", ["newsapi.org", "www.newsapi.org"]],
});
const keys = ["contractVersion", "sourceId", "sourceKind", "authorityTier", "decisionStatus", "jurisdictions", "issuerCoverage", "supportedForms", "supportedEventTypes", "stableIdentifiers", "timestampSemantics", "correctionRetraction", "paginationHistory", "completeness", "latency", "requiredRequestIdentity", "rawStoragePolicy", "normalizedStoragePolicy", "usageApprovals", "retentionApproval", "redistributionApproval", "commercialApproval", "pricing", "evidenceReferences", "blockers", "reviewedAt", "effectiveFrom", "expiresAt", "recordedAt"] as const;
const refKeys = ["url", "title", "checkedAt", "classification", "claims"] as const;
const ownData = (v: unknown, expected: readonly string[]): v is Record<string, unknown> => {
  try { if (!v || typeof v !== "object" || Object.getPrototypeOf(v) !== Object.prototype) return false; const ks = Reflect.ownKeys(v); return ks.length === expected.length && ks.every(k => typeof k === "string" && expected.includes(k) && (() => { const d = Object.getOwnPropertyDescriptor(v, k); return !!d && "value" in d && !d.get && !d.set; })()); } catch { return false; }
};
const array = (v: unknown, max = 128): v is unknown[] => {
  try { if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype || v.length > max) return false; const ks = Reflect.ownKeys(v); if (ks.length !== v.length + 1 || ks.some(k => typeof k !== "string")) return false; for (let i = 0; i < v.length; i++) { const d = Object.getOwnPropertyDescriptor(v, String(i)); if (!d || !("value" in d) || d.get || d.set) return false; } return true; } catch { return false; }
};
const utc = (v: unknown): v is string => typeof v === "string" && UTC.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const id = (v: unknown): v is string => typeof v === "string" && ID.test(v) && !SECRET.test(v);
const safeText = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max && v.trim() === v && !SECRET.test(v);
const freeze = <T>(v: T): T => { if (v && typeof v === "object" && !Object.isFrozen(v)) { for (const child of Object.values(v as Record<string, unknown>)) freeze(child); Object.freeze(v); } return v; };
const sortedUniqueStrings = (v: unknown, max = 128): v is string[] => array(v, max) && v.every(id) && [...v].sort().every((x, i) => x === v[i]) && new Set(v).size === v.length;
/** Parse immutable source-decision material. A valid record is not runtime event authority. */
export function parseEventIntelligenceSourceDecision(input: unknown): EventIntelligenceSourceDecisionParse {
  try {
    if (!ownData(input, keys)) return INVALID;
    const x = input;
    if (x.contractVersion !== EVENT_INTELLIGENCE_SOURCE_DECISION_VERSION || typeof x.sourceId !== "string" || !Object.hasOwn(sourceShapes, x.sourceId)) return INVALID;
    const [kind, tier, status, allowedHosts] = sourceShapes[x.sourceId];
    if (x.sourceKind !== kind || x.authorityTier !== tier || x.decisionStatus !== status) return INVALID;
    const reviewedAt = x.reviewedAt;
    const effectiveFrom = x.effectiveFrom;
    const expiresAt = x.expiresAt;
    const recordedAt = x.recordedAt;
    if (!utc(reviewedAt) || !utc(effectiveFrom) || !utc(expiresAt) || !utc(recordedAt) || reviewedAt > effectiveFrom || effectiveFrom >= expiresAt) return INVALID;
    if (!sortedUniqueStrings(x.jurisdictions) || !sortedUniqueStrings(x.supportedForms) || !sortedUniqueStrings(x.supportedEventTypes) || !sortedUniqueStrings(x.stableIdentifiers) || !sortedUniqueStrings(x.timestampSemantics) || !sortedUniqueStrings(x.blockers) || x.blockers.length === 0) return INVALID;
    if (x.supportedEventTypes.some(t => !eventTypes.has(t))) return INVALID;
    const enums: Record<string, readonly string[]> = {
      issuerCoverage: ["SEC_FILERS", "ISSUER_SPECIFIC", "LISTED_ISSUERS_JURISDICTION", "AGGREGATED_GLOBAL", "UNKNOWN"], correctionRetraction: ["EXPLICIT_VERSIONED", "PARTIAL", "UNKNOWN"],
      paginationHistory: ["DOCUMENTED_BOUNDED", "DOCUMENTED_ARCHIVE", "UNKNOWN"], completeness: ["PROVEN_FOR_SCOPE", "PARTIAL", "UNKNOWN"], latency: ["DOCUMENTED_NEAR_REAL_TIME", "DOCUMENTED_DELAYED", "UNKNOWN"],
      requiredRequestIdentity: ["DECLARED_USER_AGENT", "ISSUER_ORIGIN_AND_DOCUMENT_ID", "PROVIDER_CREDENTIAL", "NONE_DOCUMENTED", "UNKNOWN"], rawStoragePolicy: ["NOT_APPROVED", "UNKNOWN"], normalizedStoragePolicy: ["NOT_APPROVED", "UNKNOWN"],
      retentionApproval: ["NOT_APPROVED", "REQUIRES_REVIEW", "APPROVED"], redistributionApproval: ["NOT_APPROVED", "REQUIRES_REVIEW", "APPROVED"], commercialApproval: ["NOT_APPROVED", "REQUIRES_REVIEW", "APPROVED"],
    };
    for (const [key, values] of Object.entries(enums)) if (typeof x[key] !== "string" || !values.includes(x[key] as string)) return INVALID;
    if (!ownData(x.pricing, ["status", "note"]) || !["NO_FEE_DOCUMENTED", "PUBLIC_PLAN", "CUSTOM", "UNKNOWN"].includes(String(x.pricing.status)) || !safeText(x.pricing.note, 512)) return INVALID;
    if (!array(x.usageApprovals, EVENT_INTELLIGENCE_USAGES.length) || x.usageApprovals.length !== EVENT_INTELLIGENCE_USAGES.length) return INVALID;
    const approvals: { usage: EventIntelligenceUsage; approval: "NOT_APPROVED" | "REQUIRES_REVIEW" | "APPROVED" }[] = [];
    for (const entry of x.usageApprovals) {
      if (!ownData(entry, ["usage", "approval"]) || typeof entry.usage !== "string" || !usages.has(entry.usage) || !["NOT_APPROVED", "REQUIRES_REVIEW", "APPROVED"].includes(String(entry.approval))) return INVALID;
      approvals.push({ usage: entry.usage as EventIntelligenceUsage, approval: entry.approval as typeof approvals[number]["approval"] });
    }
    approvals.sort((a, b) => a.usage.localeCompare(b.usage));
    if (new Set(approvals.map(a => a.usage)).size !== EVENT_INTELLIGENCE_USAGES.length || EVENT_INTELLIGENCE_USAGES.some(u => !approvals.some(a => a.usage === u))) return INVALID;
    if (!array(x.evidenceReferences, 64) || x.evidenceReferences.length === 0) return INVALID;
    const refs: { url: string; title: string; checkedAt: string; classification: "DOCUMENTED" | "OBSERVED" | "INFERRED" | "UNKNOWN"; claims: string[] }[] = [];
    for (const ref of x.evidenceReferences) {
      if (!ownData(ref, refKeys) || typeof ref.url !== "string" || !safeText(ref.title, 256) || !utc(ref.checkedAt) || ref.checkedAt > reviewedAt || !["DOCUMENTED", "OBSERVED", "INFERRED", "UNKNOWN"].includes(String(ref.classification)) || !sortedUniqueStrings(ref.claims, 32) || ref.claims.length === 0) return INVALID;
      const url = new URL(ref.url);
      if (url.protocol !== "https:" || !allowedHosts.some(h => url.hostname === h || url.hostname.endsWith(`.${h}`)) || url.username || url.password || url.search || url.hash || url.href !== ref.url) return INVALID;
      refs.push({ url: ref.url, title: ref.title, checkedAt: ref.checkedAt, classification: ref.classification as typeof refs[number]["classification"], claims: [...ref.claims] });
    }
    refs.sort((a, b) => a.url.localeCompare(b.url));
    if (new Set(refs.map(r => r.url)).size !== refs.length) return INVALID;
    if (x.decisionStatus === "DISCOVERY_ONLY" && (x.authorityTier !== "DISCOVERY_ONLY" || x.sourceKind !== "DISCOVERY_AGGREGATOR")) return INVALID;
    if (x.decisionStatus === "CANDIDATE_AUTHORITATIVE" && x.sourceKind === "DISCOVERY_AGGREGATOR") return INVALID;
    const body = { ...x, usageApprovals: approvals, evidenceReferences: refs } as Record<string, unknown>;
    delete body.recordedAt;
    const fingerprint = canonicalSha256({ contractVersion: EVENT_INTELLIGENCE_SOURCE_DECISION_VERSION, ...body });
    const decision = freeze({ ...body, recordedAt: x.recordedAt, decisionId: `event-source-decision:${x.sourceId}:${fingerprint}`, fingerprint }) as unknown as EventIntelligenceSourceDecision;
    trusted.add(decision);
    return freeze({ status: "VALID" as const, decision });
  } catch { return INVALID; }
}

export const isAuthenticEventIntelligenceSourceDecision = (value: unknown): value is EventIntelligenceSourceDecision => !!value && typeof value === "object" && trusted.has(value);

export type EventAuthorityMaterialDesign = Readonly<{
  contractVersion: "event-authority-material/v1"; sourceDecisionFingerprint: string; sourceArtifactFingerprint: string; documentId: string; issuerCik: string;
  issuerMappingRevisionFingerprint: string; assetIdentityId: string; assetMappingRevisionFingerprint: string; eventType: EventIntelligenceEventType;
  lifecycleStatus: "INTENT" | "AUTHORIZED" | "ANNOUNCED" | "SIGNED" | "CONDITIONAL" | "COMPLETED" | "TERMINATED" | "CORRECTED" | "RETRACTED" | "UNKNOWN";
  announcementAt: string | null; signedAt: string | null; expectedClosingAt: string | null; filingOrPublicationAt: string; effectiveOrCompletionAt: string | null; amountCurrency: string | null;
  amountStatus: "EXACT" | "RANGE" | "MAXIMUM" | "TARGET" | "UNKNOWN"; bindingStatus: "BINDING" | "NON_BINDING" | "CONDITIONAL" | "UNKNOWN";
  sourceLocators: readonly Readonly<{ locator: string; excerptHash: string }>[]; supersedes: readonly string[]; extractionContractVersion: string; parserOrModelVersion: string;
  receivedAt: string; fingerprint: string;
}>;
