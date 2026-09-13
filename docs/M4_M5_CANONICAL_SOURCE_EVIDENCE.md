# Canonical M4/M5 source boundary

This document describes the server-mediated canonical evidence boundary used by M8 informational HIGH_INTEREST alerts. It is not an M9 milestone and it does not create trading authority.

## Boundaries

- M3 persists immutable source observations and provenance.
- M4 computes deterministic intelligence snapshots from explicit `asOf` and provider/dataset pins. `canonical_m4_analysis_snapshots` persists the reproducible trend, acceleration, input evidence, versions, identity, asset-specific corroboration provider/evidence IDs, and integrity result. The application boundary receives candidate identity and corroboration context from the upstream asset-scoped computation; the repository never infers it from a global snapshot.
- M5 computes deterministic eligibility evaluations. `canonical_m5_eligibility_evaluations` persists the candidate identity, explicit canonical asset identity/class, status, checks, reason codes, evidence IDs, policy/profile versions, dataset pins, and an explicit `CLEAN`/`SUSPICIOUS`/`INCOMPLETE` suspicious-evidence state. `CLEAN` is authoritative upstream evidence, not an absent JSON field.
- The server-only canonical reader joins compatible M4/M5 records and maps them to the existing `CanonicalHighInterestEvidence` contract. M8 then calls the frozen domain evaluator.

## Temporal and dataset rules

Both `as_of` and `available_at` must be no later than the reader request `asOf`; `available_at` is the downstream visibility time and is not copied from `as_of`. The reader first filters both histories, constructs only same-identity/same-pin M4/M5 pairs, and then selects the latest compatible pair per candidate and normalized pin identity by M4 analytical time, M4 visibility, M5 analytical time, M5 visibility, analysis ID, and evaluation ID. It never uses a newer snapshot for a historical request or independently joins incompatible latest rows.

Dataset pins are deduplicated, sorted, and persisted with both records. A pair is excluded unless the pins, candidate ID, canonical identity, and asset class match exactly. Empty, incomplete, suspicious, or incompatible source data returns no HIGH_INTEREST evidence and does not make the scheduler unhealthy. A database/query failure remains an operational failure and is not silently relabeled as zero data.

## Immutability and replay

Records are append-only, protected by update/delete rejection triggers, RLS-enabled, and revoked from browser roles. The server repository inserts with deterministic IDs; database uniqueness closes the concurrent replay race, replaying the same ID and fingerprint is a no-op, while a different fingerprint fails closed.

## Hosted schema proof

The migration was successfully applied to the authorized Supabase project `flsfallpputejojncyue` and is recorded as migration version `20260913153948` (`m4_m5_canonical_evidence`). The hosted schema contains both `canonical_m4_analysis_snapshots` and `canonical_m5_eligibility_evaluations`.

Verified hosted properties:

- RLS is enabled on both tables.
- `anon` and `authenticated` have no direct table privileges.
- Immutable UPDATE/DELETE triggers are present and verified.
- Required constraints and indexes are present and verified.
- Same deterministic replay retained one row.
- Conflicting same-ID insert was blocked.
- Invalid M5 status was blocked.
- `available_at < as_of` was blocked.
- Compatible temporal pair proof returned: `10:04 -> none`, `10:20 -> A/A`, `10:45 -> A/A`, `11:30 -> B/B`.
- Incompatible dataset pins produced zero compatible pairs.
- Six synthetic proof fixtures were transactionally rolled back.
- Final hosted canonical table counts are both zero; no synthetic proof rows remain.

`HOSTED_CANONICAL_SCHEMA_PROOF: PASS`

## Production deployment and zero-data proof

The canonical implementation was committed in `330962aad54f6ebf4b46774f18c85cd7a800afcc` (`feat(intelligence): add canonical hosted M4/M5 evidence source`). The production wiring fix was committed in `6b467455e27264ee71eb8ac86bace61def1f4906` (`fix(notifications): wire canonical M4/M5 reader into production`).

Vercel deployment `dpl_GtHZMCL9a2PR4xgVxBtukwmaftwC` is `READY` at `https://moneymachine-eta.vercel.app`, deployed from commit `6b467455e27264ee71eb8ac86bace61def1f4906`.

The verified production call path is:

`scheduler route -> processAdminNotificationAlertsAt(...) -> deriveNotificationCandidatesAt(...) -> deriveAdminNotificationCandidates(...) with readCanonicalHighInterestEvidence -> canonical M4/M5 source -> frozen deriveHighInterestCandidates/evaluator`

Explicit candidate-source test overrides remain supported. The first verified unattended scheduler execution after the wiring fix was `2026-09-13T17:35:15.198Z`, HTTP 200, with `evaluated=0`, `sent=0`, `deferred=0`, `suppressed=0`, and `failed=0`. Both hosted canonical tables contained zero rows during verification; zero canonical rows therefore produced a healthy zero-candidate result, and no synthetic rows remain.

`HOSTED_CANONICAL_SCHEMA_PROOF: PASS`
`PRODUCTION_CANONICAL_READER_WIRING: PASS`
`HOSTED_CANONICAL_M4_M5_SOURCE: PASS`

HIGH_INTEREST remains informational only. This source adds no order, risk, ledger, settlement, or execution authority. No M9 milestone was created. The source is deployed and available, but currently contains no live analytical M4/M5 rows.

## Financial authority

The canonical source stores analytical evidence only. It cannot place or approve orders, execute trades, settle fills, mutate positions or ledger balances, or bypass Strategy/Risk. HIGH_INTEREST remains an informational notification candidate only.

## Hosted proof procedure

Apply the forward-only migration only through the authorized deployment process. Run the guarded synthetic integration suite against the authorized project using the repository's existing database URL and project-ref checks. The suite must prove insert/read, deterministic replay, conflicting fingerprint rejection, temporal filtering, dataset compatibility, joined HIGH_INTEREST evidence, and transaction rollback. Do not seed normal production startup with synthetic evidence.
