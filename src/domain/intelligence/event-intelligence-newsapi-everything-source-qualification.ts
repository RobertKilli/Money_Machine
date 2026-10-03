import "server-only";
import { createHash } from "node:crypto";
import { types } from "node:util";

export const NEWSAPI_QUALIFICATION_VERSION = "event-intelligence-newsapi-everything-source-qualification/v1" as const;
export const NEWSAPI_PROVIDER_ID = "newsapi-discovery" as const;
export const NEWSAPI_QUERY_PROFILES = Object.freeze([
  Object.freeze({ id: "corporate-crypto-purchase-intent-v1", category: "CORPORATE_CRYPTO_PURCHASE_INTENT", query: '(bitcoin OR cryptocurrency OR "digital assets") AND (treasury OR purchase OR acquire OR buy)' }),
  Object.freeze({ id: "completed-purchase-claims-v1", category: "COMPLETED_CRYPTO_PURCHASE", query: '(bitcoin OR cryptocurrency OR "digital assets") AND (bought OR purchased OR acquired OR completed)' }),
  Object.freeze({ id: "treasury-strategy-policy-v1", category: "TREASURY_POLICY_CHANGE", query: '(bitcoin OR cryptocurrency OR "digital assets") AND (treasury OR policy OR reserve OR allocation)' }),
  Object.freeze({ id: "crypto-acquisition-v1", category: "ASSET_OR_COMPANY_ACQUISITION", query: '(crypto OR cryptocurrency OR "digital assets" OR blockchain) AND (acquisition OR acquired OR merger OR merges)' }),
  Object.freeze({ id: "strategic-partnership-v1", category: "STRATEGIC_PARTNERSHIP", query: '(crypto OR cryptocurrency OR blockchain OR "digital assets") AND (partnership OR partner OR agreement)' }),
  Object.freeze({ id: "cancellation-correction-retraction-v1", category: "CORRECTION_OR_RETRACTION", query: '("crypto deal" OR "bitcoin purchase" OR "digital asset") AND (cancelled OR canceled OR terminated OR correction OR retraction)' }),
] as const);
export const NEWSAPI_EVERYTHING_PROFILE = Object.freeze({
  id: "newsapi-everything-v2-bounded-discovery-v1", providerId: NEWSAPI_PROVIDER_ID, datasetId: "newsapi-everything", datasetVersion: "v2",
  protocol: "https", hostname: "newsapi.org", path: "/v2/everything", method: "GET",
  authentication: "X-Api-Key header; server-only late credential resolution; never query string", credentialReferenceFormat: "vault://newsapi/<opaque-reference>",
  queryKeys: Object.freeze(["q", "searchIn", "from", "to", "language", "sortBy", "pageSize", "page"] as const),
  canonicalQueryOrder: Object.freeze(["q", "searchIn", "from", "to", "language", "sortBy", "pageSize", "page"] as const),
  searchIn: "title,description", language: "en", sortBy: "publishedAt", pageSize: 25, page: 1, maxPages: 1,
  maxQueryLength: 500, maxWindowDays: 7, maxResponseBytes: 512 * 1024, maxRecords: 25,
  maxRequestsPerExecution: 6, maxRequestsPerMinute: 6, maxRequestsPerProfile: 1, deadlineMs: 5000, retries: 0,
  contentEncoding: "identity", redirects: "FORBIDDEN", callerHeaders: "FORBIDDEN", credentialReferenceInConfig: null,
  pagination: "SINGLE_PAGE_LOCAL_POLICY; totalResults_is_not_completeness",
} as const);
export const NEWSAPI_QUALIFICATION_BLOCKERS = Object.freeze([
  "PRODUCTION_PLAN_AND_ACQUISITION_NOT_APPROVED", "DEVELOPER_PLAN_NOT_ALLOWED_OUTSIDE_DEVELOPMENT",
  "THIRD_PARTY_ARTICLE_CONTENT_RIGHTS_UNRESOLVED", "METADATA_STORAGE_RETENTION_AND_REDISTRIBUTION_NOT_APPROVED",
  "NATIVE_RESPONSE_NULL_AND_RUNTIME_SCHEMA_NOT_QUALIFIED", "SOURCE_COVERAGE_COMPLETENESS_UNKNOWN",
  "CORRECTION_RETRACTION_LINEAGE_NOT_PROVIDED", "FRESHNESS_AND_PLAN_DEPENDENT_HISTORY",
] as const);

