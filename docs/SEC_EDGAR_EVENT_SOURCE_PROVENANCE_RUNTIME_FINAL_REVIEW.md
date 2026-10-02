# SEC provenance runtime: independent final review

Review date: 2026-10-02. Baseline `52c51b91cb2b62b69adc702bae57342d6c4d843a`; review start `539843843fb1ff875cd6dec08bc879e6ab40ea18`. The initial scope had exactly the 15 reported files. All runtime code, migration, test code and documentation were inspected independently; previous PASS reports were not used as approval.

## Reproduced findings and fixes

| Severity | Finding | Evidence and correction |
|---|---|---|
| High | Exported raw-material batch factory issued runtime trust to arbitrary callers | Production construction now requires a same-runtime authenticated adapter object. Raw material/copies/proxies fail without property access. Adapter bytes and nested descriptors are private/frozen; getters return copies. Private constructor access exists only in Vitest compiler configuration and test declaration wiring. Public E2E uses the actual authenticated factory. |
| High | Amendment chronology omitted later package INSERTs | A child identity committed without its package, then an invalid child package committed under the old migration. New package deferred trigger checks chronology on either arrival. Root `FOR NO KEY UPDATE` serializes competing package validations and remains compatible with FK key-share locks. Controlled concurrent invalid parent/child packages produce one commit and one 23514 failure, without mixed rows. |
| High | Identical new receipts could conflict on an existing request | Controlled barriers reproduced `SEC_EVENT_ACQUISITION_ATTEMPT_AUTHORITY_CONFLICT` before the fix. Lock the request at authoritative reread before ordinal allocation. Both writers now converge with exactly one new attempt and receipt; no retry. |
| Medium | Copied package-member document type could contradict immutable artifact | A structurally valid mismatched member committed before the fix. Package seal now compares document type to the exact artifact parent; INSERT succeeds and COMMIT raises 23514 `SEC_EVENT_PACKAGE_UNSEALED`. |
| Medium | Lineage root/amendment chain could contradict filing authorities | Both wrong-root and wrong-chain records committed before the fix. Deferred seal now verifies the actual ordered chain, profile/CIK, original/amendment forms, parent edges, and selected filing membership. Invalid context raises 23514 `SEC_EVENT_LINEAGE_CONTEXT_INVALID`. Selected subsets remain valid. |
| Medium | Whole-table counts in production UoW were unbounded and did not establish authority | Remove eleven global `count(*)::int` scans. Authority verification remains exact key-scoped parent/column/material and ordered member rereads. Test count queries remain read-only test instrumentation. |
| Medium | Source-profile Proxy input could execute traps | Detect Proxy before prototype/property operations; targeted test proves zero traps. |
| Medium | Payload admission occurred after byte allocation, with no lease cleanup interface | Compute UTF-8 lengths and the payload bound before creating entity buffers. Optional worker reservation returns a lease released in application `finally` on parser/admission/UoW failures and success. Cancellation propagates the same Error. This is payload accounting, not a measured RSS cap; the authentic fixture parser additionally caps its source text package at 64 KiB. |
| Evidence | Immediate FK plus immutability was overstated as database cycle unreachability | Immediate FK checks can see both rows of one multi-row INSERT. New test constructs a two-node cycle without disabling anything; INSERT succeeds, deferred COMMIT rejects 23514 `SEC_EVENT_AMENDMENT_CYCLE`. Only the authenticated adapter/UoW protocol has `UNREACHABLE_BY_AUTHENTICATED_CONSTRUCTION`. |
| Medium | Cleanup failure could mask the original transaction error | Application cleanup now attempts close/release while preserving an existing transaction Error; targeted unit regression injects both cleanup failures. |
| Evidence | Generic negative helpers labeled stages without proving callback completion | INSERT helper asserts the callback did not finish; deferred helper asserts all INSERTs completed before COMMIT failure. |

The production constructor exports no raw-material trust issuer. Test compiler access is defined under `tests/helpers/` and enabled only in Vitest configs; its declaration adds no runtime export. No production path imports those helpers or virtual modules. The public fixture application, not the private constructor, establishes positive E2E trust. Deliberate raw-material negatives and persistence canaries use compiler access explicitly; they are not evidence of caller authority.

## Transaction, bytes and lifecycle

`READ COMMITTED`; local PostgreSQL 17 `transaction_timeout=120s` and `statement_timeout=120s`. Parent-before-member order: profile, filing, request (locked), attempt, sorted blobs, sorted artifacts, package, package members, receipt, lineage, lineage members. Deferred amendment validation locks its immutable root. No internal retry, update, repair or nested transaction is added. Errors from transaction phases propagate unchanged and roll back. SET LOCAL is transaction-scoped; it does not change a pooled session default.

Exact logical `bytea` readback is sequential, one blob per query. The application compares exact bytes, length and a recomputed incremental SHA-256; PostgreSQL does not compute SHA and no pgcrypto is added. Artifact/filing/package/receipt/lineage concrete columns and exact ordered member sets are reread. Immutable snapshots prevent caller mutation. Local bounds remain 8 MiB/document, 64 MiB/package including index, 32 non-index documents, and `2*sum + 4*max <= 96 MiB` payload admission. Driver buffering is bounded per document; no streaming API or physical TOAST-byte equality is claimed.

Replay leaves all counts unchanged. A later receipt appends only attempt/receipt rows, with stable blob/artifact/package/lineage identity. Amendments retain the original. Return values explicitly remain `SYNTHETIC_NON_AUTHORITATIVE`, `eventAuthorityEligible=false`, and contain no entity bytes. Production remains `BLOCKED_BACKEND_UNAPPROVED`; retention/deletion and live/storage/usage/persistence approvals are unchanged.

## Independent PostgreSQL catalog and local verification

A new disposable project `secprov-review-20261002` used CLI 2.117.0 and PostgreSQL 17.6 at loopback port 55839; only the database service was started. No env files or linked project. Full 37-migration resets were run from empty database, including a final reset after schema changes. Both final integration runs use that same database without a reset between them.

Catalog queried directly with psql, separately from Vitest assertions: **11 tables, 114 columns, 92/92 validated constraints, 16 immediate FKs, 9 deferred triggers, 5 invoker functions, 11 active immutable triggers, zero policies/views, zero uncovered FK prefixes, zero exact duplicate indexes**. The previous 91 constraints/8 triggers are superseded by the additional package-amendment constraint trigger. Existing descriptor-required composite keys overlap narrower keys intentionally; they are not duplicate index definitions. Actual ordered FK tuples, physical columns/types/nullability and required descriptor keys are also checked by the integration suite.

All new tables have RLS and no PUBLIC/anon/authenticated/service_role table access; all five functions have explicit `search_path=public, pg_temp`, no SECURITY DEFINER, and execute revoked for those roles. Existing `reject_intelligence_mutation()` remains separately reported as invoker with `search_path=public`; new SEC tables use `sec_event_reject_mutation()` instead. No baseline schema cleanup, view, seed/backfill, approval or provider wiring was added.

