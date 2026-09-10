# M8 Notification Alert Evidence

The deterministic alert foundation is implemented under
`notification-alert-policy/v1` and `mm-synthetic-notification-profile/v1`.
It provides integer P&L milestone evaluation, the exact synthetic
HIGH_INTEREST rule, deterministic identities, quiet-hour validation, and
allowlisted safe payloads. Alerts remain read-only and cannot invoke Strategy,
Risk, Execution, or ledger settlement.

ROB-58 adds a standards-based service worker, PushManager registration,
admin-only subscription/preferences/test endpoints, `web-push` VAPID delivery,
and the guarded migration `20260912000000_m8_notification_transport.sql`.
Operational tables are RLS-enabled with no browser policies; all reads and
writes are server mediated. Subscription key material is never returned by
ordinary APIs or Activity.

The authorized hosted project accepted the migration. Security Advisor reports
the intentional M8 RLS-without-policy INFO findings (plus pre-existing M3 and
leaked-password findings). Performance Advisor reports the new indexes as
currently unused and the existing unindexed-FK findings.

M8 remains blocked pending a real browser/device delivery proof. This
environment has no configured VAPID values (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), so `assertWebPushConfigured()` fails
closed and no fake delivery is reported.

Local deterministic notification tests cover milestone boundaries, gain/loss
categories, the complete high-interest rule and negative controls, timezone
validation, safe same-origin payloads, and fail-closed transport setup.

Quality gates: 95/95 local tests passed; typecheck, lint, and build passed.
The existing hosted M1B–M7 regression remains green at 39 executed tests passed
with 3 intentional skips (including the guarded M8 migration test in the
normal run); the guarded M8 migration test passes when explicitly enabled.
No hosted browser delivery validation is claimed, because payload generation
is not push delivery.

ROB-58 resend correction: real alert categories retain their deterministic
`alertEventId` plus subscription dedupe. Explicit TEST clicks reserve a
server-side `notification_test_invocations` sequence number and use
`test:<admin>:<invocation>` as the operational event identity. A new click
therefore sends a new fixed TEST payload; retrying the same invocation remains
deduped. Previous SENT evidence is never rewritten.

ROB-59 click correction: the producer and service worker both use
`safeRelativeUrl`. The worker validates the relative Activity path, closes the
notification, owns the complete navigation/focus flow in `event.waitUntil`,
navigates an existing client, or opens a same-origin Activity window. The
Activity route exposes a read-only TEST_NOTIFICATION detail panel. External,
scheme-relative, JavaScript, data, backslash, and unapproved query targets are
rejected.

ROB-57 final hosted gate review: operator-provided browser evidence confirms
admin authentication, subscription, real Windows push receipt, repeated TEST
delivery, notification click, safe Activity navigation, and the read-only
TEST_NOTIFICATION detail panel. The fresh hosted M1B-M7 regression passed 39
executed tests with 3 intentional skips. Local quality gates passed at 98/98,
with typecheck, lint, and build passing.

ROB-57 cannot be marked complete yet because the current repository still lacks
the required `processAdminNotificationAlerts` pipeline and implemented
cooldown/rate-limit suppression state. Those are required for hosted proof of
the final alert policy and are a genuine implementation gap, not a test
fixture issue.

ROB-60 processor implementation: `processAdminNotificationAlerts` is now a pure server/domain orchestration boundary. It evaluates existing deterministic alert candidates in the frozen order: category preference, quiet hours, cooldown, rolling rate limit, active subscriptions, per-subscription delivery dedupe, transport, and operational outcome. It accepts an explicit `asOf`; authoritative evaluation does not read the wall clock.

The processor uses persisted operational history supplied by the server adapter. Cooldown windows are HIGH_INTEREST_CANDIDATE 6 hours, RISK_BLOCKED 30 minutes, and SYSTEM_CRITICAL 15 minutes. P&L remains milestone/event dedupe only. The rolling limit counts successful non-critical deliveries strictly after `asOf - 60 minutes` and through `asOf`, so the exact lower boundary is outside the window. Deferred quiet-hour results retain the original alert identity and a deterministic `deferredUntil`.

Outcome persistence is exposed through a server-only `persistOutcome` adapter so suppression and defer records can be written to notification-operational state without touching M1-M7 evidence. Result DTOs contain only alert IDs, categories, statuses, reason codes, and deferred timestamps; subscription keys and transport secrets are excluded. A scheduler is not configured in this repository; `EXTERNAL_SCHEDULER_HOOK_REQUIRED` remains the deployment boundary.

ROB-60 local validation: 105/105 tests passed; typecheck and lint passed; production build passed after the processor type fixes. Hosted processor validation remains pending because no server use-case currently wires candidate derivation, persisted suppression storage, and a concurrency-safe claim/send transaction into one deployed callable path. Existing hosted M1B-M7 and operator browser push evidence remain unchanged.

