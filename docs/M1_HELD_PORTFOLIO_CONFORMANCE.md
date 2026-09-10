# M1 held-portfolio conformance

Date: 2026-09-10. Authorized project: Money_Machine (`flsfallpputejojncyue`).

M1 HELD-PORTFOLIO CONFORMANCE: PASS

The shared live Strategy → Risk path now consumes one server-derived temporal
decision snapshot. It contains ledger cash, complete holding values from
`portfolio-valuation/v1`, frozen NAV, exposure by asset and selected price IDs.
Incomplete required valuation fails closed.

Strategy uses the frozen NAV for the CEILING 10% reserve and computes total-NAV
target gaps after existing exposure. Overweight assets receive no BUY; available
contribution is allocated only across positive gaps. Risk independently checks
reserve and existing-plus-proposed exposure against the frozen NAV cap. No SELL,
Position table, or backtest-specific path was added.

`PostgresFinancialRepository.getDecisionPortfolioState` reuses the M1E read
repository and pure projection. New decision evidence stores `decisionNavMinorUnits`
in its immutable result JSON; M1D execution rechecks that frozen NAV, with legacy
records falling back to their historical cash field without reinterpretation.

Permanent conformance tests cover zero holdings, NAV-based reserve, insufficient
cash below reserve, overweight suppression, underweight allocation, independent
existing-plus-proposed Risk veto, no SELL, temporal/future-price behavior and
deterministic replay. The existing M1D execution/idempotency tests remain in the
regression suite.

Hosted diagnosis classified every former failure as **A: stale/brittle fixture
assumption**. Tests expected a single canonical price (and quantities derived from
it), while retained append-only rows for the same pinned dataset were legally
eligible. Selection remained the frozen ordering: `availableAt <= asOf`, then the
latest available/observed row and deterministic record-id tie break. No B temporal
selection defect or C held-portfolio semantic defect was found, and no immutable
price or historical evidence was deleted or rewritten.

The hosted fixture now derives quantities, fees, basis, NAV and selected-price
provenance from the actual legally selected row. The T0–T3 scenario proves an
initial contribution, approved BUY, ledger holding, later contribution and second
decision. At T3 the persisted decision NAV equals ledger cash plus the marked
existing holding; reserve equals `CEILING(NAV * 10%)`; overweight holdings receive
no additional BUY; and proposed orders are checked against existing exposure.
Adding a future row (`availableAt > T`) leaves the historical projection byte-for-
byte unchanged. The M1E projection reconciles the post-execution ledger, including
cash, aggregate quantity and fee-inclusive FIFO lots.

The temporal reader already pins `datasetVersion` to the fixture market-data
version in its hosted query and projection input. This is sufficient for the
current M2 prerequisite; no ad-hoc dataset filter or production selection change
was introduced.

No schema migration or hosted M2 artifact was introduced. No advisor-sensitive
schema/security surface changed. Existing advisor findings remain the known
project-level leaked-password-protection warning and informational unindexed
foreign keys.

Advanced M2 performance metrics remain outside the frozen policy. M2 replay is
not implemented in this change. The held-portfolio resume gate is GO.

Hosted quality gates: M1B–M1E integration suite 32/32 executed tests PASS (one
intentional skip); local unit suite 60/60 PASS; typecheck, lint and build PASS.
