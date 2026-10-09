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

The `standing-paper-postgres` GitHub Actions job runs this command separately
from the ordinary `npm run test` unit suite. The command requires every named
integration case to pass; a skipped or missing case fails the run. The job
runs for pull requests targeting `main` and pushes to `main`, using no hosted
database credentials or operational pins. Unit CI and this database
integration job are distinct controls.

## Local standing paper worker

`npm run paper:worker` starts a local worker against one explicitly supplied
active policy. It does not activate or transition the policy. Supply the
task-owned local database URL, policy ID, and a stable worker ID explicitly:

```sh
npm run paper:worker -- --database-url postgresql://postgres:postgres@127.0.0.1:55432/mm_paper_<32-hex-task-id> --policy-id <active-policy-id> --worker-id local-paper-1 --max-rounds 3
```

The CLI requires an explicit loopback database URL and does not consult
`DATABASE_URL`. The bounded demo uses a task-owned `mm_paper_<32-hex-task-id>`
database. A bounded run may omit the interval and proceeds as quickly as the
local database allows, but it must specify `--max-rounds`. Continuous mode
omits `--max-rounds` and requires `--round-interval-ms` between 1000 and
86400000 (one second to one day); each committed synthetic contribution round
waits that long before the next round. There is no unbounded tight loop. A
continuous example is:

```sh
npm run paper:worker -- --database-url postgresql://postgres:postgres@127.0.0.1:55432/mm_paper_<32-hex-task-id> --policy-id <active-policy-id> --worker-id local-paper-1 --round-interval-ms 60000
```

Its input stream uses deterministic synthetic fixture prices and virtual
contributions; it has no provider, broker, exchange, or live-trading adapter. Round keys are
stable by policy, worker ID, and durable round ordinal. A restart continues at
the next committed ordinal. Concurrent processes using the same worker ID
converge on a round through the repository's policy lock, transaction, and
persisted idempotency hash. Each process executes one round at a time.

Worker lifecycle output (`RUNNING`, `WAITING_PAUSED`, `WAITING_INTERVAL`,
`COMPLETED`, `STOPPED`, `FAILED`) is separate from policy status. Each process
gets a random process-instance UUID and writes a separate row keyed by policy,
worker ID, and process instance. Heartbeats use the database server clock and
are committed outside settlement transactions; they do not change ledger,
risk checkpoints, or round idempotency. The worker refreshes liveness every 30
seconds. An active heartbeat older than 90 seconds is shown as `STALE`, which
is the documented bracketing window for abrupt process death. Normal exit is
stored as `ENDED`. Multiple instances remain visible independently, even when
they share a worker ID. A policy with no heartbeat rows remains `UNKNOWN`; old
rounds are not treated as liveness evidence. Heartbeat reads use the same
owner-scoped repeatable-read snapshot and RLS as the paper status view. The
additive `20261009090000_standing_paper_worker_heartbeats.sql` migration creates
the heartbeat table, per-instance key, owner-read policy, and authenticated
`SELECT` grant. It does not grant browser writes or alter the existing policy
or ledger tables.

A paused policy is polled without
writing until it becomes active or stopped. A stopped policy exits. Invalid
input, an invalid checkpoint, ledger divergence, or another persistence
failure emits a stable error code and ends the process without retry. Ctrl+C,
SIGTERM, or the wrapper's `:stop` control input requests a graceful stop over a
local token-protected loopback channel; the wrapper does not signal-kill its
worker child. Stop prevents entry into another round and interrupts interval
or paused-state waits immediately. An active database transaction is allowed
to settle before the repository closes. The wrapper waits for its child to exit
and then closes its control listener.

Run `npm run paper:worker:demo` for a bounded demonstration. It creates a
task-owned disposable PostgreSQL database, runs the complete standing paper
integration suite, provisions a synthetic PAPER account and policy, and runs
three worker rounds before verifying cleanup. The demo explicitly activates
its synthetic policy; normal worker startup never activates a policy.

