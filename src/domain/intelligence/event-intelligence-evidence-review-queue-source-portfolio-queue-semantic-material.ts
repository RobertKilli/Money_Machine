import "server-only";

import { types } from "node:util";
import {
  DISCOVERY_ORIGIN_SET_VERSION,
  NEWS_DISCOVERY_VERSION,
} from "./event-intelligence-news-discovery";
import {
  getEvidenceReviewQueueContract,
  parseEvidenceReviewQueueContract,
} from "./event-intelligence-evidence-review-queue";
import { EVIDENCE_REVIEW_QUEUE_VERSION } from "./event-intelligence-evidence-review-queue";
import {
  getSourcePortfolioDecision,
  parseSourcePortfolioDecision,
  SOURCE_PORTFOLIO_DECISION_VERSION,
} from "./event-intelligence-source-portfolio-routing-decision";

export const SOURCE_PORTFOLIO_SEMANTIC_MATERIAL_SCHEMA_VERSION =
  "event-intelligence-source-portfolio-semantic-material-contract/v1" as const;
export const SOURCE_PORTFOLIO_MATERIAL_PROFILE_VERSION =
  "event-intelligence-source-portfolio-policy-material/v1" as const;
export const SOURCE_PORTFOLIO_ALGORITHM_VERSION =
  "event-intelligence-source-portfolio-semantic-algorithm/v1" as const;
export const QUEUE_SEMANTIC_MATERIAL_SCHEMA_VERSION =
  "event-intelligence-evidence-review-queue-semantic-material-contract/v1" as const;
export const QUEUE_MATERIAL_PROFILE_VERSION =
  "event-intelligence-evidence-review-queue-policy-material/v1" as const;
export const QUEUE_ALGORITHM_VERSION =
  "event-intelligence-evidence-review-queue-classification-algorithm/v1" as const;

export const SEMANTIC_MATERIAL_PARSE_LIMITS = Object.freeze({
  maxDepth: 12,
  maxNodes: 10_000,
  maxStringCodeUnits: 4_096,
  maxObjectProperties: 64,
  maxArrayElements: 512,
});

const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value as object)) {
      const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
      if (descriptor && "value" in descriptor) freeze(descriptor.value);
    }
    Object.freeze(value);
  }
  return value;
};

type WalkState = { nodes: number; ancestors: WeakSet<object> };
function clonePlain(value: unknown, state: WalkState, depth = 0): unknown {
  if (++state.nodes > SEMANTIC_MATERIAL_PARSE_LIMITS.maxNodes || depth > SEMANTIC_MATERIAL_PARSE_LIMITS.maxDepth) throw new Error("INVALID");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > SEMANTIC_MATERIAL_PARSE_LIMITS.maxStringCodeUnits || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) throw new Error("INVALID");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error("INVALID");
    return value;
  }
  if (typeof value !== "object" || types.isProxy(value) || state.ancestors.has(value)) throw new Error("INVALID");
  state.ancestors.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error("INVALID");
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > SEMANTIC_MATERIAL_PARSE_LIMITS.maxArrayElements || Reflect.ownKeys(value).length !== length + 1) throw new Error("INVALID");
    const result: unknown[] = [];
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("INVALID");
      result.push(clonePlain(descriptor.value, state, depth + 1));
    }
    state.ancestors.delete(value);
    return result;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error("INVALID");
  const keys = Reflect.ownKeys(value);
  if (keys.length > SEMANTIC_MATERIAL_PARSE_LIMITS.maxObjectProperties) throw new Error("INVALID");
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string" || key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("INVALID");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("INVALID");
    result[key] = clonePlain(descriptor.value, state, depth + 1);
  }
  state.ancestors.delete(value);
  return result;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort((a, b) => a < b ? -1 : a > b ? 1 : 0).map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

const sourceDecision = getSourcePortfolioDecision();
const queueContract = getEvidenceReviewQueueContract();
if (parseSourcePortfolioDecision(sourceDecision).status !== "VALID" || parseEvidenceReviewQueueContract(queueContract).status !== "VALID") {
  throw new Error("SEMANTIC_MATERIAL_PARENT_CONTRACT_INVALID");
}

