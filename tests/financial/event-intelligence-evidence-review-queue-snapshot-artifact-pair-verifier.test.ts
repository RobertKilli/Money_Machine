import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { composeEventIntelligenceEvidenceReviewQueue } from "@/application/intelligence/compose-event-intelligence-evidence-review-queue";
import {
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_ARTIFACT_PAIR_VERIFIER_VERSION,
  verifyEvidenceReviewQueueSnapshotArtifactPair,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-artifact-pair-verifier";
import { decodeEvidenceReviewQueueSnapshotManifest, encodeEvidenceReviewQueueSnapshotManifest } from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-manifest-codec";
import { verifyEvidenceReviewQueueSnapshotManifestBinding } from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-manifest-binding";
import { verifyEvidenceReviewQueueSnapshotScopeBinding } from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-scope-binding";
import {
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
  encodeEvidenceReviewQueueSnapshot,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-codec";
import {
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_VERSION,
  type EvidenceReviewQueueSnapshotProvenanceReference,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-provenance-manifest";
import {
  buildEvidenceReviewQueueScopeIdentity,
  EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE,
  EVIDENCE_QUEUE_SCOPE_MATERIAL_VERSION,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-scope-identity";
import { EVIDENCE_REVIEW_QUEUE_VERSION, getEvidenceReviewQueueContract, isAuthenticEvidenceReviewItem, isAuthenticEvidenceReviewQueueSet, sealEvidenceReviewQueueSet } from "@/domain/intelligence/event-intelligence-evidence-review-queue";
import { adaptEvidenceReviewQueueSetToViewModel, createBlockedEvidenceReviewQueueViewModel, EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";
import { evaluateSourcePortfolioRouting, getSourcePortfolioDecision, isAuthenticRoutingEvaluation, SOURCE_PORTFOLIO_DECISION_VERSION } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { isAuthenticNewsDiscoveryCandidate } from "@/domain/intelligence/event-intelligence-news-discovery";

const cutoff = "2026-10-03T00:00:00.000Z";
const hashBytes = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
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

function references(at = cutoff): EvidenceReviewQueueSnapshotProvenanceReference[] {
  const a = "a".repeat(64), b = "b".repeat(64), c = "c".repeat(64);
  return [
    { family: "SEC_EVENT_DOCUMENT", schemaVersion: "sec-event-document-reference/v1", targetKind: "PROFILE", key: { profile_id: "sec-event/v1", fingerprint: a } },
    { family: "ISSUER_EVIDENCE", schemaVersion: "issuer-evidence-reference/v1", issuerEvidenceContractVersion: "event-intelligence-issuer-evidence/v1", evidenceMaterialIdentity: a, sourceOriginBinding: b },
    { family: "ASSET_MAPPING_REVISION", schemaVersion: "m5-asset-mapping-reference/v1", mapping_revision_id: "mapping-1", source_lineage_id: "lineage-1", provider_id: "PROVIDER", dataset_id: "dataset", dataset_version: "dataset/v1", canonical_asset_id: "asset-1", canonical_identifier: "ETH", asset_class: "CRYPTO" },
    { family: "DISCOVERY_SOURCE_RECORD", schemaVersion: "discovery-source-record-reference/v1", sourceType: "GDELT", localCandidateIdentity: a, materialVariantIdentity: b, receiptIdentity: c },
    { family: "CORRECTION_LINEAGE", schemaVersion: "correction-lineage-reference/v1", lineageContractVersion: "event-intelligence-correction-lineage/v1", rootClaimIdentity: a, orderedMemberIdentities: [a], selectedTerminalIdentity: b, evaluationAsOf: at },
    { family: "DERIVED_COMPOSITION", schemaVersion: "derived-composition-reference/v1", compositionContractVersion: "event-intelligence-evidence-review-queue-composition/v1", compositionMaterialIdentity: a },
    { family: "DERIVED_QUEUE_SET", schemaVersion: "derived-queue-set-reference/v1", queueContractVersion: "event-intelligence-evidence-review-queue-contract/v1", queueSetMaterialIdentity: a, sealedMemberSetIdentity: b },
    { family: "DERIVED_VIEW_MODEL", schemaVersion: "derived-view-model-reference/v1", viewModelContractVersion: "event-intelligence-evidence-review-queue-view-model/v1", safePayloadDigest: a, payloadLength: 12 },
  ];
}

function correction(index: number, at: string) : EvidenceReviewQueueSnapshotProvenanceReference {
  const identity = (n: number) => n.toString(16).padStart(64, "0");
  return { family: "CORRECTION_LINEAGE", schemaVersion: "correction-lineage-reference/v1", lineageContractVersion: "event-intelligence-correction-lineage/v1", rootClaimIdentity: identity(index * 3 + 1), orderedMemberIdentities: [identity(index * 3 + 2)], selectedTerminalIdentity: identity(index * 3 + 3), evaluationAsOf: at };
}

function historicalPayload() {
  const decision = getSourcePortfolioDecision();
  const routing = evaluateSourcePortfolioRouting(decision, {
    provenance: "SYNTHETIC", candidateId: "candidate:artifact-pair", jurisdiction: "US_SEC", listingScopes: ["listing:us-sec"],
    eventHint: "PURCHASE_INTENT", seenFamilies: ["DISCOVERY_AGGREGATOR"], availableFamilies: ["FILING_AUTHORITY"],
    issuerMapped: false, assetMapped: true, duplicate: false, rightsApproved: true, credentialAvailable: true,
    completionMaterialPresent: false, primaryAvailable: true, qualificationComplete: true,
    correctionPresent: false, correctionResolved: true, correctionFieldHints: [], retracted: false, conflicts: [], stale: false, originBindings: [],
    publicationAt: "2026-10-01T00:00:00.000Z", discoveredAt: "2026-10-01T00:01:00.000Z", receivedAt: "2026-10-01T00:02:00.000Z",
    correctionAvailableAt: null, evaluationAsOf: cutoff,
  });
  const sealed = sealEvidenceReviewQueueSet(decision, [routing]);
  if (sealed.status !== "SEALED") throw new Error("INVALID_SYNTHETIC_QUEUE");
  const projected = adaptEvidenceReviewQueueSetToViewModel(getEvidenceReviewQueueContract(), sealed.queueSet);
  if (projected.status !== "PROJECTED") throw new Error("INVALID_SYNTHETIC_PROJECTION");
  return projected.model;
}

function artifacts(payload: unknown = createBlockedEvidenceReviewQueueViewModel(), refs: readonly EvidenceReviewQueueSnapshotProvenanceReference[] = [], snapshotCutoff = cutoff) {
  const scope = buildEvidenceReviewQueueScopeIdentity(material());
  if (scope.status !== "VALID_SYNTAX_ONLY") throw new Error("INVALID_TEST_SCOPE");
  const snapshot = encodeEvidenceReviewQueueSnapshot({
    formatVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
    viewModelVersion: EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION,
    scopeIdentity: scope.identity,
    snapshotCutoff,
    payload,
  });
  if (snapshot.status !== "VALID") throw new Error("INVALID_TEST_SNAPSHOT");
  const manifest = encodeEvidenceReviewQueueSnapshotManifest({
    manifestContractVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_VERSION,
    snapshotFormatVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
    snapshotDigest: snapshot.value.sha256,
    scopeIdentity: scope.identity,
    members: refs.map((reference, ordinal) => ({ snapshotDigest: snapshot.value.sha256, scopeIdentity: scope.identity, ordinal, reference })),
  });
  if (manifest.status !== "CANONICALIZED_NON_AUTHORITATIVE") throw new Error("INVALID_TEST_MANIFEST");
  return { scope, snapshot: snapshot.value, manifest };
}

function verify(bundle: ReturnType<typeof artifacts>, overrides: Partial<{
  snapshotBytes: unknown; snapshotDigest: unknown; manifestBytes: unknown; manifestDigest: unknown; scopeIdentity: unknown; scopeMaterial: unknown;
}> = {}) {
  return verifyEvidenceReviewQueueSnapshotArtifactPair(
    overrides.snapshotBytes ?? bundle.snapshot.canonicalBytes,
    overrides.snapshotDigest ?? bundle.snapshot.sha256,
    overrides.manifestBytes ?? bundle.manifest.canonicalBytes,
    overrides.manifestDigest ?? bundle.manifest.sha256,
    overrides.scopeIdentity ?? bundle.scope.identity,
    overrides.scopeMaterial ?? material(),
  );
}

describe("snapshot artifact-pair local verifier", () => {
  it("verifies separately digested snapshot and manifest artifacts using all eight families", () => {
    const bundle = artifacts(undefined, references());
    const result = verify(bundle);
    expect(result.status).toBe("VERIFIED_LOCAL_ARTIFACT_PAIR_NON_AUTHORITATIVE");
    if (result.status !== "VERIFIED_LOCAL_ARTIFACT_PAIR_NON_AUTHORITATIVE") return;
    expect(result).toMatchObject({
      contractVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_ARTIFACT_PAIR_VERIFIER_VERSION,
      snapshotDigest: bundle.snapshot.sha256,
      manifestDigest: bundle.manifest.sha256,
      scopeIdentity: bundle.scope.identity,
    });
    expect(result.envelope.snapshotCutoff).toBe(cutoff);
    expect(result.manifest.members).toHaveLength(8);
    expect(result.envelope.payload.state).toBe("BLOCKED");
    expect(result).not.toHaveProperty("bytes");
  });

  it("accepts an empty inventory without completeness or authority upgrade", () => {
    const result = verify(artifacts());
    expect(result.status).toBe("VERIFIED_LOCAL_ARTIFACT_PAIR_NON_AUTHORITATIVE");
    if (result.status !== "VERIFIED_LOCAL_ARTIFACT_PAIR_NON_AUTHORITATIVE") return;
    expect(result.manifest.members).toEqual([]);
    expect(result).not.toHaveProperty("complete");
    expect(result).not.toHaveProperty("sealed");
    expect(isAuthenticEvidenceReviewQueueSet(result.envelope.payload)).toBe(false);
  });

  it("preserves historical OPEN status without restoring item, routing, discovery, or queue trust", () => {
    const payload = historicalPayload();
    expect(payload.items[0]).toMatchObject({ status: "OPEN", historical: true });
    const result = verify(artifacts(payload));
    expect(result.status).toBe("VERIFIED_LOCAL_ARTIFACT_PAIR_NON_AUTHORITATIVE");
    if (result.status !== "VERIFIED_LOCAL_ARTIFACT_PAIR_NON_AUTHORITATIVE") return;
    const item = result.envelope.payload.items[0]!;
    expect(item).toMatchObject({ status: "OPEN", historical: true });
    expect(isAuthenticEvidenceReviewQueueSet(result.envelope.payload)).toBe(false);
    expect(isAuthenticEvidenceReviewItem(item)).toBe(false);
    expect(isAuthenticRoutingEvaluation(item)).toBe(false);
    expect(isAuthenticNewsDiscoveryCandidate(item)).toBe(false);
    expect(composeEventIntelligenceEvidenceReviewQueue({ evaluationAsOf: cutoff, candidates: [{ candidate: item, routingMaterial: result }] }))
      .toEqual({ status: "BLOCKED", code: "COMPOSITION_CANDIDATE_UNTRUSTED" });
  });

  it("rejects altered manifest bytes against the old digest but permits a replacement manifest with its new digest", () => {
    const bundle = artifacts();
    const alternate = artifacts(undefined, [references()[0]!]);
    expect(verifyEvidenceReviewQueueSnapshotArtifactPair(
      bundle.snapshot.canonicalBytes, bundle.snapshot.sha256,
      alternate.manifest.canonicalBytes, bundle.manifest.sha256,
      bundle.scope.identity, material(),
    )).toEqual({ status: "INVALID", code: "MANIFEST_CODEC_REJECTED", codecError: { status: "INVALID", code: "DIGEST_MISMATCH" } });
    const accepted = verifyEvidenceReviewQueueSnapshotArtifactPair(
      bundle.snapshot.canonicalBytes, bundle.snapshot.sha256,
      alternate.manifest.canonicalBytes, alternate.manifest.sha256,
      bundle.scope.identity, material(),
    );
    expect(accepted.status).toBe("VERIFIED_LOCAL_ARTIFACT_PAIR_NON_AUTHORITATIVE");
    if (accepted.status === "VERIFIED_LOCAL_ARTIFACT_PAIR_NON_AUTHORITATIVE") expect(accepted.manifest.members).toHaveLength(1);
  });

  it("rejects snapshot bytes changed against the old snapshot digest", () => {
    const original = artifacts();
    const changed = artifacts(createBlockedEvidenceReviewQueueViewModel(), [], "2026-10-04T00:00:00.000Z");
    const result = verifyEvidenceReviewQueueSnapshotArtifactPair(
      changed.snapshot.canonicalBytes, original.snapshot.sha256,
      original.manifest.canonicalBytes, original.manifest.sha256,
      original.scope.identity, material(),
    );
    expect(result).toEqual({
      status: "INVALID", code: "SNAPSHOT_MANIFEST_BINDING_REJECTED",
      bindingError: { status: "INVALID", code: "SNAPSHOT_SCOPE_BINDING_REJECTED", bindingError: { status: "INVALID", code: "SNAPSHOT_CODEC_REJECTED", codecCode: "DIGEST_MISMATCH" } },
    });
  });

  it("lets both codecs pass independently before rejecting cross-artifact digest/scope bindings", () => {
    const a = artifacts();
    const b = artifacts(undefined, [references()[0]!], "2026-10-04T00:00:00.000Z");
    expect(decodeEvidenceReviewQueueSnapshotManifest(b.manifest.canonicalBytes, b.manifest.sha256).status).toBe("DECODED_CANONICAL_NON_AUTHORITATIVE");
    expect(verifyEvidenceReviewQueueSnapshotScopeBinding(a.snapshot.canonicalBytes, a.snapshot.sha256, a.scope.identity, material()).status)
      .toBe("VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE");
    expect(verifyEvidenceReviewQueueSnapshotManifestBinding(a.snapshot.canonicalBytes, a.snapshot.sha256, a.scope.identity, material(), b.manifest.envelope.manifest))
      .toEqual({ status: "INVALID", code: "MANIFEST_SNAPSHOT_DIGEST_MISMATCH" });
    const crossDigest = verifyEvidenceReviewQueueSnapshotArtifactPair(
      a.snapshot.canonicalBytes, a.snapshot.sha256, b.manifest.canonicalBytes, b.manifest.sha256, a.scope.identity, material(),
    );
    expect(crossDigest).toEqual({ status: "INVALID", code: "SNAPSHOT_MANIFEST_BINDING_REJECTED", bindingError: { status: "INVALID", code: "MANIFEST_SNAPSHOT_DIGEST_MISMATCH" } });

    const wrongScope = `eviqs1_${"e".repeat(64)}`;
    const wrongScopeManifest = encodeEvidenceReviewQueueSnapshotManifest({
      manifestContractVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_VERSION,
      snapshotFormatVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
      snapshotDigest: a.snapshot.sha256,
      scopeIdentity: wrongScope,
      members: [],
    });
    expect(wrongScopeManifest.status).toBe("CANONICALIZED_NON_AUTHORITATIVE");
    if (wrongScopeManifest.status !== "CANONICALIZED_NON_AUTHORITATIVE") return;
    expect(decodeEvidenceReviewQueueSnapshotManifest(wrongScopeManifest.canonicalBytes, wrongScopeManifest.sha256).status).toBe("DECODED_CANONICAL_NON_AUTHORITATIVE");
    const wrongScopeBytes = verifyEvidenceReviewQueueSnapshotArtifactPair(
      a.snapshot.canonicalBytes, a.snapshot.sha256, wrongScopeManifest.canonicalBytes, wrongScopeManifest.sha256, a.scope.identity, material(),
    );
    expect(wrongScopeBytes).toEqual({ status: "INVALID", code: "SNAPSHOT_MANIFEST_BINDING_REJECTED", bindingError: { status: "INVALID", code: "MANIFEST_SNAPSHOT_SCOPE_MISMATCH" } });

    const wrongSnapshotDigest = "e".repeat(64);
    const wrongDigestManifest = encodeEvidenceReviewQueueSnapshotManifest({
      manifestContractVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_VERSION,
      snapshotFormatVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
      snapshotDigest: wrongSnapshotDigest,
      scopeIdentity: a.scope.identity,
      members: [],
    });
    expect(wrongDigestManifest.status).toBe("CANONICALIZED_NON_AUTHORITATIVE");
    if (wrongDigestManifest.status !== "CANONICALIZED_NON_AUTHORITATIVE") return;
    expect(decodeEvidenceReviewQueueSnapshotManifest(wrongDigestManifest.canonicalBytes, wrongDigestManifest.sha256).status).toBe("DECODED_CANONICAL_NON_AUTHORITATIVE");
    expect(verifyEvidenceReviewQueueSnapshotScopeBinding(a.snapshot.canonicalBytes, a.snapshot.sha256, a.scope.identity, material()).status)
      .toBe("VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE");
    expect(verifyEvidenceReviewQueueSnapshotArtifactPair(
      a.snapshot.canonicalBytes, a.snapshot.sha256, wrongDigestManifest.canonicalBytes, wrongDigestManifest.sha256, a.scope.identity, material(),
    )).toEqual({ status: "INVALID", code: "SNAPSHOT_MANIFEST_BINDING_REJECTED", bindingError: { status: "INVALID", code: "MANIFEST_SNAPSHOT_DIGEST_MISMATCH" } });
  });

  it("maps scope expectation and correction-cutoff parent rejections without changing their causes", () => {
    const bundle = artifacts();
    const scopeMismatch = verify(bundle, { scopeIdentity: `eviqs1_${"e".repeat(64)}` });
    expect(scopeMismatch).toEqual({ status: "INVALID", code: "SNAPSHOT_MANIFEST_BINDING_REJECTED", bindingError: { status: "INVALID", code: "SNAPSHOT_SCOPE_BINDING_REJECTED", bindingError: { status: "INVALID", code: "EXPECTED_SCOPE_IDENTITY_MISMATCH" } } });
    const alteredMaterial = { ...material(), jurisdictionUniverse: ["AU_ASX"] };
    expect(verify(bundle, { scopeMaterial: alteredMaterial })).toEqual({ status: "INVALID", code: "SNAPSHOT_MANIFEST_BINDING_REJECTED", bindingError: { status: "INVALID", code: "SNAPSHOT_SCOPE_BINDING_REJECTED", bindingError: { status: "INVALID", code: "EXPECTED_SCOPE_IDENTITY_MISMATCH" } } });

    const wrongLast = artifacts(undefined, [correction(1, cutoff), correction(2, "2026-10-04T00:00:00.000Z")]);
    expect(verifyEvidenceReviewQueueSnapshotArtifactPair(wrongLast.snapshot.canonicalBytes, wrongLast.snapshot.sha256, wrongLast.manifest.canonicalBytes, wrongLast.manifest.sha256, wrongLast.scope.identity, material()))
      .toEqual({ status: "INVALID", code: "SNAPSHOT_MANIFEST_BINDING_REJECTED", bindingError: { status: "INVALID", code: "CORRECTION_CUTOFF_MISMATCH" } });
  });

  it("gives manifest codec rejection priority over invalid snapshot/scope inputs", () => {
    const malformed = new TextEncoder().encode("{");
    const digest = "";
    expect(verifyEvidenceReviewQueueSnapshotArtifactPair(null, null, malformed, digest, null, null))
      .toEqual({ status: "INVALID", code: "MANIFEST_CODEC_REJECTED", codecError: { status: "INVALID", code: "DIGEST_INVALID" } });
    expect(verifyEvidenceReviewQueueSnapshotArtifactPair(null, null, malformed, hashBytes(malformed), null, null))
      .toEqual({ status: "INVALID", code: "MANIFEST_CODEC_REJECTED", codecError: { status: "INVALID", code: "JSON_INVALID" } });
  });

  it("fails closed for every missing positional expectation", () => {
    const bundle = artifacts();
    const args: unknown[] = [bundle.snapshot.canonicalBytes, bundle.snapshot.sha256, bundle.manifest.canonicalBytes, bundle.manifest.sha256, bundle.scope.identity, material()];
    for (let index = 0; index < args.length; index++) {
      const missing = args.slice(); missing[index] = undefined;
      expect(Reflect.apply(verifyEvidenceReviewQueueSnapshotArtifactPair, undefined, missing).status).toBe("INVALID");
    }
    expect(Reflect.apply(verifyEvidenceReviewQueueSnapshotArtifactPair, undefined, args.slice(0, 5)).status).toBe("INVALID");
  });

  it("does not retain caller references and freezes the complete successful result", () => {
    const bundle = artifacts(undefined, references());
    const snapshotBytes = new Uint8Array(bundle.snapshot.canonicalBytes);
    const manifestBytes = new Uint8Array(bundle.manifest.canonicalBytes);
    const scopeInput = material();
    const result = verifyEvidenceReviewQueueSnapshotArtifactPair(
      snapshotBytes, bundle.snapshot.sha256, manifestBytes, bundle.manifest.sha256, bundle.scope.identity, scopeInput,
    );
    expect(result.status).toBe("VERIFIED_LOCAL_ARTIFACT_PAIR_NON_AUTHORITATIVE");
    expect(Object.isFrozen(snapshotBytes)).toBe(false);
    expect(Object.isFrozen(manifestBytes)).toBe(false);
    expect(Object.isFrozen(scopeInput)).toBe(false);
    expect(Object.isFrozen(scopeInput.jurisdictionUniverse)).toBe(false);
    expect(snapshotBytes).toEqual(bundle.snapshot.canonicalBytes);
    expect(manifestBytes).toEqual(bundle.manifest.canonicalBytes);
    snapshotBytes.fill(0);
    manifestBytes.fill(0);
    scopeInput.jurisdictionUniverse.reverse();
    if (result.status !== "VERIFIED_LOCAL_ARTIFACT_PAIR_NON_AUTHORITATIVE") return;
    expect(result.envelope.payload.state).toBe("BLOCKED");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.envelope)).toBe(true);
    expect(Object.isFrozen(result.envelope.payload)).toBe(true);
    expect(Object.isFrozen(result.manifest)).toBe(true);
    expect(Object.isFrozen(result.manifest.members)).toBe(true);
    expect(Object.isFrozen(result.manifest.members[0]!.reference)).toBe(true);
    const sec = result.manifest.members.find(member => member.reference.family === "SEC_EVENT_DOCUMENT");
    expect(Object.isFrozen((sec!.reference as Extract<EvidenceReviewQueueSnapshotProvenanceReference, { family: "SEC_EVENT_DOCUMENT" }>).key)).toBe(true);
    const correctionMember = result.manifest.members.find(member => member.reference.family === "CORRECTION_LINEAGE");
    expect(Object.isFrozen((correctionMember!.reference as Extract<EvidenceReviewQueueSnapshotProvenanceReference, { family: "CORRECTION_LINEAGE" }>).orderedMemberIdentities)).toBe(true);
  });
});