`migration list --local` matches all 37 filenames; its output column labeled remote is the explicitly selected local migration history. `db lint --local` found no schema errors. Advisors (`--local --level info`) show no new actionable finding: SEC has 11 intentional RLS/no-policy INFO and 5 unused-index INFO. Baseline findings remain 27 unindexed-FK INFO, 113 other unused-index INFO, 48 other RLS/no-policy INFO, and 2 duplicate-index WARN on old `intelligence_source_artifacts` and `intelligence_source_envelopes`.

## Review-run case evidence

Each table row comes from actual assertions and recorded errors. Application errors have no SQLSTATE. Map references below identify exact eleven-table count objects, not totals. Equal references prove full rollback; positive concurrency records show deliberate committed growth. Expected/factual error and stage are equal by assertion; deferred helpers also prove callback/INSERT completion.

| Run | Case | Stage | SQLSTATE / domain code | Authority | Before / after |
|---|---|---|---|---|---|
| 1 | concurrent amendment packages | COMMIT | `23514` | `sec_event_assert_amendment_parent` | R1 / R2 |
| 1 | review lineage root context | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R3 / R3 |
| 1 | review lineage chain context | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R4 / R4 |
| 1 | new identical receipt race | commit/reread | `verified commit` | `application / UoW` | R5 / R6 |
| 1 | review late amendment package | COMMIT | `23514` | `sec_event_assert_amendment_parent` | R7 / R7 |
| 1 | review member document type | COMMIT | `23514` | `sec_event_assert_package_seal` | R7 / R7 |
| 1 | review multi-row cycle | COMMIT | `23514` | `sec_event_assert_amendment_parent` | R7 / R7 |
| 1 | provider | AUTHORITATIVE_REREAD | `SEC_EVENT_SOURCE_PROFILE_AUTHORITY_CONFLICT` | `application / UoW` | R7 / R7 |
| 1 | endpoint profile | AUTHORITATIVE_REREAD | `SEC_EVENT_SOURCE_PROFILE_AUTHORITY_CONFLICT` | `application / UoW` | R7 / R7 |
| 1 | contract version | AUTHORITATIVE_REREAD | `SEC_EVENT_SOURCE_PROFILE_AUTHORITY_CONFLICT` | `application / UoW` | R7 / R7 |
| 1 | CIK | AUTHORITATIVE_REREAD | `SEC_EVENT_FILING_IDENTITY_AUTHORITY_CONFLICT` | `application / UoW` | R7 / R7 |
| 1 | accession | AUTHORITATIVE_REREAD | `SEC_EVENT_FILING_IDENTITY_AUTHORITY_CONFLICT` | `application / UoW` | R7 / R7 |
| 1 | form | AUTHORITATIVE_REREAD | `SEC_EVENT_FILING_IDENTITY_AUTHORITY_CONFLICT` | `application / UoW` | R7 / R7 |
| 1 | corrupt logical blob readback | AUTHORITATIVE_REREAD | `SEC_EVENT_BLOB_READBACK_MISMATCH` | `application / UoW` | R8 / R8 |
| 1 | amendment fork | INSERT | `23505` | `sec_event_filing_identities_amendment_parent_filing_identit_key` | R9 / R9 |
| 1 | blob | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | R10 / R10 |
| 1 | locator | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | R10 / R10 |
| 1 | document role | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | R10 / R10 |
| 1 | source profile | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | R11 / R11 |
| 1 | filing identity | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | R12 / R12 |
| 1 | artifact references unknown blob | INSERT | `23503` | `sec_event_document_artifacts_blob_id_content_sha256_byte_l_fkey` | R13 / R13 |
| 1 | artifact invalid role | INSERT | `23514` | `sec_event_document_artifacts_document_role_check` | R13 / R13 |
| 1 | artifact duplicate locator | INSERT | `23505` | `sec_event_document_artifacts_filing_identity_id_canonical_l_key` | R13 / R13 |
| 1 | package declared count low | COMMIT | `23514` | `sec_event_assert_package_seal` | R13 / R13 |
| 1 | package declared count high | COMMIT | `23514` | `sec_event_assert_package_seal` | R13 / R13 |
| 1 | package ordinal gap | COMMIT | `23514` | `sec_event_assert_package_seal` | R13 / R13 |
| 1 | package starts at wrong ordinal | COMMIT | `23514` | `sec_event_assert_package_seal` | R13 / R13 |
| 1 | package missing primary | COMMIT | `23514` | `sec_event_assert_package_seal` | R13 / R13 |
| 1 | package duplicate ordinal | INSERT | `23505` | `sec_event_package_document_members_pkey` | R14 / R14 |
| 1 | package extra member | COMMIT | `23514` | `sec_event_assert_package_seal` | R14 / R14 |
| 1 | package member from another filing | INSERT | `23503` | `sec_event_package_document_me_artifact_id_artifact_fingerp_fkey` | R15 / R15 |
| 1 | lineage declared count low | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R16 / R16 |
| 1 | lineage declared count high | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R16 / R16 |
| 1 | lineage missing member | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R16 / R16 |
| 1 | lineage extra member | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R16 / R16 |
| 1 | lineage ordinal gap | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R16 / R16 |
| 1 | lineage starts at wrong ordinal | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R16 / R16 |
| 1 | lineage duplicate ordinal | INSERT | `23505` | `sec_event_source_lineage_members_pkey` | R16 / R16 |
| 1 | lineage member from wrong source profile | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R16 / R16 |
| 1 | lineage references a package member that does not exist | INSERT | `23503` | `sec_event_source_lineage_memb_package_id_package_fingerpri_fkey` | R16 / R16 |
| 1 | empty bytea is forbidden | INSERT | `23514` | `sec_event_content_blobs_byte_length_limit` | R16 / R16 |
| 1 | uppercase digest is forbidden | INSERT | `23514` | `sec_event_content_blobs_sha256_canonical` | R16 / R16 |
| 1 | declared octet length mismatch is forbidden | INSERT | `23514` | `sec_event_content_blobs_octet_length_check` | R16 / R16 |
| 1 | blob null bytes | INSERT | `23502` | `entity_body` | R16 / R16 |
| 1 | blob null sha | INSERT | `23502` | `sha256` | R16 / R16 |
| 1 | blob null length | INSERT | `23502` | `byte_length` | R16 / R16 |
| 1 | blob blank sha | INSERT | `23514` | `sec_event_content_blobs_sha256_canonical` | R16 / R16 |
| 1 | blob uppercase sha | INSERT | `23514` | `sec_event_content_blobs_sha256_canonical` | R16 / R16 |
| 1 | blob malformed sha | INSERT | `23514` | `sec_event_content_blobs_sha256_canonical` | R16 / R16 |
| 1 | blob zero length | INSERT | `23514` | `sec_event_content_blobs_byte_length_limit` | R16 / R16 |
| 1 | blob negative length | INSERT | `23514` | `sec_event_content_blobs_byte_length_limit` | R16 / R16 |
| 1 | blob declared octet mismatch | INSERT | `23514` | `sec_event_content_blobs_octet_length_check` | R16 / R16 |
| 1 | blob address digest mismatch | INSERT | `23514` | `sec_event_content_blobs_address_check` | R16 / R16 |
| 1 | source profile NULL provider | INSERT | `23502` | `provider_id` | R16 / R16 |
| 1 | source profile blank provider | INSERT | `23514` | `sec_event_source_profiles_provider_id_canonical` | R16 / R16 |
| 1 | source profile whitespace provider | INSERT | `23514` | `sec_event_source_profiles_provider_id_canonical` | R16 / R16 |
| 1 | source profile blank endpoint profile | INSERT | `23514` | `sec_event_source_profiles_endpoint_profile_canonical` | R16 / R16 |
| 1 | source profile whitespace endpoint profile | INSERT | `23514` | `sec_event_source_profiles_endpoint_profile_canonical` | R16 / R16 |
| 1 | source profile blank contract version | INSERT | `23514` | `sec_event_source_profiles_contract_version_canonical` | R16 / R16 |
| 1 | source profile whitespace contract version | INSERT | `23514` | `sec_event_source_profiles_contract_version_canonical` | R16 / R16 |
| 1 | source profile blank dataset version | INSERT | `23514` | `sec_event_source_profiles_dataset_version_canonical` | R16 / R16 |
| 1 | source profile blank dataset id | INSERT | `23514` | `sec_event_source_profiles_dataset_id_canonical` | R16 / R16 |
| 1 | source profile blank profile id | INSERT | `23514` | `sec_event_source_profiles_profile_id_canonical` | R16 / R16 |
| 1 | source profile noncanonical profile id | INSERT | `23514` | `sec_event_source_profiles_profile_id_canonical` | R16 / R16 |
| 1 | filing unsupported form | INSERT | `23514` | `sec_event_filing_identities_form_check` | R16 / R16 |
| 1 | filing missing amendment parent | INSERT | `23503` | `sec_event_filing_identities_amendment_parent_filing_identi_fkey` | R16 / R16 |
| 1 | filing amendment parent cross-CIK | INSERT | `23503` | `sec_event_filing_identities_amendment_parent_filing_identi_fkey` | R16 / R16 |
| 1 | request references unknown filing identity | INSERT | `23503` | `sec_event_acquisition_request_filing_identity_id_profile_i_fkey` | R16 / R16 |
| 1 | attempt unknown request | INSERT | `23503` | `sec_event_acquisition_attempts_request_id_fkey` | R16 / R16 |
| 1 | duplicate attempt ordinal | INSERT | `23505` | `sec_event_acquisition_attempts_request_id_attempt_ordinal_key` | R16 / R16 |
| 1 | receipt attempt/request mismatch | INSERT | `23503` | `sec_event_acquisition_receipts_attempt_id_request_id_fkey` | R16 / R16 |
| 1 | receipt package/filing scope mismatch | INSERT | `23503` | `sec_event_acquisition_receipt_package_id_package_fingerpri_fkey` | R16 / R16 |
| 1 | request source profile fingerprint mismatch | INSERT | `23503` | `sec_event_acquisition_request_filing_identity_id_profile_i_fkey` | R16 / R16 |
| 1 | attempt starts before request | COMMIT | `23514` | `sec_event_assert_acquisition_chronology` | R16 / R16 |
| 1 | receipt retrieved before attempt | COMMIT | `23514` | `sec_event_assert_acquisition_chronology` | R16 / R16 |
| 1 | receipt unknown attempt | INSERT | `23503` | `sec_event_acquisition_receipts_attempt_id_request_id_fkey` | R16 / R16 |
| 1 | receipt unsupported content encoding | INSERT | `23514` | `sec_event_acquisition_receipts_content_encoding_check` | R16 / R16 |
| 1 | request | AUTHORITATIVE_REREAD | `SEC_EVENT_ACQUISITION_REQUEST_AUTHORITY_CONFLICT` | `application / UoW` | R16 / R16 |
| 1 | attempt | AUTHORITATIVE_REREAD | `SEC_EVENT_ACQUISITION_ATTEMPT_AUTHORITY_CONFLICT` | `application / UoW` | R16 / R16 |
| 1 | receipt | AUTHORITATIVE_REREAD | `SEC_EVENT_ACQUISITION_RECEIPT_AUTHORITY_CONFLICT` | `application / UoW` | R16 / R16 |
| 1 | public E2E/replay/later receipt | commit/reread | `verified commit` | `application / UoW` | R16 / R17 |
| 1 | spread | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R17 / R17 |
| 1 | JSON | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R17 / R17 |
| 1 | structured clone | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R17 / R17 |
| 1 | fabricated | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R17 / R17 |
| 1 | wrong profile | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R17 / R17 |
| 1 | wrong filing | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R17 / R17 |
| 1 | wrong package | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R17 / R17 |
| 1 | wrong lineage | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R17 / R17 |
| 1 | fixture mismatch | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R17 / R17 |
| 1 | wrong profile | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | R17 / R17 |
| 1 | wrong filing | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | R17 / R17 |
| 1 | locator traversal | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | R17 / R17 |
| 1 | unsupported encoding | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | R17 / R17 |
| 1 | document >8 MiB | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | R17 / R17 |
| 1 | package >64 MiB | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | R17 / R17 |
| 1 | worker budget >96 MiB within package limit | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | R17 / R17 |
| 1 | >32 documents | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | R17 / R17 |
| 1 | rollback REQUEST | REQUEST | `verified commit` | `application / UoW` | R17 / R17 |
| 1 | rollback REQUEST_ATTEMPT | REQUEST_ATTEMPT | `verified commit` | `application / UoW` | R17 / R17 |
| 1 | rollback BLOB_VERIFIED | BLOB_VERIFIED | `verified commit` | `application / UoW` | R17 / R17 |
| 1 | rollback DOCUMENT_ARTIFACTS | DOCUMENT_ARTIFACTS | `verified commit` | `application / UoW` | R17 / R17 |
| 1 | rollback PACKAGE_PARENT | PACKAGE_PARENT | `verified commit` | `application / UoW` | R17 / R17 |
| 1 | rollback PACKAGE_MEMBERS | PACKAGE_MEMBERS | `verified commit` | `application / UoW` | R17 / R17 |
| 1 | rollback RECEIPT | RECEIPT | `verified commit` | `application / UoW` | R17 / R17 |
| 1 | rollback LINEAGE_PARENT | LINEAGE_PARENT | `verified commit` | `application / UoW` | R17 / R17 |
| 1 | rollback LINEAGE_MEMBERS | LINEAGE_MEMBERS | `verified commit` | `application / UoW` | R17 / R17 |
| 1 | rollback BEFORE_COMMIT | BEFORE_COMMIT | `verified commit` | `application / UoW` | R17 / R17 |
| 1 | deferred COMMIT validation | COMMIT | `23514` | `sec_event_assert_acquisition_chronology` | R17 / R17 |
| 1 | injected infrastructure 57014 | BLOB_VERIFIED | `57014` | `application / UoW` | R17 / R17 |
| 1 | injected infrastructure 40001 | BLOB_VERIFIED | `40001` | `application / UoW` | R17 / R17 |
| 1 | injected infrastructure 40P01 | BLOB_VERIFIED | `40P01` | `application / UoW` | R17 / R17 |
| 1 | update sec_event_source_profiles | UPDATE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | delete sec_event_source_profiles | DELETE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | update sec_event_filing_identities | UPDATE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | delete sec_event_filing_identities | DELETE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | update sec_event_acquisition_requests | UPDATE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | delete sec_event_acquisition_requests | DELETE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | update sec_event_acquisition_attempts | UPDATE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | delete sec_event_acquisition_attempts | DELETE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | update sec_event_content_blobs | UPDATE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | delete sec_event_content_blobs | DELETE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | update sec_event_document_artifacts | UPDATE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | delete sec_event_document_artifacts | DELETE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | update sec_event_filing_packages | UPDATE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | delete sec_event_filing_packages | DELETE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | update sec_event_package_document_members | UPDATE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | delete sec_event_package_document_members | DELETE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | update sec_event_acquisition_receipts | UPDATE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | delete sec_event_acquisition_receipts | DELETE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | update sec_event_source_lineages | UPDATE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | delete sec_event_source_lineages | DELETE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | update sec_event_source_lineage_members | UPDATE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 1 | delete sec_event_source_lineage_members | DELETE | `55000` | `sec_event_reject_mutation` | R18 / R18 |
| 2 | concurrent amendment packages | COMMIT | `23514` | `sec_event_assert_amendment_parent` | R19 / R20 |
| 2 | review lineage root context | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R21 / R21 |
| 2 | review lineage chain context | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R22 / R22 |
| 2 | new identical receipt race | commit/reread | `verified commit` | `application / UoW` | R23 / R24 |
| 2 | review late amendment package | COMMIT | `23514` | `sec_event_assert_amendment_parent` | R25 / R25 |
| 2 | review member document type | COMMIT | `23514` | `sec_event_assert_package_seal` | R25 / R25 |
| 2 | review multi-row cycle | COMMIT | `23514` | `sec_event_assert_amendment_parent` | R25 / R25 |
| 2 | provider | AUTHORITATIVE_REREAD | `SEC_EVENT_SOURCE_PROFILE_AUTHORITY_CONFLICT` | `application / UoW` | R25 / R25 |
| 2 | endpoint profile | AUTHORITATIVE_REREAD | `SEC_EVENT_SOURCE_PROFILE_AUTHORITY_CONFLICT` | `application / UoW` | R25 / R25 |
| 2 | contract version | AUTHORITATIVE_REREAD | `SEC_EVENT_SOURCE_PROFILE_AUTHORITY_CONFLICT` | `application / UoW` | R25 / R25 |
| 2 | CIK | AUTHORITATIVE_REREAD | `SEC_EVENT_FILING_IDENTITY_AUTHORITY_CONFLICT` | `application / UoW` | R25 / R25 |
| 2 | accession | AUTHORITATIVE_REREAD | `SEC_EVENT_FILING_IDENTITY_AUTHORITY_CONFLICT` | `application / UoW` | R25 / R25 |
| 2 | form | AUTHORITATIVE_REREAD | `SEC_EVENT_FILING_IDENTITY_AUTHORITY_CONFLICT` | `application / UoW` | R25 / R25 |
| 2 | corrupt logical blob readback | AUTHORITATIVE_REREAD | `SEC_EVENT_BLOB_READBACK_MISMATCH` | `application / UoW` | R25 / R25 |
| 2 | amendment fork | INSERT | `23505` | `sec_event_filing_identities_amendment_parent_filing_identit_key` | R25 / R25 |
| 2 | blob | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | R26 / R26 |
| 2 | locator | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | R26 / R26 |
| 2 | document role | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | R26 / R26 |
| 2 | source profile | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | R27 / R27 |
| 2 | filing identity | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | R28 / R28 |
| 2 | artifact references unknown blob | INSERT | `23503` | `sec_event_document_artifacts_blob_id_content_sha256_byte_l_fkey` | R28 / R28 |
| 2 | artifact invalid role | INSERT | `23514` | `sec_event_document_artifacts_document_role_check` | R28 / R28 |
| 2 | artifact duplicate locator | INSERT | `23505` | `sec_event_document_artifacts_filing_identity_id_canonical_l_key` | R28 / R28 |
| 2 | package declared count low | COMMIT | `23514` | `sec_event_assert_package_seal` | R28 / R28 |
| 2 | package declared count high | COMMIT | `23514` | `sec_event_assert_package_seal` | R28 / R28 |
| 2 | package ordinal gap | COMMIT | `23514` | `sec_event_assert_package_seal` | R28 / R28 |
| 2 | package starts at wrong ordinal | COMMIT | `23514` | `sec_event_assert_package_seal` | R28 / R28 |
| 2 | package missing primary | COMMIT | `23514` | `sec_event_assert_package_seal` | R28 / R28 |
| 2 | package duplicate ordinal | INSERT | `23505` | `sec_event_package_document_members_pkey` | R28 / R28 |
| 2 | package extra member | COMMIT | `23514` | `sec_event_assert_package_seal` | R28 / R28 |
| 2 | package member from another filing | INSERT | `23503` | `sec_event_package_document_me_artifact_id_artifact_fingerp_fkey` | R28 / R28 |
| 2 | lineage declared count low | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R28 / R28 |
| 2 | lineage declared count high | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R28 / R28 |
| 2 | lineage missing member | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R28 / R28 |
| 2 | lineage extra member | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R28 / R28 |
| 2 | lineage ordinal gap | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R28 / R28 |
| 2 | lineage starts at wrong ordinal | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R28 / R28 |
| 2 | lineage duplicate ordinal | INSERT | `23505` | `sec_event_source_lineage_members_pkey` | R28 / R28 |
| 2 | lineage member from wrong source profile | COMMIT | `23514` | `sec_event_assert_lineage_seal` | R28 / R28 |
| 2 | lineage references a package member that does not exist | INSERT | `23503` | `sec_event_source_lineage_memb_package_id_package_fingerpri_fkey` | R28 / R28 |
| 2 | empty bytea is forbidden | INSERT | `23514` | `sec_event_content_blobs_byte_length_limit` | R28 / R28 |
| 2 | uppercase digest is forbidden | INSERT | `23514` | `sec_event_content_blobs_sha256_canonical` | R28 / R28 |
| 2 | declared octet length mismatch is forbidden | INSERT | `23514` | `sec_event_content_blobs_octet_length_check` | R28 / R28 |
| 2 | blob null bytes | INSERT | `23502` | `entity_body` | R28 / R28 |
| 2 | blob null sha | INSERT | `23502` | `sha256` | R28 / R28 |
| 2 | blob null length | INSERT | `23502` | `byte_length` | R28 / R28 |
| 2 | blob blank sha | INSERT | `23514` | `sec_event_content_blobs_sha256_canonical` | R28 / R28 |
| 2 | blob uppercase sha | INSERT | `23514` | `sec_event_content_blobs_sha256_canonical` | R28 / R28 |
| 2 | blob malformed sha | INSERT | `23514` | `sec_event_content_blobs_sha256_canonical` | R28 / R28 |
| 2 | blob zero length | INSERT | `23514` | `sec_event_content_blobs_byte_length_limit` | R28 / R28 |
| 2 | blob negative length | INSERT | `23514` | `sec_event_content_blobs_byte_length_limit` | R28 / R28 |
| 2 | blob declared octet mismatch | INSERT | `23514` | `sec_event_content_blobs_octet_length_check` | R28 / R28 |
| 2 | blob address digest mismatch | INSERT | `23514` | `sec_event_content_blobs_address_check` | R28 / R28 |
| 2 | source profile NULL provider | INSERT | `23502` | `provider_id` | R28 / R28 |
| 2 | source profile blank provider | INSERT | `23514` | `sec_event_source_profiles_provider_id_canonical` | R28 / R28 |
| 2 | source profile whitespace provider | INSERT | `23514` | `sec_event_source_profiles_provider_id_canonical` | R28 / R28 |
| 2 | source profile blank endpoint profile | INSERT | `23514` | `sec_event_source_profiles_endpoint_profile_canonical` | R28 / R28 |
| 2 | source profile whitespace endpoint profile | INSERT | `23514` | `sec_event_source_profiles_endpoint_profile_canonical` | R28 / R28 |
| 2 | source profile blank contract version | INSERT | `23514` | `sec_event_source_profiles_contract_version_canonical` | R28 / R28 |
| 2 | source profile whitespace contract version | INSERT | `23514` | `sec_event_source_profiles_contract_version_canonical` | R28 / R28 |
| 2 | source profile blank dataset version | INSERT | `23514` | `sec_event_source_profiles_dataset_version_canonical` | R28 / R28 |
| 2 | source profile blank dataset id | INSERT | `23514` | `sec_event_source_profiles_dataset_id_canonical` | R28 / R28 |
| 2 | source profile blank profile id | INSERT | `23514` | `sec_event_source_profiles_profile_id_canonical` | R28 / R28 |
| 2 | source profile noncanonical profile id | INSERT | `23514` | `sec_event_source_profiles_profile_id_canonical` | R28 / R28 |
| 2 | filing unsupported form | INSERT | `23514` | `sec_event_filing_identities_form_check` | R28 / R28 |
| 2 | filing missing amendment parent | INSERT | `23503` | `sec_event_filing_identities_amendment_parent_filing_identi_fkey` | R28 / R28 |
| 2 | filing amendment parent cross-CIK | INSERT | `23503` | `sec_event_filing_identities_amendment_parent_filing_identi_fkey` | R28 / R28 |
| 2 | request references unknown filing identity | INSERT | `23503` | `sec_event_acquisition_request_filing_identity_id_profile_i_fkey` | R28 / R28 |
| 2 | attempt unknown request | INSERT | `23503` | `sec_event_acquisition_attempts_request_id_fkey` | R28 / R28 |
| 2 | duplicate attempt ordinal | INSERT | `23505` | `sec_event_acquisition_attempts_request_id_attempt_ordinal_key` | R28 / R28 |
| 2 | receipt attempt/request mismatch | INSERT | `23503` | `sec_event_acquisition_receipts_attempt_id_request_id_fkey` | R28 / R28 |
| 2 | receipt package/filing scope mismatch | INSERT | `23503` | `sec_event_acquisition_receipt_package_id_package_fingerpri_fkey` | R28 / R28 |
| 2 | request source profile fingerprint mismatch | INSERT | `23503` | `sec_event_acquisition_request_filing_identity_id_profile_i_fkey` | R28 / R28 |
| 2 | attempt starts before request | COMMIT | `23514` | `sec_event_assert_acquisition_chronology` | R28 / R28 |
| 2 | receipt retrieved before attempt | COMMIT | `23514` | `sec_event_assert_acquisition_chronology` | R28 / R28 |
| 2 | receipt unknown attempt | INSERT | `23503` | `sec_event_acquisition_receipts_attempt_id_request_id_fkey` | R28 / R28 |
| 2 | receipt unsupported content encoding | INSERT | `23514` | `sec_event_acquisition_receipts_content_encoding_check` | R28 / R28 |
| 2 | request | AUTHORITATIVE_REREAD | `SEC_EVENT_ACQUISITION_REQUEST_AUTHORITY_CONFLICT` | `application / UoW` | R28 / R28 |
| 2 | attempt | AUTHORITATIVE_REREAD | `SEC_EVENT_ACQUISITION_ATTEMPT_AUTHORITY_CONFLICT` | `application / UoW` | R28 / R28 |
| 2 | receipt | AUTHORITATIVE_REREAD | `SEC_EVENT_ACQUISITION_RECEIPT_AUTHORITY_CONFLICT` | `application / UoW` | R28 / R28 |
| 2 | public E2E/replay/later receipt | commit/reread | `verified commit` | `application / UoW` | R28 / R29 |
| 2 | spread | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R29 / R29 |
| 2 | JSON | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R29 / R29 |
| 2 | structured clone | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R29 / R29 |
| 2 | fabricated | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R29 / R29 |
| 2 | wrong profile | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R29 / R29 |
| 2 | wrong filing | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R29 / R29 |
| 2 | wrong package | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R29 / R29 |
| 2 | wrong lineage | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R29 / R29 |
| 2 | fixture mismatch | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | R29 / R29 |
| 2 | wrong profile | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | R29 / R29 |
| 2 | wrong filing | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | R29 / R29 |
| 2 | locator traversal | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | R29 / R29 |
| 2 | unsupported encoding | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | R29 / R29 |
| 2 | document >8 MiB | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | R29 / R29 |
| 2 | package >64 MiB | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | R29 / R29 |
| 2 | worker budget >96 MiB within package limit | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | R29 / R29 |
| 2 | >32 documents | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | R29 / R29 |
| 2 | rollback REQUEST | REQUEST | `verified commit` | `application / UoW` | R29 / R29 |
| 2 | rollback REQUEST_ATTEMPT | REQUEST_ATTEMPT | `verified commit` | `application / UoW` | R29 / R29 |
| 2 | rollback BLOB_VERIFIED | BLOB_VERIFIED | `verified commit` | `application / UoW` | R29 / R29 |
| 2 | rollback DOCUMENT_ARTIFACTS | DOCUMENT_ARTIFACTS | `verified commit` | `application / UoW` | R29 / R29 |
| 2 | rollback PACKAGE_PARENT | PACKAGE_PARENT | `verified commit` | `application / UoW` | R29 / R29 |
| 2 | rollback PACKAGE_MEMBERS | PACKAGE_MEMBERS | `verified commit` | `application / UoW` | R29 / R29 |
| 2 | rollback RECEIPT | RECEIPT | `verified commit` | `application / UoW` | R29 / R29 |
| 2 | rollback LINEAGE_PARENT | LINEAGE_PARENT | `verified commit` | `application / UoW` | R29 / R29 |
| 2 | rollback LINEAGE_MEMBERS | LINEAGE_MEMBERS | `verified commit` | `application / UoW` | R29 / R29 |
| 2 | rollback BEFORE_COMMIT | BEFORE_COMMIT | `verified commit` | `application / UoW` | R29 / R29 |
| 2 | deferred COMMIT validation | COMMIT | `23514` | `sec_event_assert_acquisition_chronology` | R29 / R29 |
| 2 | injected infrastructure 57014 | BLOB_VERIFIED | `57014` | `application / UoW` | R29 / R29 |
| 2 | injected infrastructure 40001 | BLOB_VERIFIED | `40001` | `application / UoW` | R29 / R29 |
| 2 | injected infrastructure 40P01 | BLOB_VERIFIED | `40P01` | `application / UoW` | R29 / R29 |
| 2 | update sec_event_source_profiles | UPDATE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | delete sec_event_source_profiles | DELETE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | update sec_event_filing_identities | UPDATE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | delete sec_event_filing_identities | DELETE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | update sec_event_acquisition_requests | UPDATE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | delete sec_event_acquisition_requests | DELETE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | update sec_event_acquisition_attempts | UPDATE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | delete sec_event_acquisition_attempts | DELETE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | update sec_event_content_blobs | UPDATE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | delete sec_event_content_blobs | DELETE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | update sec_event_document_artifacts | UPDATE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | delete sec_event_document_artifacts | DELETE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | update sec_event_filing_packages | UPDATE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | delete sec_event_filing_packages | DELETE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | update sec_event_package_document_members | UPDATE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | delete sec_event_package_document_members | DELETE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | update sec_event_acquisition_receipts | UPDATE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | delete sec_event_acquisition_receipts | DELETE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | update sec_event_source_lineages | UPDATE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | delete sec_event_source_lineages | DELETE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | update sec_event_source_lineage_members | UPDATE | `55000` | `sec_event_reject_mutation` | R30 / R30 |
| 2 | delete sec_event_source_lineage_members | DELETE | `55000` | `sec_event_reject_mutation` | R30 / R30 |

