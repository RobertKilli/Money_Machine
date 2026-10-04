import "server-only";

import { types } from "node:util";
import {
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
} from "./event-intelligence-evidence-review-queue-snapshot-codec";
import {
  parseEvidenceQueueProvenanceReference,
} from "./event-intelligence-evidence-review-queue-snapshot-scope-provenance-decision";

export const EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_VERSION =
  "event-intelligence-evidence-review-queue-snapshot-provenance-manifest/v1" as const;

export const EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_LIMITS = Object.freeze({
  maxMembers: 128,
  maxArrayLength: 128,
  maxStringCodeUnits: 2_048,
  maxObjectProperties: 16,
  maxDepth: 8,
  maxNodes: 10_000,
});

type SecDocumentReference =
  | Readonly<{ targetKind: "PROFILE"; key: Readonly<{ profile_id: string; fingerprint: string }> }>
  | Readonly<{ targetKind: "FILING_IDENTITY"; key: Readonly<{ filing_identity_id: string; profile_id: string; profile_fingerprint: string; cik: string; accession_number: string; form: "8-K" | "8-K/A" }> }>
  | Readonly<{ targetKind: "DOCUMENT_ARTIFACT"; key: Readonly<{ artifact_id: string; fingerprint: string }> }>
  | Readonly<{ targetKind: "FILING_PACKAGE"; key: Readonly<{ package_id: string; fingerprint: string; filing_identity_id: string }> }>
  | Readonly<{ targetKind: "PACKAGE_MEMBER"; key: Readonly<{ package_id: string; package_fingerprint: string; member_ordinal: number }> }>
  | Readonly<{ targetKind: "ACQUISITION_RECEIPT"; key: Readonly<{ receipt_id: string; package_id: string; package_fingerprint: string }> }>
  | Readonly<{ targetKind: "SOURCE_LINEAGE"; key: Readonly<{ lineage_id: string; fingerprint: string }> }>
  | Readonly<{ targetKind: "LINEAGE_MEMBER"; key: Readonly<{ lineage_id: string; member_ordinal: number }> }>;

/** Compile-time view of the exact family shapes checked by the existing parser. */
export type EvidenceReviewQueueSnapshotProvenanceReference =
  | (Readonly<{ family: "SEC_EVENT_DOCUMENT"; schemaVersion: "sec-event-document-reference/v1" }> & SecDocumentReference)
  | Readonly<{ family: "ISSUER_EVIDENCE"; schemaVersion: "issuer-evidence-reference/v1"; issuerEvidenceContractVersion: "event-intelligence-issuer-evidence/v1"; evidenceMaterialIdentity: string; sourceOriginBinding: string }>
  | Readonly<{ family: "ASSET_MAPPING_REVISION"; schemaVersion: "m5-asset-mapping-reference/v1"; mapping_revision_id: string; source_lineage_id: string; provider_id: string; dataset_id: string; dataset_version: string; canonical_asset_id: string; canonical_identifier: string; asset_class: string }>
  | Readonly<{ family: "DISCOVERY_SOURCE_RECORD"; schemaVersion: "discovery-source-record-reference/v1"; sourceType: "NEWSAPI" | "GDELT" | "ISSUER_IR" | "ISSUER_WIRE" | "EXCHANGE_DISCLOSURE"; localCandidateIdentity: string; materialVariantIdentity: string; receiptIdentity: string }>
  | Readonly<{ family: "CORRECTION_LINEAGE"; schemaVersion: "correction-lineage-reference/v1"; lineageContractVersion: "event-intelligence-correction-lineage/v1"; rootClaimIdentity: string; orderedMemberIdentities: readonly string[]; selectedTerminalIdentity: string; evaluationAsOf: string }>
  | Readonly<{ family: "DERIVED_COMPOSITION"; schemaVersion: "derived-composition-reference/v1"; compositionContractVersion: "event-intelligence-evidence-review-queue-composition/v1"; compositionMaterialIdentity: string }>
  | Readonly<{ family: "DERIVED_QUEUE_SET"; schemaVersion: "derived-queue-set-reference/v1"; queueContractVersion: "event-intelligence-evidence-review-queue-contract/v1"; queueSetMaterialIdentity: string; sealedMemberSetIdentity: string }>
  | Readonly<{ family: "DERIVED_VIEW_MODEL"; schemaVersion: "derived-view-model-reference/v1"; viewModelContractVersion: "event-intelligence-evidence-review-queue-view-model/v1"; safePayloadDigest: string; payloadLength: number }>;

