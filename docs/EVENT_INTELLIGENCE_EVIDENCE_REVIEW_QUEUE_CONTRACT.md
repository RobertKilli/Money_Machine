# Event intelligence evidence review queue contract

Contract: `event-intelligence-evidence-review-queue-contract/v1`
Parent: reviewed source portfolio routing decision `5fcfdce4f5b334a95387fd9bec5eac3b131350a9` on `feat/event-intelligence-source-portfolio-routing-decision`. This is a stacked child checkpoint. It cannot be integrated until the parent and this child are reviewed against updated `main`; baseline audit remains blocked by `GHSA-vfj7-8cjw-p6xm` / `braces@3.0.3`.

## Purpose and boundaries

The queue contract turns an authentic, non-authoritative routing result into an immutable in-memory task snapshot. It tells a reviewer what to inspect, why it is pending, which routing stage and historical cutoff it represents, which mappings or sources are missing, and which conflicts/degradations prohibit conclusions. It does not store or schedule work, notify or assign people, fetch sources, or create an application route.

The child imports only the routing decision parent. It does not integrate NewsAPI, GDELT, issuer release, exchange, UI, or other sibling checkpoints. No queue snapshot may assert issuer identity, asset identity, completed purchase, independent verification, event authority, signal, or trade.

## Item types, statuses, priorities

Item type is derived from trusted routing state and reason flags. Caller input cannot choose it.

| Type | Deterministic condition / next action |
|---|---|
| `PRIMARY_SOURCE_RETRIEVAL_REVIEW` | Primary source absent or routing remains at discovery/retrieval/disclosure; retrieve an allowed primary source after separate approval |
| `ISSUER_MAPPING_REVIEW` | Issuer map absent or issuer mapping state; resolve legal-entity mapping separately |
| `ASSET_MAPPING_REVIEW` | Asset map absent or asset mapping state; resolve exact representation separately |
| `CORRECTION_LINEAGE_REVIEW` | Correction is present or correction review is active; inspect append-only lineage |
| `RETRACTION_REVIEW` | Retraction/withdrawal hint or flag; status is `RETRACTED`, never active |
| `SOURCE_CONFLICT_REVIEW` | Any routing conflict; preserve both materials and stop selection. The blocker retains the exact conflict code (issuer, listing, asset, amount, lifecycle, publication time, correction lineage, source material, authority tier, or origin group). |
| `ORIGIN_GROUP_REVIEW` | More than one bound publication origin or a syndicated-copy binding needs review |
| `RIGHTS_APPROVAL_REVIEW` | Source-use approval missing |
| `JURISDICTION_REVIEW` | Jurisdiction/listing scope unresolved |
| `LIFECYCLE_REVIEW` | Other blocked or routine lifecycle work |
| `DUPLICATE_NO_ACTION` | Identical candidate replay only after retraction, correction, conflicts, rights, jurisdiction, issuer/asset mapping, primary-source, and applicable corroboration checks do not require a higher-precedence item |
| `BLOCKED_UNSUPPORTED_CORROBORATION` | Corroboration stage reached but no supported independent factual source family exists |
| `NON_AUTHORITATIVE_REVIEW_COMPLETE` | Routing reached its non-authoritative endpoint; status remains `BLOCKED` when corroboration is unsupported |

Statuses are snapshots: `OPEN`, `BLOCKED`, `NO_ACTION`, `RESOLVED_NON_AUTHORITATIVE`, `SUPERSEDED`, `RETRACTED`. There is no queue status transition API. Retraction precedes duplicate classification; unresolved correction and conflict also cannot be hidden by duplicate handling. Unsupported corroboration remains a blocker. Non-authoritative completion never means authority was granted.

The total item precedence is: retraction; unresolved correction/lineage conflict; any other source/lifecycle/identity conflict; rights blocker; jurisdiction blocker; missing issuer mapping; missing asset mapping; missing primary source; unsupported corroboration at its review stage; duplicate/no-action; routine review; non-authoritative review complete. Higher-precedence blockers remain visible and cannot be hidden by a duplicate. A completed-purchase claim without separate completion material remains a blocked lifecycle/primary-source review.

Priorities are categorical and ordered by the contract: `URGENT_RETRACTION_REVIEW`, `URGENT_CORRECTION_REVIEW`, `CONFLICT_REVIEW`, `BLOCKED_RIGHTS`, `JURISDICTION_UNKNOWN`, `MAPPING_REQUIRED`, `PRIMARY_SOURCE_MISSING`, `ROUTINE_DISCOVERY_REVIEW`, `NO_ACTION_DUPLICATE`. There is no numeric rank in output. Amount, asset, record count, provider count, or source count cannot raise priority. Ordering is only for an eventual manual review queue, never an investment score.

Each blocker has its own canonical reason code, safe label, next action, permitted source-family set where applicable, and forbidden conclusion. Conflict blockers preserve their precise parent reason (issuer identity, listing/jurisdiction, asset representation, amount/currency, lifecycle, publication time, correction lineage, source material, authority tier, or origin group). Examples remain distinct: issuer mapping missing, asset mapping missing, unresolved jurisdiction, missing primary source, unresolved correction lineage, rights missing, unsupported corroboration, and acquisition disabled.