const sourcePortfolioMaterial = freeze({
  schemaVersion: SOURCE_PORTFOLIO_SEMANTIC_MATERIAL_SCHEMA_VERSION,
  materialProfileVersion: SOURCE_PORTFOLIO_MATERIAL_PROFILE_VERSION,
  policyContractVersion: SOURCE_PORTFOLIO_DECISION_VERSION,
  algorithmVersion: SOURCE_PORTFOLIO_ALGORITHM_VERSION,
  upstreamContracts: {
    discovery: NEWS_DISCOVERY_VERSION,
    discoveryOriginSet: DISCOVERY_ORIGIN_SET_VERSION,
    routingRules: {
      contractVersion: SOURCE_PORTFOLIO_DECISION_VERSION,
      includedHere: false,
      disposition: "SEPARATE_ROUTING_SEMANTIC_PROFILE_REQUIRED",
    },
  },
  rules: {
    sourceFamilies: [...sourceDecision.sourceFamilies].sort(),
    unsupportedFamilyBehavior: [{ family: "INDEPENDENT_FACTUAL_CORROBORATION", seenOrAvailable: "REJECT" }],
    sourceTypeClassification: [
      { sourceType: "NEWS_AGGREGATOR", family: "DISCOVERY_AGGREGATOR", authority: "DISCOVERY_ONLY" },
      { sourceType: "ISSUER_IR", family: "ISSUER_ATTRIBUTED_RELEASE", authority: "DISCOVERY_ONLY" },
      { sourceType: "NEWSWIRE", family: "ISSUER_ATTRIBUTED_RELEASE", authority: "DISCOVERY_ONLY", issuerAttributionRequired: true },
      { sourceType: "EXCHANGE_OR_REGULATOR_FEED", family: "REGULATORY_OR_EXCHANGE_DISCLOSURE", authority: "DISCOVERY_ONLY" },
    ],
    aggregatorBoundary: {
      aggregatorMaySatisfyPrimarySource: false,
      callerSeenFamiliesDoNotOverrideAuthenticCandidateType: true,
    },
    sourceStrengthVocabulary: [...sourceDecision.sourceStrength].sort(),
    sourceStrengthPrecedence: [
      { ifSeenFamily: "FILING_AUTHORITY", result: "FILING_PUBLICATION" },
      { ifSeenFamily: "REGULATORY_OR_EXCHANGE_DISCLOSURE", result: "REGULATORY_PUBLICATION" },
      { ifSeenFamily: "ISSUER_ATTRIBUTED_RELEASE", result: "ISSUER_ATTRIBUTED" },
      { otherwise: "DISCOVERY_ONLY" },
    ],
    conflicts: [...sourceDecision.conflictReasons].sort(),
    originRules: [...sourceDecision.originRules].sort(),
    coverageDimensions: [...sourceDecision.coverageDimensions].sort(),
    familyBudgets: [...sourceDecision.budgets].sort((a, b) => a.family < b.family ? -1 : a.family > b.family ? 1 : 0),
    requiredApprovals: [...sourceDecision.requiredApprovals].sort(),
    productionBlockers: [...sourceDecision.productionBlockers].sort(),
    operationalPriorityRules: [
      { ruleId: "DUPLICATE_PRIORITY", when: { field: "duplicate", equals: true }, result: "NO_ACTION_DUPLICATE", precedence: 1 },
      { ruleId: "CORRECTION_PRIORITY", when: { anyTrue: ["retracted", "correctionPresent"] }, result: "URGENT_CORRECTION_REVIEW", precedence: 2 },
      { ruleId: "RIGHTS_PRIORITY", when: { field: "rightsApproved", equals: false }, result: "BLOCKED_RIGHTS", precedence: 3 },
      { ruleId: "PRIMARY_PRIORITY", when: { any: ["primaryUnavailable", "preferredSourceUnavailable"] }, result: "PRIMARY_SOURCE_MISSING", precedence: 4 },
      { ruleId: "MAPPING_PRIORITY", when: { anyFalse: ["issuerMapped", "assetMapped"] }, result: "MAPPING_REQUIRED", precedence: 5 },
      { ruleId: "ROUTINE_PRIORITY", when: { otherwise: true }, result: "ROUTINE_DISCOVERY_REVIEW", precedence: 6 },
    ],
    evaluatorBoundary: {
      initialState: "DISCOVERED",
      progressionRequiresAuthenticPreviousResult: true,
      routeTableAndStateGraphIncluded: false,
      routeTableOwner: "SEPARATE_ROUTING_SEMANTIC_PROFILE_REQUIRED",
    },
  },
  closure: {
    status: "PARTIAL_ROUTING_RULES_EXCLUDED",
    gaps: ["Jurisdiction/event route tables and state transitions share the current source-portfolio-routing decision v1 and need a separately versioned routing profile.", "The source-family mapping is enforced by composition against authentic discovery candidates; this material does not mint candidate authenticity.", "Conformance covers selected evaluator branches and cannot prove full code equivalence or later application."],
  },
});

