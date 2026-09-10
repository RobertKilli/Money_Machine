# M2 backtest readiness and evidence — ROB-46 / ROB-47

Date: 2026-09-10. Authorized hosted project: Money_Machine
(`flsfallpputejojncyue`) only.

M2 STATUS: PASS

The prerequisite conflict was resolved in ROB-48. This document now records the
implemented pure replay engine and ROB-47 hosted non-mutation evidence below.

## Why replay implementation stopped

The requested replay protocol freezes post-contribution portfolio NAV/state before
Strategy → Risk → Execution. Section 5 of the canonical
[FINANCIAL_POLICIES.md](FINANCIAL_POLICIES.md) requires:

- Strategy gaps based on post-deposit NAV minus existing holding value.
- A reserve of CEILING(decision NAV × 1000 / 10000).
- Risk evaluation of resulting asset allocation, including existing holdings.

The current M1 implementation has different behavior once holdings exist:

1. [ContributionRebalancingInput and contributionRebalancing](../src/domain/strategy/fixture-assets.ts)
   accept cash, assets and prices, but no held-portfolio state or decision NAV.
   The reserve uses cash, and proposals allocate 60/25/15 of deployable cash
   without subtracting existing holding values.
2. [RiskContext and assessProposal](../src/domain/risk/m1-risk.ts) accept decision
   NAV but no existing asset values. The allocation cap compares only proposed
   notional against NAV, excluding existing exposure.
3. [The live M1C application](../src/application/decisions/evaluate-contribution-rebalancing.ts)
   passes available cash as decision NAV. [The M1D repository](../src/infrastructure/postgres/m1d-execution-repository.ts)
   reads strategy_decisions.input_cash_atoms as decision_nav_atoms for execution.
   Cash equals NAV only in the cash-only starting case, not after fills.

The functions are already callable without PostgreSQL, so this is not merely a
coupling problem that a state adapter can solve. An adapter cannot supply holdings
to an engine that does not accept or use them. Replacing the cash field with NAV
would also misrepresent spendable cash. Implementing the missing allocation/risk
rules only in the backtester would create the prohibited financial-rule fork.

## Implemented replay and validation

`src/application/backtest/run-deterministic-backtest.ts` implements
`backtest-replay/v1`. It canonicalizes explicit contributions and valuation
timestamps, pins every policy and the market dataset, derives deterministic IDs,
and runs Strategy, Risk, execution, isolated double-entry settlement, and
`projectPortfolio` in that order. Contributions sort before valuation-only events
at the same timestamp; all prices satisfy `availableAt <= T` and the pinned
dataset boundary. No `Date.now()`, random UUID, hosted write, or live repository
state is used by authoritative replay.

Tests cover reproducibility, future-row exclusion, unsupported versions,
deterministic IDs/config hashes, exact M1D fees/pricing, multi-commodity journal
balancing, valuation-only events, and ending projection reconciliation. ROB-47
hosted safety snapshots authoritative table counts before and after a controlled
pure replay; counts are identical. The full hosted M1B–M1E suite passes 33/33
executed tests (one intentional skip), and the hosted safety test passes.

No M2 schema or persistence was introduced. Advanced performance metrics remain
outside the frozen financial policy and are intentionally absent.

Replaying the current live cash-only inputs and replaying the frozen held-portfolio
policy would produce different results under the same policy identifiers. The user
explicitly required stopping on a conflict with frozen policy. No silent choice
between those meanings was made, and no existing M1 policy or engine was changed.

## Reproducible failing policy probes

Added [m2-policy-readiness.test.ts](../tests/diagnostics/m2-policy-readiness.test.ts)
and [vitest.m2-readiness.config.ts](../vitest.m2-readiness.config.ts).
They use deterministic synthetic ledger/fill fixtures, the actual M1E projection,
and the actual M1 strategy and risk functions. No PostgreSQL, wall clock, random IDs,
network or live account is used.

Run explicitly:

```powershell
npx.cmd --no-install vitest run --config vitest.m2-readiness.config.ts
```

Result: **3/3 policy-conformance tests fail**, with these actual differences:

| Probe | Frozen policy expectation | Actual M1 result |
| --- | --- | --- |
| Cash 10000, holdings 100000, NAV 110000 | Reserve 11000; no deployable cash | Reserve 1000 |
| Cash 60000, GLOBAL holding 140000, NAV 200000 | GLOBAL target 120000; no additional GLOBAL BUY | Proposes GLOBAL BUY with reference notional 32400 |
| Same portfolio and GLOBAL proposal | GLOBAL already exceeds cap 130000; Risk REJECT with allocation violation | Risk APPROVE |

