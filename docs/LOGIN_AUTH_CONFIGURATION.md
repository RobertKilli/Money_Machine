# Login flow configuration and verification

## Current deployment observations

- Vercel project `money_machine` is linked to `RobertKilli/Money_Machine`.
- The latest production deployment observed on 2026-10-09 is `moneymachine-eta.vercel.app`, built from main `9aa6fbc86279210f6b7e04bc9a2b11a30eab3512`.
- Vercel lists `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for Production and Preview. The read-only Vercel connector masks their values, so their Supabase project binding could not be verified.
- Supabase project inventory contains one active project named `Money_Machine`, ref `flsfallpputejojncyue`. The available read-only Supabase connector does not expose Auth Site URL, redirect allowlist, Google provider, or SMTP/email configuration. No hosted Auth setting was changed.

These observations identify the deployment and candidate Supabase project. They do not prove that the Vercel URL variable points to that project, or that its Auth settings accept the callback URL.

## Callback contract

The application uses one validated callback URL, `/auth/callback`, for Google OAuth and email magic links. Production uses Vercel's `VERCEL_PROJECT_PRODUCTION_URL`; Preview uses that deployment's `VERCEL_URL`; local development uses `http://localhost:3000`. `NEXT_PUBLIC_SITE_URL` is an optional validated override. Request `Host` values are not used to construct callback or post-auth destinations. Vercel documents that its project production URL is automatically provided to deployments (and is available in Preview as well); the deployment environment selects which origin this code uses: [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables).

Before deployment, compare the Supabase Auth URL configuration with the exact production callback `https://moneymachine-eta.vercel.app/auth/callback`. If Preview sign-in is needed, its deployment callback host must also match a redirect allowlist entry; a narrowly scoped Vercel preview pattern can be used if that is the team's policy. Supabase documents that `redirectTo` must match the allowlist and recommends an exact production callback path: [Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls). This is the required verification; this investigation did not establish that a setting is currently wrong. Site URL should be the canonical production origin. Google OAuth must be enabled and its Supabase callback configured at the Google provider. Email delivery must be configured and the magic-link template must preserve Supabase's `{{ .ConfirmationURL }}` link behavior.

## Session flow

Both sign-in methods point to the same application callback. `@supabase/ssr` uses PKCE; the callback exchanges the one-time code with `exchangeCodeForSession`. The server Supabase client writes the resulting session cookies through Next's cookie store. Only after successful exchange does the app redirect to the validated local path (default `/dashboard`). Supabase documents this PKCE code exchange and cookie-backed SSR session model in its [server-side Auth guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide). No OAuth/sign-in request, test email, or user creation was performed during this investigation or its tests.

The regression tests mock the Supabase client and exercise URL selection, generic status/error messages, callback code exchange, host-header isolation, local redirect validation, and session-cookie persistence. They do not prove hosted provider settings, DNS/domain ownership, real email delivery, or a live OAuth exchange.
