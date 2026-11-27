# Kraken market data for standing PAPER: source clarification

**Review date:** 2026-11-27  
**Code baseline:** `51658f3e6a4532966cc25c14e827c906a5f03670`  
**Status:** official-documentation review only; no market-data endpoint was called, no source is approved, and no external use is authorized.

This note supersedes the earlier recommendation in [the market source review](STANDING_PAPER_MARKET_SOURCE_REVIEW.md) that treated Post-Trade `count=1` as a possible first `LAST_TRADE` route. It records the documentation boundary and proposes a conditional alternative. It does not enable external acquisition.

## 1. Post-Trade selection and one Kraken alternative

### Post-Trade does not document `count=1` as latest-as-of

Kraken's current [Post-Trade Data reference](https://docs.kraken.com/api-reference/transparency/post-trade-data) says that, when no filter parameters are specified, the endpoint returns the last 1,000 trades for all pairs. It defines `count` as the maximum number of rows, permits 1–1,000, describes the returned list as ascending by timestamp, and says `last_ts` is the latest timestamp in that list and can be used as `from_ts` for the next batch. `symbol`, `from_ts` (strictly after), and `to_ts` (before or at) are filters.

The documentation does **not** say that `symbol=...&count=1` selects the most recent trade for that pair at request time, define an as-of cutoff for that selection, or define tie behavior. The latest timestamp in a returned list is only the latest in that returned list. Therefore the current request shape cannot be promoted to `LAST_TRADE` or described as “the last trade at decision time.” The earlier Post-Trade transport and offline parser remain explicitly unclassified and blocked for decision use.

### Conditional alternative: Spot REST Pre-Trade Data, `BID` / `ASK`

