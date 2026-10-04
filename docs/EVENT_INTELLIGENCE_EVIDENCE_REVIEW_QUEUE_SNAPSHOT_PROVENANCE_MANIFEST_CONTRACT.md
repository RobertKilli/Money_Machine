# Evidence review queue snapshot provenance manifest contract

Contract: `event-intelligence-evidence-review-queue-snapshot-provenance-manifest/v1`.
Parent: `4434c5aff13b737f3ee6e0e0ec25e14c2e205565`.

## Purpose and boundary

This decision defines a versioned, closed v1 schema for a future provenance sidecar to the existing `event-intelligence-evidence-review-queue-snapshot/v1` bytes. The manifest is separate from the snapshot envelope and safe view-model. It does not alter scope material or calculate another scope identity. Its parser returns only `VALID_SYNTAX_ONLY_NON_AUTHORITATIVE`; it neither builds a manifest from composition nor resolves parent existence/authority, binds the manifest at runtime to snapshot bytes, canonicalizes or hashes the manifest, seals membership, persists data, or selects a current snapshot.

## Closed schema

The root has exactly these fields:

| Field | Rule |
|---|---|
| `manifestContractVersion` | Exact literal `event-intelligence-evidence-review-queue-snapshot-provenance-manifest/v1` |
| `snapshotFormatVersion` | Exact existing `event-intelligence-evidence-review-queue-snapshot/v1` literal |
| `snapshotDigest` | Exactly 64 lowercase hexadecimal characters; a future binding input for SHA-256 of the exact canonical snapshot envelope bytes |
| `scopeIdentity` | Exactly `eviqs1_` followed by 64 lowercase hexadecimal characters |
| `members` | Dense ordered array of 0 through 128 members |

Every member has exactly `snapshotDigest`, `scopeIdentity`, `ordinal`, and `reference`. Its digest and scope must exactly equal the root values. `ordinal` is a safe integer equal to the member's zero-based array position; gaps, repetitions, reordering, negative zero, and cross-parent bindings reject. The array position is the declared inventory order; there is no separate sort or priority rule. Empty inventory is structurally valid, but establishes no completeness for a nonempty snapshot or queue. There is no duplicated count field and no redundant family list: count and families are derived from the members array and each reference's family tag.

`reference` is passed to the existing `parseEvidenceQueueProvenanceReference` and retains that parser's exact family-specific shapes, versions, primitive rules, and immutable clone. V1 accepts exactly the eight existing family tags: `SEC_EVENT_DOCUMENT`, `ISSUER_EVIDENCE`, `ASSET_MAPPING_REVISION`, `DISCOVERY_SOURCE_RECORD`, `CORRECTION_LINEAGE`, `DERIVED_COMPOSITION`, `DERIVED_QUEUE_SET`, and `DERIVED_VIEW_MODEL`. Accepted v1 family-reference strings use the parent's ASCII token/digest/time forms; no normalization is performed. The referenced parser's syntactic status remains the only family-validation result. This contract does not claim that syntactically broad identifiers correspond to supported registry entries.

There is no manifest-level cutoff copy. The existing `CORRECTION_LINEAGE` reference shape itself requires `evaluationAsOf`; it is retained to reuse that exact family parser. It is not an independent manifest cutoff. The follow-on local [manifest-binding verifier](EVENT_INTELLIGENCE_EVIDENCE_REVIEW_QUEUE_SNAPSHOT_MANIFEST_BINDING.md) requires exact equality with the codec-validated snapshot envelope's `snapshotCutoff`; this syntactic comparison does not resolve parents or establish correction completeness.

Duplicate references are determined by equality of the whole parsed family-tagged reference: object property order is immaterial, array order is significant, and every nested key/value participates. A repeated reference rejects even if its ordinal differs. Distinct family tags or distinct parent-key components remain distinct references; identifiers are never collapsed into a generic ID. One parent may serve many queue rows, so the inventory lists each distinct reference once rather than duplicating it per row. Correction/retraction and successive lineage revisions remain distinct when their complete references differ; duplicate filtering cannot erase a different lineage revision.

The parent scope/provenance decision recommends UTF-16 family/reference ordering for a future authenticated member set. This syntax contract does not calculate a canonical reference ordering: ordinals prove only a dense positional declaration. A future authentic producer and seal must define and enforce canonical ordering before relying on stable manifest identity.

The inventory describes snapshot-level declared references only. It does not link a reference to a view-model row, candidate, source record, or a particular composition edge. It does not prove the listed parents were consumed, that required parents were not omitted, or that source-family tags match authenticated source type. Row-level linkage and an authentic derivation graph remain future producer/resolver requirements.

