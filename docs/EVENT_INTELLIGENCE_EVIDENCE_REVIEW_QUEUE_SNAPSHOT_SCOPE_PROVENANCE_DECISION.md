# Evidence review queue snapshot scope and provenance decision

Decision contract: `event-intelligence-evidence-review-queue-snapshot-scope-decision/v1`

Production config: `event-intelligence-evidence-review-queue-snapshot-scope-production/v1`
Stacked parent: `200b9e5cd1546de8c9cb8b720cc92dc80c61edff` on `feat/event-intelligence-evidence-review-queue-read-model-decision`.

## Decision

Recommend **D, an explicit versioned review-universe**, as the logical v1 scope. It binds review purpose, jurisdiction universe, event-category universe, asset-representation universe, issuer/listing eligibility, source-portfolio decision material, routing decision material, queue contract version, and access classification. This is a design recommendation only. No scope authority owner, persistence contract, backend, or production route is selected; the production config is blocked and its active registries are empty. This decision creates no tenant or user authority because the application has no such approved scope authority here.

| Model | Decision | Reason |
|---|---|---|
| A. One global queue | Reject for v1 | Encourages unscoped “latest,” mixes jurisdictions and access scopes, makes correction relationships and selection races ambiguous, and allows unbounded snapshots. |
| B. Jurisdiction scope | Insufficient alone | Does not resolve unlisted issuers, cross listings, unknown jurisdiction, multiple legal entities, or event scope spanning entities. A jurisdiction change must not silently move prior snapshots. |
| C. Source-portfolio/policy scope | Necessary but insufficient | Source and routing policy revisions must be pinned, but alone they omit purpose, issuer/listing eligibility, asset representation, event universe, and access classification. |
| D. Explicit review universe | Recommended logical model; blocked for runtime | Defines the intended review universe without deriving authority from database convenience. |

## Scope identity versus snapshot identity

Logical scope identity is domain-separated canonical material: `eviqs1_` plus lowercase SHA-256 over UTF-8 canonical scope material, with the domain prefix `event-intelligence-evidence-review-queue-snapshot-scope/v1\0`. Object keys use UTF-16 code-unit order; set-valued policy arrays are unique and canonically ordered before identity is computed. The digest is a lookup identity, not proof: the canonical scope material must be compared on identity reuse, and same identity with different material is a conflict. This is not candidate, snapshot, payload, row, source, or authority identity.

Each identity field is required and exact-shape. Empty-value defaults, implicit trimming/case folding, locale sorting, and Unicode normalization are forbidden. Policy/contract bindings use immutable version plus canonical material identity/fingerprint, not mutable display labels. Jurisdiction, event-category, asset-representation, and issuer/listing members are bounded closed canonical identifiers; duplicate members reject and set-like arrays sort in UTF-16 order. Unknown is represented only by the explicit `UNKNOWN`/`UNLISTED` policy token where permitted, never arbitrary caller text. Purpose and access classification must use separately versioned closed policies. These are future scope-contract invariants: this slice does not implement a scope hash resolver or scope authority.

Scope binds the exact contract version, purpose, jurisdiction/event/asset universes, issuer/listing policy, source portfolio and routing decision material, queue contract version, and access classification. A changed source portfolio, routing policy, universe, queue contract, or access classification creates a new scope identity. A presentation label or documentation-only edit does not. A new cutoff, receipt, snapshot item count, or correction/retraction is snapshot material and does not change scope identity.

UI status/priority/type filters, free-text search, visible historical/current subset, presentation sorting, and expanded/collapsed state are excluded. They cannot create scope authority or snapshot identity. Future multi-tenant scope requires a separate authenticated tenancy/ownership contract; it is not inferred here.

Snapshot identity separately binds the selected scope identity and exact canonical scope material, evaluation cutoff, candidate/member set, source-family provenance manifest, composition/routing/queue/view-model contract and material pins, correction/retraction context, blockers/degradation, and safe payload digest. Storage receipt, `storedAt`, transaction/read time, and current selection are excluded from snapshot identity. Scope and provenance are separate: source artifact IDs never enter scope identity, and scope cannot stand in for source provenance.

## Current selection

