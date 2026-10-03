# Event intelligence persistence schema and UoW decision

Decision contract: `event-intelligence-persistence-decision/v1`
Reviewed: 2026-10-01
Status: design only; schema, migration, runtime and usage approvals are not approved.

### FK reconciliation (2026-10-01)

The original focused failure was `parses the versioned design and deeply freezes nested descriptors`: child `event_issuer_mapping_authorities`, FK `issuer_authority_lineage_fk`, child columns `(source_lineage_id,source_lineage_fingerprint)`, parent `intelligence_source_lineages`, referenced `(source_lineage_id,fingerprint)`. The applied migration declares only `(source_lineage_id,provider_id,dataset_id,dataset_version)` as a non-partial unique key. Root cause: **B — missing scope columns in the child FK**, not a missing parent key. The child now carries `provider_id`, `dataset_id`, and `dataset_version`; the FK references the existing four-column key in declared order. The event child schema does **not** store `source_lineage_fingerprint`; the immutable parent row is reread under lock and its fingerprint is used when constructing/verifying event material. This is not treated as a database constraint: the relational FK structurally binds lineage identity and scope, while the parent-owned fingerprint remains solely on the parent. The same rule applies to external `source_artifact_fingerprint` and `mapping_revision_fingerprint`: event child tables do not duplicate them; the immutable parent is read through its exact scoped FK. No redundant/fabricated UNIQUE was added. Validator matching still requires exact cardinality, ordered equality, known parent catalog and compatible types. `event_source_origins.origin_lineage_fk` follows the same corrected scope pattern.

## Decision

Use the existing M5 provenance graph and canonical `intelligence_asset_mapping_revisions` as the only source and cryptoasset authorities. Add one forward-only migration later for issuer authority, event mention binding, claims/corrections, source origins and issuer-disclosure authority. Do not add replacement artifact, envelope, observation, availability-claim, lineage or canonical asset registries. Persist immutable source-derived claims and final issuer-disclosure authority; derive policy evaluation before the write and keep it ephemeral unless a later audit requirement explicitly requires a separately pinned eligibility record. The only supported authority subject is `ISSUER_DISCLOSURE`. `EXTERNALLY_VERIFIED_EVENT_FACT` is unsupported.

The authority means only that the mapped issuer disclosed the bound claim in the bound material. It does not assert objective truth, transaction completion, external verification, or a trading signal.

## Existing-schema reuse inventory

| Existing object | Decision | Scope binding / caveat |
|---|---|---|
| `intelligence_datasets` | Reuse | Composite `(dataset_id, provider_id, dataset_version)` parent key. |
| `intelligence_ingestion_requests`, attempts/events | Reuse | Receipt and acquisition lifecycle only; receipt time is not content identity or event time. |
| `intelligence_source_artifacts` | Reuse | Bind artifact plus provider/dataset/version. No event-owned raw content copy. |
| `intelligence_source_envelopes` | Reuse | Bind envelope to artifact. |
| `intelligence_ingestion_source_observations` | Reuse | Bind observation, artifact and `retrieved_at`; retain receipt separately. |
| `intelligence_source_availability_claims` | Reuse | Bind claim ID, artifact, envelope, observation and `effective_available_at`. |
| `intelligence_source_lineages` and `_members` | Reuse | Sealed provenance and ordered members. Applied parent UNIQUE is `(source_lineage_id, provider_id, dataset_id, dataset_version)`; event rows do not copy its fingerprint. Resolve it from the immutable parent after the scoped FK and locked reread. Do not edit applied migrations. |
| `intelligence_provider_asset_identity_assertions` | Reuse | Candidate/provider identity evidence only, not event asset authority. |
| `intelligence_asset_mapping_revisions` | Reuse as sole canonical asset authority | Structured FK must bind mapping revision, lineage, provider/dataset/version, canonical asset ID/identifier and asset class. No parallel canonical registry. |
| Existing M5 authority/evidence parent-member patterns | Reuse as design precedent | Immutable parent + exact ordinal member set, RLS, no policies, mutation rejection, exact reread. Do not reinterpret M5 metrics as event authority. |
| SEC fixture package/raw fixture text | Do not persist here | Fixture grammar is synthetic; production acquisition/artifact storage remains a separate blocked decision. |
| New event artifact/envelope/observation/availability tables | Reject | Duplicate existing provenance authority. |
| New canonical asset registry | Reject | Dangerous parallel mapping authority. |

