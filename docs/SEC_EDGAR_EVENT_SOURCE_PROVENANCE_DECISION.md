# SEC EDGAR event source provenance decision

Contract: `sec-edgar-event-source-provenance-decision/v1`
Reviewed: 2026-10-02
Status: design only. No SQL, migration, acquisition, persistence, or production approval is authorized by this decision.

## Decision

Choose **Option C: a separate SEC event-document provenance authority**, provider-neutral in its content identity and SEC-scoped in its first acquisition profile. It has distinct immutable filing-package, document-artifact, receipt, and sealed document-lineage identities. It may reuse generic request/attempt/lifecycle primitives only after a future contract proves their request and retry semantics fit SEC acquisition; it does not place SEC documents in M5 market-data `SourceLineage` by relabeling identifiers.

Reject **A (direct SourceLineage reuse)**. Applied M5 lineage members are not free-standing document-members: they require a retrieval-observed availability claim, source envelope, ingestion observation, attempt, provider/dataset/version scope, and `effective_available_at` matching `retrieved_at`. They seal those observation members. M5 `source_envelopes` store normalized/auditable JSONB and fingerprints; `source_artifacts` store provider identity plus payload fingerprints, not canonical SEC bytes or filing-package membership. Neither represents a filing index, primary/exhibit roles, or amendment parent. A `provider_external_record_id` value cannot establish any of those semantics. `market_observations` is explicitly a measured asset value with observation time/unit and cannot represent documents.

Reject **B (a bridge authority over the current M5 material)**. A bridge is useful only after both parent authorities already establish the same canonical bytes and the exact filing/document scope. Current M5 artifact/envelope parents do not persist that SEC document authority, so a bridge would merely assert byte equivalence. External IDs and caller-supplied hashes do not make that assertion true.

## Applied-schema inventory

The applied source of truth is the tracked migration chain, principally `20260911000000_m3_intelligence_foundation.sql`, `20260916212845_m5_mapping_lineage.sql`, `20260917000051_m5_ingestion_provenance.sql`, `20260917012625_m5_source_lineage.sql`, `20260918234933_m5_provider_asset_identity.sql`, `20260918215043_m5_raw_source_lineage.sql`, and `20260921205811_m5_suspicious_coverage_authority.sql`. Existing keys below are described in exact migration column order; none of those applied migrations is changed by this decision.

| Existing object | Identity / parents and required semantics | Market observation? | Availability claim? | Canonical SEC bytes / package membership / amendment history | Scope and reuse |
|---|---|---:|---:|---|---|
| `intelligence_ingestion_requests` | request fingerprint, idempotency key, provider/dataset/version; FK `(dataset_id,provider_id,dataset_version)` | No | No | No / No / No | M5 acquisition request; `VALID_WITH_EXPLICIT_BINDING` only if a future SEC request profile is bound |
| `intelligence_ingestion_attempts` | request ID, attempt ordinal/fingerprint; exact request and contract FKs | No | No | No / No / No | M5 attempt lifecycle; explicit SEC request binding needed |
| `intelligence_ingestion_events` | append-only attempt sequence/type/fingerprint; observation FK for `SOURCE_OBSERVED` | No | No | No / No / limited lifecycle only | M5 lifecycle; not a filing correction chain |
| `intelligence_source_artifacts` | artifact identity, provider/dataset/version, namespace/external ID/revision, payload and artifact fingerprints; dataset FK | No | No | Hash only, bytes not present / No / No | M5 scoped artifact metadata; conditional reuse only after structured SEC byte/package authority exists |
| `intelligence_source_envelopes` | normalized envelope, parser/schema version, payload and envelope fingerprints; exact artifact+payload FK | No | No | JSONB representation only / No / No | M5 normalized data; not a byte-preserving document package |
| `intelligence_ingestion_source_observations` | attempt, artifact, page/item ordinals, `retrieved_at`, metadata/fingerprint; attempt and artifact FKs | No | No | No / No / No | M5 retrieval observation; may describe receipt only under an explicit bridge |
| `intelligence_source_availability_claims` | retrieval-observed basis, envelope, observation, artifact, `effective_available_at`, claim fingerprint; envelope+observation FKs | No | Yes (required) | No / No / No | Not issuer publication authority; does not establish filing availability time by itself |
| `intelligence_source_lineages` | provider/dataset/version, sealed claim IDs/count, time bounds/fingerprint; dataset FK and unique `(source_lineage_id,provider_id,dataset_id,dataset_version)` | No | Yes (through members) | No / No / conditional append-only observed set | M5-specific observation lineage; `INVALID` as SEC document lineage without a distinct explicit authority |
| `intelligence_source_lineage_members` | PK `(source_lineage_id,member_ordinal)`; coverage unique key `(source_lineage_id,member_ordinal,member_fingerprint,availability_claim_id,source_artifact_id,source_envelope_id,source_observation_id,ingestion_attempt_id,provider_id,dataset_id,dataset_version,observed_at,effective_available_at)`; FKs enforce claim/artifact/envelope/observation/attempt scope | No | Yes (required) | No / No / no filing amendment semantics | M5-specific retrieval member; cannot be relabeled as SEC package document member |
| `market_observations` | market observation ID, provider/dataset version, external record, asset, `observed_at`, numeric value/scale/unit and payload fingerprint | Yes (it is the observation) | No | No / No / No | Market facts only; `INVALID` for SEC document provenance |
| `intelligence_asset_mapping_revisions` | mapping revision, its own SourceLineage/provider/dataset/version, canonical asset/identifier/class and fingerprint; full unique key `(mapping_revision_id,source_lineage_id,provider_id,dataset_id,dataset_version,canonical_asset_id,canonical_identifier,asset_class)` | No | Yes through M5 source lineage | No / No / mapping revisions only | Sole canonical asset authority; separate `asset_mapping_provenance`, never SEC source lineage |

