import "server-only";

import { types } from "node:util";
import productionConfig from "../../../config/intelligence/event-intelligence-evidence-review-queue-snapshot-producer.production.json";

export const EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PRODUCER_DECISION_VERSION =
  "event-intelligence-evidence-review-queue-snapshot-producer-authority-decision/v1" as const;
export const EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PRODUCER_CONFIG_VERSION =
  "event-intelligence-evidence-review-queue-snapshot-producer-production/v1" as const;

export const EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PRODUCER_FAMILIES = Object.freeze([
  "SEC_EVENT_DOCUMENT",
  "ISSUER_EVIDENCE",
  "ASSET_MAPPING_REVISION",
  "DISCOVERY_SOURCE_RECORD",
  "CORRECTION_LINEAGE",
  "DERIVED_COMPOSITION",
  "DERIVED_QUEUE_SET",
  "DERIVED_VIEW_MODEL",
] as const);

export type EvidenceReviewQueueSnapshotProducerFamily =
  typeof EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PRODUCER_FAMILIES[number];

const FAMILY_RULES = Object.freeze([
  Object.freeze({ family: "SEC_EVENT_DOCUMENT", role: "SOURCE_PARENT", rule: "Derive only exact SEC profile, filing, document/package/member or SEC-lineage keys actually consumed from authenticated SEC source material. A receipt is retrieval availability, not document identity." }),
  Object.freeze({ family: "ISSUER_EVIDENCE", role: "SOURCE_PARENT", rule: "Derive only from a separately approved, authenticated issuer-evidence contract and exact source-origin binding. No applied event issuer-evidence parent currently exists." }),
  Object.freeze({ family: "ASSET_MAPPING_REVISION", role: "MAPPING_PARENT", rule: "Include the exact mapping revision actually applied, including the complete eight-column M5 key where the M5 family applies. M5 authority does not itself establish an event-specific mapping decision." }),
  Object.freeze({ family: "DISCOVERY_SOURCE_RECORD", role: "SOURCE_PARENT", rule: "Derive from authenticated source records and their actual source type. Aggregator material must remain discovery-only and cannot be relabeled issuer, regulatory or filing evidence. No applied event discovery-source parent currently exists." }),
  Object.freeze({ family: "CORRECTION_LINEAGE", role: "CORRECTION_PARENT", rule: "Include every correction/retraction lineage that affected the result, with ordered revisions and the exact snapshot cutoff. A cutoff match does not prove lineage completeness; no applied event claim/correction parent currently exists." }),
  Object.freeze({ family: "DERIVED_COMPOSITION", role: "DERIVED_PARENT", rule: "Bind the exact authenticated composition contract and consumed material. Current composition is explicitly synthetic and has no scope-policy binding." }),
  Object.freeze({ family: "DERIVED_QUEUE_SET", role: "DERIVED_PARENT", rule: "Bind the exact sealed queue-set material and members produced from that same authenticated composition and cutoff. Module-local queue trust alone is not production authority." }),
  Object.freeze({ family: "DERIVED_VIEW_MODEL", role: "DERIVED_PARENT", rule: "Bind the exact safe view-model contract and payload actually emitted. The degraded projection omits domain IDs and lineage needed to reconstruct provenance." }),
] as const);