## Object persistence decision

| Object | Status | Authority / identity / replay |
|---|---|---|
| Issuer mapping authority | REQUIRED | Immutable authority revision; CIK + jurisdiction + regulator + legal entity; append-only supersession/revocation. |
| Event asset mention binding | REQUIRED | Non-authoritative binding to exact existing asset mapping revision and source claim locator. |
| Normalized event claim | REQUIRED | Immutable extraction result; content identity excludes receipt. |
| Mapped event claim | DERIVED | Reconstructed from claim + issuer authority + mention binding + canonical mapping revision. |
| Correction lineage | REQUIRED | Immutable sealed ordered membership; original and every amendment retained. |
| Source origin | REQUIRED | Content-origin family, not delivery path; receipt variants do not create origin. |
| Origin membership/syndication lineage | REQUIRED | Immutable sealed artifact/source-lineage membership with validated upstream edges. |
| Corroboration policy | DERIVED from versioned reviewed code/config | Exact policy version/fingerprint pinned into resulting authority. No writable policy table in first migration. |
| Eligibility evaluation | EPHEMERAL pre-write result | Deterministically re-evaluated inside UoW after authoritative reread; identity embedded in authority. |
| Issuer-disclosure event authority | REQUIRED | Immutable sealed authority parent; exact claim and origin members. |
| Authority claim members | REQUIRED | Ordered sealed set, exact count/fingerprint. |
| Authority origin members | REQUIRED | Ordered sealed set of validated independent origin groups. |

No application DML, seed, backfill or repair is part of the schema migration. Do not persist derived mapped claims or duplicate raw content.

## Proposed relational model

The strict decision descriptor in `src/domain/intelligence/event-intelligence-persistence-decision.ts` names eleven `public` tables. All primary keys are non-null text identity IDs; material SHA-256 values are lowercase `char(64)` checked against `^[a-f0-9]{64}$`. Timestamps are `timestamptz`; intervals require `effective_from < expires_at` when bounded. Financial values use `numeric(38,18)` with explicit scale/range checks and never float. `amount_value` is null only for `UNKNOWN`; currency nullability is explicitly tied to unknown-currency policy. `recorded_at` is excluded from material fingerprints. Index descriptors bind deterministic schema-unique index names within PostgreSQL's 63-byte identifier limit to ordered columns.

