import "server-only";
import { createHash } from "node:crypto";
import { types } from "node:util";

export const EXCHANGE_ANNOUNCEMENT_QUALIFICATION_VERSION = "event-intelligence-exchange-regulatory-announcement-source-qualification/v1" as const;
export const EXCHANGE_ANNOUNCEMENT_NORMAL_FORM_VERSION = "synthetic-exchange-announcement-normal-form/v1" as const;
export const EXCHANGE_ANNOUNCEMENT_ORIGIN_SET_VERSION = "exchange-announcement-origin-set/v1" as const;
export const EXCHANGE_ANNOUNCEMENT_ROLES = Object.freeze(["REGULATORY_ANNOUNCEMENT", "EXCHANGE_ISSUER_ANNOUNCEMENT", "CORPORATE_ACTION_NOTICE", "ISSUER_DISCLOSURE_COPY", "DISCOVERY_INDEX", "OUT_OF_SCOPE"] as const);
export const EXCHANGE_ANNOUNCEMENT_STATUSES = Object.freeze(["PARTIAL_REGULATORY_DISCLOSURE_CANDIDATE", "PARTIAL_EXCHANGE_DISCLOSURE_CANDIDATE", "PARTIAL_DISCOVERY_ONLY", "BLOCKED_UNDOCUMENTED_RETRIEVAL", "BLOCKED_RIGHTS_UNAPPROVED", "BLOCKED_UNSUPPORTED_AUTHENTICATION_TRANSPORT", "OUT_OF_SCOPE"] as const);
export const EXCHANGE_ANNOUNCEMENT_CATEGORIES = Object.freeze(["PURCHASE_INTENT", "BOARD_AUTHORIZATION", "TREASURY_POLICY", "BINDING_AGREEMENT", "EXPECTED_CLOSING", "COMPLETED_PURCHASE_CLAIM", "COMPLETED_ACQUISITION_CLAIM", "CANCELLATION_OR_TERMINATION", "CORRECTION_HINT", "REPLACEMENT_HINT", "WITHDRAWAL_HINT", "UNRELATED_CORPORATE_ACTION", "UNSPECIFIED_RELEVANT_MENTION"] as const);
export const EXCHANGE_ANNOUNCEMENT_LIMITS: Readonly<{ candidates: number; identifiers: number; assets: number; headline: number; amount: number; identifier: number; url: number }> = Object.freeze({ candidates: 128, identifiers: 16, assets: 32, headline: 512, amount: 128, identifier: 128, url: 2048 });

