import { describe, expect, it } from "vitest";
import {
  isAuthenticEvidenceReviewItem,
  isAuthenticEvidenceReviewQueueSet,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue";
import { composeEventIntelligenceEvidenceReviewQueue } from "@/application/intelligence/compose-event-intelligence-evidence-review-queue";
import {
  EVIDENCE_QUEUE_PROVENANCE_FAMILIES,
  parseEvidenceQueueProvenanceReference,
  type EvidenceQueueProvenanceReference,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-scope-provenance-decision";
import {
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-codec";
import {
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_LIMITS as LIMITS,
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_VERSION,
  parseEvidenceReviewQueueSnapshotProvenanceManifest as parseManifest,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-provenance-manifest";
import { isAuthenticRoutingEvaluation } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { isAuthenticNewsDiscoveryCandidate } from "@/domain/intelligence/event-intelligence-news-discovery";

const snapshotDigest = "f".repeat(64);
const scopeIdentity = `eviqs1_${"a".repeat(64)}`;
const hashValue = (value: number) => value.toString(16).padStart(64, "0");

function references(): EvidenceQueueProvenanceReference[] {
  const sha = "a".repeat(64);
  return [
    { family: "SEC_EVENT_DOCUMENT", schemaVersion: "sec-event-document-reference/v1", targetKind: "PROFILE", key: { profile_id: "sec-event/v1", fingerprint: sha } },
    { family: "ISSUER_EVIDENCE", schemaVersion: "issuer-evidence-reference/v1", issuerEvidenceContractVersion: "event-intelligence-issuer-evidence/v1", evidenceMaterialIdentity: sha, sourceOriginBinding: "b".repeat(64) },
    { family: "ASSET_MAPPING_REVISION", schemaVersion: "m5-asset-mapping-reference/v1", mapping_revision_id: "mapping-1", source_lineage_id: "lineage-1", provider_id: "PROVIDER", dataset_id: "dataset", dataset_version: "dataset/v1", canonical_asset_id: "asset-1", canonical_identifier: "ETH", asset_class: "CRYPTO" },
    { family: "DISCOVERY_SOURCE_RECORD", schemaVersion: "discovery-source-record-reference/v1", sourceType: "GDELT", localCandidateIdentity: sha, materialVariantIdentity: "b".repeat(64), receiptIdentity: "c".repeat(64) },
    { family: "CORRECTION_LINEAGE", schemaVersion: "correction-lineage-reference/v1", lineageContractVersion: "event-intelligence-correction-lineage/v1", rootClaimIdentity: sha, orderedMemberIdentities: [sha], selectedTerminalIdentity: "b".repeat(64), evaluationAsOf: "2026-10-03T12:00:00.000Z" },
    { family: "DERIVED_COMPOSITION", schemaVersion: "derived-composition-reference/v1", compositionContractVersion: "event-intelligence-evidence-review-queue-composition/v1", compositionMaterialIdentity: sha },
    { family: "DERIVED_QUEUE_SET", schemaVersion: "derived-queue-set-reference/v1", queueContractVersion: "event-intelligence-evidence-review-queue-contract/v1", queueSetMaterialIdentity: sha, sealedMemberSetIdentity: "b".repeat(64) },
    { family: "DERIVED_VIEW_MODEL", schemaVersion: "derived-view-model-reference/v1", viewModelContractVersion: "event-intelligence-evidence-review-queue-view-model/v1", safePayloadDigest: sha, payloadLength: 12 },
  ];
}

function manifest(inputReferences: readonly EvidenceQueueProvenanceReference[] = []) {
  return {
    manifestContractVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_VERSION,
    snapshotFormatVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
    snapshotDigest,
    scopeIdentity,
    members: inputReferences.map((reference, ordinal) => ({ snapshotDigest, scopeIdentity, ordinal, reference })),
  };
}

function correctionReference(index: number): EvidenceQueueProvenanceReference {
  const first = 1_000_000 + index * 100;
  return {
    family: "CORRECTION_LINEAGE",
    schemaVersion: "correction-lineage-reference/v1",
    lineageContractVersion: "event-intelligence-correction-lineage/v1",
    rootClaimIdentity: hashValue(first),
    orderedMemberIdentities: Array.from({ length: 64 }, (_, member) => hashValue(first + 2 + member)),
    selectedTerminalIdentity: hashValue(first + 1),
    evaluationAsOf: "2026-10-03T12:00:00.000Z",
  };
}

describe("snapshot provenance manifest syntax contract", () => {
  it("accepts all eight existing family shapes with exact parent bindings", () => {
    const refs = references();
    expect(refs.map(reference => reference.family)).toEqual(EVIDENCE_QUEUE_PROVENANCE_FAMILIES);
    for (const reference of refs) expect(parseEvidenceQueueProvenanceReference(reference).status).toBe("VALID_SYNTAX_ONLY");
    const result = parseManifest(manifest(refs));
    expect(result.status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    if (result.status !== "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE") return;
    expect(result.manifest.members.map(member => member.ordinal)).toEqual(refs.map((_, index) => index));
    expect(result.manifest.members.every(member => member.snapshotDigest === snapshotDigest && member.scopeIdentity === scopeIdentity)).toBe(true);
  });

  it("accepts an empty structural inventory without completeness or authority claims", () => {
    const result = parseManifest(manifest());
    expect(result.status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    if (result.status !== "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE") return;
    expect(result.manifest.members).toEqual([]);
    expect(result).not.toHaveProperty("complete");
    expect(result).not.toHaveProperty("sealed");
    expect(result).not.toHaveProperty("authoritative");
  });

  it("rejects unknown versions, fields, families, and malformed identity bindings", () => {
    const valid = manifest(references().slice(0, 1));
    expect(parseManifest({ ...valid, manifestContractVersion: "event-intelligence-evidence-review-queue-snapshot-provenance-manifest/v2" })).toEqual({ status: "INVALID", code: "MANIFEST_VERSION_INVALID" });
    expect(parseManifest({ ...valid, snapshotFormatVersion: "event-intelligence-evidence-review-queue-snapshot/v2" })).toEqual({ status: "INVALID", code: "MANIFEST_VERSION_INVALID" });
    expect(parseManifest({ ...valid, extra: "x" })).toEqual({ status: "INVALID", code: "MANIFEST_SHAPE_INVALID" });
    const unknown = manifest([{ family: "FUTURE_FAMILY", schemaVersion: "future/v1" } as unknown as EvidenceQueueProvenanceReference]);
    expect(parseManifest(unknown)).toEqual({ status: "INVALID", code: "MANIFEST_REFERENCE_INVALID" });
    const unexpectedReferenceField = { ...references()[1]!, displayName: "caller supplied" } as EvidenceQueueProvenanceReference;
    expect(parseManifest(manifest([unexpectedReferenceField]))).toEqual({ status: "INVALID", code: "MANIFEST_REFERENCE_INVALID" });
    const unexpectedNestedKey = { ...references()[0]!, key: { profile_id: "sec-event/v1", fingerprint: "a".repeat(64), artifact_id: "unbound" } } as EvidenceQueueProvenanceReference;
    expect(parseManifest(manifest([unexpectedNestedKey]))).toEqual({ status: "INVALID", code: "MANIFEST_REFERENCE_INVALID" });
    expect(parseManifest({ ...valid, snapshotDigest: "A".repeat(64) })).toEqual({ status: "INVALID", code: "MANIFEST_IDENTITY_INVALID" });
    expect(parseManifest({ ...valid, scopeIdentity: "eviqs1_" + "a".repeat(64) + "\n" })).toEqual({ status: "INVALID", code: "MANIFEST_IDENTITY_INVALID" });
  });

  it("rejects cross-snapshot and cross-scope members before parsing their references", () => {
    const base = manifest(references().slice(0, 1));
    expect(parseManifest({ ...base, members: [{ ...base.members[0]!, snapshotDigest: "b".repeat(64) }] })).toEqual({ status: "INVALID", code: "MANIFEST_PARENT_BINDING_MISMATCH" });
    expect(parseManifest({ ...base, members: [{ ...base.members[0]!, scopeIdentity: `eviqs1_${"b".repeat(64)}` }] })).toEqual({ status: "INVALID", code: "MANIFEST_PARENT_BINDING_MISMATCH" });
    expect(parseManifest({ ...base, members: [{ ...base.members[0]!, snapshotDigest: "A".repeat(64) }] })).toEqual({ status: "INVALID", code: "MANIFEST_IDENTITY_INVALID" });
    expect(parseManifest({ ...base, members: [{ ...base.members[0]!, scopeIdentity: "scope:unknown" }] })).toEqual({ status: "INVALID", code: "MANIFEST_IDENTITY_INVALID" });
  });

  it("requires ordinals to equal their dense array positions", () => {
    const refs = references().slice(0, 2);
    const valid = manifest(refs);
    for (const [members, code] of [
      [[valid.members[0], { ...valid.members[1]!, ordinal: 2 }], "MANIFEST_ORDINAL_INVALID"],
      [[{ ...valid.members[0]!, ordinal: 1 }, { ...valid.members[1]!, ordinal: 0 }], "MANIFEST_ORDINAL_INVALID"],
      [[{ ...valid.members[0]!, ordinal: -0 }, valid.members[1]], "MANIFEST_SHAPE_INVALID"],
    ] as const) expect(parseManifest({ ...valid, members })).toEqual({ status: "INVALID", code });
  });

  it("rejects whole-reference duplicates independent of property order but preserves distinct revisions", () => {
    const ref = references()[0]!;
    const reversedKey = { ...ref, key: { fingerprint: (ref.key as Record<string, unknown>).fingerprint, profile_id: (ref.key as Record<string, unknown>).profile_id } };
    expect(parseManifest(manifest([ref, reversedKey]))).toEqual({ status: "INVALID", code: "MANIFEST_DUPLICATE_REFERENCE" });

    const revisions = references()[2] as Record<string, unknown>;
    const secondRevision = { ...revisions, mapping_revision_id: "mapping-2", source_lineage_id: "lineage-2" } as EvidenceQueueProvenanceReference;
    expect(parseManifest(manifest([revisions as EvidenceQueueProvenanceReference, secondRevision])).status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    const originalLineage = references()[4] as Record<string, unknown>;
    const correctedLineage = { ...originalLineage, orderedMemberIdentities: ["a".repeat(64), "c".repeat(64)], selectedTerminalIdentity: "c".repeat(64) } as EvidenceQueueProvenanceReference;
    expect(parseManifest(manifest([originalLineage as EvidenceQueueProvenanceReference, correctedLineage])).status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    const crossFamily = references();
    const derived = crossFamily[5]!;
    const issuer = { ...crossFamily[1]!, evidenceMaterialIdentity: "e".repeat(64), sourceOriginBinding: "d".repeat(64) } as EvidenceQueueProvenanceReference;
    expect(parseManifest(manifest([derived, issuer])).status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
  });

  it("reuses the family parser rejection for mismatched nested family payloads", () => {
    const malformed = { ...references()[0]!, targetKind: "PROFILE", key: { artifact_id: "artifact-1", fingerprint: "a".repeat(64) } };
    expect(parseEvidenceQueueProvenanceReference(malformed).status).toBe("INVALID");
    expect(parseManifest(manifest([malformed]))).toEqual({ status: "INVALID", code: "MANIFEST_REFERENCE_INVALID" });
  });

  it("enforces member, tree, string, depth and property limits without truncation", () => {
    expect(LIMITS.maxMembers).toBe(128);
    const atMemberLimit = Array.from({ length: LIMITS.maxMembers }, (_, index) => ({
      family: "DERIVED_COMPOSITION", schemaVersion: "derived-composition-reference/v1",
      compositionContractVersion: "event-intelligence-evidence-review-queue-composition/v1",
      compositionMaterialIdentity: hashValue(index + 1),
    })) as EvidenceQueueProvenanceReference[];
    const maximum = parseManifest(manifest(atMemberLimit));
    expect(maximum.status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    if (maximum.status === "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE") expect(maximum.manifest.members).toHaveLength(LIMITS.maxMembers);

    const overMemberLimit = Array.from({ length: LIMITS.maxMembers + 1 }, (_, index) => ({
      family: "DERIVED_COMPOSITION", schemaVersion: "derived-composition-reference/v1",
      compositionContractVersion: "event-intelligence-evidence-review-queue-composition/v1",
      compositionMaterialIdentity: hashValue(index + 1),
    })) as EvidenceQueueProvenanceReference[];
    expect(parseManifest(manifest(overMemberLimit))).toEqual({ status: "INVALID", code: "MANIFEST_LIMIT_EXCEEDED" });

    const maxTree = parseManifest(manifest(Array.from({ length: 128 }, (_, index) => correctionReference(index))));
    expect(maxTree.status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    expect(parseManifest({ ...manifest(), padding: "x".repeat(LIMITS.maxStringCodeUnits + 1) })).toEqual({ status: "INVALID", code: "MANIFEST_LIMIT_EXCEEDED" });
    expect(parseManifest({ ...manifest(), padding: "x".repeat(LIMITS.maxStringCodeUnits) })).toEqual({ status: "INVALID", code: "MANIFEST_SHAPE_INVALID" });
    let nested: Record<string, unknown> = {};
    for (let level = 0; level < LIMITS.maxDepth; level++) nested = { child: nested };
    expect(parseManifest({ ...manifest(), nested })).toEqual({ status: "INVALID", code: "MANIFEST_LIMIT_EXCEEDED" });
    expect(parseManifest({ ...manifest(), ...Object.fromEntries(Array.from({ length: LIMITS.maxObjectProperties - 5 }, (_, index) => [`extra${index}`, index])) })).toEqual({ status: "INVALID", code: "MANIFEST_SHAPE_INVALID" });
    expect(parseManifest({ ...manifest(), ...Object.fromEntries(Array.from({ length: LIMITS.maxObjectProperties - 4 }, (_, index) => [`extra${index}`, index])) })).toEqual({ status: "INVALID", code: "MANIFEST_LIMIT_EXCEEDED" });
  });

  it("rejects accessors, sparse arrays, symbols, custom prototypes, cycles and unsupported primitives without invoking hooks", () => {
    let calls = 0;
    const getter = manifest();
    Object.defineProperty(getter, "snapshotDigest", { enumerable: true, get() { calls++; return snapshotDigest; } });
    expect(parseManifest(getter)).toEqual({ status: "INVALID", code: "MANIFEST_SHAPE_INVALID" });
    const nestedGetter = manifest([{ ...references()[0]!, key: Object.defineProperty({ profile_id: "sec-event/v1" }, "fingerprint", { enumerable: true, get() { calls++; return "a".repeat(64); } }) }]);
    expect(parseManifest(nestedGetter)).toEqual({ status: "INVALID", code: "MANIFEST_SHAPE_INVALID" });
    expect(parseManifest({ ...manifest(), members: new Array(1) })).toEqual({ status: "INVALID", code: "MANIFEST_SHAPE_INVALID" });
    expect(parseManifest({ ...manifest(), [Symbol("extra")]: true })).toEqual({ status: "INVALID", code: "MANIFEST_SHAPE_INVALID" });
    expect(parseManifest(Object.assign(Object.create({ inherited: true }), manifest()))).toEqual({ status: "INVALID", code: "MANIFEST_SHAPE_INVALID" });
    const cyclic = manifest() as Record<string, unknown>; cyclic.extra = cyclic;
    expect(parseManifest(cyclic)).toEqual({ status: "INVALID", code: "MANIFEST_SHAPE_INVALID" });
    for (const value of [1n, Symbol("x"), () => "x"]) expect(parseManifest({ ...manifest(), extra: value })).toEqual({ status: "INVALID", code: "MANIFEST_SHAPE_INVALID" });
    const proxy = new Proxy(manifest(), { get() { calls++; throw Error("caller detail"); } });
    expect(parseManifest(proxy)).toEqual({ status: "INVALID", code: "MANIFEST_SHAPE_INVALID" });
    expect(calls).toBe(0);
  });

  it("isolates and deeply freezes returned plain data", () => {
    const input = manifest([references()[4]!]);
    const before = JSON.stringify(input);
    const parsed = parseManifest(input);
    expect(parsed.status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    expect(JSON.stringify(input)).toBe(before);
    if (parsed.status !== "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE") return;
    (input.members[0]!.reference as Record<string, unknown>).orderedMemberIdentities = ["b".repeat(64)];
    const member = parsed.manifest.members[0]!;
    expect(member.reference.family).toBe("CORRECTION_LINEAGE");
    const correction = member.reference as Extract<typeof member.reference, { family: "CORRECTION_LINEAGE" }>;
    expect(correction.orderedMemberIdentities).toEqual(["a".repeat(64)]);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.manifest)).toBe(true);
    expect(Object.isFrozen(parsed.manifest.members)).toBe(true);
    expect(Object.isFrozen(member)).toBe(true);
    expect(Object.isFrozen(member.reference)).toBe(true);
    expect(Object.isFrozen(correction.orderedMemberIdentities)).toBe(true);
    expect(Reflect.set(member, "ordinal", 4)).toBe(false);
    expect(Reflect.set(member.reference, "family", "ISSUER_EVIDENCE")).toBe(false);
  });

  it("does not mint queue, routing, discovery or composition trust", () => {
    const parsed = parseManifest(manifest(references()));
    expect(parsed.status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    if (parsed.status !== "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE") return;
    const value = parsed.manifest;
    expect(isAuthenticEvidenceReviewQueueSet(value)).toBe(false);
    expect(isAuthenticEvidenceReviewItem(value)).toBe(false);
    expect(isAuthenticRoutingEvaluation(value)).toBe(false);
    expect(isAuthenticNewsDiscoveryCandidate(value)).toBe(false);
    expect(composeEventIntelligenceEvidenceReviewQueue({ evaluationAsOf: "2026-10-03T12:00:00.000Z", candidates: [{ candidate: value, routingMaterial: value }] }))
      .toEqual({ status: "BLOCKED", code: "COMPOSITION_CANDIDATE_UNTRUSTED" });
  });
});