| Table | PK / natural uniqueness | Structured parent references and indexes | Sealed/deferred invariants |
|---|---|---|---|
| `event_issuer_mapping_authorities` | `authority_id`; named unique `(authority_id,fingerprint)` and scoped authority identity | SourceLineage exact `(source_lineage_id,provider_id,dataset_id,dataset_version)`; self-FK `(predecessor_authority_id,predecessor_fingerprint)`; indexes on scope/effective interval and predecessor | no conflicting active overlap; no cycles/forks; successor explicit; immutable |
| `event_issuer_mapping_evidence_members` | `(authority_id,member_ordinal)`; named unique authority/lineage member | authority fingerprint and SourceLineage member ordinal; child indexes unless PK/unique prefix covers them | contiguous ordinals, exact parent count/fingerprint |
| `event_asset_mention_bindings` | `binding_id`; named unique binding fingerprint and full claim/mapping/canonical scope | normalized claim identity+locator/candidate; source artifact/provider/dataset/version; SourceLineage member; existing canonical mapping revision full scope | source claim/artifact/locator/excerpt exact; validity and status; cannot change candidate meaning |
| `event_claims` | `claim_id`; unique `(claim_id,claim_fingerprint)`, `(event_candidate_id,claim_id)` | SourceLineage member; availability claim binds artifact/envelope/observation/effective time; correction parent within event candidate | immutable normalized claim only; issuer/asset mapping is derived through separate authority/binding joins; corrections do not overwrite; numeric/date/lifecycle checks |
| `event_correction_lineages` | `lineage_id`; named unique `(lineage_id,fingerprint)`, `(lineage_id,fingerprint,event_candidate_id)` and event/fingerprint | root and terminal claims scoped to event candidate | exact sealed member count; one root/terminal; no cycles/forks; explicit retraction/void terminal |
| `event_correction_lineage_members` | `(lineage_id,member_ordinal)`; unique lineage/claim and lineage/claim fingerprint | lineage parent fingerprint; claim fingerprint; previous parent claim | contiguous ordinals; exact parent set; same issuer/asset/event/lifecycle; ordinary correction cannot advance lifecycle |
| `event_source_origins` | `origin_id`; unique `(origin_id,fingerprint)` | SourceLineage `(source_lineage_id,provider_id,dataset_id,dataset_version)`; parent/root origin | root derived from validated lineage, not caller label; no cycles/forks/missing upstream |
| `event_source_origin_members` | `(origin_id,member_ordinal)`; unique origin/observation and artifact scope | origin fingerprint; availability claim full scope; observation+artifact+retrieved time; SourceLineage member | exact member count; receipt not part of origin content ID |
| `event_issuer_disclosure_authorities` | `authority_id`; unique fingerprint and event/asOf identity | issuer authority; exact selected claim/event; correction lineage; mention binding and existing mapping revision; policy/eligibility material pin | sealed exact claim/origin counts; subject constrained to `ISSUER_DISCLOSURE`; no external-fact subject |
| `event_authority_claim_members` | `(authority_id,member_ordinal)`; unique authority/claim/fingerprint | authority fingerprint and claim fingerprint | exact set, contiguous ordinals, unique current terminal |
| `event_authority_origin_members` | `(authority_id,member_ordinal)`; unique authority/origin and group-root/origin | authority fingerprint; origin fingerprint and validated root | exact set, contiguous ordinals; independent groups cannot be caller-labelled |

Every FK is covered by a child-side btree whose leading columns exactly follow the FK order. That support may be an explicitly declared index or the table's PK/UNIQUE index; no redundant index is added where a constraint index already covers the prefix. The descriptors enumerate indexes for scoped rereads; migration review must reconcile them against actual existing parent unique constraints. No SourceLineage fingerprint-and-scope UNIQUE is proposed: the existing provider/dataset/version composite FK pins its immutable row. Its fingerprint stays on the parent, is not copied to an event child, and is read from that parent under the transaction's authoritative lock/reread before material is fingerprinted. The same no-copy rule applies to source artifact and asset mapping revision fingerprints. Own proposed parent fingerprints (issuer authority, claims, correction lineage, origins and authority material) are bound by exact proposed UNIQUE+composite-FK pairs wherever child rows persist those fingerprints. FKs are exact composite constraints, never ID-only where scope exists. PostgreSQL names are materialized in the descriptor for every PK, UNIQUE constraint and index; each is ASCII, at most 63 bytes, deterministic, and globally collision-checked. The child-index check accepts a PK/UNIQUE backing btree when it covers the FK prefix and rejects missing/reversed prefixes.

### Checks and deferred invariants

Use ordinary `CHECK`, named `UNIQUE`, and composite `FOREIGN KEY` constraints for local shape and identity. Use `DEFERRABLE INITIALLY DEFERRED` constraint triggers only for cross-row invariants that cannot be expressed declaratively: sealed parent/member counts and ordered member digests; issuer authority temporal overlap and supersession cycles/forks; correction chain linearity and same event/issuer/asset scope; source-origin lineage cycles/forks; authority exact-set reread. Trigger validation is attached to writes on both parent and member tables so either side cannot leave an invalid commit-time set. Functions must be `SECURITY INVOKER`, use fixed `search_path = public, pg_temp`, fully qualify referenced objects, revoke EXECUTE from `PUBLIC`, `anon`, and `authenticated`, acquire rows in deterministic parent-before-member order, and raise SQLSTATE `23514` on invariant violation. They must not be `SECURITY DEFINER`. Existing `reject_intelligence_mutation()` is the immutable `BEFORE UPDATE OR DELETE` trigger precedent for every new table.

