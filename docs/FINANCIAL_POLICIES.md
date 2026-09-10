# Milestone 0 Financial Policies

This is the canonical policy source for Milestone 1 monetary behavior. Policy identifiers are immutable strings; a historical command, fill, snapshot, or replay records every policy/version below. M1 has static configuration only—there is no policy-management UI.

## 1. Simulation and version registry

M1 is **SIMULATION ONLY**: no real money, broker, banking connection, investment execution, financial-advice claim, guaranteed return, live security, or live market price. `MM_*` assets and their prices are synthetic fixtures, not recommendations. The operating jurisdiction is unresolved. Real-money functionality is architecturally blocked until a separately approved legal/regulatory milestone.

| Concern | M1 policy ID |
| --- | --- |
| Precision registry | `precision-registry/v1` |
| Synthetic asset registry | `fixture-asset-registry/v1` |
| Fixture market dataset | `mm-fixture-market-data/v1` |
| Contribution Rebalancing strategy | `contribution-rebalancing/v1` |
| Risk rules | `m1-risk-policy/v1` |
| Market execution | `m1-market-execution/v1` |
| Spread/slippage | `m1-spread-slippage/v1` |
| Transaction fee | `m1-fee/v1` |
| FIFO cost basis | `fifo-cost-basis/v1` |
| Rounding rules | `m1-rounding/v1` |
| Portfolio mark-to-market valuation | `portfolio-valuation/v1` |

## 2. Precision registry

### Currency and money

The currency registry is data/configuration, never an engine `if currency === 'NOK'` branch. M1 runtime accepts NOK accounts only, while the registry reserves USD/EUR for future accounts. `Money` is `{ currencyCode, minorUnits }`, where `minorUnits` is a signed integer atomic value.

| Currency | Monetary scale | Minor unit | Example |
| --- | ---: | --- | --- |
| NOK | 2 | øre | `1250.50 NOK` = `125050` |
| USD | 2 | cent | `1250.50 USD` = `125050` |
| EUR | 2 | cent | `1250.50 EUR` = `125050` |

Persist atomic values as `numeric(38,0)` (or an equivalent integer type with sufficient range). Use TypeScript `bigint` inside the authoritative domain and decimal strings at JSON/API/database-driver boundaries. JavaScript `number` and binary floating point may be used only for non-authoritative display/chart values.

### Asset quantity and price

`AssetQuantity` is separate from Money: `{ assetId, atomicUnits, quantityScale }`. Each asset registry entry fixes `quantityScale` from 0 through 8 and `minimumQuantityIncrementAtoms`, a positive integer multiple of which every order/fill quantity must be. The scale and increment cannot change after an asset is used.

`Price` is also separate: `{ currencyCode, priceAtoms, priceScale }`, where `priceAtoms / 10^priceScale` is quote-currency **minor units per one whole asset unit**. `priceScale` is an explicit non-negative integer from 0 through 8. For quantity `q / 10^quantityScale` and price `p / 10^priceScale`, the unrounded monetary notional in quote-currency minor units is:

```text
q × p / 10^(quantityScale + priceScale)
```

Prices are not Money because they may require precision below a currency minor unit; quantities are not Money because their atomic unit is set by the asset registry.

### Ratios and conversion boundary

M1 percentages, allocation weights, spread, slippage, fees, and limits use integer basis points (bps): `10,000 bps = 100%`, `100 bps = 1%`, and `10 bps = 0.10%`. Target weights must sum to exactly 10,000 bps. Ratios outside this model require a separately versioned fixed-scale type; they must not use floating point.

All external/string input is parsed as text. A money input with more fractional digits than the registered currency scale, a quantity not aligned to its minimum increment, or a price/rate beyond its declared scale is rejected. Exact zero-padding is allowed; non-exact truncation or implicit normalization is forbidden. Any later normalization must name its policy/version, source precision, target precision, rounding mode, and original value in the audit record.

## 3. Rounding policy: `m1-rounding/v1`

There is no global default rounding mode. Every calculation records its purpose, mode, input atoms/scales, output atoms/scales, and policy ID. Integer division is never performed without the specified mode.

