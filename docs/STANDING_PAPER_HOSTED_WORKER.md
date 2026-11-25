# Avgrenset hosted PAPER_ONLY-worker

`paper:hosted-worker` is a separate opt-in entrypoint for an explicitly named
Supabase project, standing-paper policy, and FinancialAccount. It is not used
by `paper:worker` or either local demo. The existing local CLI still accepts
only loopback PostgreSQL; the local disposable test/demo runner still requires
its task-owned `127.0.0.1/mm_paper_<random-id>` database.

The hosted CLI requires all of these arguments; none has a product default:

```sh
npm run paper:hosted-worker -- \
  --project-id <supabase-project-ref> \
  --policy-id <active-paper-policy-id> \
  --account-id <paper-financial-account-uuid> \
  --worker-id <stable-logical-worker-id> \
  --initial-capital-nok 200.00 \
  --max-rounds 3 \
  --round-interval-ms 60000
```

The connection string is read only from `DATABASE_URL` in the process
environment. It is never accepted as an argument, read from dotenv files, or
printed. The URL must be TLS PostgreSQL and bind to the explicit project ref:
either `db.<ref>.supabase.co`, or a Supabase pooler host with the exact
`postgres.<ref>` username. Local addresses and mismatched project refs fail
before a database connection is opened.

Before creating a heartbeat or starting a round, the entrypoint validates the
explicit policy/account binding in one read-only repeatable-read snapshot. The
heartbeat transaction then locks policy followed by account and repeats the
target, owner, ACTIVE/PAPER/NOK, policy-limit, and checkpoint checks before its
first write. It requires the account's existing auth user, ACTIVE/PAPER/NOK account state,
ACTIVE `standing-paper-policy/v1` policy, PAPER_ONLY mode, supported synthetic
fixture instruments, valid persisted limits, requested initial capital no
greater than the capital budget, and checkpoint-to-ledger/fill reconciliation.
Each settlement transaction repeats the authoritative policy/account checks
under the repository's policy-then-account lock order. Dashboard PAUSE blocks
the next settlement and waits; STOP exits before another round.

The initial contribution is explicit decimal NOK converted directly to minor
units. A policy-scoped event ID and contribution hash make the 200.00 NOK seed
atomic with the first worker round, ledger, checkpoint, decisions, and fills.
Policy locking serializes competing process instances. A changed amount for an
already recorded seed is rejected. The first seed requires an empty checkpoint;
restarts and later rounds do not add capital. Later rounds use a strategy
evaluation timestamp against existing cash and holdings, not a deposit event.
Hosted round ordinals are policy-scoped so worker ID changes cannot move the
synthetic timeline backward. Reuse the same worker ID to identify one logical
worker across restarts.

The CLI permits at most three rounds per invocation and requires a validated
interval. `Ctrl+C`, SIGTERM, or a `:stop` line on stdin stops entry to new rounds;
an active transaction is awaited before heartbeat termination and connection
close. Heartbeat status uses database time and remains separate from the
settlement transaction. Output explicitly labels the run `PAPER_ONLY`, prices
as synthetic fixtures, and fills as simulated. There is no broker, exchange,
market-data provider, or LIVE mode.

Tests use only the task-owned disposable local PostgreSQL runner and synthetic
prices. No hosted credentials, hosted migration, or hosted worker execution is
needed for tests. This implementation does not create or apply a migration;
it relies on the standing-paper and worker-heartbeat schema already present in
the migration chain. A review of whether those migrations are deployed remains
separate from code review. Merging this PR must not be treated as permission to
start the hosted worker.

## Stored cycle-v2 policy behavior

The hosted entrypoint does not accept exit-policy arguments. It reads cycle-v2 and FIFO versions plus stop-loss, take-profit, and maximum holding time from the active policy JSON that was reviewed and explicitly activated by its owner. A v1 policy without cycle configuration remains BUY-only. No migration or automatic conversion is performed by this code. The hosted preflight validates the complete stored cycle configuration and verifies the cycle-v2 schema before creating a heartbeat. Missing schema or invalid configuration fails closed before heartbeat or settlement writes.

## Cycle-v2 hosted acceptance plan

### Checkpoint 2026-11-25

PR #90 is merged and its post-merge checks were green. Local acceptance passed with one 66.46 NOK virtual contribution, BUY, stop-loss SELL, two rejected rebuys at the 20.00 NOK loss cap, and 46.46 NOK closing cash. The separate 200.00 NOK loss-cap regression passed across multiple cycles, including FIFO and checkpoint reconciliation, restart, and idempotent replay. The local test runner verified cleanup of its disposable PostgreSQL resources.