The [Pre-Trade Data reference](https://docs.kraken.com/api-reference/transparency/pre-trade-data) describes `GET /0/public/PreTrade` as returning the top ten aggregated order-book levels for a trading pair. Its response example and schema include the pair symbol, base and quote asset, venue MIC, CLOB system, bid and ask levels, side, exact decimal price and quantity strings, order count, and per-level `submission_ts` and `publication_ts`.

This is a different contract from Post-Trade:

| Property | Post-Trade | Pre-Trade |
|---|---|---|
| Meaning | Individual matched trades | Aggregated order-book price levels |
| Compatible price kind | Potential `LAST_TRADE`, only after selection semantics are established | `BID` or `ASK` for a selected book level |
| Record fields | Trade ID, trade price/quantity, `trade_ts`, `publication_ts`, trade and publication venue | Bid/ask price/quantity/count, `submission_ts`, `publication_ts`, venue and CLOB system |
| Selection boundary | `count` is a maximum; latest-as-of selection is not specified | Top ten levels are returned; exact best-level ordering and snapshot coherence still need confirmation |
| Existing parser/evidence package | Reusable as an implementation pattern, but semantics remain unclassified | Not compatible with the Post-Trade parser/package; a new parser and typed BID/ASK evidence projection are required |

**Conditional recommendation for the first private through-PAPER data test:** evaluate Pre-Trade `BID` and `ASK` as quote inputs, not Post-Trade as `LAST_TRADE`. For a long-only test, use the best `ASK` for simulated BUY execution and the best `BID` for simulated SELL execution; value an open long position at the `BID`. Strategy thresholds must explicitly use the relevant side. Do not silently compute a midpoint or label either side a last trade. This recommendation is not an approval: Kraken must confirm how to identify the best levels and whether the returned levels form a coherent current snapshot, and written usage permission is still required.

For `ETH/USD`, the quote currency is USD, so use a separate PAPER/USD account. A NOK account requires a separately qualified NOK-quoted market or an explicitly designed and approved FX contract. Never assume USD equals NOK.

## 2. What the documentation answers, and what Kraken must answer

| Question | Official documentation answers | Still needs Kraken or separate project approval |
|---|---|---|
| Does Post-Trade `count=1` mean latest trade at a defined time? | No such guarantee is stated. `count` is a maximum; ordering and `last_ts` describe the returned list. | Whether any supported request/filter combination provides the latest eligible trade as-of a defined server time, including ties, completeness and cutoff behavior. Until confirmed, do not use as `LAST_TRADE`. |
| What does Pre-Trade return? | Top ten aggregated levels per pair; bid/ask sides, price, quantity, count, pair/base/quote, venue/system, `submission_ts` and `publication_ts`. | Whether those ten levels represent one coherent snapshot, how to choose the best bid/ask, how the two timestamps relate to level changes/publication, and whether `publication_ts` supports the intended freshness/availability contract. |
| What do timestamps mean? | Post-Trade `trade_ts` is engine match time described as microsecond precision, with examples showing nine fractional digits; `publication_ts` is publication to market-data streams. Pre-Trade provides per-level submission and publication timestamps. | Exact source precision and serialization guarantees, truncation/rounding rules, clock guarantees, bounded publication latency, timestamp ordering, and whether these fields may be mapped to our `observedAt`/`availableAt` fields. Preserve source strings and fail closed until mapped. |
| Pair and venue identity? | Product schemas expose pair/base/quote and venue MIC fields. Kraken's symbol guide says REST and WebSocket pair identifiers can differ and points to AssetPairs for available markets and symbol variants. | Written/static qualification of the exact active pair, canonical display symbol, quote currency, venue MIC and whether the selected endpoint's identity is the intended market. No live lookup was done in this review. |
| Authentication? | Kraken says public market-data endpoints do not require an API key. | This is only technical access information. It does not grant rights to automated use, retention, display, or redistribution. No credential is needed or requested for this public-data candidate. |
| Rate limits, uptime and performance? | Kraken documents REST call-counter tiers and rate-limit guidance; the selected transport currently imposes a stricter local request cap. Public endpoints can return errors and are subject to service availability. | Applicable quota for the intended access pattern/IP, any product-specific limit, latency/freshness expectations, incident handling and any SLA. Do not retry or fall back to fixture data on failure. |
| Cost and legal scope? | The API guide says prior permission is required for certain uses, including non-personal commercial use of public endpoint data. Current Global Terms state that other uses of Kraken content require prior permission. | Whether private automated PAPER algorithm testing is permitted; whether raw/normalized data can be retained and shown internally; what a customer-facing service may display or derive; applicable agreements, geographic limits, retention terms, attribution and fees. “Public” and “no API key” do not answer these questions. |

Official references consulted:

- [Post-Trade Data](https://docs.kraken.com/api-reference/transparency/post-trade-data)
- [Pre-Trade Data](https://docs.kraken.com/api-reference/transparency/pre-trade-data)
- [Get Ticker Information](https://docs.kraken.com/api-reference/market-data/get-ticker-information) (documents current ticker values but its response fields do not provide per-price observation/publication timestamps)
- [Get Tradable Asset Pairs](https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs) and [Kraken API symbols and tickers](https://support.kraken.com/articles/360000920306-api-symbols-and-tickers)
- [Public endpoints and account/API-key requirements](https://support.kraken.com/in/articles/360000919986-public-endpoint-examples-you-can-try-them-directly-in-a-web-browser-)
- [Kraken API use and permissions](https://docs-legacy.kraken.com/api/docs/guides/global-intro/)
- [Global Terms of Service](https://www.kraken.com/legal/global-terms)
- [Spot REST rate limits](https://docs.kraken.com/exchange/guides/rest/ratelimits)

## 3. Email draft to Kraken (not sent)

**To:** marketdata@kraken.com  
**Subject:** Permission and product terms for automated Kraken market data in PAPER algorithm testing

Dear Kraken Market Data Team,

I am writing on behalf of Money Machine, a software project that evaluates rule-based investment strategies in a standing PAPER environment. The system uses virtual balances and simulated decisions/fills only. It will not submit orders, connect to brokerage or custody services, move funds, or represent simulated performance as actual investment performance.

We are assessing Kraken Spot market data for the following stages and would like your written guidance before making any automated request.

**Stage 1 — private development and algorithm testing**

- One owner-controlled development/PAPER environment, not accessible to customers.
- Automated, low-frequency requests for one explicitly mapped Spot pair.
- Current technical candidate: Pre-Trade Data (`GET /0/public/PreTrade`) for best bid/ask inputs. We are also assessing Post-Trade Data, but its published schema does not establish that `count=1` returns the latest trade as of request time.
- The data would drive simulated strategy decisions, risk checks, portfolio marks, and simulated fills only.
- We may need to retain raw responses or normalized price/timestamp evidence, associated fingerprints, and resulting simulation records for audit and reproducibility. Display would be limited to the project owner's private application.

Could you please confirm whether this automated private PAPER testing, algorithm validation, local storage/retention, and owner-only display are permitted for each product? Please identify any product-specific agreement, prior written authorization, fee, attribution, retention limit, rate limit, geographic restriction, or other condition that applies.

For Pre-Trade Data, could you also clarify:

1. Whether the returned ten levels are a coherent snapshot, and how a client should identify the best bid and best ask.
2. The precise meanings and precision guarantees of `submission_ts` and `publication_ts`, including whether `publication_ts` is the time the returned aggregate level was published and whether a maximum publication delay is guaranteed.
3. Whether the pair, base/quote and venue fields are authoritative for the exact active market, and where you publish authoritative current pair/MIC mappings.

For Post-Trade Data, please clarify whether any supported request provides the latest eligible trade for a specified pair as of a defined server-side time. In particular, does `symbol` with `count=1` have that guarantee? Please explain ordering, tie handling, completeness, cutoff semantics and the meaning/precision of `last_ts`, `trade_ts` and `publication_ts` for this use.

**Stage 2 — possible customer-facing commercial service**

We may later consider a commercial service in which customers view market-derived prices and simulation results. This stage is not part of Stage 1 and would not begin without a separate written approval. Please advise whether customer access, display of raw or derived data, redistribution, multiple users, commercial algorithm evaluation, or retention of customer-associated simulation records requires a different market-data licence or agreement. Please include applicable fees, reporting/attribution obligations, user or geographic limits, derived-data restrictions, and whether any approval granted for private development would expressly exclude this later service.

We have not called a Kraken market-data endpoint, retained Kraken data, or enabled a provider in our application. We will keep external ingestion disabled until the permitted product, usage scope, costs, and technical semantics are documented and approved.

Thank you for your help,

Money Machine

## 4. Prioritized route to a first real-data PAPER run

The first private development test and any later customer service are separate approval scopes. A private test is still automated market-data acquisition and algorithm validation; do not infer permission from public endpoint access. Customer access, commercial display, redistribution, or a hosted product needs a separate written permission/license decision.

1. **Obtain written Stage 1 permission before any provider request.** Confirm automated private PAPER use, algorithm testing, exact products, storage/retention, owner-only display, rate limits, fees, and relevant restrictions. Keep Stage 2 explicitly excluded unless separately approved.
2. **Select the exact market and account currency.** Use an authoritative static market mapping to record display pair, internal pair aliases if relevant, base, quote, venue MIC and source/version. Choose one quote currency and create/use a separate PAPER account in that same currency. For `ETH/USD`, use PAPER/USD; for NOK, qualify a NOK pair. Do not add implicit FX.
3. **Close the Pre-Trade data-contract questions.** Confirm top-of-book selection, snapshot coherence, venue/MIC, timestamp semantics and freshness with Kraken. Define side-aware price use: ASK for simulated buys, BID for simulated sells and long-position marking. Version those choices and define exact missing/stale behavior before implementation is enabled.
4. **Implement the offline adapter slice first.** Add a fixed `/0/public/PreTrade` transport request and a parser for its actual order-book schema. Preserve exact decimal strings, original timestamp strings and response bytes/fingerprints. Validate the requested pair, base/quote, CLOB/venue, side, positive price/quantity, timestamp order/age and response limits. Select best bid/ask by exact price comparison rather than relying on array position. Keep the existing Post-Trade parser unclassified; do not adapt it by merely renaming fields.
5. **Bind quotes to decisions and simulated fills.** Generalize the immutable evidence package to preserve the entire quote snapshot plus the selected BID/ASK level and its timestamp evidence. Decisions record the quote package/fingerprint and requested price kind. BUY fills consume ASK; SELL fills consume BID. Persist evidence append-only and include it in decision/fill replay. Do not provide stale-cache, fixture, alternate-source or FX fallback.
6. **Test failure and replay paths using synthetic data.** Cover valid levels, empty book, bad/mismatched pair or MIC/currency, reversed/future/stale timestamps, malformed prices, quote-side selection, outage/429/timeout, price mutation and stable replay. Verify no external call by default. Keep existing fixture mode unchanged.
7. **Run one isolated private through-PAPER round only after separate technical and permission gates are recorded.** Use one instrument, one matching-currency dedicated PAPER account, one approved policy with bounded loss/exposure, one worker invocation with no restart, and an auditable evidence-to-decision-to-fill chain. Inspect fills, ledger/checkpoint and heartbeat. This is still a private simulation, not actual trading.
8. **Assess customer service separately.** Obtain a new written scope covering customers, commercial use, display/redistribution/derived results, retention and fees. Then perform product/legal/security review and design customer isolation and access controls. Stage 1 permission does not carry forward by assumption.

Until these gates are complete, only offline implementation and synthetic tests may run. No source is approved by this note; Coinbase remains blocked; no hosted changes, policy activation, provider requests or worker start are authorized here.
