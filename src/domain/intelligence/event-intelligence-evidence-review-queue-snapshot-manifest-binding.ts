import "server-only";

import {
  verifyEvidenceReviewQueueSnapshotScopeBinding,
  type EvidenceReviewQueueSnapshotScopeBindingResult,
} from "./event-intelligence-evidence-review-queue-snapshot-scope-binding";
import {
  parseEvidenceReviewQueueSnapshotProvenanceManifest,
  type EvidenceReviewQueueSnapshotProvenanceManifest,
} from "./event-intelligence-evidence-review-queue-snapshot-provenance-manifest";

export const EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_BINDING_VERSION =
  "event-intelligence-evidence-review-queue-snapshot-manifest-binding/v1" as const;

type ScopeBindingError = Exclude<
  EvidenceReviewQueueSnapshotScopeBindingResult,
  { status: "VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE" }
>;

export type EvidenceReviewQueueSnapshotManifestBindingResult =
  | Readonly<{
      status: "VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE";
      contractVersion: typeof EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_BINDING_VERSION;
      scopeIdentity: string;
      snapshotDigest: string;
      envelope: Extract<EvidenceReviewQueueSnapshotScopeBindingResult, { status: "VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE" }> ["envelope"];
      manifest: EvidenceReviewQueueSnapshotProvenanceManifest;
    }>
  | Readonly<{ status: "INVALID"; code: "SNAPSHOT_SCOPE_BINDING_REJECTED"; bindingError: ScopeBindingError }>
  | Readonly<{ status: "INVALID"; code: "MANIFEST_SYNTAX_REJECTED"; manifestCode: "MANIFEST_SHAPE_INVALID" | "MANIFEST_LIMIT_EXCEEDED" | "MANIFEST_VERSION_INVALID" | "MANIFEST_IDENTITY_INVALID" | "MANIFEST_PARENT_BINDING_MISMATCH" | "MANIFEST_ORDINAL_INVALID" | "MANIFEST_REFERENCE_INVALID" | "MANIFEST_DUPLICATE_REFERENCE" }>
  | Readonly<{ status: "INVALID"; code: "MANIFEST_SNAPSHOT_DIGEST_MISMATCH" }>
  | Readonly<{ status: "INVALID"; code: "MANIFEST_SNAPSHOT_SCOPE_MISMATCH" }>
  | Readonly<{ status: "INVALID"; code: "CORRECTION_CUTOFF_MISMATCH" }>;

/**
 * Verifies caller-supplied snapshot expectations first, then the untrusted
 * manifest and its declared snapshot/scope/correction-cutoff bindings. The
 * result is local syntax and byte binding only; it grants no domain authority.
 */
export function verifyEvidenceReviewQueueSnapshotManifestBinding(
  snapshotBytes: unknown,
  expectedSnapshotDigest: unknown,
  expectedScopeIdentity: unknown,
  expectedScopeMaterial: unknown,
  manifestInput: unknown,
): EvidenceReviewQueueSnapshotManifestBindingResult {
  const scopeBinding = verifyEvidenceReviewQueueSnapshotScopeBinding(
    snapshotBytes,
    expectedSnapshotDigest,
    expectedScopeIdentity,
    expectedScopeMaterial,
  );
  if (scopeBinding.status !== "VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE") {
    return Object.freeze({ status: "INVALID", code: "SNAPSHOT_SCOPE_BINDING_REJECTED", bindingError: scopeBinding });
  }

  const parsed = parseEvidenceReviewQueueSnapshotProvenanceManifest(manifestInput);
  if (parsed.status !== "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE") {
    return Object.freeze({ status: "INVALID", code: "MANIFEST_SYNTAX_REJECTED", manifestCode: parsed.code });
  }

  if (parsed.manifest.snapshotDigest !== scopeBinding.snapshotDigest) {
    return Object.freeze({ status: "INVALID", code: "MANIFEST_SNAPSHOT_DIGEST_MISMATCH" });
  }
  if (parsed.manifest.scopeIdentity !== scopeBinding.scopeIdentity) {
    return Object.freeze({ status: "INVALID", code: "MANIFEST_SNAPSHOT_SCOPE_MISMATCH" });
  }

  // Both values have already passed the parent contracts' exact canonical
  // UTC-millisecond validation. String equality therefore means exact
  // canonical representation and the same instant, without Date.parse here.
  for (const member of parsed.manifest.members) {
    if (member.reference.family === "CORRECTION_LINEAGE"
      && member.reference.evaluationAsOf !== scopeBinding.envelope.snapshotCutoff) {
      return Object.freeze({ status: "INVALID", code: "CORRECTION_CUTOFF_MISMATCH" });
    }
  }

  return Object.freeze({
    status: "VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE",
    contractVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_BINDING_VERSION,
    scopeIdentity: scopeBinding.scopeIdentity,
    snapshotDigest: scopeBinding.snapshotDigest,
    envelope: scopeBinding.envelope,
    manifest: parsed.manifest,
  });
}