## Exact count maps

### R1

```json
{
  "sec_event_source_profiles": 1,
  "sec_event_filing_identities": 3,
  "sec_event_acquisition_requests": 1,
  "sec_event_acquisition_attempts": 1,
  "sec_event_content_blobs": 3,
  "sec_event_document_artifacts": 3,
  "sec_event_filing_packages": 1,
  "sec_event_package_document_members": 3,
  "sec_event_acquisition_receipts": 1,
  "sec_event_source_lineages": 1,
  "sec_event_source_lineage_members": 3
}
```

### R2

```json
{
  "sec_event_source_profiles": 1,
  "sec_event_filing_identities": 3,
  "sec_event_acquisition_requests": 2,
  "sec_event_acquisition_attempts": 2,
  "sec_event_content_blobs": 4,
  "sec_event_document_artifacts": 6,
  "sec_event_filing_packages": 2,
  "sec_event_package_document_members": 6,
  "sec_event_acquisition_receipts": 2,
  "sec_event_source_lineages": 2,
  "sec_event_source_lineage_members": 6
}
```

### R3

```json
{
  "sec_event_source_profiles": 1,
  "sec_event_filing_identities": 4,
  "sec_event_acquisition_requests": 3,
  "sec_event_acquisition_attempts": 3,
  "sec_event_content_blobs": 5,
  "sec_event_document_artifacts": 9,
  "sec_event_filing_packages": 3,
  "sec_event_package_document_members": 9,
  "sec_event_acquisition_receipts": 3,
  "sec_event_source_lineages": 3,
  "sec_event_source_lineage_members": 9
}
```

