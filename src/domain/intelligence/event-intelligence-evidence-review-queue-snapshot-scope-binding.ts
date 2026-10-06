import "server-only";

import {
  verifyEvidenceReviewQueueScopeIdentity,
  type EvidenceQueueScopeIdentityErrorCode,
} from "./event-intelligence-evidence-review-queue-scope-identity";
import {
  decodeEvidenceReviewQueueSnapshot,
  type EvidenceReviewQueueSnapshotEnvelope,
  type SnapshotCodecErrorCode,
} from "./event-intelligence-evidence-review-queue-snapshot-codec";

export const EVIDENCE_REVIEW_QUEUE_SNAPSHOT_SCOPE_BINDING_VERSION = "event-intelligence-evidence-review-queue-snapshot-scope-binding/v1" as const;

export type EvidenceReviewQueueSnapshotScopeBindingResult =
  | Readonly<{
      status: "VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE";
      contractVersion: typeof EVIDENCE_REVIEW_QUEUE_SNAPSHOT_SCOPE_BINDING_VERSION;
      scopeIdentity: string;
      canonicalScopeMaterial: string;
      snapshotDigest: string;
      envelope: EvidenceReviewQueueSnapshotEnvelope;
    }>
  | Readonly<{ status: "INVALID"; code: "EXPECTED_SCOPE_INVALID"; scopeCode: Exclude<EvidenceQueueScopeIdentityErrorCode, "SCOPE_IDENTITY_MISMATCH"> }>
  | Readonly<{ status: "INVALID"; code: "EXPECTED_SCOPE_IDENTITY_MISMATCH" }>
  | Readonly<{ status: "INVALID"; code: "SNAPSHOT_CODEC_REJECTED"; codecCode: SnapshotCodecErrorCode }>
  | Readonly<{ status: "INVALID"; code: "SNAPSHOT_SCOPE_MISMATCH" }>;

/**
 * Requires four independent explicit arguments; expectations are never derived
 * from snapshot data. Checks expected scope first, codec second, envelope scope
 * last. Success is local byte integrity and identity equality only: it grants
 * no approval, access authorization, policy-content or composition authority.
 */
export function verifyEvidenceReviewQueueSnapshotScopeBinding(
  snapshotBytes: unknown,
  expectedSnapshotDigest: unknown,
  expectedScopeIdentity: unknown,
  expectedScopeMaterial: unknown,
): EvidenceReviewQueueSnapshotScopeBindingResult {
  const scope = verifyEvidenceReviewQueueScopeIdentity(expectedScopeMaterial, expectedScopeIdentity);
  if (scope.status === "INVALID") {
    if (scope.code === "SCOPE_IDENTITY_MISMATCH") {
      return Object.freeze({ status: "INVALID", code: "EXPECTED_SCOPE_IDENTITY_MISMATCH" });
    }
    return Object.freeze({ status: "INVALID", code: "EXPECTED_SCOPE_INVALID", scopeCode: scope.code });
  }

  const snapshot = decodeEvidenceReviewQueueSnapshot(snapshotBytes, expectedSnapshotDigest);
  if (snapshot.status === "INVALID") {
    return Object.freeze({ status: "INVALID", code: "SNAPSHOT_CODEC_REJECTED", codecCode: snapshot.code });
  }
  if (snapshot.value.envelope.scopeIdentity !== scope.identity) {
    return Object.freeze({ status: "INVALID", code: "SNAPSHOT_SCOPE_MISMATCH" });
  }

  // Both parent APIs supply isolated immutable plain data; no caller-owned
  // objects or mutable bytes are retained or returned by this contract.
  return Object.freeze({
    status: "VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE",
    contractVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_SCOPE_BINDING_VERSION,
    scopeIdentity: scope.identity,
    canonicalScopeMaterial: scope.canonicalMaterial,
    snapshotDigest: snapshot.value.sha256,
    envelope: snapshot.value.envelope,
  });
}
