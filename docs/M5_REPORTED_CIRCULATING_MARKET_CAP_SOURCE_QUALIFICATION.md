# M5 reported circulating market-cap source qualification

Reviewed 2026-09-30. This is static documentation review only. No provider request, account, credential, plan, terms acceptance, persistence or production activation was performed. No provider is QUALIFIED or selected.

## Decision

CoinMarketCap WETH / Ethereum and CoinGecko WETH contract market data are **PARTIAL** candidates. Production projection remains blocked, no mapping authority exists, and all five approval classes remain `REQUIRES_APPROVAL`. The previous CoinGecko market-source qualification is unchanged and remains PARTIAL; prior Demo smoke demonstrates only transport, parsing and field presence.

## Evidence classification

All sources below are official provider documentation/terms, checked 2026-09-30.

| Claim | Finding | Class |
|---|---|---|
| CMC asset IDs | CMC recommends stable numeric IDs for cryptocurrency requests. The reviewed docs did not establish the exact WETH stable asset ID or prove the selected quote-history record is that exact contract representation. | DOCUMENTED / UNKNOWN for WETH selection |
| CMC platform/address | CMC quote schema exposes platform metadata (`id`, name, symbol, token_address); address retrieval docs describe `platform.token_address`. This can identify a provider deployment, not Money Machine canonical mapping. | DOCUMENTED |
| ETH versus WETH | Native ETH and Ethereum WETH are distinct provider representations. CMC documentation reviewed did not establish an ETH/WETH equivalence rule. | DOCUMENTED as separate identity inputs; mapping UNKNOWN |
| CMC supply | `circulating_supply`, `self_reported_circulating_supply`, `total_supply`, and `max_supply` are separate fields. CMC describes verified supply review and separately labels project self-reported supply. | DOCUMENTED |
| CMC market cap | CMC methodology says circulating market cap uses reference price × current circulating supply. The quote schema separately exposes `market_cap`, `self_reported_market_cap`, `minted_market_cap`, `market_cap_by_total_supply`, and `fully_diluted_market_cap`. | DOCUMENTED |
| Exact selected WETH basis | Documentation does not bind the selected WETH observation to independently verified circulating supply, nor establish that the API's `market_cap` for this exact record meets the contract's required basis and common `asOf`. | UNKNOWN |
| Timestamps/history | Historical quotes carry quote timestamps; the endpoint returns the closest quote per interval and skips intervals without a quote. This does not prove same-instant supply/price/value binding for WETH or a correction/revision policy. | DOCUMENTED / UNKNOWN |
| CoinGecko identity and fields | Contract-address range endpoint accepts a token address and returns `market_caps` arrays; market chart docs describe timestamp/value points and `vs_currency`. `circulating_supply`, total supply and FDV are available on other coin data surfaces, not bound to each chart point by the cited range contract. | DOCUMENTED |
| CoinGecko methodology | The reviewed API reference does not specify the market-cap formula, supply basis, missing/null semantics, or common supply/value `asOf` for an individual historical point. | UNKNOWN |
| Nulls and corrections | Neither reviewed provider endpoint contract supplies adequate null/missing and correction/revision semantics for this scoped contract. | UNKNOWN |
| Cadence and freshness | CMC exposes latest and historical endpoints, but no qualification-grade WETH-specific freshness SLA was established. CoinGecko chart granularity/availability does not prove the required per-record supply/value binding. | DOCUMENTED / UNKNOWN |
| Usage and storage | CMC plan and Commercial Terms provide plan-dependent rights, attribution and limited integrated-product use; no selected plan or product-specific approval exists. CoinGecko terms discourage storage, require refresh at least every 24 hours if storing, require security and deletion on termination, and restrict copying/derivation absent express permission. | DOCUMENTED; approvals UNKNOWN / not granted |

### Official references

