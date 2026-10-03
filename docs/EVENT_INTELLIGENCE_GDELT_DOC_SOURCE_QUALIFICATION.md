# GDELT DOC discovery source qualification

Contract: `event-intelligence-gdelt-doc-source-qualification/v1`
Status: **PARTIAL_DISCOVERY_ONLY**; no acquisition qualification or production selection.
Parent: `feat/event-intelligence-news-discovery-contract` at `afa7ce136d27343a4d659b2984a1d2dda427d2f7`.
Official pages checked: 2026-10-03 07:34 UTC.

## Decision and source evidence

GDELT DOC 2.0 is a concrete candidate for broad discovery of company crypto purchase intent, treasury changes, announced or completed purchases, acquisitions, partnerships, cancellations, corrections and retractions. Search results remain unverified discovery metadata. A query-profile match does not prove the event category, issuer, asset, completion, original publisher, correction lineage, completeness, freshness or corroboration.

| Official source | Documented support | Qualification treatment |
|---|---|---|
| [GDELT DOC 2.0 API Debuts!](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) â€” checked 2026-10-03 07:34 UTC | DOC is a full-text search API; English query terms search translated monitored coverage; documented query syntax includes quoted phrases, OR and operators; `artlist`, JSON, `startdatetime`/`enddatetime`, `maxrecords`, `sort=DateDesc`, language/country query operators, and mode-dependent JSON fields are described. | DOCUMENTED for those semantics. Exact current ArticleList JSON field names/schema are UNKNOWN because the page says fields vary by mode and does not pin a versioned schema. |
| [The GDELT Story: About the GDELT Project](https://gdeltproject.org/about.html) â€” checked 2026-10-03 07:34 UTC | GDELT says released datasets are available without fee for academic, commercial and governmental use, and that dataset redistribution requires citation and a link. | DOCUMENTED as GDELT's statement about its datasets. It does not establish linked publisher article text/image rights or Money Machine approvals. No legal conclusion is made. |
| [Ukraine, API Rate Limiting & Web NGrams 3.0](https://blog.gdeltproject.org/ukraine-api-rate-limiting-web-ngrams-3-0/) â€” checked 2026-10-03 07:34 UTC | DOC/Context APIs are rate limited; high-volume querying is directed to a downloadable dataset. | DOCUMENTED that rate limiting exists; numeric quota/window is UNKNOWN. Proposed request limits are local safeguards only. |
| [DOC & GEO 2.0 API Updates: Full Year Searching And More!](https://blog.gdeltproject.org/doc-geo-2-0-api-updates-full-year-searching-and-more/) â€” checked 2026-10-03 07:34 UTC | 2018 notice says DOC search could reach a year. | DOCUMENTED as a historical announcement; current horizon is UNKNOWN. |
| [DOC 2.0 Updates: 1.5 Year Searching And Updated Mobile Interface](https://blog.gdeltproject.org/doc-2-0-updates-1-5-year-searching-and-updated-mobile-interface/) â€” checked 2026-10-03 07:34 UTC | Later 2018 notice describes fixed historical start and mode-specific recent-window behavior. | DOCUMENTED as historical behavior; current horizon/result-window semantics are UNKNOWN. |

The DOC launch page documents a maximum of 250 ArticleList results per request and a default of 75; this contract caps the synthetic/first-smoke profile at 25. That is a local safety cap, not a provider limit. `DateDesc` orders by publication date according to the page, but does not provide a stable pagination cursor. No pagination contract is assumed. The page documents `sourcecountry:` and `sourcelang:` as query operators (FIPS country codes and language names/codes); it does not pin the normalized JSON fields used here. The query profiles do not currently apply those operators.

| Material claim | Evidence class | Notes |
|---|---|---|
| DOC full-text search, modes, format parameter and query grammar | DOCUMENTED | Official DOC page; individual profile strings use quoted phrases and one non-nested OR group. |
| 250 maximum ArticleList results and 75 default | DOCUMENTED | Official DOC page; local maximum is 25. |
| DateDesc means newest publication dates first | DOCUMENTED | Does not imply stable order across index changes. |
| Exact native DOC JSON properties for URL/domain/title/image/language/country/seen time | UNKNOWN | JSON field set varies by mode; the native field schema is not version pinned. |
| Article publication-time property and exact meaning of a seen time | UNKNOWN | Historical descriptions are not a current native JSON schema. |
| Language search across translated coverage and source-language filter operator | DOCUMENTED | Not a guarantee of all languages or complete coverage. |
| Source-country operator and two-character FIPS lookup | DOCUMENTED | Does not make source country an issuer jurisdiction or source authority. |
| Current archive horizon and mode-specific time window | UNKNOWN | Official notices in 2017/2018 describe successive behavior changes; no current versioned limit was found. |
| API rate limiting exists | DOCUMENTED | No numerical rate/window on the reviewed official rate-limit page. |
| DOC API request pricing/plan | UNKNOWN | The no-fee language on the About page applies to released datasets; it is not treated as an API service price or service-level promise. |
| GDELT metadata dataset use/redistribution | DOCUMENTED | GDELT About statement requires attribution and link for dataset redistribution; no legal interpretation is made. |
| Linked publisher article text/image rights | UNKNOWN | Not established by the GDELT dataset statement. |

The 2017 page documents precise start/end parameters formatted `YYYYMMDDHHMMSS` and a historical range. Other official notices later changed the horizon. The contract only defines a seven-day *local requested-window maximum* and uses both explicit endpoints; current provider acceptance, completeness, ranking stability and freshness remain unverified. There is no live request in this slice.

GDELT DOC ArticleList metadata is not conflated with separate GDELT Article List (GAL) feed schemas. The internal `gdelt-doc-normalized-fixture/v1` is a synthetic adapter contract, **not** the native GDELT JSON shape. `articleTime` and `providerSeenAt` are normalized fixture fields only; native DOC field mapping and exact timestamp semantics remain UNKNOWN. `articleUrl` is a source locator, not proof of original publisher or independent origin. Optional image URL is inert metadata and is never fetched.

## Rights and approval boundaries

| Activity/material | Status in this slice |
|---|---|
| Acquisition approval | NOT_APPROVED; no API key, account, terms acceptance or request |
| GDELT metadata processing | Technically modeled for synthetic fixtures; production BLOCKED / NOT_APPROVED |
| GDELT metadata storage | NOT_APPROVED |
| Linked article text/image storage | NOT_APPROVED; GDELT dataset statement is not treated as publisher-content permission |
| Normalized discovery storage | NOT_APPROVED |
| Authority persistence | NOT_APPROVED |
| Retention | NOT_APPROVED |
| Redistribution | NOT_APPROVED for product use; GDELT's dataset statement requires citation/link but no internal approval is inferred |
| Commercial use | NOT_APPROVED internally; GDELT's dataset statement is not an internal approval |

No terms were accepted and no account or subscription was created.

## Versioned request and query profiles

The profile is exactly HTTPS `GET https://api.gdeltproject.org/api/v2/doc/doc`, mode `artlist`, format `json`, sort `DateDesc`. Its full material has an endpoint-profile fingerprint, and each request fingerprint binds that profile fingerprint, the baked query-profile fingerprint and explicit time range. Query keys and order are pinned as `query`, `mode`, `format`, `maxrecords`, `startdatetime`, `enddatetime`, `sort`. Only six baked query strings are allowed; caller text, operators, URL fragments, caller headers, credentials, redirects and retries are not part of the contract. Time range is explicit UTC and at most seven days. The first-smoke local limits are 6 requests per execution and minute, at most one per query profile, 25 returned records, 512 KiB response, 5 second total deadline and zero retries. These are client-side safeguards, not GDELT's IP quota. No transport is implemented.

| Query profile | Candidate hint only | Search limitations |
|---|---|---|
| `treasury-purchase-intent-v1` | CORPORATE_CRYPTO_PURCHASE_INTENT | Homonyms, phrase variants, non-English terms, and recall misses; no issuer/asset identity |
| `completed-corporate-purchase-v1` | COMPLETED_CRYPTO_PURCHASE | Headline/text match is not proof of completion; requires original-source retrieval |
| `crypto-acquisition-v1` | ASSET_OR_COMPANY_ACQUISITION | â€œCryptoâ€ and â€œdigital assetâ€ have broad meanings; acquisition target may be company, technology or asset |
| `lifecycle-correction-v1` | CORRECTION_OR_RETRACTION | Match is only a title/query hint; it creates no correction or retraction lineage |
| `treasury-policy-change-v1` | TREASURY_POLICY_CHANGE | Policy language does not prove a board action or effective policy |
| `strategic-crypto-partnership-v1` | STRATEGIC_PARTNERSHIP | Match does not establish agreement, parties, binding status or completion |

Queries are discovery recall filters, not authority rules, mappings, or completeness guarantees. Ticker-only queries are excluded. English phrases can miss translated terminology and create false positives.

## Identity, response and projection

GDELT DOC does not have a pinned stable record ID in the reviewed material. The local source-material ID is a SHA-256 over the normalized article URL, source domain, title, language/country fields, optional article time and image locator. It explicitly is a derived local key, not a provider identifier. `providerSeenAt`, receipt time, raw payload fingerprint and evaluation time are excluded from source-material identity. A separate receipt fingerprint binds query/window identity, receipt time and fixture payload fingerprint. Exact duplicate normalized material in one response collapses to one candidate; similar titles at different URLs do not merge. URL equality alone does not imply independent origin or same event.

The parser accepts only synthetic normalized fixtures and never claims to parse actual DOC JSON. It bounds fields, validates canonical HTTPS URLs and source-domain alignment, rejects unsafe JavaScript shapes without evaluating accessors/proxy traps, rejects future material relative to `evaluationAsOf`, and returns sanitized null on error. It does not retrieve article content, images or follow links. Query profile selects a candidate-category hint, never event truth. Issuer and asset mappings remain unresolved; BTC-like words/tickers do not map assets and parent/subsidiary mentions do not merge issuers.

Only the module-local synthetic projection qualification is runtime-trusted, and it grants fixture projection only. Parser outputs, copies, serialized objects and caller lookalikes are not trusted. The response trust issuer is reachable only through the Vitest-only `test-only:gdelt-doc-response` seam; the test loader transforms the private function only in the test compiler, and the seam is not imported by production modules or configured in Next.js. Projection always returns `NON_AUTHORITATIVE_DISCOVERY_CANDIDATE`, with completion, mapping, corroboration, persistence, event authority, signal and trading eligibility false. This output is not an existing event-authority, signal or persistence input.

## Required chain and known gaps

```text
GDELT DOC
â†’ discovery metadata
â†’ NON_AUTHORITATIVE_DISCOVERY_CANDIDATE
â†’ original source retrieval
â†’ issuer/asset mapping
â†’ lifecycle/correction review
â†’ corroboration
â†’ event authority
â†’ separate signal policy
```

`PARTIAL_DISCOVERY_ONLY` is the maximum status. The native JSON schema, pagination, current time coverage, completeness, latency/freshness, correction/retraction support and linked-content rights remain blockers. Production config has no selected source, no credentials/environment references, every operation BLOCKED, and every usage/storage/retention/redistribution/commercial approval NOT_APPROVED. The only next step is a separately reviewed request/transport and acquisition-approval slice; it must not upgrade authority or persist results by implication.

## Tests

`tests/financial/event-intelligence-gdelt-doc-source-qualification.test.ts` covers static profiles, synthetic projection, replay/receipt identity, duplicate material, unsafe shapes, bounds, future data, URL validation, mapping and authority denial, and blocked production config. No network operation is used.

## Independent review follow-up (2026-10-03)

The official DOC launch documentation was rechecked at 2026-10-03 08:17 UTC. It documents the `/api/v2/doc/doc` examples, quoted phrase and parenthesized `OR` syntax, `artlist`, JSON, `DateDesc`, explicit `STARTDATETIME`/`ENDDATETIME` in `YYYYMMDDHHMMSS` precision, and the documented 250-result ArticleList maximum. This contract's 25-record and seven-day limits remain local safeguards. The page describes start as strictly after and end as strictly before the supplied timestamps. Historical horizon changes do not establish today's horizon; it remains `UNKNOWN`. GDELT's current published About page describes use/redistribution terms for released datasets, but this does not establish rights in linked publisher content or internal product approval. No legal conclusion is made.

The review added two fail-closed checks: request windows with fractional seconds are rejected because the wire format cannot represent them without truncation, and qualification parsing type-checks timestamp/classification values before any comparison so attacker-controlled coercion hooks are not invoked. A native-looking `articles` payload is explicitly tested as unqualified. The parser remains limited to the internal synthetic normal form.

Official pages rechecked: [GDELT DOC 2.0 API Debuts!](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/), [Ukraine, API Rate Limiting & Web NGrams 3.0](https://blog.gdeltproject.org/ukraine-api-rate-limiting-web-ngrams-3-0/), and [The GDELT Story: About the GDELT Project](https://gdeltproject.org/about.html). The DOC API page documents syntax and historical settings; rate limiting is documented without a numeric quota in the reviewed rate-limit notice; the About page speaks to GDELT datasets. Current archive horizon, numeric rate quota, native ArticleList field schema, stable record identifiers, pagination, completeness, publisher authority and linked-content rights remain `UNKNOWN`.
