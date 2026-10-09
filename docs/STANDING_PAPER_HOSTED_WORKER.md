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
