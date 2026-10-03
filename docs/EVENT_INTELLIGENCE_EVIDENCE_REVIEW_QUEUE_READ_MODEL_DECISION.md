# Evidence review queue read-model decision

Decision contract: `event-intelligence-evidence-review-queue-read-model-decision/v1`  
Parent: `feat/event-intelligence-evidence-review-queue-composition` at `2b8878bf343a90db12be0b0d167e01a79cfab58a`.  
Status: `DECISION_ONLY_BLOCKED_UPSTREAM`. This is an architecture decision only; it adds no migration, repository, UoW, database configuration, or production wiring. The baseline audit remains blocked by `GHSA-vfj7-8cjw-p6xm`.

## Decision

Choose **C, immutable derived read-model snapshots**, as the intended v1 durable strategy after its blockers are resolved. Production stays blocked. The existing `/intelligence/events/review` loader remains unchanged and returns the deterministic empty blocked view-model.

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

`storedAt`, transaction time, read time, `recordedAt`, receipt-attempt ID, queue-projection time, and a current-selection result do not change snapshot identity. Payload digest is not a substitute for canonical bytes: retain and reread the bounded complete UTF-8 canonical JSON bytes for both the payload and provenance manifest. Proposed local cap is 1 MiB, not a provider or database limit.

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
| Uniqueness | Unique exact-scope + snapshot identity, plus `(snapshot_id, snapshot_fingerprint)` for exact reread. Scope key is unresolved; do not create a guessed `scope_id` parent. |
| Foreign keys | None can yet be approved for the complete source portfolio. Do not invent an event, issuer, claim, correction-lineage, or scope parent. Future source-family references need exact family-specific composite FK branches and all-or-none nullable invariants. |
| Index | Exact-scope + `evaluation_as_of` + stable snapshot identity for deterministic read selection; only after the actual scope parent is established. |
| RLS/access | RLS enabled and forced; no anon/authenticated policies or grants; revoke all from PUBLIC/anon/authenticated; no view or browser service-role path. A narrowly scoped server repository role is unselected and needs a separate least-privilege review. |
| Mutation | Insert-only snapshot; reuse an immutable rejection trigger only after verifying its actual applied definition and grants. No `SECURITY DEFINER`. |

No child-member or current-pointer record is selected. Rebuild attempts/logging are also omitted until their scope, data-minimization, and retention requirements are approved.

### Applied-parent key reconciliation

The catalogue was checked against the tracked migration chain in this parent. It recognizes only these existing keys, each for its narrow authority family:

- SEC source lineage: `sec_event_source_lineages(lineage_id, fingerprint)` from `20261002090638_sec_edgar_event_source_provenance.sql`.
- SEC document artifact: `sec_event_document_artifacts(artifact_id, fingerprint)` from that same migration.
- M5 asset mapping: `intelligence_asset_mapping_revisions(mapping_revision_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class)` from `20260916212845_m5_mapping_lineage.sql`.

These do not form one shared provenance scope. M5 `source_record_ids` is JSON metadata, not an FK to event claims. The tracked chain contains no read-model snapshot table, `event_issuer_mapping_authorities`, event claims/correction-lineage parents, or approved event-intelligence scope parent. The existing `event-intelligence-persistence-decision/v1` descriptor also assumes a mapping composite containing `source_lineage_id`; that column/key is absent from the applied M5 mapping table. Reconcile that unapproved descriptor before any schema work. This decision does not copy that assumed key into its catalog.

Required provenance branches remain separate: SEC event-source document/lineage provenance; issuer evidence provenance; asset mapping provenance; discovery-source provenance; and derived queue snapshot provenance. A generic `referenceId` is not a provenance witness. Missing source-family parents block the whole snapshot; they are not replaced by a guessed key, URL, source label, or free-text ID.

## Write and read protocols

Future write protocol, only after separate approval:

1. Validate the complete trusted composition and safe view-model before entering a UoW; freeze one exact cutoff and policy revision.
2. Resolve exact source-family provenance parents and scope under their own contracts.
3. Canonicalize and bound the complete payload/manifest; compute byte lengths and digests over exact bytes.
4. Insert the immutable snapshot parent using exact identity; no write to event authority in this UoW.
5. On identity conflict, reread in a new statement snapshot and compare all metadata and bytes. Exact equality is idempotent replay; any difference aborts.
6. Commit only after complete reread and validation. Any timeout, deadlock, serialization error, FK mismatch, digest conflict, or schema mismatch rolls back. No internal retries; a later explicit call resolves an unknown outcome by exact lookup.

The design candidate is PostgreSQL `READ COMMITTED` with unique constraints as the arbitration point; verify that choice on an approved local PostgreSQL runtime before implementation. There is no member-set sealing for the single-row v1 design. A normalized-child variant would require a separate concurrency/review and deferred seal. Read-time “current” races have no write pointer because selection is derived.

Future read path: exact authenticated scope and requested cutoff → explicit matching snapshot → bounded exact row/payload/manifest validation → recompute byte digests → authoritative reread and canonical-material comparison → exact schema/version parse and cutoff/provenance checks → return only the safe parent view-model. Unknown schema, partial data, invalid digest, unavailable parent, future evidence, or unresolved correction returns the deterministic blocked model with sanitized reasons. No repair, fixture fallback, partial items, or trusted domain reconstruction.

## Security, rights, and blockers

Future tables require RLS enabled/forced, no client policies, revoked client/public privileges, no browser service-role credentials, server-only repository access, immutable rows, bounded payloads, and sanitized logs. Database functions are unnecessary in the single-row design; any future function must be `SECURITY INVOKER`, fixed `search_path`, least privilege, and have default execute grants revoked. No platform behavior or project grant has been verified by this design-only slice.

All are `NOT_APPROVED`: source-content and source-metadata storage, derived-candidate storage, queue-snapshot storage, UI-payload retention, backups/WAL/PITR, deletion/tombstone, redistribution, and commercial use. Rights for a source do not automatically approve derived snapshot storage. No legal conclusion is made.

Exact blockers before SQL/runtime: upstream issuer/source/claim persistence is unapproved; issuer mapping and event claim/correction parents are not applied; no approved event-intelligence access scope key exists; source-family-specific provenance FKs are incomplete; the event persistence descriptor’s mapping key needs reconciliation; runtime/role/access model is unapproved; and source/derived storage, retention, deletion, backup, redistribution, and commercial-use approvals are absent.

No SQL, migration, Docker, Supabase/PostgreSQL connection, database/Storage operation, live source call, credential, persistence runtime, scheduler, notification, signal, or trading operation was used. No final-SHA build is run while the baseline audit is blocked.
