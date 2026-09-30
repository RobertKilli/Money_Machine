# M5 named venue daily close source qualification

Status: Coinbase Exchange `ETH-USD` is **PARTIAL**; Kraken Spot `ETH/USD` is **BLOCKED**. No venue is selected or production-qualified. Official documentation was reviewed at 2026-09-30 04:13 UTC. No provider data/API endpoint was called and no terms were accepted.

This review is bound to `m5-scoped-market-metric-contract/v1` and its `NAMED_VENUE_DAILY_CLOSE` meaning: one named SPOT venue/instrument, ETH base, USD quote, UTC daily interval of 86,400 seconds, one exact completed bucket, close field and explicit correction/gap policies. The provider source qualification has its own immutable version, `m5-named-venue-daily-close-source-qualification/v1`; it binds metric kind, provider/dataset/profile, venue/instrument, assets, chain/representation, expected canonical asset, interval/boundary, close field and policies with a deterministic `metricScopeFingerprint`. `recordedAt` is excluded from its deterministic identity. The strict parser rejects unknown/inherited/symbol/accessor/non-plain fields, unsafe URLs, duplicate evidence and invalid candidate profiles. The server-only projection guard validates plain scope and candle shapes and returns no projection for either candidate. A mapping object carried in input is not runtime-trusted; this guard always blocks until a separately trusted mapping resolver/witness is introduced.

## Evidence comparison

| Requirement | Coinbase Exchange | Kraken Spot | M5 requirement / blocker / approval consideration |
|---|---|---|---|
| Venue and instrument | **DOCUMENTED** candle endpoint accepts `product_id`; product catalog docs describe `id`, `base_currency`, and `quote_currency`, but do not show `ETH-USD` in the static example. Current listing/identity remains **UNKNOWN**. ([C1][C3]) | **DOCUMENTED** pair metadata supports keys, altname and wsname/display forms; current `ETH/USD` record and canonical internal key are **UNKNOWN** without retrieving live pair metadata. ([K1][K2]) | Exact stable venue/product/pair identity required. Candidate values are not production selections. |
| Endpoint/schema | **DOCUMENTED** `GET /products/{product_id}/candles`; timestamp is bucket start, close is last trade in bucket; array schema lists OHLC and the response item documents volume. ([C1]) | **DOCUMENTED** `GET /0/public/OHLC`; example row is `[time, open, high, low, close, vwap, volume, count]`; close is index 4. ([K1]) | Schemas differ; parser profiles must not be interchanged. |
| Daily interval and UTC boundary | **DOCUMENTED** 86400 seconds is one day. The endpoint says time is bucket start. Exact UTC midnight origin is **UNKNOWN**. ([C1]) | **DOCUMENTED** 1440 minutes is supported. Unix seconds and interval duration do not prove a midnight bucket origin; exact UTC boundary is **UNKNOWN**. ([K1]) | Exact `00:00:00Z` start/end is mandatory; both remain blocked on provider boundary semantics. |
| Finished candle | **UNKNOWN** whether a current/partial Coinbase daily candle can be returned; docs use a default range ending now and do not document completed-only/finality semantics. ([C1]) | **DOCUMENTED** latest returned row is for the current, not-yet-committed timeframe regardless of `since`. ([K1]) | Guard rejects a candle ending after `asOf`, but endpoint-level completed-only semantics remain unqualified. |
| Missing buckets/gaps | **DOCUMENTED** no data is published for intervals with no ticks; docs also caution historical rates may be incomplete. ([C1]) | Missing-interval semantics are **UNKNOWN** in reviewed docs. ([K1]) | `GAPS_BLOCK`; absence cannot be silently interpolated or treated as proof of a complete day. Coinbase no-tick behavior still needs an explicit qualified interpretation. |
| History / pagination | **DOCUMENTED** max 300 candles/request; >300 is rejected; time ranges must be split; some returned rows may precede requested start. Total historical lower bound is **UNKNOWN**. Candle endpoint is range-based rather than cursor-paginated. ([C1][C2]) | **DOCUMENTED** at most 720 recent OHLC entries and `since` is intended for incremental updates; older OHLC is inaccessible through this endpoint. Trades history can be paged, but constructing candles is a separate source profile. ([K1][K3]) | Required historical coverage horizon is unspecified. Kraken's OHLC endpoint alone cannot supply more than 720 recent daily points. |
| Corrections/finality | **UNKNOWN**; no correction, late-trade or finality procedure is documented by the reviewed candle reference. ([C1]) | **UNKNOWN**; no correction/finality procedure in the reviewed OHLC reference. ([K1]) | `VERSIONED_RESTATEMENT` cannot be claimed as provider behavior without documented semantics. |
| Rate limit | **UNKNOWN**. The Coinbase candle reference links to its REST Rate Limits Overview, but that linked page could not be opened during this review; no rate-limit assumption is made. ([C4]) | **DOCUMENTED** public OHLC is limited by IP and pair; one request/second or lower stays within published guidance. ([K4]) | Operational policy is not implemented in this slice. |
| Terms/storage/commercial | Coinbase terms document personal/research scope and restrictions on third-party redistribution/display and some derived financial uses; storage/retention permission is **UNKNOWN**. Applicable package fees may apply; no fee or approval is recorded. ([C5]) | Kraken API docs require prior permission for certain non-personal commercial uses of public market data; storage/retention/redistribution approval and any applicable cost are **UNKNOWN** and none is recorded. ([K5]) | Usage, storage, retention, redistribution and commercial approval remain separate blockers; this is not a legal conclusion. |

