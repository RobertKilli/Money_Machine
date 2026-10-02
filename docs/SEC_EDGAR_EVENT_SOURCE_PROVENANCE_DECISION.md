# SEC EDGAR event source provenance decision

Contract: `sec-edgar-event-source-provenance-decision/v1`
Reviewed: 2026-10-02
Status: design only. No SQL, migration, acquisition, persistence, or production approval is authorized by this decision.

## Decision

Choose **Option C: a separate SEC event-document provenance authority**, provider-neutral in its content-byte identity and SEC-scoped through an explicit source-profile authority. It distinguishes source profile, filing identity/package revision, document artifact, package-document membership, request, attempt, receipt, and selected event-source lineage.

Reject **A (direct M5 SourceLineage reuse)**. Applied M5 lineage members require a retrieval-observed availability claim, source envelope, ingestion observation, attempt, provider/dataset/version scope, and `effective_available_at` equal to observation `retrieved_at`. The lineage seals those observation members; it has no filing package/index/document membership or SEC amendment-parent semantics. M5 artifacts hold provider identity and payload fingerprints, not canonical SEC document bytes. `provider_external_record_id` is an external label, not proof of SEC document identity. `market_observations` are asset measurements, not documents.

Reject **B (bridge over current M5 artifact material)**. A bridge is valid only if both immutable parent authorities independently bind the same bytes and exact document scope. Current M5 artifact/envelope rows do not persist canonical SEC bytes or package membership, so a bridge would assert byte equivalence without evidence.

## Applied-schema inventory

The source of truth is the tracked migration chain, especially `20260911000000_m3_intelligence_foundation.sql`, `20260916212845_m5_mapping_lineage.sql`, `20260917000051_m5_ingestion_provenance.sql`, `20260917012625_m5_source_lineage.sql`, `20260918181115_m5_mapping_source_lineage.sql`, `20260918234933_m5_provider_asset_identity.sql`, and `20260918215043_m5_raw_source_lineage.sql`. No applied migration is changed here.

| Existing object | Material and required parents | Market observation | Availability claim | Canonical SEC bytes / complete package membership / amendment relation | SEC reuse |
|---|---|---:|---:|---|---|
| `intelligence_ingestion_requests` | idempotency key, provider/dataset/version, request scope/fingerprint; FK `(dataset_id,provider_id,dataset_version)` | No | No | No / No / No | Explicit-bound operational request record only; not SEC profile authority |
| `intelligence_ingestion_attempts` | request ID, attempt number, attempt/parser contract material; request FKs | No | No | No / No / No | Explicit-bound operational attempt only |
| `intelligence_ingestion_events` | attempt, sequence, event kind/fingerprint; observation FK for `SOURCE_OBSERVED` | No | No | No / No / lifecycle events only | Not filing amendment lineage |
| `intelligence_source_artifacts` | provider/dataset/version, namespace, external record/revision, payload/artifact fingerprints; dataset FK | No | No | No (hash only) / No / No | Not SEC document authority; bridge is invalid without byte authority |
| `intelligence_source_envelopes` | artifact, parser/schema, normalized JSONB and fingerprints; artifact+payload FK | No | No | No (normalized JSON) / No / No | Not a byte-preserving document package |
| `intelligence_ingestion_source_observations` | attempt, artifact, page/item ordinals, retrieved time and fingerprint; attempt/artifact FKs | No | No | No / No / No | Receipt fact only if explicitly bound |
| `intelligence_source_availability_claims` | envelope, observation, artifact, retrieval-observed basis/effective time and fingerprint | No | Yes by contract | No / No / No | Not issuer publication authority |
| `intelligence_source_lineages` | provider/dataset/version, claim IDs/count, time bounds and fingerprint; dataset FK | No | Yes through members | No / No / conditional observed set | Invalid as SEC document lineage |
| `intelligence_source_lineage_members` | PK `(source_lineage_id,member_ordinal)`; unique `(source_lineage_id,availability_claim_id)`; scoped FKs to lineage, claim, artifact, envelope, observation and attempt | No | Yes | No / No / no filing amendment semantics | Invalid as SEC package/document membership |
| `intelligence_asset_mapping_revisions` | mapping revision and its own M5 lineage/scope, canonical asset/identifier/class | No | Yes through M5 lineage | No / No / mapping revisions only | Invalid for SEC provenance; remains sole canonical asset authority |
| `market_observations` | provider/dataset, external ID, asset, observed time, numeric value/scale/unit and fingerprint | Yes | No | No / No / No | Invalid for SEC provenance |

Applied parent keys used for review: datasets have PK `(dataset_id)` and non-partial unique `(dataset_id,provider_id,dataset_version)`; source artifacts have unique `(source_artifact_id,payload_fingerprint)` and `(source_artifact_id,provider_id,dataset_id,dataset_version)`; SourceLineage has unique `(source_lineage_id,provider_id,dataset_id,dataset_version)`; SourceLineage members have PK `(source_lineage_id,member_ordinal)` and unique `(source_lineage_id,availability_claim_id)`; asset mapping has the full unique `(mapping_revision_id,source_lineage_id,provider_id,dataset_id,dataset_version,canonical_asset_id,canonical_identifier,asset_class)`. No fingerprint-bearing parent key is inferred where the migrations do not define one.

