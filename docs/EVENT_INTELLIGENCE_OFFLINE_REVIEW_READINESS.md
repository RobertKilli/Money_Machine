# Offline review readiness reference

This development-only reference flow evaluates local review milestone evidence alongside an independently composed V2 queue. It does not change routing progression, queue classification, or production authority.

## Evaluation references

`evaluateOfflineReviewSessionWithReference` evaluates the session's complete in-memory operation inventory and returns the existing immutable evaluation plus an opaque, module-local reference. The reference captures the exact session, candidate, routing evaluation, decision, milestone, policy, cutoff, result, and a private monotonically increasing session operation revision. Successful issuance, correction, and simulated revocation increment that revision; rejected operations do not. Freshness validation takes each expected value separately and rejects copied or serialized references, cross-session bindings, mismatched expectations, and references from an earlier operation revision.

This is process-local freshness detection. It is not a persisted snapshot, historical seal, digest identity, trusted clock, external source inventory, or provenance authority. The session's inventory guarantee remains limited to successful operations performed through that exact session.

## Readiness dimensions

The readiness API keeps three results separate: local milestone outcome, actual V2 queue status/priority/blockers, and authority/progression that remain unestablished. `COMPLETED_PROCEED` completes only the local synthetic milestone. It cannot remove queue blockers or move routing. `COMPLETED_STOP` is a local stop, and `HELD` remains insufficient/contested evidence. A stale evaluation cannot become proceed by fallback.

The V2 composition retains a private exact fixture binding for its members. Readiness uses the exact candidate object in that composition and checks the expected authentic routing context, candidate, decision, and shared cutoff. The milestone session may use a separate authentic reviewable routing evaluation for the same candidate and cutoff because the composed terminal route is not necessarily eligible for evidence issuance. IDs alone do not establish either binding.

## Demonstration boundaries

`/intelligence/events/review/offline-demo/review-readiness` is gated by exact `NODE_ENV === "development"`. Its closed client DTO contains only display-safe labels, actual queue status/blockers, local outcome, and fixed cutoff/status text. Session handles, evaluation references, attestations, routing objects, and private candidate identifiers remain server-side. Filters change only the displayed variants.

The fixtures are fixed synthetic examples. Synthetic issuer/reviewer labels do not authenticate a real reviewer. There is no policy-content verification, actual reviewer authorization, lifecycle authority, persistence, or production-readiness claim.
