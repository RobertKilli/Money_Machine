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
- `HOSTED_CANONICAL_M4_M5_SOURCE_NOT_AVAILABLE`: `CLOSED`

## Post-M8 canonical source closure

The hosted canonical migration `20260913153948` is applied. The canonical M4/M5 implementation commit is `330962aad54f6ebf4b46774f18c85cd7a800afcc`; the production wiring-fix commit is `6b467455e27264ee71eb8ac86bace61def1f4906`; and production deployment `dpl_GtHZMCL9a2PR4xgVxBtukwmaftwC` is `READY` at `https://moneymachine-eta.vercel.app`.

The first verified unattended scheduler execution after the wiring fix, at `2026-09-13T17:35:15.198Z`, returned HTTP 200 with `evaluated=0`, `sent=0`, `deferred=0`, `suppressed=0`, and `failed=0`. Both canonical tables had zero rows, so this is valid healthy zero-data proof; no synthetic rows remain. This post-M8 note does not rewrite the historical ROB-62 timestamps or evidence above.

`HOSTED_CANONICAL_M4_M5_SOURCE_NOT_AVAILABLE`: `CLOSED`
