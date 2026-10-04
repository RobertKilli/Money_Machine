# Source-portfolio and evidence-review-queue semantic material

This contract records the currently supported source-portfolio and queue semantics as fixed, versioned, syntax-only material. It does not serialize canonical bytes, calculate content identities, apply policy, or establish producer authority. The parser statuses are `VALID_SYNTAX_ONLY_NON_AUTHORITATIVE`; algorithm versions are declared semantic versions backed by selected conformance cases, not proof of which code executed.

## Versioned profiles

| Material | Shape schema | Material profile | Policy/contract | Declared algorithm | Upstream contracts |
|---|---|---|---|---|---|
| Source portfolio | `event-intelligence-source-portfolio-semantic-material-contract/v1` | `event-intelligence-source-portfolio-policy-material/v1` | `event-intelligence-source-portfolio-routing-decision/v1` | `event-intelligence-source-portfolio-semantic-algorithm/v1` | news discovery v1 and discovery-origin-set v1 |
| Evidence review queue | `event-intelligence-evidence-review-queue-semantic-material-contract/v1` | `event-intelligence-evidence-review-queue-policy-material/v1` | `event-intelligence-evidence-review-queue-contract/v1` | `event-intelligence-evidence-review-queue-classification-algorithm/v1` | source-portfolio-routing-decision v1, queue composition v1, news discovery v1 |

The material profiles are proposed identifiers from the parent policy-profile decision, now represented by fixed local material. They are not active registries, applied policy identities, or content-verifier profiles. No SHA/hash preimage or canonical-byte representation is introduced here. Scope v1, its digest meaning, canonical profile, domain prefix, golden identity, and 18,264-byte bound remain unchanged.

## Source-portfolio rule/material/conformance matrix

The source-portfolio-routing decision currently combines source policy and routing tables. This material captures portfolio-relevant inputs and rules, while explicitly binding the same parent contract version as an upstream dependency for routing. It does not copy the full jurisdiction/event transition graph into this source-portfolio material; a separate routing semantic profile remains a prerequisite for complete closure.

| Rule ID / material | Tracked rule source | Conformance evidence |
|---|---|---|
| `SP-SOURCE-FAMILY-SET`: `sourceFamilies` is a membership set; unsupported `INDEPENDENT_FACTUAL_CORROBORATION` cannot be observed or advertised | `SOURCE_FAMILIES`, `families`, and `parseSyntheticRoutingMaterial` in `event-intelligence-source-portfolio-routing-decision.ts` | `event-intelligence-source-portfolio-routing-decision.test.ts` rejects that family; this slice checks it remains in the decision vocabulary but does not activate it |
| `SP-SOURCE-STRENGTH`: FILING > REGULATORY/EXCHANGE > ISSUER > DISCOVERY_ONLY | `evaluateSourcePortfolioRouting` strength expression in the same module | this slice evaluates filing and aggregator cases against fixed expected strengths |
| `SP-AGGREGATOR-BOUNDARY`: aggregator alone is not primary source and cannot create factual corroboration | source-family checks in `evaluateSourcePortfolioRouting`; authentic candidate/family match in `compose-event-intelligence-evidence-review-queue.ts` | parent composition tests reject caller relabeling; this slice checks discovery-only strength and records the source boundary |
| `SP-OPERATIONAL-PRIORITY`: duplicate > correction/retraction > rights > primary missing > mapping > routine | `operationalPriority` branch in `evaluateSourcePortfolioRouting` | parent routing tests exercise duplicate and correction; this slice checks correction priority. This priority is not queue display priority |
| `SP-INITIAL-AND-PROGRESSION`: begins at `DISCOVERED`; later stage requires authentic previous result | `evaluateSourcePortfolioRouting` plus WeakSet-backed previous-result checks | this slice verifies DISCOVERED output and copied-result rejection; parent tests traverse the graph and reject skipped/copied results |
| `SP-JURISDICTION-EVENT-ROUTES`: jurisdiction and event route preference/order and transition graph | `JURISDICTIONS`, `EVENT_ROUTE`, `ALLOWED_TRANSITIONS`, and `routeOrder` in the parent decision module | covered in parent routing tests; excluded from this material to keep routing a separate profile. Its omission is a closure blocker, not a claim that these rules do not affect output |
| `SP-ORIGIN-COVERAGE-BUDGETS`: conflict/origin rules, coverage, family budgets, approvals and production blockers | fixed source decision tables | values are carried into this material; no conformance suite here proves full table-to-runtime equivalence |

Discovery source type classification is enforced by the composition module against authentic discovery candidates, not by caller-provided `seenFamilies`: News aggregator maps to `DISCOVERY_AGGREGATOR`, issuer IR/newswire to `ISSUER_ATTRIBUTED_RELEASE`, and exchange/regulator feed to `REGULATORY_OR_EXCHANGE_DISCLOSURE`. These are discovery classifications, not authoritative event sources. Aggregators cannot be relabeled as filing, regulatory, or issuer sources. The material does not import sibling qualifications. `seenFamilies` alone never mints authenticity or corroboration.

The evaluator accepts synthetic routing material. Its module-local decision/result authenticity and previous-result guards are narrow runtime properties; they do not prove database authority, applied scope policy, parent existence, provenance completeness, or origin independence. The routing graph and its semantic version remain prerequisites for full source-side semantic closure.