- [CoinMarketCap Pro API reference: cryptocurrency endpoints](https://coinmarketcap.com/api/documentation/pro-api-reference/cryptocurrency) — “Cryptocurrency”; quote/latest and quotes/historical schemas, checked 2026-09-30.
- [CoinMarketCap schemas](https://coinmarketcap.com/api/documentation/pro-api-reference/~schemas) — “CoinMarketCap Cryptocurrency API Documentation”; supply, quote, platform and timestamp fields, checked 2026-09-30.
- [CoinMarketCap Supply (Circulating, Total, Max)](https://support.coinmarketcap.com/hc/en-us/articles/360043396252-Supply-Circulating-Total-Max) — “Supply (Circulating, Total, Max)”, checked 2026-09-30.
- [CoinMarketCap Market Capitalization](https://support.coinmarketcap.com/hc/en-us/articles/360043836811-Market-Capitalization-Cryptoasset-Aggregate) — “Market Capitalization (Cryptoasset, Aggregate)”, checked 2026-09-30.
- [CMC address retrieval guide](https://coinmarketcap.com/api/resources/how-to-retrieve-a-coin%27s-contract-addresses-across-chains/) — “How to Retrieve a Coin's Contract Addresses Across Chains”, checked 2026-09-30.
- [CMC pricing](https://coinmarketcap.com/api/pricing/) — “CoinMarketCap API Pricing”, checked 2026-09-30; plan features/limits can change.
- [CMC Commercial API Terms](https://pro.coinmarketcap.com/user-agreement-commercial/) — “CoinMarketCap API Commercial Terms of Use”, checked 2026-09-30.
- [CoinGecko Pro contract market chart range](https://docs.coingecko.com/reference/contract-address-market-chart-range) — “Coin Historical Chart Data within Time Range by Token Address (Pro API Reference)”, checked 2026-09-30.
- [CoinGecko API Terms](https://www.coingecko.com/en/api_terms) — “CoinGecko API Terms of Service”, checked 2026-09-30.

## Metric distinctions and fail-closed reasoning

Provider-calculated circulating market cap is distinct from a self-reported market-cap field; the latter requires its own explicit classification and cannot satisfy a provider-calculated requirement. `totalSupply × price` is a derived minted-supply value, not circulating market cap, and the scoped contract prohibits substituting it. FDV is maximum/fully diluted valuation and is not circulating market cap. A label or observed field is not evidence of the required basis.

The endpoint may provide a value timestamp while supply has no separately bound timestamp. Equal-looking chart timestamps do not prove supply and quote were measured together. Missing/null, stale, conflicting or revised observations must yield no projection. Historical points are not automatically immutable or final.

CMC and CoinGecko contract addresses may identify a provider record. They do not create Money Machine's canonical identity. ETH and WETH remain separate representations; ticker, name, price or peg resemblance is not mapping authority. There is no WETH→ETH equivalence and no production mapping in this change. A future projection requires a separately runtime-authentic authority matching exact chain, address and representation.

## Remaining proof and approvals before QUALIFIED

1. Official provider evidence tying the exact WETH contract record to stable provider asset identity and distinct ETH/WETH records.
2. Explicit provider-calculated market-cap basis for that exact record, including circulating supply source/methodology/version; separately classify any self-reported values.
3. Exact per-observation quote, supply, value timestamp and effective `asOf` binding; null/missing behavior, freshness/cadence and historical correction/revision policy.
4. Plan/history access limits, endpoint/rate limits and WETH-specific point availability sufficient for the intended history.
5. Provider-specific usage, storage, retention, redistribution and commercial approvals; these are independent and currently not approved.
6. Independent runtime-authentic mapping authority for exact chain/address/representation and canonical asset. No authority is created here.

Production config is versioned at `config/m5/reported-circulating-market-cap-source-qualification.production.json`: both candidates PARTIAL, selected source null, projection BLOCKED, mapping null, approvals unchanged. This is not production readiness or a permission grant.
