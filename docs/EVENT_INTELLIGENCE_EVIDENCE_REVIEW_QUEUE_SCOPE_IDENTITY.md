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
| sourcePortfolioPolicy | Exact { contractVersion, canonicalMaterialDigest }; contractVersion is event-intelligence-source-portfolio-routing-decision/v1 |
| routingPolicy | { policyId, version, canonicalMaterialDigest }, syntax-bounded policy reference |
| queueContract | Exact { contractVersion, canonicalMaterialDigest }; contractVersion is event-intelligence-evidence-review-queue-contract/v1 |
| accessClassificationPolicyVersion, accessClassification | Fixed v1 vocabulary: INTERNAL_GENERAL or INTERNAL_RESTRICTED; no tenant or user authority is inferred |

Policy IDs use lowercase ASCII kebab form (start with a letter, then letters/digits and single hyphen-separated non-empty segments), at most 96 UTF-16 code units. Policy versions are v1 through v9999, with no leading zeros; the 16-unit structural version limit does not broaden that grammar. Digests use exactly 64 lowercase hexadecimal characters. Asset representation references are asset-representation/v1/ followed by non-empty lowercase ASCII letters/digits with single hyphen-separated segments. All accepted v1 strings are ASCII. Whitespace, case variants, Unicode and alternate separators reject rather than normalize.

A digest is only a syntactic binding to claimed material. The builder does not load or verify that material, and no mutable display labels or arbitrary metadata are accepted. Policy IDs and asset representation slugs have a bounded grammar, not an applied registry vocabulary: an unregistered but syntactically valid token can succeed. Success does not establish that a slug denotes a real representation or that a policy exists. There are no concrete event, issuer, listing, asset, source-artifact, or provider-record ID fields; callers must not substitute those IDs for policy or representation references. Material/profile, purpose-policy and access-policy versions are exact v1 literals; future versions reject.

The fields intentionally exclude evaluationAsOf, receipt/stored time, UI filters, item counts, snapshot identity, payload digest, and snapshot-specific correction/retraction data. Changing any included canonical field changes the identity; reordering an input semantic set does not. Set duplicates and empty sets are rejected. No trim, case-fold, Unicode normalization, or silent deduplication is performed.

The jurisdiction, event-representation and asset-representation collections express membership in a review universe, so each is a semantic set. They carry no priority or execution order. Ordered routing/source priorities remain inside separately referenced policy material; the builder neither reads nor reorders those policies. Issuer/listing eligibility is a policy reference, not a set of concrete issuer/listing IDs.

## Canonical profile and hash preimage

The local profile serializes the validated fixed-shape material as compact JSON UTF-8:

* Object keys are ordered by JavaScript UTF-16 code-unit comparison at every level.
* The three set-valued collections are validated unique and sorted by that same order. Their resulting array order is preserved.
* Strings use JSON string escaping on validated primitive strings. Unicode is not normalized; lone UTF-16 surrogates, control characters, and format characters are rejected.
* This profile contains no numeric fields. No whitespace or BOM is emitted.
* Strings are bounded to 256 UTF-16 code units (policy IDs to 96, versions structurally to 16 and grammatically to 5). Each semantic set is non-empty and contains at most 64 unique members; the closed jurisdiction/event vocabularies further limit those sets to 6/11.
* Exact own-property counts are 13 at the root, 3 in each issuer/listing or routing policy binding, and 2 in each source-portfolio or queue binding. Accepted keys are fixed ASCII literals, at most 33 code units; arbitrary keys are rejected by exact shape.
* The defensive canonical-tree gates are depth 6 (root depth 0) and 256 traversed values, counting each occurrence. The reachable v1 maximum is depth 2 and 105 values, including the root, arrays, objects and primitive members.
* The complete canonical UTF-8 material is bounded to 18,264 bytes, excluding the 59-byte domain prefix. This is the reachable v1 maximum, exercised with all jurisdiction/event members, 64 distinct 256-unit asset references, two 96-unit policy IDs and v9999. Its preimage is 18,323 bytes. Larger material necessarily violates an earlier schema/string/set gate; the byte/depth/node guards cannot independently overflow for otherwise valid v1 material.