Values are NOK minor units. Quantities/prices use the frozen synthetic scale.
The input portfolio is COMPLETE and reconciles through M1E before the assertions.
The third probe supplies the correct full NAV to Risk and still reproduces the
missing-existing-exposure defect.

These are deliberately failing conformance diagnostics, separate from the existing
M1 regression command. They are not skipped tests and not positive M2 acceptance
evidence. The ordinary `npm run test` result below is only the existing M1 suite;
it must not be interpreted as overriding this failing readiness gate. When the
shared engine ports are corrected, the diagnostics must be wired to those explicit
portfolio-state inputs and made green, not weakened to match cash-only behavior.

## A–AA acceptance report

| Item | Status / finding |
| --- | --- |
| A. Baseline inspected | M0–M1E policy/evidence, current strategy, risk, execution, ledger, projection, application/repository paths and test configurations inspected. M1D/M1E historical PASS reports are preserved. New probes identify a coverage gap in held-portfolio strategy/risk conformance. |
| B. Replay architecture | Not implemented because of the prerequisite conflict. Intended architecture remains pure orchestration → existing engines → isolated in-memory journal → existing projection. |
| C. Explicit run configuration | Not implemented. Required timestamps, contribution events, valuation timestamps and explicit policy/dataset references remain the requested contract; no cadence/default capital was invented. |
| D. Replay clock/event ordering | Not enacted as backtest-replay/v1. The requested post-contribution NAV/state step cannot be reconciled with existing live cash-as-NAV inputs without correcting shared M1 behavior. Same-time tie handling is not falsely claimed as frozen or tested. |
| E. Historical market access | Existing latestAvailablePrice ordering is availableAt, observedAt, recordId descending. An M2 temporal-only interface has not been implemented. |
| F. No-look-ahead | Existing M1 tests remain regression evidence only. No positive M2 proof that future rows cannot alter earlier replay output exists yet. |
| G. Strategy reuse | Pure function is reusable in form, but its held-portfolio semantics conflict with the canonical policy. No BacktestStrategy was created. |
| H. Risk reuse | Pure function is reusable in form, but existing exposure is absent from the allocation check. No backtest-only risk fix or veto bypass was created. |
| I. Execution reuse | Existing executeSimulationBuy retains +10 bps BUY adjustment, exact settlement/fee rounding, minimum fee and full-or-none validation. No duplicate execution math was created. Decision NAV provenance must first be reconciled in shared inputs. |
| J. Isolated ledger | Existing ledger transaction constructors and multi-commodity balancing primitives identified for reuse. No scratch FinancialAccount or M2 ledger adapter created. |
| K. Portfolio reuse | Actual projectPortfolio is reused in the conflict probes; no valuation math is reimplemented. Replay snapshots are not implemented. |
| L. Version pinning | Canonical identifiers identified below. No runtime run-config pin validator exists yet. |
| M. IDs/config hashing | Not implemented; no positive canonicalization or deterministic run-ID claim. |
| N. Reproducibility | The three prerequisite failures reproduce from fixed pure inputs. This does not prove reproducible completed backtests. |
| O. Capital/contributions | No implicit starting balance or recurrence introduced. Probe capital is explicit synthetic fixture evidence, not a backtest run or live contribution. |
| P. Performance metrics | No frozen return/risk-adjusted/drawdown metric formulas found. Metrics omitted; decisions needed are listed below. This omission alone would not block replay foundation PASS. |
| Q. Application path | RunDeterministicBacktest not implemented pending prerequisite resolution. |
| R. Persistence | No backtest tables, schema migration, persisted run, cache or other hosted M2 artifact. |
| S. UI | No M2 UI added; engine-first boundary preserved. Existing dashboard unchanged. |
| T. Unit tests | Existing 57 M1 tests pass. Three separate new M2 policy-readiness probes fail. The requested 30-case replay matrix is not implemented or passed. |
| U. Hosted safety | M1B–M1E regressions rerun. M2 before/after live-state non-mutation proof is NOT PERFORMED because no backtest command exists. A nonexistent replay path is not claimed as positive isolation proof. |
| V. Security/RLS | No M2 security surface or database networking change. Existing hosted RLS/mutation regression coverage remains applicable to M1 only. |
| W. Advisors | No new schema/security change requiring a new advisor run. Latest observed project findings from the M1E session are recorded below with their date; they are not presented as a fresh M2 advisor run. |
| X. Quality gates | Baseline results and separate readiness failure recorded below. Green M1 gates do not make M2 PASS. |
| Y. Files changed | This evidence report, tests/diagnostics/m2-policy-readiness.test.ts, vitest.m2-readiness.config.ts only. |
| Z. Remaining gaps | Shared M1 held-portfolio semantics, then all replay implementation/acceptance and hosted non-mutation proof. Advanced metrics remain outside frozen policy. |
| AA. M3 | NO-GO. M2 has not passed. |