| Purpose | Formula/output | Mode |
| --- | --- | --- |
| Input acceptance | Money, quantity, price, bps conversion | reject unsupported non-zero precision |
| Target allocation | `floor(NAV_minor × target_bps / 10000)` | `FLOOR` |
| Pro-rata contribution split | `floor(budget × gap / sumGaps)` | `FLOOR`; residual minor units remain cash in M1 |
| BUY execution price | `ceil(midPriceAtoms × (10000 + 5 + 5) / 10000)` | `CEILING` |
| SELL execution price | `floor(midPriceAtoms × (10000 - 5 - 5) / 10000)` | `FLOOR` |
| BUY settlement notional | `ceil(quantityAtoms × executionPriceAtoms / 10^(quantityScale+priceScale))` | `CEILING` |
| SELL settlement proceeds | `floor(quantityAtoms × executionPriceAtoms / 10^(quantityScale+priceScale))` | `FLOOR` |
| Affordable buy quantity | greatest increment-aligned quantity for which notional plus fee is within risk-approved spend | `FLOOR` quantity search |
| Fee | `max(minimumFeeMinor, ceil(notionalMinor × feeBps / 10000))` | `CEILING` |
| Percentage/limit comparison | compare cross-products, e.g. `assetValue × 10000 <= NAV × limitBps` | exact; no division |
| Display only | formatted decimal from atomic value | not authoritative |

The initial total spread is 10 bps; half spread is exactly 5 bps. Combined with 5 bps slippage, the execution impact is 10 bps. These constants are versioned in the execution policies, not embedded in strategy logic.

### Portfolio valuation: `portfolio-valuation/v1`

This explicit FLOOR rule applies specifically to M1E portfolio mark-to-market
valuation; it does not introduce a global/default rounding mode.

For each asset, first aggregate the complete authoritative holding quantity from
ledger evidence. Select the legally eligible fixture price at `asOf`, calculate
`quantityAtoms × priceAtoms / 10^(quantityScale + priceScale)` at full integer
precision, and FLOOR once to the base currency's minor unit. Never round market
values per execution, fill, or FIFO lot before aggregation. Equivalent economic
holdings must have identical market values regardless of acquisition fragmentation.

For COMPLETE valuations, invested value is the sum of these individually rounded
holding market values, and NAV is ledger-derived cash plus invested value. Never
recompute/round NAV independently from unrounded portfolio values. Each holding's
unrealized P&L is its rounded market value minus derived open cost basis; total
unrealized P&L is the sum of holding P&L. `fifo-cost-basis/v1` remains unchanged:
BUY open cost basis includes executed notional plus allocated BUY fee.

Portfolio asset weight is `FLOOR(holdingMarketValueMinor × 10000 / navMinor)`.
If shown, cash weight is `FLOOR(cashMinor × 10000 / navMinor)`. Use integer
arithmetic. Do not redistribute residue to force a 10000-bps total; any remainder
is explicitly rounding residue, not an economic allocation. When NAV is zero,
weights have no denominator and are unknown/not applicable.

If any non-zero holding lacks a legally eligible price at `asOf`, valuation is
INCOMPLETE. Never substitute a future price, use zero, fabricate a value, or omit
that holding and call NAV complete. NAV and unrealized P&L requiring the missing
value remain unknown/incomplete. FLOOR prevents overstating portfolio value;
rounding after aggregation prevents fill/lot fragmentation from changing value.

## 4. M1 synthetic asset and fixture-price registry

`fixture-asset-registry/v1` contains only the following active simulated assets. All are `SYNTHETIC_FIXTURE`, quoted in NOK, have `quantityScale = 4`, `minimumQuantityIncrementAtoms = 1` (0.0001 unit), and `priceScale = 4`. This intentionally leaves headroom for assets needing up to 8 decimal places later.

| assetId | symbol | displayName | currency | quantity/price scale | active |
| --- | --- | --- | --- | --- | --- |
| `mm.fixture.global.v1` | `MM_GLOBAL` | Money Machine Global Fixture | NOK | 4 / 4 | true |
| `mm.fixture.growth.v1` | `MM_GROWTH` | Money Machine Growth Fixture | NOK | 4 / 4 | true |
| `mm.fixture.defensive.v1` | `MM_DEFENSIVE` | Money Machine Defensive Fixture | NOK | 4 / 4 | true |

The canonical M1 dataset is `mm-fixture-market-data/v1`. A price record has `assetId`, `priceAtoms`, `priceScale`, `currencyCode`, `marketTimestamp`, `availableAt`, `ingestedAt`, and `datasetVersion`. It is immutable. All timestamps are UTC. The implementation fixture must contain an eligible mid price for each asset and a later unavailable record to test look-ahead rejection; test data is pinned by record ID/checksum.

