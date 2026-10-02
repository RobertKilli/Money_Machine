# SEC event-document byte storage decision

Decision contract: `sec-event-document-byte-storage-decision/v1`  
Reviewed and official-source control date: 2026-10-02  
Status: technical candidate selected; production remains `BLOCKED_BACKEND_UNAPPROVED`.

This is a design decision only. It creates no storage adapter, SQL, migration, repository, live acquisition, or persisted bytes. A technical selection does not approve live acquisition, raw-byte storage, normalized storage, authority persistence, retention, redistribution, or commercial use. Each remains `NOT_APPROVED` pending its own source, legal, usage, security, backup, and operations review.

## Decision

Choose **A: PostgreSQL `bytea` in the same immutable artifact record and transaction as its manifest and package membership** for the first production-capable architecture. If PostgreSQL is hosted by Supabase, the same decision still applies; Storage buckets are not used for authoritative bytes in v1. This gives one transaction boundary, one authoritative reread, and one database backup/restore unit. It is a candidate architecture, not permission to deploy it.

### Alternatives

| Option | Technical fit | Operational fit | Decision |
|---|---|---|---|
| A. PostgreSQL `bytea` | Exact binary octets; reread and SHA-256 within the transaction; manifest, bytes, package membership and authority commit or roll back together. TOAST handles oversized attributes transparently. | Database growth, WAL, backup duration and restore size grow with raw bytes. Whole-value reads require bounded application memory. Reasonable for bounded SEC documents/packages and easiest to restore consistently. | **Selected for v1** with strict local limits below; reassess only with measured volume/restore evidence. |
| B. Private Supabase Storage + PostgreSQL manifest | Private bucket/RLS and content-addressed keys are useful, but a separate Storage API write and DB commit cannot be atomic. Readback plus SHA-256 verifies bytes but does not close that gap. Service keys bypass RLS. Storage API metadata is separate from object bytes. | Database backups do not include Storage objects; restore can leave manifest/object generations mismatched. Supabase S3 compatibility does not provide versioning or Object Lock. This creates orphan and missing-object reconciliation work. | Rejected for first authority backend. It can be reconsidered only with separately approved durability/reconciliation controls. |
| C. External S3-compatible/object storage | Can provide exact-byte readback with independent content hashing if configured and verified. An immutable/content-addressed locator alone does not guarantee write-once. Provider-specific versioning, retention lock, checksum, credential and conditional-write behavior must be proven. | Additional provider lock-in, credentials, billing, egress, lifecycle and recovery procedures. Object Lock/WORM is provider-specific; no such capability is assumed for Supabase. Cross-service atomicity remains absent. | Rejected for v1 as added operational complexity without a current scale need. |
| D. Fingerprint/URL only | Fingerprint can identify bytes if already available; a URL can locate a mutable or unavailable representation. Neither reconstructs and authoritatively rereads the original octets. | Low storage cost but cannot satisfy custody/replay/readback. | Rejected as authoritative storage. |

Technical, operational, and approval judgments are separate: A is technically and operationally suitable within the limits below; no candidate has production approval. The source-provenance decision remains the authority for SEC identity boundaries; this contract specifies the byte backend only.

## Versioned byte identity

The strict `sec-event-document-byte-storage-decision/v1` binds the byte contract version, backend kind, SHA-256-derived blob ID, lowercase SHA-256 over the exact HTTP entity-body octets, byte length, validated content type, content-encoding policy, provider and immutable source-profile identity/fingerprint, filing-package ID, canonical document locator, and document role. The digest input is the entity body after HTTP transfer framing has been removed by the HTTP client but before charset decoding, text extraction, newline conversion, Unicode normalization, or parsing. Request `Accept-Encoding: identity`; reject an unexpected `Content-Encoding`. No decoded/extracted string is an acceptable substitute.

`blobId = "sha256:" + lowercaseHex(SHA256(entityBodyOctets))`. The content hash and length are checked against any declared index/manifest metadata but are calculated from the bytes themselves. `storedAt`, receipt, readback time and verification event are receipt/audit metadata and do not enter document-artifact identity. The artifact identity binds source profile, filing/package scope, canonical locator, role, media type, byte length, canonicalization/byte-contract version and content digest according to the provenance contract. It does not bind arrival time.

Canonical locators are SEC archive-relative paths only, with canonical separators and no scheme, authority, query, fragment, dot segment, percent-decoded traversal or alternate spelling. Media type is descriptive metadata, not proof: validate permitted type against magic/grammar appropriate to the declared document kind without transforming the bytes used for the digest.