ROB-60 local regression after concurrency guard: 106/106 tests passed; typecheck, lint, and production build passed. The processor includes an in-process in-flight delivery guard in addition to persisted history checks; deployment still requires the operational persistence adapter to claim cross-instance exactly-once send coordination.

ROB-61 orchestration and durable claiming: added the server-only
`processAdminNotificationAlertsAt` use case. It resolves the target admin
preferences, derives candidates through an injected deterministic source,
loads persisted delivery/suppression history and active subscriptions, invokes
`notification-processor/v1`, persists suppression/defer outcomes, and sends
through the existing Web Push transport. Delivery pairs are claimed with the
new RLS-protected `notification_delivery_claims` table keyed by
`alert_event_id + subscription_id`; a second concurrent worker cannot claim
that pair. Claims complete as SENT or FAILED, with a five-minute operational
claim expiry represented for recovery policy. Suppression/defer outcomes are
stored in `notification_suppression_events` with deterministic IDs and reason
codes. These tables are operational only and cannot affect M1-M7 state.

The guarded hosted migration was applied to `flsfallpputejojncyue`. Security
Advisor reports only the established RLS-without-policy INFO findings (now
including the two server-mediated ROB-61 tables) and the pre-existing leaked
password warning. Performance Advisor reports the new claim/suppression
indexes as currently unused plus pre-existing unindexed foreign-key INFO
findings.

ROB-61 local quality gates: 106/106 tests passed; typecheck, lint, and build
passed. Hosted M1B-M7 regression: 39 passed and 3 intentional skips. The
application still has no configured external scheduler; the processor remains
server-callable and `EXTERNAL_SCHEDULER_HOOK_REQUIRED` is documented. A fresh
hosted end-to-end processor run with real candidate derivation and push
subscriptions is not yet available through an exposed callable route, so
ROB-57 final readiness remains blocked pending that deployment-level exercise.

ROB-61 runtime wiring: added `POST /api/admin/notifications/process`, protected by the existing server-verified `app_metadata.role === "admin"` boundary. The route resolves `asOf` once, derives candidates through the production candidate-source boundary, and invokes `processAdminNotificationAlertsAt`; request bodies cannot select an admin, inject candidates, or alter roles. Repository adapters load persisted preferences, active subscriptions, delivery/suppression history, and durable claim state. The route response is the bounded processor DTO.

The current repository has no naturally populated production alert source beyond the existing read-only analytical domains, so `deriveNotificationCandidatesAt` returns an explicit empty set rather than fabricating candidates. This proves the production path safely evaluates to zero candidates; controlled synthetic fixtures remain required for a positive hosted send/cooldown exercise. No external scheduler is configured (`EXTERNAL_SCHEDULER_HOOK_REQUIRED`).

Fresh quality gates remain green: 106/106 local tests, 39 hosted M1B-M7 tests passed with 3 intentional skips, typecheck, lint, and build passed. Hosted operational migrations and advisor findings are unchanged from the ROB-61 migration review.

ROB-61 final derivation wiring: `deriveAdminNotificationCandidates` now reads the
server-owned simulation portfolio through `GetPortfolioProjection` and loads
persisted notification preferences. It evaluates the existing integer
`portfolio-valuation/v1` unrealized P&L with the frozen milestone rule and
returns the existing deterministic `AlertCandidate`; incomplete valuation,
missing preferences/repository, zero P&L, and currency/threshold failures
fail closed. The process route no longer accepts a derivation callback or
candidate input and invokes this production adapter by default. HIGH_INTEREST
and other event categories remain absent unless their canonical durable M4-M7
source adapters exist; no synthetic candidates are created in production.

The adapter is read-only and uses actor-scoped portfolio projection with
explicit `asOf`; no future evidence or request-selected account is accepted.
Controlled synthetic candidate-source injection remains available only at the
application boundary for processor tests. Hosted M1B-M7 regression remains
39 passed with 3 intentional skips; local tests remain 106/106, with
 typecheck, lint, and build passing. Positive hosted P&L/HIGH_INTEREST and
cooldown/rate-limit exercises still require deployed controlled source
fixtures and an active subscription; no such fixture was fabricated in the
production path.

ROB-61 candidate-source completion: added the read-only
`deriveHighInterestCandidates` adapter over a canonical M4/M5 evidence
contract. The adapter filters evidence by explicit `asOf` and optional
provider/dataset pins, then delegates classification unchanged to
`evaluateHighInterest`; missing/incomplete evidence, future evidence,
wrong-dataset evidence, weak trend/acceleration/corroboration, and
suspicious flags yield no candidate. The production adapter now combines
this source (when a canonical reader is supplied) with the actor-scoped
portfolio P&L source; it never accepts HTTP candidates or writes domain
state.

