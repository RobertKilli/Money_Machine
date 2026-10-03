# Evidence Review Queue Composition

This checkpoint is stacked on `feat/event-intelligence-evidence-review-queue-ui` at parent SHA `4724b9de8a29f6ce6b2f1e3d1cfb691fabd44663`. It composes the already reviewed contracts in memory only. It does not integrate sibling provider qualifications, fetch source data, persist queue items, or populate the production route.

## Flow and trust

`NewsDiscoveryCandidate` must be runtime-authentic and explicitly synthetic. The service first validates the exact request shape, candidate trust, one common `evaluationAsOf`, and the full candidate batch with the discovery-origin-set sealer. Each synthetic routing material is then validated by the existing routing parser and bound to its candidate ID, event hint, exact observed source family (derived from the candidate's authenticated `sourceType`), jurisdiction, listing scope, and publication/discovery/receipt times. Caller-provided extra seen-families cannot promote discovery material to issuer, regulatory, or filing publication. Correction and retraction context must match the discovery lineage sealed at that cutoff. The routing evaluator is the only source of trusted routing results. It advances each candidate from `DISCOVERED` through legal transitions until a blocked or non-authoritative terminal state, with a fixed maximum of nine evaluations per candidate.

Routing material in tests may describe hypothetical mapping, rights, source availability, and qualification facts so that existing routing states can be exercised. These are synthetic scenario facts, not approvals, mappings, retrieved artifacts, or evidence. Caller-supplied statuses, priorities, blockers, routing stages, origin bindings, conflicts, or duplicate flags are rejected or derived internally. Source conflicts and duplicate copies are derived from authenticated discovery records and explicit shared-origin declarations.

After every candidate has a terminal routing result, the existing evidence-review queue sealer creates one common-cutoff, canonically ordered set. The parent view-model adapter converts it to the only public composition payload. The result exposes a frozen, JSON-safe view model, a small allowlisted summary, and `NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION`; it omits routing results, queue/domain IDs, fingerprints, canonical source material, errors, and runtime trust.

## Cutoff, correction, and retraction

The composition requires every discovery candidate's evaluation cutoff to equal the request cutoff and validates `publishedAt <= discoveredAt <= receivedAt <= evaluationAsOf`. The discovery-origin-set contract excludes future lifecycle material and checks explicit correction/retraction parent bindings. An unresolved correction hint remains an urgent correction review; a structurally linked correction is still non-authoritative and does not count as requiring review. Retraction is terminal and visible. Each later cutoff is a new composition and cannot mutate an earlier view model. `historical` remains the view-model contract's cutoff marker; `superseded` is a separate field and is not inferred by this stateless composition.

## Atomicity and bounds

The service accepts 1–64 candidates, at most nine routing evaluations per candidate, and at most 64 final queue items. These are local application safeguards, not provider limits. It validates the whole batch before routing and returns either one complete composition or a sanitized categorical blocker. It never returns partial sets or partial view models. All ordering and projection remain owned by the parent contracts.

## Production boundary

`/intelligence/events/review` continues to call only its server-only blocked production loader. There is no composition switch, environment/cookie/header path, provider integration, credential lookup, database, persistence, scheduler, notification, authority, signal, or trading wiring. The composition module is server-only and must not be imported into the client graph. Synthetic scenario integration is test-only; the UI consumes only the already degraded view model.

No live provider data, rights, coverage, qualification, or production behavior is demonstrated. The baseline audit remains blocked by `GHSA-vfj7-8cjw-p6xm` (`braces@3.0.3`, five high findings through `eslint-config-next`). No final-SHA production build is run while that gate is red.

The follow-on read-model decision recommends immutable derived snapshots only after separately approved source-family provenance and rights. Composition results remain in-memory; no database trust restoration, durable snapshot, or production loader is added.
