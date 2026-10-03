# Event intelligence news discovery contract

Version: `event-intelligence-news-discovery/v1`. Baseline: `0672e9af2e31d019e198b4a000c11eea71f2fd52`.

Issuer-attributed IR and wire-release role qualification is specified separately in [EVENT_INTELLIGENCE_ISSUER_ATTRIBUTED_RELEASE_SOURCE_QUALIFICATION.md](EVENT_INTELLIGENCE_ISSUER_ATTRIBUTED_RELEASE_SOURCE_QUALIFICATION.md). An IR/wire match is one issuer-origin only when release identity is explicitly bound; it is not independent corroboration. The synthetic fixture normal form does not parse or retrieve native publisher payloads.

## Scope and authority

This server-only, fixture-first boundary creates **NON_AUTHORITATIVE_DISCOVERY_CANDIDATE** results with `DISCOVERY_ONLY` authority status. Every material input is explicitly `SYNTHETIC`; v1 accepts only reserved `.test` source URLs. It neither consumes observed articles nor implements acquisition. Classification is a candidate label supplied by the synthetic fixture, never an inference of a completed transaction or an externally verified fact. An intention, plan, expected closing or headline does not prove completion.

The required chain is:

```text
news discovery
→ candidate
→ existing issuer/asset mapping boundaries
→ authoritative source retrieval
→ correction/lifecycle reconciliation
→ corroboration policy
→ event authority
→ optional, separately approved signal policy
```

Discovery cannot skip any step. It cannot issue issuer disclosure, externally verified event fact, mapped event authority, persistence authority, recommendation, order or trade. Existing SEC fixture, mapping and corroboration constructors reject these results through their own module-local trust checks. The explicit `rejectNewsDiscoveryAsAuthority` guard returns no authority for every named downstream boundary. There is no event-intelligence signal/trading handoff in the current repository to wire; future consumers must preserve this rejection. No parallel event authority or canonical asset registry is introduced.

## Record contract and safety limits

The strict input has a version, provider ID, source type, provider record ID, canonical source URL, publisher ID/name, nullable attributed issuer candidate, original publisher versus distributor, bounded headline and nullable summary, publication/discovery/receipt/update/recorded times, language, jurisdiction, entity/asset mentions, candidate categories, source locator, correction/retraction hint and classified confidence.

Source types are `NEWS_AGGREGATOR`, `ISSUER_IR`, `NEWSWIRE` and `EXCHANGE_OR_REGULATOR_FEED`. Provider IDs reuse the source decision vocabulary: `newsapi-discovery`, `gdelt-discovery`, `issuer-ir`, `businesswire-distribution`, `globenewswire-distribution`, `exchange-regulator`. They are descriptive fixture labels, not enabled providers. Provider/source-type mismatches are rejected. Newswire fixtures require an attributed issuer candidate; this is attribution, not verified issuer identity.

Limits are local v1 admission limits, not provider limits: 512 UTF-16 code units for a headline, 2,048 for a summary, 256 for the `article:` locator, 2,048 for a URL, 32 entity mentions, 32 asset mentions, ten unique categories and 64 origin-set members. This bounds the investigation descriptor rather than storing an article. Canonical IDs are lowercase ASCII letters/digits/colon/underscore/hyphen (96 units); URL/secret-like IDs and traversal are rejected. Human text must already be trimmed NFC, without control, format or surrogate characters; the parser does not silently normalize text. URLs must be exact HTTPS `.test` locators, without credentials, explicit ports, query, fragment, percent encoding, dot segments or repeated path separators. No URL is dereferenced.

Times use exact millisecond UTC ISO strings, from 1970 onward, with a required explicit evaluation time. Require `publication ≤ discovery ≤ receipt ≤ recorded ≤ evaluation`. If present, source update is between publication and receipt. These are local fixture chronology rules, not universal assertions about publisher clocks. Future observed adapters need separately reviewed timestamp semantics and must not fabricate missing provider times. Language accepts lowercase 2–3 letters with an optional uppercase two-letter region; jurisdiction accepts two uppercase letters or `UNKNOWN` (syntax, not a country registry).

Unknown fields at every supported nesting level, inherited/non-plain objects, symbols, accessors, sparse/custom arrays, duplicates, unsafe identifiers, malformed chronology and excessive bounds are rejected. Node's native `util.types.isProxy` runs before any reflective inspection of caller objects, so Proxy traps/getters are not invoked. The error is always `NEWS_DISCOVERY_INVALID` or a null rejection, without input values. The result contains the intentionally bounded headline/summary, not a raw payload, transport error, headers or credentials.

