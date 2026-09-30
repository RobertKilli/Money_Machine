# M5 scoped market metric contracts

Status: contract proposal implemented as a strict, side-effect-free domain boundary; no source is qualified, selected, or enabled. Reviewed 2026-09-30.

## Why the old names are not enough

The existing `m5-daily-series-authority/v1` and `m5-market-metrics-authority/v1` remain unchanged. Their global `MARKET_CAP`, `VOLUME`, and daily-series labels do not themselves identify a venue, instrument, circulating-supply methodology, declared market universe, or one meaning of “complete”. This version adds scoped metric kinds; it does not rewrite existing records, migrations, readiness, or authority semantics.

| New metric | Exact claim in v1 | What it does not claim | Still blocked by |
|---|---|---|---|
| `NAMED_VENUE_DAILY_CLOSE` | One named spot/DEX-spot instrument's UTC P1D close at the exact midnight boundary, with fixed close basis, correction and gap policy. A separate record identifies venue, instrument, base/quote and mapping revision. | A market-wide or asset-wide close; automatic provider granularity; a sample/snapshot; inferred ticker/address mapping. | Venue/instrument selection, source qualification, history/gap/correction proof, mapping authority, approvals. |
| `REPORTED_CIRCULATING_MARKET_CAP` | An explicitly provider-reported value for a canonical asset/currency at `asOf`, whose provider says its supply basis is circulating and identifies methodology/version. | Total supply value, FDV, WETH supply standing in for ETH circulating supply, or an internal `price × supply` calculation. | Provider's circulating basis, as-of/null/history proof, qualification, mapping and approvals. |
| `DECLARED_VENUE_SET_ROLLING_24H_VOLUME` | A rolling exactly-24-hour value ending at `asOf` for only the explicit sorted venue/instrument/market-type set named in the record. | Global volume, every market, a daily bucket, or an implicit “complete market” claim. | Venue set and aggregation methodology, exact source window/as-of, coverage/history, qualification and approvals. |

All monetary/quantity values are decimal integer strings with explicit scale. No JS `number` arithmetic is used for authoritative values. `recordedAt` is excluded from material fingerprint identity. Evidence references are canonical HTTPS URLs on an explicit source-host allowlist. Qualification ID/fingerprint and provider/dataset/version/metric must bind exactly; parsed CoinGecko qualification must be authentic in the current runtime and is still `PARTIAL`, so the guard returns `BLOCKED`. The existing qualification schema also lacks the scoped metric-scope hash, and this pure guard does not resolve a mapping authority from its repository; both are explicit blockers rather than caller-supplied hashes being mistaken for authority.

## Valid and invalid material

A valid daily-close material states a UTC daily candle from `00:00Z` to the next `00:00Z`, interval `P1D`, explicit venue and instrument IDs, and `LAST_TRADE_AT_OR_BEFORE_BOUNDARY`; it cannot use `AUTO`, a point sample, or a non-UTC boundary. The data contract's correction policy is versioned restatement and gaps block the declared series. A provider still must document and qualify these rules; a syntactically valid record alone is not proof that it happened.

A valid reported market-cap record has `supplyBasis=CIRCULATING` and `valueKind=PROVIDER_REPORTED`. `TOTAL_SUPPLY`, `FULLY_DILUTED`, null/missing values, and internal derivations are invalid for this metric. A future total-supply valuation needs a separately approved metric and contract; this slice does not define one.

A valid rolling-volume record has `windowEnd=asOf`, `windowEnd-windowStart=86,400,000ms`, sorted unique venue/instrument/market-type tuples and an explicit aggregation version. Daily candle volume or duplicate, unsorted or mixed-set material is invalid. The phrase “complete” is bounded to that declared venue set only.

## Canonical assets and representations

Provider representation and canonical asset identity are distinct. A contract address or ticker alone is not canonical identity. WETH is an ERC-20 representation on Ethereum; it is not automatically interchangeable with native ETH. Mapping needs a separate authority ID, fingerprint, canonical asset, representation and revision. Missing/mismatched mapping blocks the guard. No production WETH-to-ETH mapping is created here.

## Production posture and later work

`config/m5/scoped-market-metric-direction.production.json` records the selected *definition direction* for each metric while every decision remains `BLOCKED`; it does not select a provider, venue, instrument, mapping, qualification or permission. All three pre-existing global source-gap decisions and the production readiness/approval registry remain unchanged. The existing CoinGecko qualification remains `PARTIAL`.

Later implementation should proceed in separate reviewed slices: (1) choose a venue/instrument, canonical asset mapping and lawful use scope; (2) qualify field-level source semantics and coverage using synthetic fixtures first; (3) design a new additive persistence/SourceLineage migration for the new versioned records; (4) only after independent approval, implement acquisition and persistence. No migration, provider call, scheduler or canonical write is part of this change.

The scoped guard is server-only and pure: it has no transport, UoW, database, persistence or side effects. It returns only READY/BLOCKED/INVALID and sanitized blocker codes. With current PARTIAL qualification and no mapping authority, it does not grant READY.