## Limits and transaction shape

| Bound | v1 limit | Basis |
|---|---:|---|
| One document | 8 MiB (8,388,608 octets) | Local safety/transaction and memory cap, not PostgreSQL's documented field maximum. Leaves room for filing exhibits while bounding whole-value hashing/reread. |
| One filing package | 64 MiB (67,108,864 octets) aggregate | Local safety cap; bounds one transaction, WAL burst and backup growth. |
| Documents per package | 32 | Local cap sized for index, primary filing and a bounded exhibit set; reject larger packages rather than silently truncate. |
| Receive / digest | Bounded streaming into a capped transaction-owned buffer; reject as soon as a limit is exceeded. | v1 does not use chunk tables or PostgreSQL Large Objects. |
| Acquisition timeout | 15 seconds per document | Local request budget; incomplete streams are rejected and never persisted. |
| Readback | In-transaction bytea reread; compare length and recompute full SHA-256 before commit. | No partial/range result may establish full-object authority. |

PostgreSQL documents binary `bytea` as raw octets, supports TOAST for large variable-length values, and documents a 1 GB field limit. That is a platform hard limit, not a safe application limit. TOAST can compress/store out-of-line; it does not remove WAL, table/TOAST bloat, backup, whole-value memory or restore costs. A v1 query never selects bytea in list views; only the bounded server-only artifact read path loads it. Avoid UPDATE churn; immutable inserts reduce, but do not eliminate, MVCC/WAL and vacuum costs. Migration cost is schema-light but backup and restore costs scale with accumulated bytes. Do not use the separate Large Object facility: it requires transaction-scoped stream operations and has separate lifecycle/permission concerns with no benefit inside our small bound.

## Write/readback protocol

Minimal states: `RECEIVED -> BYTES_VERIFIED -> AUTHORITY_COMMITTED`, with terminal `REJECTED`. A failed commit leaves no durable intermediate state. On connection loss with unknown commit outcome, retry performs an authoritative lookup and verifies the complete row; it never assumes failure or success.

1. Receive HTTP entity-body octets under the fixed SEC profile, identity encoding, 15-second timeout and both document/package budgets. Reject redirects, invalid status, locator, content encoding/type, package duplicates and any over-limit stream.
2. Hash incrementally while counting exact octets; reject empty/invalid material, compare declared digest/length where supplied, and compute `sha256:<digest>`.
3. In one PostgreSQL transaction, insert bytea and manifest plus exact package membership using unique immutable identity constraints. No `ON CONFLICT DO UPDATE`, upsert, overwrite or delete path exists. A key collision is reread: identical material is idempotent replay; any different bytes, length, profile, locator, role or package binding is a conflict and fails closed.
4. Reread the candidate bytea and manifest through the same transaction connection. Recompute SHA-256 over every octet, compare exact length, scope, identity and package membership. Only this verified material may be used to seal/commit database authority. If reread or validation fails, roll back the whole transaction.
5. Later reads repeat bounded length and SHA-256 verification before returning authoritative bytes. Missing row, null/short bytes, mismatch, or database error means no authority result; return a sanitized failure and record a separate integrity incident without mutating historical identity.

Atomicity includes the artifact bytes, manifest, package membership and any authority rows committed in the same PostgreSQL transaction. It does not include SEC's server or external approval systems. Crash before commit rolls back everything. A committed-but-later-missing/mismatched row is a database integrity/restore incident, not an orphan that can be silently repaired. Restore a consistent verified backup or append an explicitly reviewed correction. Identical replay reuses a verified immutable row. Concurrent identical inserts serialize on unique keys and reread; concurrent different-byte collisions reject. No object-store orphan state exists. Any unreferenced database candidate is not authority; reconciliation only verifies rows reached through immutable manifest/package references and cannot promote bytes by fingerprint alone.

## Security, backup, retention, cost

All access goes through a server-only adapter and a dedicated command path. Resolve credentials only at the final server boundary. Never return raw database errors, secrets, credentials, entity bodies or secret-bearing paths in logs/results. Deny by default; no browser DB/storage credentials or client insert/update/delete. For Supabase Postgres, enable RLS on authority tables with no client policies and revoke direct client access. Do not use the service-role key as a general mutation path; if unavoidable for a narrowly scoped server adapter, encapsulate it there and enforce immutable insert-only operations at database constraints/triggers plus command validation. `SECURITY DEFINER`/generic write APIs are out of scope.