The exact-shape parser admits only the fixed object graph above, so unbounded nested input cannot reach canonicalization. Per-set checks happen before iteration and byte size is checked after canonical string/UTF-8 allocation, before hashing or returning success. Reflect.ownKeys also allocates a key list before rejecting extra properties. These are in-memory structural bounds, not streaming, an allocation sandbox or a full sandbox against hostile Proxy objects.

Identity is eviqs1_ followed by lowercase hex SHA-256 of the exact bytes:

UTF8("event-intelligence-evidence-review-queue-snapshot-scope/v1\0") || canonicalScopeMaterialBytes

The separator is one actual 0x00 byte at prefix offset 58, not backslash plus zero. The material contains no result identity or self-digest, extra newline or BOM. Referenced policy digests are material fields. The independent golden fixture pins 1,378 literal material bytes and identity eviqs1_17c08dcdc0a332f4ea131e8e35305b6d1a741b39fe3b825c79e601cadeeb0659, plus an independent prefix/material hash binding. Its preimage is 1,437 bytes. Canonical serialization and existing codec wire/golden values are unchanged by the corrected input budget.

The result wrapper and copied canonical material, including every nested binding and array, are frozen. The returned canonicalBytes is a defensive but mutable byte copy; its identity and status describe bytes at calculation time, and an old status is not verification of subsequently edited bytes. Mutating that copy cannot change the frozen canonical material or already returned identity. Verification accepts material and identity, revalidates/recomputes them, and never trusts an earlier result/status object. This is a local profile, not a claim of conformance to an external canonical-JSON standard.

## Meaning and limits

buildEvidenceReviewQueueScopeIdentity returns VALID_SYNTAX_ONLY; verifyEvidenceReviewQueueScopeIdentity validates the supplied material, recomputes the identity, and compares it exactly. Success proves only that this local identity matches the supplied syntactically valid material. It does not prove policy content, policy existence, approval, registry membership, applied configuration, source qualification, or that a queue was composed under the material.

Validation reads own data descriptors and rejects accessors, symbols, unexpected non-enumerable properties, custom/null prototypes, sparse arrays and extra array properties without invoking getters, setters or toJSON. The closed schema rejects cycles at existing fields without a generic recursive walk of caller objects. Shared non-cyclic policy objects are accepted and cloned separately, with each material occurrence counted; shared references do not gain authority. Unknown/null/unsupported primitives and lone surrogates reject. __proto__, constructor and prototype are not allowed keys, and no caller key is assigned to the cloned material.

Failures are frozen bounded { status: "INVALID", code } objects only: SCOPE_MATERIAL_INVALID for shape, primitive, version, string/set or caught validation errors; SCOPE_MATERIAL_LIMIT_EXCEEDED for canonical-tree/byte guards; SCOPE_IDENTITY_INVALID for malformed supplied identity; SCOPE_IDENTITY_MISMATCH for a syntactically valid identity unequal to fresh computation. No raw input, caller string or stack trace is returned. Verification checks identity syntax before material. Success conveys no access authorization, correct universe membership, authentic composition, provenance, corroboration or event authority.

Where a future registry or storage layer reuses an identity, it must compare canonical material as well as the digest and reject the same key paired with different material. This local builder has no registry or prior-material state with which to perform that collision check.

The snapshot codec is unchanged. Its eviqs1_ check remains a syntax-only check; this builder is not invoked by the codec and does not make scope material mandatory in the snapshot envelope. A calculated identity must not be represented as proof that an envelope or queue actually followed the named policies.

Scope remains distinct from snapshot, candidate, queue item, provenance, payload, storage-row, and future selection identity. No current-selection pointer, active scope/provenance registry, source family, persistence/read path, SQL/database, production loader/UI wiring, scheduler, notification, signal, or trading capability is introduced. Production remains blocked upstream; no source, rights, retention, or storage approval is implied.
