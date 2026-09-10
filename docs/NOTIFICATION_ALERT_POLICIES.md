# Notification Alert Policies

M8 policy identifiers are `notification-alert-policy/v1`,
`mm-synthetic-notification-profile/v1`, and `web-push-delivery/v1`.

Alerts are read-only observability derived from existing evidence. They never
create recommendations, targets, proposals, risk dispositions, executions, or
ledger effects.

P&L milestones use integer base-currency minor units:

`FLOOR(abs(unrealizedPnlMinor) / thresholdMinor)`.

Only the highest current milestone is emitted. Positive and negative values
use separate categories, and every message is explicitly labelled
`SIMULATION` and `unrealized`.

HIGH_INTEREST_CANDIDATE is a synthetic research classification. It requires a
CRYPTO candidate with M5 ELIGIBLE status, complete UP trend at least +500 bps,
complete acceleration at least +100 bps, at least two distinct providers, and
no suspicious flags. Missing or unsupported inputs produce no alert. These
thresholds are engineering/test conditions, not investment advice or a safety
or profitability claim.

Alert identity is deterministic over account/candidate, category, threshold,
currency, milestone or as-of evidence, and policy versions. Delivery state is
operational only. Category cooldowns are six hours for high-interest, 30
minutes for risk-blocked, and 15 minutes for system-critical. Non-critical
delivery is capped at ten per rolling hour. Quiet-hours alerts are deferred,
never silently discarded, using a validated IANA timezone.

Push payloads are explicit allowlists with same-origin relative links. Secrets,
headers, cookies, sessions, errors, environment values, and arbitrary source
objects are excluded.
