import "server-only";
import { createHash } from "node:crypto";
import { types } from "node:util";
import { EVENT_INTELLIGENCE_USAGES } from "./event-intelligence-source-decision";

export const NEWS_DISCOVERY_VERSION = "event-intelligence-news-discovery/v1" as const;
export const DISCOVERY_ORIGIN_SET_VERSION = "event-intelligence-discovery-origin-set/v1" as const;
export const NEWS_DISCOVERY_CATEGORIES = Object.freeze([
  "CORPORATE_CRYPTO_PURCHASE_INTENT", "BOARD_AUTHORIZATION", "BINDING_PURCHASE_AGREEMENT",
  "COMPLETED_CRYPTO_PURCHASE", "TREASURY_POLICY_CHANGE", "ASSET_OR_COMPANY_ACQUISITION",
  "STRATEGIC_PARTNERSHIP", "CANCELLATION_OR_TERMINATION", "CORRECTION_OR_RETRACTION",
  "UNSPECIFIED_RELEVANT_MENTION",
] as const);
export type DiscoveryCategory = typeof NEWS_DISCOVERY_CATEGORIES[number];
export const NEWS_DISCOVERY_LIMITS = Object.freeze({ headline: 512, summary: 2048, locator: 256, mentions: 32, originMembers: 64 });
type Publisher = Readonly<{ publisherId: string; displayName: string }>;
type EntityCandidate = Readonly<{ candidateId: string; legalName: string; jurisdiction: string; relationshipHint: "UNRESOLVED" | "PARENT_CANDIDATE" | "SUBSIDIARY_CANDIDATE" }>;
type AssetCandidate = Readonly<{ candidateId: string; label: string; ticker: string | null; representation: "UNKNOWN" | "NATIVE" | "WRAPPED" | "BRIDGED" | "TOKEN" }>;
type SourceType = "NEWS_AGGREGATOR" | "ISSUER_IR" | "NEWSWIRE" | "EXCHANGE_OR_REGULATOR_FEED";
type Origin = Readonly<{
  distribution: "ORIGINAL_PUBLICATION" | "AGGREGATOR_REFERENCE" | "WIRE_COPY" | "SYNDICATED_COPY" | "UNRESOLVED";
  originalPublisher: Publisher | null; originalPublicationId: string | null; originalSourceUrl: string | null;
  distributor: Publisher | null; attributionBasis: "EXPLICIT_SYNTHETIC_DECLARATION" | "UNKNOWN";
}>;
export type NewsDiscoveryRecord = Readonly<{
  contractVersion: typeof NEWS_DISCOVERY_VERSION; authorityStatus: "DISCOVERY_ONLY"; provenance: "SYNTHETIC";
  providerId: string; sourceType: SourceType; providerRecordId: string; canonicalSourceUrl: string;
  publisher: Publisher; attributedIssuer: EntityCandidate | null; origin: Origin;
  headline: string; summary: string | null; publishedAt: string; discoveredAt: string; receivedAt: string;
  sourceUpdatedAt: string | null; recordedAt: string; language: string; jurisdiction: string;
  mentionedEntities: readonly EntityCandidate[]; mentionedAssets: readonly AssetCandidate[];
  eventCategories: readonly DiscoveryCategory[]; sourceLocator: string;
  lifecycleHint: Readonly<{ kind: "NONE" | "CORRECTION" | "RETRACTION"; targetCandidateId: string | null }>;
  discoveryConfidence: "RELEVANT_MENTION" | "EXPLICIT_ATTRIBUTION" | "AMBIGUOUS";
}>;
export type NewsDiscoveryCandidate = Readonly<{
  status: "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE"; authorityStatus: "DISCOVERY_ONLY";
  record: NewsDiscoveryRecord; candidateId: string; fingerprint: string; sourceFingerprint: string;
  providerReplayKey: string; receiptId: string; receiptFingerprint: string; evaluatedAt: string;
  eventAuthorityEligible: false; mappingAuthorityEligible: false; persistenceAuthorityEligible: false;
  signalEligible: false; tradingEligible: false;
}>;
export type NewsDiscoveryParse = Readonly<{ status: "VALID"; candidate: NewsDiscoveryCandidate }> | Readonly<{ status: "INVALID"; code: "NEWS_DISCOVERY_INVALID" }>;
const INVALID: NewsDiscoveryParse = Object.freeze({ status: "INVALID", code: "NEWS_DISCOVERY_INVALID" });
const candidateTrust = new WeakSet<object>();
const originSetTrust = new WeakSet<object>();
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const fail = (): never => { throw new Error("NEWS_DISCOVERY_INVALID"); };
const rejectControls = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const secret = /(?:https?:|www\.|[a-z0-9-]+\.[a-z0-9-]+|api[_-]?(?:key|token)|access[_-]?token|authorization|bearer|password|secret|credential)/i;
const intrinsicObjectKeys = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);

