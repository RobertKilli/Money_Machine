# NewsAPI Everything discovery source qualification

Contract: `event-intelligence-newsapi-everything-source-qualification/v1`
Status: **PARTIAL_DISCOVERY_ONLY**; production acquisition and all persistence remain blocked.
Reviewed: **2026-10-03 08:30 UTC**.
Parent: `feat/event-intelligence-news-discovery-contract` at `afa7ce136d27343a4d659b2984a1d2dda427d2f7`.

## Decision

NewsAPI `/v2/everything` is a bounded discovery-only candidate for crypto treasury intent, claimed completed purchases, treasury policy, crypto-related acquisitions, partnerships, and cancellation/correction/retraction mentions. The maximum status is `PARTIAL_DISCOVERY_ONLY`: the API is documented for article discovery, but the selected use has no acquisition or rights approval, native null/schema details are not sufficiently pinned for an authentic parser, source coverage/freshness are not guaranteed, and correction lineage is not supplied. No terms were accepted, account created, subscription started, or API key used.

NewsAPI is an aggregator. Its `source.id`/`source.name`, `author`, headline, description and publisher URL are provider metadata, not proof of original publisher, issuer identity, legal author identity, event fact, completion, or independent corroboration. `totalResults` is provider-reported search metadata, not a complete source universe. A linked publisher article or image is never fetched here.

## Official source register

All URLs below are official NewsAPI pages. They were checked at **2026-10-03 08:30 UTC**. No live API observation was made.

