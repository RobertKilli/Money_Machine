# M5 Asset Discovery and Eligibility Evidence

M5 is implemented locally as a pure read-only layer with versions
`asset-discovery/v1`, `asset-identity/v1`, `asset-quarantine/v1`,
`asset-evidence/v1`, and `asset-eligibility-policy/v1`.

Discovery consumes pinned M3 asset mappings visible at `availableAt <= asOf`.
Canonical identities are deterministic and candidates from multiple providers
deduplicate while retaining all evidence. Every candidate is automatically
`QUARANTINED`; eligibility never admits it to the tradable universe.

`mm-synthetic-eligibility-profile/v1` defines fixed integer thresholds and is an
engineering/test profile, not investment advice or a safety guarantee. Missing
or incomparable evidence yields `INCOMPLETE`; explicit violations yield
`INELIGIBLE`; only all applicable checks passing yields `ELIGIBLE`. Values use
integer units, basis points, and already-normalized currency evidence.

M4 trend/context is retained only as future watch context and cannot grant
eligibility. No Strategy, Risk, Execution, ledger, portfolio, or persistence path
is called. No M5 migration is required.

Local validation covers temporal/dataset isolation, quarantine, fail-closed
checks, deterministic IDs, provenance, and zero financial mutation. Fresh ROB-51
hosted validation against `flsfallpputejojncyue` proves the same behavior with
uniquely scoped immutable M3 fixtures: future and out-of-dataset evidence is
excluded, same chain/contract records deduplicate with multi-provider provenance,
different contracts remain separate, all candidates remain quarantined, and
repeated eligibility evaluations are identical. Missing evidence is INCOMPLETE,
explicit threshold/suspicious failures are INELIGIBLE, and a complete synthetic
profile is ELIGIBLE without any trade or strategy side effect.

Authoritative counts for M3 and M1/M2 tables remain unchanged during analysis.
No M5 migration is required.
Real provider connectors, chain analysis, tradable-universe admission, and AI
eligibility remain deferred.
