import "server-only";
import { createHash } from "node:crypto";
import { types } from "node:util";
import {
  EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION,
  isSerializableEvidenceReviewQueueViewModel,
  type EvidenceReviewQueueViewModel,
} from "./event-intelligence-evidence-review-queue-view-model";

export const EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION = "event-intelligence-evidence-review-queue-snapshot/v1" as const;
export const EVIDENCE_REVIEW_QUEUE_SNAPSHOT_CODEC_LIMITS = Object.freeze({
  maxBytes: 1_048_576,
  maxItems: 512,
  maxArrayLength: 512,
  maxStringLength: 256,
  maxDepth: 16,
});

export type EvidenceReviewQueueSnapshotEnvelope = Readonly<{
  formatVersion: typeof EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION;
  viewModelVersion: typeof EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION;
  scopeIdentity: string;
  snapshotCutoff: string;
  payload: EvidenceReviewQueueViewModel;
}>;
export type SnapshotCodecErrorCode =
  | "ENVELOPE_INVALID"
  | "PAYLOAD_INVALID"
  | "CUTOFF_MISMATCH"
  | "SCOPE_IDENTITY_INVALID"
  | "STRUCTURE_LIMIT_EXCEEDED"
  | "CANONICAL_VALUE_UNSUPPORTED"
  | "BYTE_INPUT_INVALID"
  | "BYTE_LIMIT_EXCEEDED"
  | "DIGEST_INVALID"
  | "DIGEST_MISMATCH"
  | "UTF8_INVALID"
  | "BOM_FORBIDDEN"
  | "JSON_INVALID"
  | "NON_CANONICAL_BYTES";
export type SnapshotCodecResult<T> = Readonly<{ status: "VALID"; value: T }> | Readonly<{ status: "INVALID"; code: SnapshotCodecErrorCode }>;
export type EncodedSnapshot = Readonly<{ envelope: EvidenceReviewQueueSnapshotEnvelope; canonicalBytes: Uint8Array; sha256: string }>;
export type DecodedSnapshot = Readonly<{ envelope: EvidenceReviewQueueSnapshotEnvelope; sha256: string; status: "SYNTACTICALLY_VALID_NON_AUTHORITATIVE" }>;

const INVALID = (code: SnapshotCodecErrorCode) => Object.freeze({ status: "INVALID" as const, code });
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const SCOPE = /^eviqs1_[a-f0-9]{64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ENVELOPE_KEYS = Object.freeze(["formatVersion", "viewModelVersion", "scopeIdentity", "snapshotCutoff", "payload"]);
const encoder = new TextEncoder();

function validCanonicalString(value: string): SnapshotCodecErrorCode | null {
  if (value.length > EVIDENCE_REVIEW_QUEUE_SNAPSHOT_CODEC_LIMITS.maxStringLength) return "STRUCTURE_LIMIT_EXCEEDED";
  if (/\p{Cc}|\p{Cf}/u.test(value)) return "CANONICAL_VALUE_UNSUPPORTED";
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return "CANONICAL_VALUE_UNSUPPORTED";
      i++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return "CANONICAL_VALUE_UNSUPPORTED";
  }
  return null;
}