## Provenance FKs and query paths

Reconcile source identity against existing tables before claim persistence. Required tuples include:

- dataset: `(dataset_id, provider_id, dataset_version)`;
- artifact: `(source_artifact_id, provider_id, dataset_id, dataset_version)`;
- envelope: `(source_envelope_id, source_artifact_id)`;
- observation: `(source_observation_id, source_artifact_id, retrieved_at)`;
- availability claim: `(availability_claim_id, source_artifact_id, source_envelope_id, source_observation_id, effective_available_at)`;
- lineage member: `(source_lineage_id, member_ordinal)`;
- asset mapping: `(mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class)`.

The existing parent unique keys were verified by reading tracked migrations; any missing exact composite key is a forward-only migration prerequisite. The SourceLineage parent has no unique key containing its fingerprint; its FK pins the existing four-column provider/dataset scope. No child copy of that parent fingerprint is stored, so no FK pretending to bind it is needed. The immutable parent is locked/read for derived event material. No redundant parent UNIQUE is proposed. Its child covering index begins `(source_lineage_id,provider_id,dataset_id,dataset_version)` in that order. Other indexes support issuer as-of scope `(source_namespace,jurisdiction,regulator,cik,effective_from,authority_id)`; correction parent and event candidate; origin root/parent; authority event/as-of; uncovered child FK prefixes; and ordered member reads `(parent_id,member_ordinal)`. Avoid duplicate indexes where PK/unique indexes already cover the same prefix.

## UoW and concurrency decision

Use one transaction-scoped application service over a single `TransactionSql`; construct every repository from that transaction. Parsing, network/file access, SEC document extraction, LLM work and provider calls are forbidden inside the transaction.

Phase order:

1. Lock/reread existing source lineage, artifacts, availability and mapping rows.
2. Validate source lifecycle, issuer/asset mapping validity and exact `asOf`.
3. Insert/reread issuer authority and evidence members.
4. Insert/reread asset mention binding to the existing canonical mapping revision.
5. Insert/reread claims.
6. Insert/reread correction parent and ordered lineage members.
7. Insert/reread source origins and membership/syndication edges.
8. Evaluate policy only from authoritative rereads and exact sealed sets.
9. Keep eligibility ephemeral in this first design.
10. Insert/reread authority parent, then exact claim and origin members.
11. Reread sealed authority and all member rows; compare counts, ordinals, IDs and fingerprints.
12. Commit.

Use `SERIALIZABLE` for the initial UoW so overlapping as-of resolution and concurrent correction/origin/authority writes cannot rely on a stale read. The UoW does not retry serialization failures internally: SQLSTATE `40001`, deadlocks and lock timeouts propagate and roll back. A later idempotent command invocation can reread the committed identity; it is a new transaction, not mutation repair. Deterministic lock order: SourceLineage IDs sorted; issuer scope keys `(namespace,jurisdiction,regulator,CIK)` sorted; asset mapping revision IDs sorted; event candidate IDs sorted; source-origin root IDs sorted; correction lineage/claim IDs sorted; authority IDs sorted. Within each hierarchy, acquire parent locks before child/member locks. Concurrent identical replay can either complete as an exact reread or lose with a propagated serialization failure; it must never leave partial/duplicate rows. Concurrent conflicting material aborts. Do not use advisory locks in the first design; prove whether serializable predicates plus natural UNIQUE constraints are sufficient in local integration tests before considering a separately reviewed lock namespace.