## Policy identifiers and metric findings

The canonical risk identifier is **m1-risk-policy/v1**, not the shorthand
`m1-risk/v1` in the request. The source constant and FINANCIAL_POLICIES agree.
A future replay validator should pin the canonical identifier and reject unsupported
values; no alias or silent substitution has been introduced.

Identified existing versions:

- contribution-rebalancing/v1
- m1-risk-policy/v1
- m1-market-execution/v1
- m1-spread-slippage/v1
- m1-fee/v1
- m1-rounding/v1
- portfolio-valuation/v1
- fifo-cost-basis/v1
- fixture-asset-registry/v1
- mm-fixture-market-data/v1

`backtest-replay/v1` remains the requested future protocol identifier. It is not
added to the canonical registry as though implementation or acceptance had passed.

Before any performance-statistics implementation, explicit policy must define:

- Return definition and contribution timing/treatment: simple change, time-weighted
  or money-weighted; treatment of initial, intermediate and terminal cash flows.
- Annualization: year/day convention, elapsed-time basis, nonpositive NAV and zero
  denominator handling, precision and rounding.
- Drawdown: cash-flow adjustment, peak definition, eligible sampling timestamps,
  peak/trough tie handling and incomplete valuations.
- Volatility/Sharpe/Sortino: return series, sample versus population estimator,
  sampling/annualization factors, risk-free or minimum acceptable rate and downside
  deviation definition, precision and missing observations.
- Benchmark/alpha/beta: versioned benchmark dataset, aligned availability, currency,
  fees, dividend/reinvestment assumptions, window and regression conventions.
- IRR: dated cash-flow sign convention, root selection/nonexistence, numerical
  precision and convergence rules consistent with the no-floating-authority rule.

None were invented. Raw cash, holdings, contributed amounts and NAV can eventually
be exposed with their existing semantics without labeling them as a return.

## Quality gates and failure classification

| Command | Result |
| --- | --- |
| npm run test | PASS — 57/57 tests, 7 files |
| npm run test:integration | PASS — 32/32 M1B–M1E tests in 4 suites; 1 guarded migration-bootstrap test intentionally skipped |
| npm run typecheck | PASS |
| npm run lint | PASS |
| npm run build | PASS — Next.js production build |
| Explicit M2 readiness command above | FAIL — 3/3 canonical held-portfolio conformance assertions |

The hosted run began at 19:03:41 Europe/Oslo on 2026-09-10 and completed in 121.69
seconds with no test failure. It preserves the existing M1 regression baseline;
it is not M2 replay or non-mutation acceptance evidence.

The readiness failures are **A: domain/policy-conformance assertions**. They are not
PostgreSQL constraints, fixture setup failures or network errors. The first local
npx invocation was blocked by PowerShell execution policy; the explicit npm.cmd/npx.cmd
invocations ran outside that restriction. No financial algorithm was changed to
make tests green. A Vite warning about extensionless config imports does not affect
the three executed assertions.

The baseline hosted integration command uses the existing guarded environment
loader plus explicit MONEY_MACHINE_INTEGRATION_TEST=1 and project reference.
Normal M1 integration suites create their established isolated simulation validation
fixtures. No M2 run writes, scratch accounts or M2 validation identities were added.
No credentials, environment-file contents, tokens or user email values were printed.

## Known advisor state

Most recent observed advisor run: 2026-09-10, during M1E verification in this session.
It returned one existing project-level
[leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
and 13 informational
[unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
No new M2 hosted schema/security surface exists. Advisors were not rerun merely to
produce an M2 artifact, and no advisor configuration/index change was made.

## Required prerequisite and scope

Reconcile the shared M1 strategy/risk inputs and the live decision-NAV provenance
with FINANCIAL_POLICIES section 5, with explicit held-portfolio regression tests.
This needs shared-engine correction and revalidation, not a backtest-only adapter
that silently supplies alternative financial semantics. Preserve immutable historical
records and make the version/release treatment of the correction explicit.

After that prerequisite, implement the isolated replay foundation and its complete
pure/hosted matrix. Advanced metrics may remain omitted. No M2 acceptance requirement
is waived by the current green M1 regression suite.

No existing financial code/policy, networking, hosted schema or dashboard was changed.
No commit, push, deployment, live-money integration, M3 work or Linear issue/message
update was performed.

M2 STATUS: BLOCKED
