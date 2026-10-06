# `source-map-js` security remediation

## Advisory and selected release

GitHub advisory GHSA-68fv-2mgg-jv7q reports affected versions `>=1.0.0, <1.2.2` and identifies `1.2.2` as patched. This remediation uses the existing compatible dependency ranges; it does not add a root dependency, override, or upgrade a parent package.

Advisory: <https://github.com/advisories/ghsa-68fv-2mgg-jv7q>
Package: <https://www.npmjs.com/package/source-map-js>

## Dependency paths and compatibility

The tracked lockfile has three incoming paths, each resolving to the single `node_modules/source-map-js` entry:

- `next@16.3.8 → postcss@8.5.23 → source-map-js@^1.2.1` (Next's PostCSS dependency is in the production dependency closure).
- Root `postcss@8.5.28 → source-map-js@^1.2.1` (root PostCSS is a development dependency).
- `@tailwindcss/postcss@4.3.3 → @tailwindcss/node@4.3.3 → source-map-js@^1.2.1` (development tooling).

All incoming ranges accept `1.2.2`. The lockfile-only update changed the existing source-map package entry from `1.2.1` to `1.2.2`, including the npm-resolved tarball and integrity supplied by npm's offline resolver. Parent versions, root ranges, and other lock entries are unchanged.

## Verification and limits

The change was resolved and installed offline. Dependency-tree checks confirm that the paths above use `source-map-js@1.2.2`; the single permitted high-severity audit run is recorded with the checkpoint report. This note does not claim that a development/build-only path is non-exploitable, nor that dependency presence alone establishes runtime exploitability.

The version range and patched release above are based on the advisory details supplied for this remediation. No live advisory or registry request was made. The unchanged braces advisory remains a separate security gate.

## Known unpatched development-tooling advisory

**Status: KNOWN UNPATCHED DEVELOPMENT-TOOLING ADVISORY.** The audit is still non-zero; this is a scoped exposure decision, not a remediation or an audit pass.

- Advisory: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), high severity (CVE-2026-93687).
- Installed package: `braces@3.0.3`, reached through `eslint-config-next@16.3.4 → @next/eslint-plugin-next@16.3.4 → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3`.
- GitHub currently lists affected versions `<=3.0.3` and no patched version. The npm registry reports `3.0.3` as the latest `braces` release.
- `braces` is present only in the development/lint dependency tree. `npm ls braces --omit=dev --all` is empty and `npm audit --omit=dev --audit-level=high` reports zero vulnerabilities. The full audit still exits non-zero with five high findings.
- The application source and runtime configuration do not import or call `braces`, `micromatch`, or `fast-glob`. The transitive caller is the Next ESLint plugin. Its `fast-glob` helper processes `settings.next.rootDir`; the current ESLint configuration does not set that option, and its ignore patterns are repository configuration literals. No HTTP request, provider payload, database value, or event data is passed into those patterns by the application.
- This limits the observed exposure to developer/CI lint tooling and repository-controlled ESLint configuration. It is not a claim that the advisory is fixed, that arbitrary future configuration is safe, or that CI availability risk is zero. PR code can change repository tooling/configuration, so the normal review/CI boundary remains relevant.
- Updating to the current stable Next.js pair does not remove the path: npm metadata reports stable `next@16.3.8` and `eslint-config-next@16.3.8`, with `@next/eslint-plugin-next@16.3.8 → fast-glob@3.3.1 → micromatch@4.0.8 → braces@^3.0.3`. No package or lockfile churn was made for this no-value update.
- Revisit when a patched upstream `braces` release becomes available or the vulnerable dependency path is removed from the supported lint toolchain.

## CI enforcement

The CI security job runs an unconditional production dependency audit with
`npm audit --omit=dev --audit-level=high`. It then evaluates the full
`npm audit --json --audit-level=high` report with
`scripts/check-dependency-audit.mjs`. The checker accepts only the exact
GHSA-vfj7-8cjw-p6xm finding on `braces@3.0.3` through the lockfile-verified,
development-only ESLint dependency chain above. It fails closed if the audit
schema, advisory, installed versions, dependency edges, or development-only
classification change, or if any other high/critical finding appears. A clean
production audit and this narrowly scoped full-tree exception do not make the
full `npm audit` command green. Remove the exception when upstream provides a
patched `braces` release or the affected dependency path is removed.

Verification on 2026-10-06: `npm explain braces`, `npm ls braces --all`, `npm ls braces --omit=dev --all`, `npm audit`, `npm audit --omit=dev --audit-level=high`, npm registry metadata for current stable packages, the installed Next ESLint helper, and application/config source searches. The full audit returned five high findings and exit code 1; the production-only audit found zero vulnerabilities and exited 0.
