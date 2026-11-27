# PAPER profit allocation: record-only persistence

Implementation baseline: `1c5d85f2dc0583e17acd10c75bd630c50f0db8e5`.
Calculation contract: `paper-profit-allocation/v1`.

This optional backend profile records profit entitlements for new cycle-v2
policies on dedicated, initially empty PAPER/NOK accounts. It is explicitly
`RECORD_ONLY`. The existing worker can still spend cash represented by a
calculated reserve: reserve spending enforcement has **not** been implemented.
Recorded reserve amounts are neither segregated cash nor withdrawal balances.
No existing account or active policy receives allocation terms automatically.

The formulas, fees, loss recovery and cumulative rounding remain those in
[Financial Policies, section 10](FINANCIAL_POLICIES.md#10-opt-in-paper-profit-allocation-paper-profit-allocationv1).
This implementation changes neither FIFO nor order/risk rules. It does not add
bank deposits, withdrawals, customer fees, corrections or reserve releases.

## Approval and scope

`StandingPaperPolicy.profitAllocationConfiguration` contains exactly:

- `version: "paper-profit-allocation/v1"`
- `recordingMode: "RECORD_ONLY"`
- an explicit boolean `enabled`
- BigInt `reinvestmentBps` from 0 through 10,000

The normal DRAFT confirmation hash covers the complete policy, including these
terms. A separate `paperProfitAllocationConfirmationHash(policy, ownerId)` binds
the owner, account, policy identity, currency, ratio, enabled flag and record-only
mode. JSONB key ordering does not change either confirmation.

`createOwnedDraft()` requires the existing owned ACTIVE/PAPER/NOK account checks
and no ledger activity or prior policy. `activateOwnedDraft()` requires both the
full DRAFT hash and this separate profit-terms hash for opted-in policies. It
locks policy then account, verifies the current owner and status, and writes
the immutable terms, status and transition history in one transaction. Failure
rolls back all three. Activation refuses accounts with existing run or ledger
history; history cannot be restarted to erase losses.

The existing dashboard creation/activation API is not extended in this slice.
It cannot supply the additional confirmation for configured policies. A later
UI must explain record-only semantics and obtain separate explicit consent.
Generic repository activation cannot bypass the owner-bound approval method.
Approved terms cannot be edited, removed or added to an existing active policy.
Changing terms or carrying reserve/loss history to another policy needs a later
versioned contract.

## Transaction boundary and evidence

`run()` reconciles the authoritative account ledger, fills and checkpoint using
the existing FIFO checker. Sale inputs are reconstructed from all validated
disposals, SELL fills and their exact ledger/run bindings, not from caller
profit amounts. The complete account SELL journal set must match. Ordering is
execution time followed by fill ID, matching FIFO reconstruction; sequence
numbers start at one.

The repository recomputes the pure model and verifies every existing stored
allocation against its terms, settlement, fill, run, sequence, input hash,
allocation hash and exact amounts. A conflicting row or history gap fails
closed. Only a missing tail may be appended by the recording path; existing
rows are never silently repaired. Replay and hosted preflight require the
entire allocation history to be present.

New sale allocations are written in the same policy/account-locked transaction
as simulated fills, balanced ledger settlements and checkpoint. An allocation
failure rolls back that round's financial writes. Each account/policy sale,
fill and sequence has a unique database binding, so concurrent recorders and
replay cannot double-allocate. Restart reconstructs high-water marks, losses
and entitlements from the full reconciled history instead of zeroing them.

`recordProfitAllocationOwned(actorId, policyId)` exposes owner-bound backend
recording/replay under the same lock order. It accepts no client-supplied
settlement amounts. Its return value remains the pure `MODEL_ONLY` projection;
repository reconciliation establishes stored provenance, not cash segregation
or trading authority. No HTTP endpoint is added.

## Schema and compatibility

`20261127120000_standing_paper_profit_recording.sql` adds:

| Table | Purpose |
| --- | --- |
| `standing_paper_profit_terms` | Immutable owner/account-scoped approval, exact terms and confirmation hashes |
| `standing_paper_profit_allocations` | Append-only per-sale evidence, cumulative realized P&L, profit peak and reserve entitlement |

Foreign keys and a trigger bind allocations to actual SELL fills and simulated
SELL ledger settlements. RLS permits authenticated reads through current
FinancialAccount ownership. Anonymous access and authenticated writes are
revoked; privileged writes remain behind the repository checks. Hashes detect
reconstruction mismatches; they are not protection against a database
administrator rewriting all evidence.

The migration is not applied to hosted databases by this implementation. An
unconfigured v1/v2 policy still works without the profit migration. Opted-in
creation, activation, preflight and execution require both profit tables and
the cycle-v2 schema before writes. Applying the profit migration without the
cycle migration preserves unconfigured v1 compatibility; its SELL trigger is
only evaluated when an allocation is inserted.

## Verification commands

```sh
npx vitest run tests/financial/paper-profit-allocation.test.ts tests/financial/paper-profit-recording-terms.test.ts
npm run test:standing-paper:postgres
npm run test:standing-paper:postgres -- --pre-profit-v1
npm run test:standing-paper:postgres -- --pre-cycle-v1
```

The database harness requires Docker and uses only its disposable loopback
database. The normal suite requires the six new approval, restart/concurrency,
activation rollback, allocation rollback, tamper/replay and owner-RLS cases to
pass, rather than accepting skipped assertions. Compatibility probes omit the
named migration and confirm the required targeted cases. Test-only privileged
tampering bypasses append-only triggers to verify detection; application code
does not disable those controls.

Reserve-backed spending, dashboard consent/display and any hosted application
are separate next steps. Synthetic test profits are not investment results.

## Local patch verification, 2026-11-27

The unit suite passed with 2,056 tests and 36 existing skips. Typecheck, lint
and production build passed. Docker was unavailable in the implementation
environment, so the actual integration test file ran against disposable native
PostgreSQL 17.12 on loopback with the same bootstrap and repository migrations:

- Full-schema selection: 42 migrations, 45 tests passed, 5 skipped. This included
  all six new profit cases. The existing actual-CLI control-channel test was
  excluded because this environment disallows the Unix IPC socket used by tsx;
  the other skips were compatibility-mode cases.
- Without the profit migration: 41 migrations, the targeted legacy/opt-in
  compatibility case passed; 49 unrelated cases were not selected.
- Without the cycle migration: 41 migrations, all four targeted compatibility
  cases passed; 46 unrelated cases were not selected.

Each native test server was stopped and its temporary database cluster removed
and verified absent. These results do not claim a Docker-harness run or CI on
this patch. Run the commands above in the review environment before publishing.
No hosted database or external provider was contacted.