Confidence is `RELEVANT_MENTION`, `EXPLICIT_ATTRIBUTION` or `AMBIGUOUS`; it is not a probability, factual confidence score or eligibility decision. Explicit attribution in a fixture does not establish real-world source independence.

Supported candidate categories:

- `CORPORATE_CRYPTO_PURCHASE_INTENT`
- `BOARD_AUTHORIZATION`
- `BINDING_PURCHASE_AGREEMENT`
- `COMPLETED_CRYPTO_PURCHASE`
- `TREASURY_POLICY_CHANGE`
- `ASSET_OR_COMPANY_ACQUISITION`
- `STRATEGIC_PARTNERSHIP`
- `CANCELLATION_OR_TERMINATION`
- `CORRECTION_OR_RETRACTION`
- `UNSPECIFIED_RELEVANT_MENTION`

These labels are discovery vocabulary, not a replacement for existing event types or a conversion to authoritative event claims. Even `COMPLETED_CRYPTO_PURCHASE` remains an unverified candidate classification.

Version 1 deliberately has **no structured event-occurrence, expected-closing or completion timestamp**. A headline/summary may mention an expected close or claimed completion, but the descriptor preserves only bounded text and an explicit candidate category. Publication, source update, discovery, receipt, record and evaluation times remain separate fields; none is substituted for event time. Any later extraction version must retain separate source-claimed occurrence/expected-close/completion values with provenance and must not infer completion from intent, an expected date, or an article headline.

## Identity, trust and replay

All fingerprints use lowercase SHA-256 over fresh validated canonical descriptor material. Object keys and set members use explicit UTF-16 lexical ordering, without locale-dependent comparison. Mention arrays are sets sorted by candidate ID; category arrays are unique sorted sets. Duplicate IDs are rejected instead of merged.

| Identity | Material |
| --- | --- |
| Source fingerprint | Contract version, canonical URL, publisher, declared origin/distribution, headline/summary, publication/update time, language/jurisdiction and locator |
| Provider replay key | Provider ID + provider record ID |
| Candidate fingerprint/ID | Every normalized record field except discovery, receipt and recorded time |
| Receipt fingerprint/ID | Candidate fingerprint + discovery time + receipt time |
| Sealed origin-set fingerprint | Version + ordered candidate fingerprints/lifecycle projections + exact declared group membership |

The source fingerprint describes metadata; it is **not** a hash of retrieved article bytes or a SEC document artifact. Update time, corrected material or changed classification changes the appropriate material fingerprint. Re-observation of identical material preserves source/candidate identity and changes receipt identity when receipt times change. Recorded/evaluation times are annotations outside all material identities. The sealed set carries `evaluatedAsOf` separately and excludes it from its fingerprint; members must have been both received and recorded by that cutoff. Lifecycle projection is computed only from those members. Origin-set identity also excludes receipt; a set selects one observation per provider record and cannot count receipt replays as additional evidence.

Parsing produces an immutable **untrusted** candidate. The synthetic fixture constructor creates private module-local candidate trust only, with no authority trust. Origin sealing requires those exact same-runtime candidate instances. Copied/spread, structured-cloned, JSON-round-tripped and caller-fabricated results are rejected. Fresh nested snapshots are deeply frozen; caller mutations cannot alter results. There is no trust mutator, test flag or authority issuer.

## Dedupe, syndication and lifecycle

`event-intelligence-discovery-origin-set/v1` seals an exact nonempty member set with contiguous zero-based ordinals and an explicit `evaluatedAsOf`. It groups only an explicit declared tuple: original publisher ID, original publication ID and original source URL. All three must be present together. Missing origin information creates an unresolved singleton. Publisher ID/name contradictions, a reused publication ID with contradictory source URL, duplicate candidate IDs and duplicate provider-record keys fail closed. Members received or recorded after `evaluatedAsOf` are rejected, so they cannot enter a historical projection.

| Relationship | Treatment |
| --- | --- |
| Same provider record, same material | Explicit replay; same candidate, separate receipt if time differs |
| Same provider record, different material | Material conflict; cannot silently overwrite or seal together |
| Same canonical URL | URL match only; does not establish event equality or independence |
| Same original article via several aggregators | One declared discovery-origin group |
| Wire copy/syndicated copy | Same declared upstream group; distributor remains separate from original publisher |
| Similar headline/text/time across journalists | Distinct unverified groups unless an explicit upstream declaration links them |
| Issuer original disclosure | Distinct source class; still discovery-only here |
| Correction/retraction | Explicit append-only successor linked to the retained original candidate |