const BODY = Object.freeze({
  contractVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PRODUCER_DECISION_VERSION,
  status: "DECISION_ONLY_BLOCKED_UPSTREAM" as const,
  recommendation: "FUTURE_AUTHENTIC_PRODUCER_REQUIRED_BLOCKED_FOR_RUNTIME" as const,
  requiredProducerInputs: Object.freeze([
    "AUTHENTIC_COMPOSITION_AND_SEALED_QUEUE_RESULT_FROM_APPROVED_NON_SYNTHETIC_SOURCE_INPUTS",
    "EXPLICIT_REVIEW_UNIVERSE_SCOPE_MATERIAL_AND_RECOMPUTED_SCOPE_IDENTITY",
    "INDEPENDENTLY_VERIFIED_POLICY_CONTENT_AND_EXACT_APPLIED_POLICY_BINDINGS",
    "ONE_CANONICAL_CUTOFF_AND_EXACT_COMPOSITION_ROUTING_QUEUE_VIEW_AND_MANIFEST_VERSIONS",
    "AUTHENTIC_FAMILY_REFERENCES_AND_CLOSED_CANDIDATE_TO_PARENT_LINEAGE",
    "SEPARATE_RIGHTS_APPROVALS_FOR_ACQUISITION_PROCESSING_STORAGE_RETENTION_DELETION_AND_USE",
  ]),
  existingCapabilities: Object.freeze([
    "PROCESS_LOCAL_WEAKSET_AUTHENTICITY_FOR_DISCOVERY_CANDIDATE_ROUTING_RESULT_QUEUE_ITEM_AND_QUEUE_SET_OBJECTS",
    "SYNTHETIC_ONLY_IN_MEMORY_COMPOSITION_CHECKS_CANDIDATE_SOURCE_TYPE_CUTOFF_AND_LIFECYCLE_LINKS",
    "SCOPE_IDENTITY_BUILDER_CHECKS_CLOSED_SYNTAX_AND_HASHES_CALLER_SUPPLIED_POLICY_IDENTIFIERS_VERSIONS_AND_DIGESTS_ONLY",
    "MANIFEST_PARSER_CHECKS_CLOSED_FAMILY_REFERENCE_SYNTAX_NOT_PARENT_EXISTENCE_OR_AUTHENTIC_CLASSIFICATION",
    "SNAPSHOT_AND_MANIFEST_CODECS_AND_BINDING_VERIFIERS_CHECK_CANONICAL_BYTES_AND_CALLER_EXPECTED_DIGESTS_LOCALLY",
    "VIEW_MODEL_IS_A_DEGRADED_SERIALIZABLE_PROJECTION_NOT_AN_AUTHENTIC_COMPOSITION_OR_LINEAGE_RECORD",
  ]),
  missingPrerequisites: Object.freeze([
    "NO_PRODUCTION_AUTHENTIC_SOURCE_CANDIDATE_AND_COMPOSITION_CAPABILITY",
    "NO_SCOPE_POLICY_CONTENT_RESOLVER_OR_PROOF_THAT_SCOPE_BINDINGS_MATCH_POLICIES_ACTUALLY_APPLIED",
    "NO_AUTHENTIC_EXPECTATION_SOURCE_OR_CROSS_BOUND_EXPECTATION_RECORD",
    "NO_APPLIED_EVENT_ISSUER_EVIDENCE_DISCOVERY_SOURCE_OR_EVENT_CLAIM_CORRECTION_PARENTS",
    "NO_PRODUCER_DERIVATION_GRAPH_PROVING_ALL_USED_PARENTS_AND_NO_OMISSIONS",
    "NO_ROW_OR_CANDIDATE_LEVEL_LINEAGE_IN_THE_SNAPSHOT_LEVEL_MANIFEST",
    "NO_PRODUCTION_STORAGE_READ_CURRENT_SELECTION_OR_ACCESS_AUTHORIZATION_DECISION",
    "RIGHTS_RETENTION_AND_DELETION_ARE_NOT_APPROVED",
  ]),
  provenanceClosure: Object.freeze([
    "INCLUDE_EVERY_AUTHENTIC_SOURCE_MAPPING_CORRECTION_AND_DERIVED_PARENT_ACTUALLY_CONSUMED",
    "INCLUDE_EVERY_CORRECTION_OR_RETRACTION_THAT_AFFECTED_ROUTING_QUEUE_OR_VIEW_AT_THE_EXACT_CUTOFF",
    "DEDUPLICATE_SHARED_PARENTS_BY_COMPLETE_FAMILY_TAGGED_REFERENCE_ONLY",
    "PRESERVE_DISTINCT_REVISIONS_AND_ORDERED_LINEAGE_MEMBERS",
    "DO_NOT_ADD_UNRELATED_MEMBERS_TO_INCREASE_FAMILY_DIVERSITY_OR_COUNT",
    "IF_REQUIRED_UNIQUE_REFERENCES_EXCEED_128_FAIL_THE_WHOLE_PRODUCTION_ATTEMPT_WITHOUT_TRUNCATION_OMISSION_OR_SILENT_BATCHING",
  ]),
  familyRules: FAMILY_RULES,
  capacity: Object.freeze({ viewModelItems: 512, snapshotBytes: 1_048_576, manifestMembers: 128, manifestBytes: 786_432, scopeMaterialBytes: 18_264, overflow: "FAIL_CLOSED_NO_TRUNCATION_OR_IMPLICIT_BATCHING" as const }),
  semantics: Object.freeze({
    sourceFamily: "Authenticated source type controls family assignment; caller tags, generic IDs, provider IDs, URLs, digests, receipt IDs and family diversity cannot establish source authority.",
    scopePolicyApplication: "Each policy pin in scope material must be recomputed/resolved against immutable approved policy material and match the exact policy version/material consumed by composition. The current composition input has no scope or policy binding, and the scope builder treats policy IDs/versions/digests as syntax only.",
    completeness: "The manifest is a snapshot-level reference inventory. Completeness requires an authenticated derivation graph from every candidate and applied decision to every used source, mapping, correction and derived parent; the current manifest parser, codec, canonical ordering and digest cannot prove that graph or detect omitted parents.",
    originIndependence: "Assess the authenticated original publisher/material lineage and shared-origin graph. Distinct providers, URLs, family tags or member counts are not proof of independent origins.",
    correctionAndHistory: "Correction/retraction/supersession creates a new immutable declaration and snapshot. Correction evaluationAsOf must equal the envelope cutoff; historical and superseded are independent fields and the producer does not select current state.",
    capacity: "A 512-item view-model can require more than 128 distinct source, mapping, correction and derived references. If complete closure does not fit both manifest limits, reject atomically. Pagination, batching and scope splitting require a separate decision.",
    artifactAndReadBoundary: "The future producer may emit canonical snapshot bytes/digest, canonical manifest bytes/digest and scope identity alongside separate producer/policy evidence. Local recomputed digests, authentic producer context, any future stored expectation and approved read selection are separate concepts. This decision selects no storage backend or current pointer.",
    rights: "Access classification labels a scope and is not access authorization. Acquisition, processing, content/reference/derived storage, retention, deletion, redistribution and commercial-use rights require separate approvals.",
  }),
  appliedAndMissingAuthorities: Object.freeze({
    secEventDocument: "SEC document/profile/filing/package/member/receipt/lineage keys are applied within the SEC source contract only; they do not authorize snapshot or producer persistence.",
    m5AssetMapping: "M5 mapping is applied only within M5 and uses (mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class). It is not an event-intelligence mapping bridge.",
    missingEventFamilies: "Issuer evidence, discovery source records and normalized event claim/correction parents have no applied event persistence in tracked migrations. Sibling qualifications are not applied provenance.",
    derivedFamilies: "Composition, queue-set and view-model family references are in-memory derived identities, not applied parent tables or foreign keys.",
  }),
  futurePrerequisiteOrder: Object.freeze([
    "APPROVE_RIGHTS_SCOPE_AND_AUTHENTIC_EXPECTATION_OWNERSHIP",
    "DEFINE_APPLIED_SOURCE_AND_EVENT_MAPPING_PARENTS_WITH_FAMILY_SPECIFIC_KEYS",
    "DEFINE_AUTHENTIC_CANDIDATE_AND_COMPOSITION_INPUTS_WITH_POLICY_APPLICATION_BINDINGS",
    "DEFINE_ROW_CANDIDATE_AND_PROVENANCE_CLOSURE_WITH_ATOMIC_CAPACITY_FAILURE",
    "DEFINE_AUTHENTIC_MANIFEST_PRODUCTION_AND_EXPECTATION_RECORD",
    "SEPARATELY_DECIDE_STORAGE_READ_ACCESS_AND_CURRENT_SELECTION",
  ]),
  productionApprovals: Object.freeze({ producer: "NOT_APPROVED", rights: "NOT_APPROVED", sourceAcquisition: "NOT_APPROVED", processing: "NOT_APPROVED", rawAndReferenceStorage: "NOT_APPROVED", derivedStorage: "NOT_APPROVED", retention: "NOT_APPROVED", deletion: "NOT_APPROVED", redistribution: "NOT_APPROVED", commercialUse: "NOT_APPROVED", accessAuthorization: "NOT_APPROVED" }),
});

