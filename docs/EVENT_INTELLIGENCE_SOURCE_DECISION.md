# Event intelligence source decision

Decision version: `event-intelligence-source-decision/v1`. Reviewed 2026-09-30 06:38 UTC. This is a source/authority design only: no acquisition client, scheduler, persistence, extraction model, signal, or trading behavior is enabled.

## Architecture placement

Event intelligence is a separate upstream intelligence context with its own versioned contract and no M5 name. Existing M5 contracts decide scoped financial evidence eligibility, source lineage, and mapping for specific market metrics or portfolio evidence. They do not define the semantics of issuer disclosure, transaction lifecycle, correction, or whether a document authoritatively establishes a corporate event. Reusing an M5 qualification would conflate those meanings. This context stops at source and authority decision; it does not feed M5 automatically.

Keep these boundaries separate:

1. **Source acquisition** (future, currently blocked) retrieves a document or index entry under a reviewed request identity and policy.
2. **Source artifact** is immutable bytes or a content-addressed reference, with source/document identifiers, retrieval time, and artifact fingerprint.
3. **Normalized claim** is versioned extraction about an issuer, asset, amount, status, or date. It is not authority.
4. **Authoritative event** is a separately reviewed, source-bound material record. An LLM or parser cannot issue it alone.
5. **Issuer/company and asset mapping** are versioned identity authorities with independent evidence and exact revisions.
6. **Evidence/lineage** links artifacts, claims, corrections, and superseding documents without overwriting history.
7. **Signal/ranking** is a later analytical consumer and cannot promote source or event authority.
8. Any trading decision is a separate future milestone. This slice creates no order, portfolio change, or return claim.

## Authority hierarchy and decision

| Source class | Decision | Potential role | Present limit |
|---|---|---|---|
| SEC EDGAR filings | `CANDIDATE_AUTHORITATIVE` for US filings | Regulatory document authority, by exact filer CIK, accession, form and document | Text interpretation, asset identity, scope completeness, corrections and permitted storage/use need separate controls. Filing metadata is not the event. |
| Issuer-controlled IR page/feed/document | `CANDIDATE_CORROBORATION` | Issuer-origin corroboration for a named issuer | No company list, origin registry, feed coverage, stable revision/correction protocol, or retention permission is established here. |
| Exchange/regulator notice | `CANDIDATE_CORROBORATION` per jurisdiction | Exchange listing notices and regulator decisions | Jurisdiction-specific feeds, IDs, access, completeness, latency, corrections and data terms must be qualified individually. |
| GlobeNewswire / Business Wire distribution | `CANDIDATE_CORROBORATION` only when issuer-origin is established | A channel distributing a release attributed to an issuer | A wire copy is not independent corroboration; issuer authorship, original revision, correction, coverage, cost and storage rights remain case-specific/unknown. |
| GDELT | `DISCOVERY_ONLY` | Broad multilingual news discovery | Search result/article reference or short context is not issuer or regulatory authority; coverage and event classification are not completeness guarantees. |
| NewsAPI | `DISCOVERY_ONLY` | Search/headline discovery | Provider source ID, title, URL and publishedAt aid discovery, but aggregation does not establish document authority or complete coverage. |

SEC is the recommended first authority candidate for US public-company filings. An SEC filing can authoritatively establish what a named registrant publicly disclosed in that filing; it does not by itself prove every underlying assertion true or establish that a plan was completed. A later source qualification should begin with exact CIK, accession number, form, filing acceptance metadata, primary document and relevant exhibit, then parse the document as unstructured evidence. SEC Submissions API documentation says company histories include at least one year or the latest 1,000 filings (whichever is more), with additional history files where applicable; the API's ticker/company metadata is a lookup aid, not an issuer mapping authority. The SEC says submissions data updates through the day and typically processes in under a second, while filing documents may appear on sec.gov in 1–3 minutes; these are documented service observations, not an end-to-end latency guarantee. [DOCUMENTED: EDGAR APIs, title “EDGAR Application Programming Interfaces (APIs)”, https://www.sec.gov/search-filings/edgar-application-programming-interfaces, checked 2026-09-30 06:38 UTC; SEC Webmaster FAQ, https://www.sec.gov/about/webmaster-frequently-asked-questions, checked 2026-09-30 06:38 UTC.]

