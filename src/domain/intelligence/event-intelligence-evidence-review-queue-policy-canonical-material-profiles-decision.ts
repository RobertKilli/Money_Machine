import "server-only";

import { types } from "node:util";
import productionConfig from "../../../config/intelligence/event-intelligence-evidence-review-queue-policy-canonical-material-profiles.production.json";

export const POLICY_CANONICAL_MATERIAL_DECISION_VERSION =
  "event-intelligence-evidence-review-queue-policy-canonical-material-profiles-decision/v1" as const;
export const POLICY_CANONICAL_MATERIAL_CONFIG_VERSION =
  "event-intelligence-evidence-review-queue-policy-canonical-material-profiles-production/v1" as const;

const PROFILE_MATRIX = Object.freeze([
  Object.freeze({
    family: "ISSUER_LISTING_POLICY",
    disposition: "RECOMMENDED_NOT_IMPLEMENTED",
    currentRepresentation: "Scope v1 carries policyId/version/canonicalMaterialDigest; no issuer/listing policy material or applying runtime is tracked.",
    currentContractVersion: "MISSING_RUNTIME_CONTRACT",
    currentDigestMeaning: "A caller-supplied lowercase SHA-256-shaped string included in scope syntax; it is not checked against policy content.",
    materialProfileVersion: "event-intelligence-issuer-listing-policy-material/v1",
    canonicalizationProfile: "event-intelligence-policy-canonical-json/v1",
    requiredSemantics: Object.freeze(["closed issuer/listing/asset relationship rules actually supported by a future approved contract", "allow/deny conflicts and precedence", "jurisdiction/listing eligibility and missing/default behavior", "transitive policy references by family/profile/content identity"]),
    excluded: "Issuer names, UI labels, source artifacts, approvals, runtime application claims, and unrelated evidence are not policy content.",
    missing: "Material schema, canonical profile application, parser, resolver, approved registry, applied mapping authority, and runtime consumer are all MISSING.",
    futureOwner: "A separately approved issuer/listing policy contract and resolver, then the module that applies its rules during composition.",
    requiresNewScopeMaterialVersion: true,
  }),
  Object.freeze({
    family: "SOURCE_PORTFOLIO_POLICY",
    disposition: "RECOMMENDED_NOT_IMPLEMENTED",
    currentRepresentation: "Scope v1 carries the fixed source-portfolio contractVersion plus caller-supplied canonicalMaterialDigest.",
    currentContractVersion: "event-intelligence-source-portfolio-routing-decision/v1",
    currentDigestMeaning: "Scope syntax only; the scope builder does not compare this digest with the decision's internal fingerprint or material.",
    materialProfileVersion: "event-intelligence-source-portfolio-policy-material/v1",
    canonicalizationProfile: "event-intelligence-policy-canonical-json/v1",
    requiredSemantics: Object.freeze(["source families and strength classes", "jurisdiction route precedence and unknown-jurisdiction behavior", "event route requirements and correction/retraction stops", "states and allowed transitions", "degradation/conflict rules and origin rules", "priority order, coverage dimensions, budgets, approvals and production blockers", "decision status and fixed contract version; exclude recordedAt and self-fingerprint"]),
    excluded: "Runtime credentials, fetched source records, evaluation cutoff, approvals-as-facts, and code/build hashes are not decision material.",
    missing: "No resolver binds the scope digest to the fixed decision material; the versioned data does not by itself capture all evaluator algorithm semantics or prove this decision was used by a composition.",
    futureOwner: "Source-portfolio policy contract/profile and resolver; composition must attest the exact decision consumed.",
    requiresNewScopeMaterialVersion: true,
  }),
  Object.freeze({
    family: "ROUTING_POLICY",
    disposition: "RECOMMENDED_NOT_IMPLEMENTED",
    currentRepresentation: "Scope v1 carries policyId/version/canonicalMaterialDigest. Runtime routing currently consumes synthetic routing material and the fixed source-portfolio decision; no independently resolved routing-policy material is present.",
    currentContractVersion: "MISSING_SEPARATE_ROUTING_POLICY_CONTRACT",
    currentDigestMeaning: "A caller-supplied syntax-shaped digest; it is not compared with routing rules or evaluator semantics.",
    materialProfileVersion: "event-intelligence-routing-policy-material/v1",
    canonicalizationProfile: "event-intelligence-policy-canonical-json/v1",
    requiredSemantics: Object.freeze(["jurisdiction/event route choices and their order", "state progression and fallback/stop behavior", "source classification inputs and conflict/degradation behavior", "correction/retraction handling and cutoff rules", "defaults, absent-value semantics, and algorithm contract version"]),
    excluded: "Candidate/source rows, cutoff instance, route evaluation outputs, caller assertions, and executable source/build hashes are not policy material.",
    missing: "A distinct routing-policy schema, canonical material, content resolver and applied registry are MISSING; current evaluator behavior is not fully identified by the generic scope reference.",
    futureOwner: "A reviewed routing semantic contract/profile and the routing evaluator that applies it; composition binds the selected version and exact result.",
    requiresNewScopeMaterialVersion: true,
  }),
  Object.freeze({
    family: "QUEUE_CONTRACT",
    disposition: "RECOMMENDED_NOT_IMPLEMENTED",
    currentRepresentation: "Scope v1 carries the fixed event-intelligence-evidence-review-queue-contract/v1 plus caller-supplied canonicalMaterialDigest.",
    currentContractVersion: "event-intelligence-evidence-review-queue-contract/v1",
    currentDigestMeaning: "Scope syntax only; it is not checked against CONTRACT_MATERIAL or the queue's internal fingerprint.",
    materialProfileVersion: "event-intelligence-evidence-review-queue-policy-material/v1",
    canonicalizationProfile: "event-intelligence-policy-canonical-json/v1",
    requiredSemantics: Object.freeze(["item types, statuses and blocker vocabulary", "classification and blocker/forbidden-conclusion mappings", "conflict action precedence and priority mapping", "historical/correction rules, sort policy and queue-set membership/ordinal invariants", "view-model boundary, approvals and production blockers", "queue contract and classification algorithm versions"]),
    excluded: "Queue members, per-evaluation cutoff, snapshot bytes, item counts, producer provenance and approval decisions are not contract material.",
    missing: "No resolver maps the scope digest to the fixed CONTRACT_MATERIAL; code-level classify/blocker behavior requires explicit semantic version governance beyond hashing the data object.",
    futureOwner: "Queue contract/profile and resolver; queue sealer/composition binds the exact contract semantics applied.",
    requiresNewScopeMaterialVersion: true,
  }),
] as const);