The SEC fixture domain has its own filing/package, document-artifact, receipt, and claim fingerprints. It keeps canonical UTF-8 bytes only inside the synthetic pipeline's private runtime data and exposes fingerprints/locators. That identity is not an M5 `source_artifact_id` and is not a persisted source authority.

## Proposed immutable authority model

This decision defines a future relational contract, not executable SQL. The minimum authority family is:

| Future object | Persistence | Identity and relations |
|---|---|---|
| SEC filing package | Required | provider/dataset/version and source contract; CIK, accession, form, filing date, acceptance/publication time (nullable only when explicitly unknown), report period separately, filing-index identity, request-profile version, amendment parent; package ID/fingerprint. Composite FK to dataset owner. |
| SEC document artifact | Required | package ID/fingerprint; canonical locator; role (`PRIMARY_DOCUMENT`, `EXHIBIT`, `FILING_INDEX`, or metadata role); document type; sequence; content/media type; byte length; canonicalization version; SHA-256 over canonical bytes; artifact ID/fingerprint. Package+role+sequence unique. Primary document and each exhibit are separate artifacts. |
| SEC acquisition receipt | Required for acquisition | request/attempt/profile, endpoint profile, response status/material fingerprint, retrieved time, effective availability, receipt ID/fingerprint, and package binding. Receipt is append-only and is not part of document fingerprint. A later receipt creates a new receipt, not a replacement. |
| SEC event-source lineage | Required | lineage ID/fingerprint, package root identity, provider/dataset/version, exact member count and fingerprint, amendment parent reference; immutable. |
| SEC event-source lineage members | Required | contiguous ordinal and exact artifact ID/fingerprint, package ID/fingerprint, role/type/sequence/locator. Sealed set is exactly all package documents declared by its filing index, with one primary. No availability claim or market observation is required. |

Relational columns are required for identity, scope, ordinals, members, and timestamps. JSONB may hold bounded non-authoritative request/response metadata only; it cannot replace package/document/member FKs. SHA fields use lowercase SHA-256. Timestamp columns use `timestamptz`; date-only filing/report periods remain `date` and are not silently promoted to event instants. Every child FK has an exact non-partial parent PK/UNIQUE reference, matching order/types/cardinality and a child index whose leading columns follow the FK order. Parent-owned fingerprints are referenced in composite keys; downstream rows do not copy a fingerprint unless a declared parent UNIQUE+FK structurally binds it.

