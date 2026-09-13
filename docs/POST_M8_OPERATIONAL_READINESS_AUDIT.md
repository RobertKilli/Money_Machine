# Post-M8 operational readiness audit

Audit date: 2026-09-13. This is a read-only repository and evidence review, not a new milestone. It does not declare the system generally production-ready and does not create M9 work.

## Status summary

### PROVEN

- Main was clean at commit `6b467455e27264ee71eb8ac86bace61def1f4906`, matching `origin/main` at audit start.
- M8 scheduler activation, durable claims, notification preferences, Web Push, and zero-candidate unattended execution are documented as passed.
- Canonical M4/M5 schema proof is documented for hosted migration `20260913153948`; both canonical tables are currently empty.
- Production deployment and canonical-reader wiring are documented as READY/PASS at Vercel deployment `dpl_GtHZMCL9a2PR4xgVxBtukwmaftwC`.
- Local gates previously verified on this change line: 126/126 tests, typecheck, lint, build, and zero high-severity npm audit findings.
- Canonical DB failures propagate operationally; zero canonical rows return a healthy empty source.

### NOT PROVEN

- GitHub branch protection: direct read-only GitHub API inspection returned “Branch not protected” for `main`.
- PR requirement, approvals, required status checks, force-push protection, deletion protection, conversation-resolution enforcement, and admin bypass policy are therefore not enforced/proven for `main`.
- No `.github/workflows` directory exists, so no repository CI workflow currently proves automatic test/typecheck/lint/build/audit enforcement.
- Current Vercel or Supabase state was not independently queried during this audit; deployment/schema statements above are repository/operator-provided evidence.
- No live analytical M4/M5 rows currently exist; positive hosted HIGH_INTEREST production behavior is not proven.

### KNOWN LIMITATION

The canonical source is available and production-wired, but its hosted tables contain zero analytical rows. HIGH_INTEREST consequently remains empty until an explicitly approved upstream M3→M4→M5 producer flow supplies canonical evidence. No live provider integration or ingestion scheduler exists in this scope.

## Call graph and trust boundaries

The production scheduler path is:

`POST /api/internal/notifications/process`
→ `processAdminNotificationAlertsAt(...)`
→ default `deriveNotificationCandidatesAt(...)`
→ `deriveAdminNotificationCandidates(...)` with `readCanonicalHighInterestEvidence`
→ canonical M4/M5 source
→ frozen `deriveHighInterestCandidates` / evaluator.

Admin notification routes use the server admin guard; the internal route uses the scheduler bearer guard and server-only admin identity. Canonical persistence and reads are server-only. No canonical file imports ledger, execution, strategy-write, or risk-approval repositories. HIGH_INTEREST is informational and cannot place orders, approve risk, mutate ledger/positions, or settle transactions.

## Route inventory

- Admin notifications: preferences `GET/PUT`, process `POST`, public key `GET`, subscribe `POST`, test `POST`, unsubscribe `POST`; admin-authenticated, with server-mediated persistence. No route grants browser database credentials or direct canonical-table writes.
- Internal notifications process: `POST`; scheduler machine-authenticated; bounded result/error responses; notification operational effects only.
- No intelligence, portfolio-command, or execution API route was found under `src/app/api` in this audit. Financial execution remains server-side through application/infrastructure boundaries and requires Strategy/Risk approval.

## CI and governance audit

`package.json` defines local `test`, `test:integration`, `typecheck`, `lint`, `build`, and audit-capable commands. Integration tests are guarded by explicit project authorization and are not safe to treat as always-on CI without that authorization. There are no GitHub Actions workflows in the repository. Branch protection is not enabled on `main`.

Supabase migration filenames are ordered and the canonical migration is `20260913153948_m4_m5_canonical_evidence.sql`, matching the documented hosted migration version. No duplicate timestamp or future-dated canonical migration remains. No hosted mutation was performed during this audit.

## Security, numeric, temporal, and retry review

- Secret boundary: source uses server-only modules and environment variable names only in server paths. No browser code is authorized to read `DATABASE_URL`, private VAPID material, or scheduler secrets.
- Error responses are bounded. Scheduler and preference diagnostics omit raw SQL, parameters, credentials, tokens, and stack traces.
- Authoritative money and quantities use bigint/string/fixed-point representations in the reviewed financial paths. Presentation-only `Number` use is not treated as an authority defect.
- Explicit `asOf` is passed through deterministic analytical and notification policy boundaries. Wall-clock timestamps are confined to operational route/recording boundaries or explicitly injectable command defaults.
- Notification claims and canonical M4/M5 persistence use database uniqueness and conflict handling. The canonical source is append-only with immutable triggers and deterministic fingerprint conflict checks.

## Test coverage map

M0/M1 financial primitives, ledger, virtual deposits, strategy/risk, simulation execution, portfolio projections, and allocation have focused financial tests. M2 has backtest/readiness tests. M3/M4/M5 have intelligence, discovery/eligibility, hosted safety/final suites, and canonical-source tests. M6/M7 have admission/allocation tests. M8 has alert, processor, preferences UI/API, scheduler-auth, production-wiring, and canonical zero-data coverage.

Important gaps are positive hosted canonical evidence with real upstream-produced rows, full deployed positive HIGH_INTEREST delivery/cooldown proof, and automatic CI enforcement. These are not required to close the documented zero-data M8 scheduler behavior.

## NEXT WORK CANDIDATES

### P0 — security/data-integrity blocker

None found in this audit. No P0 finding is being invented.

### P1 — release/governance reliability

1. **Protect `main` and enforce required checks** — `main` is directly verified as unprotected and no CI workflow exists. Ignoring this permits unreviewed or unvalidated changes. Scope branch protection, PR requirement, approvals, force-push/deletion controls, and required status checks; do not alter application or hosted data behavior. Acceptance evidence: GitHub API shows each rule and a successful required-check run. Size: M.

### P2 — observability/operational confidence

1. **Prove positive canonical-source operation** — hosted tables are empty, so only zero-data behavior is proven. Ignoring this leaves positive HIGH_INTEREST selection and delivery unverified. Scope an explicitly authorized synthetic or upstream-controlled proof flow with rollback/cleanup and bounded operational telemetry; do not add real market providers, real money, or notification truth tables. Acceptance evidence: compatible persisted M4/M5 rows produce one informational candidate and scheduler delivery remains policy-compliant. Size: M.

### P3 — maintainability/developer experience

1. **Add non-hosted CI parity** — local gates exist but are not automatically enforced. Scope a minimal workflow for test, typecheck, lint, build, and audit, with hosted integration kept explicitly gated and non-mutating by default. Do not expose secrets or run production migrations from CI. Acceptance evidence: pull requests execute the documented gates with least privilege. Size: S.

No additional candidate is recommended solely to populate this category.

## External evidence discipline

- GitHub branch protection: **DIRECTLY VERIFIED NOW** as absent.
- Vercel deployment details: **REPOSITORY/OPERATOR-DOCUMENTED**, not independently queried in this run.
- Supabase migration/schema proof: **REPOSITORY/OPERATOR-DOCUMENTED**, not independently queried in this run.
- cron-job.org unattended execution: **REPOSITORY/OPERATOR-DOCUMENTED**.

## Current closure

`HOSTED_CANONICAL_SCHEMA_PROOF: PASS`

`PRODUCTION_CANONICAL_READER_WIRING: PASS`

`HOSTED_CANONICAL_M4_M5_SOURCE: PASS`

The source is available and deployed, while live canonical analytical data remains absent. HIGH_INTEREST remains informational only. No M9 milestone, issue, branch, directory, or roadmap item was created.
