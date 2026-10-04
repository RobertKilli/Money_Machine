import "server-only";

import { types } from "node:util";

export const ROUTING_SEMANTIC_MATERIAL_SCHEMA_VERSION =
  "event-intelligence-routing-semantic-material-contract/v1" as const;
export const ROUTING_MATERIAL_PROFILE_VERSION =
  "event-intelligence-routing-policy-material/v1" as const;
export const ROUTING_POLICY_CONTRACT_VERSION =
  "event-intelligence-source-portfolio-routing-decision/v1" as const;
export const ROUTING_ALGORITHM_VERSION =
  "event-intelligence-routing-semantic-algorithm/v1" as const;

export const ROUTING_SEMANTIC_MATERIAL_PARSE_LIMITS = Object.freeze({
  maxDepth: 12,
  maxNodes: 10_000,
  maxStringCodeUnits: 4_096,
  maxObjectProperties: 64,
  maxArrayElements: 512,
});

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value as object)) {
      const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
      if (descriptor && "value" in descriptor) deepFreeze(descriptor.value);
    }
    Object.freeze(value);
  }
  return value;
};

type WalkState = { nodes: number; ancestors: WeakSet<object> };
function clonePlain(value: unknown, state: WalkState, depth = 0): unknown {
  if (++state.nodes > ROUTING_SEMANTIC_MATERIAL_PARSE_LIMITS.maxNodes || depth > ROUTING_SEMANTIC_MATERIAL_PARSE_LIMITS.maxDepth) throw new Error("INVALID");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > ROUTING_SEMANTIC_MATERIAL_PARSE_LIMITS.maxStringCodeUnits || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) throw new Error("INVALID");
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
    if (!Number.isSafeInteger(length) || length < 0 || length > ROUTING_SEMANTIC_MATERIAL_PARSE_LIMITS.maxArrayElements || Reflect.ownKeys(value).length !== length + 1) throw new Error("INVALID");
    const result: unknown[] = [];
    for (let i = 0; i < length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("INVALID");
      result.push(clonePlain(descriptor.value, state, depth + 1));
    }
    state.ancestors.delete(value);
    return result;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error("INVALID");
  const keys = Reflect.ownKeys(value);
  if (keys.length > ROUTING_SEMANTIC_MATERIAL_PARSE_LIMITS.maxObjectProperties) throw new Error("INVALID");
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

function sameMaterial(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (actual === null || expected === null || typeof actual !== "object" || typeof expected !== "object") return false;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) return false;
    return actual.every((entry, index) => sameMaterial(entry, expected[index]));
  }
  const actualKeys = Object.keys(actual).sort(compareCodeUnits);
  const expectedKeys = Object.keys(expected).sort(compareCodeUnits);
  return actualKeys.length === expectedKeys.length && actualKeys.every((key, i) => key === expectedKeys[i] && sameMaterial((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key]));
}