export type EvidenceReviewQueueSnapshotProvenanceManifestMember = Readonly<{
  snapshotDigest: string;
  scopeIdentity: string;
  ordinal: number;
  reference: EvidenceReviewQueueSnapshotProvenanceReference;
}>;

export type EvidenceReviewQueueSnapshotProvenanceManifest = Readonly<{
  manifestContractVersion: typeof EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_VERSION;
  snapshotFormatVersion: typeof EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION;
  snapshotDigest: string;
  scopeIdentity: string;
  members: readonly EvidenceReviewQueueSnapshotProvenanceManifestMember[];
}>;

export type EvidenceReviewQueueSnapshotProvenanceManifestErrorCode =
  | "MANIFEST_SHAPE_INVALID"
  | "MANIFEST_LIMIT_EXCEEDED"
  | "MANIFEST_VERSION_INVALID"
  | "MANIFEST_IDENTITY_INVALID"
  | "MANIFEST_PARENT_BINDING_MISMATCH"
  | "MANIFEST_ORDINAL_INVALID"
  | "MANIFEST_REFERENCE_INVALID"
  | "MANIFEST_DUPLICATE_REFERENCE";

export type EvidenceReviewQueueSnapshotProvenanceManifestParse =
  | Readonly<{
      status: "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE";
      manifest: EvidenceReviewQueueSnapshotProvenanceManifest;
    }>
  | Readonly<{
      status: "INVALID";
      code: EvidenceReviewQueueSnapshotProvenanceManifestErrorCode;
    }>;

const INVALID = (code: EvidenceReviewQueueSnapshotProvenanceManifestErrorCode) =>
  Object.freeze({ status: "INVALID" as const, code });
const ROOT_KEYS = [
  "manifestContractVersion",
  "snapshotFormatVersion",
  "snapshotDigest",
  "scopeIdentity",
  "members",
] as const;
const MEMBER_KEYS = ["snapshotDigest", "scopeIdentity", "ordinal", "reference"] as const;
const SHA256 = /^[a-f0-9]{64}$/;
const SCOPE_IDENTITY = /^eviqs1_[a-f0-9]{64}$/;

type WalkState = { nodes: number };

/** Checks the complete input graph using descriptors only; aliases count per occurrence. */
function inspectInput(
  value: unknown,
  state: WalkState,
  ancestors: WeakSet<object>,
  depth = 0,
): EvidenceReviewQueueSnapshotProvenanceManifestErrorCode | null {
  state.nodes++;
  if (state.nodes > EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_LIMITS.maxNodes || depth > EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_LIMITS.maxDepth) {
    return "MANIFEST_LIMIT_EXCEEDED";
  }

  if (value === null || typeof value === "boolean") return null;
  if (typeof value === "string") {
    return value.length <= EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_LIMITS.maxStringCodeUnits
      ? null
      : "MANIFEST_LIMIT_EXCEEDED";
  }
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && !Object.is(value, -0)
      ? null
      : "MANIFEST_SHAPE_INVALID";
  }
  if (typeof value !== "object" || types.isProxy(value)) return "MANIFEST_SHAPE_INVALID";
  if (ancestors.has(value)) return "MANIFEST_SHAPE_INVALID";
  ancestors.add(value);

  let error: EvidenceReviewQueueSnapshotProvenanceManifestErrorCode | null = null;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) error = "MANIFEST_SHAPE_INVALID";
    else {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
      const length = lengthDescriptor?.value;
      if (!lengthDescriptor || !("value" in lengthDescriptor) || !Number.isSafeInteger(length) || length < 0) error = "MANIFEST_SHAPE_INVALID";
      else if (length > EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_LIMITS.maxArrayLength) error = "MANIFEST_LIMIT_EXCEEDED";
      else if (Reflect.ownKeys(value).length !== length + 1) error = "MANIFEST_SHAPE_INVALID";
      else {
        for (let index = 0; index < length && !error; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
          if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) error = "MANIFEST_SHAPE_INVALID";
          else error = inspectInput(descriptor.value, state, ancestors, depth + 1);
        }
      }
    }
  } else if (Object.getPrototypeOf(value) !== Object.prototype) error = "MANIFEST_SHAPE_INVALID";
  else {
    const keys = Reflect.ownKeys(value);
    if (keys.length > EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_LIMITS.maxObjectProperties) error = "MANIFEST_LIMIT_EXCEEDED";
    else {
      for (const key of keys) {
        if (typeof key !== "string") {
          error = "MANIFEST_SHAPE_INVALID";
          break;
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          error = "MANIFEST_SHAPE_INVALID";
          break;
        }
        error = inspectInput(descriptor.value, state, ancestors, depth + 1);
        if (error) break;
      }
    }
  }

  ancestors.delete(value);
  return error;
}

