import "server-only";

import { types } from "node:util";
import {
  emptyInbox,
  INBOX_CATEGORIES,
  INBOX_SOURCE_TYPES,
  safeInboxText,
  type DiscoveryInboxItem,
  type DiscoveryInboxViewModel,
  type InboxCategory,
  type InboxLifecycle,
  type InboxSourceType,
} from "./discovery-inbox-view-model";

const MAX_ITEMS = 64;
const iso = (value: unknown): string | null => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value ? value : null;
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

// Proxy detection precedes reflection. Copy only own data descriptors, so no
// accessor or proxy trap can run as part of presentation projection.
function safeObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length > 64 || keys.some(key => typeof key !== "string")) return null;
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    Object.defineProperty(result, key, { value: descriptor.value, enumerable: true, writable: true, configurable: true });
  }
  return result;
}

function safeArray(value: unknown, max: number): unknown[] | null {
  if (!value || typeof value !== "object" || types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > max || Reflect.ownKeys(value).length !== length + 1) return null;
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    result.push(descriptor.value);
  }
  return result;
}

function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash || url.port || url.href !== value) return null;
    return value;
  } catch { return null; }
}

function project(value: unknown, evaluatedAt: string): DiscoveryInboxItem | null {
  const candidate = safeObject(value);
  const record = safeObject(candidate?.record);
  if (!candidate || !record) return null;
  const origin = safeObject(record.origin);
  const publisher = safeObject(record.publisher);
  const issuer = record.attributedIssuer === null ? null : safeObject(record.attributedIssuer);
  const hint = safeObject(record.lifecycleHint);
  const categoryList = safeArray(record.eventCategories, INBOX_CATEGORIES.length);
  const categories = categoryList ? [...new Set(categoryList.filter((entry): entry is InboxCategory => typeof entry === "string" && (INBOX_CATEGORIES as readonly string[]).includes(entry)))].sort(compare) : [];
  const category = categories[0];
  const sourceType = record.sourceType;
  const headline = safeInboxText(record.headline, 512);
  const sourceUrl = safeSourceUrl(record.canonicalSourceUrl);
  const publishedAt = iso(record.publishedAt);
  const sourceUpdatedAt = record.sourceUpdatedAt === null ? null : iso(record.sourceUpdatedAt);
  const discoveredAt = iso(record.discoveredAt);
  const receivedAt = iso(record.receivedAt);
  const publisherName = safeInboxText(publisher?.displayName, 128);
  if (candidate.status !== "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE" || record.authorityStatus !== "DISCOVERY_ONLY" || !headline || !sourceUrl || !publishedAt || (record.sourceUpdatedAt !== null && !sourceUpdatedAt) || !discoveredAt || !receivedAt || !publisherName || !category || typeof sourceType !== "string" || !(INBOX_SOURCE_TYPES as readonly string[]).includes(sourceType)) return null;

  const kind = hint?.kind;
  if (!hint || !["NONE", "CORRECTION", "RETRACTION"].includes(String(kind)) || (kind === "NONE" && hint.targetCandidateId !== null) || (kind !== "NONE" && (typeof hint.targetCandidateId !== "string" || !hint.targetCandidateId))) return null;
  const lifecycle: InboxLifecycle = kind === "CORRECTION" ? "CORRECTED" : kind === "RETRACTION" ? "RETRACTED" : "ACTIVE";
  const rawAssets = safeArray(record.mentionedAssets, 32);
  const rawEntities = safeArray(record.mentionedEntities, 32);
  if (!rawAssets || !rawEntities) return null;
  const assets = rawAssets.flatMap(raw => {
    const asset = safeObject(raw);
    const label = safeInboxText(asset?.label, 128);
    const representation = safeInboxText(asset?.representation, 24);
    if (!asset || !label || !representation || (asset.ticker !== null && !safeInboxText(asset.ticker, 16))) return [];
    return [Object.freeze({ label, ticker: asset.ticker as string | null, representation })];
  });
  const entities = rawEntities.flatMap(raw => {
    const entity = safeObject(raw);
    const name = safeInboxText(entity?.legalName, 192);
    const relationship = safeInboxText(entity?.relationshipHint, 32);
    return entity && name && relationship ? [Object.freeze({ name, relationship })] : [];
  });
  const original = safeObject(origin?.originalPublisher);
  const originalId = safeInboxText(origin?.originalPublicationId, 128);
  const originGroupLabel = originalId ?? "Unresolved origin";
  const distribution = origin?.distribution;
  const sourceRelationship = sourceType === "ISSUER_IR" ? "Issuer IR publication · discovery only" : sourceType === "NEWSWIRE" ? "Newswire distribution" : sourceType === "NEWS_AGGREGATOR" ? distribution === "AGGREGATOR_REFERENCE" ? "Aggregator reference · origin independence unverified" : "Aggregator copy" : "Exchange / regulator feed item";
  const locatorText = safeInboxText(record.sourceLocator, 256);
  const locator = locatorText && /^article:[a-z0-9][a-z0-9:_-]*$/.test(locatorText) ? locatorText : null;
  const id = locator ?? sourceUrl;
  const summary = record.summary === null ? null : safeInboxText(record.summary, 2048);
  const parent = typeof hint.targetCandidateId === "string" ? hint.targetCandidateId : null;
  const correctionParentHeadline = parent ? safeInboxText(record.correctionParentHeadline, 512) : null;
  return Object.freeze({
    id, headline, summary, category, categories: Object.freeze(categories), sourceType: sourceType as InboxSourceType,
    issuerCandidate: safeInboxText(issuer?.legalName, 192), issuerRelationship: safeInboxText(issuer?.relationshipHint, 32),
    entities: Object.freeze(entities), assets: Object.freeze(assets), publisher: publisherName,
    distributor: safeInboxText(safeObject(origin?.distributor)?.displayName, 128), originalPublisher: safeInboxText(original?.displayName, 128), sourceRelationship, sourceUrl,
    publishedAt, sourceUpdatedAt, discoveredAt, receivedAt, evaluatedAt, originGroupCount: 1, originGroupMemberCount: 1, originGroupLabel,
    lifecycle, correctionParentHeadline, discoveryStatus: lifecycle === "ACTIVE" ? "NEW_DISCOVERY" : lifecycle,
    mappingStatus: "NEEDS_MAPPING", retrievalStatus: "NEEDS_SOURCE_RETRIEVAL", corroborationStatus: "NEEDS_CORROBORATION",
    authorityStatus: "DISCOVERY_ONLY", capability: "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE",
  });
}