PostgreSQL database backup/PITR covers bytea with its row and manifest in the database recovery unit. Verify hashes after restore. Backup size, WAL, database storage and database egress grow with raw octets; `bytea` avoids a separately billed Storage object/egress tier but still consumes database quota/egress. Supabase Storage prices object GB-hours and egress separately; this is not a cost comparison against a chosen provider quote. No volume/cost approval is implied. Local logical backup and restore must include bytea rows and validate fingerprints. Local tests can use pure in-memory octet fixtures and the project's PostgreSQL test boundary; Supabase's official local stack includes Storage but requires a container runtime, and this slice intentionally runs no CLI, Docker or backend.

Retention is `UNAPPROVED_PENDING_TERMS_REVIEW`; no deletion is authorized. Legal hold blocks deletion. An approved retention policy must define schedule, hold, backup expiry, verified deletion and auditable status transitions before implementation. Deletion is explicit and separately authorized, never an automatic expiry side effect. SEC usage terms, raw-byte storage, retention, redistribution, commercial use and legal basis all remain blockers.

## Official source register

Official primary documentation and changelog pages checked on **2026-10-02**. The contract records each title, URL and UTC check date.

| Page | Relevant evidence |
|---|---|
| [Supabase March 2026 Developer Update / Storage security overhaul](https://supabase.com/changelog/43465-developer-update-march-2026) | Storage architecture/security changes; SQL metadata deletion can orphan provider objects. |
| [Storage schema](https://supabase.com/docs/guides/storage/schema/design) | Postgres stores bucket/object metadata, bytes live in a provider; schema read-only; metadata deletion does not delete provider object. |
| [Bucket fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals) | Private by default; private read/download requires RLS or limited signed URL; public bucket bypasses read access control. |
| [Storage access control](https://supabase.com/docs/guides/storage/security/access-control) | Upload requires INSERT policy; overwrite/upsert additionally requires SELECT/UPDATE; service keys bypass RLS. |
| [Standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads) | Existing path rejects by default; upsert enables overwrite; first successful same-path concurrent upload wins without upsert, last wins with upsert; recommends new path. |
| [Download objects](https://supabase.com/docs/guides/storage/management/download-objects) | API/SDK and S3 download options; file metadata is separate from bytes. |
| [S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility) | Interoperable upload APIs; S3 versioning unsupported; delete is permanent; Object Lock operations unsupported. ETag is not relied upon as SHA-256. |
| [Storage limits](https://supabase.com/docs/guides/storage/uploads/file-limits) | Free global limit up to 50 MB; paid plans up to 500 GB; bucket limit can further restrict. Separate from local application cap. |
| [Storage pricing](https://supabase.com/docs/guides/storage/pricing) and [egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress) | Storage billed by object GB-hours above quota; service egress billed by data/service tier above quota. |
| [Supabase backups](https://supabase.com/docs/guides/platform/backups) | Database backups do not include Storage API objects; restore does not restore objects deleted after backup. |
| [Supabase local development](https://supabase.com/docs/guides/local-development) | Local Postgres/Auth/Storage stack exists; requires container runtime and is not production-hardened. |
| [PostgreSQL binary data](https://www.postgresql.org/docs/current/datatype-binary.html), [limits](https://www.postgresql.org/docs/current/limits.html), [TOAST](https://www.postgresql.org/docs/current/storage-toast.html) | `bytea` stores octets; current documented field limit 1 GB; TOAST stores/compresses oversized attributes. |
| [PostgreSQL transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html), [backup](https://www.postgresql.org/docs/current/backup.html) | Transaction rollback/commit boundary and database backup/restore approaches. |
| [PostgreSQL large objects](https://www.postgresql.org/docs/current/largeobjects.html) | Stream-style large-object facility exists for values inconvenient to handle whole; not selected for bounded v1. |

No ETag guarantee was found that makes ETag a SHA-256 content identity; the contract requires hashing read bytes. S3 compatibility provides interoperability, not provider-neutral immutability, atomicity, durability or legal approval. Backup documentation is operational capability, not a project-specific RPO/RTO or durability SLA.

## Exact next implementation slice

After source/legal approval for raw SEC-byte storage and explicit backend, retention, backup/RPO/RTO and operational sign-off, implement only the PostgreSQL bytea bounded server adapter and forward-only schema/UoW: immutable manifest/blob/package membership, transaction-local authoritative reread/hash, RLS/client-deny/insert-only constraints, crash/replay/concurrency tests, and local PostgreSQL integration. Keep acquisition and authority persistence separately blocked until their own approvals and slices.
