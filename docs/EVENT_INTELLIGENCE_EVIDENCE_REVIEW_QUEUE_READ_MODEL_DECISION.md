# Evidence review queue read-model decision

Decision contract: `event-intelligence-evidence-review-queue-read-model-decision/v1`
Parent: `feat/event-intelligence-evidence-review-queue-composition` at `2b8878bf343a90db12be0b0d167e01a79cfab58a`.
Status: `DECISION_ONLY_BLOCKED_UPSTREAM`. This is an architecture decision only; it adds no migration, repository, UoW, database configuration, or production wiring. The baseline audit remains blocked by `GHSA-vfj7-8cjw-p6xm`.

## Decision

Choose **C, immutable derived read-model snapshots**, as the intended v1 durable strategy after its blockers are resolved. This recommendation is not an active production selection: production config has `selectedStrategy: null` and `selectedBackend: null`. Snapshot persistence, read path, and current selection remain blocked; retention/deletion are not approved; authority upgrade is unsupported; signal/trading remain blocked. The existing `/intelligence/events/review` loader remains unchanged and returns the deterministic empty blocked view-model.

| Option | Decision | Money Machine consequence |
|---|---|---|
| A. Recompute on every UI read | Reject as the v1 read path; retain only as an explicit rebuild operation that writes a new snapshot. | New routing, queue, or view-model rules could silently change old displays. Historical rebuild also depends on retaining the exact upstream material and old code/config. It adds read latency and makes correction/retraction replay depend on upstream availability. |
| B. Persist routing/queue domain objects as authority | Reject. | Persistence cannot restore module-local WeakSet trust. Routing and queue results are derived review data and cannot become a parallel event authority. |
| C. Persist immutable derived snapshot | Recommend after blockers. | Store one bounded, canonical, safe parent view-model plus a typed provenance manifest and exact contract/cutoff pins. The row is a rebuildable read model only. |
| D. Ephemeral cache only | Insufficient for auditable history. | Invalidation, failover, or cache loss removes prior review context; it cannot preserve correction/retraction history. A cache may later accelerate reads from durable snapshots. |

## Material and authority layers

| Layer | Classification | Persistence decision |
|---|---|---|
| Source artifacts and claims | Authority only within a separately approved source-family contract | Keep authority and provenance in their own source-family storage. No source-body data is copied into this queue snapshot. |
| Issuer/asset mapping authorities | Separate mapping authority | Resolve and bind through exact approved mapping parents. Text, ticker, hostname, or a queue row cannot map. |
| Routing result | Derived, non-authoritative | Do not persist/reparse as an authenticated routing object. |
| Queue item/set | Derived, non-authoritative | Do not persist/reparse as an authenticated queue object. |
| Serializable view-model | Degraded presentation data | The only possible queue payload; exact parent schema, no domain identities or raw source material. |
| Persisted snapshot | Immutable derived read model | Never source, mapping, corroboration, event, signal, or trading authority. Parsing it creates no runtime trust. |
| Current selection | Presentation choice | No authority meaning, no separate pointer in v1, and no latest-without-scope read. |
| Human review outcome | Separate future contract | Not represented or implied here. |

No database row can restore a module-local brand, WeakSet membership, routing result, queue set, mapping authority, or event authority. A snapshot can only be validated as bytes and parsed into the public view-model schema.

## Snapshot identity and payload

Snapshot identity binds the exact snapshot, composition, routing-decision, queue, and view-model contract versions; routing decision fingerprint; `evaluationAsOf`; canonical candidate/member-set identity; source-family-typed provenance manifest; jurisdiction and resolved scope; correction/retraction context; degradation/blocker state; and exact safe-payload fingerprint.

`storedAt`, transaction time, read time, `recordedAt`, receipt-attempt ID, queue-projection time, and a current-selection result do not change snapshot identity. The proposed serializer is `event-review-view-model-canonical-json/v1`: one UTF-8 JSON value, no BOM or trailing newline; arrays retain sealed order; object keys sort by UTF-16 code-unit order; strings use JSON escaping with no Unicode normalization or newline conversion; only the view-model's JSON-safe values and finite safe integers are permitted. SHA-256 is computed over the exact canonical UTF-8 bytes. Reject duplicate keys and unsupported values. On read, enforce the 1 MiB cap before decode, decode fatal UTF-8, validate exact schema/version, hash the original bytes, reserialize and require byte-for-byte equality, then compare canonical identity, metadata and provenance. A digest cannot reconstruct payload bytes. The 1 MiB cap is a local design bound, not a provider or database limit.

