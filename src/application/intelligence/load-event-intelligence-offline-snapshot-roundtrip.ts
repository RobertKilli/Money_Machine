import "server-only";

import { isDeepStrictEqual } from "node:util";
import { notFound } from "next/navigation";
import type { EvidenceReviewQueueViewModel } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";

export type OfflineSnapshotRoundtripResult = Readonly<
  | {
      status: "AVAILABLE";
      model: EvidenceReviewQueueViewModel;
      formatVersion: string;
      cutoff: string;
      byteLength: number;
      digest: string;
      verificationStatus: "VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE";
      changedBytesCode: "DIGEST_MISMATCH";
      changedScopeCode: "SNAPSHOT_SCOPE_MISMATCH";
      changedScopeCodecStatus: "VALID";
    }
  | { status: "UNAVAILABLE" }
>;

const CUTOFF = "2026-10-03T12:00:00.000Z";

/** Fixed syntactic declarations for this local demo; they do not resolve policy content. */
function createDemoScopeMaterial(
  sourcePortfolioContractVersion: string,
  queueContractVersion: string,
  accessClassification: "INTERNAL_GENERAL" | "INTERNAL_RESTRICTED" = "INTERNAL_RESTRICTED",
) {
  return {
    scopeMaterialVersion: "event-intelligence-evidence-review-queue-scope-material/v1",
    canonicalizationProfile: "event-intelligence-evidence-review-queue-scope-canonical-json/v1",
    reviewPurposePolicyVersion: "event-intelligence-review-purpose/v1",
    reviewPurpose: "CRYPTO_TREASURY_DISCLOSURE_REVIEW",
    jurisdictionUniverse: ["US_SEC", "GB_LSE"],
    eventRepresentationUniverse: ["COMPLETED_PURCHASE", "PURCHASE_INTENT"],
    assetRepresentationUniverse: ["asset-representation/v1/ethereum-native", "asset-representation/v1/ethereum-wrapped"],
    issuerListingEligibilityPolicy: { policyId: "issuer-listing-eligibility", version: "v1", canonicalMaterialDigest: "a".repeat(64) },
    sourcePortfolioPolicy: { contractVersion: sourcePortfolioContractVersion, canonicalMaterialDigest: "b".repeat(64) },
    routingPolicy: { policyId: "event-routing", version: "v2", canonicalMaterialDigest: "c".repeat(64) },
    queueContract: { contractVersion: queueContractVersion, canonicalMaterialDigest: "d".repeat(64) },
    accessClassificationPolicyVersion: "event-intelligence-review-access-classification/v1",
    accessClassification,
  } as const;
}

function unavailable(): OfflineSnapshotRoundtripResult {
  return Object.freeze({ status: "UNAVAILABLE" });
}

