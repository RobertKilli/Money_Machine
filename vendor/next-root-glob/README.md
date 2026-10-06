# Next root-directory glob adapter

This private development package is installed under the `fast-glob` dependency
name only for `@next/eslint-plugin-next`, using a scoped npm override. Its real
package name is `@money-machine/next-root-glob`. It contains no fast-glob,
micromatch or braces code. Application dependencies and other dependency scopes
are unchanged.

Next 16.3.4 uses this dependency only through `globSync(pattern,
{ onlyDirectories: true })` in `dist/utils/get-root-dirs.js`. This adapter provides
that narrow API; other invocations throw rather than silently losing lint
coverage. It is not a general fast-glob replacement.

The adapter uses tinyglobby 0.2.17 and picomatch 4.0.4. It disables directory
expansion, keeps absolute/literal path spelling, excludes terminal-globstar base
directories, and includes matching directory symlink aliases that tinyglobby
traverses but omits from its directory results. It preserves tinyglobby's cycle
handling. Broken symlinks are skipped; unrelated filesystem failures propagate.

The regression suite checks the actual Next resolver against baseline directory
results, verifies every upstream plugin distribution file against its original
hash, compares all 113 effective lint rules/options, and exercises actual lint
violations. A future Next plugin change requires reviewing this adapter's API
assumptions; the hash gate deliberately fails until that review happens.

Remove this adapter and scoped override when a compatible upstream dependency
chain no longer includes the vulnerable packages, after the same regression
checks pass. No audit filter or vulnerability waiver is used.

Reference: https://superchupu.dev/tinyglobby/migration