export type ExchangeAnnouncementRole = typeof EXCHANGE_ANNOUNCEMENT_ROLES[number];
export type ExchangeAnnouncementStatus = typeof EXCHANGE_ANNOUNCEMENT_STATUSES[number];
type Usage = "RAW_ACQUISITION" | "RAW_ARTIFACT_STORAGE" | "NORMALIZED_CLAIM_STORAGE" | "AUTHORITY_ISSUANCE" | "REDISTRIBUTION" | "COMMERCIAL_USE" | "SIGNAL_RESEARCH";
type Evidence = Readonly<{ id: string; title: string; url: string; checkedAt: string; classification: "DOCUMENTED" | "OBSERVED" | "INFERRED" | "UNKNOWN"; claims: readonly string[] }>;
export type ExchangeAnnouncementQualification = Readonly<{
  contractVersion: typeof EXCHANGE_ANNOUNCEMENT_QUALIFICATION_VERSION; sourceCandidateId: string; operator: string; jurisdiction: string;
  sourceRole: ExchangeAnnouncementRole; qualificationStatus: ExchangeAnnouncementStatus; supportedIssuerScope: string;
  supportedAnnouncementCategories: readonly string[]; identifierSemantics: string; announcementIdentifierSemantics: string; documentIdentitySemantics: string;
  publicationTimeSemantics: string; correctionReplacementWithdrawalSemantics: string; archiveHistory: "DOCUMENTED" | "PARTIAL" | "UNKNOWN";
  completeness: "DOCUMENTED_FOR_NARROW_SCOPE" | "PARTIAL" | "UNKNOWN"; latency: "DOCUMENTED" | "UNKNOWN";
  retrievalProfiles: readonly string[]; requestAllowlist: readonly string[]; responseFieldAllowlist: readonly string[]; authenticationAndQuotas: string; payloadSchemaKnowledge: string;
  allowedHosts: readonly string[]; allowlistedRoles: readonly ExchangeAnnouncementRole[]; localRequestBudget: Readonly<{ requests: number; bytes: number; timeoutMs: number; retries: number }>;
  blockers: readonly string[]; approvals: readonly Readonly<{ usage: Usage; status: "NOT_APPROVED" }>[];
  rawStorage: "NOT_APPROVED"; normalizedStorage: "NOT_APPROVED"; retention: "NOT_APPROVED"; redistribution: "NOT_APPROVED"; commercialUse: "NOT_APPROVED";
  evidence: readonly Evidence[]; reviewedAt: string; recordedAt: string; fingerprint: string;
}>;
export type QualificationParse = Readonly<{ status: "VALID"; qualification: ExchangeAnnouncementQualification }> | Readonly<{ status: "INVALID"; code: "EXCHANGE_ANNOUNCEMENT_QUALIFICATION_INVALID" }>;
const INVALID_QUALIFICATION: QualificationParse = Object.freeze({ status: "INVALID", code: "EXCHANGE_ANNOUNCEMENT_QUALIFICATION_INVALID" });
const usages: readonly Usage[] = ["RAW_ACQUISITION", "RAW_ARTIFACT_STORAGE", "NORMALIZED_CLAIM_STORAGE", "AUTHORITY_ISSUANCE", "REDISTRIBUTION", "COMMERCIAL_USE", "SIGNAL_RESEARCH"];
const registryTrust = new WeakSet<object>(), normalTrust = new WeakSet<object>(), candidateTrust = new WeakSet<object>(), originTrust = new WeakSet<object>();
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const fail = (): never => { throw new Error("EXCHANGE_ANNOUNCEMENT_INVALID"); };
const controls = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const secretish = /(?:https?:|www\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:[/?#]|$)|api[_-]?(?:key|token)|authorization|bearer|password|secret|credential)/i;
const objectPrototypeKeys = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);
function plain(input: unknown, expected: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || types.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype) return fail();
  if (Reflect.ownKeys(Object.prototype).some(k => typeof k !== "string" || !objectPrototypeKeys.has(k))) return fail();
  const keys = Reflect.ownKeys(input); if (keys.length !== expected.length || keys.some(k => typeof k !== "string" || !expected.includes(k))) return fail();
  const result: Record<string, unknown> = Object.create(null);
  for (const key of expected) { const d = Object.getOwnPropertyDescriptor(input, key); if (!d || !("value" in d) || !d.enumerable) return fail(); result[key] = d.value; }
  return result;
}
function array(input: unknown, max: number): unknown[] {
  if (!input || typeof input !== "object" || types.isProxy(input) || !Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return fail();
  const n = Object.getOwnPropertyDescriptor(input, "length")?.value;
  if (!Number.isSafeInteger(n) || n < 0 || n > max || Reflect.ownKeys(input).length !== n + 1) return fail();
  const out: unknown[] = []; for (let i = 0; i < n; i++) { const d = Object.getOwnPropertyDescriptor(input, String(i)); if (!d || !("value" in d) || !d.enumerable) return fail(); out.push(d.value); } return out;
}
function text(input: unknown, max: number): string { if (typeof input !== "string" || !input.length || input.length > max || input.trim() !== input || controls.test(input) || input.normalize("NFC") !== input) return fail(); return input; }
function identifier(input: unknown, max = EXCHANGE_ANNOUNCEMENT_LIMITS.identifier): string { const v = text(input, max); if (!/^[a-z0-9][a-z0-9:_-]*$/.test(v) || secretish.test(v)) return fail(); return v; }
function enumValue<T extends readonly string[]>(input: unknown, values: T): T[number] { if (typeof input !== "string" || !values.includes(input)) return fail(); return input; }
function timestamp(input: unknown): string { if (typeof input !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input) || !Number.isFinite(Date.parse(input)) || new Date(input).toISOString() !== input) return fail(); return input; }
function url(input: unknown, hosts?: readonly string[]): string {
  const value = text(input, EXCHANGE_ANNOUNCEMENT_LIMITS.url);
  if (!/^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9._/-]*$/.test(value) || value.includes("//", 8)) return fail();
  const parsed = new URL(value); const hostname = parsed.hostname;
  if (parsed.href !== value || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || hostname.endsWith(".") || hostname.split(".").some(x => !x || x.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x)) || parsed.pathname.split("/").some(x => x === "." || x === "..")) return fail();
  if (hosts && !hosts.some(host => hostname === host)) return fail();
  return value;
}
function freeze<T>(v: T): T { if (v && typeof v === "object" && !Object.isFrozen(v)) { for (const x of Object.values(v as object)) freeze(x); Object.freeze(v); } return v; }
function canonical(v: unknown): string { if (v === null || typeof v !== "object") return JSON.stringify(v); if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`; return `{${Object.keys(v as object).sort(lexical).map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`; }
function digest(v: unknown): string { return createHash("sha256").update(canonical(v), "utf8").digest("hex"); }
function sortedUnique<T>(xs: T[], key: (x: T) => string): T[] { if (new Set(xs.map(key)).size !== xs.length) return fail(); return xs.sort((a, b) => lexical(key(a), key(b))); }

const QUALIFICATION_KEYS = ["contractVersion", "sourceCandidateId", "operator", "jurisdiction", "sourceRole", "qualificationStatus", "supportedIssuerScope", "supportedAnnouncementCategories", "identifierSemantics", "announcementIdentifierSemantics", "documentIdentitySemantics", "publicationTimeSemantics", "correctionReplacementWithdrawalSemantics", "archiveHistory", "completeness", "latency", "retrievalProfiles", "requestAllowlist", "responseFieldAllowlist", "authenticationAndQuotas", "payloadSchemaKnowledge", "allowedHosts", "allowlistedRoles", "localRequestBudget", "blockers", "approvals", "rawStorage", "normalizedStorage", "retention", "redistribution", "commercialUse", "evidence", "reviewedAt", "recordedAt", "fingerprint"] as const;
const evidenceKeys = ["id", "title", "url", "checkedAt", "classification", "claims"] as const;
function qualificationMaterial(v: Record<string, unknown>): Record<string, unknown> { const out: Record<string, unknown> = Object.create(null); for (const key of QUALIFICATION_KEYS) if (key !== "recordedAt" && key !== "fingerprint") out[key] = v[key]; return out; }
function evidenceList(input: unknown): Evidence[] {
  return sortedUnique(array(input, 32).map(row => { const x = plain(row, evidenceKeys); const claims = sortedUnique(array(x.claims, 16).map(c => text(c, 512)), c => c); if (!claims.length) return fail(); return { id: identifier(x.id), title: text(x.title, 256), url: url(x.url), checkedAt: timestamp(x.checkedAt), classification: enumValue(x.classification, ["DOCUMENTED", "OBSERVED", "INFERRED", "UNKNOWN"] as const), claims }; }), x => x.id);
}
function stringList(input: unknown, max: number, limit = 128): string[] { return sortedUnique(array(input, limit).map(x => identifier(x, max)), x => x); }

const reviewedAt = "2026-10-03T10:14:11.000Z";
const E = (id: string, title: string, urlValue: string, classification: Evidence["classification"], claims: string[]): Evidence => ({ id, title, url: urlValue, checkedAt: reviewedAt, classification, claims });
const evidence = {
  lse: [E("lseg-rns", "Regulatory News Services (RNS)", "https://www.lseg.com/en/capital-markets/regulatory-news-service", "DOCUMENTED", ["RNS is a UK regulated information service and issuer financial-communications channel; announcements appear on LSE Market News and data vendors.", "LSEG lists a data-vendor licensing policy and RNS Data Feed product; this is not an acquisition grant for this application."]), E("lse-news-explorer", "Contextual help | London Stock Exchange", "https://www.londonstockexchange.com/help/whats-news-explorer", "DOCUMENTED", ["News Explorer searches real-time communications published by entities registered with RNS and exposes company/code, free-text and headline filters."]), E("lse-license", "Market Data Licensing", "https://www.londonstockexchange.com/equities-trading/market-data/market-data-licensing", "DOCUMENTED", ["LSE states licensing is required for RNS data use including redistribution, derived data, non-display and other application usage."]), E("lse-policy", "RNS Pricing and Policy Guidelines 2026", "https://www.lseg.com/content/dam/lseg/en_us/documents/rns/rns-pricing-and-policy-guidelines-2026.pdf", "DOCUMENTED", ["The policy defines an RNS Data Feed and licensed access concepts; actual access, licence, schema and permissions remain product-specific."])],
  asx: [E("asx-announcements", "Announcements", "https://www.asx.com.au/markets/trade-our-cash-market/announcements.cgl", "DOCUMENTED", ["ASX displays announcement company/code, headline, release date/time, price-sensitive marker and PDF link; archive search is available."]), E("asx-search", "Search for recent and past announcements", "https://www.asx.com.au/asx/v2/statistics/announcements.do", "DOCUMENTED", ["The search describes recent and past announcements; code search uses ticker prefix and supports date windows and code history."]), E("asx-comnews", "Company news", "https://www.asx.com.au/connectivity-and-data/information-services/company-news", "DOCUMENTED", ["ASX ComNews offers real-time and delayed subscription feeds, PDF announcements with metadata files, and redistribution requires contact."]), E("asx-terms", "Terms of use", "https://www.asx.com.au/legals/terms-of-use.html", "DOCUMENTED", ["Market announcements are listed-entity responsibility; public content is for private/personal use and commercial use needs express written authority; site scraping and downloading are restricted."])],
  nyse: [E("nyse-actions", "Corporate Actions", "https://www.nyse.com/market-data/corporate-actions", "DOCUMENTED", ["NYSE corporate-action products cover listed-security actions such as dividends, splits, rights, spin-offs, listing changes and delistings; API/feed products are subscription/data products."]), E("nyse-regulation", "Corporate Actions, Market Watch & Proxy Compliance", "https://www.nyse.com/regulation/corporate-actions-market-watch-proxy-compliance", "DOCUMENTED", ["NYSE describes issuer market-news obligations and exchange corporate-action notices; this is not a general crypto-treasury announcement corpus."])],
  nasdaq: [E("nasdaq-press", "Press Releases | Nasdaq, Inc.", "https://ir.nasdaq.com/news-and-events/press-releases", "OBSERVED", ["Nasdaq Inc IR page lists releases that may be marked GlobeNewswire; this is issuer IR/distribution material, not proof of a Nasdaq Exchange announcement source."]), E("nasdaq-market", "Press Releases | Nasdaq", "https://www.nasdaq.com/market-activity/quotes/press-releases", "DOCUMENTED", ["Nasdaq.com provides company press-release discovery by symbol; source/distribution role does not establish exchange regulatory authority or native feed rights."])]
} as const;
const sourceSpecs = [
  { sourceCandidateId: "lse-rns", operator: "London Stock Exchange Group / RNS", jurisdiction: "GB", sourceRole: "REGULATORY_ANNOUNCEMENT", qualificationStatus: "PARTIAL_REGULATORY_DISCLOSURE_CANDIDATE", supportedIssuerScope: "UK regulatory and financial communications submitted by RNS registrants; not all listed issuers or all global issuer news.", categories: ["PURCHASE_INTENT", "BOARD_AUTHORIZATION", "TREASURY_POLICY", "BINDING_AGREEMENT", "EXPECTED_CLOSING", "COMPLETED_PURCHASE_CLAIM", "COMPLETED_ACQUISITION_CLAIM", "CANCELLATION_OR_TERMINATION", "CORRECTION_HINT", "REPLACEMENT_HINT", "WITHDRAWAL_HINT", "UNSPECIFIED_RELEVANT_MENTION"], profiles: ["lse-news-explorer-web-reference-v1", "rns-licensed-data-feed-profile-unqualified-v1"], hosts: ["londonstockexchange.com", "lseg.com", "www.londonstockexchange.com"], archive: "PARTIAL", completeness: "UNKNOWN", latency: "UNKNOWN", blocker: "Public News Explorer and licensed RNS feed are distinct; no application acquisition licence, native schema, endpoint, quotas, corrections or storage rights are approved.", evidence: evidence.lse },
  { sourceCandidateId: "asx-company-announcements", operator: "Australian Securities Exchange", jurisdiction: "AU", sourceRole: "EXCHANGE_ISSUER_ANNOUNCEMENT", qualificationStatus: "PARTIAL_EXCHANGE_DISCLOSURE_CANDIDATE", supportedIssuerScope: "Market announcements lodged by ASX listed entities; announcement content is issuer-submitted and not ASX factual verification.", categories: ["PURCHASE_INTENT", "BOARD_AUTHORIZATION", "TREASURY_POLICY", "BINDING_AGREEMENT", "EXPECTED_CLOSING", "COMPLETED_PURCHASE_CLAIM", "COMPLETED_ACQUISITION_CLAIM", "CANCELLATION_OR_TERMINATION", "CORRECTION_HINT", "REPLACEMENT_HINT", "WITHDRAWAL_HINT", "UNSPECIFIED_RELEVANT_MENTION"], profiles: ["asx-announcement-search-web-reference-v1", "asx-comnews-licensed-feed-profile-unqualified-v1"], hosts: ["asx.com.au", "www.asx.com.au"], archive: "DOCUMENTED", completeness: "UNKNOWN", latency: "UNKNOWN", blocker: "Public PDF access is not machine-acquisition or storage approval; no feed credentials/licence, native schema, stable announcement identifier, correction model or product rights are approved.", evidence: evidence.asx },
  { sourceCandidateId: "nyse-corporate-actions", operator: "NYSE Group", jurisdiction: "US", sourceRole: "CORPORATE_ACTION_NOTICE", qualificationStatus: "OUT_OF_SCOPE", supportedIssuerScope: "NYSE Group listed-security corporate-action data only; not general issuer event or crypto-treasury announcements.", categories: ["UNRELATED_CORPORATE_ACTION"], profiles: ["nyse-corporate-action-product-reference-v1"], hosts: ["nyse.com"], archive: "UNKNOWN", completeness: "UNKNOWN", latency: "UNKNOWN", blocker: "Corporate-action notices do not cover the target treasury-purchase and issuer-event scope; no projection is permitted.", evidence: evidence.nyse },
  { sourceCandidateId: "nasdaq-exchange-announcements", operator: "Nasdaq Exchange", jurisdiction: "US", sourceRole: "OUT_OF_SCOPE", qualificationStatus: "OUT_OF_SCOPE", supportedIssuerScope: "No concrete Nasdaq Exchange issuer-announcement source qualified in this review.", categories: [], profiles: [], hosts: ["nasdaq.com", "nasdaq.net"], archive: "UNKNOWN", completeness: "UNKNOWN", latency: "UNKNOWN", blocker: "Nasdaq.com press releases are not thereby Nasdaq Exchange regulatory announcements; Nasdaq Inc IR and GlobeNewswire distribution remain separate source families.", evidence: evidence.nasdaq },
  { sourceCandidateId: "nasdaq-issuer-ir-index", operator: "Nasdaq, Inc. Investor Relations / Nasdaq.com press-release index", jurisdiction: "US", sourceRole: "DISCOVERY_INDEX", qualificationStatus: "PARTIAL_DISCOVERY_ONLY", supportedIssuerScope: "Nasdaq Inc IR and Nasdaq.com press-release index entries as discovery pointers only; excludes exchange authority.", categories: ["UNSPECIFIED_RELEVANT_MENTION"], profiles: ["nasdaq-ir-press-release-index-reference-v1"], hosts: ["ir.nasdaq.com", "nasdaq.com"], archive: "PARTIAL", completeness: "UNKNOWN", latency: "UNKNOWN", blocker: "Issuer/press-release index provenance, feed access, native schema, content rights and archive semantics are not qualified; GlobeNewswire labels do not convert this to exchange authority.", evidence: evidence.nasdaq },
] as const;
type Spec = typeof sourceSpecs[number];
function buildRawQualification(spec: Spec): Record<string, unknown> {
  const body: Record<string, unknown> = {
    contractVersion: EXCHANGE_ANNOUNCEMENT_QUALIFICATION_VERSION, sourceCandidateId: spec.sourceCandidateId, operator: spec.operator, jurisdiction: spec.jurisdiction, sourceRole: spec.sourceRole, qualificationStatus: spec.qualificationStatus,
    supportedIssuerScope: spec.supportedIssuerScope, supportedAnnouncementCategories: [...spec.categories].sort(lexical), identifierSemantics: "Issuer, listed-security, ticker, ISIN, LEI and CIK values are typed candidates only; they do not bind the legal issuer or merge listings.",
    announcementIdentifierSemantics: "Use provider-stable announcement identifiers only when documented per profile; otherwise generated identity is local and never provider-issued.", documentIdentitySemantics: "Announcement page and attached PDF are one publication only when explicit material binding exists; bytes/schema are not observed or parsed here.",
    publicationTimeSemantics: "Displayed release time remains separate from discovery, receipt and evaluation time; timezone and publication semantics are source-specific unless explicitly documented.", correctionReplacementWithdrawalSemantics: "NONE/CORRECTION_HINT/REPLACEMENT_HINT/WITHDRAWAL_HINT/UNKNOWN are hints only; no lineage or overwrite is created.",
    archiveHistory: spec.archive, completeness: spec.completeness, latency: spec.latency, retrievalProfiles: [...spec.profiles].sort(lexical), authenticationAndQuotas: "UNKNOWN or licensed product-specific; no authentication, quota, reader endpoint or acquisition grant is configured.",
    requestAllowlist: ["NO_AUTOMATED_REQUESTS", "REFERENCE_PROFILES_ONLY"], responseFieldAllowlist: [], payloadSchemaKnowledge: "Native machine response fields are not allowlisted; only the internal SYNTHETIC normal form is accepted.", allowedHosts: [...spec.hosts].sort(lexical), allowlistedRoles: [spec.sourceRole], localRequestBudget: { requests: 0, bytes: 0, timeoutMs: 0, retries: 0 },
    blockers: [spec.blocker], approvals: [...usages].sort(lexical).map(usage => ({ usage, status: "NOT_APPROVED" })), rawStorage: "NOT_APPROVED", normalizedStorage: "NOT_APPROVED", retention: "NOT_APPROVED", redistribution: "NOT_APPROVED", commercialUse: "NOT_APPROVED",
    evidence: [...spec.evidence].map(x => ({ ...x, claims: [...x.claims].sort(lexical) })).sort((a, b) => lexical(a.id, b.id)), reviewedAt, recordedAt: reviewedAt,
  };
  body.fingerprint = digest({ version: EXCHANGE_ANNOUNCEMENT_QUALIFICATION_VERSION, material: qualificationMaterial(body) });
  return body;
}
function parseQualification(input: unknown): QualificationParse {
  try {
    const v = plain(input, QUALIFICATION_KEYS);
    if (v.contractVersion !== EXCHANGE_ANNOUNCEMENT_QUALIFICATION_VERSION) return INVALID_QUALIFICATION;
    const sourceCandidateId = identifier(v.sourceCandidateId), spec = sourceSpecs.find(x => x.sourceCandidateId === sourceCandidateId); if (!spec) return INVALID_QUALIFICATION;
    const operator = text(v.operator, 160), jurisdiction = text(v.jurisdiction, 8), sourceRole = enumValue(v.sourceRole, EXCHANGE_ANNOUNCEMENT_ROLES), qualificationStatus = enumValue(v.qualificationStatus, EXCHANGE_ANNOUNCEMENT_STATUSES);
    if (operator !== spec.operator || jurisdiction !== spec.jurisdiction || sourceRole !== spec.sourceRole || qualificationStatus !== spec.qualificationStatus) return INVALID_QUALIFICATION;
    const supportedAnnouncementCategories = sortedUnique(array(v.supportedAnnouncementCategories, 16).map(x => enumValue(x, EXCHANGE_ANNOUNCEMENT_CATEGORIES)), x => x), retrievalProfiles = stringList(v.retrievalProfiles, 96, 8), requestAllowlist = sortedUnique(array(v.requestAllowlist, 4).map(x => enumValue(x, ["NO_AUTOMATED_REQUESTS", "REFERENCE_PROFILES_ONLY"] as const)), x => x), responseFieldAllowlist = array(v.responseFieldAllowlist, 0) as string[], allowedHosts = sortedUnique(array(v.allowedHosts, 8).map(x => text(x, 253)), x => x), allowlistedRoles = sortedUnique(array(v.allowlistedRoles, 6).map(x => enumValue(x, EXCHANGE_ANNOUNCEMENT_ROLES)), x => x);
    if (canonical(requestAllowlist) !== canonical(["NO_AUTOMATED_REQUESTS", "REFERENCE_PROFILES_ONLY"]) || responseFieldAllowlist.length !== 0) return INVALID_QUALIFICATION;
    if (canonical(supportedAnnouncementCategories) !== canonical([...spec.categories].sort(lexical)) || canonical(retrievalProfiles) !== canonical([...spec.profiles].sort(lexical)) || canonical(allowedHosts) !== canonical([...spec.hosts].sort(lexical)) || canonical(allowlistedRoles) !== canonical([spec.sourceRole])) return INVALID_QUALIFICATION;
    const timeObj = plain(v.localRequestBudget, ["requests", "bytes", "timeoutMs", "retries"]); if (![timeObj.requests, timeObj.bytes, timeObj.timeoutMs, timeObj.retries].every(Number.isSafeInteger) || timeObj.requests !== 0 || timeObj.bytes !== 0 || timeObj.timeoutMs !== 0 || timeObj.retries !== 0) return INVALID_QUALIFICATION;
    const approvals = sortedUnique(array(v.approvals, 7).map(row => { const a = plain(row, ["usage", "status"]); if (!usages.includes(a.usage as Usage) || a.status !== "NOT_APPROVED") return fail(); return { usage: a.usage as Usage, status: "NOT_APPROVED" as const }; }), x => x.usage);
    if (approvals.length !== usages.length || usages.some(u => !approvals.some(a => a.usage === u))) return INVALID_QUALIFICATION;
    const evidenceRows = evidenceList(v.evidence); if (!evidenceRows.length || evidenceRows.some(x => x.checkedAt > timestamp(v.reviewedAt))) return INVALID_QUALIFICATION;
    const blockers = sortedUnique(array(v.blockers, 8).map(x => text(x, 512)), x => x); if (blockers.length !== 1 || blockers[0] !== spec.blocker) return INVALID_QUALIFICATION;
    for (const k of ["supportedIssuerScope", "identifierSemantics", "announcementIdentifierSemantics", "documentIdentitySemantics", "publicationTimeSemantics", "correctionReplacementWithdrawalSemantics", "authenticationAndQuotas", "payloadSchemaKnowledge"] as const) text(v[k], 2048);
    if (!(["DOCUMENTED", "PARTIAL", "UNKNOWN"] as const).includes(v.archiveHistory as "DOCUMENTED" | "PARTIAL" | "UNKNOWN") || !(["DOCUMENTED_FOR_NARROW_SCOPE", "PARTIAL", "UNKNOWN"] as const).includes(v.completeness as "DOCUMENTED_FOR_NARROW_SCOPE" | "PARTIAL" | "UNKNOWN") || !(["DOCUMENTED", "UNKNOWN"] as const).includes(v.latency as "DOCUMENTED" | "UNKNOWN")) return INVALID_QUALIFICATION;
    for (const k of ["rawStorage", "normalizedStorage", "retention", "redistribution", "commercialUse"] as const) if (v[k] !== "NOT_APPROVED") return INVALID_QUALIFICATION;
    const checkedReviewed = timestamp(v.reviewedAt), recordedAtValue = timestamp(v.recordedAt); if (recordedAtValue < checkedReviewed) return INVALID_QUALIFICATION;
    const material = { ...qualificationMaterial(v), sourceCandidateId, sourceRole, qualificationStatus, supportedAnnouncementCategories, retrievalProfiles, requestAllowlist, responseFieldAllowlist, allowedHosts, allowlistedRoles, localRequestBudget: { requests: 0, bytes: 0, timeoutMs: 0, retries: 0 }, blockers, approvals, evidence: evidenceRows, reviewedAt: checkedReviewed } as Record<string, unknown>;
    const fingerprint = digest({ version: EXCHANGE_ANNOUNCEMENT_QUALIFICATION_VERSION, material }); if (v.fingerprint !== fingerprint) return INVALID_QUALIFICATION;
    return { status: "VALID", qualification: freeze({ ...material, contractVersion: EXCHANGE_ANNOUNCEMENT_QUALIFICATION_VERSION, recordedAt: recordedAtValue, fingerprint }) as ExchangeAnnouncementQualification };
  } catch { return INVALID_QUALIFICATION; }
}
export function parseExchangeAnnouncementQualification(input: unknown): QualificationParse { return parseQualification(input); }

const rawRegistry = sourceSpecs.map(buildRawQualification);
const qualificationRegistry = new Map<string, ExchangeAnnouncementQualification>();
for (const raw of rawRegistry) { const parsed = parseQualification(raw); if (parsed.status !== "VALID") throw new Error("EXCHANGE_ANNOUNCEMENT_REGISTRY_INVALID"); qualificationRegistry.set(parsed.qualification.sourceCandidateId, parsed.qualification); registryTrust.add(parsed.qualification); }
export function resolveExchangeAnnouncementQualification(sourceCandidateId: string): ExchangeAnnouncementQualification | null { return qualificationRegistry.get(sourceCandidateId) ?? null; }
export function listExchangeAnnouncementQualifications(): readonly ExchangeAnnouncementQualification[] { return Object.freeze([...qualificationRegistry.values()]); }
export function isAuthenticExchangeAnnouncementQualification(v: unknown): v is ExchangeAnnouncementQualification { return !!v && typeof v === "object" && registryTrust.has(v); }

type IssuerIdentifier = Readonly<{ scheme: "TICKER" | "ISIN" | "LEI" | "CIK" | "LOCAL_SECURITY_CODE" | "OTHER"; value: string; scope: "ISSUER_CANDIDATE" | "LISTED_SECURITY_CANDIDATE" | "DEPOSITARY_RECEIPT_CANDIDATE" }>;
type OriginBinding = Readonly<{ issuerCandidateId: string; announcementId: string; canonicalOriginUrl: string }>;
export type SyntheticExchangeAnnouncementInput = Readonly<{
  normalForm: typeof EXCHANGE_ANNOUNCEMENT_NORMAL_FORM_VERSION; provenance: "SYNTHETIC"; sourceCandidateId: string; jurisdiction: string; operator: string; sourceRole: ExchangeAnnouncementRole;
  issuerDisplayName: string; issuerIdentifiers: readonly IssuerIdentifier[]; announcementId: string | null; canonicalAnnouncementUrl: string; canonicalDocumentUrl: string | null;
  headline: string; categoryHint: typeof EXCHANGE_ANNOUNCEMENT_CATEGORIES[number]; publishedAt: string; discoveredAt: string; receivedAt: string; evaluatedAsOf: string;
  marketSensitive: boolean | null; lifecycleHint: "NONE" | "CORRECTION_HINT" | "REPLACEMENT_HINT" | "WITHDRAWAL_HINT" | "UNKNOWN"; assetMentions: readonly string[];
  amountText: string | null; currencyText: string | null; sourceLocator: string; materialFingerprint: string; payloadFingerprint: string; originBinding: OriginBinding | null;
}>;
export type ExchangeAnnouncementCandidate = Readonly<{
  status: "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE"; authorityStatus: "DISCOVERY_ONLY"; provenance: "SYNTHETIC";
  candidateId: string; sourceMaterialFingerprint: string; receiptFingerprint: string; sourceCandidateId: string; jurisdiction: string; operator: string; sourceRole: ExchangeAnnouncementRole;
  issuerDisplayName: string; issuerIdentifiers: readonly IssuerIdentifier[]; announcementId: string | null; canonicalAnnouncementUrl: string; canonicalDocumentUrl: string | null; headline: string; materialFingerprint: string;
  categoryHint: SyntheticExchangeAnnouncementInput["categoryHint"]; publishedAt: string; discoveredAt: string; receivedAt: string; evaluatedAsOf: string; marketSensitive: boolean | null;
  lifecycleHint: SyntheticExchangeAnnouncementInput["lifecycleHint"]; assetMentions: readonly string[]; amountText: string | null; currencyText: string | null; sourceLocator: string; originBinding: OriginBinding | null;
  issuerMappingEligible: false; assetMappingEligible: false; correctionLineageEligible: false; corroborationEligible: false; disclosureAuthorityEligible: false; eventAuthorityEligible: false; persistenceAuthorityEligible: false; signalEligible: false; tradingEligible: false;
}>;
const normalKeys = ["normalForm", "provenance", "sourceCandidateId", "jurisdiction", "operator", "sourceRole", "issuerDisplayName", "issuerIdentifiers", "announcementId", "canonicalAnnouncementUrl", "canonicalDocumentUrl", "headline", "categoryHint", "publishedAt", "discoveredAt", "receivedAt", "evaluatedAsOf", "marketSensitive", "lifecycleHint", "assetMentions", "amountText", "currencyText", "sourceLocator", "materialFingerprint", "payloadFingerprint", "originBinding"] as const;
function sourceMaterial(v: SyntheticExchangeAnnouncementInput): unknown { return { version: EXCHANGE_ANNOUNCEMENT_NORMAL_FORM_VERSION, sourceCandidateId: v.sourceCandidateId, jurisdiction: v.jurisdiction, operator: v.operator, sourceRole: v.sourceRole, issuerDisplayName: v.issuerDisplayName, issuerIdentifiers: v.issuerIdentifiers, announcementId: v.announcementId, canonicalAnnouncementUrl: v.canonicalAnnouncementUrl, canonicalDocumentUrl: v.canonicalDocumentUrl, headline: v.headline, categoryHint: v.categoryHint, publishedAt: v.publishedAt, marketSensitive: v.marketSensitive, lifecycleHint: v.lifecycleHint, assetMentions: v.assetMentions, amountText: v.amountText, currencyText: v.currencyText, sourceLocator: v.sourceLocator, originBinding: v.originBinding, materialFingerprint: v.materialFingerprint }; }
function identityMaterial(v: ExchangeAnnouncementCandidate): unknown { return sourceMaterial({ ...v, normalForm: EXCHANGE_ANNOUNCEMENT_NORMAL_FORM_VERSION, provenance: "SYNTHETIC", discoveredAt: v.discoveredAt, receivedAt: v.receivedAt, evaluatedAsOf: v.evaluatedAsOf, materialFingerprint: v.materialFingerprint, payloadFingerprint: "" } as SyntheticExchangeAnnouncementInput); }
export function parseSyntheticExchangeAnnouncement(input: unknown): SyntheticExchangeAnnouncementInput | null {
  try {
    const v = plain(input, normalKeys), sourceCandidateId = identifier(v.sourceCandidateId), q = qualificationRegistry.get(sourceCandidateId); if (!q || v.normalForm !== EXCHANGE_ANNOUNCEMENT_NORMAL_FORM_VERSION || v.provenance !== "SYNTHETIC") return null;
    if (v.jurisdiction !== q.jurisdiction || v.operator !== q.operator || v.sourceRole !== q.sourceRole) return null;
    if (q.qualificationStatus === "OUT_OF_SCOPE" || !["PARTIAL_REGULATORY_DISCLOSURE_CANDIDATE", "PARTIAL_EXCHANGE_DISCLOSURE_CANDIDATE", "PARTIAL_DISCOVERY_ONLY"].includes(q.qualificationStatus) || !q.allowlistedRoles.includes(v.sourceRole as ExchangeAnnouncementRole)) return null;
    const issuerDisplayName = text(v.issuerDisplayName, 256), issuerIdentifiers = sortedUnique(array(v.issuerIdentifiers, EXCHANGE_ANNOUNCEMENT_LIMITS.identifiers).map(row => { const i = plain(row, ["scheme", "value", "scope"]); const value = text(i.value, 128); if (secretish.test(value)) return fail(); return { scheme: enumValue(i.scheme, ["TICKER", "ISIN", "LEI", "CIK", "LOCAL_SECURITY_CODE", "OTHER"] as const), value, scope: enumValue(i.scope, ["ISSUER_CANDIDATE", "LISTED_SECURITY_CANDIDATE", "DEPOSITARY_RECEIPT_CANDIDATE"] as const) }; }), x => `${x.scheme}\0${x.scope}\0${x.value}`);
    if (!issuerIdentifiers.length) return null;
    const announcementId = v.announcementId === null ? null : identifier(v.announcementId);
    const canonicalAnnouncementUrl = url(v.canonicalAnnouncementUrl, q.allowedHosts), canonicalDocumentUrl = v.canonicalDocumentUrl === null ? null : url(v.canonicalDocumentUrl, q.allowedHosts);
    const headline = text(v.headline, EXCHANGE_ANNOUNCEMENT_LIMITS.headline), categoryHint = enumValue(v.categoryHint, EXCHANGE_ANNOUNCEMENT_CATEGORIES);
    const publishedAt = timestamp(v.publishedAt), discoveredAt = timestamp(v.discoveredAt), receivedAt = timestamp(v.receivedAt), evaluatedAsOf = timestamp(v.evaluatedAsOf);
    if (publishedAt > discoveredAt || discoveredAt > receivedAt || receivedAt > evaluatedAsOf || (categoryHint === "UNRELATED_CORPORATE_ACTION" && sourceCandidateId !== "nyse-corporate-actions")) return null;
    if (v.marketSensitive !== null && typeof v.marketSensitive !== "boolean") return null;
    const lifecycleHint = enumValue(v.lifecycleHint, ["NONE", "CORRECTION_HINT", "REPLACEMENT_HINT", "WITHDRAWAL_HINT", "UNKNOWN"] as const);
    const assetMentions = sortedUnique(array(v.assetMentions, EXCHANGE_ANNOUNCEMENT_LIMITS.assets).map(x => text(x, 96)), x => x);
    const amountText = v.amountText === null ? null : text(v.amountText, EXCHANGE_ANNOUNCEMENT_LIMITS.amount), currencyText = v.currencyText === null ? null : text(v.currencyText, 32);
    const sourceLocator = text(v.sourceLocator, 256); if (!/^(?:announcement|document):[a-z0-9][a-z0-9:_-]*$/.test(sourceLocator) || secretish.test(sourceLocator)) return null;
    if (typeof v.materialFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(v.materialFingerprint) || typeof v.payloadFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(v.payloadFingerprint)) return null;
    let originBinding: OriginBinding | null = null;
    if (v.originBinding !== null) { const b = plain(v.originBinding, ["issuerCandidateId", "announcementId", "canonicalOriginUrl"]); if (announcementId === null || b.announcementId !== announcementId) return null; originBinding = { issuerCandidateId: identifier(b.issuerCandidateId), announcementId: identifier(b.announcementId), canonicalOriginUrl: url(b.canonicalOriginUrl) }; }
    return freeze({ normalForm: EXCHANGE_ANNOUNCEMENT_NORMAL_FORM_VERSION, provenance: "SYNTHETIC", sourceCandidateId, jurisdiction: q.jurisdiction, operator: q.operator, sourceRole: q.sourceRole, issuerDisplayName, issuerIdentifiers, announcementId, canonicalAnnouncementUrl, canonicalDocumentUrl, headline, categoryHint, publishedAt, discoveredAt, receivedAt, evaluatedAsOf, marketSensitive: v.marketSensitive as boolean | null, lifecycleHint, assetMentions, amountText, currencyText, sourceLocator, materialFingerprint: v.materialFingerprint, payloadFingerprint: v.payloadFingerprint, originBinding });
  } catch { return null; }
}
function makeCandidate(v: SyntheticExchangeAnnouncementInput): ExchangeAnnouncementCandidate {
  const sourceMaterialFingerprint = digest(sourceMaterial(v));
  const candidate = freeze({ status: "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE" as const, authorityStatus: "DISCOVERY_ONLY" as const, provenance: "SYNTHETIC" as const, candidateId: `exchange-announcement-candidate:${sourceMaterialFingerprint}`, sourceMaterialFingerprint, receiptFingerprint: digest({ version: EXCHANGE_ANNOUNCEMENT_NORMAL_FORM_VERSION, sourceMaterialFingerprint, discoveredAt: v.discoveredAt, receivedAt: v.receivedAt, evaluatedAsOf: v.evaluatedAsOf, payloadFingerprint: v.payloadFingerprint }), sourceCandidateId: v.sourceCandidateId, jurisdiction: v.jurisdiction, operator: v.operator, sourceRole: v.sourceRole, issuerDisplayName: v.issuerDisplayName, issuerIdentifiers: v.issuerIdentifiers, announcementId: v.announcementId, canonicalAnnouncementUrl: v.canonicalAnnouncementUrl, canonicalDocumentUrl: v.canonicalDocumentUrl, headline: v.headline, materialFingerprint: v.materialFingerprint, categoryHint: v.categoryHint, publishedAt: v.publishedAt, discoveredAt: v.discoveredAt, receivedAt: v.receivedAt, evaluatedAsOf: v.evaluatedAsOf, marketSensitive: v.marketSensitive, lifecycleHint: v.lifecycleHint, assetMentions: v.assetMentions, amountText: v.amountText, currencyText: v.currencyText, sourceLocator: v.sourceLocator, originBinding: v.originBinding, issuerMappingEligible: false as const, assetMappingEligible: false as const, correctionLineageEligible: false as const, corroborationEligible: false as const, disclosureAuthorityEligible: false as const, eventAuthorityEligible: false as const, persistenceAuthorityEligible: false as const, signalEligible: false as const, tradingEligible: false as const });
  candidateTrust.add(candidate); return candidate;
}
export function projectExchangeAnnouncementCandidate(qualification: unknown, normalForm: unknown): ExchangeAnnouncementCandidate | null {
  if (!isAuthenticExchangeAnnouncementQualification(qualification) || !normalForm || typeof normalForm !== "object" || !normalTrust.has(normalForm)) return null;
  if (qualification.sourceCandidateId !== (normalForm as SyntheticExchangeAnnouncementInput).sourceCandidateId) return null;
  const parsed = parseSyntheticExchangeAnnouncement(normalForm); if (!parsed || parsed.jurisdiction !== qualification.jurisdiction || parsed.sourceRole !== qualification.sourceRole) return null;
  return makeCandidate(parsed);
}
export function isAuthenticExchangeAnnouncementCandidate(v: unknown): v is ExchangeAnnouncementCandidate { return !!v && typeof v === "object" && candidateTrust.has(v); }
export function compareExchangeAnnouncementCandidates(a: unknown, b: unknown): "UNTRUSTED" | "SAME_LOCAL_ANNOUNCEMENT_MATERIAL" | "FINGERPRINT_MATERIAL_CONFLICT" | "SAME_ANNOUNCEMENT_ID_MATERIAL_VARIANT" | "SAME_URL_MATERIAL_VARIANT" | "DISTINCT_UNVERIFIED_MATERIAL" {
  if (!isAuthenticExchangeAnnouncementCandidate(a) || !isAuthenticExchangeAnnouncementCandidate(b)) return "UNTRUSTED";
  if (a.sourceMaterialFingerprint === b.sourceMaterialFingerprint) return canonical(identityMaterial(a)) === canonical(identityMaterial(b)) ? "SAME_LOCAL_ANNOUNCEMENT_MATERIAL" : "FINGERPRINT_MATERIAL_CONFLICT";
  if (a.announcementId && a.sourceCandidateId === b.sourceCandidateId && a.announcementId === b.announcementId) return "SAME_ANNOUNCEMENT_ID_MATERIAL_VARIANT";
  if (a.canonicalAnnouncementUrl === b.canonicalAnnouncementUrl) return "SAME_URL_MATERIAL_VARIANT";
  return "DISTINCT_UNVERIFIED_MATERIAL";
}
export type ExchangeAnnouncementOriginSet = Readonly<{ contractVersion: typeof EXCHANGE_ANNOUNCEMENT_ORIGIN_SET_VERSION; status: "DISCOVERY_ONLY"; members: readonly Readonly<{ ordinal: number; candidate: ExchangeAnnouncementCandidate }>[]; groups: readonly Readonly<{ originGroupId: string; basis: "EXPLICIT_ORIGIN_BINDING" | "UNRESOLVED_SINGLETON"; candidateIds: readonly string[]; independentCorroborationCount: 0 }>[]; declaredMemberCount: number; fingerprint: string; evaluatedAsOf: string; recordedAt: string }>;
export function sealExchangeAnnouncementOriginSet(input: unknown): ExchangeAnnouncementOriginSet | null {
  try {
    const v = plain(input, ["contractVersion", "members", "declaredMemberCount", "evaluatedAsOf", "recordedAt"]), rows = array(v.members, EXCHANGE_ANNOUNCEMENT_LIMITS.candidates);
    if (v.contractVersion !== EXCHANGE_ANNOUNCEMENT_ORIGIN_SET_VERSION || rows.length === 0 || rows.length !== v.declaredMemberCount || rows.some(x => !isAuthenticExchangeAnnouncementCandidate(x))) return null;
    const evaluatedAsOf = timestamp(v.evaluatedAsOf), recordedAt = timestamp(v.recordedAt); if (recordedAt < evaluatedAsOf) return null;
    const candidates = rows as ExchangeAnnouncementCandidate[]; const byFingerprint = new Map<string, string>();
    for (const c of candidates) { if (c.discoveredAt > evaluatedAsOf || c.receivedAt > evaluatedAsOf || c.publishedAt > evaluatedAsOf || c.evaluatedAsOf > evaluatedAsOf) return null; const material = canonical(identityMaterial(c)), prior = byFingerprint.get(c.sourceMaterialFingerprint); if (prior !== undefined && prior !== material) return null; byFingerprint.set(c.sourceMaterialFingerprint, material); }
    const sorted = [...candidates].sort((a, b) => lexical(a.candidateId, b.candidateId)); if (new Set(sorted.map(x => x.candidateId)).size !== sorted.length) return null;
    const groupsMap = new Map<string, ExchangeAnnouncementCandidate[]>();
    for (const c of sorted) { const b = c.originBinding; const key = b ? `explicit:${canonical({ issuerCandidateId: b.issuerCandidateId, announcementId: b.announcementId, canonicalOriginUrl: b.canonicalOriginUrl })}` : `unresolved:${c.candidateId}`; const list = groupsMap.get(key) ?? []; list.push(c); groupsMap.set(key, list); }
    const members = sorted.map((candidate, ordinal) => ({ ordinal, candidate }));
    const groups = [...groupsMap].sort(([a], [b]) => lexical(a, b)).map(([originGroupId, xs]) => ({ originGroupId, basis: xs[0]!.originBinding ? "EXPLICIT_ORIGIN_BINDING" as const : "UNRESOLVED_SINGLETON" as const, candidateIds: xs.map(x => x.candidateId), independentCorroborationCount: 0 as const }));
    const fingerprint = digest({ version: EXCHANGE_ANNOUNCEMENT_ORIGIN_SET_VERSION, members: members.map(x => [x.ordinal, x.candidate.sourceMaterialFingerprint, x.candidate.lifecycleHint]), groups });
    const result = freeze({ contractVersion: EXCHANGE_ANNOUNCEMENT_ORIGIN_SET_VERSION, status: "DISCOVERY_ONLY" as const, members, groups, declaredMemberCount: members.length, fingerprint, evaluatedAsOf, recordedAt }); originTrust.add(result); return result;
  } catch { return null; }
}
export function isAuthenticExchangeAnnouncementOriginSet(v: unknown): v is ExchangeAnnouncementOriginSet { return !!v && typeof v === "object" && originTrust.has(v); }
export function rejectExchangeAnnouncementAsAuthority(value: unknown, boundary: "ISSUER_MAPPING" | "ASSET_MAPPING" | "CORRECTION_LINEAGE" | "CORROBORATION" | "ISSUER_DISCLOSURE_AUTHORITY" | "EVENT_AUTHORITY" | "PERSISTENCE" | "SIGNAL" | "TRADING"): null { void value; void boundary; return null; }
// Only the test-only Vite transform exposes this constructor; parser output remains untrusted.
function constructSyntheticAnnouncement(input: unknown): SyntheticExchangeAnnouncementInput | null { const parsed = parseSyntheticExchangeAnnouncement(input); if (parsed) normalTrust.add(parsed); return parsed; }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function constructSyntheticAnnouncementForTest(input: unknown): SyntheticExchangeAnnouncementInput | null { return constructSyntheticAnnouncement(input); }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function compareFingerprintMaterialForTest(fingerprintA: string, materialA: unknown, fingerprintB: string, materialB: unknown): "DIFFERENT_FINGERPRINT" | "SAME_MATERIAL" | "FINGERPRINT_MATERIAL_CONFLICT" { if (fingerprintA !== fingerprintB) return "DIFFERENT_FINGERPRINT"; return canonical(materialA) === canonical(materialB) ? "SAME_MATERIAL" : "FINGERPRINT_MATERIAL_CONFLICT"; }

export const EXCHANGE_ANNOUNCEMENT_PRODUCTION_VERSION = "event-intelligence-exchange-announcement-production/v1" as const;
const productionKeys = ["contractVersion", "status", "selectedSource", "credentialReference", "registry", "operations", "approvals", "rawStorage", "normalizedStorage", "retention", "redistribution", "commercialUse"] as const;
const operationNames = ["acquisition", "rawDocumentStorage", "metadataPersistence", "normalizedPersistence", "mapping", "correctionLineage", "corroboration", "issuerDisclosureAuthority", "externalEventAuthority", "scheduler", "signal", "trading"] as const;
export function parseExchangeAnnouncementProductionConfig(input: unknown): Readonly<Record<string, unknown>> | null {
  try {
    const v = plain(input, productionKeys); if (v.contractVersion !== EXCHANGE_ANNOUNCEMENT_PRODUCTION_VERSION || v.status !== "BLOCKED_BACKEND_UNAPPROVED" || v.selectedSource !== null || v.credentialReference !== null || array(v.registry, 0).length) return null;
    const operations = plain(v.operations, operationNames); if (Object.values(operations).some(x => x !== "BLOCKED")) return null;
    const approvals = sortedUnique(array(v.approvals, usages.length).map(x => { const a = plain(x, ["usage", "approval"]); if (!usages.includes(a.usage as Usage) || a.approval !== "NOT_APPROVED") return fail(); return { usage: a.usage as Usage, approval: "NOT_APPROVED" as const }; }), x => x.usage);
    if (approvals.length !== usages.length || usages.some(u => !approvals.some(a => a.usage === u)) || [v.rawStorage, v.normalizedStorage, v.retention, v.redistribution, v.commercialUse].some(x => x !== "NOT_APPROVED")) return null;
    return freeze({ contractVersion: EXCHANGE_ANNOUNCEMENT_PRODUCTION_VERSION, status: "BLOCKED_BACKEND_UNAPPROVED", selectedSource: null, credentialReference: null, registry: [], operations, approvals, rawStorage: "NOT_APPROVED", normalizedStorage: "NOT_APPROVED", retention: "NOT_APPROVED", redistribution: "NOT_APPROVED", commercialUse: "NOT_APPROVED" });
  } catch { return null; }
}
