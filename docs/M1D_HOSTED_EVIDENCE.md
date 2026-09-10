# M1D hosted evidence — ROB-43

Verified 2026-09-10 against Money_Machine, project `flsfallpputejojncyue` only.
Simulation evidence only. No real-money integration, commitment, deployment, commit,
push, or M1E implementation was performed.

## Final requirement matrix

| Requirement | Hosted result and evidence |
| --- | --- |
| A. Rejected-decision enforcement | PASS. Persisted M1C REJECT/REJECTED decision with disabled-strategy risk violation; execution rejects with `not risk approved`. Zero executions, fills, settlement journals/entries, execution audits and execution idempotency records; account ledger balances unchanged. |
| B. Approved execution | PASS. APPROVED proposal creates exactly one FILLED execution, fill, settlement journal, audit and execution command. |
| C. Exact pricing | PASS. Pinned defensive fixture: reference 5000 price atoms, scale 4; +10 bps BUY gives 5005 atoms. |
| D. Fee | PASS. Gross 13514 NOK minor units; fee 100 minor units; total cash debit 13614 minor units. Fee expense is independently read from the ledger. |
| E. Full-or-none | PASS. Original proposal quantity 270000000 atoms is retained when available cash falls to 1000 minor units. Execution rejects with INSUFFICIENT_CASH; no resized quantity, fill, settlement entries or balance effect. |
| F. Settlement accounting | PASS. Cash 100000 - 13514 - 100 = 86386 minor units. Six journal entries independently sum to zero for NOK and zero for the asset commodity. Frozen decision reserve also tested after cash changes. |
| G. Ledger-derived asset quantity | PASS. ASSET_HOLDING ledger debit balance is 270000000 atomic units, matching the entire proposal and fill. No Position state is consulted. |
| H. Concurrent duplicate protection | PASS. Two simultaneous identical repository commands return the same canonical result; exactly one execution, fill, journal, acquisition effect and 100-minor-unit fee effect. |
| I. Same-proposal double settlement | PASS. A different execution key for an already settled proposal rejects; all settlement counts and balances remain singular. |
| J. Idempotent replay/conflict | PASS. Equal request returns the original result. Same key with a different execution timestamp rejects with `different input`. |
| K. Controlled rollback | PASS. Test-only interception runs the entire real repository transaction callback, confirms all six evidence counts inside that transaction (including audit), then throws. Outside the rolled-back transaction every execution count is zero and balances are unchanged. Reusing the same key subsequently succeeds exactly once. |
| L. Two-user RLS | PASS. Two independent controlled users each own funded, executed accounts. An authenticated database session sees its own evidence; both directions of cross-user reads return zero execution, fill, audit, settlement journal, ledger-entry and command rows. |
| M. Browser mutation denial | PASS. Sessions explicitly use `SET LOCAL ROLE authenticated` and the controlled user's subject claim; current role and auth.uid() are asserted. INSERT/UPDATE/DELETE attempts cover execution, fill, execution audit, ledger transaction and ledger entry tables. Inserts require permission/RLS denial (42501); UPDATE/DELETE require 42501 or zero affected rows. Every probe rolls back even if a write were unexpectedly accepted. |
| N. Append-only evidence | PASS. Privileged UPDATE and DELETE attempts on existing execution, fill, execution audit, ledger transaction and ledger entry rows raise append-only errors. Final settlement remains unchanged. |
| O. Network stability | PASS for this session. No ECONNRESET in any executed hosted run. Existing hostname-preserving IPv4 socket, TLS and pool behavior unchanged; no automatic retries added. Prior-session resets remain historical transport observations, not domain evidence. |
| P. Unit tests | PASS: 22/22, five files. |
| Q. Hosted integration tests | PASS: final full run 24/24, three files (M1B 8, M1C 5, M1D 11). One separate migration-bootstrap test intentionally skipped because the apply flag was off. Final run began 13:50:47 Europe/Oslo and completed in 62.31 seconds. Updated M1D suite also independently passed 11/11 in 64.01 seconds before the final full run. |
| R. Security Advisor | New M1D mutable-search-path warning fixed. Rechecked: only the existing project-level leaked-password-protection warning remains. |
| S. Performance Advisor | Informational only: 13 uncovered foreign keys project-wide (three M1D foreign keys) and one unused market-price index. No correctness/security blocker; no speculative index removals. |
| T. Typecheck/lint/build | PASS for all three final commands. |
| U. Remaining limitations | Simulation BUY path and fixture data only. RLS/browser-role checks exercise real hosted PostgreSQL authenticated sessions; they do not claim an end-to-end browser login or HTTP Data API test. Isolated simulation users and immutable test evidence are retained. Existing migration-bootstrap/history differences were not redesigned. |
| V. Financial-policy deviations | Two proven deviations corrected: frozen decision reserve input and the canonical execution version. No new policy or threshold was introduced and FINANCIAL_POLICIES.md was not changed. Older immutable development evidence retains its original recorded version/results; it is not final corrected-release evidence. This is an M1D check, not certification of later M1 features such as SELL/FIFO/valuation. |
| W. GO / NO-GO for M1E | GO on the M1D evidence gate. M1E was not started and remains a separate task. |