### Official sources

All sources below were reviewed 2026-09-30 04:13 UTC. `DOCUMENTED` means the cited official provider source says the fact. `OBSERVED` is reserved for a direct observation; none was made because no endpoint was called. `INFERRED` is an interpretation of documented statements. `UNKNOWN` means reviewed official material does not establish it.

| Provider | Document title | URL | Checked |
|---|---|---|---|
| C1 | Coinbase | [Get product candles - Coinbase Developer Documentation](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles) | 2026-09-30T04:13:11Z |
| C2 | Coinbase | [Exchange REST API Pagination - Coinbase Developer Documentation](https://docs.cdp.coinbase.com/exchange/rest-api/pagination) | 2026-09-30T04:13:11Z |
| C3 | Coinbase | [Get all known trading pairs - Coinbase Developer Documentation](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-all-known-trading-pairs) | 2026-09-30T04:13:11Z |
| C4 | Coinbase | [Exchange REST API Rate Limits Overview](https://docs.cdp.coinbase.com/exchange/rest-api/rate-limits) | 2026-09-30T04:13:11Z |
| C5 | Coinbase | [Market Data Terms of Use](https://www.coinbase.com/legal/market_data) | 2026-09-30T04:13:11Z |
| K1 | Kraken | [Get OHLC Data - Kraken Developers](https://docs.kraken.com/api-reference/market-data/get-ohlc-data) | 2026-09-30T04:13:11Z |
| K2 | Kraken | [Get Tradable Asset Pairs - Kraken Developers](https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs), [API symbols and tickers](https://support.kraken.com/articles/360000920306-api-symbols-and-tickers) | 2026-09-30T04:13:11Z |
| K3 | Kraken | [Advanced API FAQ](https://support.kraken.com/articles/advanced-api-faq) | 2026-09-30T04:13:11Z |
| K4 | Kraken | [What are the API rate limits?](https://support.kraken.com/articles/206548367-what-are-the-api-rate-limits-?mobile_site=false) | 2026-09-30T04:13:11Z |
| K5 | Kraken | [Kraken APIs](https://docs-legacy.kraken.com/api/docs/guides/global-intro/) | 2026-09-30T04:13:11Z |

## Qualification outcome

Coinbase is **PARTIAL**, not selected: interval, candle schema, bucket-start timestamp meaning, no-tick omission and range limits are documented. The current `ETH-USD` listing, exact UTC daily origin, current-candle completion semantics, correction/finality and required history coverage remain unproven. Terms constrain use; storage/retention and any required usage permissions are not approved.

Kraken is **BLOCKED**, not selected: official docs explain pair-key/display-name forms, but current ETH/USD pair identity was not observed or verified. The 1440-minute OHLC schema, current uncommitted last candle and 720-point cap are documented; exact UTC daily origin, gap policy, corrections/finality and sufficient required history remain unproven. Terms and permissions are not approved.

### ETH and WETH boundary

Both candidates name ETH as the base asset of a venue instrument. This does not qualify wrapped ETH. WETH is a separate representation with its own chain/address and wrapping/depeg risks. A ticker, matching price, or contract address alone cannot establish canonical identity. WETH-to-ETH requires a separately reviewed mapping authority, with an exact mapping ID, fingerprint, revision and scope. This slice creates no production mapping.

### Guard and production state

Candidate qualification is not usage approval or mapping authority. The projection guard requires an authentic parser-produced qualification and exact venue/instrument/base/quote/market/interval/time boundary match. These candidates remain non-qualified and yield a null projection. The production config selects no provider and leaves all metrics blocked. Existing CoinGecko qualification remains `PARTIAL`; legacy daily-series/market-metric consumers and persisted authority are not upgraded.

## Next slice

First obtain static, official evidence for exact listed instrument identities and the UTC daily boundary, then resolve gap, correction/finality and required-history policies. Keep technical endpoint qualification separate from provider permission, storage/retention, display and commercial approval. A later persistence slice must add new versioned records additively; it must not rewrite old metric authority. Only after those gates pass should an independently approved acquisition slice consider transport. No API calls, database, migration, scheduler, persistence or canonical writes are included here.
