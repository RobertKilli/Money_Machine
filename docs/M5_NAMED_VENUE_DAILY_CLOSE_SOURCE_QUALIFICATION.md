# M5 named venue daily close source qualification

Status: Coinbase Exchange `ETH-USD` is **PARTIAL**; Kraken Spot `ETH/USD` is **BLOCKED**. No venue is selected or production-qualified. Official documentation was checked at 2026-09-30 03:57 UTC. No endpoint was called and no terms were accepted.

This review is bound to `m5-scoped-market-metric-contract/v1` and its `NAMED_VENUE_DAILY_CLOSE` meaning: one named SPOT venue/instrument, ETH base, USD quote, UTC daily interval of 86,400 seconds, one exact completed bucket, close field and explicit correction/gap policies. The provider source qualification has its own immutable version, `m5-named-venue-daily-close-source-qualification/v1`. `recordedAt` is excluded from its deterministic identity. The strict parser rejects unknown or inherited properties, symbols/accessors, malformed or credential-bearing URLs, duplicate evidence and noncanonical material. The server-only projection guard is pure and returns no projection for either candidate.

## Evidence comparison

| Requirement | Coinbase Exchange | Kraken Spot | M5 requirement / blocker / approval consideration |
|---|---|---|---|
| Venue and instrument | **DOCUMENTED** endpoint accepts `product_id`; `ETH-USD` is a candidate ID, but current product identity is not confirmed from a static official source. | **DOCUMENTED** pair lookup is exposed separately; `ETH/USD` is a display candidate. The canonical internal pair key needs current pair metadata, which this review does not retrieve. | Exact stable venue and product/pair identity required. Candidate identities are not production selections. |
| Endpoint/schema | **DOCUMENTED** `GET /products/{product_id}/candles`; row `[time, low, high, open, close, volume]`, with `time` bucket start and close last trade in bucket. | **DOCUMENTED** `GET /0/public/OHLC`; row `[time, open, high, low, close, vwap, volume, count]`; close is row field 5 (index 4). | Schemas differ; parser profiles must not be interchanged. |
| Daily interval and UTC boundary | **DOCUMENTED** 86400 seconds accepted. Epoch `time` and 86400-second size are compatible with UTC instants (**INFERRED**), but docs do not promise an exact UTC midnight bucket origin. | **DOCUMENTED** interval 1440 minutes is supported. Unix timestamps are shown, but exact UTC midnight origin is not documented here. | Exact `00:00:00Z` start/end is mandatory; both remain blocked on provider boundary semantics. |
| Finished candle | Endpoint describes candle data; docs do not provide a finality/correction guarantee. | Latest returned candle is explicitly current/uncommitted, regardless of `since`. | Reject any bucket whose end is after `asOf`; Kraken current row must be removed. Finished status still needs a documented policy. |
| Missing buckets/gaps | **DOCUMENTED** no data is published for intervals with no ticks. | Missing-interval semantics are **UNKNOWN** in reviewed docs. | `GAPS_BLOCK`; absence cannot be silently interpolated or interpreted as a complete day. Coinbase no-tick behavior needs a qualified handling rule. |
| History / pagination | Max 300 candles; larger requests rejected; split into start/end ranges; some returned rows can precede requested start. Lower history bound **UNKNOWN**. | At most 720 OHLC rows; `since` does not extend older OHLC history. Trades history can be paged and bars reconstructed, which would be a distinct source/profile. | Required coverage horizon is not specified by this source decision. Kraken OHLC is limited to 720 days at daily interval. |
| Corrections/finality | **UNKNOWN**. | **UNKNOWN**. | Versioned restatement policy cannot be asserted until provider correction semantics are established. |
| Rate limit | **UNKNOWN** in the reviewed candle reference; needs confirmation from official Exchange REST rate-limit docs before acquisition planning. | **DOCUMENTED** public OHLC calls are limited by IP and pair; one request/second or lower stays within published guidance. | Operational policy is not implemented in this slice. |
| Terms/storage/commercial | Coinbase Market Data Terms limit license to personal/research use for the entity and disallow an end-user app without separate permission; no approval or fee plan is recorded. | Kraken API docs state prior permission is required for certain non-personal commercial uses of public market data. No permission is recorded. | Usage, storage, retention, display/redistribution, and commercial approvals are separate blockers; this document makes no legal conclusion. |