SEC Latest Filings/Search and RSS can be filtered by company/CIK/form and provide discovery of filings. An RSS/search hit does not replace the canonical filing record. SEC specifies a declared identifying User-Agent, efficient requests and no more than 10 requests/second. It documents no content-availability timestamp and warns latency can increase. Exact raw caching, normalized storage, redistribution and commercial-use treatment for this product are **UNKNOWN** and remain unapproved; public accessibility is not taken as a license grant. [DOCUMENTED: “SEC.gov | RSS Feeds”, https://www.sec.gov/files/about/secrss.shtml; “SEC.gov | Developer Resources”, https://www.sec.gov/about/developer-resources; “SEC.gov | Webmaster Frequently Asked Questions”, https://www.sec.gov/about/webmaster-frequently-asked-questions; all checked 2026-09-30 06:38 UTC.]

### SEC form semantics

- Form 8-K Item 1.01 concerns entry into a material definitive agreement, including agreements whose obligations/rights may be conditional. It does not mean purchase or acquisition completion.
- SEC guidance says Item 2.01 concerns consummated acquisition/disposition of a significant amount of assets; execution of the acquisition contract itself is not what Item 2.01 reports. A qualifying agreement may instead trigger Item 1.01 earlier. Read the filing and exhibits; do not classify from the item number alone.
- Form 6-K is for foreign private issuers furnishing material information made public, filed with an exchange and made public there, or distributed to security holders, subject to its instructions. It is not a US Form 8-K with identical item semantics.
- 10-K/10-Q, exhibits, inline XBRL, and structured XBRL facts can provide context, but XBRL facts are not a complete event corpus. Material purchase intent and transaction stage commonly require unstructured text/exhibit review.
- Accession number identifies a submission; CIK in the accession can identify a filing agent rather than the issuer. Bind the filing's actual registrant separately. Acceptance timestamp, filing date, report period/date, event announcement date, expected closing, and actual completion are distinct fields.
- `/A` amendments and SEC post-acceptance corrections must append a correction/supersession edge. A new filing date or newest record does not silently replace old authority.

[DOCUMENTED: “Exchange Act Form 8-K”, https://www.sec.gov/divisions/corpfin/forms/8-k.htm; “Form 6-K”, https://www.sec.gov/about/forms/form6-k.pdf; “Webmaster Frequently Asked Questions”, https://www.sec.gov/about/webmaster-frequently-asked-questions; “Financial Statement Data Sets”, https://www.sec.gov/files/fsds.pdf; and “EDGAR Public Dissemination Technical Specification”, https://www.sec.gov/files/info/edgar/specifications/pdsdissemspec-092812.pdf; checked 2026-09-30 06:38 UTC.]

### Issuer, exchange, wires, and discovery sources

- Issuer IR is primary only for material demonstrably published by the issuer-controlled origin. Preserve canonical URL, publisher identity, publication/update time and document fingerprint. RSS/Atom item IDs and feed retention/correction behavior are source-specific; no generic guarantee is assumed.
- NYSE describes material-news and corporate-action notification processes and offers market-data corporate-action products; some specific information products are subscription-based. This supports a per-exchange authority candidate only for that documented product and jurisdiction scope; it does not establish general coverage for crypto treasury announcements or all acquisitions. Nasdaq subscription/RSS offerings likewise need product-specific qualification. [DOCUMENTED: NYSE Regulation, “Corporate Actions, Market Watch & Proxy Compliance”, https://www.nyse.com/regulation/corporate-actions-market-watch-proxy-compliance; NYSE Market Data, “Corporate Actions”, https://www.nyse.com/market-data/corporate-actions; Nasdaq Nordic, “IT – Subscription Services”, https://attachment.news.eu.nasdaq.com/a5a737ce4b33116ec3d313b482ede9ab4; checked 2026-09-30 06:38 UTC.]
- GlobeNewswire describes distribution of corporate press releases and financial disclosures. Business Wire publishes a NewsML profile describing one news release per document. These facts establish a distribution role only; a story distributed by a wire must be tied to the issuer's own release/document and is not a second independent source. Pricing, automated feed completeness, latency, revision history, retention and redistribution for our use are **UNKNOWN**. [DOCUMENTED: GlobeNewswire, “SEO press release writing tips and distribution service”, https://www.globenewswire.com/en/Home/Learning-Support/Knowledge-Base/SEO-press-release-writing-tips-and-distribution-service.pdf; Business Wire, “Business Wire Profile of NewsML v1.18”, https://www.businesswire.com/schema/newsml/Business_Wire_Profile_of_NewsML_v1.18.pdf; checked 2026-09-30 06:38 UTC.]
- GDELT describes its DOC API as search over a rolling recent window (the cited launch description states three months); GDELT datasets are described as free to use/redistribute with attribution. This does not license third-party article content beyond the provider's own dataset terms, prove search completeness, or make an article an authoritative issuer statement. **OBSERVED:** no GDELT query or record was fetched in this review. [DOCUMENTED: GDELT Project, “GDELT DOC 2.0 API Debuts!”, https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/; “About the GDELT Project”, https://www.gdeltproject.org/about.html; checked 2026-09-30 06:38 UTC.]
- NewsAPI documents paged results (up to 100 items per page), source IDs, publication timestamp and a 200-character content snippet where available; its product page describes Developer as development/testing only, a 24-hour delay and one month of search, while listed commercial plans have current published monthly prices (Business $449 and Advanced $1,749 on the checked page). The pricing/terms do not grant rights to reproduce third-party article content. It remains discovery-only. Current price is informational, not a budget or subscription. [DOCUMENTED: NewsAPI, “Everything /v2/everything”, https://newsapi.org/docs/endpoints/everything; “Pricing”, https://newsapi.org/pricing; “Terms of Service”, https://newsapi.org/terms; checked 2026-09-30 06:38 UTC.]

**INFERRED:** discovery results can reduce search time but can omit, delay, duplicate, misattribute, cluster, translate or summarize relevant material; each result must be independently resolved to an issuer-controlled/regulatory/exchange artifact. **UNKNOWN:** source-by-source operational coverage, correction guarantees, end-to-end latency, total costs, and product-specific raw/normalized storage and retention approvals.

## Event taxonomy and lifecycle

`EVENT_INTELLIGENCE_EVENT_TYPES` in the versioned contract distinguishes:

- Corporate crypto: `PURCHASE_INTENT_ANNOUNCED`, `BOARD_AUTHORIZATION`, `FINANCING_ANNOUNCED`, `DEFINITIVE_PURCHASE_AGREEMENT`, `PURCHASE_COMPLETED`, `HOLDING_DISCLOSED`, `SALE_INTENT_ANNOUNCED`, `SALE_COMPLETED`, `POLICY_REVERSED_OR_CANCELLED`.
- Corporate transactions: `ACQUISITION_RUMOR`, `NON_BINDING_PROPOSAL`, `DEFINITIVE_AGREEMENT`, `REGULATORY_APPROVAL`, `SHAREHOLDER_APPROVAL`, `TRANSACTION_COMPLETED`, `TRANSACTION_TERMINATED`.
- Other events: `MATERIAL_PARTNERSHIP`, `PRODUCT_OR_NETWORK_LAUNCH`, `SECURITY_INCIDENT`, `REGULATORY_ACTION`, `EXCHANGE_LISTING_OR_DELISTING`, `CORRECTION_OR_RETRACTION`.

Event type is separate from lifecycle status (`INTENT`, `AUTHORIZED`, `ANNOUNCED`, `SIGNED`, `CONDITIONAL`, `COMPLETED`, `TERMINATED`, `CORRECTED`, `RETRACTED`, `UNKNOWN`). “Plans”, “considering”, board authorization, signing, expected closing and completed are separate claims. Rumor is explicitly non-authoritative and cannot be promoted merely by repetition or a score. Source authenticity answers who filed or published a document; extraction quality answers whether a normalized claim matches that document; factuality records whether the issuer asserted something versus whether it is independently true; lifecycle records only the stage explicitly evidenced; corroboration requires independent evidence after distribution-copy deduplication. These dimensions are not interchangeable with confidence or source tier.

Lifecycle transitions are append-only and require new source-bound material: intent cannot jump directly to completion; expected closing is not completion; a terminated event cannot return to active without a new event/material; a correction or retraction adds a lineage edge and never overwrites the original; rumor cannot become a definitive agreement through headline repetition. The 8-K item mapping is scoped to Form 8-K only; a Form 6-K cannot inherit 8-K item semantics.

An eventual `event-authority-material/v1` must bind the source-decision and immutable source-artifact fingerprints; document/accession and actual issuer identity; issuer mapping revision; asset identity and asset mapping revision; event type and lifecycle; announcement, filing/publication, effective/completion and system-received times separately; an exact decimal-string amount or null plus currency and `EXACT | RANGE | MAXIMUM | TARGET | UNKNOWN`; binding/conditional state; short source locators plus hashes (not long copied excerpts); correction/supersession lineage; extraction contract and parser/model versions; and deterministic fingerprint. CIK identifies a filer/registrant but does not by itself establish that parent and subsidiary are the same legal issuer. This type is described in the source module only; there is no parser issuer, persistence or authority issuance in this slice.

## Mapping, deduplication, and corrections

- Company identity requires stable issuer identity (for SEC, the registrant CIK plus filing-document evidence). A ticker is a time-varying lookup attribute, not identity.
- Asset identity requires a separately approved asset map and exact representation. Symbol matching is insufficient. BTC and WBTC, and ETH and WETH, remain separate assets unless a separately reviewed mapping explicitly says otherwise.
- Multiple reports of one event do not create multiple events. Deduplicate using issuer, exact source documents, referenced transaction and event material, with evidence edges retained. Headline similarity alone is insufficient.
- Corrections, retractions, amendments and superseding filings append lineage edges and preserve earlier states. Do not use newest-wins or mutate historical claims.

## Trading boundary

An authoritative event is not a buy signal. Discovery scores are not authority; positive news does not imply positive expected return. Event time, publication/filing time, when the market could know the information, system receipt time, and price reaction are separate temporal facts. No order or portfolio change occurs here. Any later worthy-trade analysis must be a separately approved research/signal slice with point-in-time data and tests for look-ahead bias, survivorship bias, duplicate news, event-time leakage and post-event price movement.

## Production posture and next blockers

Production config is intentionally `BLOCKED`: no selected source stack, no production acquisition, no event-authority persistence, no trading signals, no issuer/asset mapping authority, and every usage/retention/redistribution/commercial approval is `NOT_APPROVED`. No real company or investment watchlist is included.

The follow-on mapping slice defines separate issuer legal-entity authority and
event asset-mention binding to an existing canonical asset mapping revision.
Its production registries remain empty and event claims can only reach
`MAPPED_NON_AUTHORITATIVE_EVENT_CLAIM`; source decision does not issue or
upgrade those mappings. Corroboration and event-authority policy remain the
next upstream review boundary. See
[`EVENT_INTELLIGENCE_MAPPING_AUTHORITY.md`](EVENT_INTELLIGENCE_MAPPING_AUTHORITY.md).
Mapping assembly uses the claim's explicit `announcementAt` as `mappingAsOf`;
it does not substitute filing, receipt, signing, or completion time.

Before the first live acquisition, a separate reviewed slice must:

1. select a jurisdiction and a narrowly defined issuer universe without relying on ticker-only identity;
2. qualify exact source endpoints/feeds, IDs, timestamps, correction behavior, history/pagination, coverage, latency, rate limits and source-specific terms;
3. agree on an identified SEC User-Agent and fair-access budget where EDGAR is used;
4. obtain explicit review/approval for network acquisition, raw artifact storage, normalized claim storage, authority issuance, retention, redistribution and commercial use;
5. define immutable artifact capture, safe excerpt locators, amendment/correction lineage, issuer and asset mapping authorities, human review, duplicate resolution, and failure handling;
6. implement fixture-only acquisition/parser/authority tests and obtain separate approval for any real network client, persistence or scheduler.

The source parser and production candidate config are not readiness gates and cannot enable acquisition. No provider terms were accepted and no live source was queried.

The SEC Form 8-K/8-K/A source profile is separately qualified in
`docs/SEC_EDGAR_8K_EVENT_SOURCE_QUALIFICATION.md`. Its status is PARTIAL and
its production acquisition remains BLOCKED. That profile does not issue event
authority or qualify Form 6-K, 10-K, 10-Q, registration statements, or XBRL
facts.

The synthetic SEC 8-K follow-on implements a fixture-only reconciliation,
artifact and deterministic claim pipeline. It stops at normalized candidate
claims explicitly classified `NON_AUTHORITATIVE_EVENT_CLAIMS`; it cannot
upgrade source qualification, establish issuer/asset mappings, issue event
authority, persist data or generate signals. See
`docs/SEC_EDGAR_8K_FIXTURE_CLAIM_PIPELINE.md`. Synthetic tests do not establish
SEC response behavior, real-world extraction accuracy, corroboration, or
permission to acquire or retain source material.

The follow-on corroboration policy distinguishes issuer disclosure from an
externally verified event fact. Discovery copies and syndicated issuer
releases do not add independent authority. Eligibility remains a candidate
only; the result cannot be persisted or treated as an authoritative event.
See [EVENT_INTELLIGENCE_CORROBORATION_AUTHORITY_POLICY](EVENT_INTELLIGENCE_CORROBORATION_AUTHORITY_POLICY.md).
