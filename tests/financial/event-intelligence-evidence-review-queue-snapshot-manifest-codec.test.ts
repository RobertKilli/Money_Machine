import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_LIMITS,
  decodeEvidenceReviewQueueSnapshotManifest,
  encodeEvidenceReviewQueueSnapshotManifest,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-manifest-codec";
import {
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
  encodeEvidenceReviewQueueSnapshot,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-codec";
import { createBlockedEvidenceReviewQueueViewModel, EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";
import { buildEvidenceReviewQueueScopeIdentity, EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE, EVIDENCE_QUEUE_SCOPE_MATERIAL_VERSION } from "@/domain/intelligence/event-intelligence-evidence-review-queue-scope-identity";
import { EVIDENCE_REVIEW_QUEUE_VERSION } from "@/domain/intelligence/event-intelligence-evidence-review-queue";
import { SOURCE_PORTFOLIO_DECISION_VERSION } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { verifyEvidenceReviewQueueSnapshotManifestBinding } from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-manifest-binding";
import {
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_VERSION,
  parseEvidenceReviewQueueSnapshotProvenanceManifest,
  type EvidenceReviewQueueSnapshotProvenanceReference,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-provenance-manifest";

const snapshotDigest = "f".repeat(64);
const scopeIdentity = `eviqs1_${"a".repeat(64)}`;
const hashValue = (value: number) => value.toString(16).padStart(64, "0");
const cutoff = "2026-10-03T12:00:00.000Z";

function scopeMaterial() {
  return {
    scopeMaterialVersion: EVIDENCE_QUEUE_SCOPE_MATERIAL_VERSION,
    canonicalizationProfile: EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE,
    reviewPurposePolicyVersion: "event-intelligence-review-purpose/v1",
    reviewPurpose: "CRYPTO_TREASURY_DISCLOSURE_REVIEW",
    jurisdictionUniverse: ["US_SEC"], eventRepresentationUniverse: ["PURCHASE_INTENT"],
    assetRepresentationUniverse: ["asset-representation/v1/ethereum-native"],
    issuerListingEligibilityPolicy: { policyId: "issuer-listing-eligibility", version: "v1", canonicalMaterialDigest: "a".repeat(64) },
    sourcePortfolioPolicy: { contractVersion: SOURCE_PORTFOLIO_DECISION_VERSION, canonicalMaterialDigest: "b".repeat(64) },
    routingPolicy: { policyId: "event-routing", version: "v2", canonicalMaterialDigest: "c".repeat(64) },
    queueContract: { contractVersion: EVIDENCE_REVIEW_QUEUE_VERSION, canonicalMaterialDigest: "d".repeat(64) },
    accessClassificationPolicyVersion: "event-intelligence-review-access-classification/v1",
    accessClassification: "INTERNAL_RESTRICTED",
  } as const;
}

function refs(): EvidenceReviewQueueSnapshotProvenanceReference[] {
  const sha = "a".repeat(64);
  return [
    { family: "SEC_EVENT_DOCUMENT", schemaVersion: "sec-event-document-reference/v1", targetKind: "PROFILE", key: { profile_id: "sec-event/v1", fingerprint: sha } },
    { family: "ISSUER_EVIDENCE", schemaVersion: "issuer-evidence-reference/v1", issuerEvidenceContractVersion: "event-intelligence-issuer-evidence/v1", evidenceMaterialIdentity: sha, sourceOriginBinding: "b".repeat(64) },
    { family: "ASSET_MAPPING_REVISION", schemaVersion: "m5-asset-mapping-reference/v1", mapping_revision_id: "mapping-1", source_lineage_id: "lineage-1", provider_id: "PROVIDER", dataset_id: "dataset", dataset_version: "dataset/v1", canonical_asset_id: "asset-1", canonical_identifier: "ETH", asset_class: "CRYPTO" },
    { family: "DISCOVERY_SOURCE_RECORD", schemaVersion: "discovery-source-record-reference/v1", sourceType: "GDELT", localCandidateIdentity: sha, materialVariantIdentity: "b".repeat(64), receiptIdentity: "c".repeat(64) },
    { family: "CORRECTION_LINEAGE", schemaVersion: "correction-lineage-reference/v1", lineageContractVersion: "event-intelligence-correction-lineage/v1", rootClaimIdentity: sha, orderedMemberIdentities: [sha, "b".repeat(64)], selectedTerminalIdentity: "b".repeat(64), evaluationAsOf: "2026-10-03T12:00:00.000Z" },
    { family: "DERIVED_COMPOSITION", schemaVersion: "derived-composition-reference/v1", compositionContractVersion: "event-intelligence-evidence-review-queue-composition/v1", compositionMaterialIdentity: sha },
    { family: "DERIVED_QUEUE_SET", schemaVersion: "derived-queue-set-reference/v1", queueContractVersion: "event-intelligence-evidence-review-queue-contract/v1", queueSetMaterialIdentity: sha, sealedMemberSetIdentity: "b".repeat(64) },
    { family: "DERIVED_VIEW_MODEL", schemaVersion: "derived-view-model-reference/v1", viewModelContractVersion: "event-intelligence-evidence-review-queue-view-model/v1", safePayloadDigest: sha, payloadLength: 12 },
  ];
}

function manifest(references: readonly EvidenceReviewQueueSnapshotProvenanceReference[] = []) {
  return {
    manifestContractVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PROVENANCE_MANIFEST_VERSION,
    snapshotFormatVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
    snapshotDigest,
    scopeIdentity,
    members: references.map((reference, ordinal) => ({ snapshotDigest, scopeIdentity, ordinal, reference })),
  };
}

function correction(index: number): EvidenceReviewQueueSnapshotProvenanceReference {
  const base = 100_000 + index * 100;
  return {
    family: "CORRECTION_LINEAGE", schemaVersion: "correction-lineage-reference/v1",
    lineageContractVersion: "event-intelligence-correction-lineage/v1", rootClaimIdentity: hashValue(base),
    orderedMemberIdentities: Array.from({ length: 64 }, (_, offset) => hashValue(base + offset + 1)),
    selectedTerminalIdentity: hashValue(base + 99), evaluationAsOf: "2026-10-03T12:00:00.000Z",
  };
}

function sha(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function encode(input: unknown) {
  const result = encodeEvidenceReviewQueueSnapshotManifest(input);
  if (result.status !== "CANONICALIZED_NON_AUTHORITATIVE") throw new Error(`encode failed: ${result.status === "INVALID" ? result.code : "unknown"}`);
  return result;
}

describe("snapshot provenance manifest canonical byte codec", () => {
  it("roundtrips empty and all-family inventories while sorting members independently of input order", () => {
    for (const input of [manifest(), manifest(refs()), manifest([...refs()].reverse())]) {
      const encoded = encode(input);
      const decoded = decodeEvidenceReviewQueueSnapshotManifest(encoded.canonicalBytes, encoded.sha256);
      expect(decoded.status).toBe("DECODED_CANONICAL_NON_AUTHORITATIVE");
      if (decoded.status === "DECODED_CANONICAL_NON_AUTHORITATIVE") {
        expect(decoded.envelope.manifest.members.map(member => member.ordinal)).toEqual(decoded.envelope.manifest.members.map((_, i) => i));
        expect(decoded.envelope.manifest.members.map(member => member.reference.family)).toEqual(input.members.length ? refs().map(ref => ref.family) : []);
      }
    }
    expect(encode(manifest(refs())).canonicalBytes).toEqual(encode(manifest([...refs()].reverse())).canonicalBytes);
  });

  it("does not mutate caller arrays/ordinals and canonicalizes nested object insertion order", () => {
    const input = manifest([...refs()].reverse());
    const before = JSON.stringify(input);
    const result = encode(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(input.members.map(member => member.ordinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const reordered = manifest(refs());
    const sec = reordered.members[0]!.reference as Extract<EvidenceReviewQueueSnapshotProvenanceReference, { family: "SEC_EVENT_DOCUMENT" }>;
    if (sec.targetKind !== "PROFILE") throw new Error("Expected profile SEC reference fixture");
    reordered.members[0]!.reference = { ...sec, key: { fingerprint: sec.key.fingerprint, profile_id: sec.key.profile_id } };
    expect(encode(reordered).canonicalBytes).toEqual(encode(manifest(refs())).canonicalBytes);
    expect(result.status).toBe("CANONICALIZED_NON_AUTHORITATIVE");
  });

  it("preserves nested array order, revisions and correction timestamps", () => {
    const original = refs()[4] as Extract<EvidenceReviewQueueSnapshotProvenanceReference, { family: "CORRECTION_LINEAGE" }>;
    const reversed = { ...original, orderedMemberIdentities: [...original.orderedMemberIdentities].reverse() };
    expect(encode(manifest([original])).canonicalBytes).not.toEqual(encode(manifest([reversed])).canonicalBytes);
    const laterCorrection = { ...original, evaluationAsOf: "2026-10-04T12:00:00.000Z" };
    expect(encode(manifest([original])).canonicalBytes).not.toEqual(encode(manifest([laterCorrection])).canonicalBytes);
    const old = encode(manifest([correction(0)]));
    const changed = encode(manifest([correction(1)]));
    expect(decodeEvidenceReviewQueueSnapshotManifest(changed.canonicalBytes, old.sha256)).toEqual({ status: "INVALID", code: "DIGEST_MISMATCH" });
    expect(decodeEvidenceReviewQueueSnapshotManifest(changed.canonicalBytes, changed.sha256).status).toBe("DECODED_CANONICAL_NON_AUTHORITATIVE");
  });

  it("matches an independent empty-manifest golden wire fixture", () => {
    const literal = `{"manifest":{"manifestContractVersion":"event-intelligence-evidence-review-queue-snapshot-provenance-manifest/v1","members":[],"scopeIdentity":"eviqs1_${"a".repeat(64)}","snapshotDigest":"${"f".repeat(64)}","snapshotFormatVersion":"event-intelligence-evidence-review-queue-snapshot/v1"},"manifestCodecProfile":"event-intelligence-evidence-review-queue-snapshot-provenance-manifest-canonical-json/v1"}`;
    const expectedDigest = "db5aa0b0be43f1d7f1ccb1d4babb65b9d69a9c885743b1b41969b851d891b753";
    const result = encode(manifest());
    expect(new TextDecoder().decode(result.canonicalBytes)).toBe(literal);
    expect(result.sha256).toBe(expectedDigest);
  });

  it("matches a nonempty golden that fixes family order, full-reference tie-break, keys, and ordinals", () => {
    const secZ: EvidenceReviewQueueSnapshotProvenanceReference = {
      family: "SEC_EVENT_DOCUMENT", schemaVersion: "sec-event-document-reference/v1", targetKind: "PROFILE",
      key: { profile_id: "z-profile", fingerprint: "b".repeat(64) },
    };
    const secA: EvidenceReviewQueueSnapshotProvenanceReference = {
      family: "SEC_EVENT_DOCUMENT", schemaVersion: "sec-event-document-reference/v1", targetKind: "PROFILE",
      key: { profile_id: "a-profile", fingerprint: "a".repeat(64) },
    };
    const issuer: EvidenceReviewQueueSnapshotProvenanceReference = {
      family: "ISSUER_EVIDENCE", schemaVersion: "issuer-evidence-reference/v1",
      issuerEvidenceContractVersion: "event-intelligence-issuer-evidence/v1",
      evidenceMaterialIdentity: "c".repeat(64), sourceOriginBinding: "d".repeat(64),
    };
    const input = manifest([issuer, secZ, secA]);
    const expected = `{"manifest":{"manifestContractVersion":"event-intelligence-evidence-review-queue-snapshot-provenance-manifest/v1","members":[{"ordinal":0,"reference":{"family":"SEC_EVENT_DOCUMENT","key":{"fingerprint":"${"a".repeat(64)}","profile_id":"a-profile"},"schemaVersion":"sec-event-document-reference/v1","targetKind":"PROFILE"},"scopeIdentity":"${scopeIdentity}","snapshotDigest":"${snapshotDigest}"},{"ordinal":1,"reference":{"family":"SEC_EVENT_DOCUMENT","key":{"fingerprint":"${"b".repeat(64)}","profile_id":"z-profile"},"schemaVersion":"sec-event-document-reference/v1","targetKind":"PROFILE"},"scopeIdentity":"${scopeIdentity}","snapshotDigest":"${snapshotDigest}"},{"ordinal":2,"reference":{"evidenceMaterialIdentity":"${"c".repeat(64)}","family":"ISSUER_EVIDENCE","issuerEvidenceContractVersion":"event-intelligence-issuer-evidence/v1","schemaVersion":"issuer-evidence-reference/v1","sourceOriginBinding":"${"d".repeat(64)}"},"scopeIdentity":"${scopeIdentity}","snapshotDigest":"${snapshotDigest}"}],"scopeIdentity":"${scopeIdentity}","snapshotDigest":"${snapshotDigest}","snapshotFormatVersion":"event-intelligence-evidence-review-queue-snapshot/v1"},"manifestCodecProfile":"event-intelligence-evidence-review-queue-snapshot-provenance-manifest-canonical-json/v1"}`;
    const result = encode(input);
    expect(new TextDecoder().decode(result.canonicalBytes)).toBe(expected);
    expect(result.sha256).toBe("40a9054cba924715eb70aa56d0aba8cad53b9cb67f19a4583bc30fccc9b8a967");
    expect(input.members.map(member => member.reference.family)).toEqual(["ISSUER_EVIDENCE", "SEC_EVENT_DOCUMENT", "SEC_EVENT_DOCUMENT"]);
    expect(input.members.map(member => member.ordinal)).toEqual([0, 1, 2]);
  });

  it("rejects canonicality changes even when each manipulated byte string has its own correct digest", () => {
    const encoded = encode(manifest(refs().slice(0, 2)));
    const text = new TextDecoder().decode(encoded.canonicalBytes);
    const parsed = JSON.parse(text);
    const reversedRoot = JSON.stringify({ manifestCodecProfile: parsed.manifestCodecProfile, manifest: parsed.manifest });
    const variants = [
      ` ${text}`,
      reversedRoot,
      text.replace("/v1", "\\/v1"),
      text.replace(`"snapshotDigest":"${snapshotDigest}"`, `"snapshotDigest":"${snapshotDigest}","snapshotDigest":"${snapshotDigest}"`),
      text.replace(`"snapshotDigest":"${snapshotDigest}"`, `"snapshotD\\u0069gest":"${snapshotDigest}","snapshotDigest":"${snapshotDigest}"`),
      text.replace('"ordinal":0', '"ordinal":0.0'),
    ];
    for (const variant of variants) {
      const bytes = new TextEncoder().encode(variant);
      expect(decodeEvidenceReviewQueueSnapshotManifest(bytes, sha(bytes))).toEqual({ status: "INVALID", code: "NON_CANONICAL_BYTES" });
    }
    const reversed = manifest([...refs().slice(0, 2)].reverse());
    const noncanonicalMembers = JSON.parse(new TextDecoder().decode(encode(reversed).canonicalBytes));
    noncanonicalMembers.manifest.members.reverse();
    noncanonicalMembers.manifest.members.forEach((member: { ordinal: number }, index: number) => { member.ordinal = index; });
    const bytes = new TextEncoder().encode(JSON.stringify(noncanonicalMembers));
    expect(decodeEvidenceReviewQueueSnapshotManifest(bytes, sha(bytes))).toEqual({ status: "INVALID", code: "NON_CANONICAL_BYTES" });
  });

  it("rejects malformed bytes, BOM, invalid UTF-8, invalid digest, and oversize input", () => {
    const cases = [
      [new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]), "BOM_FORBIDDEN"],
      [new Uint8Array([0xff]), "UTF8_INVALID"],
      [new TextEncoder().encode("{"), "JSON_INVALID"],
    ] as const;
    for (const [bytes, expected] of cases) expect(decodeEvidenceReviewQueueSnapshotManifest(bytes, sha(bytes))).toEqual({ status: "INVALID", code: expected });
    expect(decodeEvidenceReviewQueueSnapshotManifest(new Uint8Array(), "A".repeat(64))).toEqual({ status: "INVALID", code: "DIGEST_INVALID" });
    expect(decodeEvidenceReviewQueueSnapshotManifest(new Uint8Array(), `${"a".repeat(64)}\n`)).toEqual({ status: "INVALID", code: "DIGEST_INVALID" });
    const tooLarge = new Uint8Array(EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_LIMITS.maxBytes + 1);
    expect(decodeEvidenceReviewQueueSnapshotManifest(tooLarge, sha(tooLarge))).toEqual({ status: "INVALID", code: "BYTE_LIMIT_EXCEEDED" });
    const valid = encode(manifest()).canonicalBytes;
    const backing = new Uint8Array(valid.length + 4);
    backing.set(valid, 2);
    const view = backing.subarray(2, 2 + valid.length);
    expect(decodeEvidenceReviewQueueSnapshotManifest(view, sha(valid)).status).toBe("DECODED_CANONICAL_NON_AUTHORITATIVE");
    expect(decodeEvidenceReviewQueueSnapshotManifest(Buffer.from(valid), sha(valid)).status).toBe("DECODED_CANONICAL_NON_AUTHORITATIVE");
    const offsetResult = decodeEvidenceReviewQueueSnapshotManifest(backing.subarray(1, 2), sha(backing.subarray(1, 2)));
    expect(offsetResult).toEqual({ status: "INVALID", code: "JSON_INVALID" });
    expect(decodeEvidenceReviewQueueSnapshotManifest(Buffer.from("{}"), sha(Buffer.from("{}"))).status).toBe("INVALID");
    if (typeof SharedArrayBuffer !== "undefined") {
      const shared = new Uint8Array(new SharedArrayBuffer(2));
      expect(decodeEvidenceReviewQueueSnapshotManifest(shared, sha(shared))).toEqual({ status: "INVALID", code: "BYTE_INPUT_INVALID" });
    }
  });

  it("encodes the structural maximum within budget and rejects the 129th member", () => {
    const maximum = manifest(Array.from({ length: 128 }, (_, index) => correction(index)));
    const parsed = parseEvidenceReviewQueueSnapshotProvenanceManifest(maximum);
    expect(parsed.status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    const encoded = encode(maximum);
    expect(encoded.canonicalBytes.byteLength).toBeLessThanOrEqual(EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_CODEC_LIMITS.maxBytes);
    expect(decodeEvidenceReviewQueueSnapshotManifest(encoded.canonicalBytes, encoded.sha256).status).toBe("DECODED_CANONICAL_NON_AUTHORITATIVE");
    const over = manifest([...maximum.members.map(member => member.reference), correction(999)]);
    expect(encodeEvidenceReviewQueueSnapshotManifest(over)).toMatchObject({ status: "INVALID", code: "MANIFEST_INPUT_INVALID", manifestCode: "MANIFEST_LIMIT_EXCEEDED" });
  });

  it("returns isolated frozen decode data while encode bytes remain caller-owned copies", () => {
    const input = manifest(refs());
    const encoded = encode(input);
    const originalDigest = encoded.sha256;
    encoded.canonicalBytes[0] ^= 1;
    expect(originalDigest).not.toBe(sha(encoded.canonicalBytes));
    const good = encode(input);
    const bytes = new Uint8Array(good.canonicalBytes);
    const decoded = decodeEvidenceReviewQueueSnapshotManifest(bytes, good.sha256);
    expect(decoded.status).toBe("DECODED_CANONICAL_NON_AUTHORITATIVE");
    bytes.fill(0);
    if (decoded.status !== "DECODED_CANONICAL_NON_AUTHORITATIVE") return;
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.envelope)).toBe(true);
    expect(Object.isFrozen(decoded.envelope.manifest.members)).toBe(true);
    expect(Object.isFrozen(decoded.envelope.manifest.members[0]!.reference)).toBe(true);
    const correctionMember = decoded.envelope.manifest.members.find(member => member.reference.family === "CORRECTION_LINEAGE");
    expect(Object.isFrozen((correctionMember!.reference as Extract<EvidenceReviewQueueSnapshotProvenanceReference, { family: "CORRECTION_LINEAGE" }>).orderedMemberIdentities)).toBe(true);
    expect(decoded.sha256).toBe(good.sha256);
    expect(decoded.status).toBe("DECODED_CANONICAL_NON_AUTHORITATIVE");
  });

  it("feeds decoded manifest data through the existing snapshot-manifest binding API", () => {
    const scope = buildEvidenceReviewQueueScopeIdentity(scopeMaterial());
    expect(scope.status).toBe("VALID_SYNTAX_ONLY");
    if (scope.status !== "VALID_SYNTAX_ONLY") return;
    const snapshot = encodeEvidenceReviewQueueSnapshot({
      formatVersion: EVIDENCE_REVIEW_QUEUE_SNAPSHOT_FORMAT_VERSION,
      viewModelVersion: EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION,
      scopeIdentity: scope.identity,
      snapshotCutoff: cutoff,
      payload: createBlockedEvidenceReviewQueueViewModel(),
    });
    expect(snapshot.status).toBe("VALID");
    if (snapshot.status !== "VALID") return;
    const manifestInput = {
      ...manifest(),
      snapshotDigest: snapshot.value.sha256,
      scopeIdentity: scope.identity,
    };
    const encodedManifest = encode(manifestInput);
    const decoded = decodeEvidenceReviewQueueSnapshotManifest(encodedManifest.canonicalBytes, encodedManifest.sha256);
    expect(decoded.status).toBe("DECODED_CANONICAL_NON_AUTHORITATIVE");
    if (decoded.status !== "DECODED_CANONICAL_NON_AUTHORITATIVE") return;
    const bound = verifyEvidenceReviewQueueSnapshotManifestBinding(
      snapshot.value.canonicalBytes,
      snapshot.value.sha256,
      scope.identity,
      scopeMaterial(),
      decoded.envelope.manifest,
    );
    expect(bound.status).toBe("VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE");
    if (bound.status === "VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE") expect(bound.envelope.payload.state).toBe("BLOCKED");
  });
});
