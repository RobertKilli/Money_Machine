# M8 scheduler evidence

ROB-62 adds `POST /api/internal/notifications/process` as a separate machine-authenticated boundary. It requires `Authorization: Bearer <NOTIFICATION_SCHEDULER_SECRET>` and resolves the owner only from server-side `NOTIFICATION_SCHEDULER_ADMIN_USER_ID`. The manual admin endpoint remains unchanged.

The route invokes the existing processor use case with one explicit `asOf`, persisted notification state, durable claims, and Web Push. Zero-candidate runs are successful. Responses and logs are bounded and redacted.

## Hosted deployment

Money Machine is deployed to Vercel project `money_machine` (`prj_SmcsM76oBOnFmxP5S1BddRWzNuzB`) with production alias `https://moneymachine-eta.vercel.app`.

Verified production deployment:

- deployment: `dpl_EP3YQ24o5yPic8UMYTCR3kduDcQz`
- Git commit: `32910f859b214e699241e0a53b3c5f1210f1ca43`
- state: `READY`

The external scheduler is cron-job.org, configured for a 5-minute cadence using HTTPS `POST` to `/api/internal/notifications/process` with `Authorization: Bearer <server-only scheduler secret>`. No scheduler secret is stored in this evidence document.

## Preference persistence blocker resolved

Production preference persistence is operational. The authenticated preferences `PUT` returned HTTP 200, a subsequent `GET` returned HTTP 200, and hosted PostgreSQL contains exactly one admin notification preference row with the expected operator configuration. The prior PostgreSQL `22P02` / `array_in` failure in `enabled_categories` persistence was resolved, so scheduler execution is no longer blocked by missing preferences.

## Manual hosted scheduler proof

A manual cron-job.org test run completed successfully:

- `asOf`: `2026-09-13T13:57:31.076Z`
- HTTP status: `200`
- `evaluated`: `0`
- `sent`: `0`
- `deferred`: `0`
- `suppressed`: `0`
- `failed`: `0`
- `durationMs`: `3119`

A zero-candidate execution is a valid successful scheduler run; no notification candidates means there is nothing to deliver, not that the scheduler failed.

## Unattended hosted scheduler proof

Three genuine unattended cron-job.org executions were observed in Vercel production logs:

| asOf | HTTP | evaluated | sent | deferred | suppressed | failed | durationMs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `2026-09-13T14:05:15.470Z` | 200 | 0 | 0 | 0 | 0 | 0 | 2224 |
| `2026-09-13T14:10:21.179Z` | 200 | 0 | 0 | 0 | 0 | 0 | 2197 |
| `2026-09-13T14:15:21.939Z` | 200 | 0 | 0 | 0 | 0 | 0 | 2193 |

At least two unattended successful executions are therefore proven.

`HOSTED_UNATTENDED_PROOF: PASS`

## Final ROB-62 status

- ROB-62 scheduler activation: `PASS`
- `EXTERNAL_SCHEDULER_HOOK_REQUIRED`: `CLOSED`
- `HOSTED_UNATTENDED_PROOF_PENDING`: `CLOSED`
- remaining separate accepted limitation: `HOSTED_CANONICAL_M4_M5_SOURCE_NOT_AVAILABLE`

The remaining M4/M5 hosted-source limitation is not resolved by ROB-62 and must not be treated as closed by the scheduler evidence above.
