# Offline vertical-slice assessment: evidence review queue

## Finding

The stack already has an offline, server-side path from a synthetic discovery candidate through routing, queue composition and a safe read-only view model. The smallest useful next implementation is a separate development-only demo page that creates three explicit synthetic scenarios, calls the existing composition once, and reuses the existing review workspace with a prominent synthetic-demo label. No parallel pipeline, snapshot codec, manifest, persistence or change to the production loader is needed.

The direct production review route is intentionally blocked: `loadEvidenceReviewQueueViewModel()` always returns the blocked view model, and `/intelligence/events/review` renders that result. This prevents the current end-to-end composition from appearing in the production queue, but it does not prevent a separate local offline demo. The audit baseline is a repository/PR gate, not a blocker to running a local demo.

## Existing API chain

| Step | Tracked module and public API | Input -> output | Trust boundary and offline status |
|---|---|---|---|
| Synthetic discovery | `src/domain/intelligence/event-intelligence-news-discovery.ts`: `createSyntheticNewsDiscoveryCandidate(input, evaluationAt)`, `isAuthenticNewsDiscoveryCandidate` | Closed synthetic `NewsDiscoveryRecord` plus an evaluation time -> candidate or `null` | Offline. The candidate is accepted only as the module-local object returned by the factory. It is `DISCOVERY_ONLY`; it grants no source, event, mapping, persistence, signal or trading authority. Construct records as in-memory fixtures; do not JSON round-trip candidates, since copies do not retain module-local authenticity. |
| Routing | `src/domain/intelligence/event-intelligence-source-portfolio-routing-decision.ts`: `parseSyntheticRoutingMaterial`, `getSourcePortfolioDecision`, `evaluateSourcePortfolioRouting`, `isAuthenticRoutingEvaluation` | Candidate-bound synthetic routing facts plus the built-in decision -> authentic local transition result(s) | Offline. Material booleans such as mapping, rights and source availability are scenario inputs, not verified facts. The evaluator starts at `DISCOVERED`; later transitions require the exact prior authentic result bound to the same candidate and cutoff. |
| Composition | `src/application/intelligence/compose-event-intelligence-evidence-review-queue.ts`: `composeEventIntelligenceEvidenceReviewQueue` | One common cutoff and 1–64 `{ candidate, routingMaterial }` entries -> `COMPOSED` non-authoritative composition or a bounded `BLOCKED` result | Offline and the best existing entry point. It rechecks candidate authenticity/cutoff, seals a discovery-origin set, validates routing facts against each candidate, derives duplicate/conflict and correction/lifecycle context, evaluates the authentic route chain, seals a queue set, and adapts it to a view model. Its public status is `NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION`. |
| Queue and view model | `src/domain/intelligence/event-intelligence-evidence-review-queue.ts`: `sealEvidenceReviewQueueSet`; `src/domain/intelligence/event-intelligence-evidence-review-queue-view-model.ts`: `adaptEvidenceReviewQueueSetToViewModel` | Authentic routing results and the built-in contracts -> sorted queue set -> isolated, frozen serializable view model | Offline. These APIs reject copied/untrusted domain objects at their trust boundary. The projection deliberately removes private domain identifiers and retains fixed labels and safe display fields. |
| Read-only presentation | `src/components/intelligence/evidence-review-queue-workspace.tsx`: `EvidenceReviewQueueWorkspace` | Serializable view model -> read-only workspace with client-side presentation filters | Already visible and reusable. Filters affect display only. The client receives the allowlisted view model, not the authentic candidate, routing result, or queue-set objects; domain trust is not restored in the browser. The current page is `src/app/intelligence/events/review/page.tsx`, which calls the blocked production loader instead of composition. |

The composition's main precondition for a multi-item demo is one exact canonical UTC cutoff shared by every candidate and route input. Correction/lifecycle relationships must be constructed as authentic in-memory candidates and supplied together when that relation requires an origin set. The caller still supplies scenario routing booleans; therefore the page must say “synthetic scenario” and must not describe them as approved mapping, rights, acquisition or policy results.

There is no direct pipeline gap between the existing domain APIs. The missing piece is a separate server-rendered demo entry point and fixture assembly that invokes the already-existing composition. Do not make the existing production loader configurable with fixtures.

## Open deviations and prerequisites

| Deviation or prerequisite | Effect on this offline demo | Classification and handling |
|---|---|---|
| Queue conflict precedence: parent `conflictActionOrder` is amount/currency-first while runtime conflict classification is lifecycle-first. | None if the demo avoids a multi-conflict candidate; the displayed conflict result must not be claimed to settle the contract disagreement. | Constrain scenarios and disclose the known queue blocker. Keep it open for later contract/runtime alignment. |
| Parent `routingMappings` order differs from actual queue `classify` order. | None for the selected non-collision scenarios; it can change which review label wins for colliding facts. | Do not include precedence collisions in the minimal demo. Keep the mismatch visible as an unresolved domain blocker. |
| Hint-only input can be classified `RETRACTED` without `RETRACTION_PRESENT`. | It can make a retraction demonstration misleading even though the item remains visible. | The minimal demo should use an unresolved correction review rather than claim that a synthetic retraction hint establishes retraction. Keep hint-only behavior visibly documented and open. A later retraction demo needs an explicit caveat or an approved alignment change. |
| Retraction hint versus `retracted` flag. | Composition's candidate binding derives the synthetic flag from the candidate/origin-set lifecycle; it is not an external lifecycle fact. Different pairs have different current behavior. | Not a blocker to a correction-focused demo. Do not label a retraction report as an authenticated retraction or silently treat the fields as interchangeable. Keep the routing decision's four-case disagreement open. |
| `eventRoutes.required` is declarative and does not affect evaluator behavior. | Does not block composition or displaying a candidate. It prevents the demo from claiming that a milestone was completed or enforced. | Add no milestone-success narrative. Keep it as a future routing-contract/runtime prerequisite. |
| Milestone evidence and reviewer/issuer authorization are missing. | Does not block showing a non-authoritative review candidate; it blocks claiming an authorized person or evaluator completed a review. | Label the page as a demo of review work, not an actual review outcome. Defer evidence contracts/runtime and authorization to their own approved work. |
| Applied source, claim and lifecycle authorities are missing for these event candidates. | Does not block synthetic factory/composition use. It blocks production truth, parent-existence and provenance claims. | Fixtures remain synthetic and in-memory. No production resolver, registry, or persisted queue is implied. |
| Security audit has five high findings in `braces@3.0.3` (GHSA-vfj7-8cjw-p6xm). | Does not prevent local offline tests or a development-only demo from executing. | It remains a security/PR gate. Do not equate it with a blocker to all local offline development or remediate it in this slice. |
| Production loader, storage-read and current-selection are blocked. | They prevent the default production route from supplying candidates, by design. | Preserve the blocked empty state. The demo must use a separate route and must never write to or feed the production loader. |

