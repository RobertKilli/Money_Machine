# SEC EDGAR provenance runtime verification

Verified 2026-10-02 in `feat/sec-edgar-event-source-provenance-runtime`, baseline/start `52c51b91cb2b62b69adc702bae57342d6c4d843a`. Local disposable PostgreSQL **17.6**, Supabase CLI **2.117.0**, full 37-migration chain, no seed. Two final complete integration runs passed **55/55 each without reset between them**. A?C and D?F remain the approved checkpoints; changes to their test IDs only correct concrete repeat-run conflicts.

Production is `BLOCKED_BACKEND_UNAPPROVED`. Evidence is synthetic and NON_AUTHORITATIVE. No hosted Supabase, Storage, SEC/provider acquisition, credential resolution, deployment, scheduler, event-authority-write, signal or trading operation was performed.

## Consolidated invariant ownership

| Group | Invariant / input | Owner and stage | Error / authority | Rollback |
|---|---|---|---|---|
| A | Canonical profile identifiers/versions; blank/whitespace values | parser before UoW; named DB CHECK at INSERT | `SEC_EVENT_SOURCE_PROFILE_INVALID`; SQLSTATE 23514, named canonical CHECKs below; NULL provider 23502 | no writes / exact counts unchanged |
| A | Same profile ID with different provider/endpoint/version | authoritative column + material reread | `SEC_EVENT_SOURCE_PROFILE_AUTHORITY_CONFLICT`; no SQLSTATE | full transaction |
| A | CIK/accession/form, missing or self parent in authentic material | factory before UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID`; no SQLSTATE | no writes |
| A | Existing filing ID with changed CIK/accession/form | authoritative reread | `SEC_EVENT_FILING_IDENTITY_AUTHORITY_CONFLICT`; no SQLSTATE | full transaction |
| A | 8-K/A parent missing / cross-CIK / second child | immediate FK / UNIQUE INSERT | 23503 / 23505; actual catalog names below | full transaction |
| A | Parent filing date later than new child filing date | both identities, artifacts, packages and members INSERT successfully; deferred COMMIT | 23514; `SEC_EVENT_AMENDMENT_CHRONOLOGY_INVALID`, `sec_event_assert_amendment_parent` | all eleven counts unchanged |
| A | Cycle | `UNREACHABLE_BY_CONSTRUCTION` | immediate composite parent FK, immutable rows, parent-before-child protocol; recursive deferred check retained as defense | no constraint weakening |
| B | Request profile/fingerprint/filing scope, attempt request, receipt attempt/request/package scope | composite immediate FK INSERT | 23503; actual constraints below | all eleven counts unchanged |
| B | Duplicate attempt ordinal | UNIQUE INSERT | 23505 | full transaction |
| B | Same request/attempt/receipt ID with changed material | authoritative reread of every parent column + JSON material | corresponding `SEC_EVENT_ACQUISITION_*_AUTHORITY_CONFLICT`; no SQLSTATE | full transaction |
| B | Attempt before request or receipt before attempt/request | deferred COMMIT | 23514; `SEC_EVENT_ACQUISITION_CHRONOLOGY_INVALID`, `sec_event_assert_acquisition_chronology` | full transaction |
| B | Unsupported encoding | application pre-write; DB CHECK INSERT | `SEC_EVENT_RUNTIME_INPUT_INVALID` / 23514 `sec_event_acquisition_receipts_content_encoding_check` | no writes / full rollback |
| B | Later valid receipt | public synthetic application through UoW | new attempt and receipt; stable profile/filing/blobs/artifacts/package/lineage | commit; replay no additions |
| C | Blob NULL, empty body, canonical digest, length/address/octet count | NOT NULL / CHECK INSERT | 23502 / 23514; actual columns/constraints below | all eleven counts unchanged |
| C | Structurally valid digest that does not hash returned logical bytes | application authoritative readback | `SEC_EVENT_BLOB_READBACK_MISMATCH`; no SQLSTATE, no pgcrypto | full transaction, corrupt blob invisible |
| C | Exact logical octets, digest/length, shared body at legitimate different locators | per-blob sequential SELECT and application hash/byte comparison | idempotent deduplicated content blob; separate artifacts | verified before commit |
| D | Unknown blob, invalid role, duplicate locator | FK / CHECK / UNIQUE INSERT | 23503 / 23514 / 23505 below | full transaction |
| D | Same artifact ID with changed blob/locator/role/profile-scope/filing-scope/content type | private genuine writer after idempotent INSERT, column-level authoritative reread | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT`; no SQLSTATE | baseline unchanged, canary set rolled back |
| E | Declared/actual count, missing/extra member, ordinal gaps/start, primary/index roles | deferred package seal COMMIT, unless PK/CHECK/FK rejects earlier | 23514 `SEC_EVENT_PACKAGE_UNSEALED`, `sec_event_assert_package_seal`; duplicate ordinal 23505; wrong filing FK 23503 | full transaction |
| E | Same package ID with changed material | authoritative reread | `SEC_EVENT_FILING_PACKAGE_AUTHORITY_CONFLICT`; no SQLSTATE | full transaction |
| E | Exhibit policy | fixture-specific required evidence before adapter; DB seals declared exact set | no universal rule that every package must contain an exhibit; no-exhibit legitimate package and selected subsets remain valid | commit or declared-set rollback |
| F | Selected subset, contiguous/count-correct lineage, same receipt-independent identity | independent lineage and exact package-member references | lineage does not have to contain all package members | verified commit and replay |
| F | Missing/extra/gapped members, wrong profile, outside-package reference | deferred lineage seal COMMIT / scoped member FK INSERT | 23514 `SEC_EVENT_LINEAGE_UNSEALED`, `sec_event_assert_lineage_seal` / 23503 | full transaction |
| F | Same lineage ID with changed material | authoritative reread | `SEC_EVENT_SOURCE_LINEAGE_AUTHORITY_CONFLICT`; no SQLSTATE | full transaction |
| G | Copy/spread/JSON/structured clone/fabricated or mutated authority lookalike | public application before UoW; UoW own guard before BEGIN | `null` for untrusted fixture; `SEC_EVENT_RUNTIME_TRUST_REQUIRED` for copied batch; no SQLSTATE | UoW starts=0, no repository calls/count changes |
| G | Invalid profile/filing/locator/encoding, >8 MiB body, >64 MiB package, >32 docs, >96 MiB reservation | domain factory before UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID`; no SQLSTATE | starts=0, all counts unchanged |
| G | Timeout/cancellation admission | application admission port before UoW | same injected Error; no SQLSTATE | no transaction or writes |
| G | Request/attempt/blob/artifact/package/member/receipt/lineage/pre-commit failures | real UoW phase observer | exact unique Error instance, no retry | full eleven-table rollback from fresh connection |
| G | PostgreSQL infrastructure error propagation | deliberately injected PostgreSQL failure after verified blob | 57014 / 40001 / 40P01 unchanged; not a claim of a naturally occurring deadlock/timeout | original driver Error; complete rollback |
| G | Concurrent identical writers | two connections and controlled start latch, READ COMMITTED | two compatible committed results, uniqueness + authoritative reread; no retry | exactly one new authority set |
| G | Concurrent differing package material at same stable request key | authoritative request reread | one winner; one `SEC_EVENT_ACQUISITION_REQUEST_AUTHORITY_CONFLICT`; no SQLSTATE | loser unique body absent; no mixed set |
| G | UPDATE/DELETE against every table | active immutable BEFORE trigger | 55000 `SEC_EVENT_IMMUTABLE_AUTHORITY`; `sec_event_reject_mutation` | full transaction and unchanged maps |

No SQLSTATE is assigned to application-domain failures. The database validates SHA shape/address/length only; cryptographic authority is established by the application readback. Receipt availability may precede retrieval. Later receipt cannot alter stable content or lineage identity. The application summary explicitly denies event-authority eligibility and carries no bytes or claim trust.

## Recorded case results and exact count references

For each SQL row, expected and actual SQLSTATE/constraint (or function) are equal by assertion. Before and after maps are read with an independent verification connection. A shared map reference denotes exactly the same eleven-table object, not only the same total. Positive/concurrency records are included separately. The foundation scope counts are also shown to distinguish scoped authorities from globally deduplicated blobs.

### Complete integration run 1

| Group | Case | Actual stage | SQLSTATE or application result | Constraint / function | Before ? after |
|---|---|---|---|---|---|
| A | provider | AUTHORITATIVE_REREAD | `SEC_EVENT_SOURCE_PROFILE_AUTHORITY_CONFLICT` | `application / UoW` | M1 ? M1 |
| A | endpoint profile | AUTHORITATIVE_REREAD | `SEC_EVENT_SOURCE_PROFILE_AUTHORITY_CONFLICT` | `application / UoW` | M1 ? M1 |
| A | contract version | AUTHORITATIVE_REREAD | `SEC_EVENT_SOURCE_PROFILE_AUTHORITY_CONFLICT` | `application / UoW` | M1 ? M1 |
| A | CIK | AUTHORITATIVE_REREAD | `SEC_EVENT_FILING_IDENTITY_AUTHORITY_CONFLICT` | `application / UoW` | M1 ? M1 |
| A | accession | AUTHORITATIVE_REREAD | `SEC_EVENT_FILING_IDENTITY_AUTHORITY_CONFLICT` | `application / UoW` | M1 ? M1 |
| A | form | AUTHORITATIVE_REREAD | `SEC_EVENT_FILING_IDENTITY_AUTHORITY_CONFLICT` | `application / UoW` | M1 ? M1 |
| G | original public fixture commit/replay/receipt | COMMIT | PERSISTED_VERIFIED | verified UoW | M1 ? M1 ? M2 |

Scoped counts: `{"filing":1,"requests":1,"attempts":1,"blobs":3,"artifacts":3,"packages":1,"members":3,"receipts":1,"lineages":1,"lineage_members":3}`.

| G | corrupt logical blob readback | AUTHORITATIVE_REREAD | `SEC_EVENT_BLOB_READBACK_MISMATCH` | `application / UoW` | M2 ? M2 |
| A | isolated amendment chronology | COMMIT | `23514` | `sec_event_assert_amendment_parent` | M3 ? M3 |
| A | amendment fork | INSERT | `23505` | `sec_event_filing_identities_amendment_parent_filing_identit_key` | M3 ? M3 |
| D | blob | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | M4 ? M4 |
| D | locator | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | M4 ? M4 |
| D | document role | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | M4 ? M4 |
| D | source profile | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | M5 ? M5 |
| D | filing identity | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | M6 ? M6 |
| C | artifact references unknown blob | INSERT | `23503` | `sec_event_document_artifacts_blob_id_content_sha256_byte_l_fkey` | M7 ? M7 |
| D | artifact invalid role | INSERT | `23514` | `sec_event_document_artifacts_document_role_check` | M7 ? M7 |
| D | artifact duplicate locator | INSERT | `23505` | `sec_event_document_artifacts_filing_identity_id_canonical_l_key` | M7 ? M7 |
| E | package declared count low | COMMIT | `23514` | `sec_event_assert_package_seal` | M7 ? M7 |
| E | package declared count high | COMMIT | `23514` | `sec_event_assert_package_seal` | M7 ? M7 |
| E | package ordinal gap | COMMIT | `23514` | `sec_event_assert_package_seal` | M7 ? M7 |
| E | package starts at wrong ordinal | COMMIT | `23514` | `sec_event_assert_package_seal` | M7 ? M7 |
| E | package missing primary | COMMIT | `23514` | `sec_event_assert_package_seal` | M7 ? M7 |
| E | package duplicate ordinal | INSERT | `23505` | `sec_event_package_document_members_pkey` | M8 ? M8 |
| E | package extra member | COMMIT | `23514` | `sec_event_assert_package_seal` | M8 ? M8 |
| E | package member from another filing | INSERT | `23503` | `sec_event_package_document_me_artifact_id_artifact_fingerp_fkey` | M9 ? M9 |
| F | lineage declared count low | COMMIT | `23514` | `sec_event_assert_lineage_seal` | M10 ? M10 |
| F | lineage declared count high | COMMIT | `23514` | `sec_event_assert_lineage_seal` | M10 ? M10 |
| F | lineage missing member | COMMIT | `23514` | `sec_event_assert_lineage_seal` | M10 ? M10 |
| F | lineage extra member | COMMIT | `23514` | `sec_event_assert_lineage_seal` | M10 ? M10 |
| F | lineage ordinal gap | COMMIT | `23514` | `sec_event_assert_lineage_seal` | M10 ? M10 |
| F | lineage starts at wrong ordinal | COMMIT | `23514` | `sec_event_assert_lineage_seal` | M10 ? M10 |
| F | lineage duplicate ordinal | INSERT | `23505` | `sec_event_source_lineage_members_pkey` | M10 ? M10 |
| F | lineage member from wrong source profile | COMMIT | `23514` | `sec_event_assert_lineage_seal` | M10 ? M10 |
| F | lineage references a package member that does not exist | INSERT | `23503` | `sec_event_source_lineage_memb_package_id_package_fingerpri_fkey` | M10 ? M10 |
| C | empty bytea is forbidden | INSERT | `23514` | `sec_event_content_blobs_byte_length_limit` | M10 ? M10 |
| C | uppercase digest is forbidden | INSERT | `23514` | `sec_event_content_blobs_sha256_canonical` | M10 ? M10 |
| C | declared octet length mismatch is forbidden | INSERT | `23514` | `sec_event_content_blobs_octet_length_check` | M10 ? M10 |
| C | blob null bytes | INSERT | `23502` | `entity_body` | M10 ? M10 |
| C | blob null sha | INSERT | `23502` | `sha256` | M10 ? M10 |
| C | blob null length | INSERT | `23502` | `byte_length` | M10 ? M10 |
| C | blob blank sha | INSERT | `23514` | `sec_event_content_blobs_sha256_canonical` | M10 ? M10 |
| C | blob uppercase sha | INSERT | `23514` | `sec_event_content_blobs_sha256_canonical` | M10 ? M10 |
| C | blob malformed sha | INSERT | `23514` | `sec_event_content_blobs_sha256_canonical` | M10 ? M10 |
| C | blob zero length | INSERT | `23514` | `sec_event_content_blobs_byte_length_limit` | M10 ? M10 |
| C | blob negative length | INSERT | `23514` | `sec_event_content_blobs_byte_length_limit` | M10 ? M10 |
| C | blob declared octet mismatch | INSERT | `23514` | `sec_event_content_blobs_octet_length_check` | M10 ? M10 |
| C | blob address digest mismatch | INSERT | `23514` | `sec_event_content_blobs_address_check` | M10 ? M10 |
| A | source profile NULL provider | INSERT | `23502` | `provider_id` | M10 ? M10 |
| A | source profile blank provider | INSERT | `23514` | `sec_event_source_profiles_provider_id_canonical` | M10 ? M10 |
| A | source profile whitespace provider | INSERT | `23514` | `sec_event_source_profiles_provider_id_canonical` | M10 ? M10 |
| A | source profile blank endpoint profile | INSERT | `23514` | `sec_event_source_profiles_endpoint_profile_canonical` | M10 ? M10 |
| A | source profile whitespace endpoint profile | INSERT | `23514` | `sec_event_source_profiles_endpoint_profile_canonical` | M10 ? M10 |
| A | source profile blank contract version | INSERT | `23514` | `sec_event_source_profiles_contract_version_canonical` | M10 ? M10 |
| A | source profile whitespace contract version | INSERT | `23514` | `sec_event_source_profiles_contract_version_canonical` | M10 ? M10 |
| A | source profile blank dataset version | INSERT | `23514` | `sec_event_source_profiles_dataset_version_canonical` | M10 ? M10 |
| A | source profile blank dataset id | INSERT | `23514` | `sec_event_source_profiles_dataset_id_canonical` | M10 ? M10 |
| A | source profile blank profile id | INSERT | `23514` | `sec_event_source_profiles_profile_id_canonical` | M10 ? M10 |
| A | source profile noncanonical profile id | INSERT | `23514` | `sec_event_source_profiles_profile_id_canonical` | M10 ? M10 |
| A | filing unsupported form | INSERT | `23514` | `sec_event_filing_identities_form_check` | M10 ? M10 |
| A | filing missing amendment parent | INSERT | `23503` | `sec_event_filing_identities_amendment_parent_filing_identi_fkey` | M10 ? M10 |
| A | filing amendment parent cross-CIK | INSERT | `23503` | `sec_event_filing_identities_amendment_parent_filing_identi_fkey` | M10 ? M10 |
| B | request references unknown filing identity | INSERT | `23503` | `sec_event_acquisition_request_filing_identity_id_profile_i_fkey` | M10 ? M10 |
| B | attempt unknown request | INSERT | `23503` | `sec_event_acquisition_attempts_request_id_fkey` | M10 ? M10 |
| B | duplicate attempt ordinal | INSERT | `23505` | `sec_event_acquisition_attempts_request_id_attempt_ordinal_key` | M10 ? M10 |
| B | receipt attempt/request mismatch | INSERT | `23503` | `sec_event_acquisition_receipts_attempt_id_request_id_fkey` | M10 ? M10 |
| B | receipt package/filing scope mismatch | INSERT | `23503` | `sec_event_acquisition_receipt_package_id_package_fingerpri_fkey` | M10 ? M10 |
| B | request source profile fingerprint mismatch | INSERT | `23503` | `sec_event_acquisition_request_filing_identity_id_profile_i_fkey` | M10 ? M10 |
| B | attempt starts before request | COMMIT | `23514` | `sec_event_assert_acquisition_chronology` | M10 ? M10 |
| B | receipt retrieved before attempt | COMMIT | `23514` | `sec_event_assert_acquisition_chronology` | M10 ? M10 |
| B | receipt unknown attempt | INSERT | `23503` | `sec_event_acquisition_receipts_attempt_id_request_id_fkey` | M10 ? M10 |
| B | receipt unsupported content encoding | INSERT | `23514` | `sec_event_acquisition_receipts_content_encoding_check` | M10 ? M10 |
| B | request | AUTHORITATIVE_REREAD | `SEC_EVENT_ACQUISITION_REQUEST_AUTHORITY_CONFLICT` | `application / UoW` | M10 ? M10 |
| B | attempt | AUTHORITATIVE_REREAD | `SEC_EVENT_ACQUISITION_ATTEMPT_AUTHORITY_CONFLICT` | `application / UoW` | M10 ? M10 |
| B | receipt | AUTHORITATIVE_REREAD | `SEC_EVENT_ACQUISITION_RECEIPT_AUTHORITY_CONFLICT` | `application / UoW` | M10 ? M10 |
| G | fresh public E2E commit, replay, later receipt | COMMIT | synthetic NON_AUTHORITATIVE, bytes not returned | application ? real UoW | M10 ? M11 ? M11 ? M12 |
| G | spread | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M12 ? M12 |
| G | JSON | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M12 ? M12 |
| G | structured clone | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M12 ? M12 |
| G | fabricated | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M12 ? M12 |
| G | wrong profile | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M12 ? M12 |
| G | wrong filing | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M12 ? M12 |
| G | wrong package | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M12 ? M12 |
| G | wrong lineage | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M12 ? M12 |
| G | fixture mismatch | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M12 ? M12 |
| G | wrong profile | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | M12 ? M12 |
| G | wrong filing | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | M12 ? M12 |
| G | locator traversal | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | M12 ? M12 |
| G | unsupported encoding | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | M12 ? M12 |
| G | document >8 MiB | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | M12 ? M12 |
| G | package >64 MiB | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | M12 ? M12 |
| G | worker budget >96 MiB within package limit | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | M12 ? M12 |
| G | >32 documents | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | M12 ? M12 |
| G | rollback REQUEST | REQUEST | `original injected Error` | `application / UoW` | M12 ? M12 |
| G | rollback REQUEST_ATTEMPT | REQUEST_ATTEMPT | `original injected Error` | `application / UoW` | M12 ? M12 |
| G | rollback BLOB_VERIFIED | BLOB_VERIFIED | `original injected Error` | `application / UoW` | M12 ? M12 |
| G | rollback DOCUMENT_ARTIFACTS | DOCUMENT_ARTIFACTS | `original injected Error` | `application / UoW` | M12 ? M12 |
| G | rollback PACKAGE_PARENT | PACKAGE_PARENT | `original injected Error` | `application / UoW` | M12 ? M12 |
| G | rollback PACKAGE_MEMBERS | PACKAGE_MEMBERS | `original injected Error` | `application / UoW` | M12 ? M12 |
| G | rollback RECEIPT | RECEIPT | `original injected Error` | `application / UoW` | M12 ? M12 |
| G | rollback LINEAGE_PARENT | LINEAGE_PARENT | `original injected Error` | `application / UoW` | M12 ? M12 |
| G | rollback LINEAGE_MEMBERS | LINEAGE_MEMBERS | `original injected Error` | `application / UoW` | M12 ? M12 |
| G | rollback BEFORE_COMMIT | BEFORE_COMMIT | `original injected Error` | `application / UoW` | M12 ? M12 |
| G | deferred COMMIT validation | COMMIT | `23514` | `sec_event_assert_acquisition_chronology` | M12 ? M12 |
| G | injected infrastructure 57014 | BLOB_VERIFIED | `57014` | `application / UoW` | M12 ? M12 |
| G | injected infrastructure 40001 | BLOB_VERIFIED | `40001` | `application / UoW` | M12 ? M12 |
| G | injected infrastructure 40P01 | BLOB_VERIFIED | `40P01` | `application / UoW` | M12 ? M12 |
| G | fresh identical race | COMMIT | 2 fulfilled; starts=2; retries=0 | uniqueness + reread | M12 ? M13 |
| G | fresh conflicting race | AUTHORITATIVE_REREAD | SEC_EVENT_ACQUISITION_REQUEST_AUTHORITY_CONFLICT (1 fulfilled / 1 rejected) | request identity guard | M13 ? M14 |
| G | update sec_event_source_profiles | UPDATE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | delete sec_event_source_profiles | DELETE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | update sec_event_filing_identities | UPDATE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | delete sec_event_filing_identities | DELETE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | update sec_event_acquisition_requests | UPDATE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | delete sec_event_acquisition_requests | DELETE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | update sec_event_acquisition_attempts | UPDATE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | delete sec_event_acquisition_attempts | DELETE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | update sec_event_content_blobs | UPDATE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | delete sec_event_content_blobs | DELETE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | update sec_event_document_artifacts | UPDATE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | delete sec_event_document_artifacts | DELETE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | update sec_event_filing_packages | UPDATE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | delete sec_event_filing_packages | DELETE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | update sec_event_package_document_members | UPDATE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | delete sec_event_package_document_members | DELETE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | update sec_event_acquisition_receipts | UPDATE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | delete sec_event_acquisition_receipts | DELETE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | update sec_event_source_lineages | UPDATE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | delete sec_event_source_lineages | DELETE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | update sec_event_source_lineage_members | UPDATE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |
| G | delete sec_event_source_lineage_members | DELETE | `55000` | `sec_event_reject_mutation` | M14 ? M14 |

Fresh public fixture result (IDs, fingerprints and counts only):

```json
{
  "first": {
    "profileId": "sec-edgar-synthetic-fixture-profile/v1",
    "filingIdentityId": "27f2e9f43f6281e88cf6e1e6d44f8ee771aff538289cc0a769e23d103d42f111",
    "packageId": "2b6cac778a2065815b88f8860a22e54795ea98b63dbe05dd00982906b5fc999f",
    "packageFingerprint": "a4e1f2f1419ada12de776f10e6d893dc17c5c814963b0f90d366074582849b0c",
    "receiptId": "de8bfa453e9cb2ab1e7ac0efcccd5e3e7cff79381d8475c35d830fbdda6670e0",
    "lineageId": "43b07914fc3422532d4d6e9fb22417c772373be01e12ca2b4f8dd2f0ed23bf99",
    "documentCount": 2,
    "memberCount": 3,
    "blobCount": 3,
    "status": "PERSISTED_VERIFIED",
    "classification": "SYNTHETIC_NON_AUTHORITATIVE",
    "eventAuthorityEligible": false
  },
  "later": {
    "profileId": "sec-edgar-synthetic-fixture-profile/v1",
    "filingIdentityId": "27f2e9f43f6281e88cf6e1e6d44f8ee771aff538289cc0a769e23d103d42f111",
    "packageId": "2b6cac778a2065815b88f8860a22e54795ea98b63dbe05dd00982906b5fc999f",
    "packageFingerprint": "a4e1f2f1419ada12de776f10e6d893dc17c5c814963b0f90d366074582849b0c",
    "receiptId": "9d2a212b913c5403a51df232ae20cfe36257c0e6a0da04d2ad95987d183ba462",
    "lineageId": "43b07914fc3422532d4d6e9fb22417c772373be01e12ca2b4f8dd2f0ed23bf99",
    "documentCount": 2,
    "memberCount": 3,
    "blobCount": 3,
    "status": "PERSISTED_VERIFIED",
    "classification": "SYNTHETIC_NON_AUTHORITATIVE",
    "eventAuthorityEligible": false
  }
}
```

### Complete integration run 2

| Group | Case | Actual stage | SQLSTATE or application result | Constraint / function | Before ? after |
|---|---|---|---|---|---|
| A | provider | AUTHORITATIVE_REREAD | `SEC_EVENT_SOURCE_PROFILE_AUTHORITY_CONFLICT` | `application / UoW` | M14 ? M14 |
| A | endpoint profile | AUTHORITATIVE_REREAD | `SEC_EVENT_SOURCE_PROFILE_AUTHORITY_CONFLICT` | `application / UoW` | M14 ? M14 |
| A | contract version | AUTHORITATIVE_REREAD | `SEC_EVENT_SOURCE_PROFILE_AUTHORITY_CONFLICT` | `application / UoW` | M14 ? M14 |
| A | CIK | AUTHORITATIVE_REREAD | `SEC_EVENT_FILING_IDENTITY_AUTHORITY_CONFLICT` | `application / UoW` | M14 ? M14 |
| A | accession | AUTHORITATIVE_REREAD | `SEC_EVENT_FILING_IDENTITY_AUTHORITY_CONFLICT` | `application / UoW` | M14 ? M14 |
| A | form | AUTHORITATIVE_REREAD | `SEC_EVENT_FILING_IDENTITY_AUTHORITY_CONFLICT` | `application / UoW` | M14 ? M14 |
| G | original public fixture commit/replay/receipt | COMMIT | PERSISTED_VERIFIED | verified UoW | M14 ? M14 ? M14 |

Scoped counts: `{"filing":1,"requests":1,"attempts":1,"blobs":3,"artifacts":3,"packages":1,"members":3,"receipts":1,"lineages":1,"lineage_members":3}`.

| G | corrupt logical blob readback | AUTHORITATIVE_REREAD | `SEC_EVENT_BLOB_READBACK_MISMATCH` | `application / UoW` | M14 ? M14 |
| A | isolated amendment chronology | COMMIT | `23514` | `sec_event_assert_amendment_parent` | M14 ? M14 |
| A | amendment fork | INSERT | `23505` | `sec_event_filing_identities_amendment_parent_filing_identit_key` | M14 ? M14 |
| D | blob | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | M15 ? M15 |
| D | locator | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | M15 ? M15 |
| D | document role | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | M15 ? M15 |
| D | source profile | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | M16 ? M16 |
| D | filing identity | AUTHORITATIVE_REREAD | `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT` | `application / UoW` | M17 ? M17 |
| C | artifact references unknown blob | INSERT | `23503` | `sec_event_document_artifacts_blob_id_content_sha256_byte_l_fkey` | M17 ? M17 |
| D | artifact invalid role | INSERT | `23514` | `sec_event_document_artifacts_document_role_check` | M17 ? M17 |
| D | artifact duplicate locator | INSERT | `23505` | `sec_event_document_artifacts_filing_identity_id_canonical_l_key` | M17 ? M17 |
| E | package declared count low | COMMIT | `23514` | `sec_event_assert_package_seal` | M17 ? M17 |
| E | package declared count high | COMMIT | `23514` | `sec_event_assert_package_seal` | M17 ? M17 |
| E | package ordinal gap | COMMIT | `23514` | `sec_event_assert_package_seal` | M17 ? M17 |
| E | package starts at wrong ordinal | COMMIT | `23514` | `sec_event_assert_package_seal` | M17 ? M17 |
| E | package missing primary | COMMIT | `23514` | `sec_event_assert_package_seal` | M17 ? M17 |
| E | package duplicate ordinal | INSERT | `23505` | `sec_event_package_document_members_pkey` | M17 ? M17 |
| E | package extra member | COMMIT | `23514` | `sec_event_assert_package_seal` | M17 ? M17 |
| E | package member from another filing | INSERT | `23503` | `sec_event_package_document_me_artifact_id_artifact_fingerp_fkey` | M17 ? M17 |
| F | lineage declared count low | COMMIT | `23514` | `sec_event_assert_lineage_seal` | M17 ? M17 |
| F | lineage declared count high | COMMIT | `23514` | `sec_event_assert_lineage_seal` | M17 ? M17 |
| F | lineage missing member | COMMIT | `23514` | `sec_event_assert_lineage_seal` | M17 ? M17 |
| F | lineage extra member | COMMIT | `23514` | `sec_event_assert_lineage_seal` | M17 ? M17 |
| F | lineage ordinal gap | COMMIT | `23514` | `sec_event_assert_lineage_seal` | M17 ? M17 |
| F | lineage starts at wrong ordinal | COMMIT | `23514` | `sec_event_assert_lineage_seal` | M17 ? M17 |
| F | lineage duplicate ordinal | INSERT | `23505` | `sec_event_source_lineage_members_pkey` | M17 ? M17 |
| F | lineage member from wrong source profile | COMMIT | `23514` | `sec_event_assert_lineage_seal` | M17 ? M17 |
| F | lineage references a package member that does not exist | INSERT | `23503` | `sec_event_source_lineage_memb_package_id_package_fingerpri_fkey` | M17 ? M17 |
| C | empty bytea is forbidden | INSERT | `23514` | `sec_event_content_blobs_byte_length_limit` | M17 ? M17 |
| C | uppercase digest is forbidden | INSERT | `23514` | `sec_event_content_blobs_sha256_canonical` | M17 ? M17 |
| C | declared octet length mismatch is forbidden | INSERT | `23514` | `sec_event_content_blobs_octet_length_check` | M17 ? M17 |
| C | blob null bytes | INSERT | `23502` | `entity_body` | M17 ? M17 |
| C | blob null sha | INSERT | `23502` | `sha256` | M17 ? M17 |
| C | blob null length | INSERT | `23502` | `byte_length` | M17 ? M17 |
| C | blob blank sha | INSERT | `23514` | `sec_event_content_blobs_sha256_canonical` | M17 ? M17 |
| C | blob uppercase sha | INSERT | `23514` | `sec_event_content_blobs_sha256_canonical` | M17 ? M17 |
| C | blob malformed sha | INSERT | `23514` | `sec_event_content_blobs_sha256_canonical` | M17 ? M17 |
| C | blob zero length | INSERT | `23514` | `sec_event_content_blobs_byte_length_limit` | M17 ? M17 |
| C | blob negative length | INSERT | `23514` | `sec_event_content_blobs_byte_length_limit` | M17 ? M17 |
| C | blob declared octet mismatch | INSERT | `23514` | `sec_event_content_blobs_octet_length_check` | M17 ? M17 |
| C | blob address digest mismatch | INSERT | `23514` | `sec_event_content_blobs_address_check` | M17 ? M17 |
| A | source profile NULL provider | INSERT | `23502` | `provider_id` | M17 ? M17 |
| A | source profile blank provider | INSERT | `23514` | `sec_event_source_profiles_provider_id_canonical` | M17 ? M17 |
| A | source profile whitespace provider | INSERT | `23514` | `sec_event_source_profiles_provider_id_canonical` | M17 ? M17 |
| A | source profile blank endpoint profile | INSERT | `23514` | `sec_event_source_profiles_endpoint_profile_canonical` | M17 ? M17 |
| A | source profile whitespace endpoint profile | INSERT | `23514` | `sec_event_source_profiles_endpoint_profile_canonical` | M17 ? M17 |
| A | source profile blank contract version | INSERT | `23514` | `sec_event_source_profiles_contract_version_canonical` | M17 ? M17 |
| A | source profile whitespace contract version | INSERT | `23514` | `sec_event_source_profiles_contract_version_canonical` | M17 ? M17 |
| A | source profile blank dataset version | INSERT | `23514` | `sec_event_source_profiles_dataset_version_canonical` | M17 ? M17 |
| A | source profile blank dataset id | INSERT | `23514` | `sec_event_source_profiles_dataset_id_canonical` | M17 ? M17 |
| A | source profile blank profile id | INSERT | `23514` | `sec_event_source_profiles_profile_id_canonical` | M17 ? M17 |
| A | source profile noncanonical profile id | INSERT | `23514` | `sec_event_source_profiles_profile_id_canonical` | M17 ? M17 |
| A | filing unsupported form | INSERT | `23514` | `sec_event_filing_identities_form_check` | M17 ? M17 |
| A | filing missing amendment parent | INSERT | `23503` | `sec_event_filing_identities_amendment_parent_filing_identi_fkey` | M17 ? M17 |
| A | filing amendment parent cross-CIK | INSERT | `23503` | `sec_event_filing_identities_amendment_parent_filing_identi_fkey` | M17 ? M17 |
| B | request references unknown filing identity | INSERT | `23503` | `sec_event_acquisition_request_filing_identity_id_profile_i_fkey` | M17 ? M17 |
| B | attempt unknown request | INSERT | `23503` | `sec_event_acquisition_attempts_request_id_fkey` | M17 ? M17 |
| B | duplicate attempt ordinal | INSERT | `23505` | `sec_event_acquisition_attempts_request_id_attempt_ordinal_key` | M17 ? M17 |
| B | receipt attempt/request mismatch | INSERT | `23503` | `sec_event_acquisition_receipts_attempt_id_request_id_fkey` | M17 ? M17 |
| B | receipt package/filing scope mismatch | INSERT | `23503` | `sec_event_acquisition_receipt_package_id_package_fingerpri_fkey` | M17 ? M17 |
| B | request source profile fingerprint mismatch | INSERT | `23503` | `sec_event_acquisition_request_filing_identity_id_profile_i_fkey` | M17 ? M17 |
| B | attempt starts before request | COMMIT | `23514` | `sec_event_assert_acquisition_chronology` | M17 ? M17 |
| B | receipt retrieved before attempt | COMMIT | `23514` | `sec_event_assert_acquisition_chronology` | M17 ? M17 |
| B | receipt unknown attempt | INSERT | `23503` | `sec_event_acquisition_receipts_attempt_id_request_id_fkey` | M17 ? M17 |
| B | receipt unsupported content encoding | INSERT | `23514` | `sec_event_acquisition_receipts_content_encoding_check` | M17 ? M17 |
| B | request | AUTHORITATIVE_REREAD | `SEC_EVENT_ACQUISITION_REQUEST_AUTHORITY_CONFLICT` | `application / UoW` | M17 ? M17 |
| B | attempt | AUTHORITATIVE_REREAD | `SEC_EVENT_ACQUISITION_ATTEMPT_AUTHORITY_CONFLICT` | `application / UoW` | M17 ? M17 |
| B | receipt | AUTHORITATIVE_REREAD | `SEC_EVENT_ACQUISITION_RECEIPT_AUTHORITY_CONFLICT` | `application / UoW` | M17 ? M17 |
| G | fresh public E2E commit, replay, later receipt | COMMIT | synthetic NON_AUTHORITATIVE, bytes not returned | application ? real UoW | M17 ? M18 ? M18 ? M19 |
| G | spread | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M19 ? M19 |
| G | JSON | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M19 ? M19 |
| G | structured clone | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M19 ? M19 |
| G | fabricated | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M19 ? M19 |
| G | wrong profile | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M19 ? M19 |
| G | wrong filing | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M19 ? M19 |
| G | wrong package | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M19 ? M19 |
| G | wrong lineage | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M19 ? M19 |
| G | fixture mismatch | pre-UoW | `UNTRUSTED_INPUT_NULL` | `application / UoW` | M19 ? M19 |
| G | wrong profile | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | M19 ? M19 |
| G | wrong filing | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | M19 ? M19 |
| G | locator traversal | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | M19 ? M19 |
| G | unsupported encoding | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | M19 ? M19 |
| G | document >8 MiB | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | M19 ? M19 |
| G | package >64 MiB | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | M19 ? M19 |
| G | worker budget >96 MiB within package limit | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | M19 ? M19 |
| G | >32 documents | pre-UoW | `SEC_EVENT_RUNTIME_INPUT_INVALID` | `application / UoW` | M19 ? M19 |
| G | rollback REQUEST | REQUEST | `original injected Error` | `application / UoW` | M19 ? M19 |
| G | rollback REQUEST_ATTEMPT | REQUEST_ATTEMPT | `original injected Error` | `application / UoW` | M19 ? M19 |
| G | rollback BLOB_VERIFIED | BLOB_VERIFIED | `original injected Error` | `application / UoW` | M19 ? M19 |
| G | rollback DOCUMENT_ARTIFACTS | DOCUMENT_ARTIFACTS | `original injected Error` | `application / UoW` | M19 ? M19 |
| G | rollback PACKAGE_PARENT | PACKAGE_PARENT | `original injected Error` | `application / UoW` | M19 ? M19 |
| G | rollback PACKAGE_MEMBERS | PACKAGE_MEMBERS | `original injected Error` | `application / UoW` | M19 ? M19 |
| G | rollback RECEIPT | RECEIPT | `original injected Error` | `application / UoW` | M19 ? M19 |
| G | rollback LINEAGE_PARENT | LINEAGE_PARENT | `original injected Error` | `application / UoW` | M19 ? M19 |
| G | rollback LINEAGE_MEMBERS | LINEAGE_MEMBERS | `original injected Error` | `application / UoW` | M19 ? M19 |
| G | rollback BEFORE_COMMIT | BEFORE_COMMIT | `original injected Error` | `application / UoW` | M19 ? M19 |
| G | deferred COMMIT validation | COMMIT | `23514` | `sec_event_assert_acquisition_chronology` | M19 ? M19 |
| G | injected infrastructure 57014 | BLOB_VERIFIED | `57014` | `application / UoW` | M19 ? M19 |
| G | injected infrastructure 40001 | BLOB_VERIFIED | `40001` | `application / UoW` | M19 ? M19 |
| G | injected infrastructure 40P01 | BLOB_VERIFIED | `40P01` | `application / UoW` | M19 ? M19 |
| G | fresh identical race | COMMIT | 2 fulfilled; starts=2; retries=0 | uniqueness + reread | M19 ? M20 |
| G | fresh conflicting race | AUTHORITATIVE_REREAD | SEC_EVENT_ACQUISITION_REQUEST_AUTHORITY_CONFLICT (1 fulfilled / 1 rejected) | request identity guard | M20 ? M21 |
| G | update sec_event_source_profiles | UPDATE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | delete sec_event_source_profiles | DELETE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | update sec_event_filing_identities | UPDATE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | delete sec_event_filing_identities | DELETE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | update sec_event_acquisition_requests | UPDATE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | delete sec_event_acquisition_requests | DELETE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | update sec_event_acquisition_attempts | UPDATE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | delete sec_event_acquisition_attempts | DELETE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | update sec_event_content_blobs | UPDATE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | delete sec_event_content_blobs | DELETE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | update sec_event_document_artifacts | UPDATE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | delete sec_event_document_artifacts | DELETE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | update sec_event_filing_packages | UPDATE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | delete sec_event_filing_packages | DELETE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | update sec_event_package_document_members | UPDATE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | delete sec_event_package_document_members | DELETE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | update sec_event_acquisition_receipts | UPDATE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | delete sec_event_acquisition_receipts | DELETE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | update sec_event_source_lineages | UPDATE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | delete sec_event_source_lineages | DELETE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | update sec_event_source_lineage_members | UPDATE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |
| G | delete sec_event_source_lineage_members | DELETE | `55000` | `sec_event_reject_mutation` | M21 ? M21 |

Fresh public fixture result (IDs, fingerprints and counts only):

```json
{
  "first": {
    "profileId": "sec-edgar-synthetic-fixture-profile/v1",
    "filingIdentityId": "11b6bb98b7d722588268e83ba0ae5e1be3ef73923f020c668170b52cb9468876",
    "packageId": "6727c78fc10f99389a6365c53b14820f8694792df3d1dfa09103372e3b429dde",
    "packageFingerprint": "f605bcd1a77ca46d4172b40c21a11e2ec200783f8262f253034a63ef678caa39",
    "receiptId": "5a20fef9082ee745e9e1d335fb6d8eb00c3d82fa7daa636968898615c2b9d019",
    "lineageId": "b886db67d7cf144902ed8e428514aa95bed851809a07c150de108e351a0070fc",
    "documentCount": 2,
    "memberCount": 3,
    "blobCount": 3,
    "status": "PERSISTED_VERIFIED",
    "classification": "SYNTHETIC_NON_AUTHORITATIVE",
    "eventAuthorityEligible": false
  },
  "later": {
    "profileId": "sec-edgar-synthetic-fixture-profile/v1",
    "filingIdentityId": "11b6bb98b7d722588268e83ba0ae5e1be3ef73923f020c668170b52cb9468876",
    "packageId": "6727c78fc10f99389a6365c53b14820f8694792df3d1dfa09103372e3b429dde",
    "packageFingerprint": "f605bcd1a77ca46d4172b40c21a11e2ec200783f8262f253034a63ef678caa39",
    "receiptId": "b6f5ef336ac59d90730c5be00cf2fa722afcb0e00c01578dd825fd8945264b3f",
    "lineageId": "b886db67d7cf144902ed8e428514aa95bed851809a07c150de108e351a0070fc",
    "documentCount": 2,
    "memberCount": 3,
    "blobCount": 3,
    "status": "PERSISTED_VERIFIED",
    "classification": "SYNTHETIC_NON_AUTHORITATIVE",
    "eventAuthorityEligible": false
  }
}
```

### Exact eleven-table count maps

```json
{
  "M1": {
    "sec_event_source_profiles": 1,
    "sec_event_filing_identities": 1,
    "sec_event_acquisition_requests": 1,
    "sec_event_acquisition_attempts": 1,
    "sec_event_content_blobs": 3,
    "sec_event_document_artifacts": 3,
    "sec_event_filing_packages": 1,
    "sec_event_package_document_members": 3,
    "sec_event_acquisition_receipts": 1,
    "sec_event_source_lineages": 1,
    "sec_event_source_lineage_members": 3
  },
  "M2": {
    "sec_event_source_profiles": 1,
    "sec_event_filing_identities": 1,
    "sec_event_acquisition_requests": 1,
    "sec_event_acquisition_attempts": 2,
    "sec_event_content_blobs": 3,
    "sec_event_document_artifacts": 3,
    "sec_event_filing_packages": 1,
    "sec_event_package_document_members": 3,
    "sec_event_acquisition_receipts": 2,
    "sec_event_source_lineages": 1,
    "sec_event_source_lineage_members": 3
  },
  "M3": {
    "sec_event_source_profiles": 1,
    "sec_event_filing_identities": 3,
    "sec_event_acquisition_requests": 3,
    "sec_event_acquisition_attempts": 4,
    "sec_event_content_blobs": 7,
    "sec_event_document_artifacts": 7,
    "sec_event_filing_packages": 3,
    "sec_event_package_document_members": 7,
    "sec_event_acquisition_receipts": 4,
    "sec_event_source_lineages": 3,
    "sec_event_source_lineage_members": 7
  },
  "M4": {
    "sec_event_source_profiles": 1,
    "sec_event_filing_identities": 4,
    "sec_event_acquisition_requests": 4,
    "sec_event_acquisition_attempts": 5,
    "sec_event_content_blobs": 9,
    "sec_event_document_artifacts": 10,
    "sec_event_filing_packages": 4,
    "sec_event_package_document_members": 10,
    "sec_event_acquisition_receipts": 5,
    "sec_event_source_lineages": 4,
    "sec_event_source_lineage_members": 10
  },
  "M5": {
    "sec_event_source_profiles": 2,
    "sec_event_filing_identities": 5,
    "sec_event_acquisition_requests": 4,
    "sec_event_acquisition_attempts": 5,
    "sec_event_content_blobs": 9,
    "sec_event_document_artifacts": 10,
    "sec_event_filing_packages": 4,
    "sec_event_package_document_members": 10,
    "sec_event_acquisition_receipts": 5,
    "sec_event_source_lineages": 4,
    "sec_event_source_lineage_members": 10
  },
  "M6": {
    "sec_event_source_profiles": 2,
    "sec_event_filing_identities": 6,
    "sec_event_acquisition_requests": 4,
    "sec_event_acquisition_attempts": 5,
    "sec_event_content_blobs": 9,
    "sec_event_document_artifacts": 10,
    "sec_event_filing_packages": 4,
    "sec_event_package_document_members": 10,
    "sec_event_acquisition_receipts": 5,
    "sec_event_source_lineages": 4,
    "sec_event_source_lineage_members": 10
  },
  "M7": {
    "sec_event_source_profiles": 2,
    "sec_event_filing_identities": 7,
    "sec_event_acquisition_requests": 5,
    "sec_event_acquisition_attempts": 7,
    "sec_event_content_blobs": 9,
    "sec_event_document_artifacts": 13,
    "sec_event_filing_packages": 5,
    "sec_event_package_document_members": 13,
    "sec_event_acquisition_receipts": 7,
    "sec_event_source_lineages": 5,
    "sec_event_source_lineage_members": 13
  },
  "M8": {
    "sec_event_source_profiles": 2,
    "sec_event_filing_identities": 7,
    "sec_event_acquisition_requests": 5,
    "sec_event_acquisition_attempts": 7,
    "sec_event_content_blobs": 9,
    "sec_event_document_artifacts": 13,
    "sec_event_filing_packages": 6,
    "sec_event_package_document_members": 15,
    "sec_event_acquisition_receipts": 7,
    "sec_event_source_lineages": 5,
    "sec_event_source_lineage_members": 13
  },
  "M9": {
    "sec_event_source_profiles": 2,
    "sec_event_filing_identities": 8,
    "sec_event_acquisition_requests": 6,
    "sec_event_acquisition_attempts": 8,
    "sec_event_content_blobs": 11,
    "sec_event_document_artifacts": 15,
    "sec_event_filing_packages": 7,
    "sec_event_package_document_members": 17,
    "sec_event_acquisition_receipts": 8,
    "sec_event_source_lineages": 6,
    "sec_event_source_lineage_members": 15
  },
  "M10": {
    "sec_event_source_profiles": 2,
    "sec_event_filing_identities": 8,
    "sec_event_acquisition_requests": 6,
    "sec_event_acquisition_attempts": 8,
    "sec_event_content_blobs": 11,
    "sec_event_document_artifacts": 15,
    "sec_event_filing_packages": 7,
    "sec_event_package_document_members": 17,
    "sec_event_acquisition_receipts": 8,
    "sec_event_source_lineages": 8,
    "sec_event_source_lineage_members": 18
  },
  "M11": {
    "sec_event_source_profiles": 2,
    "sec_event_filing_identities": 9,
    "sec_event_acquisition_requests": 7,
    "sec_event_acquisition_attempts": 9,
    "sec_event_content_blobs": 12,
    "sec_event_document_artifacts": 18,
    "sec_event_filing_packages": 8,
    "sec_event_package_document_members": 20,
    "sec_event_acquisition_receipts": 9,
    "sec_event_source_lineages": 9,
    "sec_event_source_lineage_members": 21
  },
  "M12": {
    "sec_event_source_profiles": 2,
    "sec_event_filing_identities": 9,
    "sec_event_acquisition_requests": 7,
    "sec_event_acquisition_attempts": 10,
    "sec_event_content_blobs": 12,
    "sec_event_document_artifacts": 18,
    "sec_event_filing_packages": 8,
    "sec_event_package_document_members": 20,
    "sec_event_acquisition_receipts": 10,
    "sec_event_source_lineages": 9,
    "sec_event_source_lineage_members": 21
  },
  "M13": {
    "sec_event_source_profiles": 2,
    "sec_event_filing_identities": 10,
    "sec_event_acquisition_requests": 8,
    "sec_event_acquisition_attempts": 11,
    "sec_event_content_blobs": 13,
    "sec_event_document_artifacts": 21,
    "sec_event_filing_packages": 9,
    "sec_event_package_document_members": 23,
    "sec_event_acquisition_receipts": 11,
    "sec_event_source_lineages": 10,
    "sec_event_source_lineage_members": 24
  },
  "M14": {
    "sec_event_source_profiles": 2,
    "sec_event_filing_identities": 11,
    "sec_event_acquisition_requests": 9,
    "sec_event_acquisition_attempts": 12,
    "sec_event_content_blobs": 15,
    "sec_event_document_artifacts": 24,
    "sec_event_filing_packages": 10,
    "sec_event_package_document_members": 26,
    "sec_event_acquisition_receipts": 12,
    "sec_event_source_lineages": 11,
    "sec_event_source_lineage_members": 27
  },
  "M15": {
    "sec_event_source_profiles": 2,
    "sec_event_filing_identities": 12,
    "sec_event_acquisition_requests": 10,
    "sec_event_acquisition_attempts": 13,
    "sec_event_content_blobs": 16,
    "sec_event_document_artifacts": 27,
    "sec_event_filing_packages": 11,
    "sec_event_package_document_members": 29,
    "sec_event_acquisition_receipts": 13,
    "sec_event_source_lineages": 12,
    "sec_event_source_lineage_members": 30
  },
  "M16": {
    "sec_event_source_profiles": 3,
    "sec_event_filing_identities": 13,
    "sec_event_acquisition_requests": 10,
    "sec_event_acquisition_attempts": 13,
    "sec_event_content_blobs": 16,
    "sec_event_document_artifacts": 27,
    "sec_event_filing_packages": 11,
    "sec_event_package_document_members": 29,
    "sec_event_acquisition_receipts": 13,
    "sec_event_source_lineages": 12,
    "sec_event_source_lineage_members": 30
  },
  "M17": {
    "sec_event_source_profiles": 3,
    "sec_event_filing_identities": 14,
    "sec_event_acquisition_requests": 10,
    "sec_event_acquisition_attempts": 13,
    "sec_event_content_blobs": 16,
    "sec_event_document_artifacts": 27,
    "sec_event_filing_packages": 11,
    "sec_event_package_document_members": 29,
    "sec_event_acquisition_receipts": 13,
    "sec_event_source_lineages": 12,
    "sec_event_source_lineage_members": 30
  },
  "M18": {
    "sec_event_source_profiles": 3,
    "sec_event_filing_identities": 15,
    "sec_event_acquisition_requests": 11,
    "sec_event_acquisition_attempts": 14,
    "sec_event_content_blobs": 17,
    "sec_event_document_artifacts": 30,
    "sec_event_filing_packages": 12,
    "sec_event_package_document_members": 32,
    "sec_event_acquisition_receipts": 14,
    "sec_event_source_lineages": 13,
    "sec_event_source_lineage_members": 33
  },
  "M19": {
    "sec_event_source_profiles": 3,
    "sec_event_filing_identities": 15,
    "sec_event_acquisition_requests": 11,
    "sec_event_acquisition_attempts": 15,
    "sec_event_content_blobs": 17,
    "sec_event_document_artifacts": 30,
    "sec_event_filing_packages": 12,
    "sec_event_package_document_members": 32,
    "sec_event_acquisition_receipts": 15,
    "sec_event_source_lineages": 13,
    "sec_event_source_lineage_members": 33
  },
  "M20": {
    "sec_event_source_profiles": 3,
    "sec_event_filing_identities": 16,
    "sec_event_acquisition_requests": 12,
    "sec_event_acquisition_attempts": 16,
    "sec_event_content_blobs": 18,
    "sec_event_document_artifacts": 33,
    "sec_event_filing_packages": 13,
    "sec_event_package_document_members": 35,
    "sec_event_acquisition_receipts": 16,
    "sec_event_source_lineages": 14,
    "sec_event_source_lineage_members": 36
  },
  "M21": {
    "sec_event_source_profiles": 3,
    "sec_event_filing_identities": 17,
    "sec_event_acquisition_requests": 13,
    "sec_event_acquisition_attempts": 17,
    "sec_event_content_blobs": 20,
    "sec_event_document_artifacts": 36,
    "sec_event_filing_packages": 14,
    "sec_event_package_document_members": 38,
    "sec_event_acquisition_receipts": 17,
    "sec_event_source_lineages": 15,
    "sec_event_source_lineage_members": 39
  }
}
```

## Catalog and security evidence

Both runs verify 11 tables, 114 columns, 91 constraints, 16 ordered FKs, 8 deferred triggers and 5 new functions. All PK/UNIQUE/FK/CHECK constraints are validated. All required descriptor keys exist. All FK child prefixes are indexed. No duplicate index definition or view is introduced.

Each new table: RLS enabled; policy count=0; PUBLIC/anon/authenticated/service_role SELECT/INSERT/UPDATE/DELETE privileges false. Migration revokes ALL client privileges. Eleven immutable triggers are active. All five new functions are SECURITY INVOKER, `search_path=public, pg_temp`, with EXECUTE revoked from PUBLIC/anon/authenticated/service_role. No SECURITY DEFINER or client byte download path.

Existing baseline function `reject_intelligence_mutation()` is invoker with `search_path=public`, not `public, pg_temp`. It is reported separately and is not used by the new SEC tables; their immutable trigger uses the dedicated `sec_event_reject_mutation()`.

| Function | Invoker | search_path | Client EXECUTE |
|---|---|---|---|
| sec_event_assert_acquisition_chronology | True | search_path=public, pg_temp | false for all four roles |
| sec_event_assert_amendment_parent | True | search_path=public, pg_temp | false for all four roles |
| sec_event_assert_lineage_seal | True | search_path=public, pg_temp | false for all four roles |
| sec_event_assert_package_seal | True | search_path=public, pg_temp | false for all four roles |
| sec_event_reject_mutation | True | search_path=public, pg_temp | false for all four roles |

| Table | Column | Type | NOT NULL |
|---|---|---|---|
| sec_event_acquisition_attempts | attempt_id | text | True |
| sec_event_acquisition_attempts | fingerprint | character(64) | True |
| sec_event_acquisition_attempts | request_id | text | True |
| sec_event_acquisition_attempts | attempt_ordinal | integer | True |
| sec_event_acquisition_attempts | started_at | timestamp with time zone | True |
| sec_event_acquisition_attempts | material | jsonb | True |
| sec_event_acquisition_receipts | receipt_id | text | True |
| sec_event_acquisition_receipts | fingerprint | character(64) | True |
| sec_event_acquisition_receipts | request_id | text | True |
| sec_event_acquisition_receipts | attempt_id | text | True |
| sec_event_acquisition_receipts | filing_identity_id | text | True |
| sec_event_acquisition_receipts | package_id | text | True |
| sec_event_acquisition_receipts | package_fingerprint | character(64) | True |
| sec_event_acquisition_receipts | retrieved_at | timestamp with time zone | True |
| sec_event_acquisition_receipts | effective_available_at | timestamp with time zone | True |
| sec_event_acquisition_receipts | response_status | integer | True |
| sec_event_acquisition_receipts | content_encoding | text | True |
| sec_event_acquisition_receipts | response_material_fingerprint | character(64) | True |
| sec_event_acquisition_receipts | material | jsonb | True |
| sec_event_acquisition_requests | request_id | text | True |
| sec_event_acquisition_requests | fingerprint | character(64) | True |
| sec_event_acquisition_requests | idempotency_key | text | True |
| sec_event_acquisition_requests | profile_id | text | True |
| sec_event_acquisition_requests | profile_fingerprint | character(64) | True |
| sec_event_acquisition_requests | filing_identity_id | text | True |
| sec_event_acquisition_requests | requested_at | timestamp with time zone | True |
| sec_event_acquisition_requests | material | jsonb | True |
| sec_event_content_blobs | blob_id | text | True |
| sec_event_content_blobs | sha256 | character(64) | True |
| sec_event_content_blobs | byte_length | integer | True |
| sec_event_content_blobs | storage_contract_version | text | True |
| sec_event_content_blobs | entity_body | bytea | True |
| sec_event_content_blobs | stored_at | timestamp with time zone | True |
| sec_event_content_blobs | readback_verified | boolean | True |
| sec_event_content_blobs | retention_classification | text | True |
| sec_event_content_blobs | deletion_legal_hold_status | text | True |
| sec_event_content_blobs | material | jsonb | True |
| sec_event_document_artifacts | artifact_id | text | True |
| sec_event_document_artifacts | fingerprint | character(64) | True |
| sec_event_document_artifacts | filing_identity_id | text | True |
| sec_event_document_artifacts | blob_id | text | True |
| sec_event_document_artifacts | content_sha256 | character(64) | True |
| sec_event_document_artifacts | byte_length | integer | True |
| sec_event_document_artifacts | document_role | text | True |
| sec_event_document_artifacts | document_type | text | True |
| sec_event_document_artifacts | sequence_ordinal | integer | True |
| sec_event_document_artifacts | canonical_locator | text | True |
| sec_event_document_artifacts | content_type | text | True |
| sec_event_document_artifacts | canonicalization_version | text | True |
| sec_event_document_artifacts | material | jsonb | True |
| sec_event_filing_identities | filing_identity_id | text | True |
| sec_event_filing_identities | profile_id | text | True |
| sec_event_filing_identities | profile_fingerprint | character(64) | True |
| sec_event_filing_identities | cik | text | True |
| sec_event_filing_identities | accession_number | text | True |
| sec_event_filing_identities | form | text | True |
| sec_event_filing_identities | amendment_parent_filing_identity_id | text | False |
| sec_event_filing_identities | material | jsonb | True |
| sec_event_filing_packages | package_id | text | True |
| sec_event_filing_packages | fingerprint | character(64) | True |
| sec_event_filing_packages | filing_identity_id | text | True |
| sec_event_filing_packages | filing_date | date | True |
| sec_event_filing_packages | acceptance_at | timestamp with time zone | False |
| sec_event_filing_packages | report_period | date | False |
| sec_event_filing_packages | filing_index_artifact_id | text | True |
| sec_event_filing_packages | filing_index_artifact_fingerprint | character(64) | True |
| sec_event_filing_packages | member_count | integer | True |
| sec_event_filing_packages | declared_document_count | integer | True |
| sec_event_filing_packages | material | jsonb | True |
| sec_event_package_document_members | package_id | text | True |
| sec_event_package_document_members | package_fingerprint | character(64) | True |
| sec_event_package_document_members | filing_identity_id | text | True |
| sec_event_package_document_members | member_ordinal | integer | True |
| sec_event_package_document_members | artifact_id | text | True |
| sec_event_package_document_members | artifact_fingerprint | character(64) | True |
| sec_event_package_document_members | document_role | text | True |
| sec_event_package_document_members | document_type | text | True |
| sec_event_package_document_members | sequence_ordinal | integer | True |
| sec_event_package_document_members | canonical_locator | text | True |
| sec_event_package_document_members | is_primary | boolean | True |
| sec_event_package_document_members | material | jsonb | True |
| sec_event_source_lineage_members | lineage_id | text | True |
| sec_event_source_lineage_members | member_ordinal | integer | True |
| sec_event_source_lineage_members | package_id | text | True |
| sec_event_source_lineage_members | package_fingerprint | character(64) | True |
| sec_event_source_lineage_members | package_member_ordinal | integer | True |
| sec_event_source_lineage_members | artifact_id | text | True |
| sec_event_source_lineage_members | artifact_fingerprint | character(64) | True |
| sec_event_source_lineage_members | material | jsonb | True |
| sec_event_source_lineages | lineage_id | text | True |
| sec_event_source_lineages | fingerprint | character(64) | True |
| sec_event_source_lineages | profile_id | text | True |
| sec_event_source_lineages | profile_fingerprint | character(64) | True |
| sec_event_source_lineages | member_count | integer | True |
| sec_event_source_lineages | member_set_fingerprint | character(64) | True |
| sec_event_source_lineages | material | jsonb | True |
| sec_event_source_profiles | profile_id | text | True |
| sec_event_source_profiles | fingerprint | character(64) | True |
| sec_event_source_profiles | contract_version | text | True |
| sec_event_source_profiles | provider_id | text | True |
| sec_event_source_profiles | dataset_id | text | True |
| sec_event_source_profiles | dataset_version | text | True |
| sec_event_source_profiles | endpoint_profile | text | True |
| sec_event_source_profiles | hostname_allowlist | jsonb | True |
| sec_event_source_profiles | path_template | text | True |
| sec_event_source_profiles | method | text | True |
| sec_event_source_profiles | supported_forms | jsonb | True |
| sec_event_source_profiles | authentication_kind | text | True |
| sec_event_source_profiles | accepted_content_encoding | jsonb | True |
| sec_event_source_profiles | request_identity_policy | text | True |
| sec_event_source_profiles | max_timeout_ms | integer | True |
| sec_event_source_profiles | max_response_bytes | integer | True |
| sec_event_source_profiles | max_package_documents | integer | True |
| sec_event_source_profiles | material | jsonb | True |

| Constraint | Kind | Validated | Exact definition |
|---|---|---|---|
| sec_event_acquisition_attempts_attempt_id_request_id_key | u | True | `UNIQUE (attempt_id, request_id)` |
| sec_event_acquisition_attempts_attempt_ordinal_check | c | True | `CHECK ((attempt_ordinal >= 0))` |
| sec_event_acquisition_attempts_pkey | p | True | `PRIMARY KEY (attempt_id)` |
| sec_event_acquisition_attempts_request_id_attempt_ordinal_key | u | True | `UNIQUE (request_id, attempt_ordinal)` |
| sec_event_acquisition_attempts_request_id_fkey | f | True | `FOREIGN KEY (request_id) REFERENCES sec_event_acquisition_requests(request_id)` |
| sec_event_attempt_chronology_deferred | t | True | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| sec_event_attempt_identity_fingerprint_key | u | True | `UNIQUE (attempt_id, fingerprint)` |
| sec_event_acquisition_receipt_package_id_package_fingerpri_fkey | f | True | `FOREIGN KEY (package_id, package_fingerprint, filing_identity_id) REFERENCES sec_event_filing_packages(package_id, fingerprint, filing_identity_id)` |
| sec_event_acquisition_receipt_receipt_id_package_id_package_key | u | True | `UNIQUE (receipt_id, package_id, package_fingerprint)` |
| sec_event_acquisition_receipt_request_id_filing_identity_i_fkey | f | True | `FOREIGN KEY (request_id, filing_identity_id) REFERENCES sec_event_acquisition_requests(request_id, filing_identity_id)` |
| sec_event_acquisition_receipts_attempt_id_request_id_fkey | f | True | `FOREIGN KEY (attempt_id, request_id) REFERENCES sec_event_acquisition_attempts(attempt_id, request_id)` |
| sec_event_acquisition_receipts_content_encoding_check | c | True | `CHECK ((content_encoding = 'identity'::text))` |
| sec_event_acquisition_receipts_pkey | p | True | `PRIMARY KEY (receipt_id)` |
| sec_event_acquisition_receipts_receipt_id_fingerprint_key | u | True | `UNIQUE (receipt_id, fingerprint)` |
| sec_event_receipt_chronology_deferred | t | True | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| sec_event_acquisition_request_filing_identity_id_profile_i_fkey | f | True | `FOREIGN KEY (filing_identity_id, profile_id, profile_fingerprint) REFERENCES sec_event_filing_identities(filing_identity_id, profile_id, profile_fingerprint)` |
| sec_event_acquisition_request_request_id_filing_identity_id_key | u | True | `UNIQUE (request_id, filing_identity_id)` |
| sec_event_acquisition_requests_pkey | p | True | `PRIMARY KEY (request_id)` |
| sec_event_acquisition_requests_profile_id_idempotency_key_key | u | True | `UNIQUE (profile_id, idempotency_key)` |
| sec_event_acquisition_requests_request_id_fingerprint_key | u | True | `UNIQUE (request_id, fingerprint)` |
| sec_event_request_chronology_deferred | t | True | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| sec_event_content_blobs_address_check | c | True | `CHECK ((blob_id = ((('sha256:'::text || (sha256)::text) || ':'::text) || byte_length)))` |
| sec_event_content_blobs_blob_id_sha256_byte_length_key | u | True | `UNIQUE (blob_id, sha256, byte_length)` |
| sec_event_content_blobs_byte_length_limit | c | True | `CHECK (((byte_length >= 1) AND (byte_length <= 8388608)))` |
| sec_event_content_blobs_deletion_legal_hold_status_check | c | True | `CHECK ((deletion_legal_hold_status = 'NOT_APPROVED'::text))` |
| sec_event_content_blobs_octet_length_check | c | True | `CHECK ((octet_length(entity_body) = byte_length))` |
| sec_event_content_blobs_pkey | p | True | `PRIMARY KEY (blob_id)` |
| sec_event_content_blobs_retention_classification_check | c | True | `CHECK ((retention_classification = 'NOT_APPROVED'::text))` |
| sec_event_content_blobs_sha256_canonical | c | True | `CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text))` |
| sec_event_content_blobs_sha256_key | u | True | `UNIQUE (sha256)` |
| sec_event_content_blobs_storage_contract_version_check | c | True | `CHECK ((storage_contract_version = 'sec-event-document-byte-storage-decision/v1'::text))` |
| sec_event_artifact_role_sequence_key | u | True | `UNIQUE (artifact_id, fingerprint, document_role, sequence_ordinal)` |
| sec_event_document_artifacts_artifact_id_fingerprint_filing_key | u | True | `UNIQUE (artifact_id, fingerprint, filing_identity_id, document_role, sequence_ordinal, canonical_locator)` |
| sec_event_document_artifacts_artifact_id_fingerprint_key | u | True | `UNIQUE (artifact_id, fingerprint)` |
| sec_event_document_artifacts_blob_id_content_sha256_byte_l_fkey | f | True | `FOREIGN KEY (blob_id, content_sha256, byte_length) REFERENCES sec_event_content_blobs(blob_id, sha256, byte_length)` |
| sec_event_document_artifacts_document_role_check | c | True | `CHECK ((document_role = ANY (ARRAY['FILING_INDEX'::text, 'PRIMARY_DOCUMENT'::text, 'EXHIBIT'::text])))` |
| sec_event_document_artifacts_filing_identity_id_canonical_l_key | u | True | `UNIQUE (filing_identity_id, canonical_locator)` |
| sec_event_document_artifacts_filing_identity_id_fkey | f | True | `FOREIGN KEY (filing_identity_id) REFERENCES sec_event_filing_identities(filing_identity_id)` |
| sec_event_document_artifacts_pkey | p | True | `PRIMARY KEY (artifact_id)` |
| sec_event_document_artifacts_sequence_ordinal_check | c | True | `CHECK ((sequence_ordinal >= 0))` |
| sec_event_filing_identities_amendment_parent_filing_identi_fkey | f | True | `FOREIGN KEY (amendment_parent_filing_identity_id, profile_id, cik) REFERENCES sec_event_filing_identities(filing_identity_id, profile_id, cik)` |
| sec_event_filing_identities_amendment_parent_filing_identit_key | u | True | `UNIQUE (amendment_parent_filing_identity_id)` |
| sec_event_filing_identities_check | c | True | `CHECK (((amendment_parent_filing_identity_id IS NULL) OR (amendment_parent_filing_identity_id <> filing_identity_id)))` |
| sec_event_filing_identities_filing_identity_id_profile_id_c_key | u | True | `UNIQUE (filing_identity_id, profile_id, cik)` |
| sec_event_filing_identities_filing_identity_id_profile_id_p_key | u | True | `UNIQUE (filing_identity_id, profile_id, profile_fingerprint)` |
| sec_event_filing_identities_form_check | c | True | `CHECK ((form = ANY (ARRAY['8-K'::text, '8-K/A'::text])))` |
| sec_event_filing_identities_pkey | p | True | `PRIMARY KEY (filing_identity_id)` |
| sec_event_filing_identities_profile_id_cik_accession_number_key | u | True | `UNIQUE (profile_id, cik, accession_number, form)` |
| sec_event_filing_identities_profile_id_profile_fingerprint_fkey | f | True | `FOREIGN KEY (profile_id, profile_fingerprint) REFERENCES sec_event_source_profiles(profile_id, fingerprint)` |
| sec_event_filing_identity_amendment_deferred | t | True | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| sec_event_filing_identity_material_scope_key | u | True | `UNIQUE (filing_identity_id, profile_id, profile_fingerprint, cik, accession_number, form)` |
| sec_event_filing_package_seal_deferred | t | True | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| sec_event_filing_packages_declared_document_count_check | c | True | `CHECK (((declared_document_count >= 1) AND (declared_document_count <= 32)))` |
| sec_event_filing_packages_filing_identity_id_fkey | f | True | `FOREIGN KEY (filing_identity_id) REFERENCES sec_event_filing_identities(filing_identity_id)` |
| sec_event_filing_packages_filing_index_artifact_id_filing__fkey | f | True | `FOREIGN KEY (filing_index_artifact_id, filing_index_artifact_fingerprint) REFERENCES sec_event_document_artifacts(artifact_id, fingerprint)` |
| sec_event_filing_packages_member_count_check | c | True | `CHECK (((member_count >= 2) AND (member_count <= 33)))` |
| sec_event_filing_packages_package_id_fingerprint_filing_ide_key | u | True | `UNIQUE (package_id, fingerprint, filing_identity_id)` |
| sec_event_filing_packages_package_id_fingerprint_key | u | True | `UNIQUE (package_id, fingerprint)` |
| sec_event_filing_packages_pkey | p | True | `PRIMARY KEY (package_id)` |
| sec_event_package_document_me_artifact_id_artifact_fingerp_fkey | f | True | `FOREIGN KEY (artifact_id, artifact_fingerprint, filing_identity_id, document_role, sequence_ordinal, canonical_locator) REFERENCES sec_event_document_artifacts(artifact_id, fingerprint, filing_identity_id, document_role, sequence_ordinal, canonical_locator)` |
| sec_event_package_document_me_package_id_package_fingerpri_fkey | f | True | `FOREIGN KEY (package_id, package_fingerprint, filing_identity_id) REFERENCES sec_event_filing_packages(package_id, fingerprint, filing_identity_id)` |
| sec_event_package_document_me_package_id_package_fingerpri_key1 | u | True | `UNIQUE (package_id, package_fingerprint, canonical_locator)` |
| sec_event_package_document_me_package_id_package_fingerpri_key2 | u | True | `UNIQUE (package_id, package_fingerprint, member_ordinal, artifact_id, artifact_fingerprint)` |
| sec_event_package_document_me_package_id_package_fingerprin_key | u | True | `UNIQUE (package_id, package_fingerprint, artifact_id)` |
| sec_event_package_document_member_seal_deferred | t | True | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| sec_event_package_document_members_member_ordinal_check | c | True | `CHECK ((member_ordinal >= 0))` |
| sec_event_package_document_members_pkey | p | True | `PRIMARY KEY (package_id, package_fingerprint, member_ordinal)` |
| sec_event_source_lineage_memb_lineage_id_package_id_package_key | u | True | `UNIQUE (lineage_id, package_id, package_fingerprint, package_member_ordinal)` |
| sec_event_source_lineage_memb_package_id_package_fingerpri_fkey | f | True | `FOREIGN KEY (package_id, package_fingerprint, package_member_ordinal, artifact_id, artifact_fingerprint) REFERENCES sec_event_package_document_members(package_id, package_fingerprint, member_ordinal, artifact_id, artifact_fingerprint)` |
| sec_event_source_lineage_member_seal_deferred | t | True | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| sec_event_source_lineage_members_lineage_id_fkey | f | True | `FOREIGN KEY (lineage_id) REFERENCES sec_event_source_lineages(lineage_id)` |
| sec_event_source_lineage_members_member_ordinal_check | c | True | `CHECK ((member_ordinal >= 0))` |
| sec_event_source_lineage_members_pkey | p | True | `PRIMARY KEY (lineage_id, member_ordinal)` |
| sec_event_source_lineage_seal_deferred | t | True | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| sec_event_source_lineages_lineage_id_fingerprint_key | u | True | `UNIQUE (lineage_id, fingerprint)` |
| sec_event_source_lineages_lineage_id_profile_id_profile_fin_key | u | True | `UNIQUE (lineage_id, profile_id, profile_fingerprint)` |
| sec_event_source_lineages_member_count_check | c | True | `CHECK (((member_count >= 1) AND (member_count <= 33)))` |
| sec_event_source_lineages_pkey | p | True | `PRIMARY KEY (lineage_id)` |
| sec_event_source_lineages_profile_id_profile_fingerprint_fkey | f | True | `FOREIGN KEY (profile_id, profile_fingerprint) REFERENCES sec_event_source_profiles(profile_id, fingerprint)` |
| sec_event_source_profiles_contract_version_canonical | c | True | `CHECK ((contract_version ~ '^[a-z][a-z0-9-]*/v[1-9][0-9]*$'::text))` |
| sec_event_source_profiles_dataset_id_canonical | c | True | `CHECK ((dataset_id ~ '^[a-z][a-z0-9-]*$'::text))` |
| sec_event_source_profiles_dataset_version_canonical | c | True | `CHECK ((dataset_version ~ '^[a-z][a-z0-9-]*/v[1-9][0-9]*$'::text))` |
| sec_event_source_profiles_endpoint_profile_canonical | c | True | `CHECK ((endpoint_profile ~ '^[A-Z][A-Z0-9_]*$'::text))` |
| sec_event_source_profiles_method_canonical | c | True | `CHECK ((method ~ '^[A-Z][A-Z0-9_-]*$'::text))` |
| sec_event_source_profiles_path_template_canonical | c | True | `CHECK (((path_template = btrim(path_template)) AND ("left"(path_template, 1) = '/'::text) AND (POSITION(('..'::text) IN (path_template)) = 0)))` |
| sec_event_source_profiles_pkey | p | True | `PRIMARY KEY (profile_id)` |
| sec_event_source_profiles_profile_id_canonical | c | True | `CHECK ((profile_id ~ '^[a-z][a-z0-9-]*/v[1-9][0-9]*$'::text))` |
| sec_event_source_profiles_profile_id_fingerprint_key | u | True | `UNIQUE (profile_id, fingerprint)` |
| sec_event_source_profiles_provider_id_canonical | c | True | `CHECK ((provider_id ~ '^[A-Z][A-Z0-9_]*$'::text))` |
| sec_event_source_profiles_provider_id_dataset_id_dataset_ve_key | u | True | `UNIQUE (provider_id, dataset_id, dataset_version)` |
| sec_event_source_profiles_request_identity_policy_canonical | c | True | `CHECK ((request_identity_policy ~ '^[a-z][a-z0-9-]*/v[1-9][0-9]*$'::text))` |

| Trigger | DEFERRABLE | INITIALLY DEFERRED | Enabled |
|---|---|---|---|
| sec_event_filing_identity_amendment_deferred | True | True | O |
| sec_event_filing_package_seal_deferred | True | True | O |
| sec_event_package_document_member_seal_deferred | True | True | O |
| sec_event_source_lineage_seal_deferred | True | True | O |
| sec_event_source_lineage_member_seal_deferred | True | True | O |
| sec_event_request_chronology_deferred | True | True | O |
| sec_event_attempt_chronology_deferred | True | True | O |
| sec_event_receipt_chronology_deferred | True | True | O |

## Local lint, advisors, and quality gates

`migration list --local` matches all 37 files and ends at `20261002090638`. `db lint --local` reports no schema errors. Local advisors exit 0 with no new actionable finding: the new tables have eleven expected RLS/no-policy INFO entries and five unused-index INFO entries in the recorded run. Existing findings are 27 unindexed-FK INFO, 113 other unused-index INFO, 48 other RLS/no-policy INFO and two duplicate-index WARN entries on `intelligence_source_artifacts` / `intelligence_source_envelopes`. No unrelated schema cleanup was performed.

| Gate | Result |
|---|---|
| Runtime integration, same database without reset | 55/55 twice |
| Runtime unit tests | 40/40 twice |
| SEC fixture/provenance/byte-storage/mapping/corroboration/persistence regressions | 100/100, seven files |
| Full unit suite | 824 passed, 35 intentionally skipped, 859 total |
| Typecheck / lint | pass |
| npm audit --audit-level=high | 0 vulnerabilities |
| npm ls --all | exit 0 |
| git diff --check | pass before commit |

The final commit is followed by detached tracked-only `npm ci` / `npm run build` with zero `.env*` files (only disposable tracked `.env.example` removed). The exact final SHA, build result, remote SHA and cleanup are recorded in the completion response because the build must use the already committed SHA. No approval is inferred from this build.

## Scope, seam, memory and approvals

The private artifact writer is accessible only through the integration Vitest loader, which appends an export to a test module copy; production exports no factory/trust bypass or WeakSet mutator. No production source imports the virtual module. The normal UoW guard checks same-runtime trust before BEGIN. Detached application bundles are inspected for the virtual module/test sentinel markers. See [artifact conflict evidence](SEC_EDGAR_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICTS.md) for coordinated relational scopes.

Memory admission reserves `2 * package octets + 4 * largest document octets <= 96 MiB`. The independent 64 MiB package ceiling is not a promise that every package beneath it fits the memory budget. This is byte-payload reservation, not a measured process-RSS cap. A sealed body has one private snapshot shared by its material/authority projections; driver encoding/readback is bounded to one document at a time. No PostgreSQL streaming API is assumed. Additional process overhead and actual production provisioning remain operational approval work.

Retention/deletion remain NOT_APPROVED. Normal UPDATE/DELETE are forbidden. Correction, tombstone, legal deletion and backup/PITR erasure are separate unimplemented workflows. Production remains BLOCKED_BACKEND_UNAPPROVED and all acquisition/storage/persistence/usage approvals remain separate.

## Official documentation control

Checked 2026-10-02: [Supabase changelog](https://supabase.com/changelog), [CLI reference](https://supabase.com/docs/reference/cli/supabase-db-advisors), and [PostgreSQL 17 client connection defaults](https://www.postgresql.org/docs/17/runtime-config-client.html). The relevant changelog minor-upgrade notice addresses ltree/pgcrypto/btree_gist/custom operators; this slice adds no such dependency. CLI commands/flags were checked against pinned 2.117.0 `--help`. Its disposable test image is PostgreSQL 17.6; this local test does not approve a production engine patch level.