function compareCodeUnits(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

const routingMaterial = deepFreeze({
  schemaVersion: ROUTING_SEMANTIC_MATERIAL_SCHEMA_VERSION,
  materialProfileVersion: ROUTING_MATERIAL_PROFILE_VERSION,
  policyContractVersion: ROUTING_POLICY_CONTRACT_VERSION,
  algorithmVersion: ROUTING_ALGORITHM_VERSION,
  upstreamContracts: {
    sourcePortfolioDecision: "event-intelligence-source-portfolio-routing-decision/v1",
    newsDiscovery: "event-intelligence-news-discovery/v1",
    discoveryOriginSet: "event-intelligence-discovery-origin-set/v1",
  },
  inputContract: {
    exactFields: ["provenance", "candidateId", "jurisdiction", "listingScopes", "eventHint", "seenFamilies", "availableFamilies", "issuerMapped", "assetMapped", "duplicate", "rightsApproved", "credentialAvailable", "completionMaterialPresent", "primaryAvailable", "qualificationComplete", "correctionPresent", "correctionResolved", "correctionFieldHints", "retracted", "conflicts", "stale", "originBindings", "publicationAt", "discoveredAt", "receivedAt", "correctionAvailableAt", "evaluationAsOf"],
    validationOrder: ["EXACT_ROOT_AND_DESCRIPTOR_SHAPE", "SYNTHETIC_PROVENANCE", "BOOLEAN_FIELDS", "JURISDICTION_AND_LISTING_SCOPES", "CONFLICT_ENUM_SET", "CORRECTION_HINT_SET_AND_CORRECTION_PRESENCE", "ORIGIN_BINDING_SHAPES_AND_GRAPH", "CORRECTION_AVAILABLE_AT_UTC_SHAPE", "SOURCE_FAMILY_SETS_AND_DISJOINTNESS", "UTC_TIME_SHAPES_AND_ORDER", "CANDIDATE_IDENTIFIER", "EVENT_HINT_ENUM"],
    provenance: "SYNTHETIC",
    primitiveAndCollectionBounds: { jurisdictionMaxCodeUnits: 32, listingScopesMaxMembers: 64, sourceFamiliesPerSetMaxMembers: 5, conflictsMaxMembers: 10, correctionHintsMaxMembers: 6, originBindingsMaxMembers: 128, safeIdentifierMinCodeUnits: 2, safeIdentifierMaxCodeUnits: 96, timestamps: "UTC_ISO_8601_MILLISECONDS_Z_ROUND_TRIP" },
    candidateIdentifier: { grammar: "LOWERCASE_ASCII_ID_START_AND_FOLLOWING_ID_CHARS", maxCodeUnits: 96, minimumCodeUnits: 2, secretOrUrlLikeValues: "REJECT" },
    jurisdictions: ["US_SEC", "GB_LSE", "AU_ASX", "UNLISTED", "UNKNOWN", "DUAL_LISTED"],
    listingScopeRules: [
      { jurisdiction: "US_SEC", exactSet: ["listing:us-sec"] },
      { jurisdiction: "GB_LSE", exactSet: ["listing:lse"] },
      { jurisdiction: "AU_ASX", exactSet: ["listing:asx"] },
      { jurisdiction: "UNLISTED", exactSet: [] },
      { jurisdiction: "UNKNOWN", exactSet: [] },
      { jurisdiction: "DUAL_LISTED", minimumUniqueMembers: 2 },
    ],
    sourceFamilies: {
      acceptedSet: ["DISCOVERY_AGGREGATOR", "ISSUER_ATTRIBUTED_RELEASE", "REGULATORY_OR_EXCHANGE_DISCLOSURE", "FILING_AUTHORITY"],
      membershipSemantics: "UNIQUE_SET_SORTED_UTF16_CODE_UNITS",
      seenAndAvailableMustBeDisjoint: true,
      independentFactualCorroboration: "REJECTED_UNSUPPORTED",
    },
    conflicts: { acceptedSet: ["ISSUER_IDENTITY_CONFLICT", "LISTING_JURISDICTION_CONFLICT", "ASSET_REPRESENTATION_CONFLICT", "AMOUNT_CURRENCY_CONFLICT", "LIFECYCLE_CONFLICT", "PUBLICATION_TIME_CONFLICT", "CORRECTION_LINEAGE_CONFLICT", "SOURCE_MATERIAL_CONFLICT", "AUTHORITY_TIER_CONFLICT", "ORIGIN_GROUP_CONFLICT"], duplicates: "REJECT", outputOrder: "UTF16_CODE_UNIT_ASCENDING" },
    correctionHints: { acceptedSet: ["AMOUNT", "ASSET", "PUBLICATION_TIME", "LIFECYCLE", "ISSUER", "OTHER"], duplicates: "REJECT", correctionPresentRequiresNonEmpty: true, absentCorrectionRequiresEmpty: true, outputOrder: "UTF16_CODE_UNIT_ASCENDING" },
    originBindings: {
      maxMembers: 128,
      exactFields: ["sourceRecordId", "retrievalArtifactId", "publicationId", "issuerOriginId", "distributionCopyOf"],
      arraySemantics: "PRESERVED_INPUT_ORDER",
      uniqueSourceRecordId: true,
      samePublicationRequiresSameIssuerOrigin: true,
      distributionCopyRequiresExistingSamePublicationAndSameNonNullIssuerOriginParent: true,
      cycles: "REJECT",
      identifiers: "SAME_SAFE_ID_GRAMMAR_AS_CANDIDATE",
    },
    time: { format: "UTC_ISO_8601_MILLISECONDS_Z_ROUND_TRIP", ordering: ["publicationAt<=discoveredAt", "discoveredAt<=receivedAt", "receivedAt<=evaluationAsOf"], correctionAvailableAt: "NULL_OR_BETWEEN_PUBLICATION_AND_EVALUATION_INCLUSIVE_AND_REQUIRES_CORRECTION" },
    eventHints: ["PURCHASE_INTENT", "BOARD_AUTHORIZATION", "TREASURY_POLICY", "BINDING_AGREEMENT", "EXPECTED_CLOSING", "COMPLETED_PURCHASE", "CANCELLATION_TERMINATION", "CORRECTION_AMENDMENT", "RETRACTION_WITHDRAWAL", "UNRELATED_CORPORATE_ACTION", "UNKNOWN"],
  },
  sourceTypeBoundary: {
    owner: "AUTHENTIC_DISCOVERY_AND_COMPOSITION_CONTRACTS",
    sourceTypeFamilyPairs: [
      { sourceType: "NEWS_AGGREGATOR", family: "DISCOVERY_AGGREGATOR" },
      { sourceType: "ISSUER_IR", family: "ISSUER_ATTRIBUTED_RELEASE" },
      { sourceType: "NEWSWIRE", family: "ISSUER_ATTRIBUTED_RELEASE", requiresIssuerAttribution: true },
      { sourceType: "EXCHANGE_OR_REGULATOR_FEED", family: "REGULATORY_OR_EXCHANGE_DISCLOSURE" },
    ],
    callerSeenFamiliesCannotRelabelCandidate: true,
    aggregatorCannotBecomeIssuerRegulatoryOrFilingAuthority: true,
    routingEvaluatorAuthenticatesCandidate: false,
  },
  routeSelection: {
    jurisdictionRouteOrder: [
      { jurisdiction: "US_SEC", order: ["FILING_AUTHORITY", "ISSUER_ATTRIBUTED_RELEASE", "REGULATORY_OR_EXCHANGE_DISCLOSURE", "DISCOVERY_AGGREGATOR"] },
      { jurisdiction: "GB_LSE", order: ["REGULATORY_OR_EXCHANGE_DISCLOSURE", "ISSUER_ATTRIBUTED_RELEASE", "DISCOVERY_AGGREGATOR"] },
      { jurisdiction: "AU_ASX", order: ["REGULATORY_OR_EXCHANGE_DISCLOSURE", "ISSUER_ATTRIBUTED_RELEASE", "DISCOVERY_AGGREGATOR"] },
      { jurisdiction: "UNLISTED", order: ["ISSUER_ATTRIBUTED_RELEASE", "DISCOVERY_AGGREGATOR"] },
      { jurisdiction: "UNKNOWN", order: ["DISCOVERY_AGGREGATOR"] },
    ],
    nextSourceFamily: { select: "FIRST", from: "routeOrderForInputJurisdiction", where: [{ family: "NOT_IN", collection: "seenFamilies" }, { family: "IN", collection: "availableFamilies" }], otherwise: null },
    preferredFamily: { select: "FIRST", from: "routeOrderForInputJurisdiction" },
    preferredUnavailableDegradation: { condition: { field: "preferredFamily", neitherSeenNorAvailable: true }, add: ["PRIMARY_SOURCE_UNAVAILABLE"] },
    noMatchingJurisdictionRouteFallback: "DISCOVERY_AGGREGATOR",
    dualListed: "NO_TABLE_MATCH_USES_DISCOVERY_AGGREGATOR_BUT_ROUTE_STOPS_BLOCKED",
  },
  eventRouting: {
    parentEventRouteRowsSemantics: "ONE_DECLARATION_PER_EVENT_HINT; REQUIRED_STATE_MEANING_UNRESOLVED",
    parentEventRouteRows: [
      { hint: "PURCHASE_INTENT", required: "SOURCE_RETRIEVAL_REQUIRED", completionEvidenceRequired: false, retractionStops: false },
      { hint: "BOARD_AUTHORIZATION", required: "SOURCE_RETRIEVAL_REQUIRED", completionEvidenceRequired: false, retractionStops: false },
      { hint: "TREASURY_POLICY", required: "SOURCE_RETRIEVAL_REQUIRED", completionEvidenceRequired: false, retractionStops: false },
      { hint: "BINDING_AGREEMENT", required: "PRIMARY_DISCLOSURE_REQUIRED", completionEvidenceRequired: false, retractionStops: false },
      { hint: "EXPECTED_CLOSING", required: "PRIMARY_DISCLOSURE_REQUIRED", completionEvidenceRequired: false, retractionStops: false },
      { hint: "COMPLETED_PURCHASE", required: "PRIMARY_DISCLOSURE_REQUIRED", completionEvidenceRequired: true, retractionStops: false },
      { hint: "CANCELLATION_TERMINATION", required: "SOURCE_RETRIEVAL_REQUIRED", completionEvidenceRequired: false, retractionStops: false },
      { hint: "CORRECTION_AMENDMENT", required: "CORRECTION_REVIEW_REQUIRED", completionEvidenceRequired: false, retractionStops: false },
      { hint: "RETRACTION_WITHDRAWAL", required: "CORRECTION_REVIEW_REQUIRED", completionEvidenceRequired: false, retractionStops: true },
      { hint: "UNRELATED_CORPORATE_ACTION", required: "SOURCE_RETRIEVAL_REQUIRED", completionEvidenceRequired: false, retractionStops: false },
      { hint: "UNKNOWN", required: "SOURCE_RETRIEVAL_REQUIRED", completionEvidenceRequired: false, retractionStops: false },
    ],
    initialState: "DISCOVERED",
    primaryRequiredHints: ["BINDING_AGREEMENT", "EXPECTED_CLOSING", "COMPLETED_PURCHASE", "CORRECTION_AMENDMENT", "RETRACTION_WITHDRAWAL"],
    primaryRequiredHintsSemantics: "MEMBERSHIP_SET; ORDER_HAS_NO_PRIORITY_MEANING",
    primaryDisclosureCompletedPurchaseRequiresCompletionMaterial: true,
    retractedFlagStops: true,
    retractionHintAloneStops: false,
    parentRequiredStateIsNotUsedAsInitialState: true,
  },
  progression: {
    initialCurrentState: "DISCOVERED",
    allowedTransitions: [
      { from: "DISCOVERED", to: "SOURCE_RETRIEVAL_REQUIRED" }, { from: "DISCOVERED", to: "STOPPED_BLOCKED" },
      { from: "SOURCE_RETRIEVAL_REQUIRED", to: "ISSUER_MAPPING_REQUIRED" }, { from: "SOURCE_RETRIEVAL_REQUIRED", to: "STOPPED_BLOCKED" },
      { from: "ISSUER_MAPPING_REQUIRED", to: "ASSET_MAPPING_REQUIRED" }, { from: "ISSUER_MAPPING_REQUIRED", to: "STOPPED_BLOCKED" },
      { from: "ASSET_MAPPING_REQUIRED", to: "PRIMARY_DISCLOSURE_REQUIRED" }, { from: "ASSET_MAPPING_REQUIRED", to: "STOPPED_BLOCKED" },
      { from: "PRIMARY_DISCLOSURE_REQUIRED", to: "CORRECTION_REVIEW_REQUIRED" }, { from: "PRIMARY_DISCLOSURE_REQUIRED", to: "STOPPED_BLOCKED" },
      { from: "CORRECTION_REVIEW_REQUIRED", to: "CORROBORATION_REVIEW_REQUIRED" }, { from: "CORRECTION_REVIEW_REQUIRED", to: "STOPPED_BLOCKED" },
      { from: "CORROBORATION_REVIEW_REQUIRED", to: "ELIGIBILITY_REVIEW_REQUIRED" }, { from: "CORROBORATION_REVIEW_REQUIRED", to: "STOPPED_BLOCKED" },
      { from: "ELIGIBILITY_REVIEW_REQUIRED", to: "NON_AUTHORITATIVE_REVIEW_COMPLETE" }, { from: "ELIGIBILITY_REVIEW_REQUIRED", to: "STOPPED_BLOCKED" },
    ],
    progressionRequiresAuthenticPreviousResult: true,
    previousResultGuardOrder: ["MODULE_LOCAL_ROUTING_RESULT_TRUST", "BOUND_DECISION_FINGERPRINT", "EXACT_CANDIDATE_BINDING", "PRIOR_RESULT_NOT_TERMINAL", "BOUND_HISTORY_TAIL_EQUALS_PRIOR_NEXT_STATE"],
    candidateBindingFields: ["candidateId", "jurisdiction", "listingScopes", "eventHint", "originBindings", "publicationAt", "discoveredAt", "receivedAt", "correctionAvailableAt", "correctionFieldHints", "evaluationAsOf"],
    stageObservationFieldsAllowedToChange: ["seenFamilies", "availableFamilies", "issuerMapped", "assetMapped", "duplicate", "rightsApproved", "credentialAvailable", "completionMaterialPresent", "primaryAvailable", "qualificationComplete", "correctionPresent", "correctionResolved", "retracted", "conflicts", "stale"],
    previousTerminalStatesRejected: ["STOPPED_BLOCKED", "NON_AUTHORITATIVE_REVIEW_COMPLETE"],
    callerStageHistory: "NOT_ACCEPTED_IN_INPUT",
  },
  decisionOrder: {
    blockingPriority: [
      { condition: { any: [{ field: "retracted", equals: true }, { field: "conflicts", nonEmpty: true }, { field: "rightsApproved", equals: false }, { field: "credentialAvailable", equals: false }, { all: [{ field: "correctionPresent", equals: true }, { field: "correctionResolved", equals: false }] }, { field: "jurisdiction", equals: "DUAL_LISTED" }] }, result: "STOPPED_BLOCKED" },
      { condition: { field: "duplicate", equals: true }, result: "STOPPED_BLOCKED" },
      { condition: { field: "currentState", oneOf: ["DISCOVERED", "SOURCE_RETRIEVAL_REQUIRED", "ISSUER_MAPPING_REQUIRED", "ASSET_MAPPING_REQUIRED", "PRIMARY_DISCLOSURE_REQUIRED", "CORRECTION_REVIEW_REQUIRED", "CORROBORATION_REVIEW_REQUIRED", "ELIGIBILITY_REVIEW_REQUIRED"] }, result: "APPLY_ORDERED_STATE_BRANCHES" },
      { condition: { all: [{ field: "currentState", notEquals: "DISCOVERED" }, { field: "jurisdiction", oneOf: ["UNKNOWN", "DUAL_LISTED"] }] }, result: "STOPPED_BLOCKED" },
      { condition: { field: "transition", memberOf: "allowedTransitions", equals: false }, result: "STOPPED_BLOCKED" },
    ],
    stateBranches: [
      { currentState: "DISCOVERED", nextState: "SOURCE_RETRIEVAL_REQUIRED" },
      { currentState: "SOURCE_RETRIEVAL_REQUIRED", required: ["qualificationComplete", "primaryAvailable", "nonEmptySeenFamilies"], next: "ISSUER_MAPPING_REQUIRED", else: "STOPPED_BLOCKED" },
      { currentState: "ISSUER_MAPPING_REQUIRED", required: ["qualificationComplete", "primaryAvailable", "nonEmptySeenFamilies", "issuerMapped"], next: "ASSET_MAPPING_REQUIRED", else: "STOPPED_BLOCKED" },
      { currentState: "ASSET_MAPPING_REQUIRED", required: ["assetMapped", "issuerMapped"], next: "PRIMARY_DISCLOSURE_REQUIRED", else: "STOPPED_BLOCKED" },
      { currentState: "PRIMARY_DISCLOSURE_REQUIRED", required: ["issuerMapped", "assetMapped", "primaryAvailable", "atLeastOneNonAggregatorSeenFamily"], else: "STOPPED_BLOCKED" },
      { currentState: "PRIMARY_DISCLOSURE_REQUIRED", eventHint: "COMPLETED_PURCHASE", required: ["completionMaterialPresent"], else: "STOPPED_BLOCKED" },
      { currentState: "PRIMARY_DISCLOSURE_REQUIRED", eventHintIn: ["BINDING_AGREEMENT", "EXPECTED_CLOSING", "COMPLETED_PURCHASE", "CORRECTION_AMENDMENT", "RETRACTION_WITHDRAWAL"], next: "CORRECTION_REVIEW_REQUIRED" },
      { currentState: "PRIMARY_DISCLOSURE_REQUIRED", otherwise: true, next: "CORRECTION_REVIEW_REQUIRED" },
      { currentState: "CORRECTION_REVIEW_REQUIRED", required: ["issuerMapped", "assetMapped", "atLeastOneNonAggregatorSeenFamily"], else: "STOPPED_BLOCKED" },
      { currentState: "CORRECTION_REVIEW_REQUIRED", requiredWhenCorrectionOrHint: ["correctionResolved"], else: "STOPPED_BLOCKED" },
      { currentState: "CORRECTION_REVIEW_REQUIRED", otherwise: true, next: "CORROBORATION_REVIEW_REQUIRED" },
      { currentState: "CORROBORATION_REVIEW_REQUIRED", next: "ELIGIBILITY_REVIEW_REQUIRED" },
      { currentState: "ELIGIBILITY_REVIEW_REQUIRED", next: "NON_AUTHORITATIVE_REVIEW_COMPLETE" },
    ],
    operationalPriority: [
      { condition: { field: "duplicate", equals: true }, result: "NO_ACTION_DUPLICATE" },
      { condition: { any: [{ field: "retracted", equals: true }, { field: "correctionPresent", equals: true }] }, result: "URGENT_CORRECTION_REVIEW" },
      { condition: { field: "rightsApproved", equals: false }, result: "BLOCKED_RIGHTS" },
      { condition: { any: [{ field: "primaryAvailable", equals: false }, { field: "preferredFamily", neitherSeenNorAvailable: true }] }, result: "PRIMARY_SOURCE_MISSING" },
      { condition: { any: [{ field: "issuerMapped", equals: false }, { field: "assetMapped", equals: false }] }, result: "MAPPING_REQUIRED" },
      { condition: { otherwise: true }, result: "ROUTINE_DISCOVERY_REVIEW" },
    ],
    sourceStrength: [
      { condition: { field: "seenFamilies", includes: "FILING_AUTHORITY" }, result: "FILING_PUBLICATION" },
      { condition: { field: "seenFamilies", includes: "REGULATORY_OR_EXCHANGE_DISCLOSURE" }, result: "REGULATORY_PUBLICATION" },
      { condition: { field: "seenFamilies", includes: "ISSUER_ATTRIBUTED_RELEASE" }, result: "ISSUER_ATTRIBUTED" },
      { condition: { otherwise: true }, result: "DISCOVERY_ONLY" },
    ],
    outputCollections: { seenFamilies: "UTF16_CODE_UNIT_SORTED_SET", degradationReasons: "UTF16_CODE_UNIT_SORTED_SET", conflictReasons: "UTF16_CODE_UNIT_SORTED_SET", correctionFieldHints: "UTF16_CODE_UNIT_SORTED_SET", originBindings: "PRESERVE_VALIDATED_INPUT_ORDER" },
    error: "ALL_INVALID_INPUT_AND_GUARD_FAILURES_RETURN_NULL; PRECEDENCE_FOLLOWS_CHECKS_ABOVE",
  },
  degradation: {
    acceptedReasons: ["PRIMARY_SOURCE_UNAVAILABLE", "SOURCE_QUALIFICATION_INCOMPLETE", "MAPPING_INCOMPLETE", "RIGHTS_UNAPPROVED", "CORRECTION_UNRESOLVED", "CONFLICTING_MATERIAL", "STALE_MATERIAL", "UNSUPPORTED_JURISDICTION", "INDEPENDENT_CORROBORATION_UNAVAILABLE", "CREDENTIAL_MISSING", "ACQUISITION_DISABLED", "DUPLICATE_MATERIAL"],
    rules: [
      { condition: { field: "duplicate", equals: true }, add: ["DUPLICATE_MATERIAL"] },
      { condition: { field: "rightsApproved", equals: false }, add: ["RIGHTS_UNAPPROVED"] },
      { condition: { field: "credentialAvailable", equals: false }, add: ["CREDENTIAL_MISSING"] },
      { condition: { field: "qualificationComplete", equals: false }, add: ["SOURCE_QUALIFICATION_INCOMPLETE"] },
      { condition: { any: [{ field: "issuerMapped", equals: false }, { field: "assetMapped", equals: false }] }, add: ["MAPPING_INCOMPLETE"] },
      { condition: { any: [{ field: "primaryAvailable", equals: false }, { field: "preferredFamily", equals: "NEITHER_SEEN_NOR_AVAILABLE" }] }, add: ["PRIMARY_SOURCE_UNAVAILABLE"] },
      { condition: { all: [{ field: "correctionPresent", equals: true }, { field: "correctionResolved", equals: false }] }, add: ["CORRECTION_UNRESOLVED"] },
      { condition: { field: "stale", equals: true }, add: ["STALE_MATERIAL"] },
      { condition: { field: "jurisdiction", oneOf: ["UNKNOWN", "DUAL_LISTED"] }, add: ["UNSUPPORTED_JURISDICTION"] },
      { condition: { field: "conflicts", nonEmpty: true }, add: ["CONFLICTING_MATERIAL"] },
      { condition: { all: [{ field: "eventHint", equals: "COMPLETED_PURCHASE" }, { any: [{ field: "completionMaterialPresent", equals: false }, { all: [{ field: "seenFamilies", excludes: "FILING_AUTHORITY" }, { field: "seenFamilies", excludes: "REGULATORY_OR_EXCHANGE_DISCLOSURE" }] }] }] }, add: ["PRIMARY_SOURCE_UNAVAILABLE"] },
      { condition: { any: [{ field: "eventHint", equals: "RETRACTION_WITHDRAWAL" }, { field: "retracted", equals: true }] }, add: ["CORRECTION_UNRESOLVED"] },
      { condition: { field: "nextState", oneOf: ["CORROBORATION_REVIEW_REQUIRED", "ELIGIBILITY_REVIEW_REQUIRED", "NON_AUTHORITATIVE_REVIEW_COMPLETE"] }, add: ["INDEPENDENT_CORROBORATION_UNAVAILABLE"] },
    ],
    output: "DEDUPLICATED_SET_SORTED_UTF16_CODE_UNITS; ACQUISITION_DISABLED_IS_ALWAYS_PRESENT",
  },
  resultContract: {
    status: "NON_AUTHORITATIVE_ROUTING_RESULT",
    authorityIssued: false,
    persistenceAllowed: false,
    signalEligible: false,
    tradingEligible: false,
    independentFactualOriginGroups: 0,
    independentFactualCorroboration: "UNSUPPORTED",
    publicationOriginGroupCount: "COUNT_DISTINCT_NON_NULL_ISSUER_ORIGIN_IDS",
    syndicatedCopyCount: "COUNT_BINDINGS_WITH_DISTRIBUTION_COPY_PARENT",
    degradationReasonsAlwaysContain: ["ACQUISITION_DISABLED"],
    immutable: true,
  },
  knownDecisionAlignment: {
    status: "PARENT_DECISION_AND_EVALUATOR_HAVE_DOCUMENTED_ALIGNMENT_GAPS",
    dualListedRoute: "ABSENT_FROM_PARENT_JURISDICTION_ROWS; EVALUATOR_USES_AGGREGATOR_FALLBACK_THEN_BLOCKS",
    eventRequiredState: "DESCRIPTIVE_PARENT_ROUTE; EVALUATOR_ALWAYS_STARTS_DISCOVERED_AND_USES_STAGE_BRANCHES",
    retractionDeclaration: "PARENT_EVENT_ROUTE_SAYS_RETRACTION_STOPS; EVALUATOR_ONLY_STOPS_ON_RETRACTED_FLAG_AND_DOES_NOT_STOP_ON_HINT_ALONE",
    notResolvedHere: ["Whether parent eventRoutes.required is a terminal target or descriptive earliest review stage", "Whether duplicate blocker outranks other blocker causes beyond current nextState and operationalPriority outputs"],
  },
  closure: {
    status: "ROUTING_RULES_MATERIALIZED_WITH_AUTHENTICITY_AND_PARENT_ALIGNMENT_LIMITS",
    gaps: [
      "This synthetic evaluator authenticates only the fixed source-portfolio decision and its own prior result; it does not authenticate discovery candidates or prove source type/family. Composition owns that check.",
      "The candidate binding omits stage-observation fields listed in progression.stageObservationFieldsAllowedToChange; later calls may change those inputs while retaining the candidate context binding.",
      "Parent eventRoutes.required semantics are not fully defined as terminal targets versus descriptive milestones; the evaluator starts from DISCOVERED and applies ordered stage branches.",
      "Parent eventRoutes marks RETRACTION_WITHDRAWAL as stopping, but the evaluator only blocks when the separate retracted boolean is true; a retraction hint alone can progress. The producer/contract owner must reconcile this before claiming event-route conformance.",
      "The parent decision also contains a declared jurisdiction/event table and transition graph. This material copies the tables and separately describes executable behavior; conformance does not establish complete equivalence for every input combination.",
      "Routing semantic identity does not include issuer/listing policy, queue classification, applied policy evidence, provenance completeness, or production authority.",
    ],
  },
});

export type RoutingSemanticMaterial = Readonly<typeof routingMaterial>;
export type RoutingSemanticMaterialParse =
  | Readonly<{ status: "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE"; material: RoutingSemanticMaterial }>
  | Readonly<{ status: "INVALID"; code: "ROUTING_SEMANTIC_MATERIAL_INVALID" }>;

const INVALID: RoutingSemanticMaterialParse = Object.freeze({ status: "INVALID", code: "ROUTING_SEMANTIC_MATERIAL_INVALID" });
export const ROUTING_SEMANTIC_MATERIAL = routingMaterial;

/** Validates the fixed routing material only; it neither applies rules nor mints routing trust. */
export function parseRoutingSemanticMaterial(input: unknown): RoutingSemanticMaterialParse {
  try {
    const copy = clonePlain(input, { nodes: 0, ancestors: new WeakSet() });
    if (!sameMaterial(copy, routingMaterial)) return INVALID;
    return Object.freeze({ status: "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE" as const, material: routingMaterial });
  } catch {
    return INVALID;
  }
}
