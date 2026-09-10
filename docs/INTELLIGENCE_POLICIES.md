# Intelligence Policies

M4 uses `intelligence-engine/v1`, `intelligence-feature-set/v1`,
`event-signature/v1`, `trend-analysis/v1`, `regime-classification/v1`, and
`historical-analogue/v1`.

All inputs are selected from the pinned M3 dataset at `availableAt <= asOf`.
News and macro revisions use the highest visible revision for a logical source
record. M4 v1 does not infer sentiment from text; sentiment is `UNKNOWN` unless
an explicit normalized classification is supplied.

Event signatures hash sorted stable mapping target IDs and record type. Novelty
counts prior visible matching signatures: zero is `FIRST_SEEN`, otherwise
`REPEATED`. Corroboration counts distinct providers within the explicit analysis
window; duplicate records from one provider count once.

Trend requires at least two valid observations. Signed change basis points are
`FLOOR((last-first)*10000/abs(first))`; zero is `FLAT`. Acceleration is the
current-window change minus the preceding equal-length window. Missing windows
are `INCOMPLETE`, never fabricated as flat.

Regime v1 emits `RISK_ON` for positive complete trend, `RISK_OFF` for negative
complete trend, `MIXED` for flat complete trend, and `UNKNOWN` when trend data is
incomplete. These are descriptive analytical categories, not probabilities or
financial instructions.

Analogue ranking uses Manhattan distance over the explicitly supplied trend and
acceleration basis-point features, then earlier candidate timestamp, then stable
candidate ID. Candidate features are constructed only from evidence visible at
each candidate timestamp. Post-event outcomes are not inputs to ranking.

`trend-acceleration/v1` uses adjacent windows `[T-2W,T-W)` and `[T-W,T]`;
each independently applies the frozen trend formula and acceleration is current
change minus previous change. Both windows must be complete. Candidate timestamps
are explicit, strictly earlier than the query, and candidates missing either
feature are retained as incomplete diagnostics and excluded from ranking.
`historical-analogue-feature-set/v1` compares signed change and acceleration with
integer L1 distance and an explicit positive `analogueLimit`.

No M4 output has monetary authority and no advanced performance statistic is
defined here.
