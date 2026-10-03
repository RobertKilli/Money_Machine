import "server-only";
import { createHash } from "node:crypto";
import { types } from "node:util";
import {
  EVIDENCE_REVIEW_QUEUE_VERSION,
  REVIEW_ITEM_TYPES,
  REVIEW_PRIORITIES,
  REVIEW_QUEUE_STATUSES,
  isAuthenticEvidenceReviewItem,
  isAuthenticEvidenceReviewQueueContract,
  isAuthenticEvidenceReviewQueueSet,
  type EvidenceReviewItem,
  type EvidenceReviewQueueContract,
  type EvidenceReviewQueueSet,
  type ReviewBlockerCode,
  type ReviewItemType,
  type ReviewPriority,
  type ReviewQueueStatus,
} from "./event-intelligence-evidence-review-queue";

export const EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION = "event-intelligence-evidence-review-queue-view-model/v1" as const;
const PUBLIC_KEY_PREFIX = "eviqv1_";
const MAX_ITEMS = 512;
const MAX_ORIGINS = 512;
const MAX_SYNDICATED = 512;

const ITEM_LABELS: Readonly<Record<ReviewItemType, string>> = Object.freeze({
  PRIMARY_SOURCE_RETRIEVAL_REVIEW: "Primary source review",
  ISSUER_MAPPING_REVIEW: "Issuer mapping review",
  ASSET_MAPPING_REVIEW: "Asset mapping review",
  CORRECTION_LINEAGE_REVIEW: "Correction lineage review",
  RETRACTION_REVIEW: "Retraction review",
  SOURCE_CONFLICT_REVIEW: "Source conflict review",
  ORIGIN_GROUP_REVIEW: "Origin group review",
  RIGHTS_APPROVAL_REVIEW: "Rights approval review",
  JURISDICTION_REVIEW: "Jurisdiction review",
  LIFECYCLE_REVIEW: "Lifecycle review",
  DUPLICATE_NO_ACTION: "Duplicate candidate",
  BLOCKED_UNSUPPORTED_CORROBORATION: "Corroboration unavailable",
  NON_AUTHORITATIVE_REVIEW_COMPLETE: "Non-authoritative review",
});
const STATUS_LABELS: Readonly<Record<ReviewQueueStatus, string>> = Object.freeze({
  OPEN: "Open review",
  BLOCKED: "Blocked",
  NO_ACTION: "No new queue action",
  RESOLVED_NON_AUTHORITATIVE: "Review completed; non-authoritative",
  SUPERSEDED: "Historical snapshot superseded",
  RETRACTED: "Retracted; not active",
});
const PRIORITY_LABELS: Readonly<Record<ReviewPriority, string>> = Object.freeze({
  URGENT_RETRACTION_REVIEW: "Urgent retraction review",
  URGENT_CORRECTION_REVIEW: "Urgent correction review",
  CONFLICT_REVIEW: "Conflict review",
  BLOCKED_RIGHTS: "Blocked by rights approval",
  JURISDICTION_UNKNOWN: "Jurisdiction review",
  MAPPING_REQUIRED: "Mapping review required",
  PRIMARY_SOURCE_MISSING: "Primary source missing",
  ROUTINE_DISCOVERY_REVIEW: "Routine discovery review",
  NO_ACTION_DUPLICATE: "No new action for duplicate",
});
const TITLE_TEMPLATES: Readonly<Record<ReviewItemType, string>> = Object.freeze({
  PRIMARY_SOURCE_RETRIEVAL_REVIEW: "Primary source must be retrieved",
  ISSUER_MAPPING_REVIEW: "Issuer mapping requires review",
  ASSET_MAPPING_REVIEW: "Asset mapping requires review",
  CORRECTION_LINEAGE_REVIEW: "Correction lineage requires review",
  RETRACTION_REVIEW: "Retraction requires review",
  SOURCE_CONFLICT_REVIEW: "Conflicting source material",
  ORIGIN_GROUP_REVIEW: "Source origin grouping requires review",
  RIGHTS_APPROVAL_REVIEW: "Rights approval is missing",
  JURISDICTION_REVIEW: "Jurisdiction requires review",
  LIFECYCLE_REVIEW: "Event lifecycle requires review",
  DUPLICATE_NO_ACTION: "Duplicate candidate — no new action",
  BLOCKED_UNSUPPORTED_CORROBORATION: "Independent corroboration is unavailable",
  NON_AUTHORITATIVE_REVIEW_COMPLETE: "Non-authoritative review completed",
});
const REASON_LABELS: Readonly<Record<ReviewBlockerCode, string>> = Object.freeze({
  ISSUER_MAPPING_MISSING: "Issuer mapping is missing",
  ASSET_MAPPING_MISSING: "Asset mapping is missing",
  JURISDICTION_SCOPE_UNRESOLVED: "Jurisdiction or listing scope is unresolved",
  PRIMARY_SOURCE_MISSING: "A qualified primary source is missing",
  CORRECTION_LINEAGE_UNRESOLVED: "Correction lineage is unresolved",
  RETRACTION_PRESENT: "Source material indicates a retraction or withdrawal",
  RIGHTS_APPROVAL_MISSING: "Required source-use approval is missing",
  SOURCE_QUALIFICATION_INCOMPLETE: "Source qualification is incomplete",
  CREDENTIAL_MISSING: "A required credential is unavailable",
  ISSUER_IDENTITY_CONFLICT: "Issuer identity evidence conflicts",
  LISTING_JURISDICTION_CONFLICT: "Listing or jurisdiction evidence conflicts",
  ASSET_REPRESENTATION_CONFLICT: "Asset representation evidence conflicts",
  AMOUNT_CURRENCY_CONFLICT: "Amount or currency evidence conflicts",
  LIFECYCLE_CONFLICT: "Event lifecycle evidence conflicts",
  PUBLICATION_TIME_CONFLICT: "Publication-time evidence conflicts",
  CORRECTION_LINEAGE_CONFLICT: "Correction lineage evidence conflicts",
  SOURCE_MATERIAL_CONFLICT: "Source material conflicts",
  AUTHORITY_TIER_CONFLICT: "Source role evidence conflicts",
  ORIGIN_GROUP_CONFLICT: "Source origin grouping conflicts",
  SOURCE_CONFLICT: "Source material contains unresolved conflicts",
  STALE_EVIDENCE: "Evidence may be stale",
  INDEPENDENT_CORROBORATION_UNSUPPORTED: "Independent factual corroboration is unsupported",
  ACQUISITION_DISABLED: "Source acquisition is blocked",
  DUPLICATE_CANDIDATE: "This candidate is already represented",
});
const ACTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  RETRIEVE_PRIMARY_SOURCE: "Review an approved primary source",
  RESOLVE_ISSUER_MAPPING: "Review issuer identity mapping",
  RESOLVE_ASSET_MAPPING: "Review asset representation mapping",
  REVIEW_CORRECTION_LINEAGE: "Review correction lineage",
  REVIEW_RETRACTION: "Review the retraction record",
  REVIEW_SOURCE_CONFLICT: "Compare conflicting source material",
  REVIEW_ORIGIN_BINDING: "Review source-origin bindings",
  OBTAIN_RIGHTS_APPROVAL: "Resolve source-use approvals",
  RESOLVE_JURISDICTION_SCOPE: "Resolve jurisdiction and listing scope",
  REVIEW_LIFECYCLE: "Review event lifecycle material",
  NO_ACTION_DUPLICATE: "Keep the existing candidate snapshot",
  STOP_UNSUPPORTED_CORROBORATION: "Stop; no supported corroboration source exists",
  RETAIN_NON_AUTHORITATIVE_SNAPSHOT: "Retain as a non-authoritative snapshot",
});
const FORBIDDEN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ISSUER_NOT_CONFIRMED: "Issuer identity is not confirmed",
  ASSET_NOT_CONFIRMED: "Asset identity is not confirmed",
  AMOUNT_NOT_VERIFIED: "Amount is not verified",
  PURCHASE_NOT_CONFIRMED_COMPLETE: "Purchase completion is not confirmed",
  ISSUER_DISCLOSURE_NOT_FACTUAL_VERIFICATION: "Issuer disclosure is not factual verification",
  NO_INDEPENDENT_FACTUAL_VERIFICATION: "Independent factual verification is unavailable",
  NOT_RECOMMENDATION: "This is not an investment recommendation",
  NOT_CONFIDENCE_PROBABILITY: "This is not a confidence estimate",
  NO_EVENT_AUTHORITY: "No event authority is granted",
  NO_SIGNAL: "This is not a signal",
  NOT_TRADING_ELIGIBILITY: "This does not establish trading eligibility",
  NO_TRADE_DECISION: "No trade decision is made",
});
const SOURCE_FAMILY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  DISCOVERY_AGGREGATOR: "Discovery aggregator",
  ISSUER_ATTRIBUTED_RELEASE: "Issuer-attributed release",
  REGULATORY_OR_EXCHANGE_DISCLOSURE: "Regulatory or exchange disclosure",
  FILING_AUTHORITY: "Filing publication",
  INDEPENDENT_FACTUAL_CORROBORATION: "Unsupported corroboration source",
});
const SOURCE_STRENGTH_LABELS: Readonly<Record<string, string>> = Object.freeze({
  DISCOVERY_ONLY: "Discovery only",
  ISSUER_ATTRIBUTED: "Issuer-attributed publication",
  REGULATORY_PUBLICATION: "Regulatory-channel publication",
  FILING_PUBLICATION: "Filing publication",
  INDEPENDENT_FACTUAL_VERIFICATION_UNSUPPORTED: "Independent factual verification unsupported",
});
const JURISDICTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  US_SEC: "United States; SEC scope candidate",
  GB_LSE: "United Kingdom; LSE scope candidate",
  AU_ASX: "Australia; ASX scope candidate",
  UNLISTED: "Unlisted issuer scope candidate",
  UNKNOWN: "Jurisdiction unknown",
  DUAL_LISTED: "Multiple listings; scope unresolved",
});
const CONTRACT_MATERIAL = Object.freeze({
  version: EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION,
  queueStates: Object.freeze(["BLOCKED", "EMPTY", "HAS_REVIEW_ITEMS"]),
  queueFields: Object.freeze(["version", "state", "generatedForAsOf", "items", "summary", "emptyState", "blockedReasons"]),
  itemFields: Object.freeze(["publicKey", "reviewType", "typeLabel", "status", "statusLabel", "operationalPriority", "priorityLabel", "title", "reasonLabels", "nextActionLabel", "forbiddenConclusionLabels", "sourceFamilies", "sourceStrengthLabel", "jurisdictionLabel", "originGroupCount", "syndicatedCopyCount", "primarySourcePresent", "correctionPresent", "retracted", "publicationAt", "discoveredAt", "receivedAt", "evaluatedAsOf", "historical", "superseded"]),
  summaryFields: Object.freeze(["totalItems", "open", "blocked", "noAction", "resolvedNonAuthoritative", "superseded", "retracted", "correctionsRequiringReview", "conflicts", "mappingReviews", "primarySourceReviews"]),
  itemTypes: REVIEW_ITEM_TYPES,
  statuses: REVIEW_QUEUE_STATUSES,
  priorities: REVIEW_PRIORITIES,
  labels: Object.freeze({ ITEM_LABELS, STATUS_LABELS, PRIORITY_LABELS, TITLE_TEMPLATES, REASON_LABELS, ACTION_LABELS, FORBIDDEN_LABELS, SOURCE_FAMILY_LABELS, SOURCE_STRENGTH_LABELS, JURISDICTION_LABELS }),
  publicKeyPolicy: "SHA256_DOMAIN_SEPARATED_SECONDARY_DIGEST_OF_PRIVATE_REVIEW_ITEM_ID_PREFIXED_EVIQV1_NO_REVERSAL_OR_DOMAIN_AUTHORITY",
  timePolicy: "CANONICAL_UTC_ISO_NO_LOCAL_OR_RELATIVE_TIME_GENERATION_CUTOFF_FROM_SEALED_SET",
  summaryPolicy: "DERIVED_EXACTLY_FROM_ALL_CANONICALLY_ORDERED_ITEMS_NO_CONFIDENCE_OR_AGGREGATED_AMOUNT",
  serializabilityPolicy: "NULL_BOOLEAN_SAFE_INTEGER_STRING_DENSE_ARRAY_PLAIN_OBJECT_ONLY_DEEP_FROZEN",
  productionStatePolicy: "DETERMINISTIC_EMPTY_BLOCKED_NO_FIXTURES_NO_IO",
});
const cmp = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const stable = (v: unknown): string => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(stable).join(",")}]` : `{${Object.keys(v).sort(cmp).map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
const hash = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
function freeze<T>(value: T): T { if (value && typeof value === "object") { for (const child of Object.values(value as Record<string, unknown>)) freeze(child); Object.freeze(value); } return value; }

export type EvidenceReviewQueueViewModelContract = Readonly<typeof CONTRACT_MATERIAL & { fingerprint: string }>;
const trustedContract = freeze({ ...CONTRACT_MATERIAL, fingerprint: hash(stable(CONTRACT_MATERIAL)) }) as EvidenceReviewQueueViewModelContract;
const trustedContracts = new WeakSet<object>([trustedContract]);
export function getEvidenceReviewQueueViewModelContract(): EvidenceReviewQueueViewModelContract { return trustedContract; }
export function isAuthenticEvidenceReviewQueueViewModelContract(value: unknown): value is EvidenceReviewQueueViewModelContract { return !!value && typeof value === "object" && trustedContracts.has(value); }

export type EvidenceReviewQueueViewModelItem = Readonly<{
  publicKey: string; reviewType: ReviewItemType; typeLabel: string; status: ReviewQueueStatus; statusLabel: string;
  operationalPriority: ReviewPriority; priorityLabel: string; title: string; reasonLabels: readonly string[];
  nextActionLabel: string; forbiddenConclusionLabels: readonly string[]; sourceFamilies: readonly string[];
  sourceStrengthLabel: string; jurisdictionLabel: string; originGroupCount: number; syndicatedCopyCount: number;
  primarySourcePresent: boolean; correctionPresent: boolean; retracted: boolean; publicationAt: string;
  discoveredAt: string; receivedAt: string; evaluatedAsOf: string; historical: boolean; superseded: boolean;
}>;
export type EvidenceReviewQueueViewModel = Readonly<{
  version: typeof EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION; state: "BLOCKED" | "EMPTY" | "HAS_REVIEW_ITEMS";
  generatedForAsOf: string | null; items: readonly EvidenceReviewQueueViewModelItem[];
  summary: Readonly<{ totalItems: number; open: number; blocked: number; noAction: number; resolvedNonAuthoritative: number; superseded: number; retracted: number; correctionsRequiringReview: number; conflicts: number; mappingReviews: number; primarySourceReviews: number }>;
  emptyState: string | null; blockedReasons: readonly string[];
}>;
export type ViewModelResult = Readonly<{ status: "PROJECTED"; model: EvidenceReviewQueueViewModel }> | Readonly<{ status: "BLOCKED"; code: "EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_INPUT_INVALID" }>;
const INVALID = Object.freeze({ status: "BLOCKED", code: "EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_INPUT_INVALID" as const });
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
function validUtc(value: unknown): value is string { return typeof value === "string" && UTC.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function validType(value: unknown): value is ReviewItemType { return typeof value === "string" && (REVIEW_ITEM_TYPES as readonly string[]).includes(value); }
function validStatus(value: unknown): value is ReviewQueueStatus { return typeof value === "string" && (REVIEW_QUEUE_STATUSES as readonly string[]).includes(value); }
function validPriority(value: unknown): value is ReviewPriority { return typeof value === "string" && (REVIEW_PRIORITIES as readonly string[]).includes(value); }
function validEnumMap<K extends string>(value: string, map: Readonly<Record<K, string>>): value is K { return Object.hasOwn(map, value); }
function uniqueAllowlisted(values: readonly string[], map: Readonly<Record<string, string>>): string[] | null {
  if (!Array.isArray(values) || values.length > 64 || new Set(values).size !== values.length) return null;
  const labels: string[] = [];
  for (const value of values) { if (typeof value !== "string" || !validEnumMap(value, map)) return null; labels.push(map[value]!); }
  labels.sort(cmp); return labels;
}
function internallyConsistent(item: EvidenceReviewItem): boolean {
  if (item.contractVersion !== EVIDENCE_REVIEW_QUEUE_VERSION || !validType(item.itemType) || !validStatus(item.status) || !validPriority(item.priority)) return false;
  if (!validUtc(item.publicationAt) || !validUtc(item.discoveredAt) || !validUtc(item.receivedAt) || !validUtc(item.evaluationAsOf)) return false;
  if (!(item.publicationAt <= item.discoveredAt && item.discoveredAt <= item.receivedAt && item.receivedAt <= item.evaluationAsOf)) return false;
  if (item.correctionAvailableAt !== null && (!validUtc(item.correctionAvailableAt) || item.correctionAvailableAt > item.evaluationAsOf)) return false;
  if (!validEnumMap(item.jurisdiction, JURISDICTION_LABELS) || !validEnumMap(item.sourceStrength, SOURCE_STRENGTH_LABELS)) return false;
  if (item.sourceFamilies.length < 1 || item.sourceFamilies.length > 8 || new Set(item.sourceFamilies).size !== item.sourceFamilies.length || item.sourceFamilies.some(f => !validEnumMap(f, SOURCE_FAMILY_LABELS))) return false;
  if (!Number.isSafeInteger(item.originGroupCount) || item.originGroupCount < 0 || item.originGroupCount > MAX_ORIGINS || !Number.isSafeInteger(item.syndicatedCopyCount) || item.syndicatedCopyCount < 0 || item.syndicatedCopyCount > MAX_SYNDICATED) return false;
  if (item.primarySourcePresent !== item.sourceFamilies.some(f => f !== "DISCOVERY_AGGREGATOR") || item.syndicatedCopyCount > 0 && item.originGroupCount === 0) return false;
  if (item.retracted !== (item.status === "RETRACTED") || item.retracted !== (item.itemType === "RETRACTION_REVIEW")) return false;
  if (item.status === "NO_ACTION" && (item.itemType !== "DUPLICATE_NO_ACTION" || item.priority !== "NO_ACTION_DUPLICATE")) return false;
  if (item.itemType === "DUPLICATE_NO_ACTION" && item.status !== "NO_ACTION") return false;
  if (item.correctionPresent && !item.correctionResolved && (item.itemType !== "CORRECTION_LINEAGE_REVIEW" || item.priority !== "URGENT_CORRECTION_REVIEW")) return false;
  if (item.itemType === "RIGHTS_APPROVAL_REVIEW" && (item.status !== "BLOCKED" || item.priority !== "BLOCKED_RIGHTS")) return false;
  if (item.itemType === "BLOCKED_UNSUPPORTED_CORROBORATION" && item.status !== "BLOCKED") return false;
  if (item.authorityIssued !== false || item.persistenceAllowed !== false || item.signalEligible !== false || item.tradingEligible !== false) return false;
  return validEnumMap(item.requiredNextAction, ACTION_LABELS) && item.blockerReasons.every(b => validEnumMap(b.code, REASON_LABELS) && validEnumMap(b.nextAction, ACTION_LABELS) && validEnumMap(b.forbiddenConclusion, FORBIDDEN_LABELS));
}
function projectItem(item: EvidenceReviewItem): EvidenceReviewQueueViewModelItem | null {
  if (!isAuthenticEvidenceReviewItem(item) || !internallyConsistent(item)) return null;
  const reasonLabels = uniqueAllowlisted(item.blockerReasons.map(b => b.code), REASON_LABELS);
  const forbiddenConclusionLabels = uniqueAllowlisted(item.forbiddenConclusions, FORBIDDEN_LABELS);
  const sourceFamilies = uniqueAllowlisted(item.sourceFamilies, SOURCE_FAMILY_LABELS);
  if (!reasonLabels || !forbiddenConclusionLabels || !sourceFamilies || !validEnumMap(item.itemType, ITEM_LABELS) || !validEnumMap(item.status, STATUS_LABELS) || !validEnumMap(item.priority, PRIORITY_LABELS)) return null;
  const publicKey = `${PUBLIC_KEY_PREFIX}${hash(`event-intelligence-evidence-review-queue-view-model/public-key/v1\0${item.itemId}`)}`;
  return freeze({ publicKey, reviewType: item.itemType, typeLabel: ITEM_LABELS[item.itemType], status: item.status, statusLabel: STATUS_LABELS[item.status], operationalPriority: item.priority, priorityLabel: PRIORITY_LABELS[item.priority], title: TITLE_TEMPLATES[item.itemType], reasonLabels, nextActionLabel: ACTION_LABELS[item.requiredNextAction]!, forbiddenConclusionLabels, sourceFamilies, sourceStrengthLabel: SOURCE_STRENGTH_LABELS[item.sourceStrength]!, jurisdictionLabel: JURISDICTION_LABELS[item.jurisdiction]!, originGroupCount: item.originGroupCount, syndicatedCopyCount: item.syndicatedCopyCount, primarySourcePresent: item.primarySourcePresent, correctionPresent: item.correctionPresent, retracted: item.retracted, publicationAt: item.publicationAt, discoveredAt: item.discoveredAt, receivedAt: item.receivedAt, evaluatedAsOf: item.evaluationAsOf, historical: item.status === "SUPERSEDED", superseded: item.status === "SUPERSEDED" });
}
function summarize(items: readonly EvidenceReviewQueueViewModelItem[]): EvidenceReviewQueueViewModel["summary"] {
  const summary = { totalItems: items.length, open: items.filter(i => i.status === "OPEN").length, blocked: items.filter(i => i.status === "BLOCKED").length, noAction: items.filter(i => i.status === "NO_ACTION").length, resolvedNonAuthoritative: items.filter(i => i.status === "RESOLVED_NON_AUTHORITATIVE").length, superseded: items.filter(i => i.status === "SUPERSEDED").length, retracted: items.filter(i => i.status === "RETRACTED").length, correctionsRequiringReview: items.filter(i => i.reviewType === "CORRECTION_LINEAGE_REVIEW" && i.correctionPresent && !i.retracted).length, conflicts: items.filter(i => i.reviewType === "SOURCE_CONFLICT_REVIEW").length, mappingReviews: items.filter(i => i.reviewType === "ISSUER_MAPPING_REVIEW" || i.reviewType === "ASSET_MAPPING_REVIEW").length, primarySourceReviews: items.filter(i => i.reviewType === "PRIMARY_SOURCE_RETRIEVAL_REVIEW").length };
  if (summary.totalItems !== summary.open + summary.blocked + summary.noAction + summary.resolvedNonAuthoritative + summary.superseded + summary.retracted) throw new Error("INVALID");
  return Object.freeze(summary);
}
export function adaptEvidenceReviewQueueSetToViewModel(contract: unknown, queueSet: unknown): ViewModelResult {
  try {
    if (!isAuthenticEvidenceReviewQueueContract(contract) || !isAuthenticEvidenceReviewQueueSet(queueSet)) return INVALID;
    const c = contract as EvidenceReviewQueueContract;
    const set = queueSet as EvidenceReviewQueueSet;
    if (c.contractVersion !== EVIDENCE_REVIEW_QUEUE_VERSION || set.contractVersion !== c.contractVersion || set.ordering !== "PRIORITY_ORDER_THEN_PUBLICATION_ASC_THEN_ITEM_ID_ASC_LEXICAL" || !validUtc(set.evaluationAsOf) || !Number.isSafeInteger(set.memberCount) || set.memberCount < 1 || set.memberCount > MAX_ITEMS || !Array.isArray(set.members) || types.isProxy(set.members) || Object.getPrototypeOf(set.members) !== Array.prototype || set.members.length !== set.memberCount || !Object.isFrozen(set.members) || set.authorityIssued !== false || set.persistenceAllowed !== false) return INVALID;
    const items: EvidenceReviewQueueViewModelItem[] = [];
    const keys = new Set<string>();
    let prior: EvidenceReviewItem | null = null;
    for (let i = 0; i < set.members.length; i++) {
      const member = set.members[i];
      if (!member || !Object.isFrozen(member) || member.ordinal !== i || !isAuthenticEvidenceReviewItem(member.item) || member.item.evaluationAsOf !== set.evaluationAsOf) return INVALID;
      if (prior && (REVIEW_PRIORITIES.indexOf(prior.priority) > REVIEW_PRIORITIES.indexOf(member.item.priority) || prior.priority === member.item.priority && (prior.publicationAt > member.item.publicationAt || prior.publicationAt === member.item.publicationAt && prior.itemId >= member.item.itemId))) return INVALID;
      prior = member.item;
      const item = projectItem(member.item);
      if (!item || keys.has(item.publicKey)) return INVALID;
      keys.add(item.publicKey); items.push(item);
    }
    const frozenItems = Object.freeze(items);
    const model = freeze({ version: EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION, state: items.length ? "HAS_REVIEW_ITEMS" as const : "EMPTY" as const, generatedForAsOf: set.evaluationAsOf, items: frozenItems, summary: summarize(frozenItems), emptyState: items.length ? null : "No evidence-review items exist for this historical cutoff.", blockedReasons: Object.freeze([]) });
    return Object.freeze({ status: "PROJECTED" as const, model });
  } catch { return INVALID; }
}

/** Deterministic production state. It has no fixture, clock, network, or database dependency. */
export function createBlockedEvidenceReviewQueueViewModel(): EvidenceReviewQueueViewModel {
  return freeze({ version: EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION, state: "BLOCKED" as const, generatedForAsOf: null, items: Object.freeze([]), summary: summarize([]), emptyState: "Evidence review is unavailable because queue projection is blocked.", blockedReasons: Object.freeze(["Queue projection is blocked in production.", "No provider stack or persisted queue is available."]) });
}

export function isSerializableEvidenceReviewQueueViewModel(value: unknown): value is EvidenceReviewQueueViewModel {
  const seen = new Set<object>();
  const visit = (v: unknown, depth = 0): boolean => {
    if (depth > 12) return false;
    if (v === null || typeof v === "string" || typeof v === "boolean") return true;
    if (typeof v === "number") return Number.isSafeInteger(v);
    if (typeof v !== "object" || types.isProxy(v) || seen.has(v)) return false;
    seen.add(v);
    if (Array.isArray(v)) {
      if (Object.getPrototypeOf(v) !== Array.prototype) return false;
      const length = Object.getOwnPropertyDescriptor(v, "length")?.value;
      if (!Number.isSafeInteger(length) || length > MAX_ITEMS || Reflect.ownKeys(v).length !== length + 1) return false;
      for (let i = 0; i < length; i++) { const d = Object.getOwnPropertyDescriptor(v, String(i)); if (!d || !("value" in d) || !d.enumerable || !visit(d.value, depth + 1)) return false; }
      return true;
    }
    if (Object.getPrototypeOf(v) !== Object.prototype) return false;
    for (const key of Reflect.ownKeys(v)) { if (typeof key !== "string") return false; const d = Object.getOwnPropertyDescriptor(v, key); if (!d || !("value" in d) || !d.enumerable || !visit(d.value, depth + 1)) return false; }
    return true;
  };
  return visit(value);
}

export const EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_PRODUCTION_STATE = createBlockedEvidenceReviewQueueViewModel();
