# Exchange/regulatory announcement source qualification

Contract: `event-intelligence-exchange-regulatory-announcement-source-qualification/v1`
Official pages checked: **2026-10-03 10:14:11 UTC**. This is a source-role decision and synthetic-only projection. No live API, RSS, feed, PDF, announcement, DNS, or transport request was performed; no terms, account, or subscription were used.

## Source candidates and status

| Candidate | Jurisdiction and role | Status | Scope and blockers |
|---|---|---|---|
| LSE/RNS | GB / `REGULATORY_ANNOUNCEMENT` | `PARTIAL_REGULATORY_DISCLOSURE_CANDIDATE` | Certain announcements submitted by RNS registrants. The public News Explorer and licensed RNS data feed are distinct. No application licence, native schema, API/profile, quota, completeness, correction protocol, or storage/reuse approval is configured. |
| ASX Company Announcements | AU / `EXCHANGE_ISSUER_ANNOUNCEMENT` | `PARTIAL_EXCHANGE_DISCLOSURE_CANDIDATE` | Issuer-lodged announcements for ASX listed entities. Public web/PDF visibility is not automated acquisition or storage permission. No feed licence, native schema, stable ID, correction model, or use rights are approved. |
| NYSE Corporate Actions | US / `CORPORATE_ACTION_NOTICE` | `OUT_OF_SCOPE` | Narrow NYSE Group listed-security corporate actions, not general crypto treasury purchases or acquisitions. No projection to those event categories is allowed. |
| Nasdaq Exchange announcements | US / `OUT_OF_SCOPE` | `OUT_OF_SCOPE` | No concrete Nasdaq Exchange issuer-announcement source was qualified. Nasdaq Inc IR and Nasdaq.com press-release listings do not become exchange announcements. |
| Nasdaq Inc IR / Nasdaq.com press-release index | US / `DISCOVERY_INDEX` | `PARTIAL_DISCOVERY_ONLY` | Discovery pointers only. GlobeNewswire attribution is a separate distribution role, not Nasdaq Exchange authority. |

An exchange can document that a release passed through its announcement channel; this does not prove the truth of issuer assertions, board authorization, binding effect, closing, completed purchase, reported amount, or asset identity. Expected closing is not completion. Market-sensitive flags and provider categories are metadata. An announcement plus its PDF, issuer IR copy, wire copy, NewsAPI/GDELT hit, or replacement does not become independent factual corroboration.

## Official source review

Classifications describe the source's support, not legal conclusions.

