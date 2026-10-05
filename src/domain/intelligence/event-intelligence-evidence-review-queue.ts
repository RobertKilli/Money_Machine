import "server-only";
import { createHash } from "node:crypto";
import { types } from "node:util";
import {
  isAuthenticRoutingEvaluation,
  isAuthenticSourcePortfolioDecision,
  isRoutingEvaluationForDecision,
  SOURCE_PORTFOLIO_DECISION_VERSION,
  type RoutingEvaluation,
  type SourcePortfolioDecision,
  type SourceFamily,
} from "./event-intelligence-source-portfolio-routing-decision";

export const EVIDENCE_REVIEW_QUEUE_VERSION = "event-intelligence-evidence-review-queue-contract/v1" as const;
export const REVIEW_ITEM_TYPES = Object.freeze(["PRIMARY_SOURCE_RETRIEVAL_REVIEW", "ISSUER_MAPPING_REVIEW", "ASSET_MAPPING_REVIEW", "CORRECTION_LINEAGE_REVIEW", "RETRACTION_REVIEW", "SOURCE_CONFLICT_REVIEW", "ORIGIN_GROUP_REVIEW", "RIGHTS_APPROVAL_REVIEW", "JURISDICTION_REVIEW", "LIFECYCLE_REVIEW", "DUPLICATE_NO_ACTION", "BLOCKED_UNSUPPORTED_CORROBORATION", "NON_AUTHORITATIVE_REVIEW_COMPLETE"] as const);
export type ReviewItemType = typeof REVIEW_ITEM_TYPES[number];
export const REVIEW_QUEUE_STATUSES = Object.freeze(["OPEN", "BLOCKED", "NO_ACTION", "RESOLVED_NON_AUTHORITATIVE", "SUPERSEDED", "RETRACTED"] as const);
export type ReviewQueueStatus = typeof REVIEW_QUEUE_STATUSES[number];
export const REVIEW_PRIORITIES = Object.freeze(["URGENT_RETRACTION_REVIEW", "URGENT_CORRECTION_REVIEW", "CONFLICT_REVIEW", "BLOCKED_RIGHTS", "JURISDICTION_UNKNOWN", "MAPPING_REQUIRED", "PRIMARY_SOURCE_MISSING", "ROUTINE_DISCOVERY_REVIEW", "NO_ACTION_DUPLICATE"] as const);
export type ReviewPriority = typeof REVIEW_PRIORITIES[number];
export const REVIEW_BLOCKER_CODES = Object.freeze(["ISSUER_MAPPING_MISSING", "ASSET_MAPPING_MISSING", "JURISDICTION_SCOPE_UNRESOLVED", "PRIMARY_SOURCE_MISSING", "CORRECTION_LINEAGE_UNRESOLVED", "RETRACTION_PRESENT", "RIGHTS_APPROVAL_MISSING", "SOURCE_QUALIFICATION_INCOMPLETE", "CREDENTIAL_MISSING", "ISSUER_IDENTITY_CONFLICT", "LISTING_JURISDICTION_CONFLICT", "ASSET_REPRESENTATION_CONFLICT", "AMOUNT_CURRENCY_CONFLICT", "LIFECYCLE_CONFLICT", "PUBLICATION_TIME_CONFLICT", "CORRECTION_LINEAGE_CONFLICT", "SOURCE_MATERIAL_CONFLICT", "AUTHORITY_TIER_CONFLICT", "ORIGIN_GROUP_CONFLICT", "SOURCE_CONFLICT", "STALE_EVIDENCE", "INDEPENDENT_CORROBORATION_UNSUPPORTED", "ACQUISITION_DISABLED", "DUPLICATE_CANDIDATE"] as const);
export type ReviewBlockerCode = typeof REVIEW_BLOCKER_CODES[number];