Policy creation requires an empty, dedicated PAPER account. Each durable
decision round locks the policy row and then the `FinancialAccount` row, and
checks `ACTIVE` / `PAPER` / `NOK` on that locked account row before
reconciliation or writes. Policy transitions use the same lock order and
validate their account binding against the locked row. New ledger transaction
and entry writes take that same account-row lock through database triggers, so
writers using the shared ledger cannot change postings between reconciliation
and settlement. A writer bypassing the ledger tables or disabling those
triggers is outside this guarantee.
Inside that transaction it checks the run input hash, rejects contribution
event IDs already processed, evaluates only new events using saved ledger and
acquisition evidence, inserts run and decision records, creates simulated fill
evidence, writes contribution idempotency and audit records, appends balanced
transactions to the existing ledger, and updates the portfolio/risk checkpoint.
Any error rolls the whole set of writes back. Unique constraints add a second
idempotency barrier. Separate repository instances serialize on the same
policy row. Before each new round, the repository compares all account ledger
transactions and entries, fill acquisitions, net virtual capital, and
committed capital with the checkpoint and immutable last-run result. Missing,
extra, or changed postings stop the round. The checkpoint is a continuation
record, not itself ledger-derived. Drawdown high-water and last-processed time
are validated against the immutable last-run result because current balances
cannot independently reconstruct them. Previous contributions and fills are
restored from checkpoint; they are never passed through strategy or execution
again.

Migration `20261008120000_standing_paper_persistence.sql` adds policy state,
last-run linkage, acquisition evidence, account-row ledger locking, run
idempotency, contribution claims, decision records, and paper fill links.
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
- The task-owned PostgreSQL suite checks empty-account setup, external ledger
  divergence, strict checkpoint fields, resumption, idempotency, pause/stop,
  rollback, worker restart, concurrency, pause/resume, stop, and failure
  behavior. It also verifies owner-bound dashboard transitions, stale-status
  and double-click rejection, and that pause/stop wait for an in-flight worker
  transaction before blocking the next round. Its dedicated
  `standing-paper-postgres` CI job reports these checks separately from the
  ordinary unit suite.

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

## Status view and policy controls

The authenticated dashboard at `/dashboard/paper` reads the caller's own PAPER accounts and policies through a read-only, repeatable-read PostgreSQL snapshot. The API checks the authenticated user before querying account data, returns private `no-store` responses, and limits history to the latest 20 decisions and fills per policy. Stored policies, checkpoints, run results, decisions, fills, and acquisition evidence are validated before projection; corrupt or incomplete material is shown as such rather than silently repaired.

Displayed balances and portfolio values are the latest saved simulation snapshot, with its effective timestamp. They are not fresh market prices. The view labels the mode `PAPER_ONLY`, prices as synthetic, and fills as simulated. Worker status comes only from stored per-process heartbeat evidence. Missing evidence is `UNKNOWN`; active heartbeats distinguish `RUNNING`, `WAITING_PAUSED`, and `WAITING_INTERVAL`; old active heartbeats become `STALE` after 90 seconds; orderly exits remain `ENDED`. Completed rounds alone do not prove a worker is running.

The dashboard can pause an `ACTIVE` policy, resume a `PAUSED` policy, or stop a `DRAFT`, `ACTIVE`, or `PAUSED` policy. It does not create policies or offer first-time activation. Stop requires explicit confirmation and follows the domain's terminal `STOPPED` rule. Each command includes the exact policy ID and expected status. The server authenticates first, rejects cross-origin requests, and checks account ownership, policy state, account eligibility, and expected status in one transaction. It locks the policy row before the account row, matching paper-round and ledger-writer lock order. A second click or stale tab is rejected without another transition-history row. A round already holding those locks commits before pause or stop; later rounds observe the updated policy status. The private status read is refreshed after a confirmed transition. Transition history remains append-only.

The history query selects the latest 20 decisions and fills independently for each policy using row-number ranking in SQL. The additive status-read grants are defined in `20261008130000_standing_paper_status_read_grants.sql`; they provide `SELECT` only and leave the existing owner-scoped RLS policies in place. Snapshot `asOf` is validated against the saved final portfolio snapshot (or `config.endAt` when the run has no snapshots). The run creation timestamp, configured end time, and snapshot timestamp have distinct meanings and are not required to be equal.