const BODY = Object.freeze({
  contractVersion: POLICY_CANONICAL_MATERIAL_DECISION_VERSION,
  status: "DECISION_ONLY_BLOCKED_UPSTREAM" as const,
  recommendation: "DEFINE_FAMILY_SPECIFIC_CANONICAL_POLICY_MATERIAL_BEFORE_ANY_RESOLVER_OR_APPLICATION_RUNTIME" as const,
  canonicalProfile: Object.freeze({
    proposedProfile: "event-intelligence-policy-canonical-json/v1",
    disposition: "RECOMMENDED_NOT_IMPLEMENTED" as const,
    schemaRules: Object.freeze([
      "Each family has a closed material schema with explicit profile and policy/algorithm contract versions.",
      "Canonical bytes are compact UTF-8 JSON: recursively UTF-16-code-unit-sorted object keys, preserved semantically ordered arrays, and schema-tagged SET fields sorted by UTF-16 code units with duplicates rejected. The closed schema/profile version determines each field's set-versus-ordered-array meaning.",
      "Encode strings as Unicode scalar values: escape quote and reverse-solidus, encode U+0000..U+001F with JSON short escapes for backspace/tab/line-feed/form-feed/carriage-return and lowercase \\u00xx for the rest, leave slash and other scalars unescaped as UTF-8; reject lone surrogates and do not normalize. Encode only safe integers in minimal base-10 form; reject fractions, exponent form, unsafe integers, non-finite values, and negative zero.",
      "Reject accessors, custom prototypes, symbols, non-enumerable and extra fields, sparse arrays, cycles, unsupported primitives, and invalid text; do not trim, case-fold, or Unicode-normalize.",
      "A family-specific content identity uses SHA-256 lowercase hex over the exact preimage specified below; no digest is included in its own material.",
      "Policy families and profile versions have separate domains; unknown future versions fail closed.",
      "Future byte, depth, node, string, and collection limits must be documented per profile; enforce before expensive work and fail the entire operation without truncation.",
    ]),
    preimage: "ASCII(\"event-intelligence-policy-content-identity/v1\\0\") || UTF8(familyTag) || 0x00 || UTF8(materialProfileVersion) || 0x00 || UTF8(canonicalizationProfile) || 0x00 || canonicalMaterialBytes",
    preimageFieldRules: "The quoted domain notation denotes the ASCII bytes for event-intelligence-policy-content-identity/v1 followed by exactly one 0x00 byte; the quotes are explanatory and are not hashed. familyTag is exactly one of ISSUER_LISTING_POLICY, SOURCE_PORTFOLIO_POLICY, ROUTING_POLICY, QUEUE_CONTRACT. materialProfileVersion is one of the four profile identifiers in profiles; canonicalizationProfile is event-intelligence-policy-canonical-json/v1. These three identifiers are ASCII, at most 128 bytes each, and contain no NUL. Each 0x00 shown between fields is exactly one separator byte. Every family material schema must include its policy-contract and algorithm-semantic versions as fields in canonicalMaterialBytes; they are not implicit in the external tags. The final canonicalMaterialBytes contain compact canonical JSON and no extra terminator.",
    digest: "SHA-256 lowercase hexadecimal over the complete preimage. Prefix/identity-domain bytes and canonicalMaterialBytes are separate length-accounting components; the future profile must define each limit explicitly.",
    canonicalBytes: "No BOM, whitespace, trailing newline, or normalization. Arrays retain order unless a closed schema marks a particular field as a semantic set.",
    closure: "Material must cover all result-affecting defaults, allow/deny and conflict resolution, priorities/fallbacks, source classifications, jurisdiction/event constraints, issuer/listing/asset relations, routing progression, queue inclusion/exclusion, correction/retraction semantics, and transitive references. Unsupported or unresolved rules block profile closure.",
    algorithmSemantics: "A versioned semantic contract and conformance fixtures govern code behavior. A digest over parameter data does not identify all executable semantics; do not hash function source, build output, or Git SHA as a substitute.",
    transitiveReferences: "References are closed family/profile/content-identity edges. Resolve a finite acyclic closure under explicit rules; reject cycles, missing targets and ambiguous/default substitution. Never include a material's own digest in its preimage.",
  }),
  profiles: PROFILE_MATRIX,
  identityLayers: Object.freeze({
    referenceSyntax: "Existing scope v1 validates identifier/version syntax and lowercase digest shape only.",
    policyContentIdentity: "A future family/profile-specific SHA-256 identifies exact canonical material bytes under the family/profile-bound preimage; it does not verify itself or its source.",
    semanticVersion: "Policy/algorithm contract version plus reviewed semantic contract and conformance behavior; content identity alone is not proof that code implements the semantics.",
    digestVerification: "A future resolver must recompute from validated material bytes and compare with a separately trusted expected identity. This decision implements no resolver or expectation source.",
    actualApplication: "Only the module applying the exact validated policy during a concrete composition can produce future local application evidence bound to that evaluation/result; the existing application contract remains MISSING_RUNTIME_RESULT_BINDING.",
    approvalAuthority: "Approval, access authorization, rights, registry membership, producer authority and domain authority remain separate blocked gates.",
  }),
  scopeCompatibility: Object.freeze({
    preserveV1: "Do not reinterpret current scope v1 canonicalMaterialDigest values. They are syntax-shaped caller values and are included in the existing scope identity material, but are not verified against policy content.",
    nextScopeVersion: "Adopting family/profile-tagged policy identities changes reference shape/meaning and therefore requires a separately reviewed scope-material v2; do not alter v1 identity, canonicalization profile, domain prefix, golden identity, or 18,264-byte bound here.",
    neverInScopeIdentity: "Cutoff, snapshot/manifest digest, artifact IDs, receipt time and UI filters remain outside scope identity. Priority-bearing policy arrays remain ordered, not sets.",
    applicationEvidence: "The existing application declaration remains VALID_SYNTAX_ONLY_NON_AUTHORITATIVE with resultBinding MISSING_RUNTIME_RESULT_BINDING. Matching caller declarations do not prove policy application.",
  }),
  blockers: Object.freeze([
    "ISSUER_LISTING_POLICY_MATERIAL_AND_RUNTIME_CONTRACT_MISSING",
    "FAMILY_SPECIFIC_CANONICAL_MATERIAL_PROFILES_NOT_IMPLEMENTED",
    "EXISTING_SCOPE_DIGESTS_NOT_RESOLVED_OR_VERIFIED_AGAINST_POLICY_CONTENT",
    "ROUTING_AND_QUEUE_CODE_SEMANTICS_NOT_FULLY_BOUND_BY_DATA_MATERIAL",
    "NO_APPROVED_POLICY_REGISTRY_OR_AUTHENTIC_EXPECTATION_SOURCE",
    "NO_RUNTIME_POLICY_APPLICATION_EVIDENCE_BOUND_TO_COMPOSITION_RESULT",
    "RIGHTS_ACCESS_APPROVAL_AND_PRODUCER_AUTHORITY_NOT_APPROVED",
  ]),
  recommendedNextPrerequisite: "Define and review the closed v2 scope-reference shape that carries family, material-profile version and content identity while preserving v1 unchanged; first establish canonical semantic material for source-portfolio and queue contracts whose fixed rule tables are tracked, and keep issuer/listing/routing profiles blocked until their missing contracts are specified.",
});

