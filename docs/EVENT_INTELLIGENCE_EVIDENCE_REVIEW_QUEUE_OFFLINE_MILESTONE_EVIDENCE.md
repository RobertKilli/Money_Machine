# Offline review-milestone evidence reference

## Implemented boundary

`event-intelligence-review-milestone-evidence/v1` is a closed, syntax-only record for a synthetic review attestation. The public parser is `parseReviewMilestoneEvidence`; it validates exact nested shapes, closed enums, canonical UTC timestamps, bounded arrays/identifiers, and rejects accessors, proxies, sparse arrays, unknown properties, and unsupported versions. Parsed output is isolated and deeply frozen. Parser success means only that the bytes-as-object match this schema.

The record binds an exact discovery candidate ID and revision fingerprint, a closed review milestone, a versioned policy/algorithm reference, the public routing decision fingerprint and authentic routing-result ID/state-history context, synthetic issuer/reviewer labels, availability/review/issue/cutoff times, one of `COMPLETED_PROCEED`, `COMPLETED_STOP`, or `EVIDENCE_INSUFFICIENT`, bounded reason codes, and an optional exact prior evidence ID being corrected. It does not invent a claim identity or a lifecycle relation. The public routing result exposes no prior-result ID, so this reference binds the concrete result ID and visible context but cannot bind an unavailable prior-result identifier.

## Offline issuance and use

`issueOfflineReviewMilestoneEvidence` accepts only the existing authentic synthetic discovery candidate and authentic routing result for the built-in routing decision. It checks candidate/revision and routing-context binding and supports only the fixed synthetic policy, issuer, and reviewer constants. The resulting reference has module-local in-process identity; a copied object, JSON roundtrip, or parser result is not an issued reference. The labels and WeakSet/WeakMap are test/reference mechanics, not an authorization registry, identity proof, signature, or reviewer verification.

`validateOfflineReviewMilestoneEvidence` receives the expected candidate revision, milestone, policy, routing context, and cutoff separately from the evidence set. It requires authentic issued references and checks all bindings and that evidence availability, review, and issue times are not after the cutoff. Equality at the cutoff is allowed. The record itself is never used to choose the expectation.

Corrections are append-only records that name an exact authentic earlier evidence ID and retain the same subject, milestone, policy, route, cutoff, and synthetic issuer/reviewer. Validation requires the earlier record in the supplied set. Competing roots or correction branches return `HELD` with `EVIDENCE_INSUFFICIENT`; timestamps do not select a winner. The reference-only revocation function adds a module-local simulated revocation marker: it blocks new validation while immutable earlier validation results remain unchanged. Neither mechanism persists.

`COMPLETED_PROCEED` means only that this synthetic review milestone completed with a local proceed disposition. `COMPLETED_STOP` completes the review but stops that local path. `EVIDENCE_INSUFFICIENT` leaves the milestone held. The validator exposes no routing transition or event/source/policy/lifecycle/signal/trading authority, and routing evaluators do not consume this evidence.

## Existing-code bindings and remaining prerequisites

The available routing result can bind the built-in routing-decision version/fingerprint, candidate ID, result ID, current/next states, exact stage history, cutoff, and publication/discovery/receipt times. Discovery candidates provide candidate ID and material fingerprint. Routing's module-local guard validates the result and its private context. The public routing contract does not expose reviewer identity, policy application, prior-result ID, or applied subject authority; this package does not infer them. A blocked or terminal route context is not eligible for synthetic issuance/use.

The issuer/reviewer IDs and policy reference are fixed declarations for offline simulation. Production reviewer authorization, real reviewer identity, policy-content verification, source-family references and rights, applied subject authority, source lifecycle assertions, and any progression alignment remain prerequisites. `stageHistory` remains context only and does not complete a review. No UI/demo, manifest family, provenance inventory, production wiring, persistence, resolver, or lifecycle relation is introduced. The existing V1/V2 routing and queue chains are unchanged.
