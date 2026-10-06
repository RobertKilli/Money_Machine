import "server-only";

import {
  decodeEvidenceReviewQueueSnapshotManifest,
  type EvidenceReviewQueueSnapshotManifestDecodeResult,
} from "./event-intelligence-evidence-review-queue-snapshot-manifest-codec";
import {
  verifyEvidenceReviewQueueSnapshotManifestBinding,
  type EvidenceReviewQueueSnapshotManifestBindingResult,
} from "./event-intelligence-evidence-review-queue-snapshot-manifest-binding";

export const EVIDENCE_REVIEW_QUEUE_SNAPSHOT_ARTIFACT_PAIR_VERIFIER_VERSION =
  "event-intelligence-evidence-review-queue-snapshot-artifact-pair-verifier/v1" as const;

type ManifestCodecError = Extract<EvidenceReviewQueueSnapshotManifestDecodeResult, { status: "INVALID" }>;
type ManifestBindingError = Exclude<
  EvidenceReviewQueueSnapshotManifestBindingResult,
  { status: "VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE" }
>;

export type EvidenceReviewQueueSnapshotArtifactPairResult =
  | Readonly<{
      status: "VERIFIED_LOCAL_ARTIFACT_PAIR_NON_AUTHORITATIVE";
      contractVersion: typeof EVIDENCE_REVIEW_QUEUE_SNAPSHOT_ARTIFACT_PAIR_VERIFIER_VERSION;
      snapshotDigest: string;
      manifestDigest: string;
      scopeIdentity: string;
      envelope: Extract<EvidenceReviewQueueSnapshotManifestBindingResult, { status: "VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE" }> ["envelope"];
      manifest: Extract<EvidenceReviewQueueSnapshotManifestBindingResult, { status: "VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE" }> ["manifest"];
    }>
  | Readonly<{ status: "INVALID"; code: "MANIFEST_CODEC_REJECTED"; codecError: ManifestCodecError }>
  | Readonly<{ status: "INVALID"; code: "SNAPSHOT_MANIFEST_BINDING_REJECTED"; bindingError: ManifestBindingError }>;

/**
 * Decodes the caller-supplied manifest artifact first, then binds that validated
 * manifest to the snapshot and separate scope expectations through the existing
 * parent verifier. Success establishes only local byte/syntax binding.
 */
export function verifyEvidenceReviewQueueSnapshotArtifactPair(
  snapshotBytes: unknown,
  expectedSnapshotDigest: unknown,
  manifestBytes: unknown,
  expectedManifestDigest: unknown,
  expectedScopeIdentity: unknown,
  expectedScopeMaterial: unknown,
): EvidenceReviewQueueSnapshotArtifactPairResult {
  const manifest = decodeEvidenceReviewQueueSnapshotManifest(manifestBytes, expectedManifestDigest);
  if (manifest.status !== "DECODED_CANONICAL_NON_AUTHORITATIVE") {
    return Object.freeze({ status: "INVALID", code: "MANIFEST_CODEC_REJECTED", codecError: manifest });
  }

  const binding = verifyEvidenceReviewQueueSnapshotManifestBinding(
    snapshotBytes,
    expectedSnapshotDigest,
    expectedScopeIdentity,
    expectedScopeMaterial,
    manifest.envelope.manifest,
  );
  if (binding.status !== "VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE") {
    return Object.freeze({ status: "INVALID", code: "SNAPSHOT_MANIFEST_BINDING_REJECTED", bindingError: binding });
  }

  return Object.freeze({
    status: "VERIFIED_LOCAL_ARTIFACT_PAIR_NON_AUTHORITATIVE",
    contractVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_ARTIFACT_PAIR_VERIFIER_VERSION,
    snapshotDigest: binding.snapshotDigest,
    manifestDigest: manifest.sha256,
    scopeIdentity: binding.scopeIdentity,
    envelope: binding.envelope,
    manifest: binding.manifest,
  });
}
