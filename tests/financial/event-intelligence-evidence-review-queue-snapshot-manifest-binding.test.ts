import { describe, expect, it } from "vitest";
import { composeEventIntelligenceEvidenceReviewQueue } from "@/application/intelligence/compose-event-intelligence-evidence-review-queue";
import {
  EVIDENCE_QUEUE_PROVENANCE_FAMILIES,
  type EvidenceQueueProvenanceReference,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-scope-provenance-decision";
import {
  encodeEvidenceReviewQueueSnapshot,
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-codec";
import {
  buildEvidenceReviewQueueScopeIdentity,
  EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE,
  EVIDENCE_QUEUE_SCOPE_MATERIAL_VERSION,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-scope-identity";
import {
  parseEvidenceReviewQueueSnapshotProvenanceManifest,
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_VERSION,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-provenance-manifest";
import { verifyEvidenceReviewQueueSnapshotScopeBinding } from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-scope-binding";
import {
  verifyEvidenceReviewQueueSnapshotManifestBinding,
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_BINDING_VERSION,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-manifest-binding";
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
import { createSyntheticNewsDiscoveryCandidate, isAuthenticNewsDiscoveryCandidate } from "@/domain/intelligence/event-intelligence-news-discovery";
import { syntheticNewsRecord } from "../fixtures/event-intelligence-news-discovery";

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

function expectedScope() {
  const result = buildEvidenceReviewQueueScopeIdentity(material());
  if (result.status !== "VALID_SYNTAX_ONLY") throw Error("INVALID_SYNTHETIC_SCOPE");
  return result;
}

function historicalPayload() {
  const decision = getSourcePortfolioDecision();
  const routing = evaluateSourcePortfolioRouting(decision, {
    provenance: "SYNTHETIC", candidateId: "candidate:manifest-binding", jurisdiction: "US_SEC", listingScopes: ["listing:us-sec"],
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

function snapshot(payload: unknown = createBlockedEvidenceReviewQueueViewModel(), snapshotCutoff = cutoff) {
  const scope = expectedScope();
  const encoded = encodeEvidenceReviewQueueSnapshot({
    formatVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
    viewModelVersion: EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION,
    scopeIdentity: scope.identity,
    snapshotCutoff,
    payload,
  });
  if (encoded.status !== "VALID") throw Error("INVALID_SYNTHETIC_SNAPSHOT");
  return { scope, encoded: encoded.value };
}

function references(): EvidenceQueueProvenanceReference[] {
  const sha = "a".repeat(64);
  return [
    { family: "SEC_EVENT_DOCUMENT", schemaVersion: "sec-event-document-reference/v1", targetKind: "PROFILE", key: { profile_id: "sec-event/v1", fingerprint: sha } },
    { family: "ISSUER_EVIDENCE", schemaVersion: "issuer-evidence-reference/v1", issuerEvidenceContractVersion: "event-intelligence-issuer-evidence/v1", evidenceMaterialIdentity: sha, sourceOriginBinding: "b".repeat(64) },
    { family: "ASSET_MAPPING_REVISION", schemaVersion: "m5-asset-mapping-reference/v1", mapping_revision_id: "mapping-1", source_lineage_id: "lineage-1", provider_id: "PROVIDER", dataset_id: "dataset", dataset_version: "dataset/v1", canonical_asset_id: "asset-1", canonical_identifier: "ETH", asset_class: "CRYPTO" },
    { family: "DISCOVERY_SOURCE_RECORD", schemaVersion: "discovery-source-record-reference/v1", sourceType: "GDELT", localCandidateIdentity: sha, materialVariantIdentity: "b".repeat(64), receiptIdentity: "c".repeat(64) },
    { family: "CORRECTION_LINEAGE", schemaVersion: "correction-lineage-reference/v1", lineageContractVersion: "event-intelligence-correction-lineage/v1", rootClaimIdentity: sha, orderedMemberIdentities: [sha], selectedTerminalIdentity: "b".repeat(64), evaluationAsOf: cutoff },
    { family: "DERIVED_COMPOSITION", schemaVersion: "derived-composition-reference/v1", compositionContractVersion: "event-intelligence-evidence-review-queue-composition/v1", compositionMaterialIdentity: sha },
    { family: "DERIVED_QUEUE_SET", schemaVersion: "derived-queue-set-reference/v1", queueContractVersion: "event-intelligence-evidence-review-queue-contract/v1", queueSetMaterialIdentity: sha, sealedMemberSetIdentity: "b".repeat(64) },
    { family: "DERIVED_VIEW_MODEL", schemaVersion: "derived-view-model-reference/v1", viewModelContractVersion: "event-intelligence-evidence-review-queue-view-model/v1", safePayloadDigest: sha, payloadLength: 12 },
  ];
}

const hashValue = (value: number) => value.toString(16).padStart(64, "0");

function manifest(snapshotDigest: string, scopeIdentity: string, refs: readonly EvidenceQueueProvenanceReference[] = []) {
  return {
    manifestContractVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_VERSION,
    snapshotFormatVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
    snapshotDigest,
    scopeIdentity,
    members: refs.map((reference, ordinal) => ({ snapshotDigest, scopeIdentity, ordinal, reference })),
  };
}

function verify(encoded: ReturnType<typeof snapshot>["encoded"], scope = expectedScope(), input = manifest(encoded.sha256, scope.identity)) {
  return verifyEvidenceReviewQueueSnapshotManifestBinding(encoded.canonicalBytes, encoded.sha256, scope.identity, material(), input);
}

describe("snapshot manifest local binding", () => {
  it("binds a syntactic inventory from all eight families to the decoded snapshot", () => {
    const { scope, encoded } = snapshot();
    const refs = references();
    expect(refs.map(reference => reference.family)).toEqual(EVIDENCE_QUEUE_PROVENANCE_FAMILIES);
    const input = manifest(encoded.sha256, scope.identity, refs);
    const result = verify(encoded, scope, input);
    expect(result.status).toBe("VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE");
    if (result.status !== "VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE") return;
    expect(result).toMatchObject({ contractVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_BINDING_VERSION, scopeIdentity: scope.identity, snapshotDigest: encoded.sha256 });
    expect(result.envelope.snapshotCutoff).toBe(cutoff);
    expect(result.manifest.members.map(member => member.ordinal)).toEqual(refs.map((_, index) => index));
    expect(result.envelope.payload.state).toBe("BLOCKED");
    expect(isAuthenticEvidenceReviewQueueSet(result.envelope.payload)).toBe(false);
  });

  it("accepts an empty inventory without adding provenance completeness", () => {
    const { scope, encoded } = snapshot();
    const result = verify(encoded, scope, manifest(encoded.sha256, scope.identity));
    expect(result.status).toBe("VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE");
    if (result.status !== "VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE") return;
    expect(result.manifest.members).toEqual([]);
    expect(result).not.toHaveProperty("complete");
    expect(result).not.toHaveProperty("sealed");
  });

  it("preserves historical view status without restoring item, routing, or composition trust", () => {
    const payload = historicalPayload();
    expect(payload.state).toBe("HAS_REVIEW_ITEMS");
    expect(payload.items[0]).toMatchObject({ status: "OPEN", historical: true });
    const { scope, encoded } = snapshot(payload);
    const result = verify(encoded, scope);
    expect(result.status).toBe("VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE");
    if (result.status !== "VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE") return;
    const item = result.envelope.payload.items[0]!;
    expect(item).toMatchObject({ status: "OPEN", historical: true });
    for (const value of [result, result.envelope, result.envelope.payload, item, result.manifest]) {
      expect(isAuthenticEvidenceReviewQueueSet(value)).toBe(false);
      expect(isAuthenticEvidenceReviewItem(value)).toBe(false);
      expect(isAuthenticRoutingEvaluation(value)).toBe(false);
      expect(isAuthenticNewsDiscoveryCandidate(value)).toBe(false);
    }
    expect(composeEventIntelligenceEvidenceReviewQueue({ evaluationAsOf: cutoff, candidates: [{ candidate: item, routingMaterial: result }] }))
      .toEqual({ status: "BLOCKED", code: "COMPOSITION_CANDIDATE_UNTRUSTED" });
  });

  it("gives snapshot-scope binding errors priority over malformed manifests", () => {
    const { scope, encoded } = snapshot();
    expect(verifyEvidenceReviewQueueSnapshotManifestBinding(null, "bad", scope.identity, material(), null))
      .toEqual({ status: "INVALID", code: "SNAPSHOT_SCOPE_BINDING_REJECTED", bindingError: { status: "INVALID", code: "SNAPSHOT_CODEC_REJECTED", codecCode: "BYTE_INPUT_INVALID" } });
    expect(verifyEvidenceReviewQueueSnapshotManifestBinding(encoded.canonicalBytes, encoded.sha256, `${scope.identity}\n`, material(), null))
      .toEqual({ status: "INVALID", code: "SNAPSHOT_SCOPE_BINDING_REJECTED", bindingError: { status: "INVALID", code: "EXPECTED_SCOPE_INVALID", scopeCode: "SCOPE_IDENTITY_INVALID" } });
    expect(verifyEvidenceReviewQueueSnapshotManifestBinding(encoded.canonicalBytes, encoded.sha256, scope.identity, material(), null))
      .toEqual({ status: "INVALID", code: "MANIFEST_SYNTAX_REJECTED", manifestCode: "MANIFEST_SHAPE_INVALID" });
  });

  it("checks digest before scope and scope before correction cutoff", () => {
    const { scope, encoded } = snapshot();
    const bothRootMismatches = manifest("f".repeat(64), `eviqs1_${"b".repeat(64)}`);
    expect(parseEvidenceReviewQueueSnapshotProvenanceManifest(bothRootMismatches).status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    expect(verify(encoded, scope, bothRootMismatches)).toEqual({ status: "INVALID", code: "MANIFEST_SNAPSHOT_DIGEST_MISMATCH" });

    const wrongCutoff = { ...references()[4]!, evaluationAsOf: "2026-10-03T00:00:01.000Z" } as EvidenceQueueProvenanceReference;
    const scopeAndCutoffMismatch = manifest(encoded.sha256, `eviqs1_${"b".repeat(64)}`, [wrongCutoff]);
    expect(parseEvidenceReviewQueueSnapshotProvenanceManifest(scopeAndCutoffMismatch).status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    expect(verify(encoded, scope, scopeAndCutoffMismatch)).toEqual({ status: "INVALID", code: "MANIFEST_SNAPSHOT_SCOPE_MISMATCH" });
  });

  it("does not fall back when any runtime argument is omitted", () => {
    const { scope, encoded } = snapshot();
    const args = [encoded.canonicalBytes, encoded.sha256, scope.identity, material(), manifest(encoded.sha256, scope.identity)];
    for (const omitted of [0, 1, 2, 3, 4]) {
      const partial = args.slice(); partial.splice(omitted, 1);
      expect(Reflect.apply(verifyEvidenceReviewQueueSnapshotManifestBinding, undefined, partial).status).toBe("INVALID");
    }
    expect(Reflect.apply(verifyEvidenceReviewQueueSnapshotManifestBinding, undefined, args.slice(0, 4)))
      .toEqual({ status: "INVALID", code: "MANIFEST_SYNTAX_REJECTED", manifestCode: "MANIFEST_SHAPE_INVALID" });
  });

  it("rejects a parser-valid different digest only after snapshot binding and syntax pass", () => {
    const { scope, encoded } = snapshot();
    const otherDigest = "f".repeat(64);
    const input = manifest(otherDigest, scope.identity, references().slice(0, 1));
    expect(parseEvidenceReviewQueueSnapshotProvenanceManifest(input).status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    expect(verifyEvidenceReviewQueueSnapshotScopeBinding(encoded.canonicalBytes, encoded.sha256, scope.identity, material()).status)
      .toBe("VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE");
    expect(verify(encoded, scope, input)).toEqual({ status: "INVALID", code: "MANIFEST_SNAPSHOT_DIGEST_MISMATCH" });
  });

  it("rejects a parser-valid different scope only after both parent validations pass", () => {
    const { scope, encoded } = snapshot();
    const otherScope = `eviqs1_${"b".repeat(64)}`;
    const input = manifest(encoded.sha256, otherScope, references().slice(0, 1));
    expect(parseEvidenceReviewQueueSnapshotProvenanceManifest(input).status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    expect(verifyEvidenceReviewQueueSnapshotScopeBinding(encoded.canonicalBytes, encoded.sha256, scope.identity, material()).status)
      .toBe("VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE");
    expect(verify(encoded, scope, input)).toEqual({ status: "INVALID", code: "MANIFEST_SNAPSHOT_SCOPE_MISMATCH" });
  });

  it("requires exact canonical cutoff equality for every correction reference, including the last", () => {
    const { scope, encoded } = snapshot();
    const refs = references();
    const matching = manifest(encoded.sha256, scope.identity, [refs[4]!, refs[0]!]);
    expect(verify(encoded, scope, matching).status).toBe("VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE");
    for (const mismatchIndex of [0, 1, 2]) {
      const corrections = [0, 1, 2].map(index => ({
        ...refs[4]!,
        rootClaimIdentity: hashValue(index + 1),
        selectedTerminalIdentity: hashValue(index + 10),
        evaluationAsOf: index === mismatchIndex ? "2026-10-03T00:00:01.000Z" : cutoff,
      } as EvidenceQueueProvenanceReference));
      const input = manifest(encoded.sha256, scope.identity, corrections);
      expect(parseEvidenceReviewQueueSnapshotProvenanceManifest(input).status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
      expect(verify(encoded, scope, input)).toEqual({ status: "INVALID", code: "CORRECTION_CUTOFF_MISMATCH" });
    }
  });

  it("accepts other parser-valid inventories for the same binding without claiming manifest integrity", () => {
    const { scope, encoded } = snapshot();
    const alternate = references()[5]!;
    const result = verify(encoded, scope, manifest(encoded.sha256, scope.identity, [alternate]));
    expect(result.status).toBe("VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE");
    if (result.status === "VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE") {
      expect(result.manifest.members).toHaveLength(1);
      expect(result).not.toHaveProperty("manifestDigest");
      expect(result).not.toHaveProperty("seal");
    }
  });

  it("isolates all returned data and deeply freezes envelope, manifest, arrays, and references", () => {
    const { scope, encoded } = snapshot();
    const input = manifest(encoded.sha256, scope.identity, [references()[4]!]);
    const beforeInput = JSON.stringify(input);
    const bytesBefore = new Uint8Array(encoded.canonicalBytes);
    const result = verify(encoded, scope, input);
    expect(result.status).toBe("VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE");
    expect(JSON.stringify(input)).toBe(beforeInput);
    expect(encoded.canonicalBytes).toEqual(bytesBefore);
    if (result.status !== "VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE") return;
    Reflect.set(input.members[0]!.reference, "evaluationAsOf", "2026-10-04T00:00:00.000Z");
    (Reflect.get(input.members[0]!.reference, "orderedMemberIdentities") as string[])[0] = "e".repeat(64);
    encoded.canonicalBytes.fill(0);
    expect(result.manifest.members[0]!.reference).toMatchObject({ family: "CORRECTION_LINEAGE", evaluationAsOf: cutoff, orderedMemberIdentities: ["a".repeat(64)] });
    const correction = result.manifest.members[0]!.reference as Extract<typeof result.manifest.members[number]["reference"], { family: "CORRECTION_LINEAGE" }>;
    for (const value of [result, result.envelope, result.envelope.payload, result.envelope.payload.items, result.manifest, result.manifest.members, result.manifest.members[0], correction, correction.orderedMemberIdentities]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Reflect.set(result, "snapshotDigest", "changed")).toBe(false);
    expect(Reflect.set(correction, "evaluationAsOf", "changed")).toBe(false);
  });

  it("does not treat a no-correction inventory as correction completeness", () => {
    const { scope, encoded } = snapshot();
    const result = verify(encoded, scope, manifest(encoded.sha256, scope.identity, references().filter(ref => ref.family !== "CORRECTION_LINEAGE")));
    expect(result.status).toBe("VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE");
    if (result.status === "VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE") expect(result).not.toHaveProperty("correctionComplete");
  });

  it("does not accept prior success objects as snapshot bytes or manifest input", () => {
    const { scope, encoded } = snapshot();
    const priorSuccess = verify(encoded, scope, manifest(encoded.sha256, scope.identity));
    expect(priorSuccess.status).toBe("VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE");
    expect(verifyEvidenceReviewQueueSnapshotManifestBinding(priorSuccess, encoded.sha256, scope.identity, material(), manifest(encoded.sha256, scope.identity)))
      .toMatchObject({ status: "INVALID", code: "SNAPSHOT_SCOPE_BINDING_REJECTED", bindingError: { code: "SNAPSHOT_CODEC_REJECTED", codecCode: "BYTE_INPUT_INVALID" } });
    expect(verify(encoded, scope, priorSuccess as unknown as ReturnType<typeof manifest>))
      .toEqual({ status: "INVALID", code: "MANIFEST_SYNTAX_REJECTED", manifestCode: "MANIFEST_SHAPE_INVALID" });
  });

  it("exercises composition's module-local candidate authenticity gate with a shape-compatible clone", () => {
    const authenticCandidate = createSyntheticNewsDiscoveryCandidate(syntheticNewsRecord(), cutoff);
    expect(authenticCandidate).not.toBeNull();
    expect(isAuthenticNewsDiscoveryCandidate(authenticCandidate)).toBe(true);
    const shapeCompatibleCopy = { ...authenticCandidate! };
    expect(isAuthenticNewsDiscoveryCandidate(shapeCompatibleCopy)).toBe(false);
    expect(composeEventIntelligenceEvidenceReviewQueue({
      evaluationAsOf: cutoff,
      candidates: [{ candidate: shapeCompatibleCopy, routingMaterial: {} }],
    })).toEqual({ status: "BLOCKED", code: "COMPOSITION_CANDIDATE_UNTRUSTED" });
  });
});