export type PolicyCanonicalMaterialProfilesDecision = Readonly<typeof BODY>;
export type PolicyCanonicalMaterialProfilesDecisionParse =
  | Readonly<{ status: "VALID_DECISION_ONLY_BLOCKED_UPSTREAM"; decision: PolicyCanonicalMaterialProfilesDecision }>
  | Readonly<{ status: "INVALID"; code: "POLICY_CANONICAL_MATERIAL_DECISION_INVALID" }>;

const INVALID_DECISION = Object.freeze({ status: "INVALID", code: "POLICY_CANONICAL_MATERIAL_DECISION_INVALID" }) as PolicyCanonicalMaterialProfilesDecisionParse;
const INVALID_CONFIG = Object.freeze({ status: "INVALID", code: "POLICY_CANONICAL_MATERIAL_CONFIG_INVALID" });
const INTRINSICS = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);

type WalkState = { nodes: number; ancestors: WeakSet<object> };
function clonePlain(value: unknown, state: WalkState, depth = 0): unknown {
  if (++state.nodes > 10_000 || depth > 12) throw new Error("INVALID");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") { if (value.length > 4_096 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) throw new Error("INVALID"); return value; }
  if (typeof value === "number") { if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error("INVALID"); return value; }
  if (typeof value !== "object" || types.isProxy(value)) throw new Error("INVALID");
  if (state.ancestors.has(value)) throw new Error("INVALID");
  state.ancestors.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error("INVALID");
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > 128 || Reflect.ownKeys(value).length !== length + 1) throw new Error("INVALID");
    const output: unknown[] = [];
    for (let i = 0; i < length; i++) { const descriptor = Object.getOwnPropertyDescriptor(value, String(i)); if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("INVALID"); output.push(clonePlain(descriptor.value, state, depth + 1)); }
    state.ancestors.delete(value); return output;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(Object.prototype).some(key => typeof key !== "string" || !INTRINSICS.has(key))) throw new Error("INVALID");
  const keys = Reflect.ownKeys(value);
  if (keys.length > 64) throw new Error("INVALID");
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    if (typeof key !== "string" || key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("INVALID");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("INVALID");
    output[key] = clonePlain(descriptor.value, state, depth + 1);
  }
  state.ancestors.delete(value); return output;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort((a, b) => a < b ? -1 : a > b ? 1 : 0).map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value as object)) { const descriptor = Object.getOwnPropertyDescriptor(value as object, key); if (descriptor && "value" in descriptor) deepFreeze(descriptor.value); }
    Object.freeze(value);
  }
  return value;
}