type Evidence = Readonly<{ title: string; url: string; checkedAt: string; classification: "DOCUMENTED" | "OBSERVED" | "INFERRED" | "UNKNOWN"; claims: readonly string[] }>;
type QualificationMaterial = Readonly<{
  contractVersion: typeof NEWSAPI_QUALIFICATION_VERSION; status: "PARTIAL_DISCOVERY_ONLY"; providerId: typeof NEWSAPI_PROVIDER_ID;
  datasetId: "newsapi-everything"; datasetVersion: "v2"; endpointProfileId: typeof NEWSAPI_EVERYTHING_PROFILE.id; endpointProfileFingerprint: string;
  protocol: "https"; hostname: "newsapi.org"; path: "/v2/everything"; method: "GET";
  authenticationTransport: "X-Api-Key"; credentialReferenceFormat: "vault://newsapi/<opaque-reference>"; credentialReference: null;
  queryKeys: readonly string[]; canonicalQueryOrder: readonly string[]; searchFields: "title,description"; languageProfile: "en";
  queryProfileFingerprints: readonly string[]; maxQueryLength: 500; maxResponseBytes: 524288; maxRecordCount: 25; pageSize: 25; maxPages: 1;
  maxWindowDays: 7; maxRequests: 6; maxRequestsPerMinute: 6; maxRequestsPerProfile: 1; timeoutMs: 5000; retries: 0;
  pagination: "SINGLE_PAGE_ONLY"; datePolicy: "EXPLICIT_UTC_CALENDAR_DAYS_MAX_7"; sortPolicy: "publishedAt";
  rateQuota: "PLAN_SPECIFIC_NOT_GLOBAL"; history: "PLAN_SPECIFIC_AND_NOT_CURRENTLY_SELECTED";
  sourceIdentitySemantics: string; timestampSemantics: string; truncationSemantics: string; nullMissingPolicy: string; duplicatePolicy: string;
  correctionRetraction: "UNKNOWN"; completeness: "UNKNOWN"; freshness: "UNKNOWN";
  usageApprovals: readonly Readonly<{ usage: string; approval: "NOT_APPROVED" }>[];
  rawArticleStorage: "NOT_APPROVED"; metadataStorage: "NOT_APPROVED"; normalizedStorage: "NOT_APPROVED"; retention: "NOT_APPROVED"; redistribution: "NOT_APPROVED"; commercialUse: "NOT_APPROVED";
  blockers: readonly string[]; evidenceReferences: readonly Evidence[]; reviewedAt: string; effectiveFrom: string; expiresAt: string; recordedAt: string;
}>;
export type NewsApiQualification = QualificationMaterial & Readonly<{ fingerprint: string }>;
export type QualificationParse = Readonly<{ status: "VALID"; qualification: NewsApiQualification }> | Readonly<{ status: "INVALID"; code: "NEWSAPI_QUALIFICATION_INVALID" }>;
type ArticleMaterial = Readonly<{
  sourceId: string | null; sourceName: string | null; author: string | null; title: string; description: string | null;
  contentPresent: boolean; contentLength: number | null; contentFingerprint: string | null; articleUrl: string; imageUrl: string | null; publishedAt: string;
}>;
export type NewsApiSyntheticResponse = Readonly<{
  normalForm: "newsapi-everything-normalized-fixture/v1"; providerId: typeof NEWSAPI_PROVIDER_ID; datasetVersion: "v2";
  queryProfileId: string; queryProfileFingerprint: string; queryFingerprint: string; from: string; to: string; receivedAt: string;
  rawPayloadFingerprint: string; totalResults: number; articles: readonly ArticleMaterial[];
}>;
export type NewsApiDiscoveryCandidate = Readonly<{
  status: "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE"; authorityStatus: "DISCOVERY_ONLY"; provenance: "SYNTHETIC";
  providerId: typeof NEWSAPI_PROVIDER_ID; categoryHint: string; sourceMaterialId: string; sourceMaterialFingerprint: string;
  receiptId: string; receiptFingerprint: string; queryProfileId: string; queryFingerprint: string; rawPayloadFingerprint: string;
  lifecycleHint: "UNASSESSED" | "CORRECTION_OR_RETRACTION_SEARCH_HINT";
  sourceId: string | null; sourceName: string | null; author: string | null; title: string; description: string | null;
  contentPresent: boolean; contentLength: number | null; contentFingerprint: string | null; contentTruncatedByProvider: boolean;
  articleUrl: string; imageUrl: string | null; publishedAt: string; receivedAt: string; evaluatedAsOf: string; totalResults: number;
  completionProven: false; issuerMapping: "UNRESOLVED"; assetMapping: "UNRESOLVED"; independentCorroboration: false;
  correctionRetractionAuthority: false; eventAuthorityEligible: false; persistenceEligible: false; signalEligible: false; tradingEligible: false;
}>;
export type ProjectionResult = Readonly<{ status: "PROJECTED"; candidates: readonly NewsApiDiscoveryCandidate[] }> | Readonly<{ status: "BLOCKED"; code: "NEWSAPI_PROJECTION_BLOCKED" }>;

