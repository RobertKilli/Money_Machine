# Universe Admission Policies

M6 uses `universe-admission-policy/v1`. Admission is a separate deterministic
decision over an exact M5 evaluation. `ADMITTED` means only that a future
Strategy may consider the identity; it is not a BUY, recommendation, Risk
approval, execution authorization, or safety guarantee.

Admission requires a valid canonical identity, supported M5 policy/profile,
`ELIGIBLE` status, temporal validity at `asOf`, preserved dataset/provenance
references, and an allowed asset class. Missing or stale evidence is
`INCOMPLETE`; any explicit denial or non-eligible result is `REJECTED`.
Quarantined candidates remain quarantined until this explicit decision. M6 does
not recalculate M5 eligibility or change the live fixture registry/strategy
weights; dynamic allocation requires a separately frozen Strategy policy.