**Availability invariant:** the engine may use a price for a strategy/risk/execution decision only when `availableAt <= decisionTimestamp`. It selects the latest eligible record by `(availableAt, marketTimestamp, recordId)` descending. A price later than the decision timestamp, missing, inactive, wrong-currency, or from the wrong dataset is ineligible. No price is invented, forward-filled, or silently substituted.

## 5. Strategy and risk policy

The sole M1 strategy is `contribution-rebalancing/v1`. It is enabled only by an account-owned assignment and produces BUY proposals only; it never sells merely to restore weights. It proposes newly available virtual capital toward underweight assets using the fixture allocation below. This is a simulator fixture, not investment guidance.

| Asset | Target |
| --- | ---: |
| MM_GLOBAL | 6000 bps (60%) |
| MM_GROWTH | 2500 bps (25%) |
| MM_DEFENSIVE | 1500 bps (15%) |

For each asset, the strategy computes the target value from post-deposit virtual NAV, then `gap = max(0, targetValue - currentValue)`. `CASH_RESERVE_BPS = 1000`: deployable cash is `max(0, ledgerCash - ceil(decisionNAV × 1000 / 10000))`, where `decisionNAV` is frozen after the triggering deposit and before any proposed order. It splits deployable cash among positive gaps pro rata with the allocation rounding policy. The only M1 minimum trade is one asset-registry `minimumQuantityIncrementAtoms`; there is no separate money minimum. It creates no proposal when all gaps are zero or a candidate cannot afford one increment plus explicit fee while retaining the reserve. It records the triggering deposit/capital event, target allocation version, eligible price records, input hash, and proposed notional. It cannot write orders, fills, trades, positions, or ledger entries.

`m1-risk-policy/v1` evaluates the following hard rules and returns a machine-readable code, evidence payload, disposition (`APPROVE`, `RESIZE`, `REJECT`, `HALT`), and plain-language explanation:

1. requesting user owns an active simulation FinancialAccount and active portfolio;
2. strategy assignment is enabled and proposal cites `contribution-rebalancing/v1`;
3. referenced asset is active in `fixture-asset-registry/v1` and quoted in the account base currency;
4. eligible fixture market data exists and satisfies the availability invariant;
5. proposed order is a valid increment-aligned M1 MARKET order; `contribution-rebalancing/v1` may emit BUY only, while any SELL must independently prove sufficient owned quantity;
6. resulting ledger-derived cash after execution notional, explicit fee, and the frozen 1000-bps decision-NAV cash reserve is non-negative;
7. resulting asset quantity is non-negative and no sale/short position is created;
8. post-trade asset allocation does not exceed its configured fixture target plus 500 bps (MM_GLOBAL 6500, MM_GROWTH 3000, MM_DEFENSIVE 2000); and
9. command/order state, idempotency, and kill-switch checks permit execution.

Risk veto is absolute. A rejected/cancelled command has no execution path and no ledger side effect.

## 6. Order, execution, fill, and fee policy

M1 supports **MARKET** BUY/SELL orders only: no limits, stops, trailing stops, partial fills, or external routing. `contribution-rebalancing/v1` emits BUY proposals only; deterministic SELL capability exists for ledger/FIFO/reversal simulation and tests, not for a discretionary trading UI. An order is intent, not a financial fact. Its M1 state machine is:

```text
CREATED -> VALIDATED -> RISK_APPROVED -> FILLED
CREATED | VALIDATED -> REJECTED
CREATED -> CANCELLED
```

`REJECTED`, `CANCELLED`, and `FILLED` are terminal. Execution alone can create one full `TradeFill` from a currently `RISK_APPROVED` order. An eligible order either fills completely once or does not fill; M1 has no `PARTIALLY_FILLED`, `EXECUTION_PENDING`, or external settlement state. It records and settles atomically. Failed prerequisites do not mutate the ledger.

For `m1-market-execution/v1`, execution chooses the latest eligible fixture mid price. Under `m1-spread-slippage/v1`, `TOTAL_SPREAD_BPS = 10` and `SLIPPAGE_BPS = 5`. A BUY price is increased by half spread (5 bps) plus slippage (5 bps); a SELL price is decreased by the same 10 bps. The exact integer formulas and conservative rounding are in section 3. Each fill preserves reference mid-price record/value, spread bps, slippage bps, final execution price, price scale, decision timestamp, and execution-policy version.

