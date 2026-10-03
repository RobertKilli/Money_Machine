import "server-only";
import { createHash } from "node:crypto";
import { types } from "node:util";

export const ISSUER_RELEASE_QUALIFICATION_VERSION = "event-intelligence-issuer-attributed-release-source-qualification/v1" as const;
export const ISSUER_RELEASE_NORMAL_FORM_VERSION = "synthetic-issuer-release-normal-form/v1" as const;
export const ISSUER_RELEASE_ORIGIN_SET_VERSION = "issuer-release-discovery-origin-set/v1" as const;
export const ISSUER_RELEASE_SOURCE_CLASSES = Object.freeze(["DIRECT_ISSUER_RELEASE", "ISSUER_AUTHORIZED_DISTRIBUTION", "SYNDICATED_COPY", "EDITORIAL_REPORT", "DISCOVERY_ONLY"] as const);
export type IssuerReleaseSourceClass = typeof ISSUER_RELEASE_SOURCE_CLASSES[number];
export const ISSUER_RELEASE_CATEGORIES = Object.freeze(["CORPORATE_CRYPTO_PURCHASE_INTENT", "BOARD_AUTHORIZATION", "BINDING_PURCHASE_AGREEMENT", "COMPLETED_CRYPTO_PURCHASE", "TREASURY_POLICY_CHANGE", "ASSET_OR_COMPANY_ACQUISITION", "STRATEGIC_PARTNERSHIP", "CANCELLATION_OR_TERMINATION", "CORRECTION_OR_RETRACTION", "UNSPECIFIED_RELEVANT_MENTION"] as const);
export type IssuerReleaseCategory = typeof ISSUER_RELEASE_CATEGORIES[number];
export type IssuerReleaseQualificationStatus = "PARTIAL_DISCOVERY_ONLY" | "PARTIAL_ISSUER_DISCLOSURE_CANDIDATE" | "BLOCKED_UNDOCUMENTED_RETRIEVAL" | "BLOCKED_UNSUPPORTED_AUTHENTICATION_TRANSPORT" | "BLOCKED_RIGHTS_UNAPPROVED";
export const ISSUER_RELEASE_LIMITS = Object.freeze({ candidates: 128, headline: 512, summary: 2048, mention: 192, url: 2048, identifier: 128 });

