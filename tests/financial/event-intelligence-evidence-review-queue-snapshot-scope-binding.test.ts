import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { composeEventIntelligenceEvidenceReviewQueue } from "@/application/intelligence/compose-event-intelligence-evidence-review-queue";
import {
  buildEvidenceReviewQueueScopeIdentity,
  EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE,
  EVIDENCE_QUEUE_SCOPE_MATERIAL_VERSION,
  verifyEvidenceReviewQueueScopeIdentity,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-scope-identity";
import {
  decodeEvidenceReviewQueueSnapshot,
  encodeEvidenceReviewQueueSnapshot,
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-codec";
import {
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_SCOPE_BINDING_VERSION,
  verifyEvidenceReviewQueueSnapshotScopeBinding,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-scope-binding";
import {
  EVIDENCE_REVIEW_QUEUE_VERSION,
  getEvidenceReviewQueueContract,
  isAuthenticEvidenceReviewItem,
  isAuthenticEvidenceReviewQueueSet,
  sealEvidenceReviewQueueSet,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue";
import {
  adaptEvidenceReviewQueueSetToViewModel,
  createBlockedEvidenceReviewQueueViewModel,
  EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";
import {
  evaluateSourcePortfolioRouting,
  getSourcePortfolioDecision,
  isAuthenticRoutingEvaluation,
  SOURCE_PORTFOLIO_DECISION_VERSION,
} from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";

const cutoff = "2026-10-03T00:00:00.000Z";
const material = () => ({
  scopeMaterialVersion: EVIDENCE_QUEUE_SCOPE_MATERIAL_VERSION,
  canonicalizationProfile: EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE,
  reviewPurposePolicyVersion: "event-intelligence-review-purpose/v1",
  reviewPurpose: "CRYPTO_TREASURY_DISCLOSURE_REVIEW",
  jurisdictionUniverse: ["US_SEC", "GB_LSE"],
  eventRepresentationUniverse: ["PURCHASE_INTENT", "COMPLETED_PURCHASE"],
  assetRepresentationUniverse: ["asset-representation/v1/ethereum-wrapped", "asset-representation/v1/ethereum-native"],
  issuerListingEligibilityPolicy: { policyId: "issuer-listing-eligibility", version: "v1", canonicalMaterialDigest: "a".repeat(64) },
  sourcePortfolioPolicy: { contractVersion: SOURCE_PORTFOLIO_DECISION_VERSION, canonicalMaterialDigest: "b".repeat(64) },
  routingPolicy: { policyId: "event-routing", version: "v2", canonicalMaterialDigest: "c".repeat(64) },
  queueContract: { contractVersion: EVIDENCE_REVIEW_QUEUE_VERSION, canonicalMaterialDigest: "d".repeat(64) },
  accessClassificationPolicyVersion: "event-intelligence-review-access-classification/v1",
  accessClassification: "INTERNAL_RESTRICTED",
});

function scope(input: unknown = material()) {
  const built = buildEvidenceReviewQueueScopeIdentity(input);
  if (built.status !== "VALID_SYNTAX_ONLY") throw Error("INVALID_SYNTHETIC_SCOPE");
  return built;
}

function snapshot(scopeIdentity: string, payload: unknown = createBlockedEvidenceReviewQueueViewModel(), snapshotCutoff = cutoff) {
  const encoded = encodeEvidenceReviewQueueSnapshot({
    formatVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
    viewModelVersion: EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION,
    scopeIdentity, snapshotCutoff, payload,
  });
  if (encoded.status !== "VALID") throw Error("INVALID_SYNTHETIC_SNAPSHOT");
  return encoded.value;
}

function historicalPayload() {
  const decision = getSourcePortfolioDecision();
  const routing = evaluateSourcePortfolioRouting(decision, {
    provenance: "SYNTHETIC", candidateId: "candidate:scope-binding", jurisdiction: "US_SEC", listingScopes: ["listing:us-sec"],
    eventHint: "PURCHASE_INTENT", seenFamilies: ["DISCOVERY_AGGREGATOR"], availableFamilies: ["FILING_AUTHORITY"],
    issuerMapped: false, assetMapped: true, duplicate: false, rightsApproved: true, credentialAvailable: true,
    completionMaterialPresent: false, primaryAvailable: true, qualificationComplete: true,
    correctionPresent: false, correctionResolved: true, correctionFieldHints: [], retracted: false, conflicts: [], stale: false, originBindings: [],
    publicationAt: "2026-10-01T00:00:00.000Z", discoveredAt: "2026-10-01T00:01:00.000Z", receivedAt: "2026-10-01T00:02:00.000Z",
    correctionAvailableAt: null, evaluationAsOf: cutoff,
  });
  const sealed = sealEvidenceReviewQueueSet(decision, [routing]);
  if (sealed.status !== "SEALED") throw Error("INVALID_SYNTHETIC_QUEUE");
  const projected = adaptEvidenceReviewQueueSetToViewModel(getEvidenceReviewQueueContract(), sealed.queueSet);
  if (projected.status !== "PROJECTED") throw Error("INVALID_SYNTHETIC_PROJECTION");
  return projected.model;
}

const hashBytes = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("evidence review queue snapshot scope binding", () => {
  it("verifies an explicit builder scope while preserving a blocked payload", () => {
    const expected = scope(); const encoded = snapshot(expected.identity);
    const result = verifyEvidenceReviewQueueSnapshotScopeBinding(encoded.canonicalBytes, encoded.sha256, expected.identity, material());
    expect(result).toEqual({
      status: "VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE",
      contractVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_SCOPE_BINDING_VERSION,
      scopeIdentity: expected.identity, canonicalScopeMaterial: expected.canonicalMaterial,
      snapshotDigest: encoded.sha256, envelope: encoded.envelope,
    });
    if (result.status !== "VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE") throw Error("BINDING_FAILED");
    expect(result.envelope.payload).toMatchObject({ state: "BLOCKED", items: [], generatedForAsOf: null });
    expect(result).not.toHaveProperty("canonicalBytes");
  });

  it("preserves a non-blocked historical projection without restoring domain trust", () => {
    const expected = scope(); const payload = historicalPayload();
    expect(payload.state).toBe("HAS_REVIEW_ITEMS");
    expect(payload.items[0]).toMatchObject({ status: "OPEN", historical: true });
    const encoded = snapshot(expected.identity, payload);
    const result = verifyEvidenceReviewQueueSnapshotScopeBinding(encoded.canonicalBytes, encoded.sha256, expected.identity, material());
    if (result.status !== "VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE") throw Error("BINDING_FAILED");
    expect(result.envelope.payload).toEqual(payload);
    for (const value of [result, result.envelope, result.envelope.payload, result.envelope.payload.items[0]]) {
      expect(isAuthenticRoutingEvaluation(value)).toBe(false);
      expect(isAuthenticEvidenceReviewQueueSet(value)).toBe(false);
      expect(isAuthenticEvidenceReviewItem(value)).toBe(false);
    }
    expect(composeEventIntelligenceEvidenceReviewQueue({ evaluationAsOf: cutoff, candidates: [{ candidate: result.envelope.payload.items[0], routingMaterial: result }] }))
      .toEqual({ status: "BLOCKED", code: "COMPOSITION_CANDIDATE_UNTRUSTED" });
    expect(Object.keys(result).sort()).toEqual(["canonicalScopeMaterial", "contractVersion", "envelope", "scopeIdentity", "snapshotDigest", "status"]);
  });

  it("accepts semantically identical reordered scope sets without mutating them", () => {
    const expected = scope(); const encoded = snapshot(expected.identity); const reordered = material();
    reordered.jurisdictionUniverse.reverse(); reordered.eventRepresentationUniverse.reverse(); reordered.assetRepresentationUniverse.reverse();
    const before = JSON.stringify(reordered);
    const result = verifyEvidenceReviewQueueSnapshotScopeBinding(encoded.canonicalBytes, encoded.sha256, expected.identity, reordered);
    expect(result.status).toBe("VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE");
    expect(JSON.stringify(reordered)).toBe(before);
  });

  it("rejects expected identity/material mismatch before attempting the codec", () => {
    const expected = scope(); const changed = material(); changed.routingPolicy.version = "v3";
    const encoded = snapshot(expected.identity);
    expect(scope(changed).identity).not.toBe(expected.identity);
    for (const [bytes, digest] of [[encoded.canonicalBytes, encoded.sha256], [null, "invalid-digest"]]) {
      expect(verifyEvidenceReviewQueueSnapshotScopeBinding(bytes, digest, expected.identity, changed))
        .toEqual({ status: "INVALID", code: "EXPECTED_SCOPE_IDENTITY_MISMATCH" });
    }
  });

  it("rejects a different envelope scope after canonical bytes and digest pass the codec", () => {
    const expected = scope(); const changed = material(); changed.accessClassification = "INTERNAL_GENERAL";
    const other = scope(changed); const encoded = snapshot(other.identity);
    expect(verifyEvidenceReviewQueueScopeIdentity(material(), expected.identity).status).toBe("IDENTITY_MATCHES_SYNTACTIC_MATERIAL");
    expect(decodeEvidenceReviewQueueSnapshot(encoded.canonicalBytes, encoded.sha256).status).toBe("VALID");
    expect(other.identity).not.toBe(expected.identity);
    expect(verifyEvidenceReviewQueueSnapshotScopeBinding(encoded.canonicalBytes, encoded.sha256, expected.identity, material()))
      .toEqual({ status: "INVALID", code: "SNAPSHOT_SCOPE_MISMATCH" });
    expect(verifyEvidenceReviewQueueSnapshotScopeBinding(encoded.canonicalBytes, "0".repeat(64), expected.identity, material()))
      .toEqual({ status: "INVALID", code: "SNAPSHOT_CODEC_REJECTED", codecCode: "DIGEST_MISMATCH" });
  });

  it("rejects malformed expected identity/material without trusting prior result objects", () => {
    const expected = scope(); const encoded = snapshot(expected.identity);
    expect(verifyEvidenceReviewQueueSnapshotScopeBinding(null, null, expected.identity + "\n", material()))
      .toEqual({ status: "INVALID", code: "EXPECTED_SCOPE_INVALID", scopeCode: "SCOPE_IDENTITY_INVALID" });
    for (const invalidMaterial of [null, { ...material(), cutoff }, expected]) {
      expect(verifyEvidenceReviewQueueSnapshotScopeBinding(encoded.canonicalBytes, encoded.sha256, expected.identity, invalidMaterial))
        .toEqual({ status: "INVALID", code: "EXPECTED_SCOPE_INVALID", scopeCode: "SCOPE_MATERIAL_INVALID" });
    }
    const decoded = decodeEvidenceReviewQueueSnapshot(encoded.canonicalBytes, encoded.sha256);
    expect(verifyEvidenceReviewQueueSnapshotScopeBinding(decoded, encoded.sha256, expected.identity, material()))
      .toEqual({ status: "INVALID", code: "SNAPSHOT_CODEC_REJECTED", codecCode: "BYTE_INPUT_INVALID" });
  });

  it("propagates codec rejection for bytes, digest, UTF-8 and canonicality", () => {
    const expected = scope(); const encoded = snapshot(expected.identity);
    const nonCanonical = new TextEncoder().encode(" " + new TextDecoder().decode(encoded.canonicalBytes));
    const invalidUtf8 = new Uint8Array([0xff]);
    for (const [bytes, digest, codecCode] of [
      [null, encoded.sha256, "BYTE_INPUT_INVALID"],
      [encoded.canonicalBytes, "invalid", "DIGEST_INVALID"],
      [encoded.canonicalBytes, "0".repeat(64), "DIGEST_MISMATCH"],
      [invalidUtf8, hashBytes(invalidUtf8), "UTF8_INVALID"],
      [nonCanonical, hashBytes(nonCanonical), "NON_CANONICAL_BYTES"],
    ] as const) {
      expect(decodeEvidenceReviewQueueSnapshot(bytes, digest)).toEqual({ status: "INVALID", code: codecCode });
      const result = verifyEvidenceReviewQueueSnapshotScopeBinding(bytes, digest, expected.identity, material());
      expect(result).toEqual({ status: "INVALID", code: "SNAPSHOT_CODEC_REJECTED", codecCode });
      expect(Object.isFrozen(result)).toBe(true);
    }
  });

  it("never falls back when an expectation is omitted", () => {
    const expected = scope(); const encoded = snapshot(expected.identity);
    for (const args of [[], [encoded.canonicalBytes], [encoded.canonicalBytes, encoded.sha256], [encoded.canonicalBytes, encoded.sha256, expected.identity], [encoded.canonicalBytes, encoded.sha256, undefined, material()]]) {
      expect(Reflect.apply(verifyEvidenceReviewQueueSnapshotScopeBinding, undefined, args))
        .toMatchObject({ status: "INVALID", code: "EXPECTED_SCOPE_INVALID" });
    }
    expect(verifyEvidenceReviewQueueSnapshotScopeBinding(encoded.canonicalBytes, undefined, expected.identity, material()))
      .toEqual({ status: "INVALID", code: "SNAPSHOT_CODEC_REJECTED", codecCode: "DIGEST_INVALID" });
  });

  it("binds snapshot digest to cutoff without making cutoff a scope dimension or selecting a newer snapshot", () => {
    const expected = scope(); const early = snapshot(expected.identity);
    const later = snapshot(expected.identity, createBlockedEvidenceReviewQueueViewModel(), "2026-10-04T00:00:00.000Z");
    expect(early.sha256).not.toBe(later.sha256);
    for (const encoded of [later, early]) {
      const result = verifyEvidenceReviewQueueSnapshotScopeBinding(encoded.canonicalBytes, encoded.sha256, expected.identity, material());
      expect(result).toMatchObject({ status: "VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE", scopeIdentity: expected.identity, envelope: { snapshotCutoff: encoded.envelope.snapshotCutoff } });
    }
    expect(scope().identity).toBe(expected.identity);
  });

  it("isolates caller mutation and freezes returned data without returning mutable bytes", () => {
    const input = material(); const expected = scope(input); const encoded = snapshot(expected.identity, historicalPayload());
    const beforeBytes = new Uint8Array(encoded.canonicalBytes); const beforeMaterial = JSON.stringify(input);
    const result = verifyEvidenceReviewQueueSnapshotScopeBinding(encoded.canonicalBytes, encoded.sha256, expected.identity, input);
    if (result.status !== "VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE") throw Error("BINDING_FAILED");
    expect(encoded.canonicalBytes).toEqual(beforeBytes); expect(JSON.stringify(input)).toBe(beforeMaterial);
    const before = JSON.stringify(result);
    input.routingPolicy.version = "v3"; input.assetRepresentationUniverse[0] = "asset-representation/v1/changed";
    encoded.canonicalBytes.fill(0);
    expect(JSON.stringify(result)).toBe(before);
    const item = result.envelope.payload.items[0]!;
    for (const value of [result, result.envelope, result.envelope.payload, result.envelope.payload.summary, result.envelope.payload.items, item, item.reasonLabels, item.sourceFamilies]) expect(Object.isFrozen(value)).toBe(true);
    expect(Reflect.set(result, "snapshotDigest", "changed")).toBe(false);
    expect(Reflect.set(result.envelope, "scopeIdentity", "changed")).toBe(false);
    expect(Reflect.set(item, "historical", false)).toBe(false);
    expect(Reflect.set(item.sourceFamilies, "0", "changed")).toBe(false);
    expect(verifyEvidenceReviewQueueSnapshotScopeBinding(encoded.canonicalBytes, encoded.sha256, expected.identity, input))
      .toEqual({ status: "INVALID", code: "EXPECTED_SCOPE_IDENTITY_MISMATCH" });
  });
});
