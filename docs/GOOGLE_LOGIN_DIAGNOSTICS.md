# Google sign-in diagnostics

The OAuth callback keeps the same generic sign-in failure shown to users. Server logs emit only these fixed events:

| Event | Meaning |
| --- | --- |
| `AUTH_CALLBACK_MISSING_CODE` | Callback reached the app without an authorization code. |
| `AUTH_CALLBACK_WRONG_ORIGIN` | Callback request origin did not match the configured trusted origin; no exchange was attempted. |
| `AUTH_CALLBACK_PKCE_VERIFIER_MISSING` | The configured project's expected PKCE verifier cookie was absent or empty; no exchange was attempted. |
| `AUTH_CALLBACK_EXCHANGE_REJECTED` | Supabase rejected the code exchange. The event includes only an allowlisted Supabase Auth error code or `SUPABASE_AUTH_ERROR_UNKNOWN`. |
| `AUTH_CALLBACK_EXCHANGE_SUCCEEDED` | Supabase accepted the exchange. This confirms exchange success, not a later dashboard authorization or page-render result. |

The explicit Auth error-code allowlist is based on Supabase's [Auth error-code catalog](https://supabase.com/docs/guides/auth/debugging/error-codes): `bad_code_verifier`, `bad_oauth_callback`, `bad_oauth_state`, `flow_state_expired`, `flow_state_not_found`, `provider_email_needs_verification`, `unexpected_failure`, and `validation_failed`. New codes remain unknown until deliberately reviewed and added.

No callback URL, query string, authorization code, request headers, cookie names or values, session data, raw error message, or user identifier is logged. The callback checks only for a non-empty expected verifier cookie before invoking Supabase's existing PKCE exchange.

## What the current diagnostics establish

The previous production/Auth logs did not include app-level callback stage events. Supabase's available Auth logs showed aggregated OAuth/exchange mentions but could not tie them to this user's attempt. Vercel runtime logs were unavailable for the requested historical period under the project's retention. The cause of the reported sign-in failure therefore remains unknown until a user retries on a deployment containing these diagnostics.

On the next attempt, correlate the callback events by their order and occurrence time in the server logs. Do not copy or share the browser callback URL. A missing-code event can also reflect a provider-side denial; this version intentionally reports only the requested fixed category. An exchange-success event followed by the generic UI failure points beyond the PKCE exchange, and needs separate dashboard/session evidence.