function hasExactDataShape(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key))) return false;
  return keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !!descriptor && "value" in descriptor && descriptor.enumerable;
  });
}

/** Compares already validated JSON data independent of object insertion order. */
function sameReference(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((entry, index) => sameReference(entry, right[index]));
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length || leftKeys.some(key => !Object.hasOwn(right, key))) return false;
  return leftKeys.every(key => sameReference(
    Object.getOwnPropertyDescriptor(left, key)!.value,
    Object.getOwnPropertyDescriptor(right, key)!.value,
  ));
}

/** Validates a closed snapshot-level reference inventory without authenticating it. */
export function parseEvidenceReviewQueueSnapshotProvenanceManifest(
  input: unknown,
): EvidenceReviewQueueSnapshotProvenanceManifestParse {
  const inputError = inspectInput(input, { nodes: 0 }, new WeakSet());
  if (inputError) return INVALID(inputError);
  if (!hasExactDataShape(input, ROOT_KEYS)) return INVALID("MANIFEST_SHAPE_INVALID");

  if (input.manifestContractVersion !== EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_VERSION
    || input.snapshotFormatVersion !== EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION) {
    return INVALID("MANIFEST_VERSION_INVALID");
  }
  if (typeof input.snapshotDigest !== "string" || !SHA256.test(input.snapshotDigest)
    || typeof input.scopeIdentity !== "string" || !SCOPE_IDENTITY.test(input.scopeIdentity)) {
    return INVALID("MANIFEST_IDENTITY_INVALID");
  }
  if (!Array.isArray(input.members) || input.members.length > EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_LIMITS.maxMembers) {
    return INVALID("MANIFEST_LIMIT_EXCEEDED");
  }

  const parsedMembers: EvidenceReviewQueueSnapshotProvenanceManifestMember[] = [];
  const priorReferences: EvidenceReviewQueueSnapshotProvenanceReference[] = [];
  for (let index = 0; index < input.members.length; index++) {
    const member = input.members[index];
    if (!hasExactDataShape(member, MEMBER_KEYS)) return INVALID("MANIFEST_SHAPE_INVALID");
    if (!Number.isSafeInteger(member.ordinal) || Object.is(member.ordinal, -0) || member.ordinal !== index) {
      return INVALID("MANIFEST_ORDINAL_INVALID");
    }
    if (typeof member.snapshotDigest !== "string" || !SHA256.test(member.snapshotDigest)
      || typeof member.scopeIdentity !== "string" || !SCOPE_IDENTITY.test(member.scopeIdentity)) {
      return INVALID("MANIFEST_IDENTITY_INVALID");
    }
    if (member.snapshotDigest !== input.snapshotDigest || member.scopeIdentity !== input.scopeIdentity) {
      return INVALID("MANIFEST_PARENT_BINDING_MISMATCH");
    }

    const parsedReference = parseEvidenceQueueProvenanceReference(member.reference);
    if (parsedReference.status !== "VALID_SYNTAX_ONLY") return INVALID("MANIFEST_REFERENCE_INVALID");
    if (priorReferences.some(prior => sameReference(prior, parsedReference.reference))) {
      return INVALID("MANIFEST_DUPLICATE_REFERENCE");
    }
    // The existing closed family parser has validated this exact discriminant
    // and family-specific shape before the type is narrowed here.
    const reference = parsedReference.reference as unknown as EvidenceReviewQueueSnapshotProvenanceReference;
    priorReferences.push(reference);
    parsedMembers.push(Object.freeze({
      snapshotDigest: input.snapshotDigest,
      scopeIdentity: input.scopeIdentity,
      ordinal: index,
      reference,
    }));
  }

  const manifest: EvidenceReviewQueueSnapshotProvenanceManifest = Object.freeze({
    manifestContractVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_VERSION,
    snapshotFormatVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
    snapshotDigest: input.snapshotDigest,
    scopeIdentity: input.scopeIdentity,
    members: Object.freeze(parsedMembers),
  });
  return Object.freeze({ status: "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE", manifest });
}
