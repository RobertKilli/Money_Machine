# Event intelligence source portfolio routing decision

Contract: `event-intelligence-source-portfolio-routing-decision/v1`

Status: decision-only, synthetic evaluator only. Parent: discovery contract `afa7ce136d27343a4d659b2984a1d2dda427d2f7`. This sibling checkpoint deliberately imports no GDELT, NewsAPI, issuer-release, exchange-announcement, UI, or runtime source implementation. It is not ready for PR while the baseline audit remains blocked by `GHSA-vfj7-8cjw-p6xm` (`braces@3.0.3`, five high findings through `eslint-config-next`).

## Source families and strength

| Family | Permitted role | Strength label | Limit |
|---|---|---|---|
| `DISCOVERY_AGGREGATOR` | Candidate discovery (including GDELT DOC, NewsAPI Everything, general release indexes) | `DISCOVERY_ONLY` | Never mapping, corroboration, or authority |
| `ISSUER_ATTRIBUTED_RELEASE` | Candidate evidence of what an issuer published (IR/RSS or explicitly attributed wire release) | `ISSUER_ATTRIBUTED` | A wire copy and issuer copy of one release remain one issuer-origin; publication does not prove the claim true or completed |
| `REGULATORY_OR_EXCHANGE_DISCLOSURE` | Jurisdiction/listing-bounded publication channel | `REGULATORY_PUBLICATION` | Proves at most publication through the channel, not underlying factual truth |
| `FILING_AUTHORITY` | Exact qualified filing and its contents (SEC scope is a separate source family) | `FILING_PUBLICATION` | Proves what registrant filed; individual items/lifecycle and underlying truth remain distinct |
| `INDEPENDENT_FACTUAL_CORROBORATION` | Unsupported in v1 | `INDEPENDENT_FACTUAL_VERIFICATION_UNSUPPORTED` | No source in this decision is promoted to this family |

These are categorical source properties, not scores. No percentages, probability, weighted source score, voting, or copy count is allowed. Faster, cheaper, or more available material cannot outrank a stronger source tier. Source availability never changes its authority tier.

## Routing states and transition policy

The evaluator allows only the ordered transitions `DISCOVERED → SOURCE_RETRIEVAL_REQUIRED → ISSUER_MAPPING_REQUIRED → ASSET_MAPPING_REQUIRED → PRIMARY_DISCLOSURE_REQUIRED → CORRECTION_REVIEW_REQUIRED → CORROBORATION_REVIEW_REQUIRED → ELIGIBILITY_REVIEW_REQUIRED → NON_AUTHORITATIVE_REVIEW_COMPLETE`, with fail-closed transitions to `STOPPED_BLOCKED`. The endpoint is expressly non-authoritative; no authority, signal, or trading state exists in this contract. A caller cannot submit a requested destination or skip state. An unknown/dual-listed jurisdiction stays discovery-only or stops until listing scope is mapped explicitly.

| Current review stage | Required inputs / source family | Blockers and stop conditions | Network/persistence later? | Authority effect |
|---|---|---|---|---|
| `DISCOVERED` | Synthetic candidate; any discovery family | Unknown issuer/listing, no source qualification, duplicate, or rights issue is surfaced | No in this slice | Candidate only; proceed to retrieval request |
| `SOURCE_RETRIEVAL_REQUIRED` | Qualified source profile and explicitly selected stronger source from jurisdiction route | Missing qualification, source, credential, rights, or primary unavailability stops/degrades visibly | Only after separate source and rights approvals | No upgrade; identifies next retrieval family |
| `ISSUER_MAPPING_REQUIRED` | Authentic issuer mapping authority scoped to legal entity/jurisdiction | Parent/subsidiary, dual listing, ticker or registrant ambiguity stops | No | Name/ticker never become issuer identity |
| `ASSET_MAPPING_REQUIRED` | Authentic asset mapping authority for exact representation | ETH/WETH, native/wrapped/bridged or ticker ambiguity stops | No | Mention is not canonical asset identity |
| `PRIMARY_DISCLOSURE_REQUIRED` | Exact issuer release, exchange/regulatory publication, or filing artifact appropriate to scope | Missing source, incomplete qualification, rights, or contradictory material stops | Retrieval only after approvals; persistence remains blocked | Publication does not verify underlying truth |
| `CORRECTION_REVIEW_REQUIRED` | Complete append-only source lifecycle lineage and historical cutoff | Unresolved correction/amendment/retraction/withdrawal stops active review | No until separately authorized | No newest-wins; original retained |
| `CORROBORATION_REVIEW_REQUIRED` | Later reviewed corroboration contract; independent factual corroboration is unsupported in v1 | Origin-group ambiguity or no supported corroboration remains explicit | No | Copies never vote; this stage does not assert fact |
| `ELIGIBILITY_REVIEW_REQUIRED` | Separate reviewed eligibility policy and all previous reviews | Any conflict, stale material, missing mapping or approval stops | No in this slice | Still no event authority or signal |
| `STOPPED_BLOCKED` | Sanitized reason codes | Requires new evidence/review; no automatic fallback | No | No authority |
| `NON_AUTHORITATIVE_REVIEW_COMPLETE` | Ordered checks only | Means workflow review reached its non-authoritative endpoint | No | Explicitly not event authority, signal, or trade |