There is no persisted current pointer in v1. If a later design needs one, its logical key must bind exact scope identity, exact snapshot identity, selection-policy version, and `selectedAsOf`. It must be reconstructible, reject cross-scope or unsealed snapshots, and never be event authority. It cannot use a global latest query or UI filters, rewrite snapshot material, or hide corrected/retracted history. A filtered presentation is not current-selection authority.

## Closed provenance family catalog

References are a closed tagged union. Each family has its own reference shape; generic `referenceId` is not evidence or a foreign-key target.

The exported reference parser checks only exact syntax and bounded primitive/key shapes. It returns `VALID_SYNTAX_ONLY`; this is not a resolver and does not assert that a referenced parent exists, is applied, is current, or is authoritative. In particular, a caller-provided `family` tag is not proof of source type. A future trusted producer must bind allowed families to the authenticated candidate/source contract and reject both missing and extra families; that enforcement is not present in this decision slice and blocks production activation.

| Family | Classification | Boundary |
|---|---|---|
| `SEC_EVENT_DOCUMENT` | Applied persisted authority within the SEC source contract | Exact profile, filing, artifact/package/member, or lineage identity. Acquisition receipts describe retrieval/availability and do not replace document identity. |
| `ISSUER_EVIDENCE` | Proposed versioned reference syntax only; no approved applied event persistence | `event-intelligence-issuer-evidence/v1` is a proposed reference schema pin in this contract, not an applied issuer source/authority contract. Exact issuer evidence member and source-origin binding still need their own approved contract and parent. |
| `ASSET_MAPPING_REVISION` | Applied M5 mapping authority within M5 scope | Exact eight-column mapping revision key. This does not create an event-specific asset mapping bridge. ETH, WETH, native, wrapped, and bridged representations remain separate. |
| `DISCOVERY_SOURCE_RECORD` | Unsupported/unimplemented persistence | Source type plus local candidate/material variant; receipt metadata is separate and excluded from candidate material identity. No applied NewsAPI, GDELT, issuer-release, or exchange source-record parent is present. |
| `CORRECTION_LINEAGE` | Versioned domain design, no applied event claim/correction persistence | Complete ordered lineage and selected terminal claim as of cutoff; a headline, URL, or free-text ID cannot establish an edge. |
| `DERIVED_COMPOSITION` | Derived non-authoritative reference | Exact composition contract/material actually consumed. |
| `DERIVED_QUEUE_SET` | Derived non-authoritative reference | Exact sealed set and members at one cutoff. |
| `DERIVED_VIEW_MODEL` | Derived non-authoritative reference | Exact safe payload contract and bytes/digest; never domain trust. |

### Applied parent-key inventory

The tracked migration history, in filename order, contains these usable family-specific keys:

| Family/table | Applied key | Scope and limit |
|---|---|---|
| SEC `sec_event_source_profiles` | `(profile_id, fingerprint)` | SEC source profile only. |
| SEC `sec_event_filing_identities` | `(filing_identity_id, profile_id, profile_fingerprint, cik, accession_number, form)` | Filing/registrant/form under exact SEC profile. Other scoped uniques also exist. |
| SEC `sec_event_document_artifacts` | `(artifact_id, fingerprint)` | SEC document artifact; an additional exact filing/role/sequence/locator key binds package members. |
| SEC `sec_event_filing_packages` | `(package_id, fingerprint, filing_identity_id)` | Package scoped to filing; package membership has a deferred seal. |
| SEC `sec_event_package_document_members` | `(package_id, package_fingerprint, member_ordinal)` | Exact ordered package member with unique artifact/locator within package. |
| SEC `sec_event_acquisition_receipts` | `(receipt_id, package_id, package_fingerprint)` | Receipt and availability metadata only. |
| SEC `sec_event_source_lineages` | `(lineage_id, fingerprint)` | SEC profile lineage; not generic issuer/news lineage. |
| SEC `sec_event_source_lineage_members` | `(lineage_id, member_ordinal)` | Ordered lineage member; lineage is sealed separately. |
| M5 `intelligence_asset_mapping_revisions` | `(mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class)` | Final applied eight-column key after the later migration; M5 mapping only. |
| M5 `intelligence_source_lineages` | `(source_lineage_id, provider_id, dataset_id, dataset_version)` | M5 provider/dataset lineage only. |

