# M1E hosted evidence — ROB-44 / ROB-45

Verified 2026-09-10 against the authorized Money_Machine Supabase project
`flsfallpputejojncyue`. Simulation and synthetic fixture evidence only.

M1E STATUS: PASS

## Policy and implementation

The valuation blocker is resolved. The canonical
[financial policy](FINANCIAL_POLICIES.md) explicitly records
`portfolio-valuation/v1`: aggregate the complete ledger holding, multiply by the
eligible scaled price with integer arithmetic, then FLOOR once per holding to
base-currency minor units. NAV sums cash and those rounded holding values.
Unrealized P&L subtracts fee-inclusive open BUY basis under the unchanged
`fifo-cost-basis/v1`. Asset and cash weights FLOOR independently; residue remains
explicit. Missing prices leave dependent totals unknown.

The existing M1E design is implemented in:

- [Pure PortfolioProjection](../src/domain/portfolio/portfolio-projection.ts):
  deterministic on-demand reconstruction, decimal-string outputs, bigint financial
  calculations, separate valuation/integrity states, source fingerprint and IDs.
- [Application read](../src/application/portfolio/get-portfolio-projection.ts):
  requires an authenticated actor and preserves ownership failures.
- [PostgreSQL read repository](../src/infrastructure/postgres/portfolio-read-repository.ts):
  owned simulation account, repeatable-read/read-only transaction, authenticated
  database role and subject claim, temporal ledger/fill selection, eligible price
  selection and exact numeric-to-text boundaries.
- [Dashboard](../src/app/dashboard/page.tsx) and
  [portfolio view](../src/components/portfolio-view.tsx): server-authenticated,
  dark-first summary cards, holdings, historical cutoff, price evidence, incomplete
  states and SIMULATION ONLY presentation. Portfolio reads never provision accounts
  or execute monetary commands. Existing simulation command controls remain explicit
  actions separate from the portfolio read operation.

No Position table, projection persistence, cache, materialized view or M1E schema
migration was introduced. A hosted catalog query found no public table whose name
contains position, portfolio or projection. There is consequently no cache
invalidation or persisted-projection rebuild dependency.

Acquisition evidence with an unsupported execution policy now fails integrity
validation and cannot produce verified cost basis or NAV. Its regression test passes.

## Hosted acceptance matrix

The eight tests in [m1e-portfolio.test.ts](../tests/integration/m1e-portfolio.test.ts)
passed against hosted PostgreSQL through the real application/read repository.

| Requirement | Result and evidence |
| --- | --- |
| Authoritative cash and quantity | PASS. Independent SQL ledger sums match projected CASH and ASSET_HOLDING atoms. Clearing and monetary cost/fee accounts are not counted as holdings or extra market value. |
| Multiple BUY fills | PASS. Two separate approved decisions/executions create two immutable fills for one asset. Projection aggregates their ledger quantity into one holding. |
| FIFO/open BUY basis | PASS. Lots derive from immutable fills, ordered by acquisition timestamp then fill ID. All BUY quantities remain open; basis sums executed notional plus BUY fees. No SELL or realized P&L is invented. |
| Historical reads | PASS. Captured cutoffs before execution, after the first fill and after the second fill return the respective cash-only, one-fill and two-fill states. Ledger requires both occurred_at and recorded_at at/before cutoff; execution/fill evidence requires effective and recorded timestamps at/before cutoff. |
| Eligible price and provenance | PASS. PostgreSQL selects by available_at, observed_at and ID descending with available_at <= asOf, matching dataset and currency. Projection exposes selected price ID, atoms, scale, availability and dataset version. |
| Future price exclusion | PASS. A persisted future fixture record with price 999999 is excluded at the earlier captured cutoff. The selected eligible record remains 1c000000-0000-4000-8000-000000000013. |
| Exact arithmetic | PASS. Cash, quantity, market value, basis, NAV, unrealized P&L and weights reconcile to integer expectations below; the two-fill case independently sums hosted fill evidence. |
| Missing price | PASS with controlled read-boundary fault injection over real hosted ledger/fill evidence. Empty and future-only price inputs return INCOMPLETE, null market value/NAV/P&L and preserved known cash/basis. No historical shared price is deleted or rewritten. |
| Inconsistent evidence | PASS with controlled read-boundary fault injection. Removing acquisitions from real hosted evidence produces explicit ledger/fill mismatch and unknown basis/NAV. |
| Zero investment | PASS. Funded cash-only and unfunded empty accounts return complete valuations; zero NAV has no allocation denominator. |
| Rebuild/replay | PASS. Identical hosted source evidence and fixed cutoff yield deeply equal projections, including source fingerprint and provenance. Reads reconstruct directly from evidence every time. |
| Account isolation | PASS. User B cannot load User A's account and vice versa; each owner's accessible provenance is account-scoped. Reads execute under the authenticated role with the verified actor's subject claim. |
| No read-path writes | PASS. The actual repository transaction reports read_only=on, repeatable read and authenticated role. Attempts to UPDATE ledger, fills, executions and prices fail with PostgreSQL 25006 even after test-only role elevation to postgres. |
| Protected financial evidence | PASS in the full M1B–M1D regression suite. Direct browser-role INSERT/UPDATE/DELETE probes are denied on ledger/execution/fill/audit tables; privileged historical mutation probes fail append-only checks. M1C decision ownership/write protection also passes. |

