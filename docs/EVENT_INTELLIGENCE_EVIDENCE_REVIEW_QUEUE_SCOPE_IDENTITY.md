# Evidence review queue scope identity

This slice implements an in-memory, server-only builder for the logical review-universe identity recommended by the [scope and provenance decision](EVENT_INTELLIGENCE_EVIDENCE_REVIEW_QUEUE_SNAPSHOT_SCOPE_PROVENANCE_DECISION.md). Parent is e38d69bc7ed93c7851f18a2199620e9a068554e7. This is syntactic identity calculation only: no active registry, policy resolver, approval, queue membership check, persistence, loader, UI, or composition wiring is added.

## Scope material v1

The exact closed fields are:

| Field | Meaning |
| --- | --- |
| scopeMaterialVersion | event-intelligence-evidence-review-queue-scope-material/v1 |
| canonicalizationProfile | event-intelligence-evidence-review-queue-scope-canonical-json/v1 |
| reviewPurposePolicyVersion, reviewPurpose | Fixed v1 purpose vocabulary: FORMAL_ISSUER_DISCLOSURE_REVIEW or CRYPTO_TREASURY_DISCLOSURE_REVIEW |
| jurisdictionUniverse | Non-empty semantic set of the existing US_SEC, GB_LSE, AU_ASX, UNLISTED, UNKNOWN, DUAL_LISTED routing labels |
| eventRepresentationUniverse | Non-empty semantic set of the existing event-hint vocabulary; COMPLETED_PURCHASE remains a candidate category |
| assetRepresentationUniverse | Non-empty set of lowercase asset-representation/v1/<slug> representation references; these are not asset IDs or mapping authority |
| issuerListingEligibilityPolicy | { policyId, version, canonicalMaterialDigest }, syntax-bounded policy reference |
| sourcePortfolioPolicy | Exact existing source-portfolio decision version plus a lowercase SHA-256-shaped claimed material digest |
| routingPolicy | { policyId, version, canonicalMaterialDigest }, syntax-bounded policy reference |
| queueContract | Exact existing evidence queue contract version plus a lowercase SHA-256-shaped claimed material digest |
| accessClassificationPolicyVersion, accessClassification | Fixed v1 vocabulary: INTERNAL_GENERAL or INTERNAL_RESTRICTED; no tenant or user authority is inferred |

Policy IDs use lowercase ASCII kebab form, policy versions use vN, and digests use exactly 64 lowercase hexadecimal characters. A digest is only a syntactic binding to claimed material. The builder does not load or verify that material, and no mutable display labels or arbitrary metadata are accepted. Representation and policy identities do not include concrete event, issuer, listing, asset, source-artifact, or provider-record IDs.

The fields intentionally exclude evaluationAsOf, receipt/stored time, UI filters, item counts, snapshot identity, payload digest, and snapshot-specific correction/retraction data. Changing any included canonical field changes the identity; reordering an input semantic set does not. Set duplicates and empty sets are rejected. No trim, case-fold, Unicode normalization, or silent deduplication is performed.

## Canonical profile and hash preimage

The local profile serializes the validated fixed-shape material as compact JSON UTF-8:

* Object keys are ordered by JavaScript UTF-16 code-unit comparison at every level.
* The three set-valued collections are validated unique and sorted by that same order. Their resulting array order is preserved.
* Strings use JSON string escaping on validated primitive strings. Unicode is not normalized; lone UTF-16 surrogates, control characters, and format characters are rejected.
* This profile contains no numeric fields. No whitespace or BOM is emitted.
* Strings are bounded to 256 UTF-16 code units (policy IDs to 96, versions to 16); each semantic set is non-empty and contains at most 64 unique members. The accepted schema has a fixed maximum depth of 6 and at most 256 traversed values. The complete canonical UTF-8 material is bounded to 16,384 bytes.

The exact-shape parser admits only the fixed object graph above, so unbounded nested input cannot reach canonicalization. Per-set checks happen before iteration and byte size is checked before returning success. These are in-memory structural bounds, not a streaming-memory guarantee.

Identity is eviqs1_ followed by lowercase hex SHA-256 of the exact bytes:

UTF8("event-intelligence-evidence-review-queue-snapshot-scope/v1\0") || canonicalScopeMaterialBytes

The returned canonicalBytes is a defensive but mutable byte copy; its digest describes bytes at calculation time. Mutating that returned copy cannot change the frozen canonical material or already returned identity. This is a local profile, not a claim of conformance to an external canonical-JSON standard.

## Meaning and limits

buildEvidenceReviewQueueScopeIdentity returns VALID_SYNTAX_ONLY; verifyEvidenceReviewQueueScopeIdentity validates the supplied material, recomputes the identity, and compares it exactly. Success proves only that this local identity matches the supplied syntactically valid material. It does not prove policy content, policy existence, approval, registry membership, applied configuration, source qualification, or that a queue was composed under the material.

Where a future registry or storage layer reuses an identity, it must compare canonical material as well as the digest and reject the same key paired with different material. This local builder has no registry or prior-material state with which to perform that collision check.

The snapshot codec is unchanged. Its eviqs1_ check remains a syntax-only check; this builder is not invoked by the codec and does not make scope material mandatory in the snapshot envelope. A calculated identity must not be represented as proof that an envelope or queue actually followed the named policies.

Scope remains distinct from snapshot, candidate, queue item, provenance, payload, storage-row, and future selection identity. No current-selection pointer, active scope/provenance registry, source family, persistence/read path, SQL/database, production loader/UI wiring, scheduler, notification, signal, or trading capability is introduced. Production remains blocked upstream; no source, rights, retention, or storage approval is implied.