The SEC keys are in `20261002090638_sec_edgar_event_source_provenance.sql`. It defines immutable source-family tables, RLS/revocation controls, and package/lineage sealing functions. Their existence does not approve queue storage or a queue foreign key. M5’s final mapping key is in `20260918215043_m5_raw_source_lineage.sql`; the source-lineage parent key is in `20260917012625_m5_source_lineage.sql`. Later M5 migrations add the provider-asset identity assertion relationship and a separate assessment-binding unique key without replacing the final eight-column lineage key. The adjacent `eligibility_suspicious_assessments_mapping_idx` ordering observation is not authorization to alter applied schema. This decision does not duplicate M5’s applied authority as a generic event mapping parent.

There is no applied `event_issuer_mapping_authorities`, normalized event claims/correction-lineage parent, or discovery-source-record parent in tracked migrations. Those remain design-only or unsupported. The issuer-mapping, claim, and correction descriptors in `EVENT_INTELLIGENCE_PERSISTENCE_SCHEMA_UOW_DECISION.md` are proposed design, not applied schema. No FK to any missing parent is proposed. SEC provenance, issuer evidence, M5 mapping provenance, discovery provenance, correction lineage, and derived snapshot provenance remain separate families; no cross-family edge is inferred.

## Snapshot members and origin policy

A future snapshot manifest binds the exact candidate material set consumed by composition: candidate/material identity, source-family tag, family-specific reference, material variant, separate receipt/availability reference, composition binding, queue-set binding, and view-model binding. Each child must bind the exact `snapshotIdentity` and scope of its parent. A normalized member design requires exact count, unique family/member identities, canonical order, dense ordinals, no missing/extra records, and deferred set sealing. Orphan members, cross-snapshot/scope references, payload-binding mismatch, and incomplete membership reject the entire snapshot. The seal proves only exact membership/count/order/digest consistency; it does not prove source identity, truth, authority, or independence. `seenFamilies` cannot widen the authenticated candidate’s allowed family set. Same identity with different canonical family material is a conflict.

The parent read-model decision remains the payload/readback requirement: bounded canonical UTF-8 JSON, SHA-256 over the exact bytes, fatal UTF-8 decode, exact version/schema validation, canonical reserialization and byte-for-byte reread comparison. A successful storage read or digest check cannot recreate WeakSet/module-local trust. This scope decision proposes no schema or seal runtime.

Provenance is not corroboration. Issuer IR and wire/exchange/aggregator copies of the same release, SEC RSS/submissions/document paths for one filing, correction members, and multiple locators do not automatically create independent origin groups. Asset mapping provenance and persistence of this snapshot are never factual origins. Discovery cannot be relabeled as filing, regulatory publication, or issuer authority.

The same family-specific reference may be reused in snapshots belonging to different approved review scopes; it is not duplicated authority or ownership. Provenance membership is per exact snapshot, while scope is the review universe. A reference cannot select a scope or act as its current-selection key.

Correction/retraction yields a new snapshot at a cutoff that includes the exact published material. Future material is excluded from earlier snapshots. Original provenance remains append-only; a retraction is terminal for the current view at that cutoff. Corrections do not create a new scope or independent origin, and supersession never mutates old snapshots. Historical and superseded remain separate dimensions.

## Rights, minimization, and blockers

Persist only typed references and bounded derived metadata by default. Do not copy raw article text, SEC bytes, full provider payloads, credentials, or errors into the queue snapshot. Reference storage, metadata, source content, derived payload, logs, backups/WAL/PITR, retention, deletion, redistribution, and commercial use require separate approvals. Every relevant approval remains `NOT_APPROVED`; an applied parent key is not storage permission.

Production config remains blocked: no selected scope or scope authority; active scope/provenance registries are empty; snapshot scope and provenance readiness, persistence, read path, and current selection are `BLOCKED`; authority upgrade is `UNSUPPORTED`; signal/trading are `BLOCKED`. Exact blockers include missing issuer-evidence, event-claim/correction, and discovery parent authorities; no approved scope owner/key, snapshot schema/runtime, rights, retention, or deletion approval. The read-model parent’s production loader remains empty and blocked.

This is a decision-only child of `200b9e5cd1546de8c9cb8b720cc92dc80c61edff`. It changes no SQL or database runtime. Synthetic contracts do not establish provider coverage, rights, or production behavior. The known baseline audit blocker GHSA-vfj7-8cjw-p6xm remains separate; final build/readiness is not authorized while it remains.