export function adaptDiscoveryInbox(input: unknown, evaluatedAt: unknown): DiscoveryInboxViewModel {
  const evaluation = iso(evaluatedAt);
  const safeInput = safeArray(input, MAX_ITEMS);
  if (!evaluation || !safeInput) return emptyInbox("SANITIZED_ERROR");
  const projected = safeInput.flatMap(value => {
    const item = project(value, evaluation);
    const candidate = safeObject(value);
    const record = safeObject(candidate?.record);
    const origin = safeObject(record?.origin);
    const original = safeObject(origin?.originalPublisher);
    const originalId = safeInboxText(origin?.originalPublicationId, 128);
    const originalUrl = safeSourceUrl(origin?.originalSourceUrl);
    const originKey = original && originalId && originalUrl ? `${safeInboxText(original.publisherId, 96) ?? ""}\u0000${originalId}\u0000${originalUrl}` : null;
    const candidateId = safeInboxText(candidate?.candidateId, 128);
    const parentId = safeInboxText(safeObject(record?.lifecycleHint)?.targetCandidateId, 128);
    const headline = safeInboxText(record?.headline, 512);
    return item ? [{ item, originKey, candidateId, parentId, headline }] : [];
  });
  const groupSizes = new Map<string, number>();
  for (const entry of projected) if (entry.originKey) groupSizes.set(entry.originKey, (groupSizes.get(entry.originKey) ?? 0) + 1);
  const candidateHeadlines = new Map<string, string>();
  for (const entry of projected) if (entry.candidateId && entry.headline) candidateHeadlines.set(entry.candidateId, entry.headline);
  const stable = projected.map(({ item, originKey, parentId }) => Object.freeze({
    ...item,
    originGroupMemberCount: originKey ? groupSizes.get(originKey) ?? 1 : 1,
    correctionParentHeadline: parentId ? candidateHeadlines.get(parentId) ?? "Prior record retained in this discovery set" : null,
  })).sort((a, b) => compare(a.publishedAt, b.publishedAt) * -1 || compare(a.id, b.id) || compare(JSON.stringify(a), JSON.stringify(b)));
  const usedIds = new Set<string>();
  const items = stable.map(item => {
    let id = item.id;
    let occurrence = 2;
    while (usedIds.has(id)) id = `${item.id}#${occurrence++}`;
    usedIds.add(id);
    return id === item.id ? item : Object.freeze({ ...item, id });
  });
  return Object.freeze({
    contractVersion: "event-intelligence-discovery-inbox-view/v1", state: items.length ? "READY" : "EMPTY_BLOCKED",
    globalStatus: "DISCOVERY ONLY", productionStatus: "ACQUISITION BLOCKED", persistenceStatus: "UNAVAILABLE",
    providerStack: "NONE SELECTED", items: Object.freeze(items),
    notice: "Discovery candidates are leads for verification. They are not verified facts, authorities, recommendations or trading inputs.",
  });
}
