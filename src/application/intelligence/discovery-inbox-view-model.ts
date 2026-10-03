export const INBOX_CATEGORIES = ["CORPORATE_CRYPTO_PURCHASE_INTENT", "BOARD_AUTHORIZATION", "BINDING_PURCHASE_AGREEMENT", "COMPLETED_CRYPTO_PURCHASE", "TREASURY_POLICY_CHANGE", "ASSET_OR_COMPANY_ACQUISITION", "STRATEGIC_PARTNERSHIP", "CANCELLATION_OR_TERMINATION", "CORRECTION_OR_RETRACTION", "UNSPECIFIED_RELEVANT_MENTION"] as const;
export const INBOX_SOURCE_TYPES = ["NEWS_AGGREGATOR", "ISSUER_IR", "NEWSWIRE", "EXCHANGE_OR_REGULATOR_FEED"] as const;
export type InboxCategory = typeof INBOX_CATEGORIES[number];
export type InboxSourceType = typeof INBOX_SOURCE_TYPES[number];
export type InboxLifecycle = "ACTIVE" | "CORRECTED" | "RETRACTED";
export type DiscoveryInboxItem = Readonly<{
  id: string; headline: string; summary: string | null; category: InboxCategory; categories: readonly InboxCategory[]; sourceType: InboxSourceType;
  issuerCandidate: string | null; issuerRelationship: string | null; entities: readonly Readonly<{ name: string; relationship: string }>[]; assets: readonly Readonly<{ label: string; ticker: string | null; representation: string }>[];
  publisher: string; distributor: string | null; originalPublisher: string | null; sourceRelationship: string; sourceUrl: string;
  publishedAt: string; sourceUpdatedAt: string | null; discoveredAt: string; receivedAt: string; evaluatedAt: string;
  originGroupCount: number; originGroupMemberCount: number; originGroupLabel: string; lifecycle: InboxLifecycle; correctionParentHeadline: string | null;
  discoveryStatus: "NEW_DISCOVERY" | "CORRECTED" | "RETRACTED"; mappingStatus: "NEEDS_MAPPING";
  retrievalStatus: "NEEDS_SOURCE_RETRIEVAL"; corroborationStatus: "NEEDS_CORROBORATION"; authorityStatus: "DISCOVERY_ONLY";
  capability: "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE";
}>;
export type DiscoveryInboxViewModel = Readonly<{
  contractVersion: "event-intelligence-discovery-inbox-view/v1"; state: "EMPTY_BLOCKED" | "READY" | "SANITIZED_ERROR";
  globalStatus: "DISCOVERY ONLY"; productionStatus: "ACQUISITION BLOCKED"; persistenceStatus: "UNAVAILABLE";
  providerStack: "NONE SELECTED"; items: readonly DiscoveryInboxItem[]; notice: string;
}>;
const MAX_ITEMS = 64;
const iso = (value: unknown): string | null => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value ? value : null;
const plain = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  return value as Record<string, unknown>;
};
const secretLike = /(?:authorization\s*[:=]|bearer\s+|api[_ -]?(?:key|token)\s*[:=]|password\s*[:=]|secret\s*[:=]|-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:sk|pk|ghp|github_pat|xox[baprs])-[A-Za-z0-9_-]{12,})/i;
const safeText = (value: unknown, max: number): string | null => typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value) && !secretLike.test(value) ? value : null;
function project(value: unknown, evaluatedAt: string): DiscoveryInboxItem | null {
  const candidate = plain(value); const record = plain(candidate?.record); if (!candidate || !record) return null;
  const origin = plain(record.origin); const publisher = plain(record.publisher); const issuer = record.attributedIssuer === null ? null : plain(record.attributedIssuer);
  const hint = plain(record.lifecycleHint); const categoryList = Array.isArray(record.eventCategories) ? record.eventCategories.slice(0, INBOX_CATEGORIES.length) : [];
  const categories = [...new Set(categoryList.filter((entry): entry is InboxCategory => typeof entry === "string" && (INBOX_CATEGORIES as readonly string[]).includes(entry)))];
  const category = categories[0];
  const sourceType = record.sourceType;
  const headline = safeText(record.headline, 512), sourceUrl = safeSourceUrl(record.canonicalSourceUrl);
  const publishedAt = iso(record.publishedAt), sourceUpdatedAt = record.sourceUpdatedAt === null ? null : iso(record.sourceUpdatedAt), discoveredAt = iso(record.discoveredAt), receivedAt = iso(record.receivedAt);
  const publisherName = safeText(publisher?.displayName, 128);
  if (candidate.status !== "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE" || record.authorityStatus !== "DISCOVERY_ONLY" || !headline || !sourceUrl || !publishedAt || (record.sourceUpdatedAt !== null && !sourceUpdatedAt) || !discoveredAt || !receivedAt || !publisherName || !category || typeof sourceType !== "string" || !(INBOX_SOURCE_TYPES as readonly string[]).includes(sourceType)) return null;
  const lifecycle: InboxLifecycle = hint?.kind === "CORRECTION" ? "CORRECTED" : hint?.kind === "RETRACTION" ? "RETRACTED" : "ACTIVE";
  if (!hint || !["NONE", "CORRECTION", "RETRACTION"].includes(String(hint.kind)) || (hint.kind === "NONE" && hint.targetCandidateId !== null) || (hint.kind !== "NONE" && (typeof hint.targetCandidateId !== "string" || !hint.targetCandidateId))) return null;
  const assets = (Array.isArray(record.mentionedAssets) ? record.mentionedAssets : []).slice(0, 32).flatMap(raw => {
    const asset = plain(raw); const label = safeText(asset?.label, 128); const representation = safeText(asset?.representation, 24);
    if (!label || !representation) return [];
    return [Object.freeze({ label, ticker: asset?.ticker === null ? null : safeText(asset?.ticker, 16), representation })];
  });
  const issuerName = safeText(issuer?.legalName, 192);
  const entities = (Array.isArray(record.mentionedEntities) ? record.mentionedEntities : []).slice(0, 32).flatMap(raw => { const entity = plain(raw); const name = safeText(entity?.legalName, 192); const relationship = safeText(entity?.relationshipHint, 32); return name && relationship ? [Object.freeze({ name, relationship })] : []; });
  const original = plain(origin?.originalPublisher);
  const originGroupLabel = safeText(origin?.originalPublicationId, 128) ?? "Unresolved origin";
  const distribution = origin?.distribution;
  const sourceRelationship = sourceType === "ISSUER_IR" ? "Issuer IR publication · discovery only" : sourceType === "NEWSWIRE" ? "Newswire distribution" : sourceType === "NEWS_AGGREGATOR" ? distribution === "AGGREGATOR_REFERENCE" ? "Aggregator reference · origin independence unverified" : "Aggregator copy" : "Exchange / regulator feed item";
  const id = safeText(record.sourceLocator, 256) ?? sourceUrl;
  const summaryValue = record.summary === null ? null : safeText(record.summary, 2048);
  const summary = summaryValue;
  const parent = typeof hint?.targetCandidateId === "string" ? hint.targetCandidateId : null;
  const parentHeadline = parent ? safeText(record.correctionParentHeadline, 512) : null;
  return Object.freeze({
    id, headline, summary, category, categories: Object.freeze(categories), sourceType: sourceType as InboxSourceType, issuerCandidate: issuerName,
    issuerRelationship: safeText(issuer?.relationshipHint, 32), entities: Object.freeze(entities), assets: Object.freeze(assets), publisher: publisherName,
    distributor: safeText(plain(origin?.distributor)?.displayName, 128), originalPublisher: safeText(original?.displayName, 128), sourceRelationship, sourceUrl,
    publishedAt, sourceUpdatedAt, discoveredAt, receivedAt, evaluatedAt, originGroupCount: 1, originGroupMemberCount: 1, originGroupLabel, lifecycle,
    correctionParentHeadline: parentHeadline, discoveryStatus: lifecycle === "ACTIVE" ? "NEW_DISCOVERY" : lifecycle,
    mappingStatus: "NEEDS_MAPPING", retrievalStatus: "NEEDS_SOURCE_RETRIEVAL", corroborationStatus: "NEEDS_CORROBORATION",
    authorityStatus: "DISCOVERY_ONLY", capability: "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE",
  });
}
function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port || url.href !== value) return null; return value; } catch { return null; }
}
export function adaptDiscoveryInbox(input: unknown, evaluatedAt: unknown): DiscoveryInboxViewModel {
  const evaluation = iso(evaluatedAt);
  if (!evaluation || !Array.isArray(input) || input.length > MAX_ITEMS) return emptyInbox("SANITIZED_ERROR");
  const projected = input.flatMap(value => { const item = project(value, evaluation); return item ? [{ item, value }] : []; });
  const groupKeys = projected.map(({ value }) => {
    const record = plain(plain(value)?.record), origin = plain(record?.origin), publisher = plain(origin?.originalPublisher);
    const publication = safeText(origin?.originalPublicationId, 128), publisherId = safeText(publisher?.publisherId, 96), sourceUrl = safeSourceUrl(origin?.originalSourceUrl);
    return publisherId && publication && sourceUrl ? `${publisherId}\u0000${publication}\u0000${sourceUrl}` : null;
  });
  const groupSizes = new Map<string, number>(); for (const key of groupKeys) if (key) groupSizes.set(key, (groupSizes.get(key) ?? 0) + 1);
  const candidateHeadlines = new Map<string, string>();
  input.forEach(value => { const candidate = plain(value), id = safeText(candidate?.candidateId, 128); const headline = safeText(plain(candidate?.record)?.headline, 512); if (id && headline) candidateHeadlines.set(id, headline); });
  const items = projected.map(({ item, value }, index) => {
    const candidate = plain(value), hint = plain(plain(candidate?.record)?.lifecycleHint);
    const parent = safeText(hint?.targetCandidateId, 128), key = groupKeys[index];
    return Object.freeze({ ...item, id: projected.some((other, otherIndex) => otherIndex !== index && other.item.id === item.id) ? `${item.id}:${index}` : item.id,
      originGroupMemberCount: key ? groupSizes.get(key) ?? 1 : 1, correctionParentHeadline: parent ? candidateHeadlines.get(parent) ?? "Prior record retained in this discovery set" : null });
  });
  return Object.freeze({ contractVersion: "event-intelligence-discovery-inbox-view/v1", state: items.length ? "READY" : "EMPTY_BLOCKED", globalStatus: "DISCOVERY ONLY", productionStatus: "ACQUISITION BLOCKED", persistenceStatus: "UNAVAILABLE", providerStack: "NONE SELECTED", items: Object.freeze(items), notice: "Discovery candidates are leads for verification. They are not verified facts, authorities, recommendations or trading inputs." });
}
export function emptyInbox(state: "EMPTY_BLOCKED" | "SANITIZED_ERROR" = "EMPTY_BLOCKED"): DiscoveryInboxViewModel {
  const notice = state === "SANITIZED_ERROR" ? "The discovery view is unavailable. No source material or authority is shown." : "No discovery records are available. Acquisition and persistence are blocked.";
  return Object.freeze({ contractVersion: "event-intelligence-discovery-inbox-view/v1", state, globalStatus: "DISCOVERY ONLY", productionStatus: "ACQUISITION BLOCKED", persistenceStatus: "UNAVAILABLE", providerStack: "NONE SELECTED", items: Object.freeze([]), notice });
}
export type InboxFilters = Readonly<{ category: string; sourceType: string; discoveryStatus: string; mappingStatus: string; lifecycle: string; issuer: string; asset: string; from: string; to: string }>;
const DISCOVERY_STATUSES = ["NEW_DISCOVERY", "NEEDS_MAPPING", "NEEDS_SOURCE_RETRIEVAL", "NEEDS_CORROBORATION", "CORRECTED", "RETRACTED", "DISCOVERY_ONLY"] as const;
const validDate = (value: string) => /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
export function inboxFiltersAreValid(filters: InboxFilters): boolean {
  return (!filters.category || (INBOX_CATEGORIES as readonly string[]).includes(filters.category)) && (!filters.sourceType || (INBOX_SOURCE_TYPES as readonly string[]).includes(filters.sourceType)) && (!filters.discoveryStatus || (DISCOVERY_STATUSES as readonly string[]).includes(filters.discoveryStatus)) && (!filters.mappingStatus || filters.mappingStatus === "NEEDS_MAPPING") && (!filters.lifecycle || ["ACTIVE", "CORRECTED", "RETRACTED"].includes(filters.lifecycle)) && (!filters.from || validDate(filters.from)) && (!filters.to || validDate(filters.to)) && (!filters.from || !filters.to || filters.from <= filters.to);
}
export function filterInbox(items: readonly DiscoveryInboxItem[], filters: InboxFilters): readonly DiscoveryInboxItem[] {
  const allowedCategory = (INBOX_CATEGORIES as readonly string[]).includes(filters.category) ? filters.category : "";
  const allowedSource = (INBOX_SOURCE_TYPES as readonly string[]).includes(filters.sourceType) ? filters.sourceType : "";
  const discoveryStatus = (DISCOVERY_STATUSES as readonly string[]).includes(filters.discoveryStatus) ? filters.discoveryStatus : "";
  const mappingStatus = filters.mappingStatus === "NEEDS_MAPPING" ? filters.mappingStatus : "";
  const lifecycle = ["ACTIVE", "CORRECTED", "RETRACTED"].includes(filters.lifecycle) ? filters.lifecycle : "";
  const from = validDate(filters.from) ? filters.from : ""; const to = validDate(filters.to) ? filters.to : "";
  const issuer = safeText(filters.issuer, 128) ?? ""; const assetFilter = safeText(filters.asset, 128) ?? "";
  return items.filter(item => (!allowedCategory || item.categories.includes(allowedCategory as InboxCategory)) && (!allowedSource || item.sourceType === allowedSource) && (!discoveryStatus || item.discoveryStatus === discoveryStatus) && (!mappingStatus || item.mappingStatus === mappingStatus) && (!lifecycle || item.lifecycle === lifecycle) && (!issuer || item.issuerCandidate === issuer || item.entities.some(entity => entity.name === issuer)) && (!assetFilter || item.assets.some(asset => asset.label === assetFilter || asset.ticker === assetFilter)) && (!from || item.publishedAt.slice(0, 10) >= from) && (!to || item.publishedAt.slice(0, 10) <= to));
}