Filing package identity includes source profile and contract version, CIK, accession, form, filing/report date, acceptance/publication time where known, filing-index identity, document set descriptor identity, amendment parent, and request profile. Document identity includes package binding, canonical locator, role/type/sequence, canonical UTF-8 bytes hash, media type, byte length and canonicalization version. An unchanged primary document keeps the same document ID/fingerprint when a different exhibit changes; package and lineage identity change because their exact member set changed. Amendment packages/documents have new identities and immutable parent links; original records remain.

Receipt identity binds request/attempt and retrieval facts. `retrievedAt` or a changed response receipt never changes document identity. `effectiveAvailableAt` is availability provenance, not filing acceptance or event time. A receipt variation adds receipt provenance without superseding prior receipts. Publication/acceptance, report period, event/signing/completion time and receipt time remain distinct.

The first future contract should not persist duplicate raw source bytes in a second table if an approved immutable object store is later selected. Until then, artifact persistence is **BLOCKED**: a hash and JSON envelope alone are not byte custody. The future decision must specify where bytes are held, re-read/hash verification, retention, access controls, and retention/redistribution/commercial approvals before enabling an acquisition pipeline.

## Three downstream provenance roles

1. **`event_source_provenance`** binds a normalized claim to SEC package ID/fingerprint, exact document artifact ID/fingerprint, document role/locator, SEC event-source lineage ID/fingerprint/member ordinal, provider/dataset/version, CIK/accession/form, extraction contract version, and claim locator/excerpt fingerprint. It never uses mapping lineage.
2. **`issuer_evidence_provenance`** binds each issuer authority evidence member to a typed SEC or other approved source authority and exact artifact/lineage/member identity. `evidence.referenceId` is descriptive metadata only. A later issuer authority contract must fingerprint the structured provenance witness and resolve parent fingerprints authoritatively.
3. **`asset_mapping_provenance`** binds only the existing `AssetMappingRevision` and its own exact composite scope `(mapping_revision_id,source_lineage_id,provider_id,dataset_id,dataset_version,canonical_asset_id,canonical_identifier,asset_class)`. Its parent fingerprint is read from that immutable mapping row. It cannot satisfy either event-source or issuer-evidence provenance.

Later persistence tables must store each family in distinctly named columns (`event_source_*`, `issuer_evidence_*`, `mapping_*`). No shared generic `provider_id`, `dataset_id`, `dataset_version`, or `source_lineage_id` may imply that these authorities are the same. No canonical asset authority is added.

## Strict decision contract and tests

`src/domain/intelligence/sec-edgar-event-source-provenance-decision.ts` provides `sec-edgar-event-source-provenance-decision/v1`. It holds the applied-schema reuse inventory and future FK/key/index descriptors, validates canonical PostgreSQL identifiers and exact parent keys, FK order/type/cardinality, child index prefixes and deep immutable material, and computes a deterministic fingerprint excluding `recordedAt`. Parser output is value-validated but only the canonical factory result has same-runtime trust. Duplicate table/column/key names and unsafe object shapes fail closed.

Synthetic tests verify the two authorities are not conflated, M5 external record IDs cannot assert SEC document authority, receipt and byte identities differ, package/document identities respond to member/content changes according to the stated policy, and amendments retain parent lineage. They do not prove live SEC response semantics or live acquisition.

## Prerequisites before runtime can resume

- Implement and separately review the provider-neutral SEC package/document/receipt/lineage boundary and canonical-byte custody/readback.
- Implement a trusted claim-to-SEC-document provenance witness; no M5 artifact ID substitution.
- Give issuer mapping a structured, fingerprint-bound evidence provenance contract; generic reference IDs remain non-authoritative.
- Revise the event persistence decision and uncommitted runtime migration/application/UoW to use three independent binding families and exact composite parents.
- Build an authentic synthetic application→UoW→PostgreSQL positive path with separate SEC and asset-mapping lineages, plus scope-swap FK/rollback checks.
- Complete retention/usage approvals and later local PostgreSQL integration review before any runtime write is approved.

The uncommitted persistence-runtime migration `20261001191840_event_intelligence_persistence.sql` is not part of this worktree, has not been inspected from the original dirty worktree during this decision task, and is **not approved** by this document. Production acquisition, source artifact/event-lineage/issuer-evidence/event-authority persistence, scheduler, signals and trading all remain `BLOCKED`.