| Source | Classification and bounded claim | Qualification consequence |
|---|---|---|
| [Everything endpoint](https://newsapi.org/docs/endpoints/everything), “Everything /v2/everything” | **DOCUMENTED**: `GET /v2/everything`; `q` phrases and Boolean `AND`/`OR`/`NOT` with parentheses; `searchIn` title/description/content; ISO `from`/`to`; supported language codes including `en`; `sortBy` values; `pageSize` max 100; `page`; response `status`, `totalResults`, article `source`, `author`, `title`, `description`, `url`, `urlToImage`, `publishedAt` UTC and `content` truncated to 200 characters when available. | Fixed search profiles use documented operators, title/description, English, `publishedAt`, page size 25, one page. Native response nullability and runtime schema are not qualified; only the internal synthetic normal form is parsed. |
| [Authentication](https://newsapi.org/docs/authentication), “Authentication” | **DOCUMENTED**: API key may be sent as query `apiKey`, `X-Api-Key`, or `Authorization`; the provider recommends header forms to avoid URL/log exposure. | Future transport uses only server-side `X-Api-Key`, resolved late from a credential reference. The key is never a URL parameter. No key/reference is set in production config. |
| [Errors](https://newsapi.org/docs/errors), “Errors” | **DOCUMENTED**: HTTP 400, 401, 429 and 500 are described; provider error bodies contain `code` and `message`. | Any future adapter must map these to sanitized local errors and never echo provider body/message or auth data. No transport is implemented. |
| [Pricing](https://newsapi.org/pricing), “Pricing” | **DOCUMENTED as displayed on review date**: Developer is $0, 100 requests/day, 24-hour article delay, up to one-month history, and development/testing only; it is prohibited in staging/production including internally. Business is displayed at $449/month with 250,000 requests/month and up to five years' search; Advanced at $1,749/month with 2,000,000 requests/month and up to five years. Business/Advanced are presented for production/published commercial use. Full article text is not supplied; the page points users to the publisher URL if they need it. | Numbers and availability are date-specific plan statements, not a quote, SLA, rights grant, or approval. No plan was selected or purchased. Production plan eligibility must be reviewed for the actual use before acquisition. |
| [Terms](https://newsapi.org/terms), “News API Terms of Service” (page states last updated April 30, 2020) | **DOCUMENTED**: terms prohibit reproducing/republishing copyrighted material and building a competing news database; returned data can contain third-party text/images/videos subject to their rights; source and author attributions must not be misrepresented or removed; Developer use is limited to development/testing. | These statements are recorded, not interpreted as legal advice. They do not establish permission to store snippets, normalize/store metadata, retain, redistribute or commercially expose publisher material. |
| Attribution/content policy page | **UNKNOWN**: no separate current attribution/content policy establishing rights to linked article text or images was found in the official material reviewed. Terms include attribution/source integrity restrictions. | No article or image storage, redistribution, public display, or retention approval is inferred. |

Evidence classification: **OBSERVED** = no provider response observations in this slice; **INFERRED** = the selected local bounds and discovery-only architecture are our design choices; **UNKNOWN** = no qualified source guarantee for completeness, freshness, correction lineage, exact native null behavior, or third-party content rights. Pricing is explicitly distinguished from processing/storage/retention/redistribution/commercial approvals. No legal conclusion is made.

## Rights and usage boundary

| Material or operation | This slice |
|---|---|
| API access/acquisition | `NOT_APPROVED`; a Developer key is not permitted outside a development/testing environment. A later production use would require an eligible reviewed plan and separate approval. |
| Metadata processing | Synthetic fixture projection only; real metadata processing is not approved. |
| Metadata persistence / normalized discovery persistence | `NOT_APPROVED`. |
| Raw response / article text storage | `NOT_APPROVED`; content is not emitted in candidate output. |
| Linked publisher text / images | Rights `UNKNOWN`; neither fetched nor stored. |
| Retention / redistribution / commercial use | Each `NOT_APPROVED`. |
| Authority / signal / trading | `BLOCKED`; no discovery output may enter these paths. |

Pricing/API access does not itself approve storage, retention, redistribution, or commercial use. The plan page's suggestion to visit a publisher URL is not treated as a grant to scrape it. The Terms page is recorded without acceptance, and there is no legal conclusion.

## Versioned request profile

The sole profile is HTTPS `GET https://newsapi.org/v2/everything`. Query keys and order are pinned to `q`, `searchIn`, `from`, `to`, `language`, `sortBy`, `pageSize`, `page`. There is no caller URL, arbitrary query, source/domain selection, header injection, redirect, or retry. `q` is selected from six fixed profiles only. Dates are explicit UTC calendar dates, with no more than seven calendar dates inclusive; one request is page 1 only. Local safeguards are six requests per execution/minute, at most one request per profile, 25 records/page, 512 KiB response, five-second global deadline, identity encoding and zero retries. These local numbers do not assert NewsAPI's global rate limit or plan quota. Native transport is not implemented.

Future authentication uses the documented `X-Api-Key` header, not the query-string option. The only modeled reference shape is `vault://newsapi/<opaque-reference>`; production config has `credentialReference: null` and empty reference/environment arrays. Qualification, parsing, dry-run, fixtures and tests do not resolve or read credentials.

### Fixed recall profiles

| Profile | Fixed query | Category hint | Known limits |
|---|---|---|---|
| `corporate-crypto-purchase-intent-v1` | `(bitcoin OR cryptocurrency OR "digital assets") AND (treasury OR purchase OR acquire OR buy)` | `CORPORATE_CRYPTO_PURCHASE_INTENT` | False positives include commentary, proposals and non-corporate treasury references; intent is not completion. |
| `completed-purchase-claims-v1` | `(bitcoin OR cryptocurrency OR "digital assets") AND (bought OR purchased OR acquired OR completed)` | `COMPLETED_CRYPTO_PURCHASE` | A completed-looking headline is still a claim requiring original-source retrieval. |
| `treasury-strategy-policy-v1` | `(bitcoin OR cryptocurrency OR "digital assets") AND (treasury OR policy OR reserve OR allocation)` | `TREASURY_POLICY_CHANGE` | Broad policy mentions can be hypothetical or unrelated; policy effectiveness is unknown. |
| `crypto-acquisition-v1` | `(crypto OR cryptocurrency OR "digital assets" OR blockchain) AND (acquisition OR acquired OR merger OR merges)` | `ASSET_OR_COMPANY_ACQUISITION` | May concern software, a company, an asset or unrelated terminology. |
| `strategic-partnership-v1` | `(crypto OR cryptocurrency OR blockchain OR "digital assets") AND (partnership OR partner OR agreement)` | `STRATEGIC_PARTNERSHIP` | Does not establish parties, binding status or execution. |
| `cancellation-correction-retraction-v1` | `("crypto deal" OR "bitcoin purchase" OR "digital asset") AND (cancelled OR canceled OR terminated OR correction OR retraction)` | `CORRECTION_OR_RETRACTION` | Terms are search hints only and create no lifecycle edge. |

The endpoint docs support quoted phrases and Boolean operators with parentheses. Profiles use no nested grouping, ticker-only matching, caller free text, or URL/operator injection. Search fields are limited to `title,description`, so article-body-only mentions are intentionally missed. English is a query language selection, not a completeness claim. Homonyms, synonyms, translations and source coverage cause both false positives and recall gaps. The profiles are not issuer/asset mappings or event rules.

## Synthetic response and identity

`newsapi-everything-normalized-fixture/v1` is an internal synthetic adapter shape, **not native NewsAPI JSON**. The official field list is useful but does not fully qualify runtime null, omitted-field, truncation-marker, or mutation semantics for an authentic parser. Missing keys are rejected. Source ID/name, author, description, content and image may be explicit null; required title, URL and publication timestamp may not.

Only bounded description metadata may appear in the synthetic candidate. Content is accepted transiently only up to the documented 200-character bound and projected as `contentPresent`, length and SHA-256; its text is never reconstructed, returned, logged, or stored. The exact `[+N chars]` marker syntax is `UNKNOWN`; this implementation does not parse or reconstruct such a marker. Image URL is inert metadata and is never fetched.

The qualification fingerprint binds the explicitly allowlisted documented response fields (`status`, error `code`/`message`, `totalResults`, and article source id/name, author, title, description, URL, image URL, `publishedAt`, and content). That list describes documented native field names, not a claim that native JSON/nullability is parsed. `newsapi-everything-normalized-fixture/v1` remains the only accepted synthetic shape.

The local source-material fingerprint binds dataset/version, source id/name, unverified author, title, description, content presence/length/fingerprint, canonical article URL, image URL and provider-reported `publishedAt`. It is not a NewsAPI record ID. Same title with different URL stays distinct. Same URL with changed material creates a new append-only local variant; no silent overwrite or correction edge is made. Query profile, `totalResults`, payload fingerprint, receipt and evaluation time are not article identity. Exact duplicate normalized material collapses by fingerprint. Repeated source labels, URL matches, or syndication do not count as independent origins.

`publishedAt`, local `receivedAt` and `evaluatedAsOf` remain separate. Future article or receipt material is rejected against the explicit evaluation cutoff. No event occurrence/completion time is inferred. `totalResults` is retained as provider metadata and is never treated as pagination completeness. The first-slice pagination policy is one page only.

## Runtime trust and projection

The pinned module-local qualification is `PARTIAL_DISCOVERY_ONLY` and grants synthetic projection scope only. Parser-created qualification and response objects do not carry trust. The Vitest private loader alone can issue trusted synthetic responses; no environment flag, public test flag, credential port or production fixture import exists. The projection guard requires the authentic qualification/response pair, exact provider/dataset/query profile fingerprints and cutoff, then returns only `NON_AUTHORITATIVE_DISCOVERY_CANDIDATE` with completion, mappings, corroboration, persistence, event authority, signal and trading eligibility false.

Production config has `selectedSource: null`, no credential reference, empty credential/environment reference lists, every acquisition/storage/persistence/mapping/corroboration/authority/scheduler/signal/trading operation `BLOCKED`, and all seven usage approvals plus storage/retention/redistribution/commercial use `NOT_APPROVED`. This slice adds no network, database, UoW, scheduler, signal or trading path.

## Required flow

```text
NewsAPI metadata
→ NON_AUTHORITATIVE_DISCOVERY_CANDIDATE
→ original publisher retrieval
→ issuer/asset mapping
→ correction/lifecycle review
→ corroboration
→ event authority
→ separate signal policy
```

Discovery does not skip a stage. Next steps require a separately reviewed source acquisition/credential transport slice and explicit rights/plan approvals. No provider call or key is permitted by this contract.