type Evidence = Readonly<{ id: string; url: string; title: string; classification: "DOCUMENTED" | "OBSERVED" | "INFERRED" | "UNKNOWN"; claim: string }>;
export type IssuerReleaseQualification = Readonly<{
  contractVersion: typeof ISSUER_RELEASE_QUALIFICATION_VERSION; candidateSourceId: string; sourceClass: IssuerReleaseSourceClass;
  status: IssuerReleaseQualificationStatus; issuerAttributionModel: string; publisher: string; distributor: string | null;
  retrievalProfiles: readonly string[]; releaseIdentitySemantics: string; canonicalUrlPolicy: string; publicationTimeSemantics: string;
  correctionRetractionSemantics: string; syndicationSemantics: string; originGroupPolicy: string; coverageAndHistory: string;
  freshnessAndLatency: string; payloadSchemaKnowledge: string; authenticationModel: string; localRequestBudget: Readonly<{ requests: number; bytes: number; timeoutMs: number; retries: number }>;
  evidence: readonly Evidence[]; blockers: readonly string[]; usageApprovals: readonly Readonly<{ usage: string; status: "NOT_APPROVED" }>[];
  storageApproval: "NOT_APPROVED"; retentionApproval: "NOT_APPROVED"; redistributionApproval: "NOT_APPROVED"; commercialUseApproval: "NOT_APPROVED";
  reviewedAt: string; recordedAt: string; fingerprint: string;
}>;
export type QualificationParse = Readonly<{ status: "VALID"; qualification: IssuerReleaseQualification }> | Readonly<{ status: "INVALID"; code: "ISSUER_RELEASE_QUALIFICATION_INVALID" }>;
const INVALID: QualificationParse = Object.freeze({ status: "INVALID", code: "ISSUER_RELEASE_QUALIFICATION_INVALID" });
const qualificationTrust = new WeakSet<object>();
const candidateTrust = new WeakSet<object>();
const originSetTrust = new WeakSet<object>();
const normalFormTrust = new WeakSet<object>();
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const fail = (): never => { throw new Error("ISSUER_RELEASE_INPUT_INVALID"); };
const controls = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const suspiciousId = /(?:https?:|www\.|[a-z0-9-]+\.[a-z0-9-]+|api[_-]?(?:key|token)|authorization|bearer|password|secret|credential)/i;
const ownIntrinsic = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);
function obj(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!v || typeof v !== "object" || types.isProxy(v) || Object.getPrototypeOf(v) !== Object.prototype) return fail();
  if (Reflect.ownKeys(Object.prototype).some(k => typeof k !== "string" || !ownIntrinsic.has(k))) return fail();
  const ks = Reflect.ownKeys(v); if (ks.length !== keys.length || ks.some(k => typeof k !== "string" || !keys.includes(k))) return fail();
  const out: Record<string, unknown> = Object.create(null);
  for (const k of keys) { const d = Object.getOwnPropertyDescriptor(v, k); if (!d || !("value" in d) || !d.enumerable) return fail(); out[k] = d.value; }
  return out;
}
function arr(v: unknown, max: number): unknown[] {
  if (!v || typeof v !== "object" || types.isProxy(v) || !Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype) return fail();
  const n = Object.getOwnPropertyDescriptor(v, "length")?.value;
  if (!Number.isSafeInteger(n) || n < 0 || n > max || Reflect.ownKeys(v).length !== n + 1) return fail();
  const result: unknown[] = []; for (let i = 0; i < n; i++) { const d = Object.getOwnPropertyDescriptor(v, String(i)); if (!d || !("value" in d) || !d.enumerable) return fail(); result.push(d.value); } return result;
}
function str(v: unknown, max: number): string { if (typeof v !== "string" || !v.length || v.length > max || v.trim() !== v || controls.test(v) || v.normalize("NFC") !== v) return fail(); return v; }
function ident(v: unknown): string { const x = str(v, ISSUER_RELEASE_LIMITS.identifier); if (!/^[a-z0-9][a-z0-9:_-]*$/.test(x) || suspiciousId.test(x)) return fail(); return x; }
function timestamp(v: unknown): string { if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v) return fail(); return v; }
function httpsUrl(v: unknown): string {
  const x = str(v, ISSUER_RELEASE_LIMITS.url);
  if (!/^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9/_-]*$/.test(x) || x.includes("//", 8)) return fail();
  const u = new URL(x); if (u.href !== x || u.username || u.password || u.port || u.search || u.hash || u.hostname.endsWith(".") || u.hostname.split(".").some(p => !p || p.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(p)) || u.pathname.split("/").some(p => p === "." || p === "..")) return fail();
  return x;
}
function freeze<T>(v: T): T { if (v && typeof v === "object") { for (const x of Object.values(v)) freeze(x); Object.freeze(v); } return v; }
function canonical(v: unknown): string { if (v === null || typeof v !== "object") return JSON.stringify(v); if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`; return `{${Object.keys(v as object).sort(cmp).map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`; }
function hash(v: unknown): string { return createHash("sha256").update(canonical(v), "utf8").digest("hex"); }
function uniqSorted<T>(xs: T[], key: (x: T) => string): T[] { if (new Set(xs.map(key)).size !== xs.length) return fail(); return xs.sort((a, b) => cmp(key(a), key(b))); }
const evidenceKeys = ["id", "url", "title", "classification", "claim"] as const;
const qualificationKeys = ["contractVersion", "candidateSourceId", "sourceClass", "status", "issuerAttributionModel", "publisher", "distributor", "retrievalProfiles", "releaseIdentitySemantics", "canonicalUrlPolicy", "publicationTimeSemantics", "correctionRetractionSemantics", "syndicationSemantics", "originGroupPolicy", "coverageAndHistory", "freshnessAndLatency", "payloadSchemaKnowledge", "authenticationModel", "localRequestBudget", "evidence", "blockers", "usageApprovals", "storageApproval", "retentionApproval", "redistributionApproval", "commercialUseApproval", "reviewedAt", "recordedAt", "fingerprint"] as const;
const usageNames = ["acquisition", "metadataProcessing", "metadataStorage", "articleContentStorage", "normalizedStorage", "authorityPersistence", "commercialUse"] as const;
function qualificationMaterial(input: Record<string, unknown>): Record<string, unknown> { const material: Record<string, unknown> = Object.create(null); for (const key of Object.keys(input)) if (key !== "recordedAt" && key !== "fingerprint") material[key] = input[key]; return material; }
export function parseIssuerReleaseQualification(input: unknown): QualificationParse {
  try {
    const v = obj(input, qualificationKeys);
    if (v.contractVersion !== ISSUER_RELEASE_QUALIFICATION_VERSION) return INVALID;
    const candidateSourceId = ident(v.candidateSourceId), sourceClass = v.sourceClass;
    if (!ISSUER_RELEASE_SOURCE_CLASSES.includes(sourceClass as IssuerReleaseSourceClass)) return INVALID;
    const statuses: readonly IssuerReleaseQualificationStatus[] = ["PARTIAL_DISCOVERY_ONLY", "PARTIAL_ISSUER_DISCLOSURE_CANDIDATE", "BLOCKED_UNDOCUMENTED_RETRIEVAL", "BLOCKED_UNSUPPORTED_AUTHENTICATION_TRANSPORT", "BLOCKED_RIGHTS_UNAPPROVED"];
    if (typeof v.status !== "string" || !statuses.includes(v.status as IssuerReleaseQualificationStatus)) return INVALID;
    const local = obj(v.localRequestBudget, ["requests", "bytes", "timeoutMs", "retries"]);
    if (![local.requests, local.bytes, local.timeoutMs, local.retries].every(Number.isSafeInteger) || (local.requests as number) < 0 || (local.requests as number) > 3 || (local.bytes as number) < 0 || (local.bytes as number) > 1_048_576 || (local.timeoutMs as number) < 0 || (local.timeoutMs as number) > 15_000 || local.retries !== 0) return INVALID;
    const evidence = uniqSorted(arr(v.evidence, 32).map(e => { const q = obj(e, evidenceKeys); return { id: ident(q.id), url: httpsUrl(q.url), title: str(q.title, 256), classification: q.classification, claim: str(q.claim, 1024) } as Evidence; }), e => e.id);
    if (evidence.some(e => !["DOCUMENTED", "OBSERVED", "INFERRED", "UNKNOWN"].includes(e.classification))) return INVALID;
    const profiles = uniqSorted(arr(v.retrievalProfiles, 8).map(x => ident(x)), x => x);
    const blockers = uniqSorted(arr(v.blockers, 16).map(x => str(x, 256)), x => x);
    for (const key of ["issuerAttributionModel", "publisher", "releaseIdentitySemantics", "canonicalUrlPolicy", "publicationTimeSemantics", "correctionRetractionSemantics", "syndicationSemantics", "originGroupPolicy", "coverageAndHistory", "freshnessAndLatency", "payloadSchemaKnowledge", "authenticationModel"] as const) str(v[key], key === "issuerAttributionModel" || key.endsWith("Semantics") || key === "canonicalUrlPolicy" || key === "originGroupPolicy" || key === "coverageAndHistory" || key === "freshnessAndLatency" || key === "payloadSchemaKnowledge" || key === "authenticationModel" ? 1024 : 256);
    const distributor = v.distributor === null ? null : str(v.distributor, 128);
    if (!blockers.length || profiles.length && ["BLOCKED_UNDOCUMENTED_RETRIEVAL", "BLOCKED_UNSUPPORTED_AUTHENTICATION_TRANSPORT", "BLOCKED_RIGHTS_UNAPPROVED"].includes(v.status as string) && !blockers.length) return INVALID;
    const usageApprovals = uniqSorted(arr(v.usageApprovals, usageNames.length).map(x => { const u = obj(x, ["usage", "status"]); if (!usageNames.includes(u.usage as typeof usageNames[number]) || u.status !== "NOT_APPROVED") return fail(); return { usage: u.usage as string, status: "NOT_APPROVED" as const }; }), x => x.usage);
    if (usageApprovals.length !== usageNames.length || [v.storageApproval, v.retentionApproval, v.redistributionApproval, v.commercialUseApproval].some(x => x !== "NOT_APPROVED")) return INVALID;
    const reviewedAt = timestamp(v.reviewedAt), recordedAt = timestamp(v.recordedAt); if (recordedAt < reviewedAt) return INVALID;
    const material: Record<string, unknown> = { ...v, candidateSourceId, sourceClass, status: v.status, distributor, retrievalProfiles: profiles, evidence, blockers, usageApprovals, reviewedAt };
    delete material.recordedAt; delete material.fingerprint;
    const fingerprint = hash({ version: ISSUER_RELEASE_QUALIFICATION_VERSION, material });
    if (v.fingerprint !== fingerprint) return INVALID;
    const result = freeze({ ...material, contractVersion: ISSUER_RELEASE_QUALIFICATION_VERSION, recordedAt, fingerprint }) as IssuerReleaseQualification;
    return { status: "VALID", qualification: result };
  } catch { return INVALID; }
}

const EVIDENCE = Object.freeze({
  bwTerms: Object.freeze({ id: "business-wire-terms-2024", url: "https://www.businesswire.com/legal/terms-of-use", title: "Business Wire Terms of Use", classification: "DOCUMENTED" as const, claim: "Site terms enumerate reading and RSS retrieval but restrict storage, aggregation, reproduction, redistribution and commercial activity absent prior written consent." }),
  bwHelp: Object.freeze({ id: "business-wire-help", url: "https://www.businesswire.com/help-center", title: "Business Wire Help Center", classification: "DOCUMENTED" as const, claim: "Public newsroom search and feeds are described; feed options are directed to media partners." }),
  bwPrice: Object.freeze({ id: "business-wire-pricing", url: "https://www.businesswire.com/pricing", title: "Business Wire Pricing & Distribution Plans", classification: "DOCUMENTED" as const, claim: "Issuer-side release distribution pricing is published; it is not reader/API/storage permission." }),
  gnFeed: Object.freeze({ id: "globenewswire-feeds", url: "https://www.globenewswire.com/en/newswire-press-release-content", title: "Add a GlobeNewswire Feed to Your Site", classification: "DOCUMENTED" as const, claim: "RSS/full-text and multimedia feed options are described for media; custom feeds require contacting provider." }),
  gnMedia: Object.freeze({ id: "globenewswire-media", url: "https://www.globenewswire.com/home/about/media-relations", title: "GlobeNewswire Media Relations", classification: "DOCUMENTED" as const, claim: "Media subscriptions and RSS/Atom/custom-format delivery are described; technical specifications are by contact." }),
  issuer: Object.freeze({ id: "strategy-ir-example", url: "https://www.strategy.com/investor-relations", title: "Strategy Investor Relations", classification: "OBSERVED" as const, claim: "One issuer example provides an IR/news release archive; this does not establish generic issuer feed or correction semantics." }),
  gnTerms: Object.freeze({ id: "globenewswire-current-terms", url: "https://www.globenewswire.com/en/terms-of-use", title: "GlobeNewswire Terms of Use", classification: "UNKNOWN" as const, claim: "Current official terms and scoped rights were not confirmed in this review." }),
});
function rawQualification(candidateSourceId: string, sourceClass: IssuerReleaseSourceClass, status: IssuerReleaseQualificationStatus, publisher: string, distributor: string | null, profiles: string[], blocker: string, ev: Evidence[], reviewedAt: string, recordedAt: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    contractVersion: ISSUER_RELEASE_QUALIFICATION_VERSION, candidateSourceId, sourceClass, status,
    issuerAttributionModel: "Issuer display/explicit release attribution is evidence of publication attribution only; not truth of underlying assertions.", publisher, distributor,
    retrievalProfiles: profiles, releaseIdentitySemantics: "Local identity binds source class, issuer candidate, canonical URL, displayed release ID when documented, headline, publication time and material summary fingerprint; not a provider ID.",
    canonicalUrlPolicy: "HTTPS canonical release URL; host/profile is scope-pinned; no credentials, fragments, query, port, traversal or arbitrary following.",
    publicationTimeSemantics: "Source-displayed publication time is distinct from discovery, receipt, retrieval and evaluation time; timezone/meaning is source-specific.",
    correctionRetractionSemantics: "Hints only; append-only candidate variants; no correction lineage without separately authenticated parent evidence.",
    syndicationSemantics: "Issuer/wire copies are one issuer-origin when explicit release identity links them; not independent corroboration.",
    originGroupPolicy: "Group only on exact explicit issuer identity candidate + release identifier + canonical origin locator; otherwise unresolved singleton. Group count never corroboration.",
    coverageAndHistory: "UNKNOWN beyond individually reviewed page/feed scope; no completeness assertion.", freshnessAndLatency: "UNKNOWN; no live retrieval or SLA evidence.",
    payloadSchemaKnowledge: "Native page/feed schema and correction protocol are not sufficiently documented for a generic parser; only internal SYNTHETIC normal form is accepted.",
    authenticationModel: "Public page visibility is not an API grant. Media feed access may be account/contact scoped; no credential transport is approved or implemented.",
    localRequestBudget: { requests: 1, bytes: 524288, timeoutMs: 5000, retries: 0 }, evidence: ev, blockers: [blocker],
    usageApprovals: [...usageNames].sort(cmp).map(usage => ({ usage, status: "NOT_APPROVED" })), storageApproval: "NOT_APPROVED", retentionApproval: "NOT_APPROVED", redistributionApproval: "NOT_APPROVED", commercialUseApproval: "NOT_APPROVED", reviewedAt, recordedAt,
  };
  body.evidence = [...ev].sort((a, b) => cmp(a.id, b.id));
  body.fingerprint = hash({ version: ISSUER_RELEASE_QUALIFICATION_VERSION, material: qualificationMaterial(body) }); return body;
}
const REVIEWED_AT = "2026-10-03T09:31:49.000Z";
const rawRegistry = [
  rawQualification("issuer-ir-release", "DIRECT_ISSUER_RELEASE", "PARTIAL_ISSUER_DISCLOSURE_CANDIDATE", "Issuer-controlled IR/newsroom (per issuer)" , null, ["issuer-newsroom-listing-synthetic-v1", "issuer-release-detail-synthetic-v1"], "No issuer-specific host/feed/revision/rights review; no acquisition approval.", [{ ...EVIDENCE.issuer, url: "https://www.strategy.com/investor-relations" }], REVIEWED_AT, REVIEWED_AT),
  rawQualification("issuer-rss-atom", "DIRECT_ISSUER_RELEASE", "BLOCKED_UNDOCUMENTED_RETRIEVAL", "Issuer-controlled RSS/Atom (per issuer)", null, [], "No issuer-specific feed existence, schema, history, correction or rights documented.", [EVIDENCE.issuer], REVIEWED_AT, REVIEWED_AT),
  rawQualification("businesswire-release", "ISSUER_AUTHORIZED_DISTRIBUTION", "PARTIAL_ISSUER_DISCLOSURE_CANDIDATE", "Business Wire", "Business Wire", ["businesswire-release-detail-synthetic-v1"], "Automated acquisition, metadata/content storage, retention and reuse remain blocked pending written rights approval.", [EVIDENCE.bwTerms, EVIDENCE.bwHelp, EVIDENCE.bwPrice], REVIEWED_AT, REVIEWED_AT),
  rawQualification("globenewswire-release", "ISSUER_AUTHORIZED_DISTRIBUTION", "PARTIAL_ISSUER_DISCLOSURE_CANDIDATE", "GlobeNewswire", "GlobeNewswire", ["globenewswire-release-detail-synthetic-v1"], "Current scoped terms, automated reader/API access, storage and reuse rights remain unknown or unapproved.", [EVIDENCE.gnFeed, EVIDENCE.gnMedia, EVIDENCE.gnTerms], REVIEWED_AT, REVIEWED_AT),
  rawQualification("syndicated-copy", "SYNDICATED_COPY", "PARTIAL_DISCOVERY_ONLY", "Syndicating publisher", null, [], "No independent authority or generic retrieval profile; origin must be explicitly linked.", [EVIDENCE.bwHelp, EVIDENCE.gnFeed], REVIEWED_AT, REVIEWED_AT),
  rawQualification("editorial-report", "EDITORIAL_REPORT", "PARTIAL_DISCOVERY_ONLY", "Editorial publisher", null, [], "Editorial reports are discovery only; original source retrieval and rights review required.", [EVIDENCE.bwHelp], REVIEWED_AT, REVIEWED_AT),
  rawQualification("discovery-only-reference", "DISCOVERY_ONLY", "PARTIAL_DISCOVERY_ONLY", "Discovery provider reference", null, [], "A NewsAPI/GDELT hit cannot upgrade issuer attribution or authority.", [EVIDENCE.bwHelp], REVIEWED_AT, REVIEWED_AT),
];
const qualificationRegistry = new Map<string, IssuerReleaseQualification>();
for (const raw of rawRegistry) { const parsed = parseIssuerReleaseQualification(raw); if (parsed.status !== "VALID") throw new Error(`ISSUER_RELEASE_REGISTRY_INVALID:${raw.candidateSourceId}`); qualificationRegistry.set(parsed.qualification.candidateSourceId, parsed.qualification); }
for (const q of qualificationRegistry.values()) qualificationTrust.add(q);
export function resolveIssuerReleaseQualification(candidateSourceId: string): IssuerReleaseQualification | null { return qualificationRegistry.get(candidateSourceId) ?? null; }
export function listIssuerReleaseQualifications(): readonly IssuerReleaseQualification[] { return Object.freeze([...qualificationRegistry.values()]); }
export function isAuthenticIssuerReleaseQualification(v: unknown): v is IssuerReleaseQualification { return !!v && typeof v === "object" && qualificationTrust.has(v); }
export const ISSUER_RELEASE_PRODUCTION_VERSION = "event-intelligence-issuer-release-production/v1" as const;
const productionKeys = ["contractVersion", "selectedSource", "credentialReference", "registry", "status", "operations", "usageApprovals", "rawContentStorage", "metadataStorage", "normalizedStorage", "retention", "redistribution", "commercialUse", "articleImageStorage"] as const;
const productionOperations = ["acquisition", "persistence", "mapping", "corroboration", "issuerDisclosureAuthority", "externalEventAuthority", "scheduler", "signal", "trading"] as const;
export function parseIssuerReleaseProductionConfig(input: unknown): Readonly<Record<string, unknown>> | null {
  try {
    const v = obj(input, productionKeys);
    if (v.contractVersion !== ISSUER_RELEASE_PRODUCTION_VERSION || v.selectedSource !== null || v.credentialReference !== null || arr(v.registry, 0).length || v.status !== "BLOCKED_BACKEND_UNAPPROVED") return null;
    const operations = obj(v.operations, productionOperations); if (Object.values(operations).some(x => x !== "BLOCKED")) return null;
    const approvals = uniqSorted(arr(v.usageApprovals, usageNames.length).map(x => { const a = obj(x, ["usage", "status"]); if (typeof a.usage !== "string" || !usageNames.includes(a.usage as typeof usageNames[number]) || a.status !== "NOT_APPROVED") return fail(); return { usage: a.usage, status: a.status }; }), x => x.usage);
    if (approvals.length !== usageNames.length || [v.rawContentStorage, v.metadataStorage, v.normalizedStorage, v.retention, v.redistribution, v.commercialUse, v.articleImageStorage].some(x => x !== "NOT_APPROVED")) return null;
    return freeze({ contractVersion: ISSUER_RELEASE_PRODUCTION_VERSION, selectedSource: null, credentialReference: null, registry: [], status: "BLOCKED_BACKEND_UNAPPROVED", operations, usageApprovals: approvals, rawContentStorage: "NOT_APPROVED", metadataStorage: "NOT_APPROVED", normalizedStorage: "NOT_APPROVED", retention: "NOT_APPROVED", redistribution: "NOT_APPROVED", commercialUse: "NOT_APPROVED", articleImageStorage: "NOT_APPROVED" });
  } catch { return null; }
}

export type SyntheticIssuerReleaseInput = Readonly<{
  normalForm: typeof ISSUER_RELEASE_NORMAL_FORM_VERSION; provenance: "SYNTHETIC"; sourceId: string; sourceClass: IssuerReleaseSourceClass;
  publisherId: string; distributorId: string | null; issuerCandidateId: string; issuerDisplayedName: string; canonicalReleaseUrl: string;
  releaseIdentifier: string | null; headline: string; summary: string | null; publicationAt: string; discoveredAt: string; receivedAt: string; evaluatedAsOf: string;
  categoryCandidate: IssuerReleaseCategory; assetMentions: readonly string[]; amountText: string | null; currencyText: string | null;
  lifecycleHint: "NONE" | "CORRECTION_HINT" | "UPDATE_HINT" | "RETRACTION_HINT" | "UNKNOWN";
  explicitOriginBinding: Readonly<{ issuerCandidateId: string; releaseIdentifier: string; canonicalOriginUrl: string }> | null;
  payloadFingerprint: string;
}>;
export type IssuerReleaseCandidate = Readonly<{
  status: "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE"; authorityStatus: "DISCOVERY_ONLY"; provenance: "SYNTHETIC";
  candidateId: string; sourceMaterialFingerprint: string; receiptFingerprint: string; sourceId: string; sourceClass: IssuerReleaseSourceClass;
  issuerCandidateId: string; issuerDisplayedName: string; publisherId: string; distributorId: string | null; canonicalReleaseUrl: string;
  releaseIdentifier: string | null; headline: string; summary: string | null; publicationAt: string; discoveredAt: string; receivedAt: string; evaluatedAsOf: string;
  categoryCandidate: IssuerReleaseCategory; assetMentions: readonly string[]; amountText: string | null; currencyText: string | null; lifecycleHint: SyntheticIssuerReleaseInput["lifecycleHint"];
  explicitOriginBinding: SyntheticIssuerReleaseInput["explicitOriginBinding"];
  issuerMappingEligible: false; assetMappingEligible: false; corroborationEligible: false; issuerDisclosureAuthorityEligible: false; eventAuthorityEligible: false; persistenceAuthorityEligible: false; signalEligible: false; tradingEligible: false;
}>;
export function parseSyntheticIssuerRelease(input: unknown): SyntheticIssuerReleaseInput | null {
  try {
    const v = obj(input, ["normalForm", "provenance", "sourceId", "sourceClass", "publisherId", "distributorId", "issuerCandidateId", "issuerDisplayedName", "canonicalReleaseUrl", "releaseIdentifier", "headline", "summary", "publicationAt", "discoveredAt", "receivedAt", "evaluatedAsOf", "categoryCandidate", "assetMentions", "amountText", "currencyText", "lifecycleHint", "explicitOriginBinding", "payloadFingerprint"]);
    if (v.normalForm !== ISSUER_RELEASE_NORMAL_FORM_VERSION || v.provenance !== "SYNTHETIC" || !ISSUER_RELEASE_SOURCE_CLASSES.includes(v.sourceClass as IssuerReleaseSourceClass)) return null;
    const sourceId = ident(v.sourceId), publisherId = ident(v.publisherId), distributorId = v.distributorId === null ? null : ident(v.distributorId), issuerCandidateId = ident(v.issuerCandidateId);
    if (v.sourceClass === "DIRECT_ISSUER_RELEASE" && distributorId !== null) return null;
    if ((v.sourceClass === "ISSUER_AUTHORIZED_DISTRIBUTION" || v.sourceClass === "SYNDICATED_COPY") && (!distributorId || distributorId !== publisherId)) return null;
    const canonicalReleaseUrl = httpsUrl(v.canonicalReleaseUrl), releaseIdentifier = v.releaseIdentifier === null ? null : ident(v.releaseIdentifier);
    const headline = str(v.headline, ISSUER_RELEASE_LIMITS.headline), summary = v.summary === null ? null : str(v.summary, ISSUER_RELEASE_LIMITS.summary);
    const publicationAt = timestamp(v.publicationAt), discoveredAt = timestamp(v.discoveredAt), receivedAt = timestamp(v.receivedAt), evaluatedAsOf = timestamp(v.evaluatedAsOf);
    if (publicationAt > discoveredAt || discoveredAt > receivedAt || receivedAt > evaluatedAsOf) return null;
    if (!ISSUER_RELEASE_CATEGORIES.includes(v.categoryCandidate as IssuerReleaseCategory)) return null;
    const assetMentions = uniqSorted(arr(v.assetMentions, 32).map(x => str(x, ISSUER_RELEASE_LIMITS.mention)), x => x);
    const amountText = v.amountText === null ? null : str(v.amountText, 64), currencyText = v.currencyText === null ? null : str(v.currencyText, 24);
    const lifecycleHint = v.lifecycleHint;
    if (!["NONE", "CORRECTION_HINT", "UPDATE_HINT", "RETRACTION_HINT", "UNKNOWN"].includes(lifecycleHint as string)) return null;
    let explicitOriginBinding: SyntheticIssuerReleaseInput["explicitOriginBinding"] = null;
    if (v.explicitOriginBinding !== null) { const b = obj(v.explicitOriginBinding, ["issuerCandidateId", "releaseIdentifier", "canonicalOriginUrl"]); explicitOriginBinding = { issuerCandidateId: ident(b.issuerCandidateId), releaseIdentifier: ident(b.releaseIdentifier), canonicalOriginUrl: httpsUrl(b.canonicalOriginUrl) }; }
    if (sourceClassNeedsAttribution(v.sourceClass as IssuerReleaseSourceClass) && !issuerCandidateId) return null;
    if (sourceClassNeedsAttribution(v.sourceClass as IssuerReleaseSourceClass) && (!explicitOriginBinding || explicitOriginBinding.issuerCandidateId !== issuerCandidateId || (releaseIdentifier !== null && explicitOriginBinding.releaseIdentifier !== releaseIdentifier))) return null;
    if (typeof v.payloadFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(v.payloadFingerprint)) return null;
    return freeze({ normalForm: ISSUER_RELEASE_NORMAL_FORM_VERSION, provenance: "SYNTHETIC", sourceId, sourceClass: v.sourceClass as IssuerReleaseSourceClass, publisherId, distributorId, issuerCandidateId, issuerDisplayedName: str(v.issuerDisplayedName, ISSUER_RELEASE_LIMITS.mention), canonicalReleaseUrl, releaseIdentifier, headline, summary, publicationAt, discoveredAt, receivedAt, evaluatedAsOf, categoryCandidate: v.categoryCandidate as IssuerReleaseCategory, assetMentions, amountText, currencyText, lifecycleHint: lifecycleHint as SyntheticIssuerReleaseInput["lifecycleHint"], explicitOriginBinding, payloadFingerprint: v.payloadFingerprint });
  } catch { return null; }
}
function sourceClassNeedsAttribution(c: IssuerReleaseSourceClass): boolean { return c === "DIRECT_ISSUER_RELEASE" || c === "ISSUER_AUTHORIZED_DISTRIBUTION"; }
function materialOf(v: SyntheticIssuerReleaseInput): unknown { return { version: ISSUER_RELEASE_NORMAL_FORM_VERSION, sourceId: v.sourceId, sourceClass: v.sourceClass, publisherId: v.publisherId, distributorId: v.distributorId, issuerCandidateId: v.issuerCandidateId, issuerDisplayedName: v.issuerDisplayedName, canonicalReleaseUrl: v.canonicalReleaseUrl, releaseIdentifier: v.releaseIdentifier, headline: v.headline, summary: v.summary, publicationAt: v.publicationAt, categoryCandidate: v.categoryCandidate, assetMentions: v.assetMentions, amountText: v.amountText, currencyText: v.currencyText, lifecycleHint: v.lifecycleHint, explicitOriginBinding: v.explicitOriginBinding }; }
function candidateIdentityMaterial(v: IssuerReleaseCandidate): unknown { return { version: ISSUER_RELEASE_NORMAL_FORM_VERSION, sourceId: v.sourceId, sourceClass: v.sourceClass, publisherId: v.publisherId, distributorId: v.distributorId, issuerCandidateId: v.issuerCandidateId, issuerDisplayedName: v.issuerDisplayedName, canonicalReleaseUrl: v.canonicalReleaseUrl, releaseIdentifier: v.releaseIdentifier, headline: v.headline, summary: v.summary, publicationAt: v.publicationAt, categoryCandidate: v.categoryCandidate, assetMentions: v.assetMentions, amountText: v.amountText, currencyText: v.currencyText, lifecycleHint: v.lifecycleHint, explicitOriginBinding: v.explicitOriginBinding }; }
function fingerprintMaterialsConsistent(items: readonly Readonly<{ fingerprint: string; material: unknown }>[]): boolean {
  const seen = new Map<string, string>();
  for (const item of items) { const normalized = canonical(item.material), previous = seen.get(item.fingerprint); if (previous !== undefined && previous !== normalized) return false; seen.set(item.fingerprint, normalized); }
  return true;
}
function candidateFingerprintMaterialsConsistent(items: readonly IssuerReleaseCandidate[]): boolean { return fingerprintMaterialsConsistent(items.map(x => ({ fingerprint: x.sourceMaterialFingerprint, material: candidateIdentityMaterial(x) }))); }
function constructCandidate(v: SyntheticIssuerReleaseInput): IssuerReleaseCandidate {
  const material = materialOf(v), sourceMaterialFingerprint = hash(material);
  const candidate = freeze({ status: "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE" as const, authorityStatus: "DISCOVERY_ONLY" as const, provenance: "SYNTHETIC" as const, candidateId: `issuer-release-candidate:${sourceMaterialFingerprint}`, sourceMaterialFingerprint, receiptFingerprint: hash({ version: ISSUER_RELEASE_NORMAL_FORM_VERSION, sourceMaterialFingerprint, discoveredAt: v.discoveredAt, receivedAt: v.receivedAt, evaluatedAsOf: v.evaluatedAsOf, payloadFingerprint: v.payloadFingerprint }), sourceId: v.sourceId, sourceClass: v.sourceClass, issuerCandidateId: v.issuerCandidateId, issuerDisplayedName: v.issuerDisplayedName, publisherId: v.publisherId, distributorId: v.distributorId, canonicalReleaseUrl: v.canonicalReleaseUrl, releaseIdentifier: v.releaseIdentifier, headline: v.headline, summary: v.summary, publicationAt: v.publicationAt, discoveredAt: v.discoveredAt, receivedAt: v.receivedAt, evaluatedAsOf: v.evaluatedAsOf, categoryCandidate: v.categoryCandidate, assetMentions: [...v.assetMentions], amountText: v.amountText, currencyText: v.currencyText, lifecycleHint: v.lifecycleHint, explicitOriginBinding: v.explicitOriginBinding, issuerMappingEligible: false as const, assetMappingEligible: false as const, corroborationEligible: false as const, issuerDisclosureAuthorityEligible: false as const, eventAuthorityEligible: false as const, persistenceAuthorityEligible: false as const, signalEligible: false as const, tradingEligible: false as const });
  candidateTrust.add(candidate); return candidate;
}
export function compareIssuerReleaseCandidates(a: unknown, b: unknown): "UNTRUSTED" | "SAME_LOCAL_SOURCE_MATERIAL" | "SAME_URL_MATERIAL_VARIANT" | "EXPLICIT_SAME_ISSUER_ORIGIN" | "DISTINCT_UNVERIFIED_MATERIAL" {
  if (!isAuthenticIssuerReleaseCandidate(a) || !isAuthenticIssuerReleaseCandidate(b)) return "UNTRUSTED";
  if (a.sourceMaterialFingerprint === b.sourceMaterialFingerprint) return "SAME_LOCAL_SOURCE_MATERIAL";
  if (a.canonicalReleaseUrl === b.canonicalReleaseUrl) return "SAME_URL_MATERIAL_VARIANT";
  const x = a.explicitOriginBinding, y = b.explicitOriginBinding;
  if (x && y && canonical(x) === canonical(y)) return "EXPLICIT_SAME_ISSUER_ORIGIN";
  return "DISTINCT_UNVERIFIED_MATERIAL";
}
export function isAuthenticIssuerReleaseCandidate(v: unknown): v is IssuerReleaseCandidate { return !!v && typeof v === "object" && candidateTrust.has(v); }
export function projectIssuerReleaseCandidate(qualification: unknown, normalForm: unknown): IssuerReleaseCandidate | null {
  if (!isAuthenticIssuerReleaseQualification(qualification) || !normalForm || typeof normalForm !== "object" || !normalFormTrust.has(normalForm)) return null;
  if (qualification.status !== "PARTIAL_DISCOVERY_ONLY" && qualification.status !== "PARTIAL_ISSUER_DISCLOSURE_CANDIDATE") return null;
  const parsed = parseSyntheticIssuerRelease(normalForm);
  if (!parsed || parsed.sourceId !== qualification.candidateSourceId || parsed.sourceClass !== qualification.sourceClass) return null;
  return constructCandidate(parsed);
}
export function rejectIssuerReleaseAsAuthority(_v: unknown, boundary: "ISSUER_MAPPING" | "ASSET_MAPPING" | "CORROBORATION" | "ISSUER_DISCLOSURE_AUTHORITY" | "EVENT_AUTHORITY" | "PERSISTENCE" | "SIGNAL" | "TRADING"): null { void boundary; return null; }
export type IssuerReleaseOriginSet = Readonly<{ contractVersion: typeof ISSUER_RELEASE_ORIGIN_SET_VERSION; status: "DISCOVERY_ONLY"; members: readonly Readonly<{ ordinal: number; candidate: IssuerReleaseCandidate }>[]; groups: readonly Readonly<{ originGroupId: string; basis: "EXPLICIT_RELEASE_BINDING" | "UNRESOLVED_SINGLETON"; candidateIds: readonly string[]; independentCorroborationCount: 0 }>[]; declaredMemberCount: number; fingerprint: string; evaluatedAsOf: string; recordedAt: string }>;
export function sealIssuerReleaseOriginSet(input: unknown): IssuerReleaseOriginSet | null {
  try {
    const v = obj(input, ["contractVersion", "members", "declaredMemberCount", "evaluatedAsOf", "recordedAt"]), raw = arr(v.members, ISSUER_RELEASE_LIMITS.candidates);
    if (v.contractVersion !== ISSUER_RELEASE_ORIGIN_SET_VERSION || !raw.length || raw.length !== v.declaredMemberCount || !raw.every(isAuthenticIssuerReleaseCandidate)) return null;
    const evaluatedAsOf = timestamp(v.evaluatedAsOf), recordedAt = timestamp(v.recordedAt); if (recordedAt < evaluatedAsOf) return null;
    const authentic = raw as IssuerReleaseCandidate[];
    if (!candidateFingerprintMaterialsConsistent(authentic)) return null;
    const candidates = uniqSorted(authentic, x => x.candidateId), groups = new Map<string, IssuerReleaseCandidate[]>();
    for (const c of candidates) { if (c.receivedAt > evaluatedAsOf || c.publicationAt > evaluatedAsOf) return null; const b = c.explicitOriginBinding; const key = b ? hash({ issuerCandidateId: b.issuerCandidateId, releaseIdentifier: b.releaseIdentifier, canonicalOriginUrl: b.canonicalOriginUrl }) : `unresolved:${c.candidateId}`; const xs = groups.get(key) ?? []; xs.push(c); groups.set(key, xs); }
    const members = candidates.map((candidate, ordinal) => ({ ordinal, candidate }));
    const sealed = [...groups].sort(([a], [b]) => cmp(a, b)).map(([originGroupId, xs]) => ({ originGroupId, basis: xs[0]!.explicitOriginBinding ? "EXPLICIT_RELEASE_BINDING" as const : "UNRESOLVED_SINGLETON" as const, candidateIds: xs.map(x => x.candidateId), independentCorroborationCount: 0 as const }));
    const fingerprint = hash({ version: ISSUER_RELEASE_ORIGIN_SET_VERSION, members: members.map(x => [x.ordinal, x.candidate.sourceMaterialFingerprint, x.candidate.lifecycleHint]), groups: sealed });
    const result = freeze({ contractVersion: ISSUER_RELEASE_ORIGIN_SET_VERSION, status: "DISCOVERY_ONLY" as const, members, groups: sealed, declaredMemberCount: members.length, fingerprint, evaluatedAsOf, recordedAt }); originSetTrust.add(result); return result;
  } catch { return null; }
}
export function isAuthenticIssuerReleaseOriginSet(v: unknown): v is IssuerReleaseOriginSet { return !!v && typeof v === "object" && originSetTrust.has(v); }

// Deliberately private; Vitest alone exposes the synthetic normal-form issuer for tests.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function constructSyntheticNormalForm(input: unknown): SyntheticIssuerReleaseInput | null { const parsed = parseSyntheticIssuerRelease(input); if (parsed) normalFormTrust.add(parsed); return parsed; }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function checkFingerprintCollisionForTest(items: readonly Readonly<{ fingerprint: string; material: unknown }>[]): boolean { return fingerprintMaterialsConsistent(items); }
