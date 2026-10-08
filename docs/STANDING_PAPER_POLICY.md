# Standing paper policy v1

`standing-paper-policy/v1` is a local simulation control layered over the M1
contribution strategy, risk checks, execution rules, ledger, and portfolio
projection. Its mode is fixed to `PAPER_ONLY`. It has a policy identity and
FinancialAccount scope, an explicit instrument allowlist, capital budget,
per-order and per-position limits, gross exposure limit, absolute loss limit,
and maximum price age. Money limits are integer NOK minor units; order
quantities and prices retain their M1 asset and price scales.

Policies begin in `DRAFT`. `ACTIVATE` makes a policy eligible, `PAUSE` blocks
new orders while retaining its identity, and `STOP` is terminal. The local demo
activates an in-memory policy containing synthetic values. It does not create
or enable a live mandate.

Each strategy proposal passes the existing `m1-risk-policy/v1`, then the
standing policy evaluates status/account, price record and age, synthetic
instrument allowlist, total debit including the existing fee/slippage model,
position and total exposure, budget including open-order reservations, and
contribution-adjusted portfolio drawdown. At each timestamp, adjusted equity is
`portfolio NAV - cumulative virtual contributions`. Loss is the positive decline
from the highest adjusted-equity value observed so far (the high-water mark,
initially zero). A new deposit increases both NAV and cumulative contributions
by the same amount, so it cannot erase prior loss or restore used loss capacity.
The policy rejects only when this loss is greater than `maxLossMinor`; equality
is allowed. The immutable result captures stable reason code,
policy version, input hash, eligible price record, reservation amount, and
resulting exposure, exact reference price and timestamp, dataset/strategy/asset
registry versions, and execution-policy version identifiers. The backtest simulator immediately fills accepted market
orders completely using `m1-market-execution/v1`, `m1-spread-slippage/v1`,
`m1-fee/v1`, and `m1-rounding/v1`. It reprojects the ledger before the next
order so limits see earlier fills in the same round.

Run the local three-round fixture with:

```sh
npm run paper:demo
```

The command uses only `mm-fixture-market-data/v1`-shaped synthetic prices and
virtual NOK contributions. Output calls fills `SIMULATED_PAPER_FILL`. It makes
no provider, broker, exchange, hosted database, or live execution call. Its
idempotency boundary is process-local: concurrent attempts and replays within
one runner instance return the same outcome, while reusing a key with changed
input fails. Durable cross-process policy/order persistence and database-level
locking are outside this local demonstration.

## What the simulation establishes

- Exact integer-based limits, fee-aware budget checks, deterministic strategy
  and fill calculations, and balanced ledger settlement for the selected
  synthetic inputs.
- The recorded policy/data versions and decision reason codes for proposals
  that reach the policy gate.
- Multiple unattended decision rounds under one explicitly active
  PAPER_ONLY policy, plus process-local replay and simultaneous-call behavior.

## Assumptions and limits

- A fill means the simulator applied the declared full-fill model. It does not
  mean an order reached or filled on an exchange.
- Price availability age, spread, slippage, fee, market schedule, and full-fill
  behavior are fixed simulation assumptions, not calibrated live execution
  estimates.
- This fixture has no live provider data, brokerage, account custody,
  partial fills, exchange liquidity, or live mandate. Results are not actual
  investment performance, a forecast, financial advice, or a guarantee.
- The runner is an offline review tool, not a durable unattended production
  service. Production persistence, cross-process idempotency/locking, operator
  controls, loss semantics, and legal/product review need a separately scoped
  milestone.