## Queue rule/material/conformance matrix

The queue material copies the parent contract's semantic tables (types, statuses, priorities, blockers, mappings, conflict-action order, correction/historical/identity/sort/queue-set policies) and adds structured ordered classifier predicates. Ordered rules are precedence, not sets. Blocker codes and fixed enum vocabularies are sets; output blockers are lexical code-unit sorted. Queue output order is priority rank, publication UTC string ascending, then item ID by UTF-16 code units.

| Rule ID | Runtime rule | Conformance evidence |
|---|---|---|
| `Q-RETRACTION-FIRST` | `classify`: retracted/retraction hint wins, including duplicate | queue parent test checks retraction + duplicate |
| `Q-CORRECTION-BEFORE-DUPLICATE` | unresolved correction or correction-lineage conflict precedes duplicate; resolved correction remains a separate non-authoritative branch | queue parent tests and this slice's correction+duplicate fixture |
| `Q-CONFLICT-ACTION-ORDER` | any conflict blocks; `conflictAction` selects the first code in the fixed contract precedence | queue parent conflict tests; this slice checks the aggregate action for multiple conflicts |
| `Q-RIGHTS-JURISDICTION-MAPPING` | rights, unresolved jurisdiction, issuer mapping, then asset mapping | queue parent mapping/rights tests |
| `Q-PRIMARY-ORIGIN-CORROBORATION` | primary-source requirement precedes origin grouping; unsupported corroboration is evaluated after origin grouping | queue parent primary/origin/corroboration tests |
| `Q-DUPLICATE-NO-ACTION` | duplicate without correction becomes NO_ACTION only after higher-precedence blockers | queue parent duplicate collision tests and this slice's plain duplicate case |
| `Q-TERMINAL-LIFECYCLE` | explicit non-authoritative terminal and remaining current/next-state branches map to their fixed review categories | structured material lists each remaining classifier branch; parent queue suite covers representative terminal, mapping, retrieval, correction, stopped, and fallback paths |
| `Q-CUTOFF-AND-SUPERSESSION` | classifier consumes an already validated routing result; queue sets require one shared evaluation cutoff; it does not select current/latest; `SUPERSEDED` is not emitted by the classifier | queue parent cutoff/history tests; this slice confirms future correction is rejected upstream and records the separate status dimension |
| `Q-ORDER-AND-BOUNDS` | queue set accepts at most 512 routing results, rejects repeated candidates, sorts before assigning tight zero-based ordinals, and requires one cutoff | parent queue set tests; 512 is the queue-set limit, not the view-model limit by inference |

Corrections and retractions are classified before duplicate/no-action, so duplicate handling cannot suppress declared correction/retraction evidence. Snapshot cutoff values, candidate IDs, artifact IDs, counts and individual evaluation outputs are runtime data and are excluded from static material. Historical filtering/validation is inherited from discovery/composition/routing. `SUPERSEDED` is a separate view/read-model status; this queue classifier does not produce it. The view-model's 512-item projection bound is presentation behavior, not a queue-policy limit; the queue itself independently has a 512-member bound, while composition has its own smaller bound.

## Parser contract and limits

Both public parsers accept only an exact structural copy of their fixed material. They clone through own-property descriptors without invoking getters, reject unknown or missing values by exact material comparison, and return the module's immutable fixed object with `VALID_SYNTAX_ONLY_NON_AUTHORITATIVE`. Errors are bounded to `SEMANTIC_MATERIAL_INVALID`. Limits are depth 12, 10,000 traversed values, 4,096 UTF-16 code units per string, 64 own properties per object, and 512 array elements. Shared acyclic references are allowed and counted at each traversal; cycles are rejected. No canonical-byte or byte-size limit is claimed because this slice does not serialize material.

These are fixed-contract parsers, not caller-configurable policy parsers. Successful parsing does not prove a matching runtime, policy-content identity, policy application, authenticity, approval, completeness, or readiness. Conformance tests call existing public runtime APIs with synthetic fixtures, including APIs that retain their own module-local authenticity gates. Passing selected examples demonstrates only those cases.

## Closure gaps and prerequisites

1. Define a separate routing semantic profile for the actual jurisdiction/event route order, state-transition graph, progression conditions, and source-family fallback. It must be versioned separately from source-portfolio material and have conformance cases against `evaluateSourcePortfolioRouting`.
2. Resolve which queue contract strings fully determine classifier branches and add independent cases for every branch/precedence interaction before claiming algorithm conformance. This static material is not a hash identity for code behavior.
3. Only after semantic closure, define material canonicalization/content identity and runtime policy-application evidence as separate slices. The policy profile/hash decision's proposed digest preimage is unchanged and not implemented here.

No status here is `APPLIED`, `APPROVED`, `AUTHENTIC`, or producer-ready. Composition remains `NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION`. Application evidence remains `VALID_SYNTAX_ONLY_NON_AUTHORITATIVE` with `MISSING_RUNTIME_RESULT_BINDING`. Existing codecs, scope identity, binding verifiers, production config, loaders, UI, routes, and composition are unchanged. Persistence/current-selection, approvals, rights/retention/deletion, authority upgrades, signal, and trading remain blocked.
