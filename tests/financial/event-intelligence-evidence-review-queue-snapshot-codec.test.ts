import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getSourcePortfolioDecision, evaluateSourcePortfolioRouting } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { getEvidenceReviewQueueContract, sealEvidenceReviewQueueSet } from "@/domain/intelligence/event-intelligence-evidence-review-queue";
import { adaptEvidenceReviewQueueSetToViewModel, createBlockedEvidenceReviewQueueViewModel } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";
import {
  decodeEvidenceReviewQueueSnapshot,
  encodeEvidenceReviewQueueSnapshot,
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_CODEC_LIMITS,
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-codec";

const cutoff = "2026-10-03T00:00:00.000Z";
const scopeIdentity = `eviqs1_${"a".repeat(64)}`;
const envelope = (payload: unknown = createBlockedEvidenceReviewQueueViewModel(), patch: Record<string, unknown> = {}) => ({ formatVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION, viewModelVersion: "event-intelligence-evidence-review-queue-view-model/v1", scopeIdentity, snapshotCutoff: cutoff, payload, ...patch });
const encode = (value: unknown) => encodeEvidenceReviewQueueSnapshot(value);
const rehash = (text: string) => createHash("sha256").update(new TextEncoder().encode(text)).digest("hex");
const rehashBytes = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function nonEmptyPayload(count = 1) {
  const decision = getSourcePortfolioDecision();
  const routings = Array.from({ length: count }, (_, index) => evaluateSourcePortfolioRouting(decision, { provenance: "SYNTHETIC", candidateId: `candidate:codec-${String(index).padStart(3, "0")}`, jurisdiction: "US_SEC", listingScopes: ["listing:us-sec"], eventHint: "PURCHASE_INTENT", seenFamilies: ["DISCOVERY_AGGREGATOR"], availableFamilies: ["FILING_AUTHORITY"], issuerMapped: false, assetMapped: true, duplicate: false, rightsApproved: true, credentialAvailable: true, completionMaterialPresent: false, primaryAvailable: true, qualificationComplete: true, correctionPresent: false, correctionResolved: true, correctionFieldHints: [], retracted: false, conflicts: [], stale: false, originBindings: [], publicationAt: "2026-10-01T00:00:00.000Z", discoveredAt: "2026-10-01T00:01:00.000Z", receivedAt: "2026-10-01T00:02:00.000Z", correctionAvailableAt: null, evaluationAsOf: cutoff }));
  if (routings.some(routing => !routing)) throw new Error("SYNTHETIC_TEST_SETUP_FAILED");
  const sealed = sealEvidenceReviewQueueSet(decision, routings);
  if (sealed.status !== "SEALED") throw new Error("SYNTHETIC_TEST_SETUP_FAILED");
  const projected = adaptEvidenceReviewQueueSetToViewModel(getEvidenceReviewQueueContract(), sealed.queueSet);
  if (projected.status !== "PROJECTED") throw new Error("SYNTHETIC_TEST_SETUP_FAILED");
  return projected.model;
}
describe("evidence review queue snapshot codec", () => {
  it("encodes blocked and synthetic non-empty view models, roundtrips and isolates input", () => {
    const blocked = envelope();
    const encodedBlocked = encode(blocked);
    expect(encodedBlocked.status).toBe("VALID");
    if (encodedBlocked.status !== "VALID") return;
    expect(encodedBlocked.value.sha256).toMatch(/^[a-f0-9]{64}$/);
    const decoded = decodeEvidenceReviewQueueSnapshot(encodedBlocked.value.canonicalBytes, encodedBlocked.value.sha256);
    expect(decoded.status).toBe("VALID");
    if (decoded.status === "VALID") expect(decoded.value.envelope.payload).toEqual(blocked.payload);
    const mutable = { ...envelope(), scopeIdentity };
    const isolated = encode(mutable);
    expect(isolated.status).toBe("VALID");
    if (isolated.status === "VALID") {
      mutable.scopeIdentity = `eviqs1_${"b".repeat(64)}`;
      expect(isolated.value.envelope.scopeIdentity).toBe(scopeIdentity);
      const bytes = new Uint8Array(isolated.value.canonicalBytes);
      const read = decodeEvidenceReviewQueueSnapshot(bytes, isolated.value.sha256);
      bytes.fill(0);
      if (read.status === "VALID") expect(read.value.envelope.scopeIdentity).toBe(scopeIdentity);
    }

    const payload = nonEmptyPayload();
    const source = envelope(payload);
    const encoded = encode(source);
    expect(encoded.status).toBe("VALID");
    if (encoded.status !== "VALID") return;
    expect(payload.items).toHaveLength(1);
    const result = decodeEvidenceReviewQueueSnapshot(encoded.value.canonicalBytes, encoded.value.sha256);
    expect(result.status).toBe("VALID");
    if (result.status === "VALID") {
      expect(result.value.envelope.payload.items[0]?.reviewType).toBe("ISSUER_MAPPING_REVIEW");
      expect(Object.isFrozen(result.value.envelope.payload.items[0])).toBe(true);
    }
  });

  it("canonicalizes insertion order while preserving all array order", () => {
    const first = { ...envelope(), payload: createBlockedEvidenceReviewQueueViewModel() };
    const second = Object.fromEntries(Object.entries(first).reverse());
    const a = encode(first); const b = encode(second);
    expect(a.status).toBe("VALID"); expect(b.status).toBe("VALID");
    if (a.status === "VALID" && b.status === "VALID") {
      expect([...a.value.canonicalBytes]).toEqual([...b.value.canonicalBytes]);
      expect(a.value.sha256).toBe(b.value.sha256);
    }
    const payload = nonEmptyPayload(2);
    const reordered = { ...payload, items: [...payload.items].reverse() };
    const orderedEncoding = encode(envelope(payload)); const reversedEncoding = encode(envelope(reordered));
    expect(orderedEncoding.status).toBe("VALID"); expect(reversedEncoding.status).toBe("VALID");
    if (orderedEncoding.status === "VALID" && reversedEncoding.status === "VALID") expect([...orderedEncoding.value.canonicalBytes]).not.toEqual([...reversedEncoding.value.canonicalBytes]);
  });

  it("rejects invalid envelope, payload, cutoff and unknown nested material", () => {
    const good = createBlockedEvidenceReviewQueueViewModel();
    expect(encode(envelope(good, { unexpected: true })).status).toBe("INVALID");
    expect(encode(envelope(good, { formatVersion: "v9" })).status).toBe("INVALID");
    expect(encode(envelope(good, { viewModelVersion: "unknown" })).status).toBe("INVALID");
    expect(encode(envelope(good, { scopeIdentity: "scope:unversioned" })).status).toBe("INVALID");
    expect(encode(envelope(good, { snapshotCutoff: "2026-02-30T00:00:00.000Z" })).status).toBe("INVALID");
    expect(encode(envelope(good, { snapshotCutoff: "2026-10-03T00:00:00Z" })).status).toBe("INVALID");
    expect(encode(envelope(nonEmptyPayload(), { snapshotCutoff: "2026-10-04T00:00:00.000Z" }))).toMatchObject({ status: "INVALID", code: "CUTOFF_MISMATCH" });
    expect(encode(envelope({ ...good, state: "VERIFIED" } as unknown)).status).toBe("INVALID");
    expect(encode(envelope({ ...good, extra: "no" } as unknown)).status).toBe("INVALID");
  });

  it("rejects accessors without invocation and unsupported object graphs", () => {
    let getterCalled = false;
    const getterInput = envelope();
    Object.defineProperty(getterInput, "scopeIdentity", { enumerable: true, get() { getterCalled = true; return scopeIdentity; } });
    expect(encode(getterInput)).toMatchObject({ status: "INVALID" }); expect(getterCalled).toBe(false);
    const sparse = { ...envelope(), payload: { ...createBlockedEvidenceReviewQueueViewModel(), items: Array(1) } };
    expect(encode(sparse).status).toBe("INVALID");
    const cycle: Record<string, unknown> = { ...envelope() }; cycle.self = cycle;
    expect(encode(cycle).status).toBe("INVALID");
    expect(encode(envelope({ ...createBlockedEvidenceReviewQueueViewModel(), extra: 1n } as unknown)).status).toBe("INVALID");
    expect(encode(envelope({ ...createBlockedEvidenceReviewQueueViewModel(), extra: Symbol("x") } as unknown)).status).toBe("INVALID");
    expect(encode(envelope({ ...createBlockedEvidenceReviewQueueViewModel(), extra: () => "hook" } as unknown)).status).toBe("INVALID");
    const nonPlain = Object.assign(Object.create({ inherited: true }), createBlockedEvidenceReviewQueueViewModel());
    expect(encode(envelope(nonPlain)).status).toBe("INVALID");
    const nonEnumerable = { ...createBlockedEvidenceReviewQueueViewModel() } as Record<string, unknown>;
    Object.defineProperty(nonEnumerable, "hidden", { value: "x", enumerable: false });
    expect(encode(envelope(nonEnumerable)).status).toBe("INVALID");
    expect(encode(envelope({ ...createBlockedEvidenceReviewQueueViewModel(), summary: { ...createBlockedEvidenceReviewQueueViewModel().summary, totalItems: Infinity } })).status).toBe("INVALID");
    expect(encode(envelope({ ...createBlockedEvidenceReviewQueueViewModel(), summary: { ...createBlockedEvidenceReviewQueueViewModel().summary, totalItems: Number.NaN } })).status).toBe("INVALID");
    expect(encode(envelope({ ...createBlockedEvidenceReviewQueueViewModel(), summary: { ...createBlockedEvidenceReviewQueueViewModel().summary, totalItems: -0 } })).status).toBe("INVALID");
    expect(encode(envelope({ ...createBlockedEvidenceReviewQueueViewModel(), emptyState: "\ud800" })).status).toBe("INVALID");
    expect(encode(new Proxy({}, { get() { throw new Error("must not run"); } })).status).toBe("INVALID");
  });

  it("enforces structural and byte bounds without truncation", () => {
    expect(EVIDENCE_REVIEW_QUEUE_SNAPSHOT_CODEC_LIMITS.maxBytes).toBe(1_048_576);
    const oversizeString = "x".repeat(257);
    expect(encode(envelope({ ...createBlockedEvidenceReviewQueueViewModel(), emptyState: oversizeString })).status).toBe("INVALID");
    const exactSizedBytes = new Uint8Array(EVIDENCE_REVIEW_QUEUE_SNAPSHOT_CODEC_LIMITS.maxBytes + 1);
    expect(decodeEvidenceReviewQueueSnapshot(exactSizedBytes, "a".repeat(64))).toMatchObject({ status: "INVALID", code: "BYTE_LIMIT_EXCEEDED" });
    const atLimit = new Uint8Array(EVIDENCE_REVIEW_QUEUE_SNAPSHOT_CODEC_LIMITS.maxBytes);
    expect(decodeEvidenceReviewQueueSnapshot(atLimit, rehashBytes(atLimit))).toMatchObject({ status: "INVALID", code: "JSON_INVALID" });
    const oversizedPayload = nonEmptyPayload();
    const changed = envelope({ ...oversizedPayload, items: Array.from({ length: 512 }, (_, i) => ({ ...oversizedPayload.items[0]!, publicKey: `eviqv1_${String(i).padStart(64, "0")}` })) });
    expect(encode(changed).status).toBe("INVALID");
  });

  it("checks digest, fatal UTF-8, BOM, JSON and canonical byte equality", () => {
    const good = encode(envelope()); expect(good.status).toBe("VALID"); if (good.status !== "VALID") return;
    expect(decodeEvidenceReviewQueueSnapshot(good.value.canonicalBytes, "A".repeat(64))).toMatchObject({ status: "INVALID", code: "DIGEST_INVALID" });
    expect(decodeEvidenceReviewQueueSnapshot(good.value.canonicalBytes, "0".repeat(64))).toMatchObject({ status: "INVALID", code: "DIGEST_MISMATCH" });
    const decodeText = (text: string) => { const bytes = new TextEncoder().encode(text); return decodeEvidenceReviewQueueSnapshot(bytes, rehash(text)); };
    const canonical = new TextDecoder().decode(good.value.canonicalBytes);
    expect(decodeText(` ${canonical}`)).toMatchObject({ status: "INVALID", code: "NON_CANONICAL_BYTES" });
    const parsed = JSON.parse(canonical) as Record<string, unknown>;
    const reversed = `{${Object.entries(parsed).reverse().map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`).join(",")}}`;
    expect(decodeText(reversed)).toMatchObject({ status: "INVALID", code: "NON_CANONICAL_BYTES" });
    expect(decodeText(canonical.replace("event-intelligence-evidence-review-queue-snapshot/v1", "event-intelligence-evidence-review-queue-snapshot/v1\\u002f"))).toMatchObject({ status: "INVALID" });
    expect(decodeText(canonical.replace('"formatVersion":', '"formatVersion":"extra","formatVersion":'))).toMatchObject({ status: "INVALID", code: "NON_CANONICAL_BYTES" });
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...good.value.canonicalBytes]);
    expect(decodeEvidenceReviewQueueSnapshot(bom, rehashBytes(bom))).toMatchObject({ status: "INVALID", code: "BOM_FORBIDDEN" });
    const invalidUtf8 = new Uint8Array([0xff, 0xfe]);
    expect(decodeEvidenceReviewQueueSnapshot(invalidUtf8, rehashBytes(invalidUtf8))).toMatchObject({ status: "INVALID", code: "UTF8_INVALID" });
    expect(decodeText("{")).toMatchObject({ status: "INVALID", code: "JSON_INVALID" });
  });

  it("rejects noncanonical escaping and never restores domain trust", () => {
    const good = encode(envelope()); expect(good.status).toBe("VALID"); if (good.status !== "VALID") return;
    const text = new TextDecoder().decode(good.value.canonicalBytes);
    expect(decodeEvidenceReviewQueueSnapshot(new TextEncoder().encode(text.replace("event-intelligence", "event-\\u0069ntelligence")), rehash(text.replace("event-intelligence", "event-\\u0069ntelligence")))).toMatchObject({ status: "INVALID", code: "NON_CANONICAL_BYTES" });
    const decoded = decodeEvidenceReviewQueueSnapshot(good.value.canonicalBytes, good.value.sha256);
    expect(decoded.status).toBe("VALID");
    if (decoded.status === "VALID") {
      expect(JSON.stringify(decoded.value)).not.toContain("fingerprint");
      expect(Object.isFrozen(decoded.value.envelope)).toBe(true);
    }
  });
});
