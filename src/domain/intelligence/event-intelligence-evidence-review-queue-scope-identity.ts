import "server-only";

import { createHash } from "node:crypto";
import { types } from "node:util";
import { EVIDENCE_REVIEW_QUEUE_VERSION } from "./event-intelligence-evidence-review-queue";
import { SOURCE_PORTFOLIO_DECISION_VERSION } from "./event-intelligence-source-portfolio-routing-decision";

export const EVIDENCE_QUEUE_SCOPE_MATERIAL_VERSION = "event-intelligence-evidence-review-queue-scope-material/v1" as const;
export const EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE = "event-intelligence-evidence-review-queue-scope-canonical-json/v1" as const;
export const EVIDENCE_QUEUE_SCOPE_IDENTITY_DOMAIN = "event-intelligence-evidence-review-queue-snapshot-scope/v1\0" as const;
export const EVIDENCE_QUEUE_SCOPE_IDENTITY_LIMITS = Object.freeze({ maxBytes: 16_384, maxStringCodeUnits: 256, maxSetMembers: 64, maxDepth: 6, maxNodes: 256 });

export const EVIDENCE_QUEUE_SCOPE_PURPOSES = Object.freeze(["FORMAL_ISSUER_DISCLOSURE_REVIEW", "CRYPTO_TREASURY_DISCLOSURE_REVIEW"] as const);
export const EVIDENCE_QUEUE_SCOPE_JURISDICTIONS = Object.freeze(["AU_ASX", "DUAL_LISTED", "GB_LSE", "UNKNOWN", "UNLISTED", "US_SEC"] as const);
export const EVIDENCE_QUEUE_SCOPE_EVENT_CATEGORIES = Object.freeze([
  "BOARD_AUTHORIZATION", "BINDING_AGREEMENT", "CANCELLATION_TERMINATION", "COMPLETED_PURCHASE", "CORRECTION_AMENDMENT",
  "EXPECTED_CLOSING", "PURCHASE_INTENT", "RETRACTION_WITHDRAWAL", "TREASURY_POLICY", "UNRELATED_CORPORATE_ACTION", "UNKNOWN",
] as const);
export const EVIDENCE_QUEUE_SCOPE_ACCESS_CLASSIFICATIONS = Object.freeze(["INTERNAL_GENERAL", "INTERNAL_RESTRICTED"] as const);

export type EvidenceQueueScopePolicyReference = Readonly<{ policyId: string; version: string; canonicalMaterialDigest: string }>;
export type EvidenceQueueScopeMaterial = Readonly<{
  scopeMaterialVersion: typeof EVIDENCE_QUEUE_SCOPE_MATERIAL_VERSION;
  canonicalizationProfile: typeof EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE;
  reviewPurposePolicyVersion: "event-intelligence-review-purpose/v1";
  reviewPurpose: typeof EVIDENCE_QUEUE_SCOPE_PURPOSES[number];
  jurisdictionUniverse: readonly typeof EVIDENCE_QUEUE_SCOPE_JURISDICTIONS[number][];
  eventRepresentationUniverse: readonly typeof EVIDENCE_QUEUE_SCOPE_EVENT_CATEGORIES[number][];
  assetRepresentationUniverse: readonly string[];
  issuerListingEligibilityPolicy: EvidenceQueueScopePolicyReference;
  sourcePortfolioPolicy: Readonly<{ contractVersion: typeof SOURCE_PORTFOLIO_DECISION_VERSION; canonicalMaterialDigest: string }>;
  routingPolicy: EvidenceQueueScopePolicyReference;
  queueContract: Readonly<{ contractVersion: typeof EVIDENCE_REVIEW_QUEUE_VERSION; canonicalMaterialDigest: string }>;
  accessClassificationPolicyVersion: "event-intelligence-review-access-classification/v1";
  accessClassification: typeof EVIDENCE_QUEUE_SCOPE_ACCESS_CLASSIFICATIONS[number];
}>;

export type EvidenceQueueScopeIdentityErrorCode = "SCOPE_MATERIAL_INVALID" | "SCOPE_MATERIAL_LIMIT_EXCEEDED" | "SCOPE_IDENTITY_INVALID" | "SCOPE_IDENTITY_MISMATCH";
export type EvidenceQueueScopeIdentityResult = Readonly<{ status: "VALID_SYNTAX_ONLY"; classification: "NON_AUTHORITATIVE_SYNTACTIC_IDENTITY"; scopeMaterial: EvidenceQueueScopeMaterial; canonicalMaterial: string; canonicalBytes: Uint8Array; identity: string; algorithm: "SHA-256"; canonicalizationProfile: typeof EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE }> | Readonly<{ status: "INVALID"; code: EvidenceQueueScopeIdentityErrorCode }>;
export type EvidenceQueueScopeIdentityVerification = Readonly<{ status: "IDENTITY_MATCHES_SYNTACTIC_MATERIAL"; classification: "NON_AUTHORITATIVE_SYNTACTIC_IDENTITY"; identity: string; canonicalMaterial: string }> | Readonly<{ status: "INVALID"; code: EvidenceQueueScopeIdentityErrorCode }>;