// Inspect descriptors only after native Proxy detection. Never freeze or invoke caller objects.
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail();
  if (Reflect.ownKeys(Object.prototype).some(key => typeof key !== "string" || !intrinsicObjectKeys.has(key))) return fail();
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key))) return fail();
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return fail();
    result[key] = descriptor.value;
  }
  return result;
}
function array(value: unknown, max: number): unknown[] {
  if (!value || typeof value !== "object" || types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return fail();
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > max || Reflect.ownKeys(value).length !== length + 1) return fail();
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return fail();
    result.push(descriptor.value);
  }
  return result;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.length || value.length > max || value.trim() !== value || rejectControls.test(value) || value.normalize("NFC") !== value) return fail();
  return value;
}
function id(value: unknown, max = 96): string {
  const result = text(value, max);
  if (!/^[a-z0-9][a-z0-9:_-]*$/.test(result) || secret.test(result)) return fail();
  return result;
}
function choice<const T extends readonly string[]>(value: unknown, choices: T): T[number] {
  if (typeof value !== "string" || !choices.includes(value)) return fail();
  return value;
}
function time(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || value < "1970-01-01T00:00:00.000Z" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return fail();
  return value;
}
function url(value: unknown): string {
  const result = text(value, 2048);
  // v1 fixture locators have no query, percent encoding, port, fragment or credentials.
  if (!/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+\/[a-zA-Z0-9/_-]*$/.test(result) || result.includes("//", 8)) return fail();
  const parsed = new URL(result);
  if (parsed.href !== result || parsed.hostname.length > 253 || !parsed.hostname.endsWith(".test") || !parsed.hostname.split(".").every(label => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) || !parsed.pathname.split("/").every(segment => !segment || /^[A-Za-z0-9_-]+$/.test(segment))) return fail();
  return result;
}
function jurisdiction(value: unknown): string {
  if (typeof value !== "string" || !/^(?:[A-Z]{2}|UNKNOWN)$/.test(value)) return fail();
  return value;
}
function publisher(value: unknown): Publisher {
  const item = object(value, ["publisherId", "displayName"]);
  return { publisherId: id(item.publisherId), displayName: text(item.displayName, 128) };
}
function entity(value: unknown): EntityCandidate {
  const item = object(value, ["candidateId", "legalName", "jurisdiction", "relationshipHint"]);
  return { candidateId: id(item.candidateId), legalName: text(item.legalName, 192), jurisdiction: jurisdiction(item.jurisdiction), relationshipHint: choice(item.relationshipHint, ["UNRESOLVED", "PARENT_CANDIDATE", "SUBSIDIARY_CANDIDATE"] as const) };
}
function asset(value: unknown): AssetCandidate {
  const item = object(value, ["candidateId", "label", "ticker", "representation"]);
  const ticker = item.ticker === null ? null : text(item.ticker, 16);
  if (ticker !== null && !/^[A-Z0-9][A-Z0-9-]*$/.test(ticker)) return fail();
  return { candidateId: id(item.candidateId), label: text(item.label, 128), ticker, representation: choice(item.representation, ["UNKNOWN", "NATIVE", "WRAPPED", "BRIDGED", "TOKEN"] as const) };
}
function uniqueSorted<T>(items: T[], key: (item: T) => string): T[] {
  if (new Set(items.map(key)).size !== items.length) return fail();
  return items.sort((a, b) => compare(key(a), key(b)));
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
// Only fresh validated material reaches this serializer. UTF-16 lexical order is explicit; no locale.
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort(compare).map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
}
function hash(value: unknown): string { return createHash("sha256").update(canonical(value), "utf8").digest("hex"); }