### Official sources

All sources below were checked 2026-09-30 03:57 UTC. `DOCUMENTED` means the cited provider source says the fact. `INFERRED` is an interpretation of those statements. `UNKNOWN` means the reviewed official material does not establish it.

| Provider | Document title | URL | Checked |
|---|---|---|---|
| Coinbase | Get product candles - Coinbase Developer Documentation | https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles | 2026-09-30T03:57:19Z |
| Coinbase | Exchange REST API Pagination - Coinbase Developer Documentation | https://docs.cdp.coinbase.com/exchange/rest-api/pagination | 2026-09-30T03:57:19Z |
| Coinbase | Get all known trading pairs - Coinbase Developer Documentation | https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-all-known-trading-pairs | 2026-09-30T03:57:19Z |
| Coinbase | Market Data Terms of Use | https://www.coinbase.com/legal/market_data | 2026-09-30T03:57:19Z |
| Kraken | Get OHLC Data - Kraken Developers | https://docs.kraken.com/api-reference/market-data/get-ohlc-data | 2026-09-30T03:57:19Z |
| Kraken | Get Tradable Asset Pairs - Kraken Developers | https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs | 2026-09-30T03:57:19Z |
| Kraken | What are the API rate limits? | https://support.kraken.com/articles/206548367-what-are-the-api-rate-limits-?mobile_site=false | 2026-09-30T03:57:19Z |
| Kraken | Advanced API FAQ | https://support.kraken.com/articles/advanced-api-faq | 2026-09-30T03:57:19Z |
| Kraken | Kraken APIs | https://docs-legacy.kraken.com/api/docs/guides/global-intro/ | 2026-09-30T03:57:19Z |

## Qualification outcome

Coinbase is **PARTIAL**, not selected: interval, candle schema and range limits are documented, but the current `ETH-USD` product identity was not independently verified, exact UTC daily origin is unstated, no-tick days need an explicit quality policy, and corrections/finality and usable history coverage remain unknown. Terms and usage/storage/commercial permissions are not approved.

Kraken is **BLOCKED**, not selected: the 1440-minute OHLC schema is documented, but current canonical pair identity and exact UTC daily origin are unverified. The API returns an uncommitted last candle; historical OHLC is capped at 720 points; gap and correction/finality policies remain unqualified. Terms and permissions are not approved.

### ETH and WETH boundary

Both candidates name ETH as the base asset of a venue instrument. This does not qualify wrapped ETH. WETH is a separate representation with its own chain/address and wrapping/depeg risks. A ticker, matching price, or contract address alone cannot establish canonical identity. WETH-to-ETH requires a separately reviewed mapping authority, with an exact mapping ID, fingerprint, revision and scope. This slice creates no production mapping.

### Guard and production state

Candidate qualification is not usage approval or mapping authority. The projection guard requires an authentic parser-produced qualification and exact venue/instrument/base/quote/market/interval/time boundary match. These candidates remain non-qualified and yield a null projection. The production config selects no provider and leaves all metrics blocked. Existing CoinGecko qualification remains `PARTIAL`; legacy daily-series/market-metric consumers and persisted authority are not upgraded.

## Next slice

First obtain static, official evidence for exact listed instrument identities and the UTC daily boundary, then resolve gap, correction/finality and required-history policies. Keep technical endpoint qualification separate from provider permission, storage/retention, display and commercial approval. A later persistence slice must add new versioned records additively; it must not rewrite old metric authority. Only after those gates pass should an independently approved acquisition slice consider transport. No API calls, database, migration, scheduler, persistence or canonical writes are included here.