const queueBehaviorFields = [
  "contractVersion", "itemTypes", "statuses", "priorityOrder", "blockerCodes", "routingMappings", "blockerMappings",
  "conflictActionOrder", "priorityMapping", "nextActions", "forbiddenConclusions", "historicalPolicy", "correctionPolicy",
  "identityPolicy", "sortPolicy", "queueSetPolicy",
] as const;
const queueRuleMaterial: Record<string, unknown> = {};
for (const key of queueBehaviorFields) queueRuleMaterial[key] = queueContract[key as keyof typeof queueContract];

const queueMaterial = freeze({
  schemaVersion: QUEUE_SEMANTIC_MATERIAL_SCHEMA_VERSION,
  materialProfileVersion: QUEUE_MATERIAL_PROFILE_VERSION,
  policyContractVersion: EVIDENCE_REVIEW_QUEUE_VERSION,
  algorithmVersion: QUEUE_ALGORITHM_VERSION,
  upstreamContracts: {
    sourcePortfolioRouting: SOURCE_PORTFOLIO_DECISION_VERSION,
    queueComposition: "event-intelligence-evidence-review-queue-composition/v1",
    discovery: NEWS_DISCOVERY_VERSION,
  },
  queueContractMaterial: queueRuleMaterial,
  classificationRules: [
    { ruleId: "RETRACTION_FIRST", order: 1, condition: { any: [{ field: "retracted", equals: true }, { field: "eventHint", equals: "RETRACTION_WITHDRAWAL" }] }, result: { itemType: "RETRACTION_REVIEW", status: "RETRACTED", priority: "URGENT_RETRACTION_REVIEW", nextAction: "REVIEW_RETRACTION" } },
    { ruleId: "UNRESOLVED_CORRECTION", order: 2, condition: { any: [{ all: [{ field: "correctionPresent", equals: true }, { field: "correctionResolved", equals: false }] }, { all: [{ field: "eventHint", equals: "CORRECTION_AMENDMENT" }, { field: "correctionResolved", equals: false }] }, { field: "conflictReasons", contains: "CORRECTION_LINEAGE_CONFLICT" }] }, result: { itemType: "CORRECTION_LINEAGE_REVIEW", status: "BLOCKED", priority: "URGENT_CORRECTION_REVIEW", nextAction: "REVIEW_CORRECTION_LINEAGE" } },
    { ruleId: "ANY_OTHER_CONFLICT", order: 3, condition: { field: "conflictReasons", nonEmpty: true }, result: { itemType: "SOURCE_CONFLICT_REVIEW", status: "BLOCKED", priority: "CONFLICT_REVIEW", nextAction: { selection: "FIRST_PRECEDENCE_ENTRY_PRESENT_IN_CONFLICT_REASONS", precedenceFrom: "contractRuntimeAlignment.actualConflictActionOrder", fallback: "REVIEW_SOURCE_CONFLICT" } } },
    { ruleId: "RIGHTS_MISSING", order: 4, condition: { field: "rightsApproved", equals: false }, result: { itemType: "RIGHTS_APPROVAL_REVIEW", status: "BLOCKED", priority: "BLOCKED_RIGHTS", nextAction: "OBTAIN_RIGHTS_APPROVAL" } },
    { ruleId: "UNSUPPORTED_JURISDICTION", order: 5, condition: { field: "jurisdiction", oneOf: ["UNKNOWN", "DUAL_LISTED"] }, result: { itemType: "JURISDICTION_REVIEW", status: "BLOCKED", priority: "JURISDICTION_UNKNOWN", nextAction: "RESOLVE_JURISDICTION_SCOPE" } },
    { ruleId: "ISSUER_MAPPING_MISSING", order: 6, condition: { field: "issuerMapped", equals: false }, result: { itemType: "ISSUER_MAPPING_REVIEW", status: "OPEN", priority: "MAPPING_REQUIRED", nextAction: "RESOLVE_ISSUER_MAPPING" } },
    { ruleId: "ASSET_MAPPING_MISSING", order: 7, condition: { field: "assetMapped", equals: false }, result: { itemType: "ASSET_MAPPING_REVIEW", status: "OPEN", priority: "MAPPING_REQUIRED", nextAction: "RESOLVE_ASSET_MAPPING" } },
    { ruleId: "PRIMARY_SOURCE_MISSING", order: 8, condition: { any: [{ field: "primaryAvailable", equals: false }, { field: "seenFamilies", hasNoNonAggregatorFamily: true }] }, result: { itemType: "PRIMARY_SOURCE_RETRIEVAL_REVIEW", status: { branches: [{ whenAny: [{ field: "nextState", equals: "STOPPED_BLOCKED" }, { field: "degradationReasons", contains: "CREDENTIAL_MISSING" }, { field: "degradationReasons", contains: "SOURCE_QUALIFICATION_INCOMPLETE" }], value: "BLOCKED" }, { otherwise: "OPEN" }] }, priority: "PRIMARY_SOURCE_MISSING", nextAction: "RETRIEVE_PRIMARY_SOURCE" } },
    { ruleId: "ORIGIN_GROUP_REVIEW", order: 9, condition: { any: [{ field: "publicationOriginGroupCount", greaterThan: 1 }, { field: "syndicatedCopyCount", greaterThan: 0 }] }, result: { itemType: "ORIGIN_GROUP_REVIEW", status: { branches: [{ when: { field: "degradationReasons", contains: "INDEPENDENT_CORROBORATION_UNAVAILABLE" }, value: "BLOCKED" }, { otherwise: "OPEN" }] }, priority: { derivedFromOrderedRules: "priorityRules" }, nextAction: "REVIEW_ORIGIN_BINDING" } },
    { ruleId: "UNSUPPORTED_CORROBORATION", order: 10, condition: { all: [{ field: "currentState", oneOf: ["CORROBORATION_REVIEW_REQUIRED", "ELIGIBILITY_REVIEW_REQUIRED"] }, { field: "independentFactualCorroboration", equals: "UNSUPPORTED" }, { field: "nextState", notEquals: "NON_AUTHORITATIVE_REVIEW_COMPLETE" }] }, result: { itemType: "BLOCKED_UNSUPPORTED_CORROBORATION", status: "BLOCKED", priority: "ROUTINE_DISCOVERY_REVIEW", nextAction: "STOP_UNSUPPORTED_CORROBORATION" } },
    { ruleId: "DUPLICATE_NO_ACTION", order: 11, condition: { all: [{ field: "duplicate", equals: true }, { field: "correctionPresent", equals: false }] }, result: { itemType: "DUPLICATE_NO_ACTION", status: "NO_ACTION", priority: "NO_ACTION_DUPLICATE", nextAction: "NO_ACTION_DUPLICATE" } },
    { ruleId: "NON_AUTHORITATIVE_TERMINAL", order: 12, condition: { any: [{ field: "currentState", equals: "NON_AUTHORITATIVE_REVIEW_COMPLETE" }, { field: "nextState", equals: "NON_AUTHORITATIVE_REVIEW_COMPLETE" }] }, result: { itemType: "NON_AUTHORITATIVE_REVIEW_COMPLETE", status: { branches: [{ when: { field: "degradationReasons", contains: "INDEPENDENT_CORROBORATION_UNAVAILABLE" }, value: "BLOCKED" }, { otherwise: "RESOLVED_NON_AUTHORITATIVE" }] }, priority: "ROUTINE_DISCOVERY_REVIEW", nextAction: "RETAIN_NON_AUTHORITATIVE_SNAPSHOT" } },
    { ruleId: "ISSUER_MAPPING_LIFECYCLE", order: 13, condition: { field: "currentState", equals: "ISSUER_MAPPING_REQUIRED" }, result: { itemType: "ISSUER_MAPPING_REVIEW", status: "OPEN", priority: "MAPPING_REQUIRED", nextAction: "RESOLVE_ISSUER_MAPPING" } },
    { ruleId: "ASSET_MAPPING_LIFECYCLE", order: 14, condition: { field: "currentState", equals: "ASSET_MAPPING_REQUIRED" }, result: { itemType: "ASSET_MAPPING_REVIEW", status: "OPEN", priority: "MAPPING_REQUIRED", nextAction: "RESOLVE_ASSET_MAPPING" } },
    { ruleId: "SOURCE_RETRIEVAL_LIFECYCLE", order: 15, condition: { field: "currentState", oneOf: ["DISCOVERED", "SOURCE_RETRIEVAL_REQUIRED", "PRIMARY_DISCLOSURE_REQUIRED"] }, result: { itemType: "PRIMARY_SOURCE_RETRIEVAL_REVIEW", status: { branches: [{ whenAny: [{ field: "nextState", equals: "STOPPED_BLOCKED" }, { field: "degradationReasons", contains: "CREDENTIAL_MISSING" }, { field: "degradationReasons", contains: "SOURCE_QUALIFICATION_INCOMPLETE" }], value: "BLOCKED" }, { otherwise: "OPEN" }] }, priority: { derivedFromOrderedRules: "priorityRules" }, nextAction: "RETRIEVE_PRIMARY_SOURCE" } },
    { ruleId: "COMPLETED_PURCHASE_STOPPED", order: 16, condition: { all: [{ field: "eventHint", equals: "COMPLETED_PURCHASE" }, { field: "nextState", equals: "STOPPED_BLOCKED" }] }, result: { itemType: "LIFECYCLE_REVIEW", status: "BLOCKED", priority: "PRIMARY_SOURCE_MISSING", nextAction: "RETRIEVE_PRIMARY_SOURCE" } },
    { ruleId: "CORRECTION_LIFECYCLE", order: 17, condition: { any: [{ field: "currentState", equals: "CORRECTION_REVIEW_REQUIRED" }, { field: "correctionPresent", equals: true }] }, result: { itemType: "CORRECTION_LINEAGE_REVIEW", status: { branches: [{ when: { field: "correctionResolved", equals: true }, value: "RESOLVED_NON_AUTHORITATIVE" }, { otherwise: "OPEN" }] }, priority: "URGENT_CORRECTION_REVIEW", nextAction: "REVIEW_CORRECTION_LINEAGE" } },
    { ruleId: "STOPPED_LIFECYCLE", order: 18, condition: { any: [{ field: "currentState", equals: "STOPPED_BLOCKED" }, { field: "nextState", equals: "STOPPED_BLOCKED" }] }, result: { itemType: "LIFECYCLE_REVIEW", status: "BLOCKED", priority: "ROUTINE_DISCOVERY_REVIEW", nextAction: "RETAIN_NON_AUTHORITATIVE_SNAPSHOT" } },
    { ruleId: "OTHER_LIFECYCLE", order: 19, condition: { otherwise: true }, result: { itemType: "LIFECYCLE_REVIEW", status: "OPEN", priority: { derivedFromOrderedRules: "priorityRules" }, nextAction: "REVIEW_LIFECYCLE" } },
  ],
  blockerOrdering: { outputOrder: "LEXICAL_CODE_UNIT_ASCENDING", details: "CLOSED_BLOCKER_DETAIL_TABLE_IN_PARENT_QUEUE_CONTRACT" },
  priorityRules: [
    { order: 1, when: { field: "retracted", equals: true }, value: "URGENT_RETRACTION_REVIEW" },
    { order: 2, when: { field: "operationalPriority", equals: "URGENT_CORRECTION_REVIEW" }, value: "URGENT_CORRECTION_REVIEW" },
    { order: 3, when: { field: "conflictReasons", nonEmpty: true }, value: "CONFLICT_REVIEW" },
    { order: 4, when: { field: "operationalPriority", equals: "BLOCKED_RIGHTS" }, value: "BLOCKED_RIGHTS" },
    { order: 5, when: { field: "jurisdiction", oneOf: ["UNKNOWN", "DUAL_LISTED"] }, value: "JURISDICTION_UNKNOWN" },
    { order: 6, when: { anyFalse: ["issuerMapped", "assetMapped"] }, value: "MAPPING_REQUIRED" },
    { order: 7, when: { any: [{ field: "primaryAvailable", equals: false }, { field: "seenFamilies", hasNoNonAggregatorFamily: true }, { field: "operationalPriority", equals: "PRIMARY_SOURCE_MISSING" }] }, value: "PRIMARY_SOURCE_MISSING" },
    { order: 8, when: { field: "operationalPriority", equals: "NO_ACTION_DUPLICATE" }, value: "NO_ACTION_DUPLICATE" },
    { order: 9, otherwise: "ROUTINE_DISCOVERY_REVIEW" },
  ],
  projectionGate: {
    decision: "MUST_BE_MODULE_AUTHENTIC_SOURCE_PORTFOLIO_DECISION",
    result: "MUST_BE_MODULE_AUTHENTIC_RESULT_BOUND_TO_DECISION",
    requiredResultStatus: "NON_AUTHORITATIVE_ROUTING_RESULT",
    requiredFlags: { authorityIssued: false, persistenceAllowed: false, signalEligible: false, tradingEligible: false },
    requiredEvidenceShape: { independentFactualOriginGroups: 0, independentFactualCorroboration: "UNSUPPORTED", nonEmptyStageHistory: true, lastStageEqualsNextState: true },
    failure: "NO_ITEM_PROJECTED",
  },
  queueOrdering: {
    queueSetInputMaximum: 512,
    duplicateMembers: "REJECT",
    evaluationCutoff: "ALL_MEMBERS_MUST_SHARE_ONE_CUTOFF",
    ordinal: "TIGHT_ZERO_BASED_AFTER_CANONICAL_SORT",
    comparator: ["priorityOrderIndex_ASC", "publicationAt_ASC_UTC_LEXICAL", "itemId_ASC_UTF16_CODE_UNITS"],
  },
  historicalAndSupersession: {
    cutoffSemantics: "INHERIT_VALIDATED_ROUTING_RESULT; QUEUE DOES NOT CHOOSE CURRENT OR LATEST",
    supersededStatus: "ENUMERATED_BUT_NOT_EMITTED_BY_QUEUE_CLASSIFIER; VIEW_MODEL_SEPARATELY_PROJECTS_STATUS",
    correctionRetraction: "EVALUATED_BEFORE_DUPLICATE_NO_ACTION; RETRACTIONS_REMAIN_TERMINAL_REVIEW_ITEMS",
  },
  contractRuntimeAlignment: {
    status: "PARENT_QUEUE_PRECEDENCE_REQUIRES_RECONCILIATION",
    declaredContractOrder: { unsupportedCorroborationPrecedence: 9, duplicatePrecedence: 10, routineFallbackPrecedence: 11, nonAuthoritativeTerminalPrecedence: 12 },
    actualClassifierOrder: { originGroupPrecedesUnsupportedCorroboration: true, unsupportedCorroborationOrder: 10, duplicateOrder: 11, nonAuthoritativeTerminalOrder: 12, finalRoutineFallbackOrder: 19 },
    declaredConflictActionOrder: ["CORRECTION_LINEAGE_CONFLICT", "ISSUER_IDENTITY_CONFLICT", "LISTING_JURISDICTION_CONFLICT", "ASSET_REPRESENTATION_CONFLICT", "AMOUNT_CURRENCY_CONFLICT", "LIFECYCLE_CONFLICT", "PUBLICATION_TIME_CONFLICT", "SOURCE_MATERIAL_CONFLICT", "AUTHORITY_TIER_CONFLICT", "ORIGIN_GROUP_CONFLICT"],
    actualConflictActionOrder: ["CORRECTION_LINEAGE_CONFLICT", "ISSUER_IDENTITY_CONFLICT", "LISTING_JURISDICTION_CONFLICT", "ASSET_REPRESENTATION_CONFLICT", "LIFECYCLE_CONFLICT", "AMOUNT_CURRENCY_CONFLICT", "PUBLICATION_TIME_CONFLICT", "SOURCE_MATERIAL_CONFLICT", "AUTHORITY_TIER_CONFLICT", "ORIGIN_GROUP_CONFLICT"],
    runtimeOwner: "event-intelligence-evidence-review-queue.ts:classify",
  },
  excludedPresentationAndRuntimeMetadata: ["recordedAt", "fingerprint", "labels", "titles", "viewModelPolicy", "productionBlockers", "approvals", "itemCounts", "cutoffInstance", "candidateIds", "artifactIds"],
  closure: {
    status: "PARTIAL_UPSTREAM_AND_REMAINING_LIFECYCLE_BRANCHES_REQUIRE_CONFORMANCE",
    gaps: ["The queue consumes authentic routing results but does not independently authenticate the candidate source type.", "Historical cutoff validation is performed by upstream discovery/composition/routing contracts; queue material describes same-cutoff membership, not those input checks.", "SUPERSEDED is a presentation/read-model status and is not emitted by this queue classifier.", "The parent contract routingMappings declares unsupported-corroboration precedence 9 and duplicate precedence 10, while classify runs origin-group review first, then unsupported corroboration and duplicate; it also labels routine fallback 11 before terminal 12 although classify checks terminal before final fallback. Reconcile these parent semantics before claiming complete identity.", "The parent contract conflictActionOrder places AMOUNT_CURRENCY_CONFLICT before LIFECYCLE_CONFLICT, but classify's executable conflictAction precedence reverses those entries. Reconcile this before claiming complete identity.", "Conformance fixtures cover selected branches and cannot prove full equivalence or code execution."],
  },
});

