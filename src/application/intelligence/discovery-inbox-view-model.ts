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
const secretLike = /(?:authorization\s*[:=]|bearer\s+|api[_ -]?(?:key|token)\s*[:=]|password\s*[:=]|secret\s*[:=]|-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:sk|pk|ghp|github_pat|xox[baprs])-[A-Za-z0-9_-]{12,})/i;
export const safeInboxText = (value: unknown, max: number): string | null => typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value) && !secretLike.test(value) ? value : null;
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
  const issuer = safeInboxText(filters.issuer, 128) ?? ""; const assetFilter = safeInboxText(filters.asset, 128) ?? "";
  return items.filter(item => (!allowedCategory || item.categories.includes(allowedCategory as InboxCategory)) && (!allowedSource || item.sourceType === allowedSource) && (!discoveryStatus || item.discoveryStatus === discoveryStatus) && (!mappingStatus || item.mappingStatus === mappingStatus) && (!lifecycle || item.lifecycle === lifecycle) && (!issuer || item.issuerCandidate === issuer || item.entities.some(entity => entity.name === issuer)) && (!assetFilter || item.assets.some(asset => asset.label === assetFilter || asset.ticker === assetFilter)) && (!from || item.publishedAt.slice(0, 10) >= from) && (!to || item.publishedAt.slice(0, 10) <= to));
}