Under `m1-fee/v1`, the simulated fee is 10 bps of executed notional, rounded up, with a minimum of one whole base-currency unit. Thus a NOK account has a 100-øre minimum. The currency registry supplies that minimum for a future USD/EUR account; fee logic does not hard-code NOK. Buy cost basis includes executed notional plus buy fee. Sale realised P&L deducts sale fee. Fees are explicit in the fill, ledger, audit event, and projections; they are never folded into price.

Every monetary command has an account-scoped idempotency key and canonical request hash. Retrying equal input returns the original outcome; different input with the same key is rejected. There is at most one fill and one settlement LedgerTransaction per order, enforced by unique links and one server transaction.

## 7. FIFO lots and audit policy

`fifo-cost-basis/v1` is the only M1 lot policy. Each BUY fill creates an identifiable acquisition lot containing acquired quantity, remaining quantity, executed notional, explicit buy fee, total base cost, fill/order IDs, and ledger transaction ID. A SELL consumes eligible lots oldest acquisition time first, then lot ID as the deterministic tie-breaker. If it partially consumes a remaining lot, consumed cost is `floor(remainingCostMinor × consumedQuantityAtoms / remainingQuantityAtoms)`; if it consumes the final unit, it consumes all remaining cost, so lot costs reconcile exactly. Realised P&L is reproducible as `sale proceeds - sale fee - consumed lot cost`. FIFO is an engineering/simulation rule, not a tax-treatment claim.

For every decision, immutable AuditEvent/DecisionLog evidence records: FinancialAccount and triggering deposit; strategy/version and target allocation; eligible market records and their availability; every risk rule/result; approval/rejection; execution, spread/slippage, fee, and rounding policy versions; reference/final prices; fill; ledger transaction/entries; created/consumed lots; and resulting projections/snapshot. It also records command/idempotency/correlation IDs, actor, input/output hashes, engine release, and prior audit hash. Historical audit and ledger records are never edited or deleted.

## 8. Canonical M1 financial invariants

- Ledger transactions balance debits and credits per commodity.
- Authoritative Money never uses JavaScript `number`; authoritative quantity, price, ratios, and rates never depend on binary floating point.
- Every atomic value has a declared currency/asset/price scale and validated precision boundary.
- Every monetary command is idempotent; duplicate keys cannot duplicate deposits, fills, journals, or projections.
- Strategy cannot mutate financial state; Risk veto cannot be bypassed; Execution cannot execute an unapproved order.
- Rejected/cancelled orders cannot fill, and a fill creates no more than one settlement journal transaction.
- No FinancialAccount can spend beyond ledger-derived available cash or end with negative cash/asset quantity.
- Fees are explicit, versioned, and included in affordability, ledger, audit, and P&L.
- Historical ledger/audit/fill records cannot be edited/deleted; corrections are linked compensating transactions.
- A price unavailable at decision time cannot influence a decision, risk assessment, execution, or backtest.
- FIFO lot consumption is deterministic, reproducible, and linked to its fills/journal entries.
- Market, asset, strategy, risk, execution, fee, rounding, lot, and dataset versions are retained with historical results.
- Positions, cash, lots, and snapshots reconcile to ledger/trade state; reconciliation drift fails visibly.
- Every monetary mutation has immutable corresponding audit evidence.

## 9. Mandatory M1 financial tests

No monetary implementation is complete without invariant tests covering:

| Area | Required cases |
| --- | --- |
| Ledger | balanced journal, unbalanced rejection, reversal, replay/reconstruction |
| Idempotency | duplicate deposit, order, fill, and journal attempt |
| Execution | deterministic BUY/SELL price, spread, slippage, minimum fee, percentage fee, full-or-no fill |
| Risk | insufficient cash, unavailable/future data, invalid asset, disabled strategy, allocation violation, veto/no mutation |
| Cost basis | one FIFO lot, multiple lots, partial-lot consumption, fee-aware realised P&L |
| Strategy | underweight allocation, targets satisfied, contribution insufficient for minimum quantity |
| Reconciliation | ledger versus cash, positions, lots, and reproducible snapshot |
| Precision | rejected unsupported precision, increment alignment, every named rounding mode, no float path |
| Portfolio valuation | exact/fractional minor-unit boundaries; aggregate quantity before one FLOOR per holding; equivalent one/many-fill holdings; NAV sums rounded holdings; rounded-value unrealized P&L; fee-inclusive BUY basis; FLOOR asset/cash bps with explicit undistributed residue; future-price exclusion; INCOMPLETE missing-price totals; temporal replay and account isolation under `portfolio-valuation/v1` |
| Audit/state | evidence completeness, transition rejection, rejected/cancelled order cannot fill |