const MAX_TEXT = Object.freeze({ source: 128, author: 256, title: 512, description: 2048, url: 2048 });
const INVALID: QualificationParse = Object.freeze({ status: "INVALID", code: "NEWSAPI_QUALIFICATION_INVALID" });
const TRUST = new WeakSet<object>();
const RESPONSE_TRUST = new WeakSet<object>();
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const control = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const secretLike = /(?:api[_-]?(?:key|token)|access[_-]?token|authorization|bearer|password|secret|credential)/i;
const BAD_PROTOTYPE_KEYS = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);
function fail(): never { throw new Error("NEWSAPI_QUALIFICATION_INVALID"); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail();
  if (Reflect.ownKeys(Object.prototype).some(k => typeof k !== "string" || !BAD_PROTOTYPE_KEYS.has(k))) return fail();
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(k => typeof k !== "string" || !keys.includes(k))) return fail();
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(value, key); if (!d || !("value" in d) || !d.enumerable) return fail(); out[key] = d.value; }
  return out;
}
function array(value: unknown, max: number): unknown[] {
  if (!value || typeof value !== "object" || types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return fail();
  const len = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!Number.isSafeInteger(len) || len < 0 || len > max || Reflect.ownKeys(value).length !== len + 1) return fail();
  const out: unknown[] = [];
  for (let i = 0; i < len; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d || !("value" in d) || !d.enumerable) return fail(); out.push(d.value); }
  return out;
}
function text(value: unknown, max: number, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > max || (!allowEmpty && !value.length) || value.trim() !== value || control.test(value) || value.normalize("NFC") !== value || secretLike.test(value)) return fail();
  return value;
}
function utc(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return fail();
  return value;
}
function day(value: unknown): string { if (typeof value !== "string" || !/^\d{4}-\d\d-\d\d$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) return fail(); return value; }
function hex(value: unknown): string { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) return fail(); return value; }
function hash(value: unknown): string { return createHash("sha256").update(stable(value), "utf8").digest("hex"); }
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort(compare).map(k => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(",")}}`;
}
function matchesExpected(input: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== "object") return input === expected;
  if (!input || typeof input !== "object" || types.isProxy(input)) return false;
  try {
    if (Array.isArray(expected)) {
      if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || Object.getPrototypeOf(expected) !== Array.prototype) return false;
      const length = Object.getOwnPropertyDescriptor(input, "length")?.value;
      if (length !== expected.length || Reflect.ownKeys(input).length !== length + 1) return false;
      for (let i = 0; i < length; i++) { const d = Object.getOwnPropertyDescriptor(input, String(i)); if (!d || !("value" in d) || !d.enumerable || !matchesExpected(d.value, expected[i])) return false; }
      return true;
    }
    if (Object.getPrototypeOf(input) !== Object.prototype || Object.getPrototypeOf(expected) !== Object.prototype) return false;
    const keys = Object.keys(expected), own = Reflect.ownKeys(input);
    if (own.length !== keys.length || own.some(k => typeof k !== "string" || !keys.includes(k))) return false;
    for (const key of keys) { const d = Object.getOwnPropertyDescriptor(input, key); if (!d || !("value" in d) || !d.enumerable || !matchesExpected(d.value, (expected as Record<string, unknown>)[key])) return false; }
    return true;
  } catch { return false; }
}
function freeze<T>(value: T): T { if (value && typeof value === "object") { for (const child of Object.values(value as Record<string, unknown>)) freeze(child); if (!Object.isFrozen(value)) Object.freeze(value); } return value; }
function articleUrl(value: unknown): string {
  const s = text(value, MAX_TEXT.url);
  if (s.includes("\\") || /%(?:2e|2f|5c)/i.test(s)) return fail();
  const u = new URL(s);
  if (u.protocol !== "https:" || u.username || u.password || u.hash || u.port || u.hostname !== u.hostname.toLowerCase() || u.hostname.endsWith(".") || !u.hostname.includes(".") || u.href !== s) return fail();
  const seen = new Set<string>(); for (const [key] of u.searchParams) { if (seen.has(key) || /(?:api[_-]?key|token|secret|password|authorization|auth|session|signature|\bsig\b|credential)/i.test(key)) return fail(); seen.add(key); }
  if (u.pathname.split("/").some(x => x === "." || x === "..")) return fail();
  return s;
}
const qKeys = NEWSAPI_EVERYTHING_PROFILE.queryKeys as readonly string[];
const materialKeys = ["contractVersion", "status", "providerId", "datasetId", "datasetVersion", "endpointProfileId", "endpointProfileFingerprint", "protocol", "hostname", "path", "method", "authenticationTransport", "credentialReferenceFormat", "credentialReference", "queryKeys", "canonicalQueryOrder", "searchFields", "languageProfile", "queryProfileFingerprints", "maxQueryLength", "maxResponseBytes", "maxRecordCount", "pageSize", "maxPages", "maxWindowDays", "maxRequests", "maxRequestsPerMinute", "maxRequestsPerProfile", "timeoutMs", "retries", "pagination", "datePolicy", "sortPolicy", "rateQuota", "history", "sourceIdentitySemantics", "timestampSemantics", "truncationSemantics", "nullMissingPolicy", "duplicatePolicy", "correctionRetraction", "completeness", "freshness", "usageApprovals", "rawArticleStorage", "metadataStorage", "normalizedStorage", "retention", "redistribution", "commercialUse", "blockers", "evidenceReferences", "reviewedAt", "effectiveFrom", "expiresAt", "recordedAt"] as const;
const USAGES = Object.freeze(["RAW_ACQUISITION", "RAW_ARTIFACT_STORAGE", "NORMALIZED_CLAIM_STORAGE", "AUTHORITY_ISSUANCE", "REDISTRIBUTION", "COMMERCIAL_USE", "SIGNAL_RESEARCH"] as const);
const blockers = NEWSAPI_QUALIFICATION_BLOCKERS;
const CHECKED_AT = "2026-10-03T08:30:00.000Z";
const endpointFingerprint = hash(NEWSAPI_EVERYTHING_PROFILE);
const references: readonly Evidence[] = Object.freeze([
  { title: "Everything - Documentation - News API", url: "https://newsapi.org/docs/endpoints/everything", checkedAt: CHECKED_AT, classification: "DOCUMENTED" as const, claims: Object.freeze(["Everything is GET /v2/everything", "q supports quoted phrases and AND/OR/NOT with parentheses", "searchIn, ISO from/to, language, sortBy, pageSize and page are documented", "pageSize maximum is 100", "response article fields and totalResults are documented", "content is truncated to 200 characters when available"]) },
  { title: "Authentication - Documentation - News API", url: "https://newsapi.org/docs/authentication", checkedAt: CHECKED_AT, classification: "DOCUMENTED" as const, claims: Object.freeze(["API key can be sent in X-Api-Key or Authorization header", "NewsAPI recommends header transport to avoid URL/log exposure"]) },
  { title: "Errors - Documentation - News API", url: "https://newsapi.org/docs/errors", checkedAt: CHECKED_AT, classification: "DOCUMENTED" as const, claims: Object.freeze(["401 identifies missing or invalid API key", "429 identifies rate limiting", "error body contains provider code and message that must be sanitized"]) },
  { title: "Pricing - News API", url: "https://newsapi.org/pricing", checkedAt: CHECKED_AT, classification: "DOCUMENTED" as const, claims: Object.freeze(["Developer is development/testing only and prohibited in staging/production including internal production use", "Developer advertises 100 requests/day, 24-hour article delay and up to one month history", "Business and Advanced plans are presented for production/commercial projects", "Business and Advanced page quotas and history are plan-dependent", "full article content is not supplied by any plan; publisher URL can be visited separately"]) },
  { title: "News API Terms of Service", url: "https://newsapi.org/terms", checkedAt: CHECKED_AT, classification: "DOCUMENTED" as const, claims: Object.freeze(["terms prohibit reproducing/republishing copyrighted material and building a competing news database", "returned data may contain third-party content subject to rights", "source/author attribution must not be falsified or removed", "Developer plan is limited to development/testing environment"]) },
].sort((a, b) => compare(a.url, b.url)));
const MATERIAL: QualificationMaterial = freeze({
  contractVersion: NEWSAPI_QUALIFICATION_VERSION, status: "PARTIAL_DISCOVERY_ONLY", providerId: NEWSAPI_PROVIDER_ID,
  datasetId: "newsapi-everything", datasetVersion: "v2", endpointProfileId: NEWSAPI_EVERYTHING_PROFILE.id, endpointProfileFingerprint: endpointFingerprint,
  protocol: "https", hostname: "newsapi.org", path: "/v2/everything", method: "GET", authenticationTransport: "X-Api-Key", credentialReferenceFormat: "vault://newsapi/<opaque-reference>", credentialReference: null,
  queryKeys: [...qKeys], canonicalQueryOrder: [...qKeys], searchFields: "title,description", languageProfile: "en",
  queryProfileFingerprints: NEWSAPI_QUERY_PROFILES.map(p => hash({ version: "newsapi-everything-query-profile/v1", ...p, searchIn: "title,description", language: "en" })),
  maxQueryLength: 500, maxResponseBytes: 524288, maxRecordCount: 25, pageSize: 25, maxPages: 1, maxWindowDays: 7,
  maxRequests: 6, maxRequestsPerMinute: 6, maxRequestsPerProfile: 1, timeoutMs: 5000, retries: 0,
  pagination: "SINGLE_PAGE_ONLY", datePolicy: "EXPLICIT_UTC_CALENDAR_DAYS_MAX_7", sortPolicy: "publishedAt", rateQuota: "PLAN_SPECIFIC_NOT_GLOBAL", history: "PLAN_SPECIFIC_AND_NOT_CURRENTLY_SELECTED",
  sourceIdentitySemantics: "Local identity over provider dataset version and article source id/name, author metadata, title, description, content presence/length/fingerprint, canonical URL, image URL and publishedAt; never a NewsAPI article record id. Query/receipt/evaluation are excluded.",
  timestampSemantics: "publishedAt is provider-reported UTC publication timestamp; receivedAt is local receipt; evaluatedAsOf is historical cutoff. No event occurrence time is inferred.",
  truncationSemantics: "NewsAPI documents content as truncated to 200 characters when available. Preserve only presence, observed character length and SHA-256; never reconstruct or project the content string. Exact truncation marker syntax is UNKNOWN.",
  nullMissingPolicy: "Synthetic normal form requires every declared key; source id/name, author, description, content, image URL may be explicit null. Missing keys and undocumented native null shapes are rejected.",
  duplicatePolicy: "Deduplicate exact normalized article material by local fingerprint only; URL equality with changed material remains a separate append-only variant; source labels do not create independent origins.",
  correctionRetraction: "UNKNOWN", completeness: "UNKNOWN", freshness: "UNKNOWN",
  usageApprovals: USAGES.map(usage => ({ usage, approval: "NOT_APPROVED" as const })), rawArticleStorage: "NOT_APPROVED", metadataStorage: "NOT_APPROVED", normalizedStorage: "NOT_APPROVED", retention: "NOT_APPROVED", redistribution: "NOT_APPROVED", commercialUse: "NOT_APPROVED",
  blockers: [...blockers], evidenceReferences: references, reviewedAt: CHECKED_AT, effectiveFrom: CHECKED_AT, expiresAt: "2027-01-03T08:30:00.000Z", recordedAt: CHECKED_AT,
});
function qualificationFp(value: Record<string, unknown>): string { const material = { ...value }; delete material.recordedAt; delete material.fingerprint; return hash(material); }
const QUALIFICATION_FINGERPRINT = qualificationFp(MATERIAL as unknown as Record<string, unknown>);
const SYNTHETIC_QUALIFICATION = freeze({ ...MATERIAL, fingerprint: QUALIFICATION_FINGERPRINT }) as NewsApiQualification;
TRUST.add(SYNTHETIC_QUALIFICATION);

export function newsApiQueryProfileFingerprint(profileId: string): string | null {
  const p = NEWSAPI_QUERY_PROFILES.find(item => item.id === profileId);
  return p ? hash({ version: "newsapi-everything-query-profile/v1", ...p, searchIn: "title,description", language: "en" }) : null;
}
export function newsApiRequestFingerprint(profileId: string, fromValue: string, toValue: string): string | null {
  const profileFingerprint = newsApiQueryProfileFingerprint(profileId); if (!profileFingerprint) return null;
  try { const from = day(fromValue), to = day(toValue); const n = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000;
    if (from > to || n >= NEWSAPI_EVERYTHING_PROFILE.maxWindowDays) return null;
    return hash({ endpointFingerprint, endpointProfileId: NEWSAPI_EVERYTHING_PROFILE.id, profileId, profileFingerprint, from, to, searchIn: "title,description", language: "en", sortBy: "publishedAt", pageSize: 25, page: 1 });
  } catch { return null; }
}
export function buildNewsApiEverythingQuery(profileId: string, fromValue: string, toValue: string, page = 1): string | null {
  const p = NEWSAPI_QUERY_PROFILES.find(item => item.id === profileId); if (!p || page !== 1) return null;
  try { const from = day(fromValue), to = day(toValue); const n = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000;
    if (from > to || n >= NEWSAPI_EVERYTHING_PROFILE.maxWindowDays || p.query.length > 500) return null;
    const qs = new URLSearchParams([["q", p.query], ["searchIn", "title,description"], ["from", from], ["to", to], ["language", "en"], ["sortBy", "publishedAt"], ["pageSize", "25"], ["page", "1"]]).toString();
    return qs.length <= 500 ? qs : null;
  } catch { return null; }
}
export function validateNewsApiEverythingQuery(query: unknown): boolean {
  if (typeof query !== "string" || !query.length || query.length > 500 || /[\r\n\p{Cc}\p{Cf}]/u.test(query)) return false;
  try {
    const parsed = [...new URLSearchParams(query).entries()];
    if (parsed.length !== qKeys.length || parsed.some(([key], i) => key !== qKeys[i])) return false;
    const [q, searchIn, from, to, language, sortBy, size, page] = parsed.map(x => x[1]);
    const profile = NEWSAPI_QUERY_PROFILES.find(p => p.query === q);
    if (!profile || searchIn !== "title,description" || day(from) !== from || day(to) !== to || language !== "en" || sortBy !== "publishedAt" || size !== "25" || page !== "1") return false;
    return buildNewsApiEverythingQuery(profile.id, from, to) === query;
  } catch { return false; }
}

const INVALID_RESPONSE = Object.freeze({ status: "BLOCKED", code: "NEWSAPI_PROJECTION_BLOCKED" } as const);
const QUAL_KEYS = materialKeys;
export function parseNewsApiQualification(input: unknown): QualificationParse {
  try {
    const v = object(input, [...QUAL_KEYS, "fingerprint"]);
    for (const [key, expected] of Object.entries(MATERIAL)) if (key !== "recordedAt" && !matchesExpected(v[key], expected)) return INVALID;
    const recordedAt = utc(v.recordedAt);
    if (recordedAt < MATERIAL.reviewedAt) return INVALID;
    if (hex(v.fingerprint) !== QUALIFICATION_FINGERPRINT) return INVALID;
    const qualification = freeze({ ...MATERIAL, recordedAt, fingerprint: QUALIFICATION_FINGERPRINT }) as NewsApiQualification;
    return freeze({ status: "VALID" as const, qualification });
  } catch { return INVALID; }
}
export function getSyntheticNewsApiProjectionQualification(): NewsApiQualification { return SYNTHETIC_QUALIFICATION; }
export function isAuthenticNewsApiQualification(value: unknown): value is NewsApiQualification { return !!value && typeof value === "object" && TRUST.has(value); }

const responseKeys = ["normalForm", "providerId", "datasetVersion", "queryProfileId", "queryProfileFingerprint", "queryFingerprint", "from", "to", "receivedAt", "rawPayloadFingerprint", "totalResults", "articles"] as const;
const articleKeys = ["sourceId", "sourceName", "author", "title", "description", "content", "articleUrl", "imageUrl", "publishedAt"] as const;
function optionalText(value: unknown, max: number): string | null { return value === null ? null : text(value, max, true); }
function normalizeResponse(input: unknown, evaluationAsOf: unknown): NewsApiSyntheticResponse | null {
  try {
    const v = object(input, responseKeys);
    if (v.normalForm !== "newsapi-everything-normalized-fixture/v1" || v.providerId !== NEWSAPI_PROVIDER_ID || v.datasetVersion !== "v2") return null;
    const profileId = text(v.queryProfileId, 96), profile = NEWSAPI_QUERY_PROFILES.find(x => x.id === profileId);
    if (!profile || v.queryProfileFingerprint !== newsApiQueryProfileFingerprint(profileId)) return null;
    const from = day(v.from), to = day(v.to), receivedAt = utc(v.receivedAt), asOf = utc(evaluationAsOf);
    const expected = newsApiRequestFingerprint(profileId, from, to);
    if (!expected || v.queryFingerprint !== expected || receivedAt > asOf || to > asOf.slice(0, 10)) return null;
    const rawPayloadFingerprint = hex(v.rawPayloadFingerprint);
    if (!Number.isSafeInteger(v.totalResults) || (v.totalResults as number) < 0) return null;
    const articles = array(v.articles, 25).map(raw => {
      const a = object(raw, articleKeys);
      const sourceId = optionalText(a.sourceId, MAX_TEXT.source), sourceName = optionalText(a.sourceName, MAX_TEXT.source), author = optionalText(a.author, MAX_TEXT.author);
      if (sourceId !== null && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(sourceId)) return fail();
      const title = text(a.title, MAX_TEXT.title), description = optionalText(a.description, MAX_TEXT.description), content = optionalText(a.content, 200);
      const article = articleUrl(a.articleUrl), image = a.imageUrl === null ? null : articleUrl(a.imageUrl), publishedAt = utc(a.publishedAt);
      if (publishedAt > asOf || publishedAt.slice(0, 10) < from || publishedAt.slice(0, 10) > to) return fail();
      return freeze({ sourceId, sourceName, author, title, description, contentPresent: content !== null, contentLength: content === null ? null : [...content].length,
        contentFingerprint: content === null ? null : createHash("sha256").update(content, "utf8").digest("hex"), articleUrl: article, imageUrl: image, publishedAt });
    });
    if (articles.length > 25 || articles.length > (v.totalResults as number)) return null;
    const unique = new Map<string, typeof articles[number]>();
    for (const a of articles) unique.set(hash(a), a);
    return freeze({ normalForm: "newsapi-everything-normalized-fixture/v1", providerId: NEWSAPI_PROVIDER_ID, datasetVersion: "v2", queryProfileId: profileId,
      queryProfileFingerprint: String(v.queryProfileFingerprint), queryFingerprint: expected, from, to, receivedAt, rawPayloadFingerprint,
      totalResults: v.totalResults as number, articles: [...unique.entries()].sort((a, b) => compare(a[0], b[0])).map(x => x[1]) });
  } catch { return null; }
}
export function parseNewsApiEverythingSourceQualification(input: unknown): QualificationParse { return parseNewsApiQualification(input); }
export function isAuthenticNewsApiEverythingQualification(value: unknown): value is NewsApiQualification { return isAuthenticNewsApiQualification(value); }
const responseMaterialWeakSet = RESPONSE_TRUST;
export function parseNewsApiSyntheticResponse(input: unknown, evaluationAsOf: unknown): NewsApiSyntheticResponse | null { return normalizeResponse(input, evaluationAsOf); }
export function projectNewsApiEverythingDiscovery(input: unknown, evaluationAsOf: unknown): ProjectionResult {
  try {
    const v = object(input, ["qualification", "response"]), q = v.qualification, response = v.response;
    if (!isAuthenticNewsApiQualification(q) || !response || typeof response !== "object" || types.isProxy(response) || !responseMaterialWeakSet.has(response)) return INVALID_RESPONSE;
    const normalized = response as NewsApiSyntheticResponse;
    const asOf = utc(evaluationAsOf);
    if (asOf < q.effectiveFrom || asOf >= q.expiresAt || normalized.providerId !== q.providerId || normalized.datasetVersion !== q.datasetVersion || normalized.receivedAt > asOf || normalized.to > asOf.slice(0, 10) || !NEWSAPI_QUERY_PROFILES.some(p => p.id === normalized.queryProfileId && newsApiQueryProfileFingerprint(p.id) === normalized.queryProfileFingerprint)) return INVALID_RESPONSE;
    const profile = NEWSAPI_QUERY_PROFILES.find(p => p.id === normalized.queryProfileId)!;
    const candidates = normalized.articles.map(article => {
      const material = { datasetId: q.datasetId, datasetVersion: q.datasetVersion, ...article };
      const sourceMaterialFingerprint = hash(material), receiptFingerprint = hash({ sourceMaterialFingerprint, queryFingerprint: normalized.queryFingerprint, rawPayloadFingerprint: normalized.rawPayloadFingerprint, receivedAt: normalized.receivedAt });
      return freeze({ status: "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE" as const, authorityStatus: "DISCOVERY_ONLY" as const, provenance: "SYNTHETIC" as const,
        providerId: NEWSAPI_PROVIDER_ID, categoryHint: profile.category, sourceMaterialId: `newsapi-everything-material:${sourceMaterialFingerprint}`, sourceMaterialFingerprint,
        receiptId: `newsapi-everything-receipt:${receiptFingerprint}`, receiptFingerprint, queryProfileId: profile.id, queryFingerprint: normalized.queryFingerprint,
        lifecycleHint: profile.category === "CORRECTION_OR_RETRACTION" ? "CORRECTION_OR_RETRACTION_SEARCH_HINT" as const : "UNASSESSED" as const,
        rawPayloadFingerprint: normalized.rawPayloadFingerprint, ...article, contentTruncatedByProvider: article.contentPresent, receivedAt: normalized.receivedAt,
        evaluatedAsOf: asOf, totalResults: normalized.totalResults, completionProven: false as const, issuerMapping: "UNRESOLVED" as const, assetMapping: "UNRESOLVED" as const,
        independentCorroboration: false as const, correctionRetractionAuthority: false as const, eventAuthorityEligible: false as const, persistenceEligible: false as const, signalEligible: false as const, tradingEligible: false as const });
    });
    return freeze({ status: "PROJECTED" as const, candidates });
  } catch { return INVALID_RESPONSE; }
}
export function rejectNewsApiCandidateAsAuthority(candidate: unknown, boundary: "MAPPING" | "CORROBORATION" | "EVENT" | "PERSISTENCE" | "SIGNAL" | "TRADING"): null { void candidate; void boundary; return null; }
// Vitest private loader only exposes this synthetic fixture issuer. It is not an exported production API.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function issueNewsApiSyntheticResponseForTest(input: unknown, evaluationAsOf: unknown): NewsApiSyntheticResponse | null {
  const response = normalizeResponse(input, evaluationAsOf); if (!response) return null; RESPONSE_TRUST.add(response); return response;
}
