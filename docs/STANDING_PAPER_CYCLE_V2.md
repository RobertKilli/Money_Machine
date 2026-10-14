# Standing paper cycle v2

`standing-paper-cycle/v2` is an explicit, opt-in contract for local or review
scenarios. Existing `standing-paper-policy/v1` policies and worker entrypoints
remain BUY-only. The production/hosted worker does not select v2 automatically,
and this change does not edit or activate any hosted policy.

## Scenario policy inputs

The versioned exit rule is `standing-paper-exit-policy/v1`. It evaluates stop
loss first, take profit second, and maximum holding time third. It compares an
integer marked value with the remaining FIFO cost basis, which includes the
allocated BUY fee. Tests use synthetic thresholds such as 2,000 bps stop loss,
1,000 bps take profit, and five days maximum holding time. Those are fixture
inputs for exercising branches; they are not recommendations, targets, or
evidence of likely performance.

## Money and exposure semantics

For v2, the policy's `capitalBudgetMinor` caps cumulative net virtual
contributions. A sale does not increase that budget or reset the loss margin.
New BUY orders still require settled available cash after fees and must satisfy
`maxOrderMinor`, `maxPositionMinor`, `maxGrossExposureMinor`, and `maxLossMinor`.
Open position exposure is valued at the latest eligible synthetic fixture mark.
No order can create a short position; a SELL quantity is bounded by the
currently held quantity and the policy's per-order limit.

`committedCapitalMinor` remains a cumulative accounting measure of BUY cash
debits including fees. It is not the v2 contribution budget. V2 therefore
records `capitalBudgetUsedMinor` from net contributions separately. Cumulative
trade turnover is the sum of BUY and SELL gross notionals, excluding fees; it
is informational and does not consume or replenish the capital budget. FIFO
realized result is net sale proceeds after SELL fee less the FIFO cost basis
removed. BUY fees are allocated to lot cost basis.

The existing fee, spread/slippage, integer rounding, full-or-none simulated
fill, and synthetic price assumptions remain in force. SELL execution uses the
existing adverse-side rounding helpers. A simulated fill is a local ledger
settlement only and is not an exchange execution.

## Persistence boundary

The new migration adds a SELL ledger transaction type, BUY/SELL fill material,
and append-only hash-bound BUY/SELL/HOLD decisions. The standing-paper
repository continues to acquire the policy lock before the shared account
lock. It writes decisions, contribution bindings, simulated fills, balanced
ledger journals, audit events, and the checkpoint in the same PostgreSQL
transaction. Checkpoint verification reconciles contribution capital, BUY and
SELL fill material, FIFO lot consumption, realized result, turnover, and all
account ledger entries before a new round.

Replay uses the stored input hash and idempotency key. The initial virtual
contribution is bound per policy and is not repeated after restart. Competing
workers serialize on the policy/account locks. A rollback leaves no partial
settlement. Pause and stop continue to gate each new round; a transaction that
already owns the locks finishes atomically.

## Evidence and limitations

Automated fixtures can prove deterministic calculations and repository
invariants against task-owned PostgreSQL. They do not prove live-market price
quality, exchange execution, profitability, hosted deployment behavior, or
that a worker is currently running. This review does not use provider data,
real orders, hosted database access, hosted migrations, or any active hosted
policy.
