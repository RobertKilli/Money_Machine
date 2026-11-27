# Pre-Trade offline acceptance demo

Baseline: `0e1bc45b1dd74a1a4076a24fe3ff4bf392647c78` (PR #101).

```sh
npm run paper:kraken:pre-trade:offline-acceptance
```

Use `npm run --silent paper:kraken:pre-trade:offline-acceptance` when stdout
must contain only JSON; ordinary npm output also includes its command banner.

The command uses only hardcoded synthetic material. No API credentials,
operator contact, `.env` file, runtime approval or database is read or needed.
It runs from the repository root using Node's `tsx` import loader and the root
TypeScript aliases; it does not start the `tsx` CLI's IPC server.

## What PASS means

The entrypoint asserts a complete offline chain: synthetic raw response →
Pre-Trade parsing → evidence package (which reparses raw text) → serialization →
readback with the expected fingerprint. The separate parser and package raw-text
fingerprints must match, replay must reconstruct identical evidence, and
serialization must be stable. The synthetic bid list is intentionally unsorted;
its original order must survive the entire chain.

The command also asserts rejection of a manipulated projected price, a wrong
expected fingerprint, wrong currency/identity, reversed nanosecond timestamps,
wrong side, provider error, invalid JSON and oversized raw text. An empty book
roundtrips as valid evidence while remaining blocked for decision use.

The JSON report includes all scenario outcomes, exact decimal strings,
coefficients/scales, original and mechanically normalized level/retrieval times,
instrument/source assertions, parser/raw fingerprint and package fingerprint.
It omits the raw response itself. A failure exits nonzero with the fixed
`KRAKEN_PRE_TRADE_OFFLINE_ACCEPTANCE_FAILED` message; it does not dump arbitrary
assertion payloads or raw values.

The synchronous scenario window temporarily denies HTTP/HTTPS requests/gets,
global fetch, TCP socket connects and TLS connects. Attempted calls increment
a counter and throw; PASS requires `networkRequests: 0`. Built-in references
are restored in `finally` before printing the report. This is a regression
canary for these Node APIs during the scenario window, not an OS-level network
sandbox, a guard on module-loading/startup, or a general audit of other scripts.

There is **no Pre-Trade transport** in this chain. Timeout, abort, HTTP status,
streaming and transport acquisition behavior are not exercised here and are not
claimed by this acceptance. The existing Post-Trade transport demo and its
low-level requester tests are separate.

## Trust and operational boundaries

The output is explicitly `SYNTHETIC_TEST_ONLY`. Source origin remains
`CALLER_SUPPLIED_UNVERIFIED`, approval `NOT_APPROVED`, snapshot semantics
`UNVERIFIED` and decision readiness `BLOCKED_UNVERIFIED_QUOTE_SEMANTICS`.

Neither best bid/ask selection, a midpoint, `LAST_TRADE`, source authenticity,
freshness nor coherent snapshot semantics is established. The declared symbol,
venue and USD currency are test assertions. No USD/NOK conversion is performed.
There is no worker, policy, account, persistence, authorization registry or
external data fallback. Success does not authorize a provider request or prove
strategy performance. Kraken permissions and price/time semantics still need
the separate [clarification](STANDING_PAPER_KRAKEN_DATA_CLARIFICATION.md).

## Regression check

```sh
npx vitest run tests/financial/kraken-pre-trade-offline-acceptance.test.ts tests/financial/kraken-pre-trade-parser.test.ts tests/financial/kraken-pre-trade-evidence-package.test.ts
```

The CLI regression executes the real entrypoint in child processes, checks the
scenario/trust report and verifies identical output across independent restarts.
Parser and package tests retain their detailed malformed-input and replay cases.
