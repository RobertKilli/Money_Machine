# Standing PAPER market source review

**Review date:** 2026-11-26

**Baseline:** `4e779fbe7b5f94564b61fd144300e969a6689349`
**Status:** comparative documentation review; no provider selected as approved, no credentials resolved, and no market-data endpoint called.

## Scope and recommendation

The [offline standing PAPER price contract](STANDING_PAPER_POLICY.md#external-paper-price-contract-offline) requires an exact external instrument/source binding, `LAST_TRADE`, `BID` or `ASK`, a price-observation time, an evidenced availability time and receiving-side retrieval time. Quote currency must equal the PAPER account currency; this path does not convert currency. Fixture instruments are excluded. `AVAILABLE` in that contract is a receipt-validation result, not source permission.

**Recommended first technical candidate (conditional, not approved): Kraken Spot REST `Post-Trade Data` (`GET /0/public/PostTrade`), `LAST_TRADE`, one explicitly mapped pair such as `ETH/USD`.** Its documented response carries a trade identifier, decimal price, pair/base/quote, execution venue, engine-match `trade_ts`, and market-data publication `publication_ts`. That is a closer fit to the contract's timestamp and traceability requirements than Kraken's Ticker snapshot. Before implementation or use, confirm the exact pair and venue mapping from current official metadata, confirm that `publication_ts` qualifies as `availableAt` under the contract, and obtain written permission for this project's automated PAPER processing and intended storage/display if required. Public unauthenticated access is not permission. Until those gates are recorded, status remains **BLOCKED / NOT APPROVED**.

The candidate product returns a USD quote in the example pair. The first USD product would therefore require a separate PAPER account denominated in USD. Do not map its price to a NOK account or infer an FX rate. If a NOK-denominated first account is required, choose and separately qualify an exact NOK-quoted instrument instead.

## Comparison

`DOCUMENTED` means the cited official material explicitly specifies it. `INFERRED` is an implementation interpretation. `UNKNOWN` means the reviewed official sources do not establish it. Permission status is deliberately separate from technical capability.

| Candidate and exact product | Instrument, venue, quote | Price and temporal evidence | Auth, cost, limits | Usage, storage, display | Assessment |
|---|---|---|---|---|---|
| **Kraken Spot REST — Post-Trade Data**, `GET /0/public/PostTrade`, pair filter `symbol=ETH/USD` | The endpoint documents Spot trades and response fields for symbol, base and quote assets, trade venue MIC, and publication venue MIC. `BTC/USD` is the API example; current `ETH/USD` listing and returned MIC remain **UNKNOWN** without an authorized metadata check (no live request here). | `LAST_TRADE`: decimal `price`, `trade_id`, `trade_ts` at engine match, `publication_ts` when published to market-data streams. `last_ts` is the latest trade timestamp for pagination. Using `publication_ts` as contract `availableAt` is a reasonable interpretation, but still needs explicit qualification. No fixed maximum publication delay/SLA is documented in the reviewed endpoint. | Public endpoint, no account credentials documented; no fee for this exact endpoint was identified, so cost is **UNKNOWN**, not asserted free. Response count is capped at 1,000. Official public REST guidance says 1 request/s or less stays within limits; IP and (for Trades/OHLC) pair limits apply. | Kraken's API guide says prior permission is required for certain cases, including non-personal commercial use of public market data. It does not establish this project's automated PAPER, storage/retention, or user-display rights. Written confirmation is a gate. | **Recommended conditional technical candidate. Not qualified or approved.** Strongest timestamp/provenance fit among compared Spot products, but pair mapping and rights remain open. |
| **Alpaca Crypto Market Data — latest quotes**, `GET /v1beta3/crypto/us/latest/quotes` | Symbols include documented examples `BTC/USD` and `ETH/USD`; `loc` can identify Alpaca US, Kraken US, or Kraken EU (among supported locations). This is a product/location feed, not sufficient by itself to assert a single exchange venue for `us`; the exact venue contract must be confirmed. | `BID` and `ASK` prices with a `t` quote timestamp are documented. Latest means latest returned at request time; max delay, quote-age SLA and availability semantics are **UNKNOWN**. | API key ID + secret required. Documentation describes free limited crypto data and a more advanced unlimited paid plan; exact current plan eligibility/pricing/rate quota for requested location/account is **UNKNOWN**. API exposes per-minute rate-limit headers and 401/403/429/500 outcomes, but this reference page does not state the numeric quota. | Alpaca terms limit use to personal/non-commercial by default and require 30 days advance written notice for other use, including making content available through a user application. Exact PAPER automation, retention and display rights need written confirmation; no permission is inferred. | Technically viable quote-shaped alternative, but venue identity, rights, subscription and delay remain unresolved. Not selected. |
| **Coinbase Exchange — ETH-USD public market data** (existing qualification/transport review) | Prior review documents the product/candle/market endpoints; current product identity was not live-checked for this review. Product quote is USD. | Existing qualification concerns named-venue daily candles and smoke profiles; it does not establish a new PAPER `LAST_TRADE` or `BID/ASK` contract. | Existing reviewed public profiles are unauthenticated; rate/cost details are in the prior transport qualification and do not remove usage blockers. | Existing official terms review finds personal/research scope, no application for other end users, and restriction on using data/derived works to develop, validate, benchmark or improve automated systems without prior express written consent. No new written permission was found. | **BLOCKED and excluded.** This review does not change the Coinbase status. See [existing source qualification](M5_NAMED_VENUE_DAILY_CLOSE_SOURCE_QUALIFICATION.md) and [Coinbase terms/transport review](M5_COINBASE_NODE_SMOKE_TRANSPORT.md). |

## Transport plan for the conditional Kraken candidate

This is a proposal for a later, separately approved adapter; it performs no network action by itself.

1. **Request scope:** fixed HTTPS origin `api.kraken.com`, fixed path `/0/public/PostTrade`, exactly one pre-registered pair per request, `symbol=ETH/USD`, `count=1`, and no caller-supplied host/path/query. No pagination or historical backfill in the first slice. One source request per instrument per worker round; a local process cap of one request per second and one in-flight request globally. Do not retry, fail over, or call fixtures after an error.
2. **Network bounds:** enforce TLS certificate verification, fixed host/path allowlist, connection and total deadlines (proposed 2s connect / 5s total), bounded response body (proposed 64 KiB), JSON content-type, and strict schema. These are proposed client limits, not Kraken guarantees. Do not log credentials or raw provider payloads.
3. **Validation:** require the exact expected pair and base/quote, expected venue identity once qualified, nonempty `trade_id`, positive decimal `price` parsed exactly, and valid UTC `trade_ts <= publication_ts <= local retrievedAt <= decision cutoff`. Reject unknown/error arrays, empty results, duplicate/conflicting trade IDs, malformed fields, unexpected currency/venue, timestamp skew/future values, and age over the policy limit. A 200 response with no usable trade is missing data and blocks.
4. **Evidence:** persist an immutable normalized receipt bound to provider/product/version, mapped external instrument ID, venue/pair, `LAST_TRADE`, original decimal price, normalized integer price, trade ID, `trade_ts`, `publication_ts` as availability (only after qualification), receiver `retrievedAt`, request fingerprint without secrets, response/payload fingerprint, and decision price fingerprint. Retain only fields needed for audit under an explicitly approved retention policy; permission for raw response retention is unresolved.
5. **Failure behavior:** timeout, TLS/DNS/connectivity failure, 429/rate-limit response, provider error, missing/invalid values, stale/future timestamps, or permission/readiness failure returns blocked/unavailable with no price. No stale cache, alternate provider, synthetic fixture, FX conversion, or simulated fill may mask a source failure.
6. **Rate ceiling:** although Kraken documents the public-data safe guidance of no more than one REST call per second, the product-level cap proposed here is much lower: at most one single-pair request per policy/instrument per worker round, and never exceed one request/second per source IP. Honor 429 and stop the round; no automatic retry.

## Required evidence before source approval

- Written response from Kraken covering this project's automated PAPER use, algorithm testing/validation, service audience, storage/retention, display and any derived output; identify any applicable fee or subscription and geographic restrictions.
- Official static evidence for the exact active pair, base/quote, canonical venue MIC and whether `ETH/USD` maps unambiguously to the selected product. No ticker-only identity mapping.
- Documented confirmation that `publication_ts` is an acceptable availability timestamp and a bounded freshness expectation for the intended cadence. Otherwise this endpoint does not satisfy the contract's availability/freshness evidence.
- A retention decision and approved schema/privacy boundary for the receipt and fingerprints. Provider permission does not itself authorize persistence or redistribution.
- Separate PAPER account in the matching quote currency (USD for the example pair), exact external instrument mapping, price-age policy, and an explicit decision on how `LAST_TRADE` is used for valuation and simulated fills.
- Security review of server-side credential/egress configuration if the eventual provider requires authentication; no provider data credentials are currently required for this candidate's public endpoint.

## Synthetic-only test matrix for a future adapter

| Fixture | Expected outcome |
|---|---|
| Valid expected pair, USD quote, known MIC, positive decimal price, ordered match/publication/retrieval/cutoff timestamps | `AVAILABLE`; exact integer conversion and stable provenance fingerprint |
| Wrong pair, base/quote mismatch, unexpected venue/MIC, or fixture instrument ID | Blocked identity mismatch; no price |
| Zero/negative, malformed, exponent/overprecision or missing price; missing trade ID | Blocked invalid/missing value; no floating-point conversion |
| `trade_ts` or `publication_ts` in the future; reversed timestamp order; stale observation beyond configured age | Blocked temporal validation; no price |
| Empty trades list or API error array despite HTTP 200 | `UNAVAILABLE` / missing data; no zero or cached price |
| Timeout, DNS/TLS failure, truncated/oversized body, invalid JSON, 429 or 5xx | Fail closed; bounded request ends; no retry/fallback/fixture |
| Same response replayed at same decision cutoff | Idempotent evidence fingerprint; no duplicate price authority |
| Same trade ID but changed price or timestamps | Integrity conflict; block and raise an auditable error |
| USD quote supplied to NOK account | Currency mismatch; no implicit FX or account conversion |

These are proposed synthetic test cases, not executed tests or observed provider responses.

## Gaps and next step

This review selects a **conditional candidate**, not an approved source. Current exact pair/venue mapping, legal usage and retention rights, `publication_ts` availability qualification, freshness SLA, and exact cost remain unresolved. Alpaca is also not authorized by its public API. Coinbase remains blocked. The existing fixture worker stays explicitly synthetic and unchanged.

Next step: seek written rights/retention clarification and static pair identity/timestamp evidence for Kraken Post-Trade. If any gate fails, keep external PAPER blocked and assess another source in a separately documented review. Only after approval should a separate implementation proposal add the bounded adapter, synthetic contract tests, immutable decision linkage, and matching-currency PAPER account path. No hosted changes, policy activation, worker start, live data calls, or actual trading are part of this review.

## Official documentation consulted

- [Kraken Post-Trade Data API](https://docs.kraken.com/api/docs/rest-api/get-post-trade) — request schema and trade/pair/venue/timestamp fields.
- [Kraken API use and permissions notice](https://docs-legacy.kraken.com/api/docs/guides/global-intro/) — public API availability does not remove prior-permission requirement for certain uses, including non-personal commercial use.
- [Kraken Spot REST rate limits](https://support.kraken.com/gb/articles/206548367-what-are-the-api-rate-limits-) — public data IP/pair buckets and 1 request/second-or-less guidance.
- [Alpaca latest crypto quotes API](https://docs.alpaca.markets/us/reference/cryptolatestquotes-1) and [Crypto Pricing Data](https://docs.alpaca.markets/us/docs/crypto-pricing-data) — symbols, locations, quote timestamps and authentication.
- [Alpaca terms and conditions](https://files.alpaca.markets/disclosures/library/TermsAndConditions.pdf) — plan distinction, personal/non-commercial default, notice for other use/user application, and no timeliness/completeness guarantee.
- Coinbase links above are carried forward from the prior source/terms assessment; this review does not infer renewed permission.