## Smallest useful scenario set

Use three fixtures at one fixed cutoff. Build each candidate with the public synthetic factory and build the corresponding routing material explicitly; pass all entries to one call to `composeEventIntelligenceEvidenceReviewQueue`.

1. **Routine mapping review:** an aggregator discovery candidate for a synthetic purchase-intent headline, with `issuerMapped: false`. The existing composition test demonstrates that this can produce an `ISSUER_MAPPING_REVIEW` item. It shows a source category and a clear next action without implying the aggregator is primary evidence.
2. **Blocked jurisdiction or rights case:** a second, distinct synthetic candidate with unknown jurisdiction (or, alternatively, a rights failure). Existing composition tests demonstrate a blocked jurisdiction/rights result and its reason. Use only one variant to keep the demo short.
3. **Unresolved correction:** a synthetic record categorized `CORRECTION_OR_RETRACTION` with no accepted lifecycle resolution, bound to the same cutoff. Existing tests show unresolved correction remains an urgent correction-review item even alongside duplicate/no-action work. Present it as a reported correction requiring lineage review, not as a verified correction or retraction.

These cases exercise the useful path and two distinct review reasons while avoiding the unresolved precedence collisions. Do not add a duplicate/conflict fixture to the first demo: it is optional, and its visible winner can depend on the known classifier/mapping disagreements. A later explicitly labeled scenario may demonstrate current duplicate behavior without claiming the contract mismatch is resolved.

The workspace already displays a safe title/type, status, priority, bounded reason labels, next action, source family/strength, jurisdiction, primary-source presence, correction/retracted flags, origin-group counts, publication/discovery/receipt times, common evaluated-as-of cutoff, historical/superseded markers and forbidden-conclusion labels. The view model intentionally does not expose the candidate headline, source URL, raw source text, private candidate ID or routing-result ID. The demo should add a clear synthetic/offline banner and scenario labels outside the domain view model rather than adding raw fixture content to it.

## Recommended next implementation

**Slice:** `EVENT_INTELLIGENCE_EVIDENCE_REVIEW_QUEUE_OFFLINE_DEMO_PRESENTATION`.

Add an explicit development-only route, for example `/intelligence/events/review/demo`, implemented as a server page that constructs a small fixed set of synthetic records, calls `createSyntheticNewsDiscoveryCandidate`, constructs candidate-bound synthetic routing inputs, and invokes the existing composition once. If `NODE_ENV` is production, the demo route should return not-found; it must not alter `/intelligence/events/review` or its blocked loader. Reuse `EvidenceReviewQueueWorkspace` with a small presentation-mode prop or wrapper that makes “synthetic offline demo” prominent and avoids describing the demo items as production results. Keep fixture creation server-side and pass only the existing serializable view model plus safe demo labels to the client.

Likely files:

- Add `src/app/intelligence/events/review/demo/page.tsx` for the development-only server route.
- Add a narrowly scoped server-only helper under `src/application/intelligence/` to assemble the three fixed scenarios and call the public factory/composition APIs; do not create a new domain contract or generic fixture registry.
- Update `src/components/intelligence/evidence-review-queue-workspace.tsx` only as needed for explicit demo labeling; retain the same safe view-model boundary and filter-only behavior.
- Add an integration test for the fixture-to-composition result, component coverage for the synthetic banner and visible status/reasons/cutoff, and a regression test that the ordinary production page remains blocked. Reuse existing tests for authenticity, correction visibility and classifier behavior rather than duplicating their domain suites.

Acceptance criteria:

- The demo route works without network, provider, database or environment credentials, uses one explicit cutoff and only factory-created authentic synthetic candidates, and produces 3 visible items through the existing composition API.
- The three rows show the expected open mapping-review, blocked jurisdiction/rights, and urgent unresolved-correction cases with bounded reasons, next actions and the same displayed cutoff.
- The page visibly states that records and routing facts are synthetic, offline and non-authoritative; it makes no event-approval, milestone-completion, investment, signal or trading claim.
- No candidate/routing/queue authenticity object crosses into client code. Only the existing serializable view model and fixed display labels cross the server/client boundary.
- `/intelligence/events/review` continues to render the blocked production state; the demo is unavailable in production and is not imported by the production loader.
- No scope/codec/manifest format, persistence path, active registry, production configuration or authority status changes.

No policy or issuer clarification is needed before this bounded demo. Its copy must state the limitations above; later production use still requires the currently missing applied source/lifecycle authority, milestone evidence and reviewer/issuer authorization, plus the unresolved queue/routing contract alignment.
