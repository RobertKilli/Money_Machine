# M5 CoinGecko market-source qualification

**Official-source review checked:** 2026-09-29 16:43 UTC. This is a technical
qualification assessment, not legal advice, a CoinGecko approval, a plan
selection, or permission to make requests or retain data. The production
readiness and usage decisions remain fail-closed.

## Decision

The Pro `contract-address market-chart/range` endpoint exposes the expected
`prices`, `market_caps`, and `total_volumes` timestamp/value arrays, but its
official reference does not establish the exact time-series meaning required
by the M5 authorities. All three capabilities therefore remain `PARTIAL`.
None can currently produce an M5 metric projection from the configured
qualification resolver. The endpoint's array names, successful synthetic
parser fixtures, and prior successful Demo smoke are not semantic proof.

The Demo smoke proved only transport, response parsing, and presence of
parseable data fields for its tested request. It did **not** prove that a
`prices` point is a daily close, that a timestamp binds a market-cap `asOf`, or
that `total_volumes` is an exact rolling 24-hour window. The smoke result is
non-authoritative and is not evidence for this Pro endpoint qualification.

## Existing M5 requirements and CoinGecko evidence

| metric | M5 requirement | CoinGecko documentation | evidence level | status | blocker | required next proof |
|---|---|---|---|---|---|---|
| `DAILY_CLOSE_SERIES` | Positive fixed-point USD close: adapter decimal token becomes `bigint` atoms at scale 0–18 without binary `Number`; one scale and quote unit across a series. Canonical UTC millisecond `observedAt`; `observedAt <= availableAt <= asOf`. At least 15 observations / 14 returns, span at least 14 whole days, maximum timestamp gap 48 hours, unique observation IDs and timestamps. **The current M5 normalizer checks canonical UTC instants and maximum gap; it does not itself require midnight timestamps or prove a close definition.** | `prices` is required and described as `[timestamp, price]`. For automatic granularity, ranges over 90 days are `daily (00:00 UTC)`; last completed UTC day at 00:00 is available at 00:35 UTC. `interval=daily` is listed, but documentation does not define the price-selection/close formula or affirm that explicitly selected daily data has the same boundary semantics. | `prices` pair and auto-granularity boundary: **documented**. Demo smoke field parsing: **observed, not semantic**. Applying auto-daily boundary to explicit interval: **inference**. Close formula, all-asset history and gap completeness: **unknown**. | `PARTIAL` | A daily chart sample at a UTC boundary is not documented as a daily close. Plan/asset history availability is not a completeness guarantee. | Written provider definition of daily close and explicit `daily` boundary/timezone; WETH-specific history/completeness guarantees and paging/range edge behavior; verify M5's 15/14, 14-day span, 48-hour gap and duplicate policies against that contract. |
| `MARKET_CAP` | Reported market capitalization only; no FDV fallback. Source value is exact fixed-point USD from decimal lexemes (adapter scale 0–18); the M5 market authority converts to USD minor units with `MINOR_SCALE_2_FLOOR_V1`. Require `observedAt <= availableAt <= asOf`, USD quote and `MARKET_CAP_REPORTED` basis. M5 authority accepts zero but rejects non-`bigint`/negative material; it does not independently prove a provider formula. | `market_caps` is a required `number[][]` of `[timestamp, market_cap]`; `vs_currency` selects the target currency. The reference does not define the market-cap formula/supply basis, null/omission semantics per point, or a precise as-of rule. | Field and target currency: **documented**. Formula, missing/null behavior, timestamp-to-as-of authority and WETH point completeness: **unknown**. | `PARTIAL` | Correct field name and USD query do not prove circulating-supply basis, timestamp meaning, non-null completeness or M5 as-of authority. | Provider specification for capitalization formula and supply source, null/missing behavior, timestamp/as-of and correction policy; WETH-specific historical completeness; confirm accepted USD minor-unit floor semantics. |
| `VOLUME_24H` | Exact reported rolling 24-hour amount, not substituted daily volume. Fixed-point USD decimal; source window `windowStart`/`windowEnd` exactly 86,400,000 ms; `windowEnd <= asOf`; `observedAt <= availableAt <= asOf`; basis `ROLLING_24H_REPORTED`. The existing M5 authority preserves the window but does not require `windowEnd == observedAt` or `windowEnd == asOf`. | Endpoint overview calls the returned value “24hrs volume”; response field is named `total_volumes` and is only specified as timestamp/value pairs. It does not define a rolling-window start/end, exact 24-hour interval, relation of the timestamp to the window end/as-of, or whether daily aggregation changes the volume window. | “24hrs volume” endpoint overview and `total_volumes` pairs: **documented labels/schema**. Exact rolling-window meaning: **unknown**. Treating daily aggregation as a 24-hour close: **unsupported inference**. | `PARTIAL` | There are no provider-supplied window bounds in the documented response contract; exact rolling 24-hour semantics cannot be verified or bound to `asOf`. | Provider definition and per-point window bounds (or authoritative equivalent), exact duration and timestamp/as-of binding; confirm daily aggregation preserves or does not alter the rolling window; define market universe and missing-data policy. |

### M5 contract detail