Event hints alter required review, not authority: purchase intent may remain a candidate; board authorization and treasury policy need source retrieval; a binding agreement requires primary disclosure; expected closing is not completion; a completed-purchase claim requires separate completion material; correction/amendment requires complete lineage; retraction/withdrawal stops active eligibility; unrelated corporate action is not reclassified as a crypto event. Headline or aggregator category cannot skip mapping or retrieval.

## Jurisdiction routing

| Scope | Deterministic preference | Notes |
|---|---|---|
| US SEC registrant | SEC filing → direct issuer release → relevant regulatory/exchange publication → discovery aggregator | Filing authority is for the filed record, not automatic truth; Item 1.01/2.01 and amendments remain separate |
| LSE-listed | RNS/regulatory publication → direct issuer release → issuer-attributed wire → aggregator | Jurisdiction/listing-scoped, not factual verification |
| ASX-listed | ASX company announcement → direct issuer release → issuer-attributed wire → aggregator | Listed entity/security binding required |
| Unlisted issuer | Direct issuer release → discovery aggregator | This is only a candidate route; no legal issuer mapping is implied |
| Unknown | Discovery aggregator only, or stop | Never infer jurisdiction from ticker or hostname |
| Dual-listed | Stop for explicit listing/issuer mapping | Do not choose one exchange opportunistically |

The routing preferences are not production approval. A missing primary source cannot silently fall back to weaker discovery material. Rights, qualification, and source availability are independent gates.

## Origins, duplicates, and conflicts

Distinguish source record, retrieval artifact, publication/release/filing, issuer origin, distribution copy, syndicated copy, editorial origin, correction variant, and a future factual-corroboration origin group. Issuer IR plus a Business Wire/GlobeNewswire copy, an exchange repost plus its PDF, NewsAPI/GDELT pointers, and alternate delivery paths for one SEC filing are one issuer/publication origin when exact material binding supports that link. Corrections/amendments/retractions are variants of the same origin. Two genuinely distinct origin candidates remain separate, but distinctness alone does not establish factual corroboration.

Similarity, same URL, issuer label, headline, publication time, ticker, asset mention, or aggregator source-name is never enough to group or split origins. Preserve immutable material and stop on issuer identity, listing/jurisdiction, asset representation, amount/currency, lifecycle, time, correction lineage, source material, authority-tier, or origin-group conflicts. Do not pick a winner by count, newest timestamp, or presumed regulatory truth. Return sanitized reason codes and require separate review.

## Degradation, queue priority, cost, and coverage

Degradation reasons include primary source unavailable, incomplete qualification, incomplete mapping, rights unapproved, unresolved correction, conflicting/stale material, unsupported jurisdiction, unavailable independent corroboration, missing credential, acquisition disabled, and duplicate material. `ACQUISITION_DISABLED` is always present because this decision slice has no acquisition runtime. Operational queue categories are `URGENT_CORRECTION_REVIEW`, `PRIMARY_SOURCE_MISSING`, `MAPPING_REQUIRED`, `ROUTINE_DISCOVERY_REVIEW`, `BLOCKED_RIGHTS`, and `NO_ACTION_DUPLICATE`. They describe review work only; no expected return, trade-worthiness, confidence, price target, or buy/sell score is computed.

