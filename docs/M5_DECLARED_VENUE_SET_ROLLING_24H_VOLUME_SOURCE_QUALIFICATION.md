# M5 declared venue set rolling 24-hour volume source qualification

Status: source review implemented as an immutable descriptive qualification and side-effect-free fail-closed projection boundary. No source, venue set, mapping, or production usage is selected or authorized. Review checked 2026-09-30 05:32 UTC.

## Decision

| Candidate | Status | Decision |
|---|---|---|
| Coinbase Exchange ETH-USD product stats/ticker/trades | `PARTIAL` | Product field documentation gives useful candidate semantics, but not a complete exact rolling-window/asOf and complete-trade proof. |
| Kraken Spot ETH/USD ticker/OHLC/trades | `PARTIAL` | The ticker distinguishes daily and 24-hour values, but the reviewed documentation does not bind all required pair, unit, window, and asOf semantics for the selected response. |
| CoinMarketCap `volume_24h` aggregate | `BLOCKED` | Negative control only: aggregate volume covers CMC's tracked/provider-screened market universe, not an explicit sealed M5 venue set. |

There is no selected source, no authorized declared venue set, no mapping authority, no approved usage, and no production projection. The production decision is kept in `config/m5/declared-venue-set-rolling-24h-volume-source-qualification.production.json`. ETH remains native Ethereum ETH (`eip155:1/native:ETH`). WETH is a separate representation and is not mapped by ticker or price similarity.

## Qualification and projection boundary

`m5-declared-venue-set-rolling-24h-volume-source-qualification/v1` binds provider/dataset/version, canonical asset and representation, chain/address, mapping revision fields, venue universe, stable venue and instrument identifiers, market type, base/quote, volume unit and source field, window classification and boundaries, asOf, current/incomplete inclusion, trade and venue coverage, pagination termination, gap/duplicate/correction/freshness/finality policies, aggregation and conversion policy, evidence claims, seven distinct usage approvals, storage/retention/redistribution/commercial approvals, blockers, review validity, and deterministic fingerprint/ID. `recordedAt` is excluded from material identity. Strict own-property and descriptor checks reject extra/inherited/symbol/accessor values, non-plain records and arrays, duplicates, unsafe identifiers, noncanonical ordering, and non-exact 24-hour windows. Nested results are deep-frozen and parse errors contain only a fixed blocker code.

Parser output is descriptive and is not a qualification issuer: the current provider decisions resolve only to `PARTIAL` or `BLOCKED`. The pure projection guard additionally requires runtime-authentic qualification and mapping witnesses, exact provider and scope, exact sorted member equality, one matching exact 24-hour window/asOf, homogeneous units and quote currency, fresh final complete observations, and approvals. This slice issues no mapping witness, so projection returns `null`. There are no transport, repository, UoW, or persistence ports.

The existing scoped contract remains authoritative for its own schema. This qualification adds source evidence and stricter candidate metadata without changing legacy `VOLUME_24H`, readiness, approval registries, venue authorities, or persistence.

## Provider review

### Coinbase Exchange — `PARTIAL`

**DOCUMENTED.** [Get single product](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-single-product) documents a product response schema with product ID and base/quote currencies. Its example does not establish the current ETH-USD product record or status. [Get product stats](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-stats) says it returns 30-day and 24-hour statistics and explicitly says `volume` is in base currency units; it does not provide a 24-hour start, end, or volume asOf in that response schema. [Get product ticker](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-ticker) describes a ticker snapshot with “24h volume”, plus a separate last-trade `time`.

**INFERRED.** Since the stats schema does not provide volume boundaries/asOf and the ticker's trade timestamp is a separate field, neither page binds an exact rolling 86,400-second volume window to a common asOf. A field name or “24h” description alone is insufficient for qualification.

