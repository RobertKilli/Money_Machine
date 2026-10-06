import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
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

function maximumMaterial() {
  const input = material();
  input.jurisdictionUniverse = [...EVIDENCE_QUEUE_SCOPE_JURISDICTIONS];
  input.eventRepresentationUniverse = [...EVIDENCE_QUEUE_SCOPE_EVENT_CATEGORIES];
  // The literal representation prefix is 24 code units; all members are 256.
  input.assetRepresentationUniverse = Array.from({ length: 64 }, (_, i) => "asset-representation/v1/" + String(i).padStart(2, "0") + "a".repeat(230));
  for (const policy of [input.issuerListingEligibilityPolicy, input.routingPolicy]) {
    policy.policyId = "a".repeat(96);
    policy.version = "v9999";
  }
  return input;
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
      m => { m.issuerListingEligibilityPolicy.policyId = "issuer-listing-eligibility-other"; },
      m => { m.issuerListingEligibilityPolicy.canonicalMaterialDigest = "e".repeat(64); },
      m => { m.sourcePortfolioPolicy.canonicalMaterialDigest = "e".repeat(64); },
      m => { m.routingPolicy.canonicalMaterialDigest = "e".repeat(64); },
      m => { m.routingPolicy.version = "v3"; },
      m => { m.routingPolicy.policyId = "event-routing-other"; },
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

  it("validates each semantic set independently without changing caller order", () => {
    for (const field of ["jurisdictionUniverse", "eventRepresentationUniverse", "assetRepresentationUniverse"] as const) {
      const input = material();
      input[field].reverse();
      const before = [...input[field]];
      valid(input);
      expect(input[field]).toEqual(before);
      const duplicate = material(); duplicate[field].push(duplicate[field][0]!);
      const empty = material(); empty[field] = [];
      for (const invalid of [duplicate, empty]) expect(buildEvidenceReviewQueueScopeIdentity(invalid)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
    }
  });

  it("rejects unsupported schema versions and exact-shape nested bindings", () => {
    for (const key of Object.keys(material())) {
      const missing = material(); Reflect.deleteProperty(missing, key);
      const hidden = material(); Object.defineProperty(hidden, key, { enumerable: false });
      const wrongType = material(); Object.defineProperty(wrongType, key, { value: null });
      for (const input of [missing, hidden, wrongType]) expect(buildEvidenceReviewQueueScopeIdentity(input)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
    }
    for (const field of ["scopeMaterialVersion", "canonicalizationProfile", "reviewPurposePolicyVersion", "accessClassificationPolicyVersion"] as const) {
      const input = material(); Object.defineProperty(input, field, { value: input[field].replace("/v1", "/v2") });
      expect(buildEvidenceReviewQueueScopeIdentity(input)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
    }
    for (const field of ["issuerListingEligibilityPolicy", "routingPolicy", "sourcePortfolioPolicy", "queueContract"] as const) {
      for (const key of Object.keys(material()[field])) {
        const missing = material(); Reflect.deleteProperty(missing[field], key);
        const hidden = material(); Object.defineProperty(hidden[field], key, { enumerable: false });
        const wrongType = material(); Object.defineProperty(wrongType[field], key, { value: null });
        for (const input of [missing, hidden, wrongType]) expect(buildEvidenceReviewQueueScopeIdentity(input)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
      }
      for (const key of ["__proto__", "constructor", "prototype", "toJSON", Symbol("hidden")]) {
        const input = material(); Object.defineProperty(input[field], key, { value: "extra", enumerable: false });
        expect(buildEvidenceReviewQueueScopeIdentity(input)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
      }
      const custom = material(); Object.setPrototypeOf(custom[field], { inherited: true });
      expect(buildEvidenceReviewQueueScopeIdentity(custom)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
    }
    for (const field of ["sourcePortfolioPolicy", "queueContract"] as const) {
      const input = material(); Object.defineProperty(input[field], "contractVersion", { value: "future/v2" });
      expect(buildEvidenceReviewQueueScopeIdentity(input)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
    }
  });

  it("rejects nested and array hooks without executing them", () => {
    let calls = 0;
    for (const descriptor of [
      { get() { calls++; return digest; } },
      { set(value: unknown) { void value; calls++; } },
    ]) {
      const input = material(); Object.defineProperty(input.routingPolicy, "canonicalMaterialDigest", { ...descriptor, enumerable: true });
      expect(buildEvidenceReviewQueueScopeIdentity(input)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
      const arrayInput = material(); Object.defineProperty(arrayInput.assetRepresentationUniverse, "0", { ...descriptor, enumerable: true });
      expect(buildEvidenceReviewQueueScopeIdentity(arrayInput)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
    }
    const toJSON = material(); Object.defineProperty(toJSON.routingPolicy, "toJSON", { get() { calls++; return () => { calls++; }; } });
    expect(buildEvidenceReviewQueueScopeIdentity(toJSON)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
    for (const key of ["extra", Symbol("array-property")]) {
      const input = material(); Object.defineProperty(input.assetRepresentationUniverse, key, { value: true });
      expect(buildEvidenceReviewQueueScopeIdentity(input)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
    }
    expect(calls).toBe(0);
  });

  it("preserves meaningful ASCII identifiers and rejects normalization/coercion", () => {
    let coercions = 0;
    for (const field of ["issuerListingEligibilityPolicy", "routingPolicy", "sourcePortfolioPolicy", "queueContract"] as const) {
      for (const value of [digest + "\n", digest + "\r\n", digest + "\u2028", " " + digest, digest.slice(1), digest + "a", digest.toUpperCase(), { toString() { coercions++; throw Error("caller-string"); } }]) {
        const input = material(); Object.defineProperty(input[field], "canonicalMaterialDigest", { value });
        expect(buildEvidenceReviewQueueScopeIdentity(input)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
      }
    }
    for (const value of [" event-routing", "event-routing ", "event-routing\n", "Event-routing", "event--routing", "event_routing", "event.routing", "event/routing", "évent-routing", "event-\u200brouting"]) {
      const input = material(); input.routingPolicy.policyId = value;
      expect(buildEvidenceReviewQueueScopeIdentity(input)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
    }
    for (const value of ["v0", "v01", "V1", "v1\n", "v10000", "1", "v1.0"]) {
      const input = material(); input.routingPolicy.version = value;
      expect(buildEvidenceReviewQueueScopeIdentity(input)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
    }
    for (const value of ["asset-id:eth", "asset-representation/v2/eth", "asset-representation/v1/ETH", "asset-representation/v1/éth", "asset-representation/v1/eth\n", "asset-representation/v1/eth--native"]) {
      expect(buildEvidenceReviewQueueScopeIdentity({ ...material(), assetRepresentationUniverse: [value] })).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
    }
    const syntactic = material(); syntactic.routingPolicy.policyId = "unregistered-policy-123";
    expect(valid(syntactic).classification).toBe("NON_AUTHORITATIVE_SYNTACTIC_IDENTITY");
    const distinct = material(); distinct.routingPolicy.policyId = "event-routing2";
    expect(valid(distinct).identity).not.toBe(valid().identity);
    expect(coercions).toBe(0);
  });

  it("accepts shared acyclic bindings but rejects cycles at an existing field", () => {
    const shared = material(); shared.routingPolicy = shared.issuerListingEligibilityPolicy;
    const separate = material(); separate.routingPolicy = { ...separate.issuerListingEligibilityPolicy };
    expect(valid(shared).identity).toBe(valid(separate).identity);
    const cyclic = material(); Object.defineProperty(cyclic.routingPolicy, "version", { value: cyclic.routingPolicy });
    expect(buildEvidenceReviewQueueScopeIdentity(cyclic)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
  });

  it("revalidates changed material and rejects malformed identity before comparison", () => {
    const input = material(); const result = valid(input);
    for (const identity of [result.identity + "\n", result.identity + "\r\n", result.identity + "\u2028", result.identity.slice(1), result.identity + "0", result.identity.toUpperCase(), " " + result.identity, null, { ...result }]) {
      expect(verifyEvidenceReviewQueueScopeIdentity(input, identity)).toEqual({ status: "INVALID", code: "SCOPE_IDENTITY_INVALID" });
    }
    input.routingPolicy.version = "v3";
    expect(verifyEvidenceReviewQueueScopeIdentity(input, result.identity)).toEqual({ status: "INVALID", code: "SCOPE_IDENTITY_MISMATCH" });
    expect(verifyEvidenceReviewQueueScopeIdentity({ ...input, status: "VALID_SYNTAX_ONLY" }, result.identity)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
    expect(verifyEvidenceReviewQueueScopeIdentity(result, result.identity)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
  });

  it("rejects cutoff, UI filters, artifact ids, or snapshot metadata", () => {
    for (const extra of [
      { evaluationAsOf: "2026-10-03T00:00:00.000Z" },
      { statusFilter: ["OPEN"] },
      { sourceArtifactId: "artifact-1" },
      { snapshotIdentity: "snapshot-1", payloadDigest: digest },
      { receiptTime: "2026-10-03T00:00:00.000Z" },
      { itemCounts: 1 },
      { correctionRetraction: { snapshot: "snapshot-1" } },
      { metadata: { arbitrary: "json" } },
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
    const cyclic = material() as Record<string, unknown>; cyclic.routingPolicy = cyclic;
    expect(buildEvidenceReviewQueueScopeIdentity(cyclic)).toMatchObject({ status: "INVALID" });
    for (const value of [1n, Symbol("x"), () => null, new Date(), Object(1)]) expect(buildEvidenceReviewQueueScopeIdentity(value)).toMatchObject({ status: "INVALID" });
    const lone = material(); lone.assetRepresentationUniverse = ["asset-representation/v1/\ud800"];
    expect(buildEvidenceReviewQueueScopeIdentity(lone)).toMatchObject({ status: "INVALID" });
    const tooMany = material(); tooMany.assetRepresentationUniverse = Array.from({ length: EVIDENCE_QUEUE_SCOPE_IDENTITY_LIMITS.maxSetMembers + 1 }, (_, i) => "asset-representation/v1/asset-" + i);
    expect(buildEvidenceReviewQueueScopeIdentity(tooMany)).toMatchObject({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
    const tooLong = material(); tooLong.routingPolicy.policyId = "a".repeat(97);
    expect(buildEvidenceReviewQueueScopeIdentity(tooLong)).toMatchObject({ status: "INVALID" });
    const atStringLimit = material(); atStringLimit.assetRepresentationUniverse = ["asset-representation/v1/" + "a".repeat(232)];
    expect(atStringLimit.assetRepresentationUniverse[0]).toHaveLength(256);
    expect(buildEvidenceReviewQueueScopeIdentity(atStringLimit).status).toBe("VALID_SYNTAX_ONLY");
  });

  it("builds the maximum valid v1 graph without an accidental byte or node limit", () => {
    const input = maximumMaterial();
    expect(input.assetRepresentationUniverse.every(member => member.length === 256)).toBe(true);
    const result = valid(input);
    expect(result.canonicalBytes.byteLength).toBe(18_264);
    expect(result.canonicalBytes.byteLength).toBeLessThanOrEqual(EVIDENCE_QUEUE_SCOPE_IDENTITY_LIMITS.maxBytes);
    expect(verifyEvidenceReviewQueueScopeIdentity(input, result.identity).status).toBe("IDENTITY_MATCHES_SYNTACTIC_MATERIAL");
    const longMember = maximumMaterial(); longMember.assetRepresentationUniverse[0] += "a";
    const extraMember = maximumMaterial(); extraMember.assetRepresentationUniverse.push("asset-representation/v1/extra");
    // Above the reachable byte maximum, these hit string/set validation first.
    for (const invalid of [longMember, extraMember]) expect(buildEvidenceReviewQueueScopeIdentity(invalid)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
    const longPolicy = maximumMaterial(); longPolicy.routingPolicy.policyId += "a";
    expect(buildEvidenceReviewQueueScopeIdentity(longPolicy)).toEqual({ status: "INVALID", code: "SCOPE_MATERIAL_INVALID" });
  });

  it("isolates caller mutation and preserves the snapshot codec wire format", () => {
    const input = material();
    const scope = valid(input);
    const original = scope.canonicalMaterial;
    for (const field of ["jurisdictionUniverse", "eventRepresentationUniverse", "assetRepresentationUniverse", "issuerListingEligibilityPolicy", "routingPolicy", "sourcePortfolioPolicy", "queueContract"] as const) {
      expect(scope.scopeMaterial[field]).not.toBe(input[field]);
      expect(Object.isFrozen(scope.scopeMaterial[field])).toBe(true);
    }
    expect(Reflect.set(scope.scopeMaterial.routingPolicy, "version", "v3")).toBe(false);
    expect(Reflect.set(scope.scopeMaterial.assetRepresentationUniverse, "0", "asset-representation/v1/changed")).toBe(false);
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
    const goldenMaterial = "{\"accessClassification\":\"INTERNAL_RESTRICTED\",\"accessClassificationPolicyVersion\":\"event-intelligence-review-access-classification/v1\",\"assetRepresentationUniverse\":[\"asset-representation/v1/ethereum-native\",\"asset-representation/v1/ethereum-wrapped\"],\"canonicalizationProfile\":\"event-intelligence-evidence-review-queue-scope-canonical-json/v1\",\"eventRepresentationUniverse\":[\"COMPLETED_PURCHASE\",\"PURCHASE_INTENT\"],\"issuerListingEligibilityPolicy\":{\"canonicalMaterialDigest\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"policyId\":\"issuer-listing-eligibility\",\"version\":\"v1\"},\"jurisdictionUniverse\":[\"GB_LSE\",\"US_SEC\"],\"queueContract\":{\"canonicalMaterialDigest\":\"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\",\"contractVersion\":\"event-intelligence-evidence-review-queue-contract/v1\"},\"reviewPurpose\":\"CRYPTO_TREASURY_DISCLOSURE_REVIEW\",\"reviewPurposePolicyVersion\":\"event-intelligence-review-purpose/v1\",\"routingPolicy\":{\"canonicalMaterialDigest\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\",\"policyId\":\"event-routing\",\"version\":\"v2\"},\"scopeMaterialVersion\":\"event-intelligence-evidence-review-queue-scope-material/v1\",\"sourcePortfolioPolicy\":{\"canonicalMaterialDigest\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",\"contractVersion\":\"event-intelligence-source-portfolio-routing-decision/v1\"}}";
    const result = valid();
    expect(result.canonicalMaterial).toBe(goldenMaterial);
    expect(result.canonicalBytes).toEqual(new TextEncoder().encode(goldenMaterial));
    expect(result.canonicalBytes.byteLength).toBe(1378);
    const prefixBytes = new TextEncoder().encode("event-intelligence-evidence-review-queue-snapshot-scope/v1\0");
    expect(prefixBytes).toHaveLength(59);
    expect(prefixBytes[58]).toBe(0);
    const goldenHash = createHash("sha256").update(prefixBytes).update(new TextEncoder().encode(goldenMaterial)).digest("hex");
    expect("eviqs1_" + goldenHash).toBe("eviqs1_17c08dcdc0a332f4ea131e8e35305b6d1a741b39fe3b825c79e601cadeeb0659");
    for (const wrongPrefix of ["event-intelligence-evidence-review-queue-snapshot-scope/v1\\0", "event-intelligence-evidence-review-queue-snapshot-scope/v2\0"]) {
      expect(createHash("sha256").update(wrongPrefix).update(goldenMaterial).digest("hex")).not.toBe(goldenHash);
    }
    const reversedKeys = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(goldenMaterial)).reverse()));
    expect(createHash("sha256").update(prefixBytes).update(reversedKeys).digest("hex")).not.toBe(goldenHash);
    expect(valid().identity).toBe("eviqs1_17c08dcdc0a332f4ea131e8e35305b6d1a741b39fe3b825c79e601cadeeb0659");
    expect(EVIDENCE_QUEUE_SCOPE_IDENTITY_DOMAIN).toBe("event-intelligence-evidence-review-queue-snapshot-scope/v1\0");
    expect(EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE).toBe("event-intelligence-evidence-review-queue-scope-canonical-json/v1");
    expect(EVIDENCE_QUEUE_SCOPE_JURISDICTIONS).toContain("UNKNOWN");
    expect(EVIDENCE_QUEUE_SCOPE_EVENT_CATEGORIES).toContain("COMPLETED_PURCHASE");
  });
});