const INVALID = (code: EvidenceQueueScopeIdentityErrorCode) => Object.freeze({ status: "INVALID" as const, code });
const DIGEST = /^[a-f0-9]{64}$/;
const POLICY_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const POLICY_VERSION = /^v[1-9][0-9]{0,3}$/;
const ASSET_REPRESENTATION = /^asset-representation\/v1\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const encoder = new TextEncoder();

function stringSafe(value: unknown, max: number = EVIDENCE_QUEUE_SCOPE_IDENTITY_LIMITS.maxStringCodeUnits): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || /\p{Cc}|\p{Cf}/u.test(value)) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(i + 1); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; i++; }
    else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function plainObject(value: unknown, expected: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const own = Reflect.ownKeys(value);
  if (own.length !== expected.length || own.some(key => typeof key !== "string" || !expected.includes(key))) return null;
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    output[key] = descriptor.value;
  }
  return output;
}

function semanticSet(value: unknown, allowed?: readonly string[]): string[] | null {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || length < 1 || length > EVIDENCE_QUEUE_SCOPE_IDENTITY_LIMITS.maxSetMembers || Reflect.ownKeys(value).length !== length + 1) return null;
  const members: string[] = [];
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || !stringSafe(descriptor.value)) return null;
    if (allowed && !allowed.includes(descriptor.value)) return null;
    members.push(descriptor.value);
  }
  if (new Set(members).size !== members.length) return null;
  return members.sort(cmp);
}

function validatePolicy(value: unknown): EvidenceQueueScopePolicyReference | null {
  const policy = plainObject(value, ["policyId", "version", "canonicalMaterialDigest"]);
  if (!policy || !stringSafe(policy.policyId, 96) || !POLICY_ID.test(policy.policyId) || !stringSafe(policy.version, 16) || !POLICY_VERSION.test(policy.version) || typeof policy.canonicalMaterialDigest !== "string" || !DIGEST.test(policy.canonicalMaterialDigest)) return null;
  return Object.freeze({ policyId: policy.policyId, version: policy.version, canonicalMaterialDigest: policy.canonicalMaterialDigest });
}

