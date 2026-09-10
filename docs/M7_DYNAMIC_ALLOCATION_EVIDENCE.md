# M7 Dynamic Allocation Evidence

Local M7 implementation freezes `dynamic-allocation-policy/v1` and the synthetic
engineering profile `mm-synthetic-dynamic-allocation-profile/v1`. Plans contain
explicit dynamic targets referencing exact M6 `ADMITTED` decisions. Validation
rejects non-admitted, duplicate, future, mismatched, unsupported, over-cap, and
malformed targets.

Dynamic sleeve total is capped at 1,000 bps, each asset at 500 bps, and eight
entries. Existing 6000/2500/1500 fixture weights are redistributed into the
remaining envelope using integer floors and largest remainders in canonical
asset order. Zero dynamic allocation is exactly the legacy vector. M1 reserve
and Risk semantics are unchanged.

M7 does not infer weights from M4/M5 context and does not call Strategy, Risk,
Execution, ledger, or portfolio mutation. Dynamic execution onboarding remains
blocked until an asset exists in the supported M1 financial registry with legal
execution pricing; M3 observations cannot become execution prices.

ROB-55 hosted retry completed against the authorized Supabase project
`flsfallpputejojncyue`. The previous hosted attempt did not reach the database:
its temporary validation file had malformed TypeScript/template interpolation
and unstable SQL result typing, producing a harness parse/type failure. The
failure was validation-harness configuration, not a M7 financial
implementation defect. The retry uses a guarded project check, a read-only
ledger count, and the frozen domain validator; it does not write fixtures or
alter hosted evidence.

Hosted proof passed for no-plan compatibility (6000/2500/1500 and exact
10,000 bps reconciliation), an admitted target, rejected incomplete admission,
deterministic repeated validation, and zero ledger mutation. The complete hosted
M1B-M6 regression passed with 39 executed tests and 2 intentional migration
skips. Local tests remain 89/89 PASS; typecheck, lint, and build PASS.

No M7 migration or persistence was added. Existing M1 held-portfolio, reserve,
Risk, execution-registry, and Activity read-only semantics remain covered by
the preceding hosted M1B-M6 evidence. Dynamic target allocation into a live
execution asset still requires a separately frozen execution-asset onboarding
and Strategy allocation policy; M3 prices remain informational only.