The first design is one immutable snapshot parent row containing the complete payload and provenance manifest. There is no normalized member table in v1: the complete sealed view-model is one atomic payload. If members are normalized later, require parent-before-member order, exact count and digest, contiguous ordinals, child-side FK indexes, and deferred commit-time set sealing.

Identical replay at the same exact scope and identity may converge only after reread proves byte-for-byte and metadata equality. Same identity with different payload or provenance is a read-model conflict and rolls back. Hash equality alone is insufficient.

## History and current selection

Snapshots are append-only. Snapshot payload `UPDATE` and `DELETE` are forbidden in the design. A correction or retraction creates a new snapshot at a cutoff that includes the material; the earlier row remains. Future material is excluded from earlier `evaluationAsOf` snapshots. `historical` and `superseded` remain separate view-model dimensions. Policy upgrades create a new snapshot identity; old payloads are parsed only by their exact schema reader, otherwise they fail closed.

V1 has no persisted current pointer. A future read may derive a presentation-only latest-safe snapshot for one authenticated exact scope, explicit cutoff, and pinned contract fingerprint. Stale/cross-scope candidates, ambiguous ties, unresolved correction lineage, or a retraction that invalidates the selected current view block selection. The query is reconstructible from immutable rows and cannot hide older or retracted history.

## Proposed logical schema catalogue (not SQL)

One logical record is considered: `event_intelligence_evidence_review_queue_snapshots`.

| Descriptor | Proposed requirement |
|---|---|
| Primary identity | Opaque `snapshot_id`; exact derivation cannot be finalized until the existing authenticated scope key is selected. |
| Material | Snapshot/contract versions, routing decision version/fingerprint, explicit `evaluation_as_of`, candidate/member-set identity, typed provenance manifest bytes + digest + length, canonical safe payload bytes + digest + length, blocker/correction/retraction summary, and immutable `stored_at`. Never credentials, raw documents, raw source text, or runtime trust. |
| Uniqueness | `snapshot_id` primary key and unique exact-scope + snapshot identity. Exact reread uses `snapshot_id` then compares fingerprint and all canonical material; do not add redundant `(snapshot_id, snapshot_fingerprint)` uniqueness. Scope identity is a logical placeholder only; no existing parent key is selected or invented. |
| Foreign keys | None can yet be approved for the complete source portfolio. Do not invent an event, issuer, claim, correction-lineage, or scope parent. Future source-family references need exact family-specific composite FK branches and all-or-none nullable invariants. |
| Index | Exact-scope + `evaluation_as_of` + stable snapshot identity for deterministic read selection; only after the actual scope parent is established. |
| RLS/access | RLS enabled and forced; no anon/authenticated policies or grants; revoke all from PUBLIC/anon/authenticated; no view or browser service-role path. A narrowly scoped server repository role is unselected and needs a separate least-privilege review. |
| Mutation | Insert-only snapshot; reuse an immutable rejection trigger only after verifying its actual applied definition and grants. No `SECURITY DEFINER`. |

No child-member or current-pointer record is selected. Rebuild attempts/logging are also omitted until their scope, data-minimization, and retention requirements are approved.

### Applied-parent key reconciliation

The catalogue was checked against the complete tracked migration history in filename/applied order. It recognizes these existing keys, each for its narrow authority family:

- SEC source lineage: `sec_event_source_lineages(lineage_id, fingerprint)` from `20261002090638_sec_edgar_event_source_provenance.sql`.
- SEC document artifact: `sec_event_document_artifacts(artifact_id, fingerprint)` from that same migration.
- M5 dataset owner: `intelligence_datasets(dataset_id, provider_id, dataset_version)`, made a referenced unique key by `20260916212845_m5_mapping_lineage.sql`.
- M5 source lineage: `intelligence_source_lineages(source_lineage_id, provider_id, dataset_id, dataset_version)` from `20260917012625_m5_source_lineage.sql`.
- Final M5 asset mapping identity: `intelligence_asset_mapping_revisions(mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class)` from `20260918215043_m5_raw_source_lineage.sql`.
- Additional M5 assessment binding key: `intelligence_asset_mapping_revisions(mapping_revision_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class)` from `20260920161300_m5_suspicious_assessment_authority.sql`.