| Official source | Classification and bounded claim |
|---|---|
| [Regulatory News Services (RNS) â€” LSEG](https://www.lseg.com/en/capital-markets/regulatory-news-service), checked 2026-10-03 10:14:11 UTC | **DOCUMENTED:** RNS describes a UK regulated-information and financial-communications channel. It says announcements are distributed to LSE Market News and data vendors, and lists separate issuer and data-vendor products, including an RNS Data Feed. That does not grant this application access or storage rights. |
| [Contextual help â€” London Stock Exchange News Explorer](https://www.londonstockexchange.com/help/whats-news-explorer), checked 2026-10-03 10:14:11 UTC | **DOCUMENTED:** News Explorer searches communications published by RNS registrants, with company/code and free-text/headline filters. It does not document a general API contract, full archive, stable ID, quota, or correction semantics. |
| [Market Data Licensing â€” London Stock Exchange](https://www.londonstockexchange.com/equities-trading/market-data/market-data-licensing), checked 2026-10-03 10:14:11 UTC | **DOCUMENTED:** LSE says licensing is required for RNS usage including redistribution, derived data, non-display and other application use. No product-specific licence is approved here. |
| [RNS Pricing and Policy Guidelines 2026 â€” LSEG](https://www.lseg.com/content/dam/lseg/en_us/documents/rns/rns-pricing-and-policy-guidelines-2026.pdf), checked 2026-10-03 10:14:11 UTC | **DOCUMENTED:** The policy names an RNS Data Feed and licensed-access concepts. No feed was accessed; native response schema, correction semantics and application permissions remain unknown. |
| [Announcements â€” ASX](https://www.asx.com.au/markets/trade-our-cash-market/announcements.cgl), checked 2026-10-03 10:14:11 UTC | **DOCUMENTED:** ASX listing pages show company/code, release date/time, headline, price-sensitive marker and a document link, and point to the terms and historical search. PDF availability is not a storage or redistribution grant. |
| [Search for recent and past announcements â€” ASX](https://www.asx.com.au/asx/v2/statistics/announcements.do), checked 2026-10-03 10:14:11 UTC | **DOCUMENTED:** The search offers recent/past and date filtering and ticker-prefix lookup. It does not establish a stable provider ID, complete archive or machine API. |
| [Company news / ComNews â€” ASX](https://www.asx.com.au/connectivity-and-data/information-services/company-news), checked 2026-10-03 10:14:11 UTC | **DOCUMENTED:** ASX offers real-time/delayed subscription feeds with PDFs and metadata files; redistribution requests are directed to ASX. This is distinct from web viewing and is not enabled. |
| [Terms of use â€” ASX](https://www.asx.com.au/legals/terms-of-use.html), checked 2026-10-03 10:14:11 UTC | **DOCUMENTED:** ASX says submitted announcement content is the listed entity's responsibility, restricts site scraping/downloading, and limits commercial use absent written authority. No legal conclusion is drawn. |
| [Corporate Actions â€” NYSE](https://www.nyse.com/market-data/corporate-actions), checked 2026-10-03 10:14:11 UTC | **DOCUMENTED:** NYSE lists corporate-action products and a Market Event Feed API for NYSE Group securities. Product access and rights require separate review. |
| [Corporate Actions, Market Watch & Proxy Compliance â€” NYSE Regulation](https://www.nyse.com/regulation/corporate-actions-market-watch-proxy-compliance), checked 2026-10-03 10:14:11 UTC | **DOCUMENTED:** NYSE describes issuer market-news obligations and exchange corporate-action notices, including subscription data products. This is not general crypto-treasury coverage. |
| [Press Releases â€” Nasdaq, Inc. Investor Relations](https://ir.nasdaq.com/news-and-events/press-releases), checked 2026-10-03 10:14:11 UTC | **OBSERVED:** The issuer IR listing contains releases, including items attributed to GlobeNewswire. It is not a Nasdaq Exchange announcement source. |
| [Press Releases â€” Nasdaq.com](https://www.nasdaq.com/market-activity/quotes/press-releases), checked 2026-10-03 10:14:11 UTC | **DOCUMENTED:** Nasdaq.com provides company press-release discovery by symbol. It does not establish exchange-regulatory provenance or acquisition/storage rights. |

`UNKNOWN`: native response schemas, pagination, stable IDs, exact archive horizons, corrections/replacements/withdrawals, endpoint quotas/redirects, end-to-end freshness/completeness, and product-specific acquisition, metadata/document storage, retention, redistribution, commercial and downstream-use rights. RNS data-vendor and ASX ComNews products are distinct products; issuer distribution fees, public pages and PDFs do not grant our reader/API or storage rights. All seven uses and raw/normalized storage, retention, redistribution and commercial use remain `NOT_APPROVED`.

## Identity, lifecycle and mappings

The versioned qualification fingerprint binds roles, issuer/listing scope, category allowlists, typed-identifier semantics, announcement/document identity, publication time, lifecycle hints, archive/completeness/latency, descriptive retrieval profiles, allowed hosts, blockers, approvals and evidence references/classifications. `recordedAt` is outside material identity. All local request budgets are zero; retrieval-profile names are references, not executable endpoints.

Only `synthetic-exchange-announcement-normal-form/v1` is accepted. It is not a native RNS/ASX/NYSE/Nasdaq JSON, HTML, RSS, XML, or PDF response. No transport, PDF parser, HTML parser, feed parser, or document bytes are present. Tickers, ISINs, LEIs, CIKs, local security codes, issuer names, dual listings and depositary receipts stay typed candidates; they do not establish issuer or asset mapping. ETH and WETH are separate mentions. Amounts stay text.

Local announcement identity binds source candidate, jurisdiction/operator/role, identifier candidates, provider announcement ID if supplied, canonical announcement/document URLs, headline/category, publication time, market-sensitive metadata, lifecycle hint, explicit origin binding, and the synthetic `materialFingerprint`. It is not provider-issued. Missing provider ID still permits local identity but cannot establish a cross-publication origin. A same fingerprint is accepted only after canonical-material equality; mismatch fails closed. Changed material is an append-only candidate variant. Receipt/discovery/evaluation and the separate `payloadFingerprint` remain outside announcement identity; payload fingerprint affects receipt provenance only.

Cross-copy origin grouping requires an explicit issuer-candidate + announcement-ID + canonical-origin-URL tuple. Without it, members remain unresolved singletons. Group counts are always zero independent corroboration. `NONE`, `CORRECTION_HINT`, `REPLACEMENT_HINT`, `WITHDRAWAL_HINT`, and `UNKNOWN` do not create lineage or overwrite the original. Historical sets exclude publication/receipt material after `evaluatedAsOf`.

## Production and stacked dependency

Production has an empty registry, `selectedSource: null`, no credential reference, and all acquisition, storage, persistence, mapping, correction-lineage, corroboration, authority, scheduler, signal and trading operations blocked. All seven usage approvals and storage/retention/redistribution/commercial approvals are `NOT_APPROVED`.

The path remains:

`exchange announcement discovery â†’ non-authoritative candidate â†’ issuer/listing and asset mapping â†’ authoritative source retrieval â†’ lifecycle/correction review â†’ corroboration â†’ event authority â†’ separate signal policy`.

SEC EDGAR remains a separate US filing family; issuer IR/wire remains a separate issuer-disclosure family. NewsAPI/GDELT can locate announcements but cannot upgrade them. This sibling checkpoint is based on discovery parent `afa7ce136d27343a4d659b2984a1d2dda427d2f7`, not the UI, GDELT, NewsAPI or issuer-release branches. Baseline audit remains blocked by `GHSA-vfj7-8cjw-p6xm`; no final-SHA build or READY status is claimed.