const recordKeys = ["contractVersion", "authorityStatus", "provenance", "providerId", "sourceType", "providerRecordId", "canonicalSourceUrl", "publisher", "attributedIssuer", "origin", "headline", "summary", "publishedAt", "discoveredAt", "receivedAt", "sourceUpdatedAt", "recordedAt", "language", "jurisdiction", "mentionedEntities", "mentionedAssets", "eventCategories", "sourceLocator", "lifecycleHint", "discoveryConfidence"] as const;
const providerTypes: ReadonlyMap<string, SourceType> = new Map([["newsapi-discovery", "NEWS_AGGREGATOR"], ["gdelt-discovery", "NEWS_AGGREGATOR"], ["issuer-ir", "ISSUER_IR"], ["businesswire-distribution", "NEWSWIRE"], ["globenewswire-distribution", "NEWSWIRE"], ["exchange-regulator", "EXCHANGE_OR_REGULATOR_FEED"]]);

export function parseNewsDiscovery(input: unknown, evaluationAt: unknown): NewsDiscoveryParse {
  try {
    const v = object(input, recordKeys);
    if (v.contractVersion !== NEWS_DISCOVERY_VERSION || v.authorityStatus !== "DISCOVERY_ONLY" || v.provenance !== "SYNTHETIC") return INVALID;
    const providerId = id(v.providerId);
    const sourceType = choice(v.sourceType, ["NEWS_AGGREGATOR", "ISSUER_IR", "NEWSWIRE", "EXCHANGE_OR_REGULATOR_FEED"] as const);
    if (providerTypes.get(providerId) !== sourceType) return INVALID;
    const p = publisher(v.publisher);
    const issuer = v.attributedIssuer === null ? null : entity(v.attributedIssuer);
    if (sourceType === "NEWSWIRE" && issuer === null) return INVALID;
    const o = object(v.origin, ["distribution", "originalPublisher", "originalPublicationId", "originalSourceUrl", "distributor", "attributionBasis"]);
    const origin: Origin = {
      distribution: choice(o.distribution, ["ORIGINAL_PUBLICATION", "AGGREGATOR_REFERENCE", "WIRE_COPY", "SYNDICATED_COPY", "UNRESOLVED"] as const),
      originalPublisher: o.originalPublisher === null ? null : publisher(o.originalPublisher), originalPublicationId: o.originalPublicationId === null ? null : id(o.originalPublicationId),
      originalSourceUrl: o.originalSourceUrl === null ? null : url(o.originalSourceUrl), distributor: o.distributor === null ? null : publisher(o.distributor), attributionBasis: choice(o.attributionBasis, ["EXPLICIT_SYNTHETIC_DECLARATION", "UNKNOWN"] as const),
    };
    const hint = object(v.lifecycleHint, ["kind", "targetCandidateId"]);
    const kind = choice(hint.kind, ["NONE", "CORRECTION", "RETRACTION"] as const);
    const targetCandidateId = hint.targetCandidateId === null ? null : text(hint.targetCandidateId, 96);
    if ((kind === "NONE") !== (targetCandidateId === null) || (targetCandidateId !== null && !/^news-discovery-candidate:[a-f0-9]{64}$/.test(targetCandidateId))) return INVALID;
    const canonicalSourceUrl = url(v.canonicalSourceUrl);
    if (origin.distribution === "UNRESOLVED") {
      if (origin.attributionBasis !== "UNKNOWN" || origin.originalPublisher !== null || origin.originalPublicationId !== null || origin.originalSourceUrl !== null) return INVALID;
    } else {
      if (origin.attributionBasis !== "EXPLICIT_SYNTHETIC_DECLARATION" || !origin.originalPublisher || !origin.originalPublicationId || !origin.originalSourceUrl) return INVALID;
      if (origin.distribution === "ORIGINAL_PUBLICATION" && (canonical(origin.originalPublisher) !== canonical(p) || origin.distributor !== null || (kind === "NONE" && origin.originalSourceUrl !== canonicalSourceUrl))) return INVALID;
      if (origin.distribution !== "ORIGINAL_PUBLICATION" && origin.distributor === null) return INVALID;
      if (origin.distribution === "AGGREGATOR_REFERENCE" && sourceType !== "NEWS_AGGREGATOR") return INVALID;
      if ((origin.distribution === "WIRE_COPY" || origin.distribution === "SYNDICATED_COPY") && (canonical(origin.distributor) !== canonical(p) || origin.originalPublisher.publisherId === p.publisherId)) return INVALID;
    }
    const publisherNames = new Map<string, string>();
    for (const item of [p, origin.originalPublisher, origin.distributor]) {
      if (!item) continue;
      if (publisherNames.has(item.publisherId) && publisherNames.get(item.publisherId) !== item.displayName) return INVALID;
      publisherNames.set(item.publisherId, item.displayName);
    }
    const publishedAt = time(v.publishedAt), discoveredAt = time(v.discoveredAt), receivedAt = time(v.receivedAt), recordedAt = time(v.recordedAt), evaluatedAt = time(evaluationAt);
    const sourceUpdatedAt = v.sourceUpdatedAt === null ? null : time(v.sourceUpdatedAt);
    if (publishedAt > discoveredAt || discoveredAt > receivedAt || receivedAt > recordedAt || recordedAt > evaluatedAt || (sourceUpdatedAt !== null && (sourceUpdatedAt < publishedAt || sourceUpdatedAt > receivedAt))) return INVALID;
    const language = text(v.language, 16);
    if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(language)) return INVALID;
    const sourceLocator = text(v.sourceLocator, NEWS_DISCOVERY_LIMITS.locator);
    if (!/^article:[a-z0-9][a-z0-9:_-]*$/.test(sourceLocator) || secret.test(sourceLocator)) return INVALID;
    const eventCategories = uniqueSorted(array(v.eventCategories, NEWS_DISCOVERY_CATEGORIES.length).map(item => choice(item, NEWS_DISCOVERY_CATEGORIES)), item => item);
    if (!eventCategories.length || (kind !== "NONE" && !eventCategories.includes("CORRECTION_OR_RETRACTION"))) return INVALID;
    const mentionedEntities = uniqueSorted(array(v.mentionedEntities, NEWS_DISCOVERY_LIMITS.mentions).map(entity), item => item.candidateId);
    if (issuer && mentionedEntities.some(item => item.candidateId === issuer.candidateId && canonical(item) !== canonical(issuer))) return INVALID;
    const record: NewsDiscoveryRecord = {
      contractVersion: NEWS_DISCOVERY_VERSION, authorityStatus: "DISCOVERY_ONLY", provenance: "SYNTHETIC", providerId, sourceType,
      providerRecordId: id(v.providerRecordId), canonicalSourceUrl, publisher: p, attributedIssuer: issuer, origin,
      headline: text(v.headline, NEWS_DISCOVERY_LIMITS.headline), summary: v.summary === null ? null : text(v.summary, NEWS_DISCOVERY_LIMITS.summary),
      publishedAt, discoveredAt, receivedAt, sourceUpdatedAt, recordedAt, language, jurisdiction: jurisdiction(v.jurisdiction),
      mentionedEntities,
      mentionedAssets: uniqueSorted(array(v.mentionedAssets, NEWS_DISCOVERY_LIMITS.mentions).map(asset), item => item.candidateId), eventCategories, sourceLocator,
      lifecycleHint: { kind, targetCandidateId }, discoveryConfidence: choice(v.discoveryConfidence, ["RELEVANT_MENTION", "EXPLICIT_ATTRIBUTION", "AMBIGUOUS"] as const),
    };
    const sourceFingerprint = hash({ version: NEWS_DISCOVERY_VERSION, url: canonicalSourceUrl, publisher: p, origin, headline: record.headline, summary: record.summary, publishedAt, sourceUpdatedAt, language, jurisdiction: record.jurisdiction, sourceLocator });
    const material = Object.fromEntries(Object.entries(record).filter(([key]) => !["discoveredAt", "receivedAt", "recordedAt"].includes(key)));
    const fingerprint = hash(material);
    const receiptFingerprint = hash({ version: NEWS_DISCOVERY_VERSION, fingerprint, discoveredAt, receivedAt });
    return freeze({ status: "VALID", candidate: { status: "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE", authorityStatus: "DISCOVERY_ONLY", record, candidateId: `news-discovery-candidate:${fingerprint}`, fingerprint, sourceFingerprint, providerReplayKey: hash({ providerId, providerRecordId: record.providerRecordId }), receiptId: `news-discovery-receipt:${receiptFingerprint}`, receiptFingerprint, evaluatedAt, eventAuthorityEligible: false, mappingAuthorityEligible: false, persistenceAuthorityEligible: false, signalEligible: false, tradingEligible: false } });
  } catch { return INVALID; }
}

