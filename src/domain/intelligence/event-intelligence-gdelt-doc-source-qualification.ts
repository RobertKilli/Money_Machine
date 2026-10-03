import "server-only";
import { createHash } from "node:crypto";
import { types } from "node:util";

export const GDELT_DOC_QUALIFICATION_VERSION = "event-intelligence-gdelt-doc-source-qualification/v1" as const;
export const GDELT_DOC_PROVIDER_ID = "gdelt-discovery" as const;
export const GDELT_DOC_QUERY_PROFILES = Object.freeze([
  Object.freeze({ id: "treasury-purchase-intent-v1", category: "CORPORATE_CRYPTO_PURCHASE_INTENT", query: '("bitcoin treasury" OR "cryptocurrency purchase" OR "digital asset treasury")' }),
  Object.freeze({ id: "completed-corporate-purchase-v1", category: "COMPLETED_CRYPTO_PURCHASE", query: '("company bought bitcoin" OR "company purchased bitcoin" OR "corporate bitcoin purchase")' }),
  Object.freeze({ id: "crypto-acquisition-v1", category: "ASSET_OR_COMPANY_ACQUISITION", query: '("crypto company acquisition" OR "digital asset acquisition" OR "blockchain company acquisition")' }),
  Object.freeze({ id: "lifecycle-correction-v1", category: "CORRECTION_OR_RETRACTION", query: '("crypto deal terminated" OR "bitcoin purchase cancelled" OR "cryptocurrency correction")' }),
  Object.freeze({ id: "treasury-policy-change-v1", category: "TREASURY_POLICY_CHANGE", query: '("digital asset treasury policy" OR "bitcoin treasury policy" OR "cryptocurrency treasury policy")' }),
  Object.freeze({ id: "strategic-crypto-partnership-v1", category: "STRATEGIC_PARTNERSHIP", query: '("digital asset partnership" OR "cryptocurrency partnership" OR "blockchain strategic partnership")' }),
] as const);
export type GdeltDocQueryProfile = typeof GDELT_DOC_QUERY_PROFILES[number];

export const GDELT_DOC_REQUEST_PROFILE = Object.freeze({
  id: "gdelt-doc-article-list-json-v1", providerId: GDELT_DOC_PROVIDER_ID, datasetId: "gdelt-doc", datasetVersion: "2.0",
  protocol: "https", hostname: "api.gdeltproject.org", path: "/api/v2/doc/doc", method: "GET",
  queryKeys: Object.freeze(["query", "mode", "format", "maxrecords", "startdatetime", "enddatetime", "sort"] as const),
  canonicalQueryOrder: Object.freeze(["query", "mode", "format", "maxrecords", "startdatetime", "enddatetime", "sort"] as const),
  mode: "artlist", format: "json", sort: "DateDesc", maxRecords: 25, maxQueryLength: 512,
  maxWindowSeconds: 7 * 24 * 60 * 60, maxResponseBytes: 512 * 1024, maxRecordCount: 25,
  maxRequestsPerExecution: 6, maxRequestsPerMinute: 6, maxRequestsPerProfile: 1, totalDeadlineMs: 5_000, retries: 0,
  contentEncoding: "identity", redirects: "FORBIDDEN", callerHeaders: "FORBIDDEN", credentials: "FORBIDDEN",
  pagination: "NOT_DOCUMENTED; UNSUPPORTED",
} as const);
export const GDELT_DOC_BLOCKERS = Object.freeze([
  "DOC_JSON_NATIVE_FIELD_SCHEMA_NOT_PINNED",
  "LIVE_COVERAGE_COMPLETENESS_NOT_PROVEN",
  "CURRENT_FRESHNESS_AND_LATENCY_NOT_PINNED",
  "CORRECTION_AND_RETRACTION_LINEAGE_NOT_PROVIDED",
  "ARTICLE_CONTENT_RIGHTS_NOT_ESTABLISHED_BY_GDELT_METADATA_TERMS",
  "ACQUISITION_AND_ALL_STORAGE_APPROVALS_NOT_APPROVED",
] as const);