### R4

```json
{
  "sec_event_source_profiles": 1,
  "sec_event_filing_identities": 5,
  "sec_event_acquisition_requests": 4,
  "sec_event_acquisition_attempts": 4,
  "sec_event_content_blobs": 6,
  "sec_event_document_artifacts": 12,
  "sec_event_filing_packages": 4,
  "sec_event_package_document_members": 12,
  "sec_event_acquisition_receipts": 4,
  "sec_event_source_lineages": 4,
  "sec_event_source_lineage_members": 12
}
```

### R5

```json
{
  "sec_event_source_profiles": 1,
  "sec_event_filing_identities": 6,
  "sec_event_acquisition_requests": 5,
  "sec_event_acquisition_attempts": 5,
  "sec_event_content_blobs": 7,
  "sec_event_document_artifacts": 15,
  "sec_event_filing_packages": 5,
  "sec_event_package_document_members": 15,
  "sec_event_acquisition_receipts": 5,
  "sec_event_source_lineages": 5,
  "sec_event_source_lineage_members": 15
}
```

### R6

```json
{
  "sec_event_source_profiles": 1,
  "sec_event_filing_identities": 6,
  "sec_event_acquisition_requests": 5,
  "sec_event_acquisition_attempts": 6,
  "sec_event_content_blobs": 7,
  "sec_event_document_artifacts": 15,
  "sec_event_filing_packages": 5,
  "sec_event_package_document_members": 15,
  "sec_event_acquisition_receipts": 6,
  "sec_event_source_lineages": 5,
  "sec_event_source_lineage_members": 15
}
```