const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const stable = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(stable).join(",")}]` : `{${Object.keys(value).sort(cmp).map(k => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(",")}}`;
const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const OBJECT_INTRINSICS = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);
const CONTRACT_MATERIAL = Object.freeze({
  contractVersion: EVIDENCE_REVIEW_QUEUE_VERSION,
  itemTypes: REVIEW_ITEM_TYPES,
  statuses: REVIEW_QUEUE_STATUSES,
  priorityOrder: REVIEW_PRIORITIES,
  blockerCodes: REVIEW_BLOCKER_CODES,
  routingMappings: Object.freeze([
    "RETRACTION_REVIEW=RETRACTED_OR_RETRACTION_HINT;PRECEDENCE=1",
    "CORRECTION_LINEAGE_REVIEW=UNRESOLVED_CORRECTION;PRECEDENCE=2",
    "SOURCE_CONFLICT_REVIEW=ANY_CONFLICT;CONFLICT_CODES=ISSUER_IDENTITY_CONFLICT,LISTING_JURISDICTION_CONFLICT,ASSET_REPRESENTATION_CONFLICT,AMOUNT_CURRENCY_CONFLICT,LIFECYCLE_CONFLICT,PUBLICATION_TIME_CONFLICT,CORRECTION_LINEAGE_CONFLICT,SOURCE_MATERIAL_CONFLICT,AUTHORITY_TIER_CONFLICT,ORIGIN_GROUP_CONFLICT;PRECEDENCE=3",
    "RIGHTS_APPROVAL_REVIEW=RIGHTS_MISSING;PRECEDENCE=4",
    "JURISDICTION_REVIEW=UNKNOWN_OR_DUAL_LISTED;PRECEDENCE=5",
    "ISSUER_MAPPING_REVIEW=ISSUER_MAPPING_MISSING;PRECEDENCE=6",
    "ASSET_MAPPING_REVIEW=ASSET_MAPPING_MISSING;PRECEDENCE=7",
    "PRIMARY_SOURCE_RETRIEVAL_REVIEW=SOURCE_OR_DISCLOSURE_RETRIEVAL_REQUIRED;PRECEDENCE=8",
    "BLOCKED_UNSUPPORTED_CORROBORATION=CORROBORATION_OR_ELIGIBILITY_STAGE_WITH_UNSUPPORTED_CORROBORATION;PRECEDENCE=9",
    "DUPLICATE_NO_ACTION=DUPLICATE_WITHOUT_HIGHER_PRECEDENCE_BLOCKER;PRECEDENCE=10",
    "NON_AUTHORITATIVE_REVIEW_COMPLETE=NON_AUTHORITATIVE_TERMINAL;PRECEDENCE=12",
    "ROUTINE_REVIEW=OTHER_NONTERMINAL_LIFECYCLE;PRECEDENCE=11",
    "CORRECTION_LINEAGE_REVIEW=CORRECTION_PRESENT_OR_REVIEW_STAGE",
    "ORIGIN_GROUP_REVIEW=MULTIPLE_BOUND_ORIGINS_OR_SYNDICATED_COPY",
    "LIFECYCLE_REVIEW=OTHER_ROUTING_LIFECYCLE",
    "CALLER_CANNOT_SELECT_ITEM_TYPE_STATUS_OR_PRIORITY",
  ]),
  blockerMappings: Object.freeze([
    "ISSUER_MAPPING_MISSING|RESOLVE_ISSUER_MAPPING|ISSUER_NOT_CONFIRMED",
    "ASSET_MAPPING_MISSING|RESOLVE_ASSET_MAPPING|ASSET_NOT_CONFIRMED",
    "JURISDICTION_SCOPE_UNRESOLVED|RESOLVE_JURISDICTION_SCOPE|ISSUER_NOT_CONFIRMED",
    "PRIMARY_SOURCE_MISSING|RETRIEVE_PRIMARY_SOURCE|PURCHASE_NOT_CONFIRMED_COMPLETE",
    "CORRECTION_LINEAGE_UNRESOLVED|REVIEW_CORRECTION_LINEAGE|PURCHASE_NOT_CONFIRMED_COMPLETE",
    "RETRACTION_PRESENT|REVIEW_RETRACTION|NO_EVENT_AUTHORITY",
    "RIGHTS_APPROVAL_MISSING|OBTAIN_RIGHTS_APPROVAL|NO_EVENT_AUTHORITY",
    "SOURCE_QUALIFICATION_INCOMPLETE|RETRIEVE_PRIMARY_SOURCE|NO_EVENT_AUTHORITY",
    "CREDENTIAL_MISSING|RETRIEVE_PRIMARY_SOURCE|NO_EVENT_AUTHORITY",
    "ISSUER_IDENTITY_CONFLICT|REVIEW_SOURCE_CONFLICT|ISSUER_NOT_CONFIRMED",
    "LISTING_JURISDICTION_CONFLICT|RESOLVE_JURISDICTION_SCOPE|ISSUER_NOT_CONFIRMED",
    "ASSET_REPRESENTATION_CONFLICT|REVIEW_SOURCE_CONFLICT|ASSET_NOT_CONFIRMED",
    "AMOUNT_CURRENCY_CONFLICT|REVIEW_SOURCE_CONFLICT|PURCHASE_NOT_CONFIRMED_COMPLETE",
    "LIFECYCLE_CONFLICT|REVIEW_LIFECYCLE|PURCHASE_NOT_CONFIRMED_COMPLETE",
    "PUBLICATION_TIME_CONFLICT|REVIEW_SOURCE_CONFLICT|PURCHASE_NOT_CONFIRMED_COMPLETE",
    "CORRECTION_LINEAGE_CONFLICT|REVIEW_CORRECTION_LINEAGE|PURCHASE_NOT_CONFIRMED_COMPLETE",
    "SOURCE_MATERIAL_CONFLICT|REVIEW_SOURCE_CONFLICT|PURCHASE_NOT_CONFIRMED_COMPLETE",
    "AUTHORITY_TIER_CONFLICT|REVIEW_SOURCE_CONFLICT|NO_EVENT_AUTHORITY",
    "ORIGIN_GROUP_CONFLICT|REVIEW_ORIGIN_BINDING|NO_INDEPENDENT_FACTUAL_VERIFICATION",
    "SOURCE_CONFLICT|REVIEW_SOURCE_CONFLICT|PURCHASE_NOT_CONFIRMED_COMPLETE",
    "STALE_EVIDENCE|RETRIEVE_PRIMARY_SOURCE|PURCHASE_NOT_CONFIRMED_COMPLETE",
    "INDEPENDENT_CORROBORATION_UNSUPPORTED|STOP_UNSUPPORTED_CORROBORATION|NO_INDEPENDENT_FACTUAL_VERIFICATION",
    "ACQUISITION_DISABLED|RETAIN_NON_AUTHORITATIVE_SNAPSHOT|NO_EVENT_AUTHORITY",
    "DUPLICATE_CANDIDATE|NO_ACTION_DUPLICATE|NO_SIGNAL",
  ]),
  conflictActionOrder: Object.freeze(["CORRECTION_LINEAGE_CONFLICT=REVIEW_CORRECTION_LINEAGE", "ISSUER_IDENTITY_CONFLICT=REVIEW_SOURCE_CONFLICT", "LISTING_JURISDICTION_CONFLICT=RESOLVE_JURISDICTION_SCOPE", "ASSET_REPRESENTATION_CONFLICT=REVIEW_SOURCE_CONFLICT", "AMOUNT_CURRENCY_CONFLICT=REVIEW_SOURCE_CONFLICT", "LIFECYCLE_CONFLICT=REVIEW_LIFECYCLE", "PUBLICATION_TIME_CONFLICT=REVIEW_SOURCE_CONFLICT", "SOURCE_MATERIAL_CONFLICT=REVIEW_SOURCE_CONFLICT", "AUTHORITY_TIER_CONFLICT=REVIEW_SOURCE_CONFLICT", "ORIGIN_GROUP_CONFLICT=REVIEW_ORIGIN_BINDING"]),
  priorityMapping: Object.freeze(["URGENT_RETRACTION_REVIEW", "URGENT_CORRECTION_REVIEW", "CONFLICT_REVIEW", "BLOCKED_RIGHTS", "JURISDICTION_UNKNOWN", "MAPPING_REQUIRED", "PRIMARY_SOURCE_MISSING", "ROUTINE_DISCOVERY_REVIEW", "NO_ACTION_DUPLICATE"]),
  nextActions: Object.freeze(["RETRIEVE_PRIMARY_SOURCE", "RESOLVE_ISSUER_MAPPING", "RESOLVE_ASSET_MAPPING", "REVIEW_CORRECTION_LINEAGE", "REVIEW_RETRACTION", "REVIEW_SOURCE_CONFLICT", "REVIEW_ORIGIN_BINDING", "OBTAIN_RIGHTS_APPROVAL", "RESOLVE_JURISDICTION_SCOPE", "REVIEW_LIFECYCLE", "NO_ACTION_DUPLICATE", "STOP_UNSUPPORTED_CORROBORATION", "RETAIN_NON_AUTHORITATIVE_SNAPSHOT"]),
  forbiddenConclusions: Object.freeze(["ISSUER_NOT_CONFIRMED", "ASSET_NOT_CONFIRMED", "AMOUNT_NOT_VERIFIED", "PURCHASE_NOT_CONFIRMED_COMPLETE", "ISSUER_DISCLOSURE_NOT_FACTUAL_VERIFICATION", "NO_INDEPENDENT_FACTUAL_VERIFICATION", "NOT_RECOMMENDATION", "NOT_CONFIDENCE_PROBABILITY", "NO_EVENT_AUTHORITY", "NO_SIGNAL", "NOT_TRADING_ELIGIBILITY", "NO_TRADE_DECISION"]),
  historicalPolicy: "PUBLICATION_DISCOVERY_RECEIPT_EVALUATION_ORDERED_SINGLE_CUTOFF_NO_FUTURE_EVIDENCE",
  correctionPolicy: "APPEND_ONLY_HINTS_LINEAGE_REQUIRES_SEPARATE_AUTHORITY_RETRACTION_NEVER_ACTIVE",
  identityPolicy: "CANONICAL_MATERIAL_PLUS_ROUTING_RESULT_CUTOFF_AND_CONTEXT",
  sortPolicy: "PRIORITY_ORDER_THEN_PUBLICATION_ASC_THEN_ITEM_ID_ASC_LEXICAL",
  queueSetPolicy: "SINGLE_CUTOFF_UNIQUE_MEMBERS_CONTIGUOUS_ORDINALS_CANONICAL_ORDER",
  viewModelPolicy: "DEFERRED_NO_PUBLIC_KEY_WITHOUT_IDENTITY_DISCLOSURE",
  approvals: Object.freeze(["NOT_APPROVED_ACQUISITION", "NOT_APPROVED_PROCESSING", "NOT_APPROVED_STORAGE", "NOT_APPROVED_RETENTION", "NOT_APPROVED_REDISTRIBUTION", "NOT_APPROVED_COMMERCIAL_USE", "NOT_APPROVED_PERSISTENCE"]),
  productionBlockers: Object.freeze(["QUEUE_PROJECTION_BLOCKED", "QUEUE_PERSISTENCE_BLOCKED", "QUEUE_SCHEDULER_BLOCKED", "NOTIFICATIONS_BLOCKED", "REVIEWER_ASSIGNMENT_BLOCKED", "EVENT_AUTHORITY_BLOCKED", "SIGNAL_BLOCKED", "TRADING_BLOCKED"]),
});
export type EvidenceReviewQueueContract = Readonly<typeof CONTRACT_MATERIAL & { fingerprint: string; recordedAt: string }>;
function freeze<T>(value: T): T { if (value && typeof value === "object") { for (const child of Object.values(value as Record<string, unknown>)) freeze(child); Object.freeze(value); } return value; }
const trustedContract = freeze({ ...CONTRACT_MATERIAL, fingerprint: digest(stable(CONTRACT_MATERIAL)), recordedAt: "2026-10-03T00:00:00.000Z" }) as EvidenceReviewQueueContract;
const trustedContracts = new WeakSet<object>([trustedContract]);
export function getEvidenceReviewQueueContract(): EvidenceReviewQueueContract { return trustedContract; }
export function isAuthenticEvidenceReviewQueueContract(value: unknown): value is EvidenceReviewQueueContract { return !!value && typeof value === "object" && trustedContracts.has(value); }

function safePlainSnapshot(value: unknown, depth = 0): unknown {
  if (depth > 12) throw new Error("INVALID");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") { if (value.length > 4096) throw new Error("INVALID"); return value; }
  if (typeof value === "number") { if (!Number.isSafeInteger(value)) throw new Error("INVALID"); return value; }
  if (typeof value !== "object" || types.isProxy(value)) throw new Error("INVALID");
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error("INVALID");
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > 512 || Reflect.ownKeys(value).length !== length + 1) throw new Error("INVALID");
    const result: unknown[] = [];
    for (let i = 0; i < length; i++) { const descriptor = Object.getOwnPropertyDescriptor(value, String(i)); if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("INVALID"); result.push(safePlainSnapshot(descriptor.value, depth + 1)); }
    return result;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(Object.prototype).some(k => typeof k !== "string" || !OBJECT_INTRINSICS.has(k))) throw new Error("INVALID");
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) { if (typeof key !== "string" || key.length > 128) throw new Error("INVALID"); const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("INVALID"); result[key] = safePlainSnapshot(descriptor.value, depth + 1); }
  return result;
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const snapshot = safePlainSnapshot(value);
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("INVALID");
  const record = snapshot as Record<string, unknown>;
  const own = Object.keys(record);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) throw new Error("INVALID");
  return record;
}
export type QueueContractParse = Readonly<{ status: "VALID"; contract: EvidenceReviewQueueContract }> | Readonly<{ status: "INVALID"; code: "EVIDENCE_REVIEW_QUEUE_CONTRACT_INVALID" }>;
const INVALID_CONTRACT = Object.freeze({ status: "INVALID", code: "EVIDENCE_REVIEW_QUEUE_CONTRACT_INVALID" }) as QueueContractParse;
/** Validates shape/material without minting the module-local contract trust. */
export function parseEvidenceReviewQueueContract(input: unknown): QueueContractParse {
  try {
    const value = exact(input, [...Object.keys(CONTRACT_MATERIAL), "fingerprint", "recordedAt"]);
    const material: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(CONTRACT_MATERIAL)) material[key] = value[key];
    if (value.contractVersion !== EVIDENCE_REVIEW_QUEUE_VERSION || value.fingerprint !== digest(stable(material)) || stable(material) !== stable(CONTRACT_MATERIAL) || typeof value.recordedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.recordedAt) || new Date(value.recordedAt).toISOString() !== value.recordedAt) return INVALID_CONTRACT;
    return Object.freeze({ status: "VALID", contract: trustedContract });
  } catch { return INVALID_CONTRACT; }
}

export type ReviewBlocker = Readonly<{ code: ReviewBlockerCode; label: string; nextAction: string; allowedSourceFamilies: readonly SourceFamily[] | null; forbiddenConclusion: string }>;
export type EvidenceReviewItem = Readonly<{
  contractVersion: typeof EVIDENCE_REVIEW_QUEUE_VERSION; itemId: string; itemType: ReviewItemType; status: ReviewQueueStatus; priority: ReviewPriority;
  candidateId: string; routingDecisionId: string; routingDecisionFingerprint: string; routingResultId: string; routingState: RoutingEvaluation["currentState"]; nextRoutingState: RoutingEvaluation["nextState"]; stageHistory: readonly RoutingEvaluation["currentState"][];
  evaluationAsOf: string; publicationAt: string; discoveredAt: string; receivedAt: string; correctionAvailableAt: string | null; jurisdiction: string; listingScopes: readonly string[]; eventHint: string;
  issuerMappingPresent: boolean; assetMappingPresent: boolean; primarySourcePresent: boolean; correctionPresent: boolean; correctionResolved: boolean; correctionFieldHints: RoutingEvaluation["correctionFieldHints"]; retracted: boolean;
  sourceFamilies: readonly SourceFamily[]; sourceStrength: string; originGroupCount: number; syndicatedCopyCount: number;
  blockerReasons: readonly ReviewBlocker[]; conflictReasons: readonly string[]; degradationReasons: readonly string[]; forbiddenConclusions: readonly string[]; requiredNextAction: string;
  authorityIssued: false; persistenceAllowed: false; signalEligible: false; tradingEligible: false;
}>;
const ITEM_TRUST = new WeakSet<object>();
const ITEM_CANONICAL = new WeakMap<object, string>();
const SET_TRUST = new WeakSet<object>();
const SET_CANONICAL = new WeakMap<object, string>();
export function isAuthenticEvidenceReviewItem(value: unknown): value is EvidenceReviewItem { return !!value && typeof value === "object" && ITEM_TRUST.has(value); }

const BLOCKER_DETAILS: Readonly<Record<ReviewBlockerCode, Omit<ReviewBlocker, "code">>> = Object.freeze({
  ISSUER_MAPPING_MISSING: { label: "Issuer identity mapping is missing", nextAction: "RESOLVE_ISSUER_MAPPING", allowedSourceFamilies: null, forbiddenConclusion: "ISSUER_NOT_CONFIRMED" },
  ASSET_MAPPING_MISSING: { label: "Asset representation mapping is missing", nextAction: "RESOLVE_ASSET_MAPPING", allowedSourceFamilies: null, forbiddenConclusion: "ASSET_NOT_CONFIRMED" },
  JURISDICTION_SCOPE_UNRESOLVED: { label: "Jurisdiction or listing scope is unresolved", nextAction: "RESOLVE_JURISDICTION_SCOPE", allowedSourceFamilies: null, forbiddenConclusion: "ISSUER_NOT_CONFIRMED" },
  PRIMARY_SOURCE_MISSING: { label: "A qualified primary source is unavailable", nextAction: "RETRIEVE_PRIMARY_SOURCE", allowedSourceFamilies: Object.freeze(["FILING_AUTHORITY", "REGULATORY_OR_EXCHANGE_DISCLOSURE", "ISSUER_ATTRIBUTED_RELEASE"] as const), forbiddenConclusion: "PURCHASE_NOT_CONFIRMED_COMPLETE" },
  CORRECTION_LINEAGE_UNRESOLVED: { label: "Correction lineage requires review", nextAction: "REVIEW_CORRECTION_LINEAGE", allowedSourceFamilies: null, forbiddenConclusion: "PURCHASE_NOT_CONFIRMED_COMPLETE" },
  RETRACTION_PRESENT: { label: "Source material indicates retraction or withdrawal", nextAction: "REVIEW_RETRACTION", allowedSourceFamilies: null, forbiddenConclusion: "NO_EVENT_AUTHORITY" },
  RIGHTS_APPROVAL_MISSING: { label: "Required source-use approval is missing", nextAction: "OBTAIN_RIGHTS_APPROVAL", allowedSourceFamilies: null, forbiddenConclusion: "NO_EVENT_AUTHORITY" },
  SOURCE_QUALIFICATION_INCOMPLETE: { label: "Source qualification is incomplete", nextAction: "RETRIEVE_PRIMARY_SOURCE", allowedSourceFamilies: null, forbiddenConclusion: "NO_EVENT_AUTHORITY" },
  CREDENTIAL_MISSING: { label: "A required credential is unavailable", nextAction: "RETRIEVE_PRIMARY_SOURCE", allowedSourceFamilies: null, forbiddenConclusion: "NO_EVENT_AUTHORITY" },
  ISSUER_IDENTITY_CONFLICT: { label: "Issuer identity evidence conflicts", nextAction: "REVIEW_SOURCE_CONFLICT", allowedSourceFamilies: null, forbiddenConclusion: "ISSUER_NOT_CONFIRMED" },
  LISTING_JURISDICTION_CONFLICT: { label: "Listing or jurisdiction evidence conflicts", nextAction: "RESOLVE_JURISDICTION_SCOPE", allowedSourceFamilies: null, forbiddenConclusion: "ISSUER_NOT_CONFIRMED" },
  ASSET_REPRESENTATION_CONFLICT: { label: "Asset representation evidence conflicts", nextAction: "REVIEW_SOURCE_CONFLICT", allowedSourceFamilies: null, forbiddenConclusion: "ASSET_NOT_CONFIRMED" },
  AMOUNT_CURRENCY_CONFLICT: { label: "Amount or currency evidence conflicts", nextAction: "REVIEW_SOURCE_CONFLICT", allowedSourceFamilies: null, forbiddenConclusion: "PURCHASE_NOT_CONFIRMED_COMPLETE" },
  LIFECYCLE_CONFLICT: { label: "Event lifecycle evidence conflicts", nextAction: "REVIEW_LIFECYCLE", allowedSourceFamilies: null, forbiddenConclusion: "PURCHASE_NOT_CONFIRMED_COMPLETE" },
  PUBLICATION_TIME_CONFLICT: { label: "Publication-time evidence conflicts", nextAction: "REVIEW_SOURCE_CONFLICT", allowedSourceFamilies: null, forbiddenConclusion: "PURCHASE_NOT_CONFIRMED_COMPLETE" },
  CORRECTION_LINEAGE_CONFLICT: { label: "Correction lineage evidence conflicts", nextAction: "REVIEW_CORRECTION_LINEAGE", allowedSourceFamilies: null, forbiddenConclusion: "PURCHASE_NOT_CONFIRMED_COMPLETE" },
  SOURCE_MATERIAL_CONFLICT: { label: "Source material conflicts", nextAction: "REVIEW_SOURCE_CONFLICT", allowedSourceFamilies: null, forbiddenConclusion: "PURCHASE_NOT_CONFIRMED_COMPLETE" },
  AUTHORITY_TIER_CONFLICT: { label: "Source authority tier conflicts", nextAction: "REVIEW_SOURCE_CONFLICT", allowedSourceFamilies: null, forbiddenConclusion: "NO_EVENT_AUTHORITY" },
  ORIGIN_GROUP_CONFLICT: { label: "Origin-group evidence conflicts", nextAction: "REVIEW_ORIGIN_BINDING", allowedSourceFamilies: null, forbiddenConclusion: "NO_INDEPENDENT_FACTUAL_VERIFICATION" },
  SOURCE_CONFLICT: { label: "Source material contains unresolved conflicts", nextAction: "REVIEW_SOURCE_CONFLICT", allowedSourceFamilies: null, forbiddenConclusion: "PURCHASE_NOT_CONFIRMED_COMPLETE" },
  STALE_EVIDENCE: { label: "Evidence may be stale", nextAction: "RETRIEVE_PRIMARY_SOURCE", allowedSourceFamilies: null, forbiddenConclusion: "PURCHASE_NOT_CONFIRMED_COMPLETE" },
  INDEPENDENT_CORROBORATION_UNSUPPORTED: { label: "Independent factual corroboration is unsupported", nextAction: "STOP_UNSUPPORTED_CORROBORATION", allowedSourceFamilies: null, forbiddenConclusion: "NO_INDEPENDENT_FACTUAL_VERIFICATION" },
  ACQUISITION_DISABLED: { label: "Source acquisition is disabled", nextAction: "RETAIN_NON_AUTHORITATIVE_SNAPSHOT", allowedSourceFamilies: null, forbiddenConclusion: "NO_EVENT_AUTHORITY" },
  DUPLICATE_CANDIDATE: { label: "Candidate is an identical duplicate", nextAction: "NO_ACTION_DUPLICATE", allowedSourceFamilies: null, forbiddenConclusion: "NO_SIGNAL" },
});
function makeBlocker(code: ReviewBlockerCode): ReviewBlocker { return Object.freeze({ code, ...BLOCKER_DETAILS[code] }); }
function blockersFor(result: RoutingEvaluation): ReviewBlocker[] {
  const codes = new Set<ReviewBlockerCode>();
  if (!result.issuerMapped) codes.add("ISSUER_MAPPING_MISSING");
  if (!result.assetMapped) codes.add("ASSET_MAPPING_MISSING");
  if (result.jurisdiction === "UNKNOWN" || result.jurisdiction === "DUAL_LISTED") codes.add("JURISDICTION_SCOPE_UNRESOLVED");
  if (!result.primaryAvailable) codes.add("PRIMARY_SOURCE_MISSING");
  if (result.correctionPresent && !result.correctionResolved) codes.add("CORRECTION_LINEAGE_UNRESOLVED");
  if (result.retracted) codes.add("RETRACTION_PRESENT");
  if (!result.rightsApproved) codes.add("RIGHTS_APPROVAL_MISSING");
  if (result.degradationReasons.includes("SOURCE_QUALIFICATION_INCOMPLETE")) codes.add("SOURCE_QUALIFICATION_INCOMPLETE");
  if (result.degradationReasons.includes("CREDENTIAL_MISSING")) codes.add("CREDENTIAL_MISSING");
  for (const reason of result.conflictReasons) codes.add(reason as ReviewBlockerCode);
  if (!result.conflictReasons.length && result.degradationReasons.includes("CONFLICTING_MATERIAL")) codes.add("SOURCE_CONFLICT");
  if (result.degradationReasons.includes("STALE_MATERIAL")) codes.add("STALE_EVIDENCE");
  if (result.degradationReasons.includes("INDEPENDENT_CORROBORATION_UNAVAILABLE") || ((result.currentState === "CORROBORATION_REVIEW_REQUIRED" || result.currentState === "ELIGIBILITY_REVIEW_REQUIRED") && result.independentFactualCorroboration === "UNSUPPORTED")) codes.add("INDEPENDENT_CORROBORATION_UNSUPPORTED");
  if (result.degradationReasons.includes("ACQUISITION_DISABLED")) codes.add("ACQUISITION_DISABLED");
  if (result.duplicate) codes.add("DUPLICATE_CANDIDATE");
  return [...codes].sort(cmp).map(code => makeBlocker(code));
}
function mappedPriority(result: RoutingEvaluation): ReviewPriority {
  if (result.retracted) return "URGENT_RETRACTION_REVIEW";
  if (result.operationalPriority === "URGENT_CORRECTION_REVIEW") return "URGENT_CORRECTION_REVIEW";
  if (result.conflictReasons.length) return "CONFLICT_REVIEW";
  if (result.operationalPriority === "BLOCKED_RIGHTS") return "BLOCKED_RIGHTS";
  if (result.jurisdiction === "UNKNOWN" || result.jurisdiction === "DUAL_LISTED") return "JURISDICTION_UNKNOWN";
  if (!result.issuerMapped || !result.assetMapped) return "MAPPING_REQUIRED";
  if (!result.primaryAvailable || !result.seenFamilies.some(f => f !== "DISCOVERY_AGGREGATOR") || result.operationalPriority === "PRIMARY_SOURCE_MISSING") return "PRIMARY_SOURCE_MISSING";
  if (result.operationalPriority === "NO_ACTION_DUPLICATE") return "NO_ACTION_DUPLICATE";
  return "ROUTINE_DISCOVERY_REVIEW";
}
function conflictAction(result: RoutingEvaluation, precedence: readonly string[] = ["CORRECTION_LINEAGE_CONFLICT", "ISSUER_IDENTITY_CONFLICT", "LISTING_JURISDICTION_CONFLICT", "ASSET_REPRESENTATION_CONFLICT", "LIFECYCLE_CONFLICT", "AMOUNT_CURRENCY_CONFLICT", "PUBLICATION_TIME_CONFLICT", "SOURCE_MATERIAL_CONFLICT", "AUTHORITY_TIER_CONFLICT", "ORIGIN_GROUP_CONFLICT"]): string {
  const actions: Readonly<Record<string, string>> = Object.freeze({ CORRECTION_LINEAGE_CONFLICT: "REVIEW_CORRECTION_LINEAGE", ISSUER_IDENTITY_CONFLICT: "REVIEW_SOURCE_CONFLICT", LISTING_JURISDICTION_CONFLICT: "RESOLVE_JURISDICTION_SCOPE", ASSET_REPRESENTATION_CONFLICT: "REVIEW_SOURCE_CONFLICT", AMOUNT_CURRENCY_CONFLICT: "REVIEW_SOURCE_CONFLICT", LIFECYCLE_CONFLICT: "REVIEW_LIFECYCLE", PUBLICATION_TIME_CONFLICT: "REVIEW_SOURCE_CONFLICT", SOURCE_MATERIAL_CONFLICT: "REVIEW_SOURCE_CONFLICT", AUTHORITY_TIER_CONFLICT: "REVIEW_SOURCE_CONFLICT", ORIGIN_GROUP_CONFLICT: "REVIEW_ORIGIN_BINDING" });
  const selected = precedence.find(code => result.conflictReasons.includes(code));
  return (selected && actions[selected]) || "REVIEW_SOURCE_CONFLICT";
}
type Classification = { itemType: ReviewItemType; status: ReviewQueueStatus; priority: ReviewPriority; nextAction: string };
function classify(result: RoutingEvaluation, selectConflictAction = conflictAction): Classification {
  if (result.retracted || result.eventHint === "RETRACTION_WITHDRAWAL") return { itemType: "RETRACTION_REVIEW", status: "RETRACTED", priority: "URGENT_RETRACTION_REVIEW", nextAction: "REVIEW_RETRACTION" };
  if (result.correctionPresent && !result.correctionResolved || result.eventHint === "CORRECTION_AMENDMENT" && !result.correctionResolved || result.conflictReasons.includes("CORRECTION_LINEAGE_CONFLICT")) return { itemType: "CORRECTION_LINEAGE_REVIEW", status: "BLOCKED", priority: "URGENT_CORRECTION_REVIEW", nextAction: "REVIEW_CORRECTION_LINEAGE" };
  if (result.conflictReasons.length) return { itemType: "SOURCE_CONFLICT_REVIEW", status: "BLOCKED", priority: "CONFLICT_REVIEW", nextAction: selectConflictAction(result) };
  if (!result.rightsApproved) return { itemType: "RIGHTS_APPROVAL_REVIEW", status: "BLOCKED", priority: "BLOCKED_RIGHTS", nextAction: "OBTAIN_RIGHTS_APPROVAL" };
  if (result.jurisdiction === "UNKNOWN" || result.jurisdiction === "DUAL_LISTED") return { itemType: "JURISDICTION_REVIEW", status: "BLOCKED", priority: "JURISDICTION_UNKNOWN", nextAction: "RESOLVE_JURISDICTION_SCOPE" };
  if (!result.issuerMapped) return { itemType: "ISSUER_MAPPING_REVIEW", status: "OPEN", priority: "MAPPING_REQUIRED", nextAction: "RESOLVE_ISSUER_MAPPING" };
  if (!result.assetMapped) return { itemType: "ASSET_MAPPING_REVIEW", status: "OPEN", priority: "MAPPING_REQUIRED", nextAction: "RESOLVE_ASSET_MAPPING" };
  if (!result.primaryAvailable || !result.seenFamilies.some(f => f !== "DISCOVERY_AGGREGATOR")) return { itemType: "PRIMARY_SOURCE_RETRIEVAL_REVIEW", status: result.nextState === "STOPPED_BLOCKED" || result.degradationReasons.includes("CREDENTIAL_MISSING") || result.degradationReasons.includes("SOURCE_QUALIFICATION_INCOMPLETE") ? "BLOCKED" : "OPEN", priority: "PRIMARY_SOURCE_MISSING", nextAction: "RETRIEVE_PRIMARY_SOURCE" };
  if (result.publicationOriginGroupCount > 1 || result.syndicatedCopyCount > 0) return { itemType: "ORIGIN_GROUP_REVIEW", status: result.degradationReasons.includes("INDEPENDENT_CORROBORATION_UNAVAILABLE") ? "BLOCKED" : "OPEN", priority: mappedPriority(result), nextAction: "REVIEW_ORIGIN_BINDING" };
  if ((result.currentState === "CORROBORATION_REVIEW_REQUIRED" || result.currentState === "ELIGIBILITY_REVIEW_REQUIRED") && result.independentFactualCorroboration === "UNSUPPORTED" && result.nextState !== "NON_AUTHORITATIVE_REVIEW_COMPLETE") return { itemType: "BLOCKED_UNSUPPORTED_CORROBORATION", status: "BLOCKED", priority: "ROUTINE_DISCOVERY_REVIEW", nextAction: "STOP_UNSUPPORTED_CORROBORATION" };
  if (result.duplicate && !result.correctionPresent) return { itemType: "DUPLICATE_NO_ACTION", status: "NO_ACTION", priority: "NO_ACTION_DUPLICATE", nextAction: "NO_ACTION_DUPLICATE" };
  if (result.currentState === "NON_AUTHORITATIVE_REVIEW_COMPLETE" || result.nextState === "NON_AUTHORITATIVE_REVIEW_COMPLETE") return { itemType: "NON_AUTHORITATIVE_REVIEW_COMPLETE", status: result.degradationReasons.includes("INDEPENDENT_CORROBORATION_UNAVAILABLE") ? "BLOCKED" : "RESOLVED_NON_AUTHORITATIVE", priority: "ROUTINE_DISCOVERY_REVIEW", nextAction: "RETAIN_NON_AUTHORITATIVE_SNAPSHOT" };
  if (result.currentState === "ISSUER_MAPPING_REQUIRED") return { itemType: "ISSUER_MAPPING_REVIEW", status: "OPEN", priority: "MAPPING_REQUIRED", nextAction: "RESOLVE_ISSUER_MAPPING" };
  if (result.currentState === "ASSET_MAPPING_REQUIRED") return { itemType: "ASSET_MAPPING_REVIEW", status: "OPEN", priority: "MAPPING_REQUIRED", nextAction: "RESOLVE_ASSET_MAPPING" };
  if (result.currentState === "DISCOVERED" || result.currentState === "SOURCE_RETRIEVAL_REQUIRED" || result.currentState === "PRIMARY_DISCLOSURE_REQUIRED") return { itemType: "PRIMARY_SOURCE_RETRIEVAL_REVIEW", status: result.nextState === "STOPPED_BLOCKED" || result.degradationReasons.includes("CREDENTIAL_MISSING") || result.degradationReasons.includes("SOURCE_QUALIFICATION_INCOMPLETE") ? "BLOCKED" : "OPEN", priority: mappedPriority(result), nextAction: "RETRIEVE_PRIMARY_SOURCE" };
  if (result.eventHint === "COMPLETED_PURCHASE" && result.nextState === "STOPPED_BLOCKED") return { itemType: "LIFECYCLE_REVIEW", status: "BLOCKED", priority: "PRIMARY_SOURCE_MISSING", nextAction: "RETRIEVE_PRIMARY_SOURCE" };
  if (result.currentState === "CORRECTION_REVIEW_REQUIRED" || result.correctionPresent) return { itemType: "CORRECTION_LINEAGE_REVIEW", status: result.correctionResolved ? "RESOLVED_NON_AUTHORITATIVE" : "OPEN", priority: "URGENT_CORRECTION_REVIEW", nextAction: "REVIEW_CORRECTION_LINEAGE" };
  if (result.currentState === "STOPPED_BLOCKED" || result.nextState === "STOPPED_BLOCKED") return { itemType: "LIFECYCLE_REVIEW", status: "BLOCKED", priority: "ROUTINE_DISCOVERY_REVIEW", nextAction: "RETAIN_NON_AUTHORITATIVE_SNAPSHOT" };
  return { itemType: "LIFECYCLE_REVIEW", status: "OPEN", priority: mappedPriority(result), nextAction: "REVIEW_LIFECYCLE" };
}
function itemMaterial(result: RoutingEvaluation, decision: SourcePortfolioDecision, classification: ReturnType<typeof classify>, blockers: readonly ReviewBlocker[]): Record<string, unknown> {
  return { contractVersion: EVIDENCE_REVIEW_QUEUE_VERSION, itemType: classification.itemType, status: classification.status, priority: classification.priority, candidateId: result.candidateId, routingDecisionId: decision.decisionId, routingDecisionFingerprint: decision.fingerprint, routingResultId: result.routingResultId, routingState: result.currentState, nextRoutingState: result.nextState, stageHistory: result.stageHistory, evaluationAsOf: result.evaluationAsOf, publicationAt: result.publicationAt, discoveredAt: result.discoveredAt, receivedAt: result.receivedAt, correctionAvailableAt: result.correctionAvailableAt, jurisdiction: result.jurisdiction, listingScopes: result.listingScopes, eventHint: result.eventHint, issuerMappingPresent: result.issuerMapped, assetMappingPresent: result.assetMapped, primarySourcePresent: result.seenFamilies.some(f => f !== "DISCOVERY_AGGREGATOR"), correctionPresent: result.correctionPresent, correctionResolved: result.correctionResolved, correctionFieldHints: result.correctionFieldHints, retracted: result.retracted, sourceFamilies: result.seenFamilies, sourceStrength: result.sourceStrength, originGroupCount: result.publicationOriginGroupCount, syndicatedCopyCount: result.syndicatedCopyCount, blockerReasons: blockers, conflictReasons: result.conflictReasons, degradationReasons: result.degradationReasons, forbiddenConclusions: CONTRACT_MATERIAL.forbiddenConclusions, requiredNextAction: classification.nextAction, authorityIssued: false, persistenceAllowed: false, signalEligible: false, tradingEligible: false };
}
export function projectRoutingResultToEvidenceReviewItem(decision: unknown, result: unknown): EvidenceReviewItem | null {
  if (!isAuthenticEvidenceReviewQueueContract(trustedContract) || !isAuthenticSourcePortfolioDecision(decision) || !isRoutingEvaluationForDecision(decision, result)) return null;
  const routing = result as RoutingEvaluation;
  if (routing.status !== "NON_AUTHORITATIVE_ROUTING_RESULT" || routing.authorityIssued || routing.persistenceAllowed || routing.signalEligible || routing.tradingEligible || routing.independentFactualOriginGroups !== 0 || routing.independentFactualCorroboration !== "UNSUPPORTED" || !routing.stageHistory.length || routing.stageHistory.at(-1) !== routing.nextState) return null;
  const classification = classify(routing); const blockers = blockersFor(routing); const material = itemMaterial(routing, decision, classification, blockers); const canonical = stable(material); const item = freeze({ ...material, itemId: `review_${digest(canonical)}` }) as EvidenceReviewItem;
  ITEM_TRUST.add(item); ITEM_CANONICAL.set(item, canonical); return item;
}

export type EvidenceReviewQueueSet = Readonly<{ contractVersion: typeof EVIDENCE_REVIEW_QUEUE_VERSION; decisionId: string; decisionFingerprint: string; evaluationAsOf: string; memberCount: number; ordering: typeof CONTRACT_MATERIAL.sortPolicy; setFingerprint: string; members: readonly Readonly<{ ordinal: number; item: EvidenceReviewItem }>[]; authorityIssued: false; persistenceAllowed: false }>;
const INVALID_SET = Object.freeze({ status: "INVALID", code: "EVIDENCE_REVIEW_QUEUE_SET_INVALID" as const });
export type QueueSetSealResult = Readonly<{ status: "SEALED"; queueSet: EvidenceReviewQueueSet }> | typeof INVALID_SET;
function compareItems(a: EvidenceReviewItem, b: EvidenceReviewItem): number { const pa = REVIEW_PRIORITIES.indexOf(a.priority); const pb = REVIEW_PRIORITIES.indexOf(b.priority); return pa - pb || cmp(a.publicationAt, b.publicationAt) || cmp(a.itemId, b.itemId); }
export function sortEvidenceReviewItems(items: readonly EvidenceReviewItem[]): readonly EvidenceReviewItem[] | null {
  try {
    if (!Array.isArray(items) || types.isProxy(items) || Object.getPrototypeOf(items) !== Array.prototype) return null;
    const length = Object.getOwnPropertyDescriptor(items, "length")?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > 512 || Reflect.ownKeys(items).length !== length + 1) return null;
    const copy: EvidenceReviewItem[] = [];
    for (let i = 0; i < length; i++) { const descriptor = Object.getOwnPropertyDescriptor(items, String(i)); if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || !isAuthenticEvidenceReviewItem(descriptor.value)) return null; copy.push(descriptor.value); }
    const byId = new Map<string, string>();
    for (const item of copy) { const canonical = ITEM_CANONICAL.get(item); if (!canonical) return null; const prior = byId.get(item.itemId); if (prior !== undefined) { if (prior !== canonical) return null; return null; } byId.set(item.itemId, canonical); }
    copy.sort(compareItems); return Object.freeze(copy);
  } catch { return null; }
}
export function sealEvidenceReviewQueueSet(decision: unknown, routingResults: unknown): QueueSetSealResult {
  try {
    if (!isAuthenticEvidenceReviewQueueContract(trustedContract) || !isAuthenticSourcePortfolioDecision(decision) || !Array.isArray(routingResults) || types.isProxy(routingResults) || Object.getPrototypeOf(routingResults) !== Array.prototype) return INVALID_SET;
    const length = Object.getOwnPropertyDescriptor(routingResults, "length")?.value;
    if (!Number.isSafeInteger(length) || length < 1 || length > 512 || Reflect.ownKeys(routingResults).length !== length + 1) return INVALID_SET;
    const results: RoutingEvaluation[] = [];
    for (let i = 0; i < length; i++) { const descriptor = Object.getOwnPropertyDescriptor(routingResults, String(i)); if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || !isAuthenticRoutingEvaluation(descriptor.value)) return INVALID_SET; results.push(descriptor.value); }
    const items = results.map(result => projectRoutingResultToEvidenceReviewItem(decision, result));
    if (items.some(item => item === null)) return INVALID_SET;
    const trustedItems = items as EvidenceReviewItem[];
    if (new Set(trustedItems.map(item => item.evaluationAsOf)).size !== 1) return INVALID_SET;
    if (new Set(trustedItems.map(item => item.candidateId)).size !== trustedItems.length) return INVALID_SET;
    const ordered = sortEvidenceReviewItems(trustedItems); if (!ordered) return INVALID_SET;
    const canonicalMembers = ordered.map((item, ordinal) => ({ ordinal, itemCanonical: ITEM_CANONICAL.get(item)! }));
    const canonicalSet = stable({ contractVersion: EVIDENCE_REVIEW_QUEUE_VERSION, decisionId: decision.decisionId, decisionFingerprint: decision.fingerprint, evaluationAsOf: ordered[0]!.evaluationAsOf, memberCount: ordered.length, ordering: CONTRACT_MATERIAL.sortPolicy, members: canonicalMembers });
    const members = freeze(ordered.map((item, ordinal) => Object.freeze({ ordinal, item })));
    const queueSet = freeze({ contractVersion: EVIDENCE_REVIEW_QUEUE_VERSION, decisionId: decision.decisionId, decisionFingerprint: decision.fingerprint, evaluationAsOf: ordered[0]!.evaluationAsOf, memberCount: members.length, ordering: CONTRACT_MATERIAL.sortPolicy, setFingerprint: digest(canonicalSet), members, authorityIssued: false as const, persistenceAllowed: false as const });
    SET_TRUST.add(queueSet); SET_CANONICAL.set(queueSet, canonicalSet);
    return Object.freeze({ status: "SEALED", queueSet });
  } catch { return INVALID_SET; }
}
export function isAuthenticEvidenceReviewQueueSet(value: unknown): value is EvidenceReviewQueueSet { return !!value && typeof value === "object" && !types.isProxy(value) && SET_TRUST.has(value) && typeof SET_CANONICAL.get(value) === "string"; }

/** Queue-v2 is an explicit, offline evaluator contract. It does not change the v1 API or production wiring. */
export const EVIDENCE_REVIEW_QUEUE_V2_VERSION = "event-intelligence-evidence-review-queue-contract/v2" as const;
const V2_CONTRACT_MATERIAL = Object.freeze({
  contractVersion: EVIDENCE_REVIEW_QUEUE_V2_VERSION,
  algorithmVersion: "event-intelligence-evidence-review-queue-classification-algorithm/v2" as const,
  requiredSourcePortfolioVersion: SOURCE_PORTFOLIO_DECISION_VERSION,
  itemTypes: REVIEW_ITEM_TYPES,
  statuses: REVIEW_QUEUE_STATUSES,
  priorityOrder: REVIEW_PRIORITIES,
  classifierOrder: Object.freeze([
    "RETRACTION_REVIEW=RETRACTED_OR_RETRACTION_HINT",
    "CORRECTION_LINEAGE_REVIEW=UNRESOLVED_CORRECTION_OR_CORRECTION_LINEAGE_CONFLICT",
    "SOURCE_CONFLICT_REVIEW=ANY_REMAINING_CONFLICT",
    "RIGHTS_APPROVAL_REVIEW=RIGHTS_MISSING",
    "JURISDICTION_REVIEW=UNKNOWN_OR_DUAL_LISTED",
    "ISSUER_MAPPING_REVIEW=ISSUER_MAPPING_MISSING",
    "ASSET_MAPPING_REVIEW=ASSET_MAPPING_MISSING",
    "PRIMARY_SOURCE_RETRIEVAL_REVIEW=PRIMARY_MISSING_OR_NO_NONAGGREGATOR_FAMILY",
    "ORIGIN_GROUP_REVIEW=MULTIPLE_ORIGIN_GROUPS_OR_SYNDICATED_COPY",
    "BLOCKED_UNSUPPORTED_CORROBORATION=CORROBORATION_OR_ELIGIBILITY_STAGE_WITH_UNSUPPORTED_CORROBORATION_AND_NOT_TERMINAL",
    "DUPLICATE_NO_ACTION=DUPLICATE_WITHOUT_CORRECTION",
    "NON_AUTHORITATIVE_REVIEW_COMPLETE=TERMINAL_CURRENT_OR_NEXT_STATE",
    "ISSUER_MAPPING_REVIEW=CURRENT_ISSUER_MAPPING_STAGE",
    "ASSET_MAPPING_REVIEW=CURRENT_ASSET_MAPPING_STAGE",
    "PRIMARY_SOURCE_RETRIEVAL_REVIEW=CURRENT_DISCOVERY_OR_SOURCE_RETRIEVAL_OR_PRIMARY_DISCLOSURE_STAGE",
    "LIFECYCLE_REVIEW=COMPLETED_PURCHASE_AND_STOPPED_NEXT_STATE",
    "CORRECTION_LINEAGE_REVIEW=CORRECTION_STAGE_OR_PRESENT_CORRECTION",
    "LIFECYCLE_REVIEW=CURRENT_OR_NEXT_STOPPED_STATE",
    "LIFECYCLE_REVIEW=DOCUMENTED_FALLBACK",
  ]),
  conflictActionOrder: Object.freeze([
    "CORRECTION_LINEAGE_CONFLICT=REVIEW_CORRECTION_LINEAGE",
    "ISSUER_IDENTITY_CONFLICT=REVIEW_SOURCE_CONFLICT",
    "LISTING_JURISDICTION_CONFLICT=RESOLVE_JURISDICTION_SCOPE",
    "ASSET_REPRESENTATION_CONFLICT=REVIEW_SOURCE_CONFLICT",
    "LIFECYCLE_CONFLICT=REVIEW_LIFECYCLE",
    "AMOUNT_CURRENCY_CONFLICT=REVIEW_SOURCE_CONFLICT",
    "PUBLICATION_TIME_CONFLICT=REVIEW_SOURCE_CONFLICT",
    "SOURCE_MATERIAL_CONFLICT=REVIEW_SOURCE_CONFLICT",
    "AUTHORITY_TIER_CONFLICT=REVIEW_SOURCE_CONFLICT",
    "ORIGIN_GROUP_CONFLICT=REVIEW_ORIGIN_BINDING",
  ]),
  blockerPolicy: "ALL_ROUTING_BLOCKERS_INDEPENDENT_OF_SINGLE_CLASSIFICATION",
  ordering: "PRIORITY_ORDER_THEN_PUBLICATION_ASC_THEN_CANDIDATE_ID_ASC_LEXICAL",
  historicalPolicy: "ROUTING_EVALUATION_CUTOFF_WITHOUT_FUTURE_EVIDENCE",
  boundaries: Object.freeze([
    "RETRACTION_HINT_AND_RETRACTED_FLAG_REMAIN_DISTINCT_INPUTS",
    "NO_CLAIM_RETRACTION_REVISION_SUPERSESSION_OR_SOURCE_WITHDRAWAL_AUTHORITY",
    "EVENT_ROUTE_REQUIRED_SEMANTICS_REMAIN_OPEN",
    "NO_COMPLETED_REVIEW_MILESTONE_OR_ISSUER_AUTHORIZATION",
    "CONFORMANCE_DOES_NOT_PROVE_FULL_CODE_EQUIVALENCE_OR_LATER_POLICY_APPLICATION",
    "NO_PRODUCTION_ACTIVATION_OR_PERSISTENCE",
  ]),
});
export type EvidenceReviewQueueV2Contract = typeof V2_CONTRACT_MATERIAL;
const V2_CONTRACT = freeze({ ...V2_CONTRACT_MATERIAL }) as EvidenceReviewQueueV2Contract;
const V2_CONTRACT_TRUST = new WeakSet<object>([V2_CONTRACT]);
export function getEvidenceReviewQueueV2Contract(): EvidenceReviewQueueV2Contract { return V2_CONTRACT; }
export function isAuthenticEvidenceReviewQueueV2Contract(value: unknown): value is EvidenceReviewQueueV2Contract { return !!value && typeof value === "object" && V2_CONTRACT_TRUST.has(value); }

export type EvidenceReviewQueueV2Member = Readonly<{
  contractVersion: typeof EVIDENCE_REVIEW_QUEUE_V2_VERSION;
  candidateId: string;
  routingResultId: string;
  currentState: RoutingEvaluation["currentState"];
  nextState: RoutingEvaluation["nextState"];
  evaluationAsOf: string;
  publicationAt: string;
  itemType: ReviewItemType;
  status: ReviewQueueStatus;
  priority: ReviewPriority;
  requiredNextAction: string;
  blockerCodes: readonly ReviewBlockerCode[];
}>;
export type EvidenceReviewQueueV2 = Readonly<{
  contractVersion: typeof EVIDENCE_REVIEW_QUEUE_V2_VERSION;
  decisionId: string;
  decisionFingerprint: string;
  evaluationAsOf: string;
  status: "HAS_REVIEW_ITEMS";
  memberCount: number;
  members: readonly EvidenceReviewQueueV2Member[];
  authorityIssued: false;
  persistenceAllowed: false;
}>;
const V2_MEMBER_TRUST = new WeakSet<object>();
const V2_QUEUE_TRUST = new WeakSet<object>();
const V2_CONFLICT_PRECEDENCE = Object.freeze(["CORRECTION_LINEAGE_CONFLICT", "ISSUER_IDENTITY_CONFLICT", "LISTING_JURISDICTION_CONFLICT", "ASSET_REPRESENTATION_CONFLICT", "LIFECYCLE_CONFLICT", "AMOUNT_CURRENCY_CONFLICT", "PUBLICATION_TIME_CONFLICT", "SOURCE_MATERIAL_CONFLICT", "AUTHORITY_TIER_CONFLICT", "ORIGIN_GROUP_CONFLICT"]);
function v2ConflictAction(result: RoutingEvaluation): string { return conflictAction(result, V2_CONFLICT_PRECEDENCE); }
function isDenseRoutingList(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!Number.isSafeInteger(length) || length < 1 || length > 512 || Reflect.ownKeys(value).length !== length + 1) return false;
  for (let i = 0; i < length; i++) { const descriptor = Object.getOwnPropertyDescriptor(value, String(i)); if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return false; }
  return true;
}
function compareV2Members(a: EvidenceReviewQueueV2Member, b: EvidenceReviewQueueV2Member): number {
  return REVIEW_PRIORITIES.indexOf(a.priority) - REVIEW_PRIORITIES.indexOf(b.priority) || cmp(a.publicationAt, b.publicationAt) || cmp(a.candidateId, b.candidateId);
}
/** Evaluates one authenticated decision's authentic routing results under the opt-in v2 contract. */
export function evaluateEvidenceReviewQueueV2(decision: unknown, routingResults: unknown): EvidenceReviewQueueV2 | null {
  try {
    if (!isAuthenticEvidenceReviewQueueV2Contract(V2_CONTRACT) || !isAuthenticSourcePortfolioDecision(decision) || !isDenseRoutingList(routingResults)) return null;
    const length = Object.getOwnPropertyDescriptor(routingResults, "length")!.value as number;
    const results: RoutingEvaluation[] = [];
    for (let i = 0; i < length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(routingResults, String(i));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || !isAuthenticRoutingEvaluation(descriptor.value) || !isRoutingEvaluationForDecision(decision, descriptor.value)) return null;
      const result = descriptor.value as RoutingEvaluation;
      if (result.status !== "NON_AUTHORITATIVE_ROUTING_RESULT" || result.authorityIssued || result.persistenceAllowed || result.signalEligible || result.tradingEligible || result.independentFactualOriginGroups !== 0 || result.independentFactualCorroboration !== "UNSUPPORTED" || !result.stageHistory.length || result.stageHistory.at(-1) !== result.nextState) return null;
      results.push(result);
    }
    if (new Set(results.map(result => result.evaluationAsOf)).size !== 1 || new Set(results.map(result => result.candidateId)).size !== results.length) return null;
    const members = results.map(result => {
      const classified = classify(result, v2ConflictAction);
      const member = freeze({ contractVersion: EVIDENCE_REVIEW_QUEUE_V2_VERSION, candidateId: result.candidateId, routingResultId: result.routingResultId, currentState: result.currentState, nextState: result.nextState, evaluationAsOf: result.evaluationAsOf, publicationAt: result.publicationAt, itemType: classified.itemType, status: classified.status, priority: classified.priority, requiredNextAction: classified.nextAction, blockerCodes: Object.freeze(blockersFor(result).map(blocker => blocker.code)) }) as EvidenceReviewQueueV2Member;
      V2_MEMBER_TRUST.add(member);
      return member;
    }).sort(compareV2Members);
    const queue = freeze({ contractVersion: EVIDENCE_REVIEW_QUEUE_V2_VERSION, decisionId: decision.decisionId, decisionFingerprint: decision.fingerprint, evaluationAsOf: results[0]!.evaluationAsOf, status: "HAS_REVIEW_ITEMS" as const, memberCount: members.length, members: Object.freeze(members), authorityIssued: false as const, persistenceAllowed: false as const }) as EvidenceReviewQueueV2;
    V2_QUEUE_TRUST.add(queue);
    return queue;
  } catch { return null; }
}
export function isAuthenticEvidenceReviewQueueV2Member(value: unknown): value is EvidenceReviewQueueV2Member { return !!value && typeof value === "object" && !types.isProxy(value) && V2_MEMBER_TRUST.has(value); }
export function isAuthenticEvidenceReviewQueueV2(value: unknown): value is EvidenceReviewQueueV2 { return !!value && typeof value === "object" && !types.isProxy(value) && V2_QUEUE_TRUST.has(value); }