type QualificationMaterial = Readonly<{
  contractVersion: typeof GDELT_DOC_QUALIFICATION_VERSION; providerId: typeof GDELT_DOC_PROVIDER_ID;
  datasetId: "gdelt-doc"; datasetVersion: "2.0"; endpointProfileId: typeof GDELT_DOC_REQUEST_PROFILE.id; endpointProfileFingerprint: string;
  protocol: "https"; hostname: "api.gdeltproject.org"; path: "/api/v2/doc/doc"; methods: readonly ["GET"];
  modes: readonly ["artlist"]; formats: readonly ["json"]; queryKeys: readonly string[]; maxQueryLength: 512;
  maxResponseBytes: 524288; maxRecordCount: 25; maxWindowSeconds: number; maxRequests: 6; maxRequestsPerMinute: 6; maxRequestsPerProfile: 1;
  timeoutMs: 5000; retries: 0; responseFields: readonly string[]; timestampSemantics: string;
  urlIdentitySemantics: string; languageCountrySemantics: string; pagination: "UNKNOWN";
  correctionRetraction: "UNKNOWN"; completeness: "UNKNOWN"; freshness: "UNKNOWN";
  usageApprovals: readonly Readonly<{ usage: string; approval: "NOT_APPROVED" }>[];
  metadataStorage: "NOT_APPROVED"; linkedContentStorage: "NOT_APPROVED"; normalizedStorage: "NOT_APPROVED";
  authorityPersistence: "NOT_APPROVED"; retention: "NOT_APPROVED"; redistribution: "NOT_APPROVED"; commercialUse: "NOT_APPROVED";
  blockers: readonly string[]; evidenceReferences: readonly Readonly<{ title: string; url: string; checkedAt: string; classification: "DOCUMENTED" | "UNKNOWN"; claims: readonly string[] }>[];
  reviewedAt: string; effectiveFrom: string; expiresAt: string; recordedAt: string;
}>;
export type GdeltDocSourceQualification = QualificationMaterial & Readonly<{ status: "PARTIAL_DISCOVERY_ONLY"; fingerprint: string }>;
export type QualificationParse = Readonly<{ status: "VALID"; qualification: GdeltDocSourceQualification }> | Readonly<{ status: "INVALID"; code: "GDELT_QUALIFICATION_INVALID" }>;
export type GdeltSyntheticDocResponse = Readonly<{
  fixtureContract: "gdelt-doc-normalized-fixture/v1"; providerId: typeof GDELT_DOC_PROVIDER_ID;
  queryProfileId: string; queryProfileFingerprint: string; queryFingerprint: string; windowStart: string; windowEnd: string; receivedAt: string; rawPayloadFingerprint: string;
  records: readonly Readonly<{ articleUrl: string; sourceDomain: string; title: string; sourceLanguage: string | null; sourceCountry: string | null; providerSeenAt: string; articleTime: string | null; imageUrl: string | null }>[];
}>;
export type GdeltDiscoveryCandidate = Readonly<{
  status: "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE"; authorityStatus: "DISCOVERY_ONLY"; provenance: "SYNTHETIC";
  providerId: typeof GDELT_DOC_PROVIDER_ID; queryProfileId: string; sourceMaterialId: string; sourceMaterialFingerprint: string;
  queryFingerprint: string; rawPayloadFingerprint: string; receiptId: string; receiptFingerprint: string;
  articleUrl: string; sourceDomain: string; title: string; sourceLanguage: string | null; sourceCountry: string | null;
  providerSeenAt: string; articleTime: string | null; receivedAt: string; imageUrl: string | null;
  evaluatedAsOf: string;
  categoryHint: string; completionProven: false; issuerMapping: "UNRESOLVED"; assetMapping: "UNRESOLVED";
  eventAuthorityEligible: false; corroborationEligible: false; persistenceEligible: false; signalEligible: false; tradingEligible: false;
}>;
export type ProjectionResult = Readonly<{ status: "PROJECTED"; candidates: readonly GdeltDiscoveryCandidate[] }> | Readonly<{ status: "BLOCKED"; code: "GDELT_PROJECTION_BLOCKED" }>;