### R7

```json
{
  "sec_event_source_profiles": 1,
  "sec_event_filing_identities": 8,
  "sec_event_acquisition_requests": 6,
  "sec_event_acquisition_attempts": 7,
  "sec_event_content_blobs": 8,
  "sec_event_document_artifacts": 18,
  "sec_event_filing_packages": 6,
  "sec_event_package_document_members": 18,
  "sec_event_acquisition_receipts": 7,
  "sec_event_source_lineages": 6,
  "sec_event_source_lineage_members": 18
}
```

### R8

```json
{
  "sec_event_source_profiles": 1,
  "sec_event_filing_identities": 8,
  "sec_event_acquisition_requests": 6,
  "sec_event_acquisition_attempts": 8,
  "sec_event_content_blobs": 8,
  "sec_event_document_artifacts": 18,
  "sec_event_filing_packages": 6,
  "sec_event_package_document_members": 18,
  "sec_event_acquisition_receipts": 8,
  "sec_event_source_lineages": 6,
  "sec_event_source_lineage_members": 18
}
```

### R9

```json
{
  "sec_event_source_profiles": 1,
  "sec_event_filing_identities": 10,
  "sec_event_acquisition_requests": 8,
  "sec_event_acquisition_attempts": 10,
  "sec_event_content_blobs": 12,
  "sec_event_document_artifacts": 22,
  "sec_event_filing_packages": 8,
  "sec_event_package_document_members": 22,
  "sec_event_acquisition_receipts": 10,
  "sec_event_source_lineages": 8,
  "sec_event_source_lineage_members": 22
}
```

