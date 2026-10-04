import "server-only";

import { createHash } from "node:crypto";
import { types } from "node:util";
import {
  EVIDENCE_QUEUE_PROVENANCE_FAMILIES,
} from "./event-intelligence-evidence-review-queue-snapshot-scope-provenance-decision";
import {
  parseEvidenceReviewQueueSnapshotProvenanceManifest,
  type EvidenceReviewQueueSnapshotProvenanceManifest,
  type EvidenceReviewQueueSnapshotProvenanceManifestErrorCode,
} from "./event-intelligence-evidence-review-queue-snapshot-provenance-manifest";

export const EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_PROFILE =
  "event-intelligence-evidence-review-queue-snapshot-provenance-manifest-canonical-json/v1" as const;

export const EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_LIMITS = Object.freeze({
  maxBytes: 768 * 1024,
});

export type EvidenceReviewQueueSnapshotManifestWireEnvelope = Readonly<{
  manifestCodecProfile: typeof EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_PROFILE;
  manifest: EvidenceReviewQueueSnapshotProvenanceManifest;
}>;

export type EvidenceReviewQueueSnapshotManifestCodecErrorCode =
  | "MANIFEST_INPUT_INVALID"
  | "MANIFEST_LIMIT_EXCEEDED"
  | "CANONICAL_VALUE_UNSUPPORTED"
  | "BYTE_INPUT_INVALID"
  | "BYTE_LIMIT_EXCEEDED"
  | "DIGEST_INVALID"
  | "DIGEST_MISMATCH"
  | "BOM_FORBIDDEN"
  | "UTF8_INVALID"
  | "JSON_INVALID"
  | "WIRE_ENVELOPE_INVALID"
  | "MANIFEST_SYNTAX_REJECTED"
  | "NON_CANONICAL_BYTES";

export type EvidenceReviewQueueSnapshotManifestEncodeResult =
  | Readonly<{
      status: "CANONICALIZED_NON_AUTHORITATIVE";
      profile: typeof EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_PROFILE;
      envelope: EvidenceReviewQueueSnapshotManifestWireEnvelope;
      canonicalBytes: Uint8Array;
      sha256: string;
    }>
  | Readonly<{
      status: "INVALID";
      code: EvidenceReviewQueueSnapshotManifestCodecErrorCode;
      manifestCode?: EvidenceReviewQueueSnapshotProvenanceManifestErrorCode;
    }>;

export type EvidenceReviewQueueSnapshotManifestDecodeResult =
  | Readonly<{
      status: "DECODED_CANONICAL_NON_AUTHORITATIVE";
      profile: typeof EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_PROFILE;
      envelope: EvidenceReviewQueueSnapshotManifestWireEnvelope;
      sha256: string;
    }>
  | Readonly<{
      status: "INVALID";
      code: EvidenceReviewQueueSnapshotManifestCodecErrorCode;
      manifestCode?: EvidenceReviewQueueSnapshotProvenanceManifestErrorCode;
    }>;

const SHA256 = /^[a-f0-9]{64}$/;
const WIRE_KEYS = ["manifestCodecProfile", "manifest"] as const;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const compareCodeUnits = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