#### Applied M5 mapping migration review and correction

The table is created by `20260916212845_m5_mapping_lineage.sql` as `public.intelligence_asset_mapping_revisions`, with primary key `mapping_revision_id` and an initial seven-column `intelligence_asset_mapping_identity_key`. That migration also adds the dataset-owner FK and mapping lookup index, enables (but does not force) RLS, revokes table privileges from `anon` and `authenticated`, and adds an update/delete rejection trigger using `reject_intelligence_mutation()`.

Later migrations change the material schema. `20260918181115_m5_mapping_source_lineage.sql` adds non-null `source_lineage_id`, its nonblank check, a composite FK to `intelligence_source_lineages(source_lineage_id, provider_id, dataset_id, dataset_version)`, and an index. `20260918215043_m5_raw_source_lineage.sql` drops the initial seven-column identity constraint and replaces it with the eight-column `intelligence_asset_mapping_lineage_identity_key`; it also updates eligibility evidence FKs and replaces their mapping indexes. `20260918234933_m5_provider_asset_identity.sql` adds the non-null provider-asset identity assertion FK and index. `20260920161300_m5_suspicious_assessment_authority.sql` adds a separate seven-column `intelligence_asset_mapping_assessment_authority_key`; it does not drop the eight-column lineage key. No later tracked migration renames or drops these mapping keys.

The final mapping table has primary key `(mapping_revision_id)`; unique eight-column lineage identity above; additional unique seven-column assessment identity above; dataset-owner FK `(dataset_id, provider_id, dataset_version)`; source-lineage FK `(source_lineage_id, provider_id, dataset_id, dataset_version)`; and provider-asset assertion FK `(provider_asset_identity_assertion_id, provider_id, dataset_id, dataset_version, provider_asset_namespace, provider_asset_id)`. Relevant indexes are `intelligence_asset_mapping_lookup_idx`, `intelligence_asset_mapping_source_lineage_idx`, and `intelligence_asset_mapping_identity_assertion_idx`; unique constraints have their own backing btrees. These migrations enable but do not force RLS, define no policy for this table, revoke from `anon`/`authenticated` but not explicitly `PUBLIC`, and install the immutable update/delete trigger. This reports tracked migration text only; no live database state was inspected.

Final column set, with nullability: `mapping_revision_id` (PK, NOT NULL), `mapping_revision_version`, `provider_id`, `dataset_id`, `dataset_version`, `provider_asset_namespace`, `provider_asset_id`, `canonical_asset_id`, `canonical_identifier`, `asset_class`, `valid_from`, `observed_at`, `available_at`, `source_record_ids`, `payload_fingerprint`, `fingerprint`, `source_lineage_id`, and `provider_asset_identity_assertion_id` are NOT NULL; `valid_to` is nullable. `recorded_at` is NOT NULL with default `now()`. The table retains nonblank checks, namespace/ticker exclusion, valid interval and observed/available chronology, JSON-array source-record check, and nonempty fingerprint checks. FK targets are `intelligence_providers(provider_id)`, `intelligence_datasets(dataset_id, provider_id, dataset_version)`, `intelligence_source_lineages(source_lineage_id, provider_id, dataset_id, dataset_version)`, and `intelligence_provider_asset_identity_assertions(provider_asset_identity_assertion_id, provider_id, dataset_id, dataset_version, provider_source_namespace, provider_asset_id)`; all use `ON DELETE RESTRICT` where declared.

On the referencing side, eligibility evidence mapping indexes are replaced in `20260918215043_m5_raw_source_lineage.sql` by the matching eight-column ordered indexes. The later `eligibility_suspicious_assessments_mapping_idx` starts `(mapping_revision_id, source_lineage_id, ...)`, which does not match its seven-column `eligibility_suspicious_assessments_mapping_fk` order; no later tracked migration adds a matching child index. This is a performance/schema-maintenance observation, not a missing parent key and not a read-model FK proposal. No key catalog entry is inferred for issuer, claim, correction, or read-model provenance.