**DOCUMENTED.** [Get product trades](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-trades) and [Exchange REST API Pagination](https://docs.cdp.coinbase.com/exchange/rest-api/pagination) describe paged trade retrieval with bounded page sizes/cursors. The public documentation does not prove that a client has retrieved every trade for an arbitrary interval, that termination implies complete interval coverage, or how late trades, gaps, duplicates, and corrections are finalized. [REST Rate Limits Overview](https://docs.cdp.coinbase.com/exchange/rest-api/rate-limits) documents request throttling; rate limits do not establish completeness or freshness.

**UNKNOWN.** Current ETH-USD availability/state as observed from a provider response; exact boundaries and asOf for the stats/ticker volume; treatment of current/incomplete data; a complete trade-history proof and correction/finality policy; storage, retention, derived use, redistribution, and commercial approvals. The [Coinbase Market Data Terms of Use](https://www.coinbase.com/legal/market_data) was checked as a provider terms source; no agreement or product-specific permission was accepted or obtained. No legal conclusion is made.

### Kraken Spot — `PARTIAL`

**DOCUMENTED.** [Get Ticker Information](https://docs.kraken.com/api-reference/market-data/get-ticker-information) returns ticker volume array material distinguishing `today` from the last 24 hours; the documentation explains that the daily period starts at midnight UTC. This means “today” is not an exact rolling 24-hour window. The reviewed ticker schema does not provide a common exact `windowStart`, `windowEnd`, and volume `asOf` binding for all returned values. The docs do not establish a unit for the candidate ticker volume adequate to this contract.

**DOCUMENTED.** [Get Tradable Asset Pairs](https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs) exposes pair identifiers and base/quote metadata, but no response was fetched in this review; the exact current internal/display identity for ETH/USD is therefore not observed. [Get OHLC Data](https://docs.kraken.com/api-reference/market-data/get-ohlc-data) describes bucketed candles, notes the last row is the current uncommitted interval, and limits returned history. A bucket cannot silently substitute for a rolling 24-hour interval. [Get Recent Trades](https://docs.kraken.com/api-reference/market-data/get-recent-trades) documents bounded trade pages and a continuation value; that alone does not prove complete interval coverage, gap-free termination, no duplicate/late trades, or finality/corrections.

**UNKNOWN.** Exact current ETH/USD pair record, suitable volume unit and exact rolling window/asOf semantics, complete trade coverage for the target interval, current/incomplete treatment, correction/finality, freshness, and storage/retention/redistribution/commercial permissions. [Kraken Global Terms](https://www.kraken.com/legal/global-terms) and [Kraken API documentation](https://docs.kraken.com/) were reviewed as provider sources; no terms acceptance or permission was obtained. No legal conclusion is made.

### CoinMarketCap aggregate — `BLOCKED` negative control

**DOCUMENTED.** [CoinMarketCap API Documentation: Schemas](https://coinmarketcap.com/api/documentation/pro-api-reference/~schemas) defines `volume_24h` and reported/adjusted variants in quote currency and gives update timestamps in the response schemas. The schema does not make a particular ETH response or its member venues a complete M5 venue set. [Volume & Open Interest (Market Pair, Cryptoasset, Exchange, Aggregate)](https://support.coinmarketcap.com/hc/en-us/articles/360043395912-Volume-Open-Interest-Market-Pair-Cryptoasset-Exchange-Aggregate) describes cryptoasset volume as spot volume across exchanges and describes inclusion/exclusion/screening differences between reported and adjusted volume.

**INFERRED.** A provider aggregate over its own exchange universe is not an explicitly declared and sealed venue/instrument set. A generic update timestamp does not prove that every member is evaluated at one shared exact window and asOf.

**UNKNOWN.** A stable exhaustive venue/instrument universe bound to an ETH aggregate, per-member exact window/asOf, full history/revision semantics, and product-specific usage/storage/retention/redistribution/commercial approvals. The candidate is intentionally blocked for this scoped metric even when `volume_24h` is described as rolling.

## Scope and aggregation rules

- A venue label is not a stable venue identity. Each member needs its stable venue ID and exact instrument/product/pair ID.
- The member set is sorted, unique, sealed, and exact. A subset, superset, duplicate, missing member, top-N, sample, or provider-selected universe is not a complete declared set.
- Every member must share the same `windowStart`, `windowEnd`, and `asOf`; the window must be exactly 86,400,000 ms and end at `asOf`. “Today”, a UTC day, or a bucket is not rolling 24 hours.
- Base-asset volume, quote-asset volume, and quote notional are distinct units. They cannot be mixed or silently converted. Different quote currencies need separate runtime-authentic conversion authority, which does not exist in this slice.
- Current/incomplete observations, unknown coverage/termination, duplicate or out-of-order trades, unhandled gaps, stale data, and unresolved corrections/finality block projection.
- ETH and WETH remain separate. Pair/contract identity identifies provider material only; it does not create Money Machine mapping authority.
- No provider usage, persistence, retention, redistribution, derived-use, or commercial right is inferred from documentation alone.

## Evidence and remaining blockers before `QUALIFIED`

All provider-page checks listed here were performed 2026-09-30 05:32 UTC.

- **DOCUMENTED:** only the narrow statements attributed to the official pages above.
- **OBSERVED:** the listed static documentation pages were read at the control time; no product, pair, ticker, stats, OHLC, or trade API response was observed.
- **INFERRED:** a provider-selected/global aggregate does not meet an exact sealed declared venue-set contract; a daily bucket is not itself an exact rolling 24-hour interval; response schemas alone do not prove selected-record completeness.
- **UNKNOWN:** every unproven record-specific, temporal, coverage, correction, freshness, or permission detail identified above.

No provider API was queried. Missing record-specific proof remains `UNKNOWN`.

Before any source can become `QUALIFIED`, a later reviewed phase must supply: an observed exact product/pair/venue identity; provider-authenticated exact volume unit and field methodology; exact shared rolling window boundaries and value asOf; complete member and trade coverage with termination evidence; current/incomplete, gap, duplicate, late-trade, correction and finality policies; freshness and null/missing behavior; a runtime-authentic exact canonical mapping authority; and separate explicit approvals for each usage plus storage, retention, redistribution, derived use, and commercial use. No such evidence or approval is created here.

## Official sources checked

| Title | Official URL | Control time | Narrow claim used |
|---|---|---|---|
| Get single product | https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-single-product | 2026-09-30 05:32 UTC | Product schema; example does not prove current ETH-USD status. |
| Get product stats | https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-stats | 2026-09-30 05:32 UTC | 24h/30d stats; `volume` in base units; no exact volume boundaries/asOf schema. |
| Get product ticker | https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-ticker | 2026-09-30 05:32 UTC | Ticker snapshot says 24h volume; separate last trade time. |
| Get product trades | https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-trades | 2026-09-30 05:32 UTC | Paged trade records. |
| Exchange REST API Pagination | https://docs.cdp.coinbase.com/exchange/rest-api/pagination | 2026-09-30 05:32 UTC | Cursor pagination and page bounds. |
| REST Rate Limits Overview | https://docs.cdp.coinbase.com/exchange/rest-api/rate-limits | 2026-09-30 05:32 UTC | Request limits/throttling. |
| Market Data Terms of Use | https://www.coinbase.com/legal/market_data | 2026-09-30 05:32 UTC | Provider market-data terms; no approval inferred. |
| Get Ticker Information | https://docs.kraken.com/api-reference/market-data/get-ticker-information | 2026-09-30 05:32 UTC | Today versus last-24h ticker fields; today UTC day boundary. |
| Get OHLC Data | https://docs.kraken.com/api-reference/market-data/get-ohlc-data | 2026-09-30 05:32 UTC | Bucketed data, current uncommitted row, bounded history. |
| Get Recent Trades | https://docs.kraken.com/api-reference/market-data/get-recent-trades | 2026-09-30 05:32 UTC | Bounded trade pagination; does not prove complete interval history. |
| Get Tradable Asset Pairs | https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs | 2026-09-30 05:32 UTC | Pair metadata schema; selected ETH/USD record not observed. |
| Spot REST Rate Limits | https://docs.kraken.com/exchange/guides/rest/ratelimits | 2026-09-30 05:32 UTC | Tiered public REST rate-limit policy. |
| Global Terms of Service | https://www.kraken.com/legal/global-terms | 2026-09-30 05:32 UTC | Provider terms source; no approval inferred. |
| CoinMarketCap API Documentation: Schemas | https://coinmarketcap.com/api/documentation/pro-api-reference/~schemas | 2026-09-30 05:32 UTC | Volume fields, adjusted/reported distinction, quote and timestamp schema. |
| Volume & Open Interest (Market Pair, Cryptoasset, Exchange, Aggregate) | https://support.coinmarketcap.com/hc/en-us/articles/360043395912-Volume-Open-Interest-Market-Pair-Cryptoasset-Exchange-Aggregate | 2026-09-30 05:32 UTC | Exchange/asset/aggregate universe and screening definitions. |
| CoinMarketCap API Pricing Plans | https://coinmarketcap.com/api/pricing/ | 2026-09-30 05:32 UTC | Pricing/plan page reviewed; no subscription or entitlement inferred. |
| CoinMarketCap Commercial API Terms of Use | https://pro.coinmarketcap.com/user-agreement-commercial/ | 2026-09-30 05:32 UTC | Provider terms source; no approval inferred. |

No terms were accepted. This document is not legal advice.