const invalid = (
  code: EvidenceReviewQueueSnapshotManifestCodecErrorCode,
  manifestCode?: EvidenceReviewQueueSnapshotProvenanceManifestErrorCode,
) => Object.freeze(manifestCode ? { status: "INVALID" as const, code, manifestCode } : { status: "INVALID" as const, code });

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error("CANONICAL_VALUE_UNSUPPORTED");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(entry => canonicalJson(entry)).join(",")}]`;
  if (typeof value !== "object") throw new Error("CANONICAL_VALUE_UNSUPPORTED");
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort(compareCodeUnits);
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(Object.getOwnPropertyDescriptor(object, key)!.value)}`).join(",")}}`;
}

function familyOrdinal(family: string): number {
  return EVIDENCE_QUEUE_PROVENANCE_FAMILIES.indexOf(family as typeof EVIDENCE_QUEUE_PROVENANCE_FAMILIES[number]);
}

function canonicalizeMembers(manifest: EvidenceReviewQueueSnapshotProvenanceManifest): EvidenceReviewQueueSnapshotProvenanceManifest {
  const sorted = manifest.members.map(member => ({
    snapshotDigest: member.snapshotDigest,
    scopeIdentity: member.scopeIdentity,
    reference: member.reference,
    referenceKey: canonicalJson(member.reference),
  })).sort((left, right) => {
    const familyOrder = familyOrdinal(left.reference.family) - familyOrdinal(right.reference.family);
    return familyOrder || compareCodeUnits(left.referenceKey, right.referenceKey);
  });
  const members = sorted.map((member, ordinal) => Object.freeze({
    snapshotDigest: member.snapshotDigest,
    scopeIdentity: member.scopeIdentity,
    ordinal,
    reference: member.reference,
  }));
  return Object.freeze({
    manifestContractVersion: manifest.manifestContractVersion,
    snapshotFormatVersion: manifest.snapshotFormatVersion,
    snapshotDigest: manifest.snapshotDigest,
    scopeIdentity: manifest.scopeIdentity,
    members: Object.freeze(members),
  });
}

function wireEnvelope(manifest: EvidenceReviewQueueSnapshotProvenanceManifest): EvidenceReviewQueueSnapshotManifestWireEnvelope {
  return Object.freeze({ manifestCodecProfile: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_PROFILE, manifest });
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function serialize(envelope: EvidenceReviewQueueSnapshotManifestWireEnvelope): string {
  return canonicalJson(envelope);
}

function hasExactWireShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== WIRE_KEYS.length || keys.some(key => typeof key !== "string" || !(WIRE_KEYS as readonly string[]).includes(key))) return false;
  return WIRE_KEYS.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !!descriptor && "value" in descriptor && descriptor.enumerable;
  });
}

/** Sorts a validated reference inventory, then emits its canonical v1 bytes. */
export function encodeEvidenceReviewQueueSnapshotManifest(
  input: unknown,
): EvidenceReviewQueueSnapshotManifestEncodeResult {
  const parsed = parseEvidenceReviewQueueSnapshotProvenanceManifest(input);
  if (parsed.status !== "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE") {
    return invalid("MANIFEST_INPUT_INVALID", parsed.code);
  }

  let text: string;
  let bytes: Uint8Array;
  let manifest: EvidenceReviewQueueSnapshotProvenanceManifest;
  try {
    manifest = canonicalizeMembers(parsed.manifest);
    text = serialize(wireEnvelope(manifest));
    // All accepted family values are ASCII under the reused parent parser, so
    // UTF-16 code-unit length is also a safe pre-allocation upper bound here.
    if (text.length > EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_LIMITS.maxBytes) return invalid("BYTE_LIMIT_EXCEEDED");
    bytes = encoder.encode(text);
  } catch {
    return invalid("CANONICAL_VALUE_UNSUPPORTED");
  }
  if (bytes.byteLength > EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_LIMITS.maxBytes) return invalid("BYTE_LIMIT_EXCEEDED");

  const envelope = wireEnvelope(manifest);
  return Object.freeze({
    status: "CANONICALIZED_NON_AUTHORITATIVE",
    profile: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_PROFILE,
    envelope,
    canonicalBytes: new Uint8Array(bytes),
    sha256: digest(bytes),
  });
}

/** Decodes only exact canonical wire bytes; it never normalizes and accepts. */
export function decodeEvidenceReviewQueueSnapshotManifest(
  input: unknown,
  expectedSha256: unknown,
): EvidenceReviewQueueSnapshotManifestDecodeResult {
  if (!input || typeof input !== "object" || types.isProxy(input) || !(input instanceof Uint8Array)) return invalid("BYTE_INPUT_INVALID");

  let byteLength: number;
  let byteOffset: number;
  let backingBuffer: ArrayBufferLike;
  try {
    const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
    byteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")!.get!.call(input) as number;
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) return invalid("BYTE_INPUT_INVALID");
    if (byteLength > EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_LIMITS.maxBytes) return invalid("BYTE_LIMIT_EXCEEDED");
    backingBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")!.get!.call(input) as ArrayBufferLike;
    if (types.isSharedArrayBuffer(backingBuffer)) return invalid("BYTE_INPUT_INVALID");
    byteOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteOffset")!.get!.call(input) as number;
  } catch {
    return invalid("BYTE_INPUT_INVALID");
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(backingBuffer, byteOffset, byteLength).slice();
  } catch {
    return invalid("BYTE_INPUT_INVALID");
  }
  if (typeof expectedSha256 !== "string" || expectedSha256.length !== 64 || !SHA256.test(expectedSha256)) return invalid("DIGEST_INVALID");
  const actualSha256 = digest(bytes);
  if (actualSha256 !== expectedSha256) return invalid("DIGEST_MISMATCH");
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return invalid("BOM_FORBIDDEN");

  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    return invalid("UTF8_INVALID");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return invalid("JSON_INVALID");
  }
  if (!hasExactWireShape(parsed) || parsed.manifestCodecProfile !== EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_PROFILE) {
    return invalid("WIRE_ENVELOPE_INVALID");
  }

  const manifestResult = parseEvidenceReviewQueueSnapshotProvenanceManifest(parsed.manifest);
  if (manifestResult.status !== "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE") {
    return invalid("MANIFEST_SYNTAX_REJECTED", manifestResult.code);
  }

  let canonicalBytes: Uint8Array;
  let envelope: EvidenceReviewQueueSnapshotManifestWireEnvelope;
  try {
    const canonicalManifest = canonicalizeMembers(manifestResult.manifest);
    envelope = wireEnvelope(canonicalManifest);
    const canonicalText = serialize(envelope);
    if (canonicalText.length > EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_LIMITS.maxBytes) return invalid("BYTE_LIMIT_EXCEEDED");
    canonicalBytes = encoder.encode(canonicalText);
  } catch {
    return invalid("CANONICAL_VALUE_UNSUPPORTED");
  }
  if (canonicalBytes.byteLength > EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_LIMITS.maxBytes) return invalid("BYTE_LIMIT_EXCEEDED");
  if (canonicalBytes.byteLength !== bytes.byteLength || canonicalBytes.some((value, index) => value !== bytes[index])) {
    return invalid("NON_CANONICAL_BYTES");
  }

  return Object.freeze({
    status: "DECODED_CANONICAL_NON_AUTHORITATIVE",
    profile: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_PROFILE,
    envelope,
    sha256: actualSha256,
  });
}