`ON CONFLICT DO NOTHING` is permitted only for an exact declared natural/identity key, followed in the same transaction by rereading the authoritative parent and the complete ordered member set. Compare every material field and fingerprint; equality means idempotent replay, any difference is a domain conflict and rolls back. Do not treat a stored external-parent fingerprint as an FK: external immutable fingerprints are read from the referenced source/mapping parent after acquiring its row lock. Proposed event-owned fingerprints copied into their member rows use exact named parent UNIQUE keys and composite FKs. Transaction tests must cover both committed exact replay and the serialization-abort/reinvoke case for concurrent identical requests.

Every failure after any phase rolls the single transaction back. Future integration tests must check row counts from a fresh connection after rollback at issuer authority, mention binding, first claim, correction member, origin, eligibility decision point, authority parent and first authority member. Also test identical/conflicting concurrency, FK/scope mismatch, sealed-set/count mismatch, cycles/forks, expired/revoked mappings, policy mismatch and fabricated domain objects before UoW entry.

## RLS and migration decision

All new tables are in `public`, with RLS enabled, zero policies, explicit `REVOKE ALL ON TABLE ... FROM PUBLIC, anon, authenticated`, no public view and no client path. RLS does not replace privilege revocation. No client/service-role persistence path is introduced by this design. Existing immutable trigger is reused. No `SECURITY DEFINER` function. Deferred trigger functions, if approved, follow the invoker restrictions above and validate both parent and member writes at commit.

The strict decision value now includes, per table, RLS/policy posture, privilege/view posture, the existing immutable trigger identity/security/search path, and a false `securityDefiner` marker. The applied definition of `public.reject_intelligence_mutation()` is a trigger function with fixed `search_path = public` (migration `20260911000000_m3_intelligence_foundation.sql`); the descriptor reflects that existing source rather than claiming it has `pg_temp`. The separate future deferred-trigger policy pins `DEFERRABLE INITIALLY DEFERRED`, `SECURITY INVOKER`, fixed `public, pg_temp`, EXECUTE revokes for `PUBLIC`/`anon`/`authenticated`, SQLSTATE `23514`, parent-and-member validation, and deterministic parent-before-member locking. These are design requirements, not evidence of an installed event schema. Ordinary nullable-FK branches require explicit all-or-none/specific-root checks (e.g. predecessor id and fingerprint both NULL or both present); no nullable boolean may make an invariant unknown. For trigger predicates use `IS TRUE` and reject NULL results.

The Supabase CLI is not installed and is not pinned in this repository; there is no `supabase/config.toml`. Therefore `supabase --help`, migration/reset/lint/advisors CLI help and local PostgreSQL-version verification were unavailable and were not run. No CLI upgrade/install or project linking was performed.

Official documentation checked 2026-10-01:

