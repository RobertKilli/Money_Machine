# M4 Intelligence Engine Evidence

M4 is a pure, deterministic analytical layer using `intelligence-engine/v1`,
`intelligence-feature-set/v1`, `event-signature/v1`, `trend-analysis/v1`,
`regime-classification/v1`, and `historical-analogue/v1`. Semantics are frozen
in `docs/INTELLIGENCE_POLICIES.md`.

Inputs arrive through the M3 dataset-pinned temporal interfaces. Only records
with `availableAt <= asOf` are visible; revisions select the highest visible
revision. Event signatures hash sorted stable mappings. Novelty and
corroboration use visible source evidence only and count distinct providers.

Trend uses integer FLOOR basis-point changes and explicit completeness states.
Regime is descriptive (`RISK_ON`, `RISK_OFF`, `MIXED`, `UNKNOWN`) and never a
probability. Sentiment is not inferred from text. Trend acceleration uses
`trend-acceleration/v1` adjacent windows and integer change deltas. Analogue
selection uses explicit candidate timestamps, candidate-time reconstruction,
`historical-analogue-feature-set/v1`, integer L1 distance, deterministic
timestamp/ID tie-breaks, and excludes incomplete candidates. Post-event outcomes
are never inputs.

`analyzeIntelligenceAt` returns immutable read-only snapshots with config hash,
analysis ID, dataset pins, input IDs, reason codes, and algorithm versions. It
does not import or call Strategy, Risk, execution, ledger, portfolio, or any
mutation path. No M4 migration is required; M3 schema and server-mediated RLS
boundaries remain unchanged.

Fresh ROB-50 hosted delta PASS against uniquely scoped immutable M3 fixtures:
acceleration adjacent windows, exact boundary handling, candidate-time
reconstruction, deterministic L1 ranking, future-row and out-of-dataset
invariance, and zero authoritative mutation were verified. Local M4 suite:
79/79 PASS. Full hosted regression remains 35 executed tests with 2 intentional
skips. Typecheck, lint, and build pass. No M4 migration or security surface was
added; advisor findings remain unchanged.
