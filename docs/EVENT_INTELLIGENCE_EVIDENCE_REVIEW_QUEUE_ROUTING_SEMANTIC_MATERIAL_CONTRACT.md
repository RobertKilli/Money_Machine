# Evidence review queue routing semantic material

This slice defines fixed, versioned, syntax-only material for the existing `evaluateSourcePortfolioRouting` evaluator. It adds no evaluator, hash, canonical byte profile, resolver, policy-application evidence, or producer. `VALID_SYNTAX_ONLY_NON_AUTHORITATIVE` means only that the input is an exact structural copy of this fixed declaration. The declared algorithm version has selected conformance cases; it does not prove which code ran.

## Profile and boundaries

| Field | Fixed value | Meaning |
|---|---|---|
| Material schema | `event-intelligence-routing-semantic-material-contract/v1` | This closed parser shape. |
| Material profile | `event-intelligence-routing-policy-material/v1` | Recommended routing-policy material profile from the parent decision; represented here but not content-hashed or active. |
| Policy/contract | `event-intelligence-source-portfolio-routing-decision/v1` | Existing decision/evaluator contract version. |
| Algorithm | `event-intelligence-routing-semantic-algorithm/v1` | Declared semantic version, not code attestation. |
| Upstream | source-portfolio decision v1, news discovery v1, discovery-origin-set v1 | Version pins only; they do not prove authentic inputs were consumed. |

Routing input and decision rules are in [the routing material module](../src/domain/intelligence/event-intelligence-evidence-review-queue-routing-semantic-material.ts). The source-portfolio semantic profile already describes source strengths and portfolio-level rules; this profile adds route order, evaluator guards, transitions, and result semantics. Queue classification remains in the queue contract. Issuer/listing policy, policy-content identity, actual policy application, provenance closure, and producer authority remain outside this profile.

## Rule/material/conformance matrix

| Rule ID | Material fields | Tracked runtime behavior | Conformance evidence |
|---|---|---|---|
| `R-INPUT-SHAPE` | `inputContract.exactFields`, `validationOrder`, enums, `primitiveAndCollectionBounds` | `parseSyntheticRoutingMaterial` exact descriptors and field guards; `evaluateSourcePortfolioRouting` checks authentic decision before parsing input | This slice: malformed shape, unsupported enum, guard order; parent routing suite: strict parser rejection cases |
| `R-JURISDICTION-SCOPE` | `jurisdictions`, `listingScopeRules` | parser requires exact US/GB/AU listing scope, empty unlisted/unknown scope, at least two unique dual-listed scopes | This slice: all route jurisdictions and dual-listed blocked case; parent suite: unknown/dual behavior |
| `R-FAMILY-SETS` | `sourceFamilies`, `conflicts`, `correctionHints` | parser rejects duplicates, unsupported independent corroboration, overlapping seen/available families; output sets are code-unit sorted | This slice: source strength and parser cases; parent routing suite: unsupported family rejection |
| `R-ORIGIN-GRAPH` | `originBindings` | parser enforces unique source record IDs, publication/origin consistency, same-publication copy parent, and acyclic copy links | Parent routing suite covers parent/copy and identity constraints; this profile records the rule and bounds |
| `R-TIME-CUTOFF` | `time` | parser enforces canonical UTC ISO milliseconds, publication <= discovery <= receipt <= evaluation, and correction time within publication/evaluation when correction is present | This slice: before/equal boundaries and invalid future correction; parent suite: malformed timestamp coverage |
| `R-SOURCE-TYPE-FAMILY` | `sourceTypeBoundary` | discovery maps provider/source type; composition checks authenticated candidate type against caller routing families. The routing evaluator alone accepts synthetic families and does not authenticate a candidate | This slice: authenticated aggregator accepted and filing relabel blocked by composition; parent discovery/composition suites cover provider-type parsing |
| `R-ROUTE-ORDER` | `routeSelection.jurisdictionRouteOrder`, `nextSourceFamily`, `preferredFamily` | `routeOrder` chooses jurisdiction table; `nextFamily` picks first unseen available family; preferred-source absence adds primary-unavailable degradation | This slice: US, GB, AU, unlisted and unknown priority/fallback |
| `R-INITIAL-STATE` | `eventRouting.initialState`, `progression.initialCurrentState` | every first evaluation starts at `DISCOVERED`; caller cannot supply current state/history | This slice: all event hints begin at `DISCOVERED` |
| `R-TRANSITIONS` | `progression.allowedTransitions`, `decisionOrder.stateBranches` | `explicitNext`, ordered state branches, then transition-membership fallback to `STOPPED_BLOCKED` | This slice: complete normal transition path and stop gates; parent routing suite traverses and rejects invalid/skipped progression |
| `R-PREVIOUS-BINDING` | `progression.previousResultGuardOrder`, `candidateBindingFields`, `stageObservationFieldsAllowedToChange` | module-local WeakSet/WeakMap authenticity, decision fingerprint, candidate binding, terminal rejection, and bound history tail are checked | This slice: valid chain, copied/terminal results and candidate/time/context mismatches rejected |
| `R-STOP-AND-PRIORITY` | `decisionOrder.blockingPriority`, `operationalPriority`, `sourceStrength` | blockers are tested in source order; operational priority is duplicate, correction/retraction, rights, preferred/primary missing, mapping, routine; strength checks filing, regulatory, issuer, then discovery | This slice: each blocker, duplicate/correction collision, and each strength tier |
| `R-DEGRADATION` | `degradation.acceptedReasons`, `degradation.rules`, `degradation.output` | evaluator derives conditional reason codes, always includes acquisition-disabled, and returns the deduplicated code-unit-sorted set | This slice: each conditional reason mapping and the completed-path corroboration reason |
| `R-RESULT` | `resultContract` | result is immutable, non-authoritative, carries sorted reasons and fixed false authority flags | This slice: terminal path asserts exact status and false authority/persistence/signal/trading fields |

