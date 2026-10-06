# Event intelligence evidence review queue V2 offline integration

## Scope

`/intelligence/events/review/offline-demo/queue-v2` is a development-only, read-only comparison. It composes V1 and V2 independently from the same three authentic synthetic discovery candidates, synthetic routing materials, and cutoff (`2026-10-03T12:00:00.000Z`). Existing demos, loaders, production behavior, and persisted/runtime wiring remain on V1.

The V2 chain is:

1. Existing synthetic discovery factory and fixed routing material.
2. Existing source-portfolio routing evaluator and authentic routing-result guards.
3. `composeEventIntelligenceEvidenceReviewQueueV2`, which validates candidate/cutoff binding and invokes `evaluateEvidenceReviewQueueV2`.
4. A separate V2 composition result guarded by module-local identity.
5. `projectEvidenceReviewQueueV2ToViewModel`, which accepts only an authentic V2 composition and emits a separate V2 presentation version.
6. The V1 and V2 read-only workspaces, each with independent local filters.

The V2 composition is explicitly `NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION`. It grants no policy application, provenance completeness, issuer authorization, producer authority, persistence, signal, or trading capability. Its client workspace receives only the degraded V2 presentation model and fixed presentation labels. Candidate IDs, routing results, queue trust, policy material, and source-context DTOs remain server-side.

## Conflict example

A fourth, separate synthetic routing fixture declares both `LIFECYCLE_CONFLICT` and `AMOUNT_CURRENCY_CONFLICT`. The existing authenticated source-portfolio routing API produces the routing result; the existing V1 item projector and opt-in V2 evaluator classify that same result separately. The fixture is intentionally outside both three-row compositions because the existing V1 composition boundary rejects caller-declared conflicts. The displayed comparison does not weaken or bypass that V1 guard.

The runtime outputs select `REVIEW_LIFECYCLE` first and retain both blockers. V2 therefore aligns its versioned contract material with current runtime behavior; the UI does not manufacture a V1/V2 difference. This synthetic routing declaration is not evidence that either conflict exists in a real source.

## V1 and V2 semantics

V1 exports, contract material, evaluator behavior, view-model format, and callers are unchanged. The integration does not relabel V1 output. V2 remains explicit opt-in and has distinct queue, composition, and presentation version identifiers and module-local authenticity guards.

V2 records lifecycle conflict before amount/currency conflict in its conflict-action precedence and describes the classifier as ordered predicates with a fallback. Classification, blockers, operational priority, and queue ordering remain separate outputs. Both standard three-row compositions preserve runtime order and statuses: correction review (`BLOCKED` / `URGENT_CORRECTION_REVIEW`), rights review (`BLOCKED` / `BLOCKED_RIGHTS`), and issuer mapping (`OPEN` / `MAPPING_REQUIRED`). All rows are historical at the fixed cutoff.

## Remaining limits

- The evaluator fallback still lacks an isolated conformance fixture; this integration does not claim the fallback is unreachable or fully proven.
- Routing-stage interactions and `eventRoutes.required` semantics remain open.
- Retraction hint versus retracted flag, claim retraction, revision supersession, review milestone completion, and issuer authorization remain open.
- Conformance examples do not prove full code equivalence or later policy application.
- Synthetic conflict flags and policy-reference declarations do not verify source facts or policy content.
- V2 remains offline and opt-in; no production loader, persistence, current-selection, resolver, content-identity builder, or scope-v2 is introduced.