Hosted acceptance is approved and pending. Read-only Supabase checks confirmed Money_Machine project `flsfallpputejojncyue` was healthy and had 39 registered migrations. The two repository migrations absent from that history were SEC provenance and cycle-v2. The subsequent local prerequisite check found no `.env.local` in the project root. The hosted database URL could therefore not be loaded or validated, and the CLI dry-run did not run. No hosted migration, dedicated account, policy creation or activation, or worker run took place. Existing v1 data and SEC pins were untouched.

On the workstation with the project-root `.env.local`, load `DATABASE_URL` with a BOM-compatible dotenv parser in process memory and verify its binding to `flsfallpputejojncyue`. Prepare an isolated migration directory with byte-for-byte verified copies of the 39 applied migrations plus `20261009151100_standing_paper_cycle_execution.sql` from the pinned source. Keep the SEC migration outside that directory. Run the actual CLI dry-run and proceed only if it lists that one cycle-v2 migration. Then verify schema, RLS and grants, create the dedicated account and DRAFT, review and activate it within the approved scope, and run the worker once with at most three rounds at 60-second intervals. Record the observed results and complete the checks below.

### Source binding and acceptance procedure

Merge commit `f6465fe39f21eb4a8ebb65dfac34ef5781c7de45` was fetched from GitHub. Both it and the locally tested PR head `036ec04c504f91b5aad05ffebeb58d89792b4a3b` resolve to root tree `94d3bd01856c10a212e87bffe6712a285745c52d`. The commit-to-commit diff was empty, so the local acceptance evidence applies to the merged source and no rerun was needed. [PR #90](https://github.com/RobertKilli/Money_Machine/pull/90)

The latest local Docker PostgreSQL run applied 41 migrations and passed 40 tests, including both cycle-v2 scenarios. It skipped the three tests gated on pre-cycle mode. Earlier separate PostgreSQL evidence reports four targeted compatibility checks passing with the cycle-v2 migration omitted. See [PR #90 validation](https://github.com/RobertKilli/Money_Machine/pull/90) and [PR #89 validation](https://github.com/RobertKilli/Money_Machine/pull/89).

The following steps describe the approved hosted run.

1. Verify the target and its existing migration prerequisites. The only migration proposed for application is [`20261009151100_standing_paper_cycle_execution.sql`](../supabase/migrations/20261009151100_standing_paper_cycle_execution.sql). If any prerequisite is missing, stop and review it separately.
2. Create a dedicated, empty, owner-scoped PAPER/NOK account and a new PAPER_ONLY DRAFT policy on that account. Review the stored cycle configuration and limits below before activating the policy.
3. After authorization and activation, target the exact project, account and policy with a stable logical worker ID. Pass `--initial-capital-nok 66.46` and bound the run to three rounds. Use synthetic fixture prices.

| Setting | Hosted acceptance value |
| --- | --- |
| Virtual start capital | 66.46 NOK |
| Capital budget, position cap and gross exposure cap | 200.00 NOK each |
| Per-order cap | 100.00 NOK |
| Loss cap | 20.00 NOK |
| Allowed instrument | `mm.fixture.global.v1` |
| Maximum price age | 1 hour |
| Stop loss, take profit and maximum holding time | 20%, 10% and 5 days |
| Cycle, FIFO and exit versions | `standing-paper-cycle/v2`, `fifo-cost-basis/v2`, `standing-paper-exit-policy/v1` |

Expect a BUY in round one, a `SELL_STOP_LOSS` in round two, and `LOSS_LIMIT_EXCEEDED` on attempted rebuys in rounds two and three. The fixture records 20.00 NOK realized loss, 21.03 NOK projected loss with a rebuy, and 46.46 NOK ending cash.

After the run, verify one policy-scoped capital binding for 66.46 NOK, one BUY and one SELL fill, and three ledger journals. Reconcile FIFO consumption against the BUY lot including its fee, and reconcile the ledger with the checkpoint for cash, holdings, contributions and realized result. Verify the next durable round index is 3 and inspect the heartbeat for the intended policy, account and worker, including its terminal state after the bounded run.

The separate local multi-cycle regression used a 200.00 NOK loss cap and the same 66.46 NOK seed. It passed `BUY → SELL/BUY → SELL/BUY`, FIFO reconciliation, rejection of a tampered FIFO checkpoint, and idempotent replay across restart. The hosted acceptance loss cap is 20.00 NOK.