## Profile scope and persistence classification

The existing provider/dataset registry is not assumed to be a generic SEC endpoint/profile authority. Its applied rows do not pin the exact SEC host/path/method, supported forms, request identity, response limits, or content-encoding policy. Option C uses a separate versioned `sec_event_source_profiles` authority. Its fingerprint binds source/provider ID, dataset/profile ID and version, source contract/parser versions, endpoint/host/path/method profile, forms, request identity and resource/content rules. It is not a new asset registry. No profile row is created here.

| Object | Classification | Reason |
|---|---|---|
| SEC source profile | Persisted authority, currently blocked | Exact reviewed profile parent and fingerprint; not an M5 dataset alias |
| Filing identity | Persisted | Profile + CIK + accession + form and exact amendment parent |
| Acquisition request | Persisted | Exact requested identity/profile and request fingerprint |
| Acquisition attempt | Persisted | Append-only attempt identity; retries never replace prior attempts |
| Filing package revision | Persisted | Filing metadata, index artifact and package fingerprint |
| Document artifact | Persisted authority, currently blocked | Exact source bytes/hash and scoped document descriptor |
| Package-document membership | Persisted | Complete filing-index-declared set, distinct from selected evidence |
| Acquisition receipt | Persisted | Request/attempt, response material, retrieved time and effective availability |
| Event-source lineage and members | Persisted | Selected evidence set may span original and amendment package revisions |
| Publication/report-period projections | Derived | Values come from immutable filing metadata; not another authority |
| Normalized/mapped claims | Derived here | Produced from artifacts and separate issuer/asset authorities |
| Availability projection | Derived | Retrieval/effective availability stays on receipt; filing publication stays on filing metadata |
| Corroboration eligibility | Ephemeral | Recomputed at explicit `evaluationAsOf` |
| M5 market observations as SEC evidence | Rejected | Market values are not filing/document evidence |

M5 request/attempt rows can be operational audit inputs only after a separately reviewed adapter binding. This decision does not reuse them as SEC source/profile authorities because their JSON request scope does not structurally establish the SEC profile contract.

## Identity and exact byte boundary

V1 hashes a defined byte layer, not a JavaScript string:

1. The future acquisition adapter requests `Accept-Encoding: identity`; it rejects a response with any `Content-Encoding` other than absent or `identity`.
2. Hash the exact HTTP entity-body octets after transfer framing removal and before content decoding, charset decoding, newline handling, HTML parsing or Unicode normalization. Compressed/content-coded representations are rejected in v1, never silently decompressed.
3. Store the byte length of those exact octets and lowercase SHA-256 of those octets. A fingerprint string is not a substitute for the bytes.
4. Text extraction is derived only: UTF-8 is required by the pinned profile and decoded with fatal errors. CR/LF/CRLF and Unicode code points are not normalized. Extracted text never replaces document-byte authority.

The contract defines these acyclic formulas:

- `filingIdentityId`: hash of source-profile ID/fingerprint, CIK, canonical accession and form.
- `documentArtifactId` and fingerprint: hash of filing identity, canonical locator, role/type/sequence, exact entity-body SHA-256, content type, byte length and canonicalization version. Receipt and final package fingerprint are excluded.
- `packageFingerprint`: hash of filing metadata, filing-index artifact identity, exact ordered document-member tuples, count and amendment-parent filing identity.
- `packageId`: hash of filing identity plus package fingerprint. Document artifacts reference the stable filing identity, not the package fingerprint, so no package→member→document hash cycle exists.
- receipt identity/fingerprint: request, attempt, endpoint/profile, response material, retrieved/effective availability and package revision. It is excluded from document identity.
- lineage identity/fingerprint: its own exact ordered references to package-document members. It is not the complete package member set.

An exhibit-only byte change gives the exhibit a new artifact identity and the containing package revision a new fingerprint/ID; an unchanged primary artifact remains stable. The package-document membership authority has exact count, contiguous zero-based ordinals, unique locators, one filing index and exactly one primary. It must reconcile missing, extra, duplicate and undeclared members against the bounded filing-index manifest. Amendment packages retain the original and point to the exact parent filing identity; same-profile/CIK, accession ordering, no fork/cycle and complete parents are deferred invariants.

Filing date (`date`), acceptance/publication timestamp, report period (`date`), event time, signing time, expected closing, completion and retrieval time remain separate. Receipt variation appends receipt provenance; it never supersedes the document/package by newest-wins.

**Bytes persistence and authoritative byte reread are BLOCKED.** No backend is selected here: not PostgreSQL `bytea`, Supabase Storage, or external object storage. A digest cannot reconstruct or reread bytes. Before artifact persistence is approved, a separately reviewed immutable content-addressed store must guarantee exact-octet put/get, stable identity, no overwrite, exact length/hash verification at authoritative reread, access controls, backup/recovery and approved retention/usage terms. Until then synthetic byte hashing is only a test; no artifact may be described as persistently authoritative.

