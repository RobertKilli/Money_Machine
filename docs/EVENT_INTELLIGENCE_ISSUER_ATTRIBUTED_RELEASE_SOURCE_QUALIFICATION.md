# Issuer-attributed release source qualification

Contract: `event-intelligence-issuer-attributed-release-source-qualification/v1`
Reviewed: 2026-10-03 09:31:49 UTC. This is a source-role decision and synthetic contract only. No live page, RSS feed, API, DNS, HTTP, or publisher response was retrieved.

## Decision and source roles

The highest supported status is `PARTIAL_ISSUER_DISCLOSURE_CANDIDATE`, limited to a later, issuer-specific review and what that issuer visibly published. It does not say an underlying purchase or other claim is true. `PARTIAL_DISCOVERY_ONLY` describes wire copies, editorial reporting, and provider references. `issuer-rss-atom` is `BLOCKED_UNDOCUMENTED_RETRIEVAL`. Acquisition, persistence, authority, mappings, corroboration, and all usage remain blocked/unapproved. No `QUALIFIED` or `READY` state exists.

| Source class/profile | Status | What can be considered later | Current blockers |
|---|---|---|---|
| Direct issuer IR/newsroom | `PARTIAL_ISSUER_DISCLOSURE_CANDIDATE` | Issuer-specific publication candidate after a separately reviewed origin and terms scope | One example cannot generalize; no host, schema, history, correction protocol, or use rights are approved |
| Direct issuer RSS/Atom | `BLOCKED_UNDOCUMENTED_RETRIEVAL` | Only if a named issuer actually documents its feed and item semantics | Existence, schema, stable IDs, history, corrections, and rights are issuer-specific/unknown |
| Business Wire issuer-attributed release | `PARTIAL_ISSUER_DISCLOSURE_CANDIDATE` for synthetic role evaluation | A release explicitly tied to issuer and exact release material may represent the issuer-origin disclosure | BW site terms restrict storage, aggregation, reproduction, distribution and commercial activity absent prior written consent; no such permission exists |
| GlobeNewswire issuer-attributed release | `PARTIAL_ISSUER_DISCLOSURE_CANDIDATE` for synthetic role evaluation | A release explicitly attributed by the issuer/customer may be considered a disclosure candidate | Reader/feed scope and technical details vary; current scoped storage/reuse terms and rights are unknown/unapproved |
| Syndicated copy, editorial report, discovery hit | `PARTIAL_DISCOVERY_ONLY` | Candidate discovery and source-follow-up planning only | Cannot establish independent origin or issuer disclosure by itself |

The labels mean:

- `DIRECT_ISSUER_RELEASE`: material on an issuer-controlled page/feed, only after that issuer's control and exact locator are separately established.
- `ISSUER_AUTHORIZED_DISTRIBUTION`: a wire distribution explicitly attributed to issuer and bound to release identity. It remains the issuer's origin, not independent corroboration.
- `SYNDICATED_COPY`: a downstream duplicate/format/translation. It does not make another origin.
- `EDITORIAL_REPORT`: reporting about a release, not the release itself.
- `DISCOVERY_ONLY`: a provider/reference result used to locate material.

Direct issuer material can support a future determination of *what the issuer publicly stated*. It cannot alone verify the statement's truth, purchase completion, amount, asset identity, or later lifecycle. `COMPLETED_CRYPTO_PURCHASE` is only a candidate category.

## Official evidence reviewed

Checked at 2026-10-03 09:31:49 UTC. Classification labels describe the source's support, not legal conclusions.