### R10

```json
{
  "sec_event_source_profiles": 1,
  "sec_event_filing_identities": 11,
  "sec_event_acquisition_requests": 9,
  "sec_event_acquisition_attempts": 11,
  "sec_event_content_blobs": 14,
  "sec_event_document_artifacts": 25,
  "sec_event_filing_packages": 9,
  "sec_event_package_document_members": 25,
  "sec_event_acquisition_receipts": 11,
  "sec_event_source_lineages": 9,
  "sec_event_source_lineage_members": 25
}
```

### R11

```json
{
  "sec_event_source_profiles": 2,
  "sec_event_filing_identities": 12,
  "sec_event_acquisition_requests": 9,
  "sec_event_acquisition_attempts": 11,
  "sec_event_content_blobs": 14,
  "sec_event_document_artifacts": 25,
  "sec_event_filing_packages": 9,
  "sec_event_package_document_members": 25,
  "sec_event_acquisition_receipts": 11,
  "sec_event_source_lineages": 9,
  "sec_event_source_lineage_members": 25
}
```

### R12

```json
{
  "sec_event_source_profiles": 2,
  "sec_event_filing_identities": 13,
  "sec_event_acquisition_requests": 9,
  "sec_event_acquisition_attempts": 11,
  "sec_event_content_blobs": 14,
  "sec_event_document_artifacts": 25,
  "sec_event_filing_packages": 9,
  "sec_event_package_document_members": 25,
  "sec_event_acquisition_receipts": 11,
  "sec_event_source_lineages": 9,
  "sec_event_source_lineage_members": 25
}
```

