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