export type EvidenceReviewQueueSnapshotProducerAuthorityDecision = Readonly<typeof BODY>;
export type EvidenceReviewQueueSnapshotProducerAuthorityDecisionParse =
  | Readonly<{ status: "VALID_DECISION_ONLY_BLOCKED_UPSTREAM"; decision: EvidenceReviewQueueSnapshotProducerAuthorityDecision }>
  | Readonly<{ status: "INVALID"; code: "PRODUCER_AUTHORITY_DECISION_INVALID" }>;

const INVALID_DECISION = Object.freeze({ status: "INVALID", code: "PRODUCER_AUTHORITY_DECISION_INVALID" }) as EvidenceReviewQueueSnapshotProducerAuthorityDecisionParse;
const INVALID_CONFIG = Object.freeze({ status: "INVALID", code: "PRODUCER_AUTHORITY_CONFIG_INVALID" });

type WalkState = { nodes: number; ancestors: WeakSet<object> };
function clonePlain(value: unknown, state: WalkState, depth = 0): unknown {
  if (++state.nodes > 20_000 || depth > 16) throw new Error("INVALID");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > 2_048 || /[\p{Cc}\p{Cf}]/u.test(value)) throw new Error("INVALID");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error("INVALID");
    return value;
  }
  if (typeof value !== "object" || types.isProxy(value)) throw new Error("INVALID");
  if (state.ancestors.has(value)) throw new Error("INVALID");
  state.ancestors.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error("INVALID");
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > 256 || Reflect.ownKeys(value).length !== length + 1) throw new Error("INVALID");
    const output: unknown[] = [];
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("INVALID");
      output.push(clonePlain(descriptor.value, state, depth + 1));
    }
    state.ancestors.delete(value);
    return output;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(Object.prototype).some(key => typeof key !== "string" || !["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"].includes(key))) throw new Error("INVALID");
  const keys = Reflect.ownKeys(value);
  if (keys.length > 64) throw new Error("INVALID");
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string" || key === "__proto__" || key === "constructor" || key === "prototype" || key.length > 128) throw new Error("INVALID");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("INVALID");
    output[key] = clonePlain(descriptor.value, state, depth + 1);
  }
  state.ancestors.delete(value);
  return output;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort((left, right) => left < right ? -1 : left > right ? 1 : 0).map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value as object)) {
      const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
      if (descriptor && "value" in descriptor) deepFreeze(descriptor.value);
    }
    Object.freeze(value);
  }
  return value;
}

