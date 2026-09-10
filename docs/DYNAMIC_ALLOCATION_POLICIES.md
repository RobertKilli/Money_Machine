# Dynamic Allocation Policies

M7 uses `dynamic-allocation-policy/v1` and the synthetic engineering profile
`mm-synthetic-dynamic-allocation-profile/v1`. The profile is deterministic test
configuration, not investment advice, optimization, or an expected-return claim.

Plans explicitly provide dynamic targets. M4/M5 context never creates weights.
Only exact M6 `ADMITTED` decisions with matching identity, timestamp, versions,
and dataset pins are accepted. Dynamic sleeve total is capped at 1,000 bps,
each asset at 500 bps, targets are 1–500 bps, and at most eight assets are listed.

Remaining base weights are scaled into `10000-D` with integer floors and
largest-remainder distribution in GLOBAL, GROWTH, DEFENSIVE order. Zero dynamic
targets preserve the legacy 6000/2500/1500 vector and reserve semantics.
Admission never means BUY; dynamic execution requires a separately supported M1
financial asset and legal execution price.
