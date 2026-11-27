# PAPER profit allocation — calculation model

Baseline: `595ed8d4bee037ae1bf1cc4d6935fbe099beac82`.
Contract: `paper-profit-allocation/v1`.

This is the first implementation slice of optional profit reinvestment and a
protected reserve. The canonical formulas and rounding rules are in
[Financial Policies, section 10](FINANCIAL_POLICIES.md). Existing trading and
FIFO behavior is unchanged. This document describes the pure calculation model.
The separate [record-only persistence boundary](PAPER_PROFIT_ALLOCATION_PERSISTENCE.md)
adds approved terms and atomic recording for new opt-in policies. It does not
enforce reserve-backed spending or add a dashboard activation flow.

## API

`projectPaperProfitAllocation({ policy, settlements })` is a deterministic pure
function. A policy binds a FinancialAccount, owner, quote currency and policy ID,
is explicitly `PAPER_ONLY`, and has an `enabled` flag and BigInt reinvestment bps.
The function accepts only already-settled simulated sales. The application
must supply validated, complete ledger/FIFO-derived settlement material; the
record-only repository boundary now performs that reconciliation.

For each sale it derives real net profit after SELL fee and fee-inclusive FIFO
cost, carries losses forward, and computes incremental allocations above the
previous cumulative realized-P&L high-water mark. Its immutable trace records
the sale inputs, input hash, net/cumulative realized P&L, old-loss recovery,
distributable increment, reinvestment/reserve allocations and reason. The final
projection exposes cumulative totals, remaining loss carry-forward, last sale
sequence/time, frozen policy terms, policy hash and output fingerprint.

The implementation reuses the existing integer FLOOR function. Rounding is
applied to the cumulative allocation target, so splitting a 57-øre gain into
57 one-øre gains does not change the final allocation under the same policy.
All returned objects and arrays are frozen and independent of caller objects.
Replay of identical sale material produces identical output; duplicated exact
settlements contribute once. Conflicting settlement IDs, duplicate fill IDs,
history gaps/reordering, scope mixing, invalid precision/types and amount
overflow fail closed with fixed error codes.

The function does not inspect databases or assert that caller evidence is
authentic. `evidenceStatus: CALLER_SUPPLIED_PAPER_SETTLEMENTS` and
`operationalStatus: MODEL_ONLY` remain explicit. Reconstruction idempotency is
not proof of cross-process or durable transaction idempotency. Removing trailing
history, restarting sequence numbering or changing terms cannot be detected as
an operational history violation within this pure function. The record-only
repository boundary validates stored terms, complete ledger/FIFO history and
the existing allocation prefix.

## How to interpret the output

- Reinvestment allocation is a profit entitlement, not an extra deposit and not
  currently available cash. Returned principal remains separate from profit.
- Protected reserve is a calculated entitlement. Existing workers do **not**
  enforce it yet; do not enable this projection as a spending policy on its own.
- Unrealized gains are excluded. Deposit-adjusted NAV loss/exposure checks keep
  their existing meaning and must still veto a later trade independently.
- Disabled allocation retains all new distributable profit for trading but still
  tracks realized losses/high-water marks. It does not erase old losses.
- There is no 5% customer fee, automatic bank deposit, withdrawal, correction,
  reserve release or policy-change flow. Those require separate contracts.

## Integration sequence

The record-only persistence boundary implements backend approval and recording
for steps 1–3. These are allocation evidence rows, not reserve ledger movements.
Dashboard consent and steps 4–5 remain separate work.

1. Bind immutable allocation terms to a separately reviewed DRAFT/activation
   flow; do not change existing active policies automatically.
2. Validate ownership, source ledger/FIFO identity, original configuration and
   complete account history under the existing policy/account locks.
3. Persist allocation evidence atomically with durable idempotency and
   restart/concurrency tests. Reserve movements remain later work. Preserve all historical terms and
   carry-forward across any later policy change.
4. Restrict worker/risk spending to cash-backed trading cash after protected
   reserve and open-order reservations; keep reserve in total NAV without
   double-counting P&L or weakening existing risk vetoes.
5. Show profit, reinvestment, reserve, recovered losses and terms in the dashboard.

No hosted migration, account/policy activation, worker start or provider call is
needed or authorized by this slice. Synthetic test data does not demonstrate
investment performance or qualify a market-data source.

## Checks

```sh
npx vitest run tests/financial/paper-profit-allocation.test.ts tests/financial/standing-paper-cycle.test.ts
```

Tests cover 50/50, 0/100 and 100/0 splits; disabled allocation; fees with the
existing FIFO lot consumer; initial and later losses; exact recovery boundaries;
rounding/fragmentation invariants; replay/conflicts; owner/account/currency
isolation; immutable output and numeric precision/overflow. Deposits, BUYs and
valuations are rejected as allocation events.
