import { describe, expect, it } from "vitest";
import { createBlockedEvidenceReviewQueueViewModel } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";
import { decodeEvidenceReviewQueueSnapshot, encodeEvidenceReviewQueueSnapshot, EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION } from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-codec";
import { buildEvidenceReviewQueueScopeIdentity, EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE, EVIDENCE_QUEUE_SCOPE_EVENT_CATEGORIES, EVIDENCE_QUEUE_SCOPE_IDENTITY_DOMAIN, EVIDENCE_QUEUE_SCOPE_IDENTITY_LIMITS, EVIDENCE_QUEUE_SCOPE_JURISDICTIONS, EVIDENCE_QUEUE_SCOPE_MATERIAL_VERSION, verifyEvidenceReviewQueueScopeIdentity } from "@/domain/intelligence/event-intelligence-evidence-review-queue-scope-identity";
import { EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";
import { EVIDENCE_REVIEW_QUEUE_VERSION } from "@/domain/intelligence/event-intelligence-evidence-review-queue";
import { SOURCE_PORTFOLIO_DECISION_VERSION } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";

const digest = "a".repeat(64);
const material = () => ({
  scopeMaterialVersion: EVIDENCE_QUEUE_SCOPE_MATERIAL_VERSION,
  canonicalizationProfile: EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE,
  reviewPurposePolicyVersion: "event-intelligence-review-purpose/v1",
  reviewPurpose: "CRYPTO_TREASURY_DISCLOSURE_REVIEW",
  jurisdictionUniverse: ["US_SEC", "GB_LSE"],
  eventRepresentationUniverse: ["COMPLETED_PURCHASE", "PURCHASE_INTENT"],
  assetRepresentationUniverse: ["asset-representation/v1/ethereum-native", "asset-representation/v1/ethereum-wrapped"],
  issuerListingEligibilityPolicy: { policyId: "issuer-listing-eligibility", version: "v1", canonicalMaterialDigest: digest },
  sourcePortfolioPolicy: { contractVersion: SOURCE_PORTFOLIO_DECISION_VERSION, canonicalMaterialDigest: "b".repeat(64) },
  routingPolicy: { policyId: "event-routing", version: "v2", canonicalMaterialDigest: "c".repeat(64) },
  queueContract: { contractVersion: EVIDENCE_REVIEW_QUEUE_VERSION, canonicalMaterialDigest: "d".repeat(64) },
  accessClassificationPolicyVersion: "event-intelligence-review-access-classification/v1",
  accessClassification: "INTERNAL_RESTRICTED",
});

function valid(input: unknown = material()) {
  const result = buildEvidenceReviewQueueScopeIdentity(input);
  expect(result.status).toBe("VALID_SYNTAX_ONLY");
  if (result.status !== "VALID_SYNTAX_ONLY") throw new Error("invalid test fixture");
  return result;
}

describe("evidence review queue scope identity", () => {
  it("canonicalizes object insertion order and semantic-set member order", () => {
    const first = valid();
    const secondInput = material();
    secondInput.jurisdictionUniverse.reverse();
    secondInput.eventRepresentationUniverse.reverse();
    secondInput.assetRepresentationUniverse.reverse();
    const reorderedObject = Object.fromEntries(Object.entries(secondInput).reverse());
    const second = valid(reorderedObject);
    expect(second.canonicalMaterial).toBe(first.canonicalMaterial);
    expect(second.identity).toBe(first.identity);
    expect(first.identity).toMatch(/^eviqs1_[a-f0-9]{64}$/);
    expect(first.classification).toBe("NON_AUTHORITATIVE_SYNTACTIC_IDENTITY");
  });

  it("uses contract versions and keeps policy references syntax-only", () => {
    const result = valid();
    expect(result.scopeMaterial.scopeMaterialVersion).toBe(EVIDENCE_QUEUE_SCOPE_MATERIAL_VERSION);
    expect(Object.isFrozen(result.scopeMaterial)).toBe(true);
    expect(Object.isFrozen(result.scopeMaterial.jurisdictionUniverse)).toBe(true);
    expect(verifyEvidenceReviewQueueScopeIdentity(material(), result.identity)).toMatchObject({ status: "IDENTITY_MATCHES_SYNTACTIC_MATERIAL", classification: "NON_AUTHORITATIVE_SYNTACTIC_IDENTITY" });
    expect(verifyEvidenceReviewQueueScopeIdentity(material(), "eviqs1_" + "0".repeat(64))).toMatchObject({ status: "INVALID", code: "SCOPE_IDENTITY_MISMATCH" });
    expect(verifyEvidenceReviewQueueScopeIdentity(material(), result.identity.toUpperCase())).toMatchObject({ status: "INVALID", code: "SCOPE_IDENTITY_INVALID" });
  });

  it("changes identity for each material dimension and policy revision/digest", () => {
    const baseline = valid().identity;
    const mutations: Array<(m: ReturnType<typeof material>) => void> = [
      m => { m.reviewPurpose = "FORMAL_ISSUER_DISCLOSURE_REVIEW"; },
      m => { m.jurisdictionUniverse = ["US_SEC"]; },
      m => { m.eventRepresentationUniverse = ["PURCHASE_INTENT"]; },
      m => { m.assetRepresentationUniverse = ["asset-representation/v1/ethereum-native"]; },
      m => { m.issuerListingEligibilityPolicy.version = "v2"; },
      m => { m.issuerListingEligibilityPolicy.canonicalMaterialDigest = "e".repeat(64); },
      m => { m.sourcePortfolioPolicy.canonicalMaterialDigest = "e".repeat(64); },
      m => { m.routingPolicy.canonicalMaterialDigest = "e".repeat(64); },
      m => { m.routingPolicy.version = "v3"; },
      m => { m.queueContract.canonicalMaterialDigest = "e".repeat(64); },
      m => { m.accessClassification = "INTERNAL_GENERAL"; },
    ];
    for (const mutate of mutations) { const changed = material(); mutate(changed); expect(valid(changed).identity).not.toBe(baseline); }
  });

  it("rejects duplicate/empty sets, unknown enums and malformed or extra nested fields", () => {
    const duplicate = material(); duplicate.jurisdictionUniverse.push("US_SEC");
    const empty = material(); empty.eventRepresentationUniverse = [];
    const unknown = { ...material(), jurisdictionUniverse: ["ZZ"] };
    const extra = { ...material(), cutoff: "2026-10-03T00:00:00.000Z" };
    const nested = material(); Object.assign(nested.routingPolicy, { displayName: "mutable label" });
    const badDigest = material(); badDigest.routingPolicy.canonicalMaterialDigest = "A".repeat(64);
    for (const invalid of [duplicate, empty, unknown, extra, nested, badDigest]) expect(buildEvidenceReviewQueueScopeIdentity(invalid)).toMatchObject({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
  });

  it("rejects cutoff, UI filters, artifact ids, or snapshot metadata", () => {
    for (const extra of [
      { evaluationAsOf: "2026-10-03T00:00:00.000Z" },
      { statusFilter: ["OPEN"] },
      { sourceArtifactId: "artifact-1" },
      { snapshotIdentity: "snapshot-1", payloadDigest: digest },
    ]) expect(buildEvidenceReviewQueueScopeIdentity({ ...material(), ...extra })).toMatchObject({ status: "INVALID" });
  });

  it("rejects accessors without invoking them and rejects unsafe object/array shapes", () => {
    let called = false;
    const getterInput = material() as Record<string, unknown>;
    Object.defineProperty(getterInput, "reviewPurpose", { enumerable: true, get() { called = true; return "CRYPTO_TREASURY_DISCLOSURE_REVIEW"; } });
    expect(buildEvidenceReviewQueueScopeIdentity(getterInput)).toMatchObject({ status: "INVALID" });
    expect(called).toBe(false);
    const sparse = material(); sparse.assetRepresentationUniverse = Array(1) as unknown as string[];
    expect(buildEvidenceReviewQueueScopeIdentity(sparse)).toMatchObject({ status: "INVALID" });
    const symbol = { ...material(), [Symbol("hidden")]: "x" };
    expect(buildEvidenceReviewQueueScopeIdentity(symbol)).toMatchObject({ status: "INVALID" });
    expect(buildEvidenceReviewQueueScopeIdentity(Object.assign(Object.create({ inherited: true }), material()))).toMatchObject({ status: "INVALID" });
    expect(buildEvidenceReviewQueueScopeIdentity(new Proxy(material(), { get() { throw new Error("trap"); } }))).toMatchObject({ status: "INVALID" });
    const arrayWithExtra = material(); Object.defineProperty(arrayWithExtra.jurisdictionUniverse, "extra", { value: true, enumerable: true });
    expect(buildEvidenceReviewQueueScopeIdentity(arrayWithExtra)).toMatchObject({ status: "INVALID" });
  });

  it("rejects cycles, unsupported primitives, lone surrogates, and over-bound values", () => {
    const cyclic = material() as Record<string, unknown>; cyclic.self = cyclic;
    expect(buildEvidenceReviewQueueScopeIdentity(cyclic)).toMatchObject({ status: "INVALID" });
    for (const value of [1n, Symbol("x"), () => null, new Date(), Object(1)]) expect(buildEvidenceReviewQueueScopeIdentity(value)).toMatchObject({ status: "INVALID" });
    const lone = material(); lone.assetRepresentationUniverse = ["asset-representation/v1/\ud800"];
    expect(buildEvidenceReviewQueueScopeIdentity(lone)).toMatchObject({ status: "INVALID" });
    const tooMany = material(); tooMany.assetRepresentationUniverse = Array.from({ length: EVIDENCE_QUEUE_SCOPE_IDENTITY_LIMITS.maxSetMembers + 1 }, (_, i) => "asset-representation/v1/asset-" + i);
    expect(buildEvidenceReviewQueueScopeIdentity(tooMany)).toMatchObject({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
    const tooLong = material(); tooLong.routingPolicy.policyId = "a".repeat(97);
    expect(buildEvidenceReviewQueueScopeIdentity(tooLong)).toMatchObject({ status: "INVALID" });
    const atStringLimit = material(); atStringLimit.assetRepresentationUniverse = ["asset-representation/v1/" + "a".repeat(EVIDENCE_QUEUE_SCOPE_IDENTITY_LIMITS.maxStringCodeUnits - 24)];
    expect(buildEvidenceReviewQueueScopeIdentity(atStringLimit).status).toBe("VALID_SYNTAX_ONLY");
    const byteOverflow = material(); byteOverflow.assetRepresentationUniverse = Array.from({ length: EVIDENCE_QUEUE_SCOPE_IDENTITY_LIMITS.maxSetMembers }, (_, i) => "asset-representation/v1/" + String(i).padStart(2, "0") + "a".repeat(230));
    expect(buildEvidenceReviewQueueScopeIdentity(byteOverflow)).toMatchObject({ status: "INVALID", code: "SCOPE_MATERIAL_LIMIT_EXCEEDED" });
  });

  it("isolates caller mutation and preserves the snapshot codec wire format", () => {
    const input = material();
    const scope = valid(input);
    const original = scope.canonicalMaterial;
    input.jurisdictionUniverse.reverse();
    input.issuerListingEligibilityPolicy.policyId = "changed";
    scope.canonicalBytes[0] = 0;
    expect(scope.canonicalMaterial).toBe(original);
    const cutoff = "2026-10-03T00:00:00.000Z";
    const payload = createBlockedEvidenceReviewQueueViewModel();
    const encoded = encodeEvidenceReviewQueueSnapshot({ formatVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION, viewModelVersion: EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION, scopeIdentity: scope.identity, snapshotCutoff: cutoff, payload });
    expect(encoded.status).toBe("VALID");
    if (encoded.status !== "VALID") return;
    const decoded = decodeEvidenceReviewQueueSnapshot(encoded.value.canonicalBytes, encoded.value.sha256);
    expect(decoded).toMatchObject({ status: "VALID", value: { envelope: { scopeIdentity: scope.identity, snapshotCutoff: cutoff } } });
  });

  it("pins independent canonical material and identity golden values", () => {
    expect(valid().canonicalMaterial).toBe("{\"accessClassification\":\"INTERNAL_RESTRICTED\",\"accessClassificationPolicyVersion\":\"event-intelligence-review-access-classification/v1\",\"assetRepresentationUniverse\":[\"asset-representation/v1/ethereum-native\",\"asset-representation/v1/ethereum-wrapped\"],\"canonicalizationProfile\":\"event-intelligence-evidence-review-queue-scope-canonical-json/v1\",\"eventRepresentationUniverse\":[\"COMPLETED_PURCHASE\",\"PURCHASE_INTENT\"],\"issuerListingEligibilityPolicy\":{\"canonicalMaterialDigest\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"policyId\":\"issuer-listing-eligibility\",\"version\":\"v1\"},\"jurisdictionUniverse\":[\"GB_LSE\",\"US_SEC\"],\"queueContract\":{\"canonicalMaterialDigest\":\"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\",\"contractVersion\":\"event-intelligence-evidence-review-queue-contract/v1\"},\"reviewPurpose\":\"CRYPTO_TREASURY_DISCLOSURE_REVIEW\",\"reviewPurposePolicyVersion\":\"event-intelligence-review-purpose/v1\",\"routingPolicy\":{\"canonicalMaterialDigest\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\",\"policyId\":\"event-routing\",\"version\":\"v2\"},\"scopeMaterialVersion\":\"event-intelligence-evidence-review-queue-scope-material/v1\",\"sourcePortfolioPolicy\":{\"canonicalMaterialDigest\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",\"contractVersion\":\"event-intelligence-source-portfolio-routing-decision/v1\"}}");
    expect(valid().identity).toBe("eviqs1_17c08dcdc0a332f4ea131e8e35305b6d1a741b39fe3b825c79e601cadeeb0659");
    expect(EVIDENCE_QUEUE_SCOPE_IDENTITY_DOMAIN).toBe("event-intelligence-evidence-review-queue-snapshot-scope/v1\0");
    expect(EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE).toBe("event-intelligence-evidence-review-queue-scope-canonical-json/v1");
    expect(EVIDENCE_QUEUE_SCOPE_JURISDICTIONS).toContain("UNKNOWN");
    expect(EVIDENCE_QUEUE_SCOPE_EVENT_CATEGORIES).toContain("COMPLETED_PURCHASE");
  });
});