const trustedDecision = deepFreeze(BODY) as PolicyCanonicalMaterialProfilesDecision;
const trustedConfig = deepFreeze({
  contractVersion: POLICY_CANONICAL_MATERIAL_CONFIG_VERSION,
  selectedMaterialVerificationStrategy: null,
  selectedPolicyResolver: null,
  activeProfileRegistry: [],
  activePolicyRegistry: [],
  activeProducerRegistry: [],
  contentVerification: "BLOCKED",
  applicationEvidence: "BLOCKED",
  producer: "BLOCKED",
  approvals: { policyContent: "NOT_APPROVED", applicationEvidence: "NOT_APPROVED", producer: "NOT_APPROVED", rights: "NOT_APPROVED", retention: "NOT_APPROVED", deletion: "NOT_APPROVED", accessAuthorization: "NOT_APPROVED" },
  persistence: "BLOCKED",
  storageRead: "BLOCKED",
  currentSelection: "BLOCKED",
  authorityUpgrade: "UNSUPPORTED",
  signal: "BLOCKED",
  trading: "BLOCKED",
});

export type PolicyCanonicalMaterialProfilesProductionConfig = typeof trustedConfig;
export type PolicyCanonicalMaterialProfilesProductionConfigParse =
  | Readonly<{ status: "VALID_BLOCKED"; config: PolicyCanonicalMaterialProfilesProductionConfig }>
  | typeof INVALID_CONFIG;