// This fixture-first constructor never issues source, issuer, asset, event or persistence authority.
export function createSyntheticNewsDiscoveryCandidate(input: unknown, evaluationAt: unknown): NewsDiscoveryCandidate | null {
  const parsed = parseNewsDiscovery(input, evaluationAt);
  if (parsed.status !== "VALID") return null;
  candidateTrust.add(parsed.candidate);
  return parsed.candidate;
}
export function isAuthenticNewsDiscoveryCandidate(value: unknown): value is NewsDiscoveryCandidate {
  return !!value && typeof value === "object" && candidateTrust.has(value);
}
function originKey(candidate: NewsDiscoveryCandidate): string | null {
  const o = candidate.record.origin;
  return o.originalPublisher === null ? null : hash({ publisherId: o.originalPublisher.publisherId, publicationId: o.originalPublicationId, url: o.originalSourceUrl });
}
export function compareNewsDiscoveryCandidates(left: unknown, right: unknown): "SAME_PROVIDER_REPLAY" | "PROVIDER_RECORD_MATERIAL_CONFLICT" | "SAME_CANONICAL_URL" | "DECLARED_SHARED_ORIGIN" | "DISTINCT_UNVERIFIED_ORIGINS" | "ORIGIN_UNKNOWN" | "UNTRUSTED" {
  if (!isAuthenticNewsDiscoveryCandidate(left) || !isAuthenticNewsDiscoveryCandidate(right)) return "UNTRUSTED";
  if (left.providerReplayKey === right.providerReplayKey) return left.fingerprint === right.fingerprint ? "SAME_PROVIDER_REPLAY" : "PROVIDER_RECORD_MATERIAL_CONFLICT";
  if (left.record.canonicalSourceUrl === right.record.canonicalSourceUrl) return "SAME_CANONICAL_URL";
  const l = originKey(left), r = originKey(right);
  return l === null || r === null ? "ORIGIN_UNKNOWN" : l === r ? "DECLARED_SHARED_ORIGIN" : "DISTINCT_UNVERIFIED_ORIGINS";
}
export type DiscoveryOriginSet = Readonly<{
  contractVersion: typeof DISCOVERY_ORIGIN_SET_VERSION; status: "DISCOVERY_ONLY"; fingerprint: string;
  members: readonly Readonly<{ ordinal: number; candidate: NewsDiscoveryCandidate; lifecycleStatus: "ACTIVE" | "CORRECTED" | "RETRACTED" }>[];
  groups: readonly Readonly<{ groupId: string; basis: "DECLARED_SYNDICATION" | "UNRESOLVED_SINGLETON"; candidateIds: readonly string[]; authorityOriginCount: 0 }>[];
  independentAuthorityOriginCount: 0; declaredMemberCount: number; recordedAt: string;
}>;
export function sealDiscoveryOriginSet(input: unknown): DiscoveryOriginSet | null {
  try {
    const v = object(input, ["contractVersion", "members", "declaredMemberCount", "recordedAt"]);
    const items = array(v.members, NEWS_DISCOVERY_LIMITS.originMembers);
    if (v.contractVersion !== DISCOVERY_ORIGIN_SET_VERSION || !items.length || v.declaredMemberCount !== items.length || !items.every(isAuthenticNewsDiscoveryCandidate)) return null;
    const recordedAt = time(v.recordedAt);
    const candidates = uniqueSorted(items as NewsDiscoveryCandidate[], item => item.candidateId);
    const byId = new Map(candidates.map(item => [item.candidateId, item]));
    const replayKeys = new Set<string>(), names = new Map<string, string>(), publicationUrls = new Map<string, string>();
    const successor = new Map<string, NewsDiscoveryCandidate>();
    const groups = new Map<string, NewsDiscoveryCandidate[]>();
    for (const c of candidates) {
      if (c.record.recordedAt > recordedAt || replayKeys.has(c.providerReplayKey)) return null;
      replayKeys.add(c.providerReplayKey);
      for (const p of [c.record.publisher, c.record.origin.originalPublisher, c.record.origin.distributor]) {
        if (!p) continue;
        if (names.has(p.publisherId) && names.get(p.publisherId) !== p.displayName) return null;
        names.set(p.publisherId, p.displayName);
      }
      const o = c.record.origin;
      if (o.originalPublisher) {
        const identity = canonical([o.originalPublisher.publisherId, o.originalPublicationId]);
        if (publicationUrls.has(identity) && publicationUrls.get(identity) !== o.originalSourceUrl) return null;
        publicationUrls.set(identity, o.originalSourceUrl!);
      }
      const target = c.record.lifecycleHint.targetCandidateId;
      if (target !== null) {
        const parent = byId.get(target);
        if (!parent || parent.record.lifecycleHint.kind === "RETRACTION" || successor.has(target) || parent.record.publishedAt >= c.record.publishedAt || originKey(parent) === null || originKey(parent) !== originKey(c)) return null;
        successor.set(target, c);
      }
      const key = originKey(c) ?? c.candidateId;
      const group = groups.get(key) ?? []; group.push(c); groups.set(key, group);
    }
    const members = candidates.map((candidate, ordinal) => {
      let next = successor.get(candidate.candidateId);
      let lifecycleStatus: "ACTIVE" | "CORRECTED" | "RETRACTED" = candidate.record.lifecycleHint.kind === "RETRACTION" ? "RETRACTED" : "ACTIVE";
      while (next) { lifecycleStatus = next.record.lifecycleHint.kind === "RETRACTION" ? "RETRACTED" : "CORRECTED"; next = successor.get(next.candidateId); }
      return { ordinal, candidate, lifecycleStatus };
    });
    const sealedGroups = [...groups.entries()].sort(([a], [b]) => compare(a, b)).map(([groupId, group]) => ({ groupId, basis: originKey(group[0]!) === null ? "UNRESOLVED_SINGLETON" as const : "DECLARED_SYNDICATION" as const, candidateIds: group.map(item => item.candidateId), authorityOriginCount: 0 as const }));
    const fingerprint = hash({ version: DISCOVERY_ORIGIN_SET_VERSION, members: members.map(item => ({ ordinal: item.ordinal, fingerprint: item.candidate.fingerprint, lifecycleStatus: item.lifecycleStatus })), groups: sealedGroups });
    const result: DiscoveryOriginSet = freeze({ contractVersion: DISCOVERY_ORIGIN_SET_VERSION, status: "DISCOVERY_ONLY", fingerprint, members, groups: sealedGroups, independentAuthorityOriginCount: 0, declaredMemberCount: members.length, recordedAt });
    originSetTrust.add(result); return result;
  } catch { return null; }
}
export function isAuthenticDiscoveryOriginSet(value: unknown): value is DiscoveryOriginSet { return !!value && typeof value === "object" && originSetTrust.has(value); }