The test matrix is evidence for the cited cases only. It does not prove full evaluator equivalence, real policy application, approval, source authority, or provenance completeness.

## Input and evaluation order

At the public evaluator boundary, the order is: (1) require the module-authentic source-portfolio decision; (2) parse the entire synthetic routing input; (3) if a previous result argument was supplied, require local result authenticity, matching bound decision fingerprint, exact candidate binding, a nonterminal previous result, and a bound history tail matching that result's next state; (4) compute degradation/conflicts, route state and source family; (5) apply post-route unknown/dual-listed stop and allowed-transition fallback; (6) produce an immutable `NON_AUTHORITATIVE_ROUTING_RESULT`. All rejection paths return `null`; no caller string, partial result, or parser failure object is exposed by this evaluator.

Within input parsing, the actual order is exact field/descriptors, synthetic provenance, booleans, jurisdiction/listing scope, conflict set, correction-hint set and correction-presence consistency, origin-binding graph, correction-available timestamp, seen/available family sets and disjointness, remaining timestamps/order, candidate identifier, then event-hint enum. Times are not parsed permissively: the parser requires millisecond UTC `Z` form and an ISO round trip. Listing scopes, seen/available families, conflict reasons, and correction hints are semantic sets, reject duplicates, and are returned in UTF-16 code-unit order. `originBindings` preserve array order. Route and transition arrays are priority-bearing and retain their listed order.

The previous-result candidate binding is exactly the materialized field list. Stage observations such as family availability, mapping, rights, duplicate, correction resolution, conflicts, and stale status are deliberately not in that binding and may change between stages. Discovery/candidate authenticity is not checked by the evaluator: the composition layer owns the source-type/family match. The current news-discovery source types do not produce `FILING_AUTHORITY`, although the synthetic routing evaluator accepts it in `seenFamilies`; no filing-source authority is implied by that evaluator input. A routing result remains synthetic and `NON_AUTHORITATIVE_ROUTING_RESULT` even when its module-local progression guards pass.

## Decision/evaluator alignment gaps

The profile records the parent decision's declarations and actual evaluator behavior without selecting either as a new normative authority:

* `DUAL_LISTED` has no parent jurisdiction route row. The evaluator's route lookup falls back to `DISCOVERY_AGGREGATOR`, but a dual-listed input is then stopped. Thus a `nextSourceFamily` may be present on a blocked result.
* The parent event table's `required` state is not used as the evaluator's initial state. Evaluation always begins at `DISCOVERED` and advances through the shared ordered state graph. The meaning of `required` as a milestone versus terminal target remains unresolved.
* The parent event row says `RETRACTION_WITHDRAWAL` stops. Four valid combinations are covered: neither hint nor flag progresses; hint alone progresses; flag alone stops; both stop. Runtime stops on `retracted === true`, while a retraction hint alone does not stop routing. The hint alone adds `CORRECTION_UNRESOLVED` degradation but does not change operational priority; the separate flag does raise urgent-correction priority. Contract-owner reconciliation is required; no runtime fix is included here.
* The evaluator contains a `primaryNeeded` branch, but after prior guards that branch and the following primary-disclosure fallback produce the same routing decision fields, including `nextState`, stage history, degradation reasons, priority and authority flags. The returned `eventHint` still echoes the distinct input, so the full objects and `routingResultId` are not identical; `primaryNeeded` adds no separate route effect. A projection test compares the shared decision fields.

These gaps block a claim of complete semantic identity until reconciled. The previously documented queue-only conflicts remain unchanged: parent `conflictActionOrder` says amount/currency before lifecycle while queue runtime is lifecycle-first, and parent `routingMappings` precedence differs from queue `classify` ordering. This slice does not edit the queue contract, its alignment fields, or its tests.

The concrete recommended semantics and future versioned alignment plan for retraction and `eventRoutes.required` are recorded in [the routing normative semantics decision](EVENT_INTELLIGENCE_EVIDENCE_REVIEW_QUEUE_ROUTING_NORMATIVE_SEMANTICS_DECISION.md). That decision does not change the declarations or evaluator described here.

## Limits

Parser bounds are depth 12, 10,000 traversed values, 4,096 UTF-16 code units per string, 64 own properties per object, and 512 array elements. The complete fixed profile is measured by its test against these structural limits. There is no canonical serialization or byte limit in this slice.

The material does not establish content identity, identify executed code, authenticate caller expectations, validate issuer/listing policy content, mint or restore WeakSet trust, resolve parent existence, or prove provenance completeness, origin independence, approval, access, event authority, signal, trading, or producer readiness. Scope v1, its identity and bounds, codecs, application contract, composition and production config are unchanged. No production import or runtime wiring is added.