- DOCUMENTED — [Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-migration-list), “Supabase CLI”: migration commands are local tooling; this repo has no installed CLI to inspect.
- DOCUMENTED — [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations), “Database Migrations”: create a new migration with `supabase migration new <name>` and preserve migration history; future work must not edit already-applied files.
- DOCUMENTED — [Local development CLI workflows](https://supabase.com/docs/guides/local-development/cli-workflows), “Local development with the Supabase CLI”: `db reset` rebuilds local state and `--no-seed` skips seed data; linked/hosted flags are outside this plan.
- DOCUMENTED — [Testing and linting](https://supabase.com/docs/guides/local-development/cli/testing-and-linting), “Testing and linting”: local `db lint` and advisors are available workflow checks when CLI/local stack are approved.
- DOCUMENTED — [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) and [trigger behavior](https://www.postgresql.org/docs/current/trigger-definition.html): deferrable constraints and deferred constraint-trigger execution can check transaction-final state.
- DOCUMENTED — [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), “Row Level Security”: RLS/policies and table grants must be considered together; views can change RLS behavior. This design exposes no view or policy.
- UNKNOWN — current repo CLI version, local database version, hosted project version and platform-specific advisor output; none were queried.

Future migration sequence: (1) separately approve schema and local runtime; (2) `supabase migration new event_intelligence_persistence`; (3) one forward-only migration, adding only required parent unique constraints and the eleven event tables/triggers/FKs/indexes/RLS; (4) no seed/backfill/application DML; (5) validate complete chain on approved local PostgreSQL 17 runtime; (6) clean `db reset --local --no-seed`; (7) run dedicated truth-table tests and catalog assertions for PK/unique/FK order/index prefixes, RLS/grants/policies/functions/triggers; (8) `db lint --local` and local advisors; (9) separate review before any hosted push/deploy. This design task did not run any of those DB operations.

## Fail-closed production decision and blockers

`schemaApproved=false`, `migrationApproved=false`, `localRuntimeVerified=false`, `persistenceEnabled=false`, `issuerDisclosureAuthorityEnabled=false`; externally verified facts unsupported; scheduler/signal/trading blocked; registries empty; storage, retention, redistribution and commercial approvals not approved/unknown.

Before SQL implementation: install/pin an approved CLI/runtime decision; approve exact retention and use rights; validate missing parent composite unique keys; approve the relational model, deferred trigger semantics and lock/isolation contract; specify fixture-only transaction repository tests. Before enabling any write, separately review migration output, catalog and rollback/concurrency test evidence. No schema or runtime readiness is implied by this design.
# Provenance decision supersession (2026-10-02)

The prior schema/UoW decision's broad reuse of M5 SourceLineage for SEC event
documents is superseded by
[`SEC_EDGAR_EVENT_SOURCE_PROVENANCE_DECISION.md`](SEC_EDGAR_EVENT_SOURCE_PROVENANCE_DECISION.md).
Applied M5 lineages seal retrieval-availability/observation members and do not
establish canonical SEC document bytes, filing packages, or exhibits. A
future persistence runtime must bind three separately named families:
SEC event-source provenance; structured issuer-evidence provenance; and the
existing asset-mapping revision's own provenance. The existing canonical
asset mapping remains the sole asset authority. The uncommitted runtime
migration remains unapproved and must be reconciled before it can be run.
The SEC provenance decision also leaves exact document-byte persistence/readback blocked: no PostgreSQL bytea, Supabase Storage or object-store backend is selected. Package completeness members and selected event-source lineage members are separate authorities; M5 provider/dataset rows do not substitute for a reviewed SEC profile.

## SEC exact-byte storage boundary

SEC document `bytea`, immutable manifest and package membership are selected as a technical first-version candidate so a single PostgreSQL transaction can reread/hash bytes and atomically commit authority. Storage remains a separate design-only decision: no migration/UoW/runtime implementation, raw-byte approval, retention approval or event persistence approval is granted. Production stays `BLOCKED_BACKEND_UNAPPROVED`. See [SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION.md](SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION.md).

## Evidence queue read-model schema review correction

The child read-model decision `event-intelligence-evidence-review-queue-read-model-decision/v1` is design-only and recommends immutable derived view-model snapshots only after separate upstream, scope, rights, and retention approvals. Its first review incorrectly stopped at `20260916212845_m5_mapping_lineage.sql` and said the applied M5 mapping key lacked `source_lineage_id`. Later tracked migrations add that column/FK in `20260918181115_m5_mapping_source_lineage.sql`, replace the initial key with the eight-column lineage identity in `20260918215043_m5_raw_source_lineage.sql`, and add a separate seven-column assessment key in `20260920161300_m5_suspicious_assessment_authority.sql`. The existing eight-column mapping descriptor is supported by applied history. This corrects the read-model report; no child read-model or event-authority FK is inferred from the M5 key.
# Queue snapshot provenance scope

The queue snapshot child decision separates explicit review-universe scope from per-snapshot typed provenance. SEC and M5 asset-mapping keys are applied only within their own authority families; issuer-evidence, event-claim/correction and discovery source-record parents are absent from applied migrations. No queue FK or storage approval follows from the catalog. See [scope/provenance decision](EVENT_INTELLIGENCE_EVIDENCE_REVIEW_QUEUE_SNAPSHOT_SCOPE_PROVENANCE_DECISION.md).