function validateFixedBinding<const T extends string>(value: unknown, expectedVersion: T): Readonly<{ contractVersion: T; canonicalMaterialDigest: string }> | null {
  const binding = plainObject(value, ["contractVersion", "canonicalMaterialDigest"]);
  if (!binding || binding.contractVersion !== expectedVersion || typeof binding.canonicalMaterialDigest !== "string" || !DIGEST.test(binding.canonicalMaterialDigest)) return null;
  return Object.freeze({ contractVersion: expectedVersion, canonicalMaterialDigest: binding.canonicalMaterialDigest });
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

function boundedTree(value: unknown, depth = 0, count = { nodes: 0 }): boolean {
  if (++count.nodes > EVIDENCE_QUEUE_SCOPE_IDENTITY_LIMITS.maxNodes || depth > EVIDENCE_QUEUE_SCOPE_IDENTITY_LIMITS.maxDepth) return false;
  if (Array.isArray(value)) return value.every(entry => boundedTree(entry, depth + 1, count));
  if (value && typeof value === "object") return Object.keys(value).every(key => stringSafe(key) && boundedTree((value as Record<string, unknown>)[key], depth + 1, count));
  return value === null || typeof value === "string" || typeof value === "boolean";
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const object = value as Record<string, unknown>;
  return "{" + Object.keys(object).sort(cmp).map(key => JSON.stringify(key) + ":" + canonicalJson(object[key])).join(",") + "}";
}

function build(input: unknown): EvidenceQueueScopeIdentityResult {
  const raw = plainObject(input, [
    "scopeMaterialVersion", "canonicalizationProfile", "reviewPurposePolicyVersion", "reviewPurpose", "jurisdictionUniverse", "eventRepresentationUniverse",
    "assetRepresentationUniverse", "issuerListingEligibilityPolicy", "sourcePortfolioPolicy", "routingPolicy", "queueContract",
    "accessClassificationPolicyVersion", "accessClassification",
  ]);
  if (!raw || raw.scopeMaterialVersion !== EVIDENCE_QUEUE_SCOPE_MATERIAL_VERSION || raw.canonicalizationProfile !== EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE || raw.reviewPurposePolicyVersion !== "event-intelligence-review-purpose/v1" || !EVIDENCE_QUEUE_SCOPE_PURPOSES.includes(raw.reviewPurpose as never) || !EVIDENCE_QUEUE_SCOPE_ACCESS_CLASSIFICATIONS.includes(raw.accessClassification as never) || raw.accessClassificationPolicyVersion !== "event-intelligence-review-access-classification/v1") return INVALID("SCOPE_MATERIAL_INVALID");
  const jurisdictions = semanticSet(raw.jurisdictionUniverse, EVIDENCE_QUEUE_SCOPE_JURISDICTIONS);
  const events = semanticSet(raw.eventRepresentationUniverse, EVIDENCE_QUEUE_SCOPE_EVENT_CATEGORIES);
  const assets = semanticSet(raw.assetRepresentationUniverse);
  if (!jurisdictions || !events || !assets || assets.some(asset => !ASSET_REPRESENTATION.test(asset))) return INVALID("SCOPE_MATERIAL_INVALID");
  const issuerListing = validatePolicy(raw.issuerListingEligibilityPolicy);
  const sourcePortfolio = validateFixedBinding(raw.sourcePortfolioPolicy, SOURCE_PORTFOLIO_DECISION_VERSION);
  const routing = validatePolicy(raw.routingPolicy);
  const queue = validateFixedBinding(raw.queueContract, EVIDENCE_REVIEW_QUEUE_VERSION);
  if (!issuerListing || !sourcePortfolio || !routing || !queue) return INVALID("SCOPE_MATERIAL_INVALID");

  const scopeMaterial: EvidenceQueueScopeMaterial = deepFreeze({
    scopeMaterialVersion: EVIDENCE_QUEUE_SCOPE_MATERIAL_VERSION,
    canonicalizationProfile: EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE,
    reviewPurposePolicyVersion: "event-intelligence-review-purpose/v1",
    reviewPurpose: raw.reviewPurpose as EvidenceQueueScopeMaterial["reviewPurpose"],
    jurisdictionUniverse: jurisdictions as EvidenceQueueScopeMaterial["jurisdictionUniverse"],
    eventRepresentationUniverse: events as EvidenceQueueScopeMaterial["eventRepresentationUniverse"],
    assetRepresentationUniverse: assets,
    issuerListingEligibilityPolicy: issuerListing,
    sourcePortfolioPolicy: sourcePortfolio,
    routingPolicy: routing,
    queueContract: queue,
    accessClassificationPolicyVersion: "event-intelligence-review-access-classification/v1",
    accessClassification: raw.accessClassification as EvidenceQueueScopeMaterial["accessClassification"],
  });
  if (!boundedTree(scopeMaterial)) return INVALID("SCOPE_MATERIAL_LIMIT_EXCEEDED");
  const canonicalMaterial = canonicalJson(scopeMaterial);
  const canonicalBytes = encoder.encode(canonicalMaterial);
  if (canonicalBytes.byteLength > EVIDENCE_QUEUE_SCOPE_IDENTITY_LIMITS.maxBytes) return INVALID("SCOPE_MATERIAL_LIMIT_EXCEEDED");
  const identity = "eviqs1_" + createHash("sha256").update(EVIDENCE_QUEUE_SCOPE_IDENTITY_DOMAIN, "utf8").update(canonicalBytes).digest("hex");
  return Object.freeze({ status: "VALID_SYNTAX_ONLY" as const, classification: "NON_AUTHORITATIVE_SYNTACTIC_IDENTITY" as const, scopeMaterial, canonicalMaterial, canonicalBytes: new Uint8Array(canonicalBytes), identity, algorithm: "SHA-256" as const, canonicalizationProfile: EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE });
}

/** Canonicalizes a syntactic review-universe scope. It does not resolve or approve any policy. */
export function buildEvidenceReviewQueueScopeIdentity(input: unknown): EvidenceQueueScopeIdentityResult {
  try { return build(input); } catch { return INVALID("SCOPE_MATERIAL_INVALID"); }
}

/** Recomputes the local syntax identity; success is not registry membership, approval, or queue application. */
export function verifyEvidenceReviewQueueScopeIdentity(input: unknown, identity: unknown): EvidenceQueueScopeIdentityVerification {
  if (typeof identity !== "string" || !/^eviqs1_[a-f0-9]{64}$/.test(identity)) return INVALID("SCOPE_IDENTITY_INVALID");
  const result = buildEvidenceReviewQueueScopeIdentity(input);
  if (result.status !== "VALID_SYNTAX_ONLY") return result;
  if (result.identity !== identity) return INVALID("SCOPE_IDENTITY_MISMATCH");
  return Object.freeze({ status: "IDENTITY_MATCHES_SYNTACTIC_MATERIAL" as const, classification: "NON_AUTHORITATIVE_SYNTACTIC_IDENTITY" as const, identity, canonicalMaterial: result.canonicalMaterial });
}