### R13

```json
{
  "sec_event_source_profiles": 2,
  "sec_event_filing_identities": 14,
  "sec_event_acquisition_requests": 10,
  "sec_event_acquisition_attempts": 13,
  "sec_event_content_blobs": 14,
  "sec_event_document_artifacts": 28,
  "sec_event_filing_packages": 10,
  "sec_event_package_document_members": 28,
  "sec_event_acquisition_receipts": 13,
  "sec_event_source_lineages": 10,
  "sec_event_source_lineage_members": 28
}
```

### R14

```json
{
  "sec_event_source_profiles": 2,
  "sec_event_filing_identities": 14,
  "sec_event_acquisition_requests": 10,
  "sec_event_acquisition_attempts": 13,
  "sec_event_content_blobs": 14,
  "sec_event_document_artifacts": 28,
  "sec_event_filing_packages": 11,
  "sec_event_package_document_members": 30,
  "sec_event_acquisition_receipts": 13,
  "sec_event_source_lineages": 10,
  "sec_event_source_lineage_members": 28
}
```

### R15

```json
{
  "sec_event_source_profiles": 2,
  "sec_event_filing_identities": 15,
  "sec_event_acquisition_requests": 11,
  "sec_event_acquisition_attempts": 14,
  "sec_event_content_blobs": 16,
  "sec_event_document_artifacts": 30,
  "sec_event_filing_packages": 12,
  "sec_event_package_document_members": 32,
  "sec_event_acquisition_receipts": 14,
  "sec_event_source_lineages": 11,
  "sec_event_source_lineage_members": 30
}
```

### R16

```json
{
  "sec_event_source_profiles": 2,
  "sec_event_filing_identities": 15,
  "sec_event_acquisition_requests": 11,
  "sec_event_acquisition_attempts": 14,
  "sec_event_content_blobs": 16,
  "sec_event_document_artifacts": 30,
  "sec_event_filing_packages": 12,
  "sec_event_package_document_members": 32,
  "sec_event_acquisition_receipts": 14,
  "sec_event_source_lineages": 13,
  "sec_event_source_lineage_members": 33
}
```

### R17

```json
{
  "sec_event_source_profiles": 2,
  "sec_event_filing_identities": 16,
  "sec_event_acquisition_requests": 12,
  "sec_event_acquisition_attempts": 16,
  "sec_event_content_blobs": 17,
  "sec_event_document_artifacts": 33,
  "sec_event_filing_packages": 13,
  "sec_event_package_document_members": 35,
  "sec_event_acquisition_receipts": 16,
  "sec_event_source_lineages": 14,
  "sec_event_source_lineage_members": 36
}
```

### R18

```json
{
  "sec_event_source_profiles": 2,
  "sec_event_filing_identities": 18,
  "sec_event_acquisition_requests": 14,
  "sec_event_acquisition_attempts": 18,
  "sec_event_content_blobs": 20,
  "sec_event_document_artifacts": 39,
  "sec_event_filing_packages": 15,
  "sec_event_package_document_members": 41,
  "sec_event_acquisition_receipts": 18,
  "sec_event_source_lineages": 16,
  "sec_event_source_lineage_members": 42
}
```

### R19

```json
{
  "sec_event_source_profiles": 2,
  "sec_event_filing_identities": 20,
  "sec_event_acquisition_requests": 14,
  "sec_event_acquisition_attempts": 18,
  "sec_event_content_blobs": 20,
  "sec_event_document_artifacts": 39,
  "sec_event_filing_packages": 15,
  "sec_event_package_document_members": 41,
  "sec_event_acquisition_receipts": 18,
  "sec_event_source_lineages": 16,
  "sec_event_source_lineage_members": 42
}
```

### R20

```json
{
  "sec_event_source_profiles": 2,
  "sec_event_filing_identities": 20,
  "sec_event_acquisition_requests": 15,
  "sec_event_acquisition_attempts": 19,
  "sec_event_content_blobs": 21,
  "sec_event_document_artifacts": 42,
  "sec_event_filing_packages": 16,
  "sec_event_package_document_members": 44,
  "sec_event_acquisition_receipts": 19,
  "sec_event_source_lineages": 17,
  "sec_event_source_lineage_members": 45
}
```

### R21

```json
{
  "sec_event_source_profiles": 2,
  "sec_event_filing_identities": 21,
  "sec_event_acquisition_requests": 16,
  "sec_event_acquisition_attempts": 20,
  "sec_event_content_blobs": 22,
  "sec_event_document_artifacts": 45,
  "sec_event_filing_packages": 17,
  "sec_event_package_document_members": 47,
  "sec_event_acquisition_receipts": 20,
  "sec_event_source_lineages": 18,
  "sec_event_source_lineage_members": 48
}
```

### R22

```json
{
  "sec_event_source_profiles": 2,
  "sec_event_filing_identities": 22,
  "sec_event_acquisition_requests": 17,
  "sec_event_acquisition_attempts": 21,
  "sec_event_content_blobs": 23,
  "sec_event_document_artifacts": 48,
  "sec_event_filing_packages": 18,
  "sec_event_package_document_members": 50,
  "sec_event_acquisition_receipts": 21,
  "sec_event_source_lineages": 19,
  "sec_event_source_lineage_members": 51
}
```

### R23

```json
{
  "sec_event_source_profiles": 2,
  "sec_event_filing_identities": 23,
  "sec_event_acquisition_requests": 18,
  "sec_event_acquisition_attempts": 22,
  "sec_event_content_blobs": 24,
  "sec_event_document_artifacts": 51,
  "sec_event_filing_packages": 19,
  "sec_event_package_document_members": 53,
  "sec_event_acquisition_receipts": 22,
  "sec_event_source_lineages": 20,
  "sec_event_source_lineage_members": 54
}
```

### R24

```json
{
  "sec_event_source_profiles": 2,
  "sec_event_filing_identities": 23,
  "sec_event_acquisition_requests": 18,
  "sec_event_acquisition_attempts": 23,
  "sec_event_content_blobs": 24,
  "sec_event_document_artifacts": 51,
  "sec_event_filing_packages": 19,
  "sec_event_package_document_members": 53,
  "sec_event_acquisition_receipts": 23,
  "sec_event_source_lineages": 20,
  "sec_event_source_lineage_members": 54
}
```

### R25