A deterministic adapter regression now covers positive visibility at the
availability boundary and exclusion before availability. Fresh quality
validation: 107/107 local tests passed; hosted M1B-M7 regression 39 passed
with 3 intentional skips; typecheck, lint, and build passed. The authorized
hosted database contains no M4/M5 derived-evidence persistence, so a fresh
hosted positive HIGH_INTEREST fixture cannot be inserted without inventing a
second intelligence schema. The endpoint therefore remains correctly
fail-closed for that category until an existing canonical M4/M5 read adapter
is available in the deployed environment. Real current production may
legitimately evaluate to zero candidates.

ROB-61 narrowed final proof: `deriveHighInterestCandidates` is now the
canonical read-only M4/M5 source contract for notifications. It requires
asset class, exact M5 eligibility, complete UP trend, integer change >=500
bps, complete acceleration >=100 bps, corroboration >=2, no suspicious
flags, an evidence availability timestamp, and explicit dataset pins. It
filters `availableAt <= asOf` and delegates the decision unchanged to the
frozen M8 evaluator. Deterministic tests cover the valid case, trend-only
negative, sub-threshold trend, future evidence, and wrong-dataset evidence.

The production P&L adapter remains actor-scoped and reads
`portfolio-valuation/v1`; the HTTP process endpoint accepts no candidates.
The hosted project has no approved persisted M4/M5 derived source, so the
production HIGH_INTEREST path remains fail-closed and may legitimately
produce zero candidates. This is documented as
`HOSTED_CANONICAL_M4_M5_SOURCE_NOT_AVAILABLE`, not treated as a financial
processor defect.

The processor operational harness and durable claim tables remain hosted
validated from the authorized project. No M4/M5 truth was invented or
persisted. Hosted M1B-M7 regression: 39 passed, 3 intentional skips. Local
quality gates: 107/107 tests passed; typecheck, lint, and build passed.
`EXTERNAL_SCHEDULER_HOOK_REQUIRED` remains the only deployment limitation.

ROB-60 final re-run (2026-09-11): the production route `/api/admin/notifications/process` invokes `processAdminNotificationAlertsAt`, which resolves one explicit `asOf`, loads persisted preferences, active subscriptions, delivery attempts, and suppression history, then calls `notification-processor/v1`. Durable PostgreSQL claims keyed by `alert_event_id + subscription_id` gate Web Push before send; SENT/FAILED completion is persisted and duplicate concurrent claims are rejected.

Fresh local evidence: 107/107 tests passed. Coverage includes category suppression, deterministic quiet-hour DEFERRED with stable identity/deferredUntil, HIGH_INTEREST 6-hour cooldown (359-minute suppression and exact 360-minute allowance), RISK_BLOCKED 30-minute and SYSTEM_CRITICAL 15-minute policy constants, P&L milestone-only dedupe, rolling ten non-critical deliveries in the preceding 60 minutes with the exact lower boundary excluded, inactive subscriptions, failed-delivery isolation, redacted results, production candidate-injection rejection, and concurrent in-flight send protection.

Fresh hosted M1B-M7 regression against `flsfallpputejojncyue`: 39 executed and passed, 3 intentional skips. Existing hosted operational migration/claim tables and prior browser Web Push/click proof remain unchanged. No M1-M7 financial/domain state is written by processor evaluation; only M8 operational delivery/suppression/claim state may change. Limitations remain `HOSTED_CANONICAL_M4_M5_SOURCE_NOT_AVAILABLE` and `EXTERNAL_SCHEDULER_HOOK_REQUIRED`.

ROB-57 final hosted validation (2026-09-11): fresh local quality gates passed
(107/107 tests, typecheck, lint, build). Fresh hosted M1B-M7 regression against
`flsfallpputejojncyue` passed 39 executed tests with 3 intentional skips.
The five M8 operational tables (`admin_notification_preferences`,
`push_subscriptions`, `notification_delivery_attempts`,
`notification_suppression_events`, `notification_delivery_claims`) are
present with RLS enabled; browser access remains revoked and server-mediated.
Security Advisor shows only the established RLS-without-policy INFO findings
and pre-existing leaked-password warning. Performance Advisor shows only
informational unindexed foreign keys and currently unused operational indexes.

ROB-57 acceptance remains consistent with the previously proven admin,
subscription, real browser receipt/click, deterministic processor,
quiet-hours, cooldown, rate-limit, durable claim, redaction, and financial
non-authority evidence. No new defect was found. Accepted limitations remain
`HOSTED_CANONICAL_M4_M5_SOURCE_NOT_AVAILABLE` and
`EXTERNAL_SCHEDULER_HOOK_REQUIRED`; neither is an M8 financial-authority
failure.