| Source | Class | Bounded finding |
|---|---|---|
| [Business Wire Terms of Use](https://www.businesswire.com/legal/terms-of-use) | DOCUMENTED | Effective date shown as Jan. 1, 2024. Its site-use scope names reading releases and retrieving RSS, but also restricts other purposes including storing, aggregating, reproducing and distributing site information, and commercial activity without prior written consent. It disclaims completeness/accuracy. This is a blocker for this product's automated storage/use absent a separately approved written scope; no legal conclusion is made. |
| [Business Wire Help Center](https://www.businesswire.com/help-center) | DOCUMENTED | Describes newsroom search/filter and journalist/media integrations; feed options are directed to media partners. It does not document a general-purpose API, stable release revision model, or permission for this use. |
| [Business Wire Pricing & Distribution Plans](https://www.businesswire.com/pricing) | DOCUMENTED | Displays issuer-side one-time distribution starting price ($475 for 400 words, US domestic local distribution) and says total pricing varies by word count, geography and enhancements. This is not a reader/API/storage license or product budget. |
| [GlobeNewswire: Add a GlobeNewswire Feed to Your Site](https://www.globenewswire.com/en/newswire-press-release-content) | DOCUMENTED | GlobeNewswire describes its releases as announcements issued by customers and offers reader accounts, RSS and custom feeds/media partnerships, including possible full text. This is the distributor's description, not verification of any individual issuer's authorship or truth. |
| [GlobeNewswire Media Relations](https://www.globenewswire.com/home/about/media-relations) | DOCUMENTED | Describes subscription/specialized provider delivery, RSS/Atom and custom feeds; asks users to contact it for technical specifications. No unrestricted API or this application's rights are documented. |
| [GlobeNewswire RSS/XML News Release Feeds](https://www.globenewswire.com/rss/list) | DOCUMENTED | A public feed-list page enumerates categories and RSS/Atom labels. This is not a retrieved feed payload, stable item schema, complete archive, or permission for storage/reuse. |
| [GlobeNewswire Terms of Use](https://www.globenewswire.com/en/terms-of-use) | UNKNOWN | The current official URL was not accessible during review. No third-party mirror was used. Current specific rights and restrictions remain unknown and unapproved. |
| [Strategy Investor Relations](https://www.strategy.com/investor-relations) | OBSERVED | One issuer page labels an Investor Relations area and links a news/press archive. This single example does not generalize to other issuers or prove RSS, stable IDs, publication-time semantics, archive completeness, corrections, or rights. |

No terms were accepted, no account/subscription was created, and no API key or credential was used. Pricing and public readability do not approve acquisition, processing, metadata or article storage, retention, redistribution, or commercial use. Rights are source-, content-, and use-specific and remain unapproved. No legal conclusion is made.

### Unknowns and retrieval boundary

No native HTML, RSS, Atom, or wire API schema is sufficiently pinned here for a generic parser. No correction/retraction protocol, stable release ID, history completeness, latency, feed pagination, or endpoint-specific authentication is qualified. Issuer feeds must be qualified per issuer. BW newsroom/feed readers are not treated as a general crawler permission; its published terms specifically make automated scan/storage/aggregation a blocker without written approval. GN media feed technical details and current scoped rights need provider review. Future profiles require exact HTTPS host/path allowlists, no arbitrary URL-following, content-type and byte/record/request/deadline limits, zero or explicit retry policy, redirect policy, and separate SSRF/DNS-pinning and rights reviews. This slice implements no retrieval transport.

Authentication is not configured. A public page or named RSS feed does not imply an API authentication transport. Future server-side credentials would require a separate approved reference and late resolution; no credential reference or resolver exists here.

## Versioned synthetic projection

`synthetic-issuer-release-normal-form/v1` is an internal fixture normal form, not a native publisher response. Native-looking provider payloads are not accepted by it. The private test-only constructor is exposed through the Vitest-only transform, not a production export. The production resolver only returns pinned immutable qualifications; parsing or copying one does not create runtime trust. Projection needs both the exact module-authentic qualification and test-seam-authentic synthetic normal form and emits only `NON_AUTHORITATIVE_DISCOVERY_CANDIDATE`.

Local release material identity binds source ID/class, publisher and distributor labels, issuer candidate and displayed name, canonical URL, displayed release ID when available, headline, summary, publication timestamp, category and mention candidates, amount/currency text, lifecycle hint, and explicit origin-binding tuple. It is not provider-issued. Discovery, receipt, evaluation time, and payload fingerprint are separate receipt/provenance fields. Same URL with changed material is an append-only local variant; no overwrite or correction edge occurs. Fingerprint/material collisions fail closed. Amounts remain text; ETH, WETH, BTC, or other symbols are mentions, not asset mappings.

`NONE`, `CORRECTION_HINT`, `UPDATE_HINT`, `RETRACTION_HINT`, and `UNKNOWN` are text/material hints only. Original and later variants remain distinct. A correction hint does not create lineage; future lifecycle lineage requires an exact authenticated parent and separate policy. `evaluatedAsOf` excludes future publication/receipt material. A retraction hint is not an active confirmation.

The origin-set is a sealed, deterministic grouping of authentic synthetic candidates. It groups only on an exact explicit tuple of issuer candidate, release ID, and canonical origin URL. Otherwise each item stays an unresolved singleton. It rejects duplicate members and assigns every group `independentCorroborationCount: 0`. Same headline, issuer name, URL, or timestamp alone is insufficient. Issuer IR plus its wire copy, multiple wire copies, translations, and NewsAPI/GDELT hits to that release do not become independent origins.

## Production and downstream boundary

Production config has an empty registry and `selectedSource: null`; acquisition, persistence, mapping, corroboration, issuer disclosure authority, external event authority, scheduler, signal and trading are all `BLOCKED`. Seven usage classes plus raw-content, metadata, normalized storage, article/image storage, retention, redistribution and commercial-use approvals are `NOT_APPROVED`. No fixture or transport is connected to production.

Required future sequence:

`release discovery → non-authoritative candidate → exact issuer/asset mapping → separately authorized authoritative retrieval → correction/lifecycle review → independent corroboration policy → event authority → separate signal policy`.

NewsAPI/GDELT may locate a release, but do not upgrade it. SEC EDGAR filings remain a separate regulatory-document authority family. The discovery candidate cannot be passed as issuer mapping, corroboration, event authority, persistence authority, recommendation, signal, or trading eligibility.

This is a stacked checkpoint on `feat/event-intelligence-news-discovery-contract` at `afa7ce136d27343a4d659b2984a1d2dda427d2f7`, not a child of NewsAPI, GDELT, or UI branches. It cannot be considered for merge until the upstream discovery contract is reviewed against updated main and merged; the baseline audit blocker `GHSA-vfj7-8cjw-p6xm` is resolved on main; and this stack is separately integrated on that merged base.