/** Runs the fixed later replay through existing codec and binding APIs in memory only. */
export async function loadEventIntelligenceOfflineSnapshotRoundtrip(): Promise<OfflineSnapshotRoundtripResult> {
  if (process.env.NODE_ENV !== "development") notFound();

  const [replayModule, scopeModule, codecModule, bindingModule, queueModule, portfolioModule, viewModelModule] = await Promise.all([
    import("@/application/intelligence/load-event-intelligence-offline-temporal-replay"),
    import("@/domain/intelligence/event-intelligence-evidence-review-queue-scope-identity"),
    import("@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-codec"),
    import("@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-scope-binding"),
    import("@/domain/intelligence/event-intelligence-evidence-review-queue"),
    import("@/domain/intelligence/event-intelligence-source-portfolio-routing-decision"),
    import("@/domain/intelligence/event-intelligence-evidence-review-queue-view-model"),
  ]);

  const replay = await replayModule.loadEventIntelligenceOfflineTemporalReplay();
  if (replay.status !== "AVAILABLE") return unavailable();
  const later = replay.episodes.find(episode => episode.key === "LATER");
  if (!later || later.evaluatedAsOf !== CUTOFF) return unavailable();

  // Establish expected scope independently of the envelope before encoding.
  const expectedMaterial = createDemoScopeMaterial(portfolioModule.SOURCE_PORTFOLIO_DECISION_VERSION, queueModule.EVIDENCE_REVIEW_QUEUE_VERSION);
  const expectedScope = scopeModule.buildEvidenceReviewQueueScopeIdentity(expectedMaterial);
  if (expectedScope.status !== "VALID_SYNTAX_ONLY") return unavailable();

  const encoded = codecModule.encodeEvidenceReviewQueueSnapshot({
    formatVersion: codecModule.EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
    viewModelVersion: viewModelModule.EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION,
    scopeIdentity: expectedScope.identity,
    snapshotCutoff: CUTOFF,
    payload: later.model,
  });
  if (encoded.status !== "VALID") return unavailable();

  const verified = bindingModule.verifyEvidenceReviewQueueSnapshotScopeBinding(
    encoded.value.canonicalBytes,
    encoded.value.sha256,
    expectedScope.identity,
    expectedMaterial,
  );
  if (verified.status !== "VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE") return unavailable();
  const decodedModel = verified.envelope.payload;
  if (!isDeepStrictEqual(decodedModel, later.model)) return unavailable();

  // A: an isolated byte copy retains the original encode-time digest.
  const changedBytes = new Uint8Array(encoded.value.canonicalBytes);
  changedBytes[0] = changedBytes[0] === 0x7b ? 0x5b : 0x7b;
  const changedBytesResult = bindingModule.verifyEvidenceReviewQueueSnapshotScopeBinding(
    changedBytes,
    encoded.value.sha256,
    expectedScope.identity,
    expectedMaterial,
  );
  if (changedBytesResult.status !== "INVALID" || changedBytesResult.code !== "SNAPSHOT_CODEC_REJECTED" || changedBytesResult.codecCode !== "DIGEST_MISMATCH") return unavailable();

  // B: valid bytes and their own digest decode, but the separate original scope expectation differs.
  const alternateScope = scopeModule.buildEvidenceReviewQueueScopeIdentity(createDemoScopeMaterial(
    portfolioModule.SOURCE_PORTFOLIO_DECISION_VERSION,
    queueModule.EVIDENCE_REVIEW_QUEUE_VERSION,
    "INTERNAL_GENERAL",
  ));
  if (alternateScope.status !== "VALID_SYNTAX_ONLY" || alternateScope.identity === expectedScope.identity) return unavailable();
  const otherEncoded = codecModule.encodeEvidenceReviewQueueSnapshot({
    formatVersion: codecModule.EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
    viewModelVersion: viewModelModule.EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION,
    scopeIdentity: alternateScope.identity,
    snapshotCutoff: CUTOFF,
    payload: later.model,
  });
  if (otherEncoded.status !== "VALID") return unavailable();
  const codecCheck = codecModule.decodeEvidenceReviewQueueSnapshot(otherEncoded.value.canonicalBytes, otherEncoded.value.sha256);
  if (codecCheck.status !== "VALID") return unavailable();
  const changedScopeResult = bindingModule.verifyEvidenceReviewQueueSnapshotScopeBinding(
    otherEncoded.value.canonicalBytes,
    otherEncoded.value.sha256,
    expectedScope.identity,
    expectedMaterial,
  );
  if (changedScopeResult.status !== "INVALID" || changedScopeResult.code !== "SNAPSHOT_SCOPE_MISMATCH") return unavailable();

  return Object.freeze({
    status: "AVAILABLE",
    model: decodedModel,
    formatVersion: encoded.value.envelope.formatVersion,
    cutoff: encoded.value.envelope.snapshotCutoff,
    byteLength: encoded.value.canonicalBytes.byteLength,
    digest: encoded.value.sha256,
    verificationStatus: verified.status,
    changedBytesCode: changedBytesResult.codecCode,
    changedScopeCode: changedScopeResult.code,
    changedScopeCodecStatus: codecCheck.status,
  });
}