export type SourcePortfolioSemanticMaterial = Readonly<typeof sourcePortfolioMaterial>;
export type EvidenceReviewQueueSemanticMaterial = Readonly<typeof queueMaterial>;
export type SemanticMaterialParse<T> =
  | Readonly<{ status: "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE"; material: T }>
  | Readonly<{ status: "INVALID"; code: "SEMANTIC_MATERIAL_INVALID" }>;

const INVALID = Object.freeze({ status: "INVALID" as const, code: "SEMANTIC_MATERIAL_INVALID" as const });
export const SOURCE_PORTFOLIO_SEMANTIC_MATERIAL = sourcePortfolioMaterial;
export const EVIDENCE_REVIEW_QUEUE_SEMANTIC_MATERIAL = queueMaterial;

function parseFixed<T>(input: unknown, expected: T): SemanticMaterialParse<T> {
  try {
    const copy = clonePlain(input, { nodes: 0, ancestors: new WeakSet() });
    if (canonical(copy) !== canonical(expected)) return INVALID;
    return Object.freeze({ status: "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE" as const, material: expected });
  } catch { return INVALID; }
}

/** Checks fixed source-portfolio semantic material only; no route or policy is applied here. */
export function parseSourcePortfolioSemanticMaterial(input: unknown): SemanticMaterialParse<SourcePortfolioSemanticMaterial> {
  return parseFixed(input, sourcePortfolioMaterial);
}

/** Checks fixed queue semantic material only; it does not project or seal queue data. */
export function parseEvidenceReviewQueueSemanticMaterial(input: unknown): SemanticMaterialParse<EvidenceReviewQueueSemanticMaterial> {
  return parseFixed(input, queueMaterial);
}
