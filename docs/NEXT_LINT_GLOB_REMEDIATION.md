# Next lint dependency remediation

Date: 2026-10-06. Base: main `1c555ff87d8213fe4ccbc686fba6be3c0981dbb1`.

The baseline full audit reported five high affected packages through one
advisory, GHSA-vfj7-8cjw-p6xm:

`eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`.

Rather than await a braces release, this proposal replaces only the Next
plugin's directory-glob dependency with a local compatibility adapter around
official tinyglobby/picomatch releases. This is a reviewed-in-repository
alternative dependency implementation, not an upstream Next/braces patch or an
audit waiver. Next's actual rule implementations and effective lint config are
unchanged.

## Scope

- Root dev dependency `fast-glob` points to the real, clearly named private
  package `@money-machine/next-root-glob` under `vendor/next-root-glob`.
- The override uses `$fast-glob` only inside `@next/eslint-plugin-next`.
- The adapter provides only the named `globSync` directory API actually used by
  the unchanged upstream plugin; unsupported API/options throw.
- The vulnerable packages are absent from the installed graph. This is actual
  dependency removal, not version masking or moving dependencies out of audit.
- No lint rule/severity/option, CI audit command, application source boundary,
  operational authorization registry or data permission was weakened.
- New dependencies are development-only. Lockfile metadata unrelated to the
  changed graph was retained; generated next-env changes were excluded.

## Verification

Clean `npm ci` reproduces the local file dependency and scoped override.
Full `npm audit --audit-level=high` exits zero with zero findings.
`npm ls --all` verifies the resolved graph; the package retains its actual name.

Focused regressions preserve:

- every upstream Next plugin distribution file byte-for-byte;
- all 113 effective lint rules, severities and options;
- sixteen baseline directory patterns covering literal, absolute, array,
  brace/extglob, globstar, hidden, missing, negative and symlink cases;
- actual internal-anchor and async-client-component reports through ESLint.

Full unit suite: **1,624 passed, 35 skipped**. Typecheck and lint pass. The local
uncommitted Next production build passes. Client JS bundles contain no private
Coinbase test compiler markers or lint-adapter code. This build does not mean
the separate native CLI transport has been live-verified.

Coinbase CLI dry-run lists the three fixed public ETH-USD request profiles with
zero credential references. Attempted execute mode without pinned authority
returns `M5_COINBASE_SMOKE_AUTHORITY_NOT_PINNED`, zero requests, exit code 2.
No market-data request, database operation, live/UI integration, commit, push or
merge occurred.

## Maintenance and remaining review

The adapter is intentionally narrow. Hash and behavior tests make upstream
changes fail visibly instead of silently losing lint coverage. Revisit or
remove the adapter when an official compatible dependency chain becomes clean.
This proposal changes the earlier upstream-only remediation approach and must
be reviewed as such; a green audit alone is not external-source permission.

The next separately bounded source task remains one local Coinbase Exchange
ETH-USD smoke with the existing three GET profiles, at most two daily buckets,
no retries or credentials, and memory-only observations. Its operational
registry is still empty, and production acquisition/persistence remain blocked.
