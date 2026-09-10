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

The hosted M1B–M1E suite was rerun against the authorized project. The M1E
scenario now uses runtime decision timestamps so its temporal snapshot includes
the newly created validation evidence; it proves a second decision sees cash plus
marked existing holdings and preserves immutable ledger/fill settlement. Hosted
future-price fixtures are append-only and remain excluded before their
`availableAt` timestamp.

No schema migration or hosted M2 artifact was introduced. No advisor-sensitive
schema/security surface changed. Existing advisor findings remain the known
project-level leaked-password-protection warning and informational unindexed
foreign keys.

Advanced M2 performance metrics remain outside the frozen policy. M2 replay is
not implemented in this change; it may resume only after this shared path is
revalidated.