export const DISCOVERY_FORBIDDEN_BOUNDARIES = Object.freeze(["ISSUER_DISCLOSURE", "VERIFIED_EVENT_FACT", "MAPPED_EVENT_AUTHORITY", "PERSISTENCE_AUTHORITY", "CORROBORATION_AUTHORITY", "SIGNAL", "RECOMMENDATION", "ORDER", "TRADE"] as const);
// No conversion path exists. Future downstream consumers must retain this denial.
export function rejectNewsDiscoveryAsAuthority(value: unknown, boundary: typeof DISCOVERY_FORBIDDEN_BOUNDARIES[number]): null { void value; void boundary; return null; }

export const NEWS_DISCOVERY_PRODUCTION_VERSION = "event-intelligence-news-discovery-production/v1" as const;
const blockedOperations = Object.freeze(["acquisition", "normalizedDiscoveryPersistence", "rawContentStorage", "issuerAssetMapping", "corroboration", "eventAuthority", "signalGeneration", "trading"] as const);
export function parseNewsDiscoveryProduction(input: unknown) {
  try {
    const v = object(input, ["contractVersion", "status", "selectedProviders", "selectedSources", "operations", "usageApprovals", "storageApproval", "retentionApproval", "redistributionApproval", "commercialApproval"]);
    if (v.contractVersion !== NEWS_DISCOVERY_PRODUCTION_VERSION || v.status !== "BLOCKED_BACKEND_UNAPPROVED" || array(v.selectedProviders, 0).length || array(v.selectedSources, 0).length) return null;
    const operations = object(v.operations, blockedOperations);
    if (Object.values(operations).some(value => value !== "BLOCKED")) return null;
    const approvals = array(v.usageApprovals, EVENT_INTELLIGENCE_USAGES.length).map(item => {
      const a = object(item, ["usage", "approval"]);
      return { usage: choice(a.usage, EVENT_INTELLIGENCE_USAGES), approval: choice(a.approval, ["NOT_APPROVED"] as const) };
    });
    uniqueSorted(approvals, item => item.usage);
    if (approvals.length !== EVENT_INTELLIGENCE_USAGES.length) return null;
    const policies = Object.fromEntries(["storageApproval", "retentionApproval", "redistributionApproval", "commercialApproval"].map(key => [key, choice(v[key], ["NOT_APPROVED", "UNKNOWN"] as const)]));
    return freeze({ contractVersion: NEWS_DISCOVERY_PRODUCTION_VERSION, status: "BLOCKED_BACKEND_UNAPPROVED" as const, selectedProviders: [] as readonly string[], selectedSources: [] as readonly string[], operations, usageApprovals: approvals, ...policies });
  } catch { return null; }
}
