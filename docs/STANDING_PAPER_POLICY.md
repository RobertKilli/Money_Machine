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
or enable a live mandate. The PostgreSQL runner requires an existing active
`PAPER` FinancialAccount and creates a policy in `DRAFT`; only explicit
`ACTIVATE` makes it runnable.

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
input fails. Durable state is provided separately by
`StandingPaperPolicyRepository` for an existing PAPER FinancialAccount.

Run its task-eid disposable local PostgreSQL integration suite with:

```sh
npm run test:standing-paper:postgres
```

The command creates a uniquely labeled local PostgreSQL container and volume,
binds only to loopback, applies checked-in migrations, runs the integration
suite, then verifies that the container, volume, report, and temporary folder
are gone. It does not read `DATABASE_URL` and rejects a database URL that is
not for its task-owned `127.0.0.1/mm_paper_<random-id>` database.

Each durable decision round locks the policy row with `SELECT ... FOR UPDATE`.
Inside that transaction it checks the run input hash, rejects contribution
event IDs already processed, evaluates only new events using saved ledger and
acquisition evidence, inserts run and decision records, creates simulated fill
evidence, writes contribution idempotency and audit records, appends balanced
transactions to the existing ledger, and updates the portfolio/risk checkpoint.
Any error rolls the whole set of writes back. Unique constraints add a second
idempotency barrier. Separate repository instances serialize on the same
policy row. Previous contributions and fills are restored from the checkpoint;
they are never passed through strategy or execution again.

Migration `20261008120000_standing_paper_persistence.sql` adds policy state,
run idempotency, contribution claims, decision records, and paper fill links.
It references existing FinancialAccounts and ledger tables. The migration is
source only; this change does not apply it to a hosted database. Current policy
status and checkpoint are mutable. Runs, decisions, contributions, fills,
ledger transactions, ledger entries, and audit evidence are append-only.

## What the simulation establishes

- Exact integer-based limits, fee-aware budget checks, deterministic strategy
  and fill calculations, and balanced ledger settlement for the selected
  synthetic inputs.
- The recorded policy/data versions and decision reason codes for proposals
  that reach the policy gate.
- Multiple unattended decision rounds under one explicitly active
  PAPER_ONLY policy, plus process-local replay and simultaneous-call behavior.
- The PostgreSQL path resumes the same ledger-derived account in a new runner,
  serializes concurrent rounds, rejects duplicate events, and rolls back all
  monetary and audit writes together after an injected failure.

## Assumptions and limits

- A fill means the simulator applied the declared full-fill model. It does not
  mean an order reached or filled on an exchange.
- Price availability age, spread, slippage, fee, market schedule, and full-fill
  behavior are fixed simulation assumptions, not calibrated live execution
  estimates.
- This fixture has no live provider data, brokerage, account custody,
  partial fills, exchange liquidity, or live mandate. Results are not actual
  investment performance, a forecast, financial advice, or a guarantee.
- The PostgreSQL runner is a local simulation persistence boundary, not a
  production unattended trading service. It accepts synthetic fixture prices
  only and has no broker/exchange adapter. PostgreSQL row locking serializes
  decisions and the existing ledger remains authoritative for the synthetic
  FinancialAccount; its risk checkpoint is updated in the same transaction.