Every group and set has **zero independent authority origins**. Discovery origin groups are not `EventSourceOrigin` objects and cannot be submitted as corroboration claims. No text similarity, simultaneity, URL equality or origin grouping is an event merge or proof of journalistic independence.

Correction/retraction hints target an exact candidate ID. Sealing requires the target to be present, a strictly later publication time, the same declared upstream origin and one successor per target. Missing parents, forks, unrelated-origin links and successors of a retraction are rejected. Strict chronology rules out cycles in a sealed set; the projection also checks cycles with a bounded visited set. Projection marks the original `CORRECTED` or `RETRACTED` only when the lifecycle member was received and recorded by `evaluatedAsOf`; all original and successor records remain frozen and retained. Later corrections cannot enter earlier views, and later retractions cannot reverse history. Lifecycle hints and projections remain synthetic discovery material; authoritative reconciliation needs the later source-retrieval contract. Same-provider-record changes are conflicts, not corrections; a correction must have a distinct record ID.

Entity mentions, parent/subsidiary hints and issuer attribution create no issuer merge or mapping. Asset candidates carry labels/tickers and representation hints only. ETH, WETH, native, wrapped and bridged remain distinct mentions. A ticker alone creates no canonical asset ID; later processing must use the existing issuer and asset mapping boundaries.

## Provider/source decision and official evidence

Documentation only was inspected; no API request, credential, subscription or terms acceptance occurred. The following reference register records official primary pages, check time and the limits of each claim. `DOCUMENTED` means explicitly described by the page; `OBSERVED` means the page was accessible and displayed that statement, without runtime API verification; `INFERRED` is our architectural assessment; `UNKNOWN` is not established by these references.

| Source/class | Role in this slice | Later possibility and missing evidence |
| --- | --- | --- |
| NewsAPI | DISCOVERY_ONLY | Article metadata/snippets; no original-origin, completion, independence or correction authority |
| GDELT | DISCOVERY_ONLY | Search/discovery index; no event truth, issuer mapping or publisher-content rights established |
| Issuer IR/RSS | DISCOVERY_ONLY | Scope-dependent later issuer-disclosure review must prove domain ownership, registrant mapping, exact source material and lifecycle |
| Issuer-attributed newswire | DISCOVERY_ONLY | Later disclosure review requires attribution/provenance; wire + aggregator copies are not independent confirmations |
| Exchange/regulator feed | DISCOVERY_ONLY | Later authority review is jurisdiction/event/scope dependent; feed alerts alone are not document authority |

### Official reference register

Checked `2026-10-03T05:38:39Z`:

- **[Everything — Documentation — News API](https://newsapi.org/docs/endpoints/everything)**: DOCUMENTED article URL/source/title/description, UTC publication and content truncated to 200 characters. INFERRED suitability for discovery descriptors. UNKNOWN stable article record ID, original publisher chain, correction/finality and event completion. A future adapter needs an explicit record-ID policy; this contract does not pretend the API provides one.
- **[Pricing — News API](https://newsapi.org/pricing)**: OBSERVED Developer $0, development/testing only, 100 requests/day and 24-hour article delay; Business $449/month and Advanced $1,749/month billed monthly. Production subscription availability is not Money Machine approval. Full article bodies are not provided in search results. Plan selection and actual production usage remain blocked.
- **[Terms — News API](https://newsapi.org/terms)**: DOCUMENTED Developer exclusion from staging/production, including internal use, and third-party copyright restrictions on republication. No blanket article ownership or storage/retention right is inferred. UNKNOWN rights for any concrete article/source and its retained excerpts. No terms were accepted.
- **[The GDELT Story: About the GDELT Project](https://gdeltproject.org/about.html)**: DOCUMENTED released GDELT datasets may be used without fee for academic/commercial/government purposes; redistribution requires citation and website link. These dataset permissions do not establish permission to store or redistribute linked publisher article bodies. UNKNOWN underlying-content rights and retention limits for the proposed service.
- **[GDELT DOC 2.0 API Debuts!](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)**: DOCUMENTED full-text search and article-list discovery capabilities. INFERRED candidate discovery use. UNKNOWN guaranteed complete coverage, independent origins, correction chain, stable issuer/asset mapping and current API service SLA/plan. No API example was executed.

Checked `2026-10-03T05:42:51Z` (pages also inspected again through `2026-10-03T05:52:11Z`):

- **[Microsoft Investor Relations — Contact Information](https://www.microsoft.com/en-us/investor/contact-information)**: OBSERVED an issuer-hosted IR channel with earnings and SEC filing links. This is a representative IR class, not a selected provider or proof about another issuer. UNKNOWN issuer-specific RSS availability, feed pricing, downstream usage, content storage/retention/redistribution and commercial terms. No RSS feed or article was fetched.
- **[Business Wire Pricing & Distribution Plans](https://www.businesswire.com/pricing)**: OBSERVED distribution services starting at $475 for a 400-word U.S. domestic local release. This is publisher distribution pricing, **not** reader/API acquisition pricing. INFERRED issuer-attributed releases require origin tracking rather than independent-source counting. UNKNOWN acquisition plan and usage/storage/retention/redistribution/commercial permission for Money Machine.
- **[About GlobeNewswire Services](https://www.globenewswire.com/en/about)**: DOCUMENTED corporate press-release/financial disclosure distribution. INFERRED distributed issuer news is not another independent confirmation. UNKNOWN reader/API pricing, concrete content permissions and retention. No origin guarantee is accepted solely from marketing language.
- **[SEC.gov — RSS Feeds](https://www.sec.gov/about/rss-feeds)**: DOCUMENTED SEC materials and EDGAR company/latest filing search feed classes. INFERRED feed alerts can lead to later exact authoritative-source retrieval. UNKNOWN universal completeness/latency, exchange feed equivalence, and any permission for unrelated publisher content. No live feed was fetched. No universal pricing or rights policy is inferred for the entire exchange/regulator class.

### Rights versus local approvals

| Source | Public plan/usage evidence | Raw content storage / retention / redistribution / commercial use |
| --- | --- | --- |
| NewsAPI | Public free development and paid production plans; third-party rights remain relevant | UNKNOWN for specific content; all local approvals NOT_APPROVED |
| GDELT | No-fee dataset use; dataset redistribution with attribution | Dataset redistribution/commercial permission documented; underlying articles and retention UNKNOWN; all local approvals NOT_APPROVED |
| Issuer IR/RSS | Source-specific; representative IR availability observed | UNKNOWN across the class; all local approvals NOT_APPROVED |
| Newswire | Distribution offerings documented; acquisition plan UNKNOWN | UNKNOWN for this integration; all local approvals NOT_APPROVED |
| Exchange/regulator feed | Representative SEC feed types documented; no class-wide plan | UNKNOWN across the class; all local approvals NOT_APPROVED |

No provider/source stack is selected. Discovery suitability is a technical assessment, not legal or operational approval. A paid tier, publicly visible release, or documented dataset license does not approve Money Machine acquisition, normalized persistence, raw content storage, retention, redistribution, commercial use or signal research.

## Production and next slice

`config/intelligence/event-intelligence-news-discovery.production.json` is parsed into a deeply immutable server-only production value. Selected providers and sources are empty. Acquisition, normalized discovery persistence, raw content storage, all persistence, issuer/asset mapping, corroboration, event authority, scheduler, signal generation and trading are all `BLOCKED`; overall status is `BLOCKED_BACKEND_UNAPPROVED`. All seven existing usage approvals are `NOT_APPROVED`, as are storage, retention, redistribution and commercial approvals. Strict config rejects readiness upgrades, enabled stacks, duplicate approvals, credentials/environment references and unknown nested fields. Existing production source/mapping/corroboration/readiness registries are unchanged.

The next slice is a separate provider-specific discovery-acquisition decision, still blocked until its source/usage/plan review, credential boundary, request/rate/response budgets, canonical record-ID policy, exact origin attribution, observed timestamps and correction/retraction policy are approved. It must introduce an explicit adapter version for real URLs and missing provider fields rather than relaxing synthetic trust. Actual live acquisition needs separate authorization. Storage/persistence, authority and any later signals each need their own approved boundaries.

## Synthetic verification and checkpoint security status

Focused tests cover A–J: intent without completion; issuer/wire/aggregator origin grouping; similar independent articles not merged; append-only corrections/retractions; ticker and parent/subsidiary ambiguity; copied/serialized/fabricated trust; unsafe shapes and Proxy trap avoidance; bounds; stable source/replay versus separate receipt identity; and existing SEC/mapping/corroboration rejection. Tests import no transport and execute no network or persistence operation.

The baseline audit blocker remains **GHSA-vfj7-8cjw-p6xm**, affected `braces <=3.0.3`, with no published patched release in the prior isolated triage. The baseline dev dependency chain is `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3`. The finding reproduces independently of this discovery slice; no dependency/lockfile changes, downgrade, waiver, override, fork or patch are made. Dev-only classification does not satisfy the existing `npm audit --audit-level=high` gate. A pushed commit is a preserved **CHECKPOINT_PUSHED_BLOCKED_UPSTREAM**, not READY_FOR_REVIEW or approval to merge. No final-SHA build overrides that blocker.

The [GitHub advisory, “braces vulnerable to stack-exhaustion denial of service through deeply nested patterns”](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), checked `2026-10-03T06:01:01Z`, lists affected versions through 3.0.3 and no patched version. The single explicit audit in this slice exited 1 and reported five high entries in that same dependency chain; its forced `eslint-config-next@14.2.35` downgrade suggestion was not executed.

### Executed gates (2026-10-03)

| Gate | Result |
| --- | --- |
| `npx vitest run tests/financial/event-intelligence-news-discovery.test.ts` | 110/110, twice after final code changes |
| `npx vitest run event-intelligence sec-edgar sec-event lineage` | 315/315 across 19 files: 110 discovery + 205 existing regressions |
| `npm test` | 1,100 passed / 35 skipped; 96 files passed / 2 skipped |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0, no new warnings |
| `npm ls --all` | exit 0; no invalid/extraneous/required missing dependency; platform/peer optional omissions are expected |
| `git diff --check` (including staged new files) | exit 0 |
| `npm audit --audit-level=high` | exit 1, expected baseline GHSA-vfj7-8cjw-p6xm chain only |
| Final-SHA build | Not run while the security gate is blocked, per checkpoint scope |

The existing Vitest configuration prints its baseline future config-loader advisory. Tests do not resolve DNS or invoke news/provider endpoints. Official documentation browsing, npm dependency operations and authorized Git operations are separate from live acquisition. No other worktree's files were opened or changed; shared Git worktree metadata retained the existing branch/HEAD pairs. Protected worktrees were not traversed to reread content or compute new file hashes.

## Independent pre-PR review

Review-start SHA `b76d746123dcb3da56f5857f8626610aecabc81f`; baseline/origin/main remained `0672e9af2e31d019e198b4a000c11eea71f2fd52`. Review found and fixed two gaps in follow-up commit `fix(intelligence): harden news discovery contract`:

1. A sealed origin set previously projected all supplied later corrections/retractions without an explicit historical evaluation cutoff. It now requires `evaluatedAsOf`; a member must have been received and recorded by that time. This keeps a later correction out of an earlier view. Projection also performs a bounded cycle check.
2. Production config blocked normalized discovery persistence but did not separately name general persistence or scheduler. Both are now mandatory `BLOCKED` operations in the strict parser and production config.

Official pages were rechecked on `2026-10-03` at `06:16 UTC`: [NewsAPI Everything](https://newsapi.org/docs/endpoints/everything) documents article source/title/description/URL, UTC publication and content truncated to 200 characters; [NewsAPI Pricing](https://newsapi.org/pricing) lists a free development/testing plan and paid production tiers; [NewsAPI Terms](https://newsapi.org/terms) restrict Developer use to development and address third-party content/IP and attribution. Pricing does not approve content storage. [GDELT DOC 2.0](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) documents search/discovery; [GDELT Terms](https://gdeltproject.org/about.html) grant use/redistribution rights for released datasets with attribution, not a license to linked publisher articles. [Microsoft Investor Relations](https://www.microsoft.com/en-us/investor/contact-information) is one issuer IR example and does not establish class-wide RSS. [Business Wire pricing](https://www.businesswire.com/pricing) concerns issuer distribution rather than reader/API access; [GlobeNewswire about](https://www.globenewswire.com/en/about) describes corporate release distribution. [SEC RSS Feeds](https://www.sec.gov/about/rss-feeds) documents SEC/EDGAR feed classes, not all exchange feeds. Concrete Money Machine acquisition, storage, retention, redistribution and commercial permissions remain `UNKNOWN` pending scope review; local approvals remain `NOT_APPROVED`. No legal conclusion was made, and no terms, account, subscription or API call was made.

The review's focused discovery tests passed **113/113 twice**, selected event/SEC/mapping/corroboration/lineage regressions passed **318/318 across 19 files**, and the full unit suite passed **1,103 with 35 skipped**. Typecheck, lint, `npm ls --all` (no invalid, extraneous or missing required packages), and both diff-checks passed. The single review audit run exited 1 with five high findings, all the same baseline GHSA-vfj7-8cjw-p6xm chain; `npm audit` also suggested a breaking `eslint-config-next@14.2.35` downgrade, which was not run. Final-SHA build was not run while audit remains blocked. Review status is `REVIEWED_CHECKPOINT_BLOCKED_UPSTREAM`.
