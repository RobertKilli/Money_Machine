import "server-only";

import { types } from "node:util";
import {
  isAuthenticEvidenceReviewQueueV2,
  isAuthenticEvidenceReviewQueueV2Member,
  type EvidenceReviewQueueV2,
  type EvidenceReviewQueueV2Member,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue";
import {
  isAuthenticEventIntelligenceQueueV2Composition,
  type EventIntelligenceQueueV2Composition,
} from "@/application/intelligence/compose-event-intelligence-evidence-review-queue-v2";

export const EVIDENCE_REVIEW_QUEUE_V2_VIEW_MODEL_VERSION = "event-intelligence-evidence-review-queue-view-model/v2" as const;

const TYPE_LABELS = Object.freeze({
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
const PRIORITY_LABELS = Object.freeze({
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
const STATUS_LABELS = Object.freeze({ OPEN: "Open review", BLOCKED: "Blocked", NO_ACTION: "No new queue action", RESOLVED_NON_AUTHORITATIVE: "Review completed; non-authoritative", SUPERSEDED: "Historical snapshot superseded", RETRACTED: "Retracted; not active" });
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
const BLOCKER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ISSUER_MAPPING_MISSING: "Issuer mapping is missing", ASSET_MAPPING_MISSING: "Asset mapping is missing",
  JURISDICTION_SCOPE_UNRESOLVED: "Jurisdiction or listing scope is unresolved", PRIMARY_SOURCE_MISSING: "A qualified primary source is missing",
  CORRECTION_LINEAGE_UNRESOLVED: "Correction lineage is unresolved", RETRACTION_PRESENT: "Source material indicates a retraction or withdrawal",
  RIGHTS_APPROVAL_MISSING: "Required source-use approval is missing", SOURCE_QUALIFICATION_INCOMPLETE: "Source qualification is incomplete",
  CREDENTIAL_MISSING: "A required credential is unavailable", ISSUER_IDENTITY_CONFLICT: "Issuer identity evidence conflicts",
  LISTING_JURISDICTION_CONFLICT: "Listing or jurisdiction evidence conflicts", ASSET_REPRESENTATION_CONFLICT: "Asset representation evidence conflicts",
  AMOUNT_CURRENCY_CONFLICT: "Amount or currency evidence conflicts", LIFECYCLE_CONFLICT: "Event lifecycle evidence conflicts",
  PUBLICATION_TIME_CONFLICT: "Publication-time evidence conflicts", CORRECTION_LINEAGE_CONFLICT: "Correction lineage evidence conflicts",
  SOURCE_MATERIAL_CONFLICT: "Source material conflicts", AUTHORITY_TIER_CONFLICT: "Source role evidence conflicts",
  ORIGIN_GROUP_CONFLICT: "Source origin grouping conflicts", SOURCE_CONFLICT: "Source material contains unresolved conflicts",
  STALE_EVIDENCE: "Evidence may be stale", INDEPENDENT_CORROBORATION_UNSUPPORTED: "Independent factual corroboration is unsupported",
  ACQUISITION_DISABLED: "Source acquisition is blocked", DUPLICATE_CANDIDATE: "This candidate is already represented",
});

export type EvidenceReviewQueueV2ViewModelItem = Readonly<{
  publicKey: string;
  reviewType: EvidenceReviewQueueV2Member["itemType"];
  typeLabel: string;
  status: EvidenceReviewQueueV2Member["status"];
  statusLabel: string;
  operationalPriority: EvidenceReviewQueueV2Member["priority"];
  priorityLabel: string;
  title: string;
  reasonLabels: readonly string[];
  nextActionLabel: string;
  publicationAt: string;
  evaluatedAsOf: string;
  historical: true;
}>;

export type EvidenceReviewQueueV2ViewModel = Readonly<{
  version: typeof EVIDENCE_REVIEW_QUEUE_V2_VIEW_MODEL_VERSION;
  compositionVersion: EventIntelligenceQueueV2Composition["version"];
  queueVersion: EvidenceReviewQueueV2["contractVersion"];
  state: "HAS_REVIEW_ITEMS";
  generatedForAsOf: string;
  items: readonly EvidenceReviewQueueV2ViewModelItem[];
  summary: Readonly<{ totalItems: number; open: number; blocked: number; conflicts: number; correctionReviews: number; mappingReviews: number }>;
}>;

const TRUST = new WeakSet<object>();
function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value); }
function validUtc(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }

function projectMember(member: EvidenceReviewQueueV2Member, index: number): EvidenceReviewQueueV2ViewModelItem | null {
  if (!isAuthenticEvidenceReviewQueueV2Member(member) || member.contractVersion !== "event-intelligence-evidence-review-queue-contract/v2" || !Object.hasOwn(TYPE_LABELS, member.itemType) || !Object.hasOwn(STATUS_LABELS, member.status) || !Object.hasOwn(PRIORITY_LABELS, member.priority) || !validUtc(member.publicationAt) || !validUtc(member.evaluationAsOf) || member.publicationAt > member.evaluationAsOf || !Object.hasOwn(ACTION_LABELS, member.requiredNextAction)) return null;
  const reasonLabels: string[] = [];
  for (const code of member.blockerCodes) {
    const label = BLOCKER_LABELS[code];
    if (!label || reasonLabels.includes(label)) return null;
    reasonLabels.push(label);
  }
  reasonLabels.sort();
  const type = TYPE_LABELS[member.itemType];
  const titles: Partial<Record<EvidenceReviewQueueV2Member["itemType"], string>> = {
    PRIMARY_SOURCE_RETRIEVAL_REVIEW: "Primary source must be retrieved", ISSUER_MAPPING_REVIEW: "Issuer mapping requires review",
    ASSET_MAPPING_REVIEW: "Asset mapping requires review", CORRECTION_LINEAGE_REVIEW: "Correction lineage requires review",
    RETRACTION_REVIEW: "Retraction requires review", SOURCE_CONFLICT_REVIEW: "Conflicting source material",
    ORIGIN_GROUP_REVIEW: "Source origin grouping requires review", RIGHTS_APPROVAL_REVIEW: "Rights approval is missing",
    JURISDICTION_REVIEW: "Jurisdiction requires review", LIFECYCLE_REVIEW: "Event lifecycle requires review",
    DUPLICATE_NO_ACTION: "Duplicate candidate — no new action", BLOCKED_UNSUPPORTED_CORROBORATION: "Independent corroboration is unavailable",
    NON_AUTHORITATIVE_REVIEW_COMPLETE: "Non-authoritative review completed",
  };
  if (!type || !titles[member.itemType]) return null;
  return Object.freeze({
    publicKey: `v2-presentation-row-${String(index + 1).padStart(2, "0")}`,
    reviewType: member.itemType,
    typeLabel: type,
    status: member.status,
    statusLabel: STATUS_LABELS[member.status],
    operationalPriority: member.priority,
    priorityLabel: PRIORITY_LABELS[member.priority],
    title: titles[member.itemType]!,
    reasonLabels: Object.freeze(reasonLabels),
    nextActionLabel: ACTION_LABELS[member.requiredNextAction]!,
    publicationAt: member.publicationAt,
    evaluatedAsOf: member.evaluationAsOf,
    historical: true as const,
  });
}

/** Strictly projects an authentic V2 composition into isolated presentation-only data. */
export function projectEvidenceReviewQueueV2ToViewModel(composition: unknown): EvidenceReviewQueueV2ViewModel | null {
  try {
    if (!isAuthenticEventIntelligenceQueueV2Composition(composition)) return null;
    const trusted = composition as EventIntelligenceQueueV2Composition;
    const queue = trusted.queue;
    if (!isAuthenticEvidenceReviewQueueV2(queue) || trusted.version !== "event-intelligence-evidence-review-queue-composition/v2" || trusted.status !== "NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION" || trusted.evaluationAsOf !== queue.evaluationAsOf || queue.status !== "HAS_REVIEW_ITEMS" || queue.memberCount !== queue.members.length || queue.members.length !== trusted.candidateCount || queue.members.some(member => member.evaluationAsOf !== trusted.evaluationAsOf)) return null;
    const items = queue.members.map(projectMember);
    if (items.some(item => item === null)) return null;
    const members = items as EvidenceReviewQueueV2ViewModelItem[];
    if (new Set(members.map(item => item.publicKey)).size !== members.length) return null;
    const viewModel = freezeDeep({
      version: EVIDENCE_REVIEW_QUEUE_V2_VIEW_MODEL_VERSION,
      compositionVersion: trusted.version,
      queueVersion: queue.contractVersion,
      state: "HAS_REVIEW_ITEMS" as const,
      generatedForAsOf: trusted.evaluationAsOf,
      items: members,
      summary: {
        totalItems: members.length,
        open: members.filter(item => item.status === "OPEN").length,
        blocked: members.filter(item => item.status === "BLOCKED").length,
        conflicts: members.filter(item => item.reviewType === "SOURCE_CONFLICT_REVIEW").length,
        correctionReviews: members.filter(item => item.reviewType === "CORRECTION_LINEAGE_REVIEW").length,
        mappingReviews: members.filter(item => item.reviewType === "ISSUER_MAPPING_REVIEW" || item.reviewType === "ASSET_MAPPING_REVIEW").length,
      },
    });
    TRUST.add(viewModel);
    return viewModel;
  } catch { return null; }
}

export function isAuthenticEvidenceReviewQueueV2ViewModel(value: unknown): value is EvidenceReviewQueueV2ViewModel { return !!value && typeof value === "object" && !types.isProxy(value) && TRUST.has(value) && isRecord(value) && value.version === EVIDENCE_REVIEW_QUEUE_V2_VIEW_MODEL_VERSION; }
