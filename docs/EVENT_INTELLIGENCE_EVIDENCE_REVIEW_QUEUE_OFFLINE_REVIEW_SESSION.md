# Offline review session reference

## Boundary and API

`event-intelligence-offline-review-session/v1` is a server-only, ephemeral layer over the existing milestone evidence issuer and verifier. `createOfflineReviewSession` accepts one authentic synthetic discovery candidate, one exact authentic routing result for the built-in routing decision, and a closed configuration containing the milestone, fixed synthetic policy, and fixed synthetic issuer/reviewer context. The returned session handle is an in-process capability reference: its visible frozen shape and a JSON copy do not restore authenticity.

`issueOfflineReviewSessionEvidence`, `revokeOfflineReviewSessionEvidence`, and `evaluateOfflineReviewSession` operate on that exact handle. Successful issuance references and revocation events are appended to its private inventory. Caller-provided parent handles must be authentic and belong to the same session; parent evidence issued through the lower-level API cannot be imported. The evaluator takes no caller evidence array. It passes the complete session-owned as-of reference set to `validateOfflineReviewMilestoneEvidence`, retaining the parent verifier's `inventoryScope: SUPPLIED_AUTHENTIC_REFERENCES_ONLY` unchanged.

The session result's `inventoryGuarantee: EXACT_SESSION_OPERATIONS_ONLY` means it includes every successful evidence operation recorded through that exact in-memory session whose `issuedAt` is at or before its cutoff. It does not prove that no evidence exists outside the session. There is no process-wide issuance/history registry, persisted ID, background process, or cross-session inventory. Dropping the handle allows its WeakMap-backed session state to become collectible.

Bounds are 16 attestations, correction depth 8 (root depth zero), and 8 revocation operations per session. A duplicate evidence ID, foreign parent, over-bound operation, invalid parent result, or invalid revocation is rejected with a bounded code and does not append a session entry. Independent roots and branches are representable; the parent verifier returns a hold for conflicts present in the complete session inventory. Timestamp and array order do not choose a winner.

## Time and parent-verifier constraints

An attestation becomes part of a session evaluation when its `issuedAt` is less than or equal to the requested cutoff. Later-issued attestations are excluded from that as-of set. Since a correction's parent must have an earlier `issuedAt`, the complete available ancestor chain is present whenever that correction is included. A later correction does not rewrite an earlier returned evaluation.

The current parent verifier also binds `evaluationCutoff` to the exact routing result's `evaluationAsOf`. Session evaluation therefore accepts only that bound cutoff; another canonical time is rejected as `EVALUATION_CUTOFF_MISMATCH`. The demo compares earlier and later observations with separate sessions and separately bound synthetic chains. It does not pass one routing result or one attestation through arbitrary historical cutoffs and does not implement general as-of retrieval.

Revocation is an append-only session operation and applies when its caller-declared `simulatedRevokedAt` is at or before the session cutoff. A later declared revocation does not affect the earlier cutoff result. These times are synthetic caller data without a trusted clock or revoker identity; the demonstration tests local cutoff behavior only. The lower-level parent API still owns the evidence revocation marker and validation rule. Session isolation is enforced by opaque per-session evidence handles and private inventory membership.

## Result meanings and authority limits

An empty as-of inventory returns `NO_REVIEW_EVIDENCE`. `COMPLETED_PROCEED` and `COMPLETED_STOP` are local completed milestone outcomes with distinct meanings; `HELD` always reports `EVIDENCE_INSUFFICIENT`. None changes routing state or queue blockers. `COMPLETED_PROCEED` does not establish aggregate progression permission.

The parent contract remains unchanged: discovery fingerprint means normalized discovery-material identity, not complete claim/source/lifecycle revision identity; stage history alone is not review; issuer/reviewer labels and policy references are fixed synthetic declarations; parser success is syntax only; the parent evidence inventory scope remains caller-supplied references only. Session completeness is limited to operations in one exact offline session and does not establish reviewer authorization, policy application, source or lifecycle authority, external evidence completeness, or production authorization. No UI action can issue, revoke, or approve evidence; the demonstration is server-composed and read-only. Nothing is persisted or connected to V1/V2 queue evaluation, production configuration, manifests, codecs, or routing progression.