const trustedDecision = deepFreeze(BODY) as EvidenceReviewQueueSnapshotProducerAuthorityDecision;
const trustedConfig = deepFreeze({
  contractVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PRODUCER_CONFIG_VERSION,
  producerActivation: "BLOCKED",
  selectedProducer: null,
  selectedAuthorityStrategy: null,
  activeProducerRegistry: [],
  activeScopeRegistry: [],
  activeProvenanceRegistry: [],
  approvals: { producer: "NOT_APPROVED", rights: "NOT_APPROVED", sourceAcquisition: "NOT_APPROVED", processing: "NOT_APPROVED", rawAndReferenceStorage: "NOT_APPROVED", derivedStorage: "NOT_APPROVED", retention: "NOT_APPROVED", deletion: "NOT_APPROVED", redistribution: "NOT_APPROVED", commercialUse: "NOT_APPROVED", accessAuthorization: "NOT_APPROVED" },
  persistence: "BLOCKED",
  readPath: "BLOCKED",
  currentSelection: "BLOCKED",
  authorityUpgrade: "UNSUPPORTED",
  signal: "BLOCKED",
  trading: "BLOCKED",
});

export type EvidenceReviewQueueSnapshotProducerProductionConfig = typeof trustedConfig;
export type EvidenceReviewQueueSnapshotProducerProductionConfigParse =
  | Readonly<{ status: "VALID_BLOCKED"; config: EvidenceReviewQueueSnapshotProducerProductionConfig }>
  | typeof INVALID_CONFIG;

export const EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PRODUCER_AUTHORITY_DECISION = trustedDecision;
export const EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PRODUCER_PRODUCTION_CONFIG = trustedConfig;

/** Exact syntax check for the fixed decision; success does not establish implementation or authority. */
export function parseEvidenceReviewQueueSnapshotProducerAuthorityDecision(input: unknown): EvidenceReviewQueueSnapshotProducerAuthorityDecisionParse {
  try {
    const cloned = clonePlain(input, { nodes: 0, ancestors: new WeakSet() });
    if (canonical(cloned) !== canonical(trustedDecision)) return INVALID_DECISION;
    return Object.freeze({ status: "VALID_DECISION_ONLY_BLOCKED_UPSTREAM", decision: trustedDecision });
  } catch { return INVALID_DECISION; }
}

/** Accepts only the exact hard-blocked config; caller claims cannot activate a producer. */
export function parseEvidenceReviewQueueSnapshotProducerProductionConfig(input: unknown): EvidenceReviewQueueSnapshotProducerProductionConfigParse {
  try {
    const cloned = clonePlain(input, { nodes: 0, ancestors: new WeakSet() });
    if (canonical(cloned) !== canonical(trustedConfig) || canonical(cloned) !== canonical(productionConfig)) return INVALID_CONFIG;
    return Object.freeze({ status: "VALID_BLOCKED", config: trustedConfig });
  } catch { return INVALID_CONFIG; }
}

const configuredProduction = parseEvidenceReviewQueueSnapshotProducerProductionConfig(productionConfig);
if (configuredProduction.status !== "VALID_BLOCKED") throw new Error("PRODUCER_AUTHORITY_CONFIG_INVALID");