Read-boundary fault injection is explicitly distinguished from SQL price filtering:
missing-price and inconsistent-acquisition cases use hosted source evidence with a
controlled replacement repository; future-price SQL exclusion exercises the real
PostgreSQL repository against a persisted future record.

### Exact hosted single-fill example

All monetary values below are NOK minor units, not floating-point decimals.
Quantity and price scales are both 4.

| Value | Verified result |
| --- | ---: |
| Initial virtual deposit | 100000 |
| BUY quantity atoms | 270000000 |
| Executed notional | 13514 |
| BUY fee | 100 |
| Ledger cash | 86386 |
| Open BUY basis | 13614 |
| Selected eligible price atoms | 5500 |
| Holding market value: FLOOR(270000000 × 5500 / 100000000) | 14850 |
| NAV: 86386 + 14850 | 101236 |
| Unrealized P&L: 14850 − 13614 | 1236 |
| Asset weight: FLOOR(14850 × 10000 / 101236) | 1466 bps |
| Cash weight: FLOOR(86386 × 10000 / 101236) | 8533 bps |
| Undistributed rounding residue | 1 bps |

The 5500 valuation price is legally available at the September read cutoff. The
acquisition retains its earlier frozen execution evidence; valuation does not
replace execution notional with current market value.

## Required rounding tests

[Portfolio unit tests](../tests/financial/portfolio-projection.test.ts) explicitly
prove every requested boundary:

1. Exact minor-unit market value.
2. Fractional minor-unit market value floors.
3. Aggregated holding rounds once, not per lot.
4. Equivalent one-fill and multiple-fill holdings have identical market value.
5. NAV sums individually rounded holdings, rather than rounding an unrounded total.
6. Unrealized P&L uses the rounded holding value.
7. Asset allocation uses FLOOR bps.
8. Allocation residue is not redistributed.
9. Cash weight uses the same FLOOR rule.
10. Future prices are excluded.
11. Missing prices return INCOMPLETE with unknown dependent totals.
12. BUY fees are included in open cost basis.

Additional coverage includes empty/cash-only accounts, multiple assets, FIFO order,
price scale and tie-breaks, later-recorded backdated evidence, partial missing-price
portfolios, settlement mismatches, unsupported acquisition versions, deterministic
reordered-source replay, duplicate evidence, authentication and account mismatch.

## Quality gates and visual verification

| Gate | Final result |
| --- | --- |
| npm run test | PASS — 57/57 tests in 7 files |
| npm run test:integration | PASS — 32/32 tests in 4 suites: M1B 8, M1C 5, M1D 11, M1E 8 |
| Migration-bootstrap test | Intentionally skipped; the separate schema-apply flag is off |
| npm run typecheck | PASS |
| npm run lint | PASS |
| npm run build | PASS — Next.js 16.3.4 production build; dynamic dashboard |

The final hosted regression run began at 18:51:08 Europe/Oslo on 2026-09-10 and
completed in 122.14 seconds. The earlier full hosted run also passed in 117.89
seconds. The invocation used the existing runtime environment loader with
MONEY_MACHINE_INTEGRATION_TEST=1 and the explicit authorized project reference.
No environment-file contents or credentials were printed.

Initial validation attempts encountered PowerShell/sandbox invocation restrictions
and then the integration authorization guard with unset flags. Those attempts did
not run hosted assertions. After invoking npm.cmd outside the sandbox and supplying
the authorized flags, both full hosted runs passed. No domain assertion, unexpected
constraint or transport failure occurred in the successful runs.

Browser verification used agent-browser 0.37.1 on locally server-rendered component
previews with the production CSS. Complete and incomplete states were visually
inspected; desktop and 390-pixel mobile layouts were inspected. The mobile holdings
table scrolls within its container. Browser error checks returned no errors.

- [Complete portfolio screenshot](evidence/m1e/complete.png)
- [Incomplete portfolio screenshot](evidence/m1e/incomplete.png)
- [Mobile portfolio screenshot](evidence/m1e/mobile.png)

These screenshots use deterministic unit fixtures, not the hosted numerical example
above. Browser checks do not claim an end-to-end authenticated login or a deployed
web application. Dashboard authentication wiring was inspected; hosted authorization
was exercised through actual PostgreSQL authenticated-role sessions and the account
read repository. No authentication bypass was added for visual testing.

## Supabase advisors

Both advisors were run against the authorized project on 2026-09-10.

- Security: the existing project-level
  [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
  remains. No other security finding was returned.
- Performance: 13 informational
  [unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
  No warning/error-level performance finding was returned; the previous unused-index
  notice was not returned in this run.

No account configuration or speculative schema/index change was made to clear these
pre-existing advisor findings.

## Scope and retained evidence

Hosted tests create isolated simulation users/accounts and append immutable
simulation evidence, including controlled future-price records. They retain that
evidence rather than disabling append-only protection for cleanup. No historical
ledger, fill, execution or price was silently edited or deleted. M1E projection
reads introduce no authoritative state transition.

No commit, push, deployment, live market integration, real-money action, SELL
implementation or M2 work was performed. ROB-44 and ROB-45 acceptance is recorded
here; no Linear issue update or message was sent.

M1E STATUS: PASS