Items carry fixed forbidden-conclusion codes: issuer and asset identity are unconfirmed; amount is unverified; purchase completion is unconfirmed; issuer disclosure is not factual verification; independent factual verification is unavailable; the item is not a recommendation or confidence probability; no event authority, signal, trading eligibility, or trade decision is granted. Callers cannot remove these conclusions.

## Trust, identity, and historical snapshots

Projection requires the module-local authentic routing decision and evaluator result. The parent result now carries a frozen contiguous `stageHistory`, an opaque `routingResultId`, exact cutoff and observation timestamps, and a runtime authenticity predicate. The parent WeakSet/WeakMap remains private; the predicate cannot mint trust. The queue rejects copied, spread, structured-cloned, JSON, caller-parsed, terminal-reopened, wrong-candidate, wrong-cutoff, or altered routing results.

Queue item material binds candidate ID, routing decision ID/fingerprint, routing result identity, state and stage history, item type/status/priority, evaluation cutoff, jurisdiction/listing scope, mapping flags, source families/strength, origin/copy counts, blocker/conflict/degradation codes, correction/retraction context including declared correction-field hints (`AMOUNT`, `ASSET`, `PUBLICATION_TIME`, `LIFECYCLE`, `ISSUER`, `OTHER`), and required action. A present correction must declare at least one field hint; these remain unverified hints. Queue projection time and render time are omitted. Identity is a SHA-256 digest over canonical lexical serialization; the set sealer also retains and compares each member's canonical material, so a repeated ID with differing material is a fail-closed conflict. `recordedAt` is review metadata only and does not enter item or set identity.

Publication, discovery, receipt, and `evaluationAsOf` remain separate. The parent validates `publication ≤ discovery ≤ receipt ≤ evaluationAsOf`; future evidence or correction is rejected. A later cutoff creates another snapshot and cannot mutate the earlier one. The set uses one cutoff for all members. Correction/retraction flags alter item material and identity; corrections never create a new independent origin.

## Origin and source summary

Items expose only categorical source families/strength, jurisdiction/listing, publication/discovery/receipt/evaluation timestamps, primary-source presence, origin-group count, and syndicated-copy count. A record or URL count is not an origin count. No origin count means independent corroboration: the routing contract reports zero independent factual origins and v1 declares that capability unsupported.

## Queue-set sealing and sorting

`sealEvidenceReviewQueueSet` accepts only a plain dense array of runtime-authentic routing results for the authentic decision. It derives items, requires one historical cutoff and one snapshot per candidate, rejects repeated members and identity collisions after canonical-material comparison, sorts by versioned categorical priority then UTC publication time then lexical stable item identity, and assigns contiguous zero-based ordinals. The immutable set binds decision, decision fingerprint, cutoff, count, ordering, ordinals, member identities and set fingerprint. Serialized/copied sets and items lose trust. The set asserts neither event authority nor persistence authority.

The separate child `EVENT_INTELLIGENCE_EVIDENCE_REVIEW_QUEUE_VIEW_MODEL` adds a one-way presentation adapter for authentic sealed queue sets. It derives a versioned opaque public key by hashing the private item identity under a separate domain; the UI key does not expose or grant that identity. The adapter emits only allowlisted labels, safe counts/flags, and UTC timestamps. It does not accept raw item arrays or make the resulting model valid at any domain boundary. No raw candidate text/payload, credentials, URLs, fingerprints, WeakSet state, or authority object enter the view model. A route/component remains a later, separately reviewed slice.

## Production configuration

The strict production config has no selected portfolio, active queue policy, credential reference, persistence target, notification target, or reviewer identity. Queue projection, persistence, scheduler, notifications, reviewer assignment, acquisition, event authority, signal, and trading are `BLOCKED`; all usage/storage/persistence/retention/redistribution/commercial approvals remain `NOT_APPROVED`. No user, role, auth, schema, or readiness registry is added.

## Later integration

The intended non-authoritative path is discovery → source portfolio routing → evidence review snapshot → separately reviewed mapping/source/correction/corroboration → any separately authorized event-authority policy. Review priority does not imply investment confidence. Production remains blocked. This child depends on its routing parent and must be integrated only after both checkpoints are independently reviewed on updated `main`; sibling source checkpoints are not imported here. The expected audit blocker is independent of contract correctness.
# Composition integration note

The composition checkpoint (stacked on the queue UI branch, parent `4724b9de8a29f6ce6b2f1e3d1cfb691fabd44663`) invokes this contract only after every synthetic candidate has passed discovery and routing validation. The queue sealer remains responsible for precedence, candidate uniqueness, and canonical ordering; the application layer does not calculate item status or priority. Queue items are converted through the existing view-model adapter, and no queue-set/domain trust is exposed.

The subsequent read-model decision chooses immutable snapshots of the safe serialized view-model as a future persistence strategy, not queue-domain objects. No schema, UoW, or loader is approved; old snapshots remain cutoff-bound and append-only, while current selection is a separate presentation query.
# Snapshot provenance boundary

Queue scope describes the review universe; a snapshot's closed provenance manifest describes the exact material consumed. They are distinct and non-authoritative. Applied SEC/M5 parents do not imply queue storage permission. See [scope/provenance decision](EVENT_INTELLIGENCE_EVIDENCE_REVIEW_QUEUE_SNAPSHOT_SCOPE_PROVENANCE_DECISION.md).