```json
{
  "sec_event_source_profiles": 2,
  "sec_event_filing_identities": 25,
  "sec_event_acquisition_requests": 19,
  "sec_event_acquisition_attempts": 24,
  "sec_event_content_blobs": 25,
  "sec_event_document_artifacts": 54,
  "sec_event_filing_packages": 20,
  "sec_event_package_document_members": 56,
  "sec_event_acquisition_receipts": 24,
  "sec_event_source_lineages": 21,
  "sec_event_source_lineage_members": 57
}
```

### R26

```json
{
  "sec_event_source_profiles": 2,
  "sec_event_filing_identities": 26,
  "sec_event_acquisition_requests": 20,
  "sec_event_acquisition_attempts": 25,
  "sec_event_content_blobs": 26,
  "sec_event_document_artifacts": 57,
  "sec_event_filing_packages": 21,
  "sec_event_package_document_members": 59,
  "sec_event_acquisition_receipts": 25,
  "sec_event_source_lineages": 22,
  "sec_event_source_lineage_members": 60
}
```

### R27

```json
{
  "sec_event_source_profiles": 3,
  "sec_event_filing_identities": 27,
  "sec_event_acquisition_requests": 20,
  "sec_event_acquisition_attempts": 25,
  "sec_event_content_blobs": 26,
  "sec_event_document_artifacts": 57,
  "sec_event_filing_packages": 21,
  "sec_event_package_document_members": 59,
  "sec_event_acquisition_receipts": 25,
  "sec_event_source_lineages": 22,
  "sec_event_source_lineage_members": 60
}
```

### R28

```json
{
  "sec_event_source_profiles": 3,
  "sec_event_filing_identities": 28,
  "sec_event_acquisition_requests": 20,
  "sec_event_acquisition_attempts": 25,
  "sec_event_content_blobs": 26,
  "sec_event_document_artifacts": 57,
  "sec_event_filing_packages": 21,
  "sec_event_package_document_members": 59,
  "sec_event_acquisition_receipts": 25,
  "sec_event_source_lineages": 22,
  "sec_event_source_lineage_members": 60
}
```

### R29

```json
{
  "sec_event_source_profiles": 3,
  "sec_event_filing_identities": 29,
  "sec_event_acquisition_requests": 21,
  "sec_event_acquisition_attempts": 27,
  "sec_event_content_blobs": 27,
  "sec_event_document_artifacts": 60,
  "sec_event_filing_packages": 22,
  "sec_event_package_document_members": 62,
  "sec_event_acquisition_receipts": 27,
  "sec_event_source_lineages": 23,
  "sec_event_source_lineage_members": 63
}
```

### R30

```json
{
  "sec_event_source_profiles": 3,
  "sec_event_filing_identities": 31,
  "sec_event_acquisition_requests": 23,
  "sec_event_acquisition_attempts": 29,
  "sec_event_content_blobs": 30,
  "sec_event_document_artifacts": 66,
  "sec_event_filing_packages": 24,
  "sec_event_package_document_members": 68,
  "sec_event_acquisition_receipts": 29,
  "sec_event_source_lineages": 25,
  "sec_event_source_lineage_members": 69
}
```

## Actual deferred triggers

- `sec_event_filing_identity_amendment_deferred`: CREATE CONSTRAINT TRIGGER sec_event_filing_identity_amendment_deferred AFTER INSERT OR UPDATE ON public.sec_event_filing_identities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sec_event_assert_amendment_parent()
- `sec_event_package_amendment_deferred`: CREATE CONSTRAINT TRIGGER sec_event_package_amendment_deferred AFTER INSERT ON public.sec_event_filing_packages DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sec_event_assert_amendment_parent()
- `sec_event_filing_package_seal_deferred`: CREATE CONSTRAINT TRIGGER sec_event_filing_package_seal_deferred AFTER INSERT OR UPDATE ON public.sec_event_filing_packages DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sec_event_assert_package_seal()
- `sec_event_package_document_member_seal_deferred`: CREATE CONSTRAINT TRIGGER sec_event_package_document_member_seal_deferred AFTER INSERT OR DELETE OR UPDATE ON public.sec_event_package_document_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sec_event_assert_package_seal()
- `sec_event_source_lineage_seal_deferred`: CREATE CONSTRAINT TRIGGER sec_event_source_lineage_seal_deferred AFTER INSERT OR UPDATE ON public.sec_event_source_lineages DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sec_event_assert_lineage_seal()
- `sec_event_source_lineage_member_seal_deferred`: CREATE CONSTRAINT TRIGGER sec_event_source_lineage_member_seal_deferred AFTER INSERT OR DELETE OR UPDATE ON public.sec_event_source_lineage_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sec_event_assert_lineage_seal()
- `sec_event_request_chronology_deferred`: CREATE CONSTRAINT TRIGGER sec_event_request_chronology_deferred AFTER INSERT ON public.sec_event_acquisition_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sec_event_assert_acquisition_chronology()
- `sec_event_attempt_chronology_deferred`: CREATE CONSTRAINT TRIGGER sec_event_attempt_chronology_deferred AFTER INSERT ON public.sec_event_acquisition_attempts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sec_event_assert_acquisition_chronology()
- `sec_event_receipt_chronology_deferred`: CREATE CONSTRAINT TRIGGER sec_event_receipt_chronology_deferred AFTER INSERT ON public.sec_event_acquisition_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sec_event_assert_acquisition_chronology()

## Quality gates

- Complete PostgreSQL runtime suite: 62/62 twice without reset, including the new adversarial cases and existing A-G.
- Runtime units: 48/48 twice. Focused fixture/provenance/byte-storage/mapping/corroboration/persistence regressions: 100/100 in seven files (the earlier combined run including runtime units had 147 tests).
- Full unit suite: 832 passed, 35 intentionally skipped (867 total). Typecheck and lint pass. Audit: zero vulnerabilities. npm ls --all: exit 0, no invalid/extraneous/missing dependency. Both working and baseline diff checks pass before commit.
- Detached tracked-only final-SHA npm ci/build, env-file and seam/sentinel-output checks run after commit; exact SHA/result are reported in the completion response. Build is not production approval.

## Official sources, checked 2026-10-02

- [Supabase Changelog](https://supabase.com/changelog) (markdown endpoint returned unsupported-format error; HTML fallback inspected).
- [Supabase CLI reference / db advisors](https://supabase.com/docs/reference/cli/supabase-db-advisors), with pinned CLI --help for commands and flags.
- [PostgreSQL 17 CREATE TRIGGER](https://www.postgresql.org/docs/17/sql-createtrigger.html): deferred constraint trigger timing.
- [PostgreSQL 17 constraints](https://www.postgresql.org/docs/17/ddl-constraints.html): FK/constraint semantics.
- [PostgreSQL 17 explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html): row-lock compatibility.
- [PostgreSQL 17 transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html): READ COMMITTED statement snapshots.

No hosted Supabase, hosted migration, Storage, live SEC/provider calls, credential resolution, deployment, scheduler, event authority, signal or trading operations are part of this review. Disposable stack/worktree cleanup and protected-worktree snapshot comparison are recorded in the completion response.