## Changes and regression evidence

- `tests/integration/m1d-execution.test.ts`: expanded one happy-path case to 11 independent hosted cases. Run UUID plus case labels isolate users, accounts, keys, decisions and proposals. Repository-generated command IDs are unique. Shared canonical market prices are read-only; the exact defensive record ID and atoms/scale are pinned, so no competing test price rows are introduced.
- `tests/financial/simulation-execution.test.ts`: unit regression for the canonical execution identifier and frozen reserve when available cash changes.
- `src/infrastructure/postgres/m1d-execution-repository.ts`: supplies persisted decision input cash as the existing M1C decision NAV to execution, instead of recalculating it from current cash. A hosted example with current cash 23000 and full debit 13614 must reject: 9386 remaining is below the original 10000 reserve, even though it exceeds a recomputed 2300 reserve.
- `src/domain/execution/simulation-execution.ts`: uses canonical `m1-market-execution/v1` for new execution/fill evidence.
- `supabase/migrations/20260910114532_m1d_immutable_search_path.sql`: pins `public.m1d_immutable()` to an empty search path. Hosted migration version verified; function configuration inspected; append-only behavior retested. No data or history rewritten.

The insufficient-cash/reserve fixtures reverse their seed using appended balanced
entries and linked audit/idempotency evidence, then make a smaller virtual deposit.
No production immutability trigger is disabled for setup or cleanup.

## Failure classification and run history

| Run / stage | Classification | Resolution |
| --- | --- | --- |
| CLI startup: PowerShell rejected npx.ps1 | C — local setup | Used the Windows npx.cmd executable. |
| CLI migration scaffold: registry EACCES inside sandbox | C — local setup/network permission | Approved escalated CLI call created the migration file. No production transport change. |
| First integration invocation | C — test setup, hosted guard off | All M1D cases skipped; counted as no hosted proof. Subsequent commands explicitly supplied both project authorization flags. |
| First nine-case M1D run: settlement helper, four cases | A — test assertion defect | PostgreSQL enum ordering differs from text ordering. Both commodity sums were zero. Explicit text ordering corrected the test; no financial change. |
| First nine-case M1D run: mutation/immutability probe table lookup, two cases | C — test query setup | Corrected schema-qualified Postgres.js identifier syntax; no application change. |
| Corrected nine-case M1D run | PASS | 9/9. |
| Initial combined M1B/M1C/M1D run | PASS | 22/22; bootstrap skipped. This preceded the two additional canonical-policy regressions. |
| Targeted frozen-reserve test | A — proven application defect | Execution incorrectly filled. Repository now uses the persisted decision input; targeted case and complete matrix subsequently passed hosted. |
| Targeted policy-version test | A — proven application defect | Stored execution/fill version differed from canonical policy. Corrected identifier; targeted case and complete matrix subsequently passed hosted. |
| Updated independent M1D run | PASS | 11/11. |
| Final combined M1B/M1C/M1D run | PASS | 24/24; bootstrap intentionally skipped. |

No unexpected B (PostgreSQL constraint) or D (connection reset/transport) failure
occurred. Expected constraint/permission/immutability rejections are positive test
evidence and are asserted by their intended error, rather than accepting arbitrary
exceptions. Failed/aborted runs are not substituted for the final successful run.

## Reproduction

Use the existing locally configured runtime environment without printing credentials:

```powershell
$env:MONEY_MACHINE_INTEGRATION_TEST='1'
$env:MONEY_MACHINE_INTEGRATION_PROJECT_REF='flsfallpputejojncyue'
npm.cmd run test
npm.cmd run test:integration
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

The migration apply flag stays off for evidence runs. The package integration
command loads the existing environment internally; no environment contents or
controlled user identities belong in logs or this report.

Advisor references: [mutable function search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
[existing leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection),
[unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
[unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

M1D STATUS: PASS
