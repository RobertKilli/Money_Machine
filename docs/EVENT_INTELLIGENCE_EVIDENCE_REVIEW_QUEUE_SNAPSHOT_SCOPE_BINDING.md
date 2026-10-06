# Evidence review queue snapshot scope binding

Local contract: `event-intelligence-evidence-review-queue-snapshot-scope-binding/v1`.
Parent: `f9ad447ea2e25954244765af790209ee4b3a5262`.

This server-only, in-memory verifier composes the existing [scope verifier](EVENT_INTELLIGENCE_EVIDENCE_REVIEW_QUEUE_SCOPE_IDENTITY.md) and [snapshot codec](EVENT_INTELLIGENCE_EVIDENCE_REVIEW_QUEUE_SNAPSHOT_CODEC.md). It checks local byte integrity and scope identity equality against an explicit caller expectation. It does not implement a storage read, activate a registry or restore domain runtime trust.

## Explicit inputs and error order

`verifyEvidenceReviewQueueSnapshotScopeBinding(snapshotBytes, expectedSnapshotDigest, expectedScopeIdentity, expectedScopeMaterial)` requires four separate arguments, accepted as unknown values for runtime validation. None is optional. The expected digest, identity and material are supplied independently by the caller, never extracted from the envelope. They may still be untrusted caller assertions; the API does not authenticate their source or use them as an access-control boundary.

Validation stops at the first failing stage:

1. Call `verifyEvidenceReviewQueueScopeIdentity(expectedScopeMaterial, expectedScopeIdentity)`. Parent ordering is identity syntax, material validation, then fresh identity computation/comparison. Malformed identity or material maps to `{ status: "INVALID", code: "EXPECTED_SCOPE_INVALID", scopeCode }`, retaining only the parent's bounded error enum. A valid identity unequal to material maps to `{ status: "INVALID", code: "EXPECTED_SCOPE_IDENTITY_MISMATCH" }`.
2. Call `decodeEvidenceReviewQueueSnapshot(snapshotBytes, expectedSnapshotDigest)`. Parent byte bounds, digest, fatal UTF-8, exact schema/version and canonical byte checks remain intact. Rejection maps to `{ status: "INVALID", code: "SNAPSHOT_CODEC_REJECTED", codecCode }`, retaining only the parent's bounded error enum and its ordering.
3. Compare `decoded.envelope.scopeIdentity` to the freshly verified expected identity with exact string equality. Inequality maps to `{ status: "INVALID", code: "SNAPSHOT_SCOPE_MISMATCH" }`.

Missing expected material/identity always fails stage 1. With valid scope expectations, a missing digest fails the codec. There is no accept-any-scope mode, fallback, coercion, registry lookup or automatic selection. Previous builder, decoded or binding result objects cannot replace material/bytes; public parent validation runs on every call. Errors are frozen plain status/code objects, with only fixed enum details: no bytes, raw material, caller strings or stack traces.

## Result and isolation

Success returns a frozen plain object with exactly:

* `status: "VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE"`
* `contractVersion`: the local binding contract version above
* `scopeIdentity`: the freshly verified expected identity, equal to envelope scope
* `canonicalScopeMaterial`: the scope verifier's immutable canonical string
* `snapshotDigest`: the codec's recomputed digest of the supplied canonical snapshot bytes
* `envelope`: the codec's isolated, deeply frozen plain-data envelope and payload

The result retains no caller-owned mutable references and returns no bytes. The original byte array and scope arrays are not mutated. Later caller mutation cannot change the returned immutable data. Status describes the successfully checked data in this result, not the caller's later edited input. No domain capability, WeakSet trust, authority fingerprint or authentication status is attached. BLOCKED payloads remain BLOCKED; non-blocked historical projections retain their statuses and historical flags.

Scope still uses the unchanged 18,264-byte material bound, canonical profile, SHA-256 algorithm and `event-intelligence-evidence-review-queue-snapshot-scope/v1` plus one NUL-byte prefix. The existing scope golden identity, snapshot v1 wire format and codec golden bytes/digest are unchanged. Cutoff remains envelope metadata: changing it changes snapshot bytes/digest, not scope identity. This verifier neither ranks cutoffs nor selects a current/latest snapshot.

## Authority and production limits

Success proves only that the supplied bytes passed the existing codec, expected identity matches supplied syntactic scope material, and envelope scope equals that expectation. It does not prove policy-content integrity, policy existence/approval, authorized access, correct universe or queue membership, authentic composition, provenance, corroboration or event authority. A caller that supplies both bytes and expectations can construct matching assertions. No hostile-Proxy sandbox or concurrency runtime is claimed; the existing parent input limits and guarantees apply.

Still missing are an authentic expectation source; an approved scope/policy registry; verified policy content; authenticated composition under those policies; provenance parent/member membership and sealing; approved storage-read semantics; and separately approved current-selection. The [scope/provenance](EVENT_INTELLIGENCE_EVIDENCE_REVIEW_QUEUE_SNAPSHOT_SCOPE_PROVENANCE_DECISION.md) and [read-model decisions](EVENT_INTELLIGENCE_EVIDENCE_REVIEW_QUEUE_READ_MODEL_DECISION.md) remain blocked design contracts.

The verifier is not imported by production loader, UI, routes or composition. Production keeps null selected scope/authority/strategy/backend, empty active scope/provenance selections, no active source family, BLOCKED persistence/read/current-selection/signal/trading, NOT_APPROVED approvals and UNSUPPORTED authority upgrade. This slice adds no storage/persistence, SQL/migration/schema/FK claim, database integration, source acquisition, scheduler, notification, registry activation or production wiring; dependencies and lockfile remain unchanged.