`DAILY_CLOSE_SERIES` uses `m5-daily-series-authority/v1` and
`crypto-daily/v1`/`history-span/crypto-daily/v1`/`volatility/crypto-daily/v1`.
Observations bind artifact, envelope, source-observation and provider record
IDs, payload fingerprints, exact quote unit/scale, `observedAt`, and
`availableAt`. `recordedAt` is audit metadata, not authority material.
`crypto-daily/v1` requires 15 points, 14 returns, at least 14 whole days, and
rejects gaps over 48 hours and duplicate instants/IDs. Those structural checks
do not establish that a provider's `price` is a close.

`MARKET_CAP` is one of three required materials in
`m5-market-metrics-authority/v1`; the authority also requires `VOLUME` and a
complete versioned liquidity set. Market metric values are normalized to
minor units (scale 0), flooring source scales above 2 under
`MINOR_SCALE_2_FLOOR_V1`. The market-cap basis must literally be
`MARKET_CAP_REPORTED`; FDV is rejected. Its effective availability is bound to
the latest availability across all materials.

`VOLUME` must carry `ROLLING_24H_REPORTED`, both window timestamps, and an
exact 24-hour difference. The current authority checks `windowEnd <= asOf`,
but does not bind the window end to the observation timestamp or require it to
equal `asOf`; this is recorded rather than silently strengthened here.

The normalized package and sealed `SourceLineage` are necessary provenance,
not proof that CoinGecko's business meaning matches the M5 metric. Artifact,
envelope, observations, availability claims, lineage parent and members retain
the source payload and receipt/availability bindings; no authority or
eligibility evidence is written by the qualification guard.

## Official provider sources

All provider claims above were checked at **2026-09-29 16:43 UTC** against
official CoinGecko sources only:

1. [Coin Historical Chart Data within Time Range by Token Address (Pro API Reference)](https://docs.coingecko.com/reference/contract-address-market-chart-range) — endpoint path, Pro host/auth, required fields and pair semantics, query fields, available intervals, automatic granularity, UTC completed-day availability, and plan history notes.
2. [Coin Historical Chart Data within Time Range by Token Address (Demo API Reference)](https://docs.coingecko.com/demo/reference/contract-address-market-chart-range) — Demo host/auth, response schema, automatic granularity and Demo history window.
3. [CoinGecko API Terms of Service](https://www.coingecko.com/en/api_terms) — cache/storage safeguards and restrictions on copying, storing and deriving from data except where permitted by the applicable plan/agreement.

The Pro page documents `/coins/{id}/contract/{contract_address}/market_chart/range`,
`vs_currency`, `from`, `to`, optional `interval`, and `precision`. It lists
`prices`, `market_caps`, and `total_volumes` as timestamp/value arrays. Its
auto-granularity table states 5-minute data for one day from current time,
hourly for one day from another time and 2–90 days, and daily at 00:00 UTC
above 90 days. The completed UTC day becomes available at 00:35 UTC and cache
expires at 00:40 UTC. Pro uses `pro-api.coingecko.com` and
`x-cg-pro-api-key`; Demo uses `api.coingecko.com` and
`x-cg-demo-api-key`. The Demo endpoint page states a 365-day historical
restriction; Pro documentation says Basic is restricted to the past two years
and Analyst+ has the full range. These plan limits do not prove WETH coverage.

Terms depend on the selected plan and any executed agreement. Public terms
discourage storage, specify safeguards if caching/storage is used, and limit
copying/derivation except as expressly permitted. No plan was selected, no
terms were accepted, and no storage, derived-data, commercial-use or
redistribution permission is inferred by this technical qualification.

## Versioned contract and projection boundary

`m5-coingecko-market-source-qualification/v1` binds provider/dataset/version,
the Pro endpoint profile/host/path and the adapter's fixed USD/daily query
profile, Ethereum chain, WETH symbol/address,
metric and response field, required M5 semantics, documented semantics,
official evidence references, review/effective/expiry times and blockers. Its
fingerprint and ID include the qualification material and status; `recordedAt`
is excluded. The strict parser rejects unknown or inherited fields, symbols,
accessors, duplicate/noncanonical evidence, unapproved URL hosts, malformed
times, mismatched metric/field and mismatched fixed scope. Returned contracts
are deeply frozen. Pure parser output is declarative and is not runtime trust.

The server-only configured resolver brands only module-local configured
qualifications. A copied, serialized or fabricated qualification is not
trusted. The projection guard requires that configured qualification, an
authentic same-runtime acquisition result, an exact Pro/WETH/dataset/metric
scope match and an active review interval. Non-`QUALIFIED` decisions return
sanitized blockers before projection. It has no provider, database or UoW
dependency. The checked-in three metric decisions are `PARTIAL`; the guard
therefore produces no production metric projection. Existing provider
readiness stays `SUPPORTED/PARTIAL` for endpoint-field availability and every
usage remains approval-gated; readiness aggregation remains blocked. No
production readiness is promoted by this contract.

## Qualification vocabulary

- **Documented:** stated in the official endpoint/terms reference, but not necessarily sufficient for M5.
- **Observed:** seen in a synthetic fixture, parser test or the prior Demo smoke. Observation is not a provider contract.
- **Inference:** a conservative interpretation of documented endpoint behavior; never sufficient by itself to qualify.
- **Unknown:** the reviewed official sources do not establish the claim.