The prior read-model report's claim that `source_lineage_id` was absent is **D — the new decision misinterpreted applied schema**. The existing event-persistence descriptor's eight-column mapping tuple is supported by later applied history and does not need reconciliation for this reason. The error is corrected in this decision and its key catalogue. Independent blockers below remain.

These keys do not form one shared provenance scope. M5 `source_record_ids` is JSON metadata, not an FK to event claims. The tracked chain contains no read-model snapshot table, `event_issuer_mapping_authorities`, event claims/correction-lineage parents, or approved event-intelligence scope parent. The M5 asset mapping key establishes only M5 asset-mapping provenance; it cannot substitute for issuer evidence or event-claim/correction parents.

Required provenance branches remain separate: SEC event-source document/lineage provenance; issuer evidence provenance; asset mapping provenance; discovery-source provenance; and derived queue snapshot provenance. A generic `referenceId` is not a provenance witness. Missing source-family parents block the whole snapshot; they are not replaced by a guessed key, URL, source label, or free-text ID.

## Write and read protocols

Future write protocol, only after separate approval:

1. Validate the complete trusted composition and safe view-model before entering a UoW; freeze one exact cutoff and policy revision.
2. Resolve exact source-family provenance parents and scope under their own contracts.
3. Canonicalize and bound the complete payload/manifest; compute byte lengths and digests over exact bytes.
4. Insert the immutable snapshot parent using exact identity; no write to event authority in this UoW.
5. On identity conflict, reread in a new statement snapshot and compare all metadata and bytes. Exact equality is idempotent replay; any difference aborts.
6. Commit only after complete reread and validation. Any timeout, deadlock, serialization error, FK mismatch, digest conflict, or schema mismatch rolls back. No internal retries; a later explicit call resolves an unknown outcome by exact lookup.

The design candidate is PostgreSQL `READ COMMITTED` with unique constraints as the arbitration point; verify that choice on an approved local PostgreSQL runtime before implementation. With one row there is no member lock; resolve immutable provenance parents in a fixed family order and binary canonical identity order, and write none of those families in this UoW. Bound statement/transaction duration. Timeout or cancellation rolls back; an unknown commit outcome is resolved by a later explicit exact-identity lookup, with no internal retry. There is no member-set sealing for the single-row v1 design. A normalized-child variant would require a separate concurrency review and deferred seal. There is no mutable current pointer or write-side current-selection race because selection is derived.

Future read path: exact authenticated scope and requested cutoff → explicit matching snapshot → bounded exact row/payload/manifest validation → recompute byte digests → authoritative reread and canonical-material comparison → exact schema/version parse and cutoff/provenance checks → return only the safe parent view-model. Unknown schema, partial data, invalid digest, unavailable parent, future evidence, or unresolved correction returns the deterministic blocked model with sanitized reasons. No repair, fixture fallback, partial items, or trusted domain reconstruction.

## Security, rights, and blockers

Future tables require RLS enabled/forced, no client policies, revoked client/public privileges, no browser service-role credentials, server-only repository access, immutable rows, bounded payloads, and sanitized logs. RLS alone does not protect against BYPASSRLS/service-role access; no such credential or bypass grant is approved. Database functions are unnecessary in the single-row design; any future function must be `SECURITY INVOKER`, fixed `search_path`, least privilege, and have default execute grants revoked. No platform behavior or project grant has been verified by this design-only slice.

All are `NOT_APPROVED`: source-content and source-metadata storage, derived-candidate storage, queue-snapshot storage, UI-payload retention, backups/WAL/PITR, deletion/tombstone, redistribution, and commercial use. Rights for a source do not automatically approve derived snapshot storage. No legal conclusion is made.

Exact blockers before SQL/runtime: upstream issuer/source/claim persistence is unapproved; issuer mapping and event claim/correction parents are not applied; no approved event-intelligence access scope key exists; source-family-specific provenance FKs are incomplete; runtime/role/access model is unapproved; and source/derived storage, retention, deletion, backup, redistribution, and commercial-use approvals are absent. The M5 `source_lineage_id` mapping-key question is resolved by tracked migration history and is not a remaining blocker.

No SQL, migration, Docker, Supabase/PostgreSQL connection, database/Storage operation, live source call, credential, persistence runtime, scheduler, notification, signal, or trading operation was used. No final-SHA build is run while the baseline audit is blocked.