const INVALID: QualificationParse = Object.freeze({ status: "INVALID", code: "GDELT_QUALIFICATION_INVALID" });
const TRUST = new WeakSet<object>();
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const control = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const secretLike = /(?:https?:|www\.|\b[a-z0-9.-]+\.[a-z]{2,}\b|api[_-]?(?:key|token)|access[_-]?token|authorization|bearer|password|secret|credential)/i;
const unsafeObjectPrototype = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);
function fail(): never { throw new Error("GDELT_QUALIFICATION_INVALID"); }
function plain(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail();
  if (Reflect.ownKeys(Object.prototype).some(k => typeof k !== "string" || !unsafeObjectPrototype.has(k))) return fail();
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(k => typeof k !== "string" || !keys.includes(k))) return fail();
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(value, key); if (!d || !("value" in d) || !d.enumerable) return fail(); result[key] = d.value; }
  return result;
}
function arr(value: unknown, max: number): unknown[] {
  if (!value || typeof value !== "object" || types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return fail();
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > max || Reflect.ownKeys(value).length !== length + 1) return fail();
  const out: unknown[] = [];
  for (let i = 0; i < length; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d || !("value" in d) || !d.enumerable) return fail(); out.push(d.value); }
  return out;
}
function txt(v: unknown, max: number): string { if (typeof v !== "string" || !v.length || v.length > max || v.trim() !== v || control.test(v) || v.normalize("NFC") !== v) return fail(); return v; }
function safeId(v: unknown, max = 96): string { const s = txt(v, max); if (!/^[a-z][a-z0-9:_-]*$/.test(s) || secretLike.test(s)) return fail(); return s; }
function utc(v: unknown): string { if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v) return fail(); return v; }
function fingerprint(v: unknown): string { if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v)) return fail(); return v; }
function httpsUrl(v: unknown, max = 2048): string {
  const s = txt(v, max);
  if (s.includes("\\") || /%(?:2e|2f|5c)/i.test(s)) return fail();
  const u = new URL(s);
  if (u.protocol !== "https:" || u.username || u.password || u.hash || u.search || u.port || u.href !== s || u.hostname !== u.hostname.toLowerCase() || !u.hostname.includes(".") || u.hostname.endsWith(".")) return fail();
  if (u.pathname.split("/").some(part => part === "." || part === "..")) return fail();
  return s;
}
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort(compare).map(k => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(",")}}`;
}
function sha(value: unknown): string { return createHash("sha256").update(stable(value), "utf8").digest("hex"); }
function qualificationMaterialFingerprint(value: Record<string, unknown>): string {
  const material = { ...value }; delete material.recordedAt; return sha(material);
}
function freeze<T>(v: T): T { if (v && typeof v === "object" && !Object.isFrozen(v)) { for (const x of Object.values(v as Record<string, unknown>)) freeze(x); Object.freeze(v); } return v; }

const MATERIAL_KEYS = ["contractVersion", "providerId", "datasetId", "datasetVersion", "endpointProfileId", "endpointProfileFingerprint", "protocol", "hostname", "path", "methods", "modes", "formats", "queryKeys", "maxQueryLength", "maxResponseBytes", "maxRecordCount", "maxWindowSeconds", "maxRequests", "maxRequestsPerMinute", "maxRequestsPerProfile", "timeoutMs", "retries", "responseFields", "timestampSemantics", "urlIdentitySemantics", "languageCountrySemantics", "pagination", "correctionRetraction", "completeness", "freshness", "usageApprovals", "metadataStorage", "linkedContentStorage", "normalizedStorage", "authorityPersistence", "retention", "redistribution", "commercialUse", "blockers", "evidenceReferences", "reviewedAt", "effectiveFrom", "expiresAt", "recordedAt"] as const;
const refKeys = ["title", "url", "checkedAt", "classification", "claims"] as const;
const usageNames = ["RAW_ACQUISITION", "RAW_ARTIFACT_STORAGE", "NORMALIZED_CLAIM_STORAGE", "AUTHORITY_ISSUANCE", "REDISTRIBUTION", "COMMERCIAL_USE", "SIGNAL_RESEARCH"] as const;
const checkedAt = "2026-10-03T07:34:18.000Z";
const endpointProfileFingerprint = sha(GDELT_DOC_REQUEST_PROFILE);
const MATERIAL: QualificationMaterial = freeze({
  contractVersion: GDELT_DOC_QUALIFICATION_VERSION, providerId: GDELT_DOC_PROVIDER_ID, datasetId: "gdelt-doc", datasetVersion: "2.0", endpointProfileId: GDELT_DOC_REQUEST_PROFILE.id, endpointProfileFingerprint,
  protocol: "https", hostname: "api.gdeltproject.org", path: "/api/v2/doc/doc", methods: ["GET"], modes: ["artlist"], formats: ["json"],
  queryKeys: [...GDELT_DOC_REQUEST_PROFILE.queryKeys], maxQueryLength: 512, maxResponseBytes: 524288, maxRecordCount: 25, maxWindowSeconds: GDELT_DOC_REQUEST_PROFILE.maxWindowSeconds,
  maxRequests: 6, maxRequestsPerMinute: 6, maxRequestsPerProfile: 1, timeoutMs: 5000, retries: 0,
  responseFields: ["articleUrl", "sourceDomain", "title", "sourceLanguage?", "sourceCountry?", "providerSeenAt", "articleTime?", "imageUrl?"],
  timestampSemantics: "providerSeenAt is GDELT discovery/seen time; articleTime is optional and its exact publication semantics are not pinned for DOC JSON.",
  urlIdentitySemantics: "articleUrl is a source locator; it does not prove original publisher, unique article, or independent origin.",
  languageCountrySemantics: "DOC searches translated coverage; native response-field mapping for language/country is not pinned by the reviewed DOC JSON documentation.",
  pagination: "UNKNOWN", correctionRetraction: "UNKNOWN", completeness: "UNKNOWN", freshness: "UNKNOWN",
  usageApprovals: usageNames.map(usage => ({ usage, approval: "NOT_APPROVED" as const })),
  metadataStorage: "NOT_APPROVED", linkedContentStorage: "NOT_APPROVED", normalizedStorage: "NOT_APPROVED", authorityPersistence: "NOT_APPROVED", retention: "NOT_APPROVED", redistribution: "NOT_APPROVED", commercialUse: "NOT_APPROVED",
  blockers: [...GDELT_DOC_BLOCKERS],
  evidenceReferences: ([
    { title: "GDELT DOC 2.0 API Debuts!", url: "https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/", checkedAt, classification: "DOCUMENTED", claims: ["DOC is full-text search", "English query terms search machine-translated coverage", "ArticleList output and JSON/JSONP are described", "query syntax includes phrases and OR", "time-window and DateDesc behavior are described", "result field details vary by mode"] },
    { title: "The GDELT Story: About the GDELT Project", url: "https://gdeltproject.org/about.html", checkedAt, classification: "DOCUMENTED", claims: ["GDELT datasets are described as no-fee and unrestricted for academic, commercial and governmental use", "dataset redistribution requires GDELT citation and link"] },
    { title: "Ukraine, API Rate Limiting & Web NGrams 3.0", url: "https://blog.gdeltproject.org/ukraine-api-rate-limiting-web-ngrams-3-0/", checkedAt, classification: "DOCUMENTED", claims: ["DOC APIs are rate limited", "no numerical request quota is specified on this page"] },
    { title: "DOC & GEO 2.0 API Updates: Full Year Searching And More!", url: "https://blog.gdeltproject.org/doc-geo-2-0-api-updates-full-year-searching-and-more/", checkedAt, classification: "DOCUMENTED", claims: ["2018 announcement described up to a year of DOC history"] },
    { title: "DOC 2.0 Updates: 1.5 Year Searching And Updated Mobile Interface", url: "https://blog.gdeltproject.org/doc-2-0-updates-1-5-year-searching-and-updated-mobile-interface/", checkedAt, classification: "DOCUMENTED", claims: ["2018 announcement later described a fixed 2017 start and mode-specific recent-window behavior"] },
  ] as const).slice().sort((a, b) => compare(a.url, b.url)),
  reviewedAt: checkedAt, effectiveFrom: checkedAt, expiresAt: "2027-10-03T07:34:18.000Z", recordedAt: checkedAt,
});
const qualificationFingerprint = qualificationMaterialFingerprint(MATERIAL as unknown as Record<string, unknown>);
// This pinned value grants only synthetic projection. It is not in the empty production source registry.
const SYNTHETIC_QUALIFICATION = freeze({ ...MATERIAL, status: "PARTIAL_DISCOVERY_ONLY" as const, fingerprint: qualificationFingerprint });
TRUST.add(SYNTHETIC_QUALIFICATION);

export function parseGdeltDocQualification(input: unknown): QualificationParse {
  try {
    const v = plain(input, [...MATERIAL_KEYS, "status", "fingerprint"]);
    if (v.status !== "PARTIAL_DISCOVERY_ONLY" || fingerprint(v.fingerprint) !== qualificationFingerprint) return INVALID;
    if (v.contractVersion !== GDELT_DOC_QUALIFICATION_VERSION || v.providerId !== GDELT_DOC_PROVIDER_ID || v.datasetId !== "gdelt-doc" || v.datasetVersion !== "2.0" || v.endpointProfileId !== GDELT_DOC_REQUEST_PROFILE.id || v.endpointProfileFingerprint !== endpointProfileFingerprint || v.protocol !== "https" || v.hostname !== "api.gdeltproject.org" || v.path !== "/api/v2/doc/doc") return INVALID;
    const methods = arr(v.methods, 1), modes = arr(v.modes, 1), formats = arr(v.formats, 1);
    if (methods[0] !== "GET" || modes[0] !== "artlist" || formats[0] !== "json") return INVALID;
    const qkeys = arr(v.queryKeys, 16).map(x => safeId(x, 32));
    if (qkeys.length !== GDELT_DOC_REQUEST_PROFILE.queryKeys.length || qkeys.some((x, i) => x !== GDELT_DOC_REQUEST_PROFILE.queryKeys[i])) return INVALID;
    for (const [key, expected] of Object.entries({ maxQueryLength: 512, maxResponseBytes: 524288, maxRecordCount: 25, maxWindowSeconds: GDELT_DOC_REQUEST_PROFILE.maxWindowSeconds, maxRequests: 6, maxRequestsPerMinute: 6, maxRequestsPerProfile: 1, timeoutMs: 5000, retries: 0 })) if (v[key] !== expected) return INVALID;
    const responseFields = arr(v.responseFields, 32).map(x => txt(x, 256));
    if (stable(responseFields) !== stable(MATERIAL.responseFields)) return INVALID;
    for (const key of ["timestampSemantics", "urlIdentitySemantics", "languageCountrySemantics"]) txt(v[key], 512);
    if (v.pagination !== "UNKNOWN" || v.correctionRetraction !== "UNKNOWN" || v.completeness !== "UNKNOWN" || v.freshness !== "UNKNOWN") return INVALID;
    for (const key of ["metadataStorage", "linkedContentStorage", "normalizedStorage", "authorityPersistence", "retention", "redistribution", "commercialUse"]) if (v[key] !== "NOT_APPROVED") return INVALID;
    const uses = arr(v.usageApprovals, 7).map(entry => { const e = plain(entry, ["usage", "approval"]); const usage = txt(e.usage, 64); if (!/^[A-Z][A-Z0-9_]*$/.test(usage)) return fail(); return { usage, approval: e.approval }; });
    if (uses.length !== usageNames.length || uses.some((e, i) => e.usage !== usageNames[i] || e.approval !== "NOT_APPROVED")) return INVALID;
    const blockers = arr(v.blockers, 16).map(x => { const item = txt(x, 128); if (!/^[A-Z][A-Z0-9_]*$/.test(item)) return fail(); return item; });
    if (stable(blockers) !== stable(GDELT_DOC_BLOCKERS)) return INVALID;
    const refs = arr(v.evidenceReferences, 8).map(raw => {
      const r = plain(raw, refKeys), title = txt(r.title, 256), url = httpsUrl(r.url), checked = utc(r.checkedAt);
      if (checked > String(v.reviewedAt) || !["DOCUMENTED", "UNKNOWN"].includes(String(r.classification))) return fail();
      const claims = arr(r.claims, 16).map(x => txt(x, 256)); if (!claims.length || new Set(claims).size !== claims.length) return fail();
      return { title, url, checkedAt: checked, classification: r.classification as "DOCUMENTED" | "UNKNOWN", claims };
    });
    refs.sort((a, b) => compare(a.url, b.url));
    if (refs.length !== 5 || new Set(refs.map(r => r.url)).size !== refs.length) return INVALID;
    const reviewedAt = utc(v.reviewedAt), effectiveFrom = utc(v.effectiveFrom), expiresAt = utc(v.expiresAt), recordedAt = utc(v.recordedAt);
    if (reviewedAt !== checkedAt || effectiveFrom !== reviewedAt || expiresAt <= effectiveFrom || recordedAt < reviewedAt) return INVALID;
    const supplied: Record<string, unknown> = { ...v, methods, modes, formats, queryKeys: qkeys, responseFields, usageApprovals: uses, blockers, evidenceReferences: refs };
    delete supplied.status; delete supplied.fingerprint;
    if (qualificationMaterialFingerprint(supplied) !== qualificationFingerprint) return INVALID;
    const candidateMaterial = { ...MATERIAL, evidenceReferences: refs, recordedAt };
    if (qualificationMaterialFingerprint(candidateMaterial as unknown as Record<string, unknown>) !== qualificationFingerprint) return INVALID;
    const qualification = freeze({ ...candidateMaterial, status: "PARTIAL_DISCOVERY_ONLY" as const, fingerprint: qualificationFingerprint });
    return freeze({ status: "VALID" as const, qualification });
  } catch { return INVALID; }
}
export function isAuthenticGdeltDocQualification(value: unknown): value is GdeltDocSourceQualification { return !!value && typeof value === "object" && TRUST.has(value); }
export function getSyntheticGdeltDocProjectionQualification(): GdeltDocSourceQualification { return SYNTHETIC_QUALIFICATION; }
export function gdeltDocQueryProfileFingerprint(profileId: string): string | null { const p = GDELT_DOC_QUERY_PROFILES.find(x => x.id === profileId); return p ? sha({ version: "gdelt-doc-query-profile/v1", ...p }) : null; }
export function gdeltDocRequestFingerprint(profileId: string, windowStart: string, windowEnd: string): string | null {
  const profileFingerprint = gdeltDocQueryProfileFingerprint(profileId); if (!profileFingerprint) return null;
  try { const start = utc(windowStart), end = utc(windowEnd); if (start >= end || !start.endsWith(".000Z") || !end.endsWith(".000Z") || Date.parse(end) - Date.parse(start) > GDELT_DOC_REQUEST_PROFILE.maxWindowSeconds * 1000) return null;
    return sha({ profileId, profileFingerprint, windowStart: start, windowEnd: end, endpointProfileId: GDELT_DOC_REQUEST_PROFILE.id, endpointProfileFingerprint });
  } catch { return null; }
}
export function buildGdeltDocRequestQuery(profileId: string, start: string, end: string): string | null {
  const p = GDELT_DOC_QUERY_PROFILES.find(x => x.id === profileId); if (!p) return null;
  try { const s = utc(start), e = utc(end); if (s >= e || Date.parse(e) - Date.parse(s) > GDELT_DOC_REQUEST_PROFILE.maxWindowSeconds * 1000) return null;
    const stamp = (x: string) => x.replace(/[-:TZ.]/g, "").slice(0, 14);
    const params = new URLSearchParams([ ["query", p.query], ["mode", "artlist"], ["format", "json"], ["maxrecords", "25"], ["startdatetime", stamp(s)], ["enddatetime", stamp(e)], ["sort", "DateDesc"] ]);
    const result = params.toString(); return result.length <= GDELT_DOC_REQUEST_PROFILE.maxQueryLength ? result : null;
  } catch { return null; }
}
const responseKeys = ["fixtureContract", "providerId", "queryProfileId", "queryProfileFingerprint", "queryFingerprint", "windowStart", "windowEnd", "receivedAt", "rawPayloadFingerprint", "records"] as const;
const recordKeys = ["articleUrl", "sourceDomain", "title", "sourceLanguage", "sourceCountry", "providerSeenAt", "articleTime", "imageUrl"] as const;
function parseDomain(v: unknown): string {
  const domain = txt(v, 253).toLowerCase();
  if (domain !== v || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) return fail();
  return domain;
}
export function parseGdeltSyntheticResponse(input: unknown, evaluationAsOf: string): GdeltSyntheticDocResponse | null {
  try {
    const v = plain(input, responseKeys);
    if (v.fixtureContract !== "gdelt-doc-normalized-fixture/v1" || v.providerId !== GDELT_DOC_PROVIDER_ID) return null;
    const profile = GDELT_DOC_QUERY_PROFILES.find(x => x.id === safeId(v.queryProfileId));
    if (!profile || v.queryProfileFingerprint !== gdeltDocQueryProfileFingerprint(profile.id)) return null;
    const receivedAt = utc(v.receivedAt), asOf = utc(evaluationAsOf), windowStart = utc(v.windowStart), windowEnd = utc(v.windowEnd);
    if (receivedAt > asOf || windowStart >= windowEnd || !windowStart.endsWith(".000Z") || !windowEnd.endsWith(".000Z") || Date.parse(windowEnd) - Date.parse(windowStart) > GDELT_DOC_REQUEST_PROFILE.maxWindowSeconds * 1000 || windowEnd > asOf) return null;
    const expectedQueryFingerprint = gdeltDocRequestFingerprint(profile.id, windowStart, windowEnd);
    if (v.queryFingerprint !== expectedQueryFingerprint) return null;
    fingerprint(v.rawPayloadFingerprint);
    const records = arr(v.records, GDELT_DOC_REQUEST_PROFILE.maxRecordCount).map(raw => {
      const r = plain(raw, recordKeys), articleUrl = httpsUrl(r.articleUrl), sourceDomain = parseDomain(r.sourceDomain), u = new URL(articleUrl);
      if (u.hostname.toLowerCase().replace(/^www\./, "") !== sourceDomain.replace(/^www\./, "")) return fail();
      const title = txt(r.title, 512); if (secretLike.test(title)) return fail();
      const providerSeenAt = utc(r.providerSeenAt), articleTime = r.articleTime === null ? null : utc(r.articleTime);
      const sourceLanguage = r.sourceLanguage === null ? null : txt(r.sourceLanguage, 16);
      if (sourceLanguage !== null && !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(sourceLanguage)) return fail();
      const sourceCountry = r.sourceCountry === null ? null : txt(r.sourceCountry, 16);
      if (sourceCountry !== null && !/^[A-Z]{2}$/.test(sourceCountry)) return fail();
      const imageUrl = r.imageUrl === null ? null : httpsUrl(r.imageUrl);
      if (providerSeenAt > receivedAt || (articleTime !== null && (articleTime > asOf || articleTime < windowStart || articleTime > windowEnd))) return fail();
      return freeze({ articleUrl, sourceDomain, title, sourceLanguage, sourceCountry, providerSeenAt, articleTime, imageUrl });
    });
    // Exact repeated provider material collapses by a derived local key; seen/receipt time is observation metadata.
    const unique = new Map<string, typeof records[number]>();
    for (const record of records) {
      const key = sha({ providerId: GDELT_DOC_PROVIDER_ID, articleUrl: record.articleUrl, sourceDomain: record.sourceDomain, title: record.title, sourceLanguage: record.sourceLanguage, sourceCountry: record.sourceCountry, articleTime: record.articleTime, imageUrl: record.imageUrl });
      const prior = unique.get(key);
      if (!prior || record.providerSeenAt < prior.providerSeenAt) unique.set(key, record);
    }
    return freeze({ fixtureContract: "gdelt-doc-normalized-fixture/v1", providerId: GDELT_DOC_PROVIDER_ID, queryProfileId: profile.id, queryProfileFingerprint: String(v.queryProfileFingerprint), queryFingerprint: expectedQueryFingerprint!, windowStart, windowEnd, receivedAt, rawPayloadFingerprint: String(v.rawPayloadFingerprint), records: [...unique.entries()].sort((a, b) => compare(a[0], b[0])).map(([, record]) => record) });
  } catch { return null; }
}
const BLOCKED: ProjectionResult = Object.freeze({ status: "BLOCKED", code: "GDELT_PROJECTION_BLOCKED" });
const validatedResponses = new WeakSet<object>();
export function projectGdeltDocDiscovery(input: unknown, evaluationAsOf: string): ProjectionResult {
  try {
    const v = plain(input, ["qualification", "response"]), qualification = v.qualification, response = v.response;
    if (!isAuthenticGdeltDocQualification(qualification) || qualification.status !== "PARTIAL_DISCOVERY_ONLY") return BLOCKED;
    if (!response || typeof response !== "object" || types.isProxy(response) || !validatedResponses.has(response)) return BLOCKED;
    const normalized = response as GdeltSyntheticDocResponse, asOf = utc(evaluationAsOf);
    if (asOf < qualification.effectiveFrom || asOf >= qualification.expiresAt || normalized.receivedAt < qualification.effectiveFrom || normalized.receivedAt > asOf || normalized.windowEnd > asOf || !GDELT_DOC_QUERY_PROFILES.some(p => p.id === normalized.queryProfileId && gdeltDocQueryProfileFingerprint(p.id) === normalized.queryProfileFingerprint)) return BLOCKED;
    const profile = GDELT_DOC_QUERY_PROFILES.find(p => p.id === normalized.queryProfileId)!;
    const candidates = normalized.records.map(record => {
      const material = { providerId: GDELT_DOC_PROVIDER_ID, articleUrl: record.articleUrl, sourceDomain: record.sourceDomain, title: record.title, sourceLanguage: record.sourceLanguage, sourceCountry: record.sourceCountry, articleTime: record.articleTime, imageUrl: record.imageUrl };
      const materialFingerprint = sha(material);
      const receiptFingerprint = sha({ sourceMaterialFingerprint: materialFingerprint, queryFingerprint: normalized.queryFingerprint, rawPayloadFingerprint: normalized.rawPayloadFingerprint, receivedAt: normalized.receivedAt });
      return freeze({ status: "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE" as const, authorityStatus: "DISCOVERY_ONLY" as const, provenance: "SYNTHETIC" as const,
        providerId: GDELT_DOC_PROVIDER_ID, queryProfileId: profile.id, sourceMaterialId: `gdelt-doc-material:${materialFingerprint}`, sourceMaterialFingerprint: materialFingerprint,
        queryFingerprint: normalized.queryFingerprint, rawPayloadFingerprint: normalized.rawPayloadFingerprint,
        receiptId: `gdelt-doc-receipt:${receiptFingerprint}`, receiptFingerprint,
        ...record, receivedAt: normalized.receivedAt, evaluatedAsOf: asOf, categoryHint: profile.category, completionProven: false as const, issuerMapping: "UNRESOLVED" as const, assetMapping: "UNRESOLVED" as const,
        eventAuthorityEligible: false as const, corroborationEligible: false as const, persistenceEligible: false as const, signalEligible: false as const, tradingEligible: false as const });
    });
    return freeze({ status: "PROJECTED" as const, candidates });
  } catch { return BLOCKED; }
}
// Vitest's private loader alone exposes this issuer; production modules never call or export it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function issueGdeltSyntheticResponseForTest(input: unknown, evaluationAsOf: string): GdeltSyntheticDocResponse | null {
  const response = parseGdeltSyntheticResponse(input, evaluationAsOf); if (!response) return null; validatedResponses.add(response); return response;
}
export function rejectGdeltDiscoveryAsAuthority(_value: unknown, boundary: "ISSUER" | "CORROBORATION" | "EVENT" | "PERSISTENCE" | "SIGNAL" | "TRADING"): null { void boundary; return null; }