function exactUtc(input: unknown): input is string {
  return typeof input === "string" && UTC.test(input) && Number.isFinite(Date.parse(input)) && new Date(input).toISOString() === input;
}
function exactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length && keys.every(key => typeof key === "string" && expected.includes(key));
}
function descriptorValue(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor && descriptor.enumerable ? descriptor.value : INVALID("ENVELOPE_INVALID");
}
function safeDataTree(input: unknown): SnapshotCodecErrorCode | null {
  const seen = new WeakSet<object>();
  let nodes = 0;
  const visit = (value: unknown, depth: number): SnapshotCodecErrorCode | null => {
    if (++nodes > 20_000 || depth > EVIDENCE_REVIEW_QUEUE_SNAPSHOT_CODEC_LIMITS.maxDepth) return "STRUCTURE_LIMIT_EXCEEDED";
    if (value === null || typeof value === "boolean") return null;
    if (typeof value === "string") return validCanonicalString(value);
    if (typeof value === "number") return Number.isSafeInteger(value) && !Object.is(value, -0) ? null : "CANONICAL_VALUE_UNSUPPORTED";
    if (typeof value !== "object" || types.isProxy(value) || seen.has(value)) return "CANONICAL_VALUE_UNSUPPORTED";
    seen.add(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return "CANONICAL_VALUE_UNSUPPORTED";
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
      const length = lengthDescriptor?.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > EVIDENCE_REVIEW_QUEUE_SNAPSHOT_CODEC_LIMITS.maxArrayLength || Reflect.ownKeys(value).length !== length + 1) return "STRUCTURE_LIMIT_EXCEEDED";
      for (let i = 0; i < length; i++) {
        const d = Object.getOwnPropertyDescriptor(value, String(i));
        if (!d || !("value" in d) || !d.enumerable) return "CANONICAL_VALUE_UNSUPPORTED";
        const error = visit(d.value, depth + 1);
        if (error) return error;
      }
      return null;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) return "CANONICAL_VALUE_UNSUPPORTED";
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return "CANONICAL_VALUE_UNSUPPORTED";
      const keyError = validCanonicalString(key);
      if (keyError) return keyError;
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (!d || !("value" in d) || !d.enumerable) return "CANONICAL_VALUE_UNSUPPORTED";
      const error = visit(d.value, depth + 1);
      if (error) return error;
    }
    return null;
  };
  return visit(input, 0);
}
function cloneData<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(entry => cloneData(entry))) as T;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    output[key] = cloneData(Object.getOwnPropertyDescriptor(value, key)!.value);
  }
  return Object.freeze(output) as T;
}
function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort((a, b) => a < b ? -1 : a > b ? 1 : 0).map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}
function validateEnvelope(input: unknown): SnapshotCodecResult<EvidenceReviewQueueSnapshotEnvelope> {
  const shapeError = safeDataTree(input);
  if (shapeError) return INVALID(shapeError);
  if (!input || typeof input !== "object" || Array.isArray(input) || !exactKeys(input, ENVELOPE_KEYS)) return INVALID("ENVELOPE_INVALID");
  const formatVersion = descriptorValue(input, "formatVersion");
  const viewModelVersion = descriptorValue(input, "viewModelVersion");
  const scopeIdentity = descriptorValue(input, "scopeIdentity");
  const snapshotCutoff = descriptorValue(input, "snapshotCutoff");
  const payload = descriptorValue(input, "payload");
  if (formatVersion !== EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION || viewModelVersion !== EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION) return INVALID("ENVELOPE_INVALID");
  if (typeof scopeIdentity !== "string" || !SCOPE.test(scopeIdentity)) return INVALID("SCOPE_IDENTITY_INVALID");
  if (!exactUtc(snapshotCutoff)) return INVALID("ENVELOPE_INVALID");
  if (!isSerializableEvidenceReviewQueueViewModel(payload)) return INVALID("PAYLOAD_INVALID");
  const model = payload as EvidenceReviewQueueViewModel;
  if (model.generatedForAsOf !== null && model.generatedForAsOf !== snapshotCutoff) return INVALID("CUTOFF_MISMATCH");
  if (model.items.some(item => item.evaluatedAsOf !== snapshotCutoff)) return INVALID("CUTOFF_MISMATCH");
  const envelope = cloneData({ formatVersion, viewModelVersion, scopeIdentity, snapshotCutoff, payload: model }) as EvidenceReviewQueueSnapshotEnvelope;
  return Object.freeze({ status: "VALID" as const, value: envelope });
}
function digest(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }

export function encodeEvidenceReviewQueueSnapshot(input: unknown): SnapshotCodecResult<EncodedSnapshot> {
  const validated = validateEnvelope(input);
  if (validated.status !== "VALID") return validated;
  const unsupported = safeDataTree(validated.value);
  if (unsupported) return INVALID(unsupported);
  let text: string;
  try { text = canonicalJson(validated.value); } catch { return INVALID("CANONICAL_VALUE_UNSUPPORTED"); }
  const bytes = encoder.encode(text);
  if (bytes.byteLength > EVIDENCE_REVIEW_QUEUE_SNAPSHOT_CODEC_LIMITS.maxBytes) return INVALID("BYTE_LIMIT_EXCEEDED");
  return Object.freeze({ status: "VALID" as const, value: Object.freeze({ envelope: validated.value, canonicalBytes: new Uint8Array(bytes), sha256: digest(bytes) }) });
}

export function decodeEvidenceReviewQueueSnapshot(input: unknown, expectedSha256: unknown): SnapshotCodecResult<DecodedSnapshot> {
  if (!input || typeof input !== "object" || types.isProxy(input) || !(input instanceof Uint8Array)) return INVALID("BYTE_INPUT_INVALID");
  let byteLength: number;
  try { byteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), "byteLength")!.get!.call(input) as number; } catch { return INVALID("BYTE_INPUT_INVALID"); }
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) return INVALID("BYTE_INPUT_INVALID");
  if (byteLength > EVIDENCE_REVIEW_QUEUE_SNAPSHOT_CODEC_LIMITS.maxBytes) return INVALID("BYTE_LIMIT_EXCEEDED");
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(input as Uint8Array); } catch { return INVALID("BYTE_INPUT_INVALID"); }
  if (typeof expectedSha256 !== "string" || !SHA256.test(expectedSha256)) return INVALID("DIGEST_INVALID");
  const actualDigest = digest(bytes);
  if (actualDigest !== expectedSha256) return INVALID("DIGEST_MISMATCH");
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return INVALID("BOM_FORBIDDEN");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return INVALID("UTF8_INVALID"); }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return INVALID("JSON_INVALID"); }
  const validated = validateEnvelope(parsed);
  if (validated.status !== "VALID") return validated;
  const shapeError = safeDataTree(validated.value);
  if (shapeError) return INVALID(shapeError);
  const canonicalBytes = encoder.encode(canonicalJson(validated.value));
  if (canonicalBytes.byteLength > EVIDENCE_REVIEW_QUEUE_SNAPSHOT_CODEC_LIMITS.maxBytes) return INVALID("BYTE_LIMIT_EXCEEDED");
  if (canonicalBytes.byteLength !== bytes.byteLength || canonicalBytes.some((value, index) => value !== bytes[index])) return INVALID("NON_CANONICAL_BYTES");
  return Object.freeze({ status: "VALID" as const, value: Object.freeze({ envelope: validated.value, sha256: actualDigest, status: "SYNTACTICALLY_VALID_NON_AUTHORITATIVE" as const }) });
}
