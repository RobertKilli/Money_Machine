# Evidence review queue snapshot manifest binding

Contract: `event-intelligence-evidence-review-queue-snapshot-manifest-binding/v1`.
Parent: `402165534a1d0ce4f7efee8c2940351b1e68fb97`.

## Inputs and fixed validation order

`verifyEvidenceReviewQueueSnapshotManifestBinding(snapshotBytes, expectedSnapshotDigest, expectedScopeIdentity, expectedScopeMaterial, manifestInput)` takes five required, separate runtime arguments, all validated by the existing parent APIs. Snapshot expectations are never inferred from the envelope or manifest. Missing arguments cannot activate a fallback. All expectations may still be caller supplied and are not authenticated or an access-control boundary.

Validation stops at the first failure:

1. `verifyEvidenceReviewQueueSnapshotScopeBinding` checks the caller's expected scope identity/material, decodes and checks the snapshot bytes against the caller's expected digest, and compares the envelope scope with the recomputed expected identity. Its closed error object is nested unchanged under `SNAPSHOT_SCOPE_BINDING_REJECTED`.
2. `parseEvidenceReviewQueueSnapshotProvenanceManifest` validates the complete manifest syntax and exact member/root bindings. Its bounded error code is returned as `MANIFEST_SYNTAX_REJECTED`.
3. The parsed manifest root digest must equal the codec-recomputed snapshot digest, else `MANIFEST_SNAPSHOT_DIGEST_MISMATCH`.
4. The manifest root scope must equal the verified envelope/expected scope identity, else `MANIFEST_SNAPSHOT_SCOPE_MISMATCH`.
5. Every correction-lineage reference is checked against the verified envelope cutoff. A mismatch returns `CORRECTION_CUTOFF_MISMATCH`.

Both parent contracts require the exact `YYYY-MM-DDTHH:mm:ss.sssZ` UTC representation, a valid date and an `toISOString()` round trip. The binding therefore compares strings exactly: this is both same-instant and same-canonical-representation equality. It uses no additional date parser or normalization. Missing or malformed `evaluationAsOf` rejects earlier in the family parser. A BLOCKED payload with null internal evaluation time stays BLOCKED; agreement with envelope cutoff does not grant evaluation status or authority. If there are no correction references, the check has no matches and establishes no correction completeness.

## Result and proof limits

Success returns a closed `VERIFIED_LOCAL_MANIFEST_BINDING_NON_AUTHORITATIVE` result containing the binding contract version, verified scope identity, codec-recomputed snapshot digest, isolated immutable decoded envelope, and isolated immutable parsed manifest. It returns no bytes, scope material, caller-owned reference, mutable success marker, digest of the manifest, seal, trust token, or authority capability. The parent APIs clone and freeze their respective data; the binding result is frozen as well. Caller bytes and manifest input are not modified or frozen.

Success proves only that the existing snapshot/scope binding passed, the manifest is syntactically valid, its declared root digest/scope match the verified snapshot, and each declared correction cutoff matches the envelope cutoff. A different syntactically valid inventory with the same snapshot and scope binding can also pass. There is no manifest digest/signature or seal here.

This does not prove an authentic expectation source, manifest integrity against a separate digest/signature, canonical member sorting beyond parent ordinals, parent existence, source-family classification, policy content/approval/access, composition authenticity, provenance completeness, origin independence, corroboration, event authority, or signal/trading authority. No snapshot selection or current/latest decision is made.

The manifest remains a snapshot-level syntactic reference inventory, not row-level derivation. Canonical manifest bytes/sealing, an authentic producer, parent resolvers, provenance completeness, derivation edges, storage-read and current selection remain absent or blocked. Production loader, UI, routes, composition and active registries do not import or invoke this verifier; production access, persistence, signal and trading gates remain blocked.