## Separate downstream provenance roles

1. `event_source_provenance` binds claim → SEC source profile → filing identity/package revision → exact document artifact and package-member row → selected SEC event-source lineage member. It includes CIK/accession/form, document locator/role and extraction locator/hash. It never uses asset-mapping lineage.
2. `issuer_evidence_provenance` binds each issuer evidence member to typed source/artifact/lineage/member identity and contributes that structure to issuer-authority fingerprint. Generic `evidence.referenceId` is descriptive metadata only.
3. `asset_mapping_provenance` binds only the existing `AssetMappingRevision` and its exact M5 source-lineage/provider/dataset/version/canonical-asset key. Its parent fingerprint is reread from that immutable parent. It cannot satisfy either other provenance role.

Future child columns use separately named `event_source_*`, `issuer_evidence_*` and `mapping_*` fields. They do not share scope columns implicitly, and they do not duplicate a parent fingerprint unless an exact parent UNIQUE+FK structurally binds it. No parallel canonical asset authority is proposed.

## Future schema/security boundary

The TypeScript `authorityTables` descriptors list the future source-profile, filing identity, request, attempt, package revision, document artifact, package-document member, receipt, event-source lineage and lineage-member parent keys/FKs/index prefixes. Applied M5 parents are catalogued separately with their actual keys. Future FKs require exact key cardinality/order/type, non-partial parent PK/UNIQUE and child indexes beginning with FK columns. Names must be canonical PostgreSQL identifiers within 63 bytes.

Amendment-parent nullable branches require an explicit `IS TRUE` branch check: base 8-K has NULL parent; 8-K/A has one exact same-profile/same-CIK parent. Package and lineage parent/member writes require `DEFERRABLE INITIALLY DEFERRED` validation on both parent and member changes: exact sealed counts, ordinals, locator uniqueness, role constraints, complete package set, package/member binding, lineage scope, amendment order, no cycles/forks. Domain-invariant failures use sanitized SQLSTATE `23514`; native FK/unique/not-null failures retain `23503`/`23505`/`23502`.

All future public tables require RLS enabled, zero policies, privileges revoked from PUBLIC/anon/authenticated, immutable UPDATE/DELETE triggers and no view/client access path. Invariant functions are SECURITY INVOKER, use fixed `search_path = public, pg_temp`, and have EXECUTE revoked from PUBLIC/anon/authenticated. No SECURITY DEFINER is allowed.

## Contract and tests

`src/domain/intelligence/sec-edgar-event-source-provenance-decision.ts` provides the strict versioned decision, exact byte/artifact/package identity formulas, source profile decision, persisted/derived/ephemeral classification, future key/FK/index descriptors, deterministic material fingerprint excluding `recordedAt`, and deep-frozen canonical parsing. Its pure byte helper hashes exact input octets and performs no I/O. Unsafe object trees and noncanonical metadata fail closed.

Synthetic tests cover exact-byte changes, receipt-independent document identity, exhibit/package-only identity change, order-independent sealing, package membership rejection, amendment retention, M5 external-ID rejection, distinct issuer/asset/event provenance, exact applied key catalog and production-blocked status. They prove contract behavior only; not live SEC responses or byte-storage custody.

## Prerequisites before runtime can resume

- Approve and implement the immutable content-addressed byte backend and prove exact-byte readback/hash/length.
- Implement the trusted SEC profile/request/attempt/filing/package/document/membership/receipt/lineage boundary.
- Implement a trusted claim-to-SEC-document provenance witness; no M5 artifact-ID substitution.
- Give issuer evidence a structured, fingerprint-bound provenance contract; generic reference IDs remain non-authoritative.
- Reconcile the event persistence decision and any uncommitted runtime migration/application/UoW with the three independent provenance families and exact composite parents.
- Prove authentic synthetic application→UoW→PostgreSQL flow with separate SEC and asset-mapping lineages before any runtime write approval.
- Approve retention, access, redistribution and commercial-use terms separately.

The uncommitted persistence-runtime migration `20261001191840_event_intelligence_persistence.sql` is not in this review worktree, was not read from the original dirty worktree, and is **not approved**. Live SEC acquisition, byte/artifact storage, event-source lineage, issuer evidence, event authority, scheduler, signals and trading remain `BLOCKED`.

## Exact-byte backend decision

The previously blocked exact-byte backend is now a technical candidate decision: PostgreSQL `bytea`, immutable artifact manifest and package membership share one transaction; bounded readback rehash is required before authority commit and on every authoritative read. Supabase Storage and external object storage are not selected for v1 due to cross-service atomicity/recovery boundaries. This decision does not implement or approve persistence, acquisition, raw-byte storage, retention or usage. Production remains `BLOCKED_BACKEND_UNAPPROVED`. See [SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION.md](SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION.md).