## Bounds and parser behavior

The parser accepts only plain objects and ordinary dense arrays with own enumerable data properties. It rejects accessors without invoking them, symbols, unexpected non-enumerable or extra fields, custom prototypes, sparse/extended arrays, cycles, unsupported primitives, malformed strings/digests, unknown versions/families, parent mismatch, invalid ordinals, duplicate references, and inputs over these limits:

* at most 128 members (a distinct manifest-inventory bound; it is not copied from the 512-item presentation codec limit);
* at most 128 entries in any array at the manifest structural gate; the reused reference parser further caps correction-lineage members at 64;
* strings at most 2,048 UTF-16 code units before the stricter reused family rules;
* at most 16 own properties per object before exact schema checks;
* depth at most 8 object/array edges from the root;
* at most 10,000 traversed values, counting each occurrence of a shared acyclic object separately.

This syntax contract has no canonical manifest-byte representation and therefore defines no manifest byte limit. A future codec must set its own byte bound and exact encoding profile.

Cycles are rejected using the active ancestor path; shared acyclic references are traversed again as JSON occurrences, not treated as cycles. Dense arrays must own every index and no extra key. V1's structural maximum is below 10,000 nodes: 128 members, each using the largest existing reference shape (`CORRECTION_LINEAGE` with 64 ordered hashes), consume fewer than 10,000 occurrences including root, arrays, member/reference objects and primitive values. Therefore a structurally valid maximum-size manifest is not rejected by the node budget. Whole-reference duplicate detection is also bounded: at most 8,128 prior/current pairs are compared, with at most 72 nodes in an accepted family reference. The parser does not truncate. These are in-memory work limits, not streaming or an allocation sandbox; arbitrary hostile Proxy behavior is not claimed to be sandboxed.

Success returns isolated deeply frozen plain data under `VALID_SYNTAX_ONLY_NON_AUTHORITATIVE`. Failure returns a frozen bounded code only, with no raw reference, caller text, or stack trace. Parser success does not restore queue, routing, or composition trust.

## Completeness, identity, and future seal

Structural completeness means only that every entry declared in the input exists in the validated array and satisfies its ordinal and binding rules. Authentic provenance completeness requires a trusted producer to show that all references required by the authenticated candidates, routing, corrections/retractions, composition, sealed queue set, and view-model are represented. The syntax parser has no authentic candidates and cannot establish the latter.

The root `snapshotDigest` is a digest binding to snapshot bytes, not a database parent key, persisted snapshot identity, or evidence of existence. The scope identity is an independent syntactic logical scope key. Neither is resolved here. The digest is not recomputed by this contract. Any later runtime binding must recompute the existing codec digest over the canonical envelope bytes and compare the exact scope identity; it must not infer either expectation from the manifest.

A future seal may bind the exact manifest/profile version, snapshot format/digest, scope identity, member count, and ordered canonical member material (including each ordinal and family-specific reference). This slice defines no canonical manifest byte profile, preimage, digest, or seal. Even a future hash-bound complete declared set cannot prove that the producer listed all necessary parents, that a parent exists, that its source identity or content is true, that a family is authoritative, or that origins are independent.

## Authority, correction, rights, and production

The eight family tags and their reference shapes are inherited from the scope/provenance decision. Applied SEC event-document keys remain authority only within their SEC contract. The applied M5 mapping key remains its exact eight-column key including `source_lineage_id`, scoped to M5. Issuer evidence, discovery source records, and normalized event claim/correction parents still lack applied event persistence in the parent decision; sibling source qualification checkpoints are not applied provenance. No parent table or foreign key is added or inferred here.

Authenticated family classification, correction/retraction completeness, origin independence, and any authority credit require a future trusted producer/resolver. An aggregator label cannot be upgraded to issuer/regulatory evidence by putting a family tag in the manifest. Parser success is not authenticity, approval, policy application, access authorization, or parent existence.

Correction, retraction, and supersession require a new immutable logical declaration and snapshot in any future runtime; they do not rewrite prior provenance. `historical` and `superseded` remain separate. This contract makes no current-selection decision. Reference and derived-payload retention/deletion/redistribution/commercial rights remain `NOT_APPROVED`; immutability does not resolve those approvals.

The scope/provenance production config and read-model loader remain blocked, active registries remain empty, approvals remain unapproved, authority upgrade remains unsupported, and signal/trading remain blocked. There is no builder, manifest codec/seal, resolver, binding verifier, runtime wiring, storage read, database/schema change, or dependency change in this contract.