Illustrative local planning caps (not provider quotas or acquisition approval): at most one request per non-aggregator supported family and two per discovery aggregator per run; 512 KiB per response; 25 records; five seconds; zero retries; no historical backfill; zero concurrent acquisitions. The unsupported independent-factual-corroboration family has a zero-request budget. Production requests remain blocked. Public documentation, development-only API, paid subscriptions, licensed feeds, unknown enterprise pricing, and rights are separate categories. No price or API access constitutes acquisition, processing, storage, retention, redistribution, persistence, or commercial-use approval.

Coverage is reported independently for jurisdiction, listed/unlisted issuers, filings, issuer releases, language, archive horizon, latency, correction availability, and payload/schema stability; each can be `UNKNOWN`. No source is described as global or complete. Two aggregators are not automatically two origins.

## Contract and operation boundary

The immutable decision binds source families/strengths, jurisdiction and event routes, state transition allowlists, stop/degradation/conflict reason codes, origin rules, coverage dimensions, per-family budgets, required approvals, blockers, evidence classifications, and contract status into a deterministic lexical-order fingerprint. `recordedAt` is review metadata outside the fingerprint. Canonical material is checked alongside hashes. Nested untrusted values are snapshotted using own data descriptors only after Proxy detection; accessors and unsafe prototypes are rejected without invoking caller code. The exported parser validates untrusted decision-shaped input but does not mint runtime trust; evaluation accepts only the module-local built-in decision and strict synthetic routing material. Caller input cannot assert a current state or stage history: each next evaluation requires the exact preceding module-authentic result, and terminal results cannot be resumed. Publication, discovery, receipt and evaluation times are separate and ordered; future correction availability is excluded from historical `evaluationAsOf`. A completed-purchase hint requires a separate completion-material flag and an appropriate primary publication family; otherwise it stops. The unsupported factual-corroboration family cannot be supplied as seen or available input.

Production configuration selects no source, contains no credentials or active routes, and blocks scheduler, acquisition/retrieval, raw/normalized storage, persistence, mapping, correction resolution, corroboration, event authority, signal, and trading. All approvals remain `NOT_APPROVED`. This slice has no network, DNS, provider, credentials, database, persistence, scheduler, signal, or trading ports and does not import sibling checkpoint implementations.

The full chain remains: discovery → stronger source retrieval → issuer/asset mapping → primary disclosure → correction/lifecycle review → later corroboration policy → separate eligibility review. A later event-authority and signal phase, if ever approved, must be separately designed and cannot be an automatic next state. The final source portfolio must be selected only after sibling source checkpoints are independently reviewed and integrated on updated main.

A stacked child checkpoint defines a separate evidence-review queue projection over trusted routing results. A later child degrades only sealed queue sets to a JSON-safe view model; that presentation model cannot be routed back into domain trust. The queue and view model are not persistence, scheduler, notification, UI, or authority wiring; production remains blocked.

The child read-model decision recommends immutable derived snapshots only after separate upstream/provenance, scope, rights, retention, and runtime approvals. It does not persist routing results as trusted inputs or upgrade source strength/authority. Current selection is presentation-only; production remains blocked.
# Composition integration note

The composition checkpoint (stacked on UI parent `4724b9de8a29f6ce6b2f1e3d1cfb691fabd44663`) calls the existing routing evaluator from `DISCOVERED` and follows its trusted transition results only. Synthetic route facts are test scenarios, not source retrieval, rights approval, mappings, corroboration, event authority, or production qualification. The production loader and source portfolio remain blocked.
# Snapshot scope and source provenance

Routing source precedence does not define snapshot scope. A future read model must pin an explicit review-universe and keep each source-family provenance branch typed and separate; route selection, source records, and derived queue snapshots do not establish cross-family authority. See [snapshot scope/provenance decision](EVENT_INTELLIGENCE_EVIDENCE_REVIEW_QUEUE_SNAPSHOT_SCOPE_PROVENANCE_DECISION.md).