export const POLICY_CANONICAL_MATERIAL_PROFILES_DECISION = trustedDecision;
export const POLICY_CANONICAL_MATERIAL_PROFILES_PRODUCTION_CONFIG = trustedConfig;

/** Validates only the closed recommendation; success says nothing about implemented profiles. */
export function parsePolicyCanonicalMaterialProfilesDecision(input: unknown): PolicyCanonicalMaterialProfilesDecisionParse {
  try {
    const cloned = clonePlain(input, { nodes: 0, ancestors: new WeakSet() });
    if (canonical(cloned) !== canonical(trustedDecision)) return INVALID_DECISION;
    return Object.freeze({ status: "VALID_DECISION_ONLY_BLOCKED_UPSTREAM" as const, decision: trustedDecision });
  } catch { return INVALID_DECISION; }
}

/** Accepts only the fixed blocked config; it cannot activate material verification. */
export function parsePolicyCanonicalMaterialProfilesProductionConfig(input: unknown): PolicyCanonicalMaterialProfilesProductionConfigParse {
  try {
    const cloned = clonePlain(input, { nodes: 0, ancestors: new WeakSet() });
    if (canonical(cloned) !== canonical(trustedConfig) || canonical(cloned) !== canonical(productionConfig)) return INVALID_CONFIG;
    return Object.freeze({ status: "VALID_BLOCKED" as const, config: trustedConfig });
  } catch { return INVALID_CONFIG; }
}

const configured = parsePolicyCanonicalMaterialProfilesProductionConfig(productionConfig);
if (configured.status !== "VALID_BLOCKED") throw new Error("POLICY_CANONICAL_MATERIAL_CONFIG_INVALID");
