# Coinbase Exchange ETH-USD live smoke boundary

Status: **READY FOR TECHNICAL REVIEW**, execution **BLOCKED_BACKEND_UNAPPROVED**.
Authority status: `NON_AUTHORITATIVE_MARKET_SMOKE`. This slice made **zero Coinbase
market-data requests**, read **zero credentials**, and performed **zero persistence
operations**. All response observations in tests are synthetic.

## Scope and approval

The separate server-only `m5-coinbase-exchange-smoke-authorization/v1` contract
binds Coinbase Exchange / `coinbase-exchange`, instrument `ETH-USD`, ETH base,
USD quote, exact hostname, profiles/paths/query fields, observed-field capabilities,
validity times, operator/review references, retention and every request budget.
Both `LOCAL_SMOKE` and `PRODUCTION` registries are empty and frozen. Parsing a
contract issues only module-local same-runtime descriptive provenance, never
operational authority or approval. The public runtime-authority predicate returns
false for parsed/created descriptions. Only the private registry resolver can
issue operational trust after an exact registry match; it exports no issuer.
Copies, spread, JSON and structured clones lack that trust. Execute additionally
requires the exact registry ID/fingerprint and valid environment/time; it currently
returns BLOCKED with zero requests. No caller registry or operational adapter can
be supplied to execute. `recordedAt` is excluded from the full material fingerprint.
Strict descriptor inspection rejects proxies before reflection, getters, symbols,
extra/inherited fields, non-plain shapes, duplicate references and unsafe IDs.

This adds no approval-registry or production-readiness change. CoinGecko Demo
smoke retains its separate credential requirements. Coinbase contracts contain
zero credential references and expose no environment or credential resolver.
Caller headers, credential options and unknown config fields are rejected before
rate lease, DNS or HTTP. Only fixed `accept: application/json` and
`accept-encoding: identity` transport headers are permitted.

## Request profiles and limits

| Profile | GET path | Query | Observation |
|---|---|---|---|
| PRODUCT_IDENTITY | `/products/ETH-USD` | none | Identity, display/status and optional documented availability flags |
| DAILY_CANDLES | `/products/ETH-USD/candles` | `end`, `granularity=86400`, `start` | Six-field OHLC/volume buckets |
| PRODUCT_STATS | `/products/ETH-USD/stats` | none | Presence of documented stats fields |

Require explicit canonical UTC timestamps (`YYYY-MM-DDTHH:mm:ss.sssZ`), midnight
start/end, start < end, and a half-open range of at most two daily buckets. Midnight
alignment and the two-bucket limit are **local safety rules**, not evidence of
Coinbase's bucket-origin semantics. Unknown query fields and paths are rejected.

Local budget: at most 3 requests, 1 per endpoint profile, 1 page each, 512 KiB per
response (524,288 bytes), 1,536 KiB maximum planned total, 5,000 ms per request,
zero retries and no Retry-After waiting. The current executable count is zero.
The port-level HTTP boundary handles one response per invocation; its separate
infrastructure batch runner accepts only authentic immutable plans and enforces
aggregate count/byte caps sequentially, once per profile. It is tested only with
fake ports and is not wired to CLI/execute. Real DNS/HTTP wiring is not installed.
The local lease is required even for public profiles and does not represent
Coinbase's shared IP-wide token bucket. Its reservation handle is released once
on success, error, deadline or caller cancellation, including late completion.
Releasing the local reservation does not refund a provider request token.

## HTTP boundary and parser

`requestCoinbaseSmokeObservation` is infrastructure plumbing exercised only with
fake lease, DNS and transport ports. It validates fixed HTTPS/GET/scope before
ports, acquires a lease, accepts only canonical public IPv4 answers, rejects mixed
public/private sets, and passes the selected address plus the unchanged TLS
servername and exact request host to `open`. The open-port contract requires pinned lookup and no
redirect following. It is separate from the existing credential-bearing Node
transport; only its public-IP predicate is reused. IPv6 is denied in v1.

The total deadline includes lease, DNS, open and bounded body consumption.
Timeout and optional caller cancellation abort and close the response; late port completion cannot
start subsequent phases. Non-200 (including 429), redirects, non-JSON content type,
non-identity encoding, oversized streams and excessive stream chunks fail closed.
Every chunk is checked using intrinsic typed-array byte length before allocation
and copied without caller getters, iterators or species. Only one bounded body is
parsed. Opaque transport errors are never inspected for message/code getters;
only internally branded safe error codes are preserved. Ports are snapshotted
before awaiting and are trusted infrastructure interfaces. Actual socket lookup,
TLS SNI, Host, proxy exclusion and redirect behavior remain obligations of the
future adapter: fake-port assertions prove the interface contract, not real Node
transport behavior. No raw response/header/cookie/error is returned.

Strict UTF-8 decoding and a bounded lossless JSON parser reject duplicate keys,
bad syntax, BOM, unpaired surrogate escapes, excessive nesting/node count and
malformed fields. Financial JSON number tokens are never converted to binary
floating point: OHLC and volume become exact decimal text plus integer coefficient
and scale, using BigInt comparisons. Decimal token and expansion bounds are local
parser limits (128 digits/scale); values outside them are rejected without rounding.
Stats decimal strings are validated but only field presence is returned.

Candles must contain exactly `[time, low, high, open, close, volume]`, with unique
non-overlapping timestamps and valid positive-price OHLC bounds/nonnegative volume.
Ascending or descending monotonic provider order is accepted and normalized to
ascending observed bucket starts using locale-independent ordering. Parser
`m5-coinbase-exchange-smoke-parser/v2` validates the entire bounded provider
response, up to the documented 300 candles, while selecting/auditing at most two
buckets in the planned half-open range. Valid pre-start and at/after-end rows are
excluded and counted separately (`providerCandleCount`, `excludedBeforeStart`,
`excludedAtOrAfterEnd`); they are not classified as corruption merely for being
outside the range. Duplicate/nonmonotonic/overlapping starts, bad decimals and
malformed arrays anywhere in the response still fail closed. The 512 KiB body,
300 provider-row and two selected-bucket bounds are separate gates. Excluded rows
grant no history coverage; the exact-body fingerprint includes them. Missing
buckets are observable as lower count, never filled or treated as completeness.

## Sanitized result and temporal boundaries

Each result binds provider/venue/instrument, profile, request count, receipt and
evaluation timestamps, parser version, exact-body SHA-256 payload fingerprint,
receipt-dependent observation fingerprint, observed product/status/availability,
candle timestamps/count/lossless values and stats-field presence. `providerTimestamp`
is null because these three reviewed schemas do not supply a distinct publication
timestamp; candle bucket start is kept separately. Fingerprints use canonical
UTF-16 key ordering without locale; the exact-body hash never includes receipt.
No payload, transport header,
private status-message text, source-qualification witness, normalized acquisition
package, persistence input, event authority, signal or trade is emitted.

The smoke can observe identity/status and candle/close/volume/stats field presence.
It proves no ETH-to-WETH canonical mapping, completed daily UTC-close authority,
gap-free/history coverage, correction/finality policy, exact rolling-24h volume
window/asOf, complete venue universe or production usage/storage rights. Named
venue and volume qualifications remain PARTIAL/BLOCKED. No observed online status
or numeric value grants READY status.

## CLI

```text
npm run m5:coinbase:smoke -- --start 2026-09-30T00:00:00.000Z --end 2026-10-02T00:00:00.000Z
```

Default mode prints scope, canonical queries, paths, budgets, zero credentials,
NON_AUTHORITATIVE_MARKET_SMOKE and production blocked. It has no file/env/DNS/HTTP
or persistence ports. `--execute` additionally requires `--environment LOCAL_SMOKE`
and an explicit `--authorization review:<identifier>` reference. A reference is
not authority: the empty pinned registry blocks execution before any loading or
network work. No runnable production authorization is created.

Next operative step after review is **one separately authorized live smoke** to
observe the current ETH-USD product and a tiny candle/stats sample. That step must
approve applicable terms/use, pin a reviewed authorization and separately install
and verify real pinned DNS/HTTP wiring behind the operational authority guard. It must not
qualify or persist the source. This implementation is not permission for that step.

## Official source review

The following primary pages were checked on **2026-10-02**, control time
**2026-10-02T19:26:07Z** for the independent pre-PR recheck. Documentation browsing was the only Coinbase access;
no `api.exchange.coinbase.com` endpoint or embedded example was executed.

| Page title | URL | Control time (UTC) |
|---|---|---|
| Get single product | https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-single-product | 2026-10-02T19:26:07Z |
| Get product candles | https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles | 2026-10-02T19:26:07Z |
| Get product stats | https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-stats | 2026-10-02T19:26:07Z |
| Exchange REST API Authentication | https://docs.cdp.coinbase.com/exchange/rest-api/authentication | 2026-10-02T19:26:07Z |
| REST Rate Limits Overview | https://docs.cdp.coinbase.com/exchange/rest-api/rate-limits | 2026-10-02T19:26:07Z |
| Market Data Terms of Use | https://www.coinbase.com/legal/market_data (resolved regional official page: https://www.coinbase.com/en-it/legal/market_data) | 2026-10-02T19:26:07Z |
| Exchange REST API Requests | https://docs.cdp.coinbase.com/exchange/rest-api/requests | 2026-10-02T19:12:00Z |

Product documentation establishes response fields, not today's ETH-USD listing.
Candles documents 86400-second granularity, max 300 points, potential pre-start
points and incomplete/no-tick intervals; response items include volume even though
the short introductory schema omits it. These facts motivate local fail-closed
observation bounds; they do not resolve close/finality qualification.

Stats documents 24-hour/30-day statistics and base-currency volume, but supplies no
exact window endpoints/asOf. Authentication documents the four CB-ACCESS headers
for signed REST access; endpoint examples omit them and rate-limit documentation
distinguishes public IP throttling from authenticated private profiles. This
boundary deliberately allows no signed/private request and treats any rejection
as failure; no account/key/authentication work is authorized. Public rates are
documented as 10 requests/s/IP with bursts up to 15; our lease is a local guard.

Market Data Terms of Use (updated August 7, 2026) restrict use to personal/entity
research scope and impose redistribution, derived-use and AI/automated-system
restrictions. This is a recorded blocker requiring separate applicable-use review,
not legal approval or a claim that free/public access grants storage/commercial
rights. Actual use and permission remain unapproved.

## Verification

`tests/financial/m5-coinbase-live-smoke.test.ts` uses only synthetic JSON, fake
rate lease/DNS/stream ports and fake timers. It covers exact scope, all budget
pins, unsafe shapes/proxies without traps, deterministic fingerprint/ordering,
runtime trust, auth rejection before ports, public DNS pinning, SSRF, response
limits/deadlines/type/encoding/UTF-8/JSON, exact decimals, malformed candles,
stats without semantic escalation, receipt-independent payload identity,
receipt-dependent observation identity, pure CLI and empty registry. Existing
provider/execution/readiness/source qualifications run unchanged as regressions.

Pre-commit checks on 2026-10-02: focused tests **114/114 twice**, existing provider,
smoke, execution, readiness and qualification regressions **203/203** across
18 files; full unit suite **946 passed / 35 skipped**. Typecheck, lint and
`git diff --check` passed; high-level npm audit found **0 vulnerabilities**;
`npm ls --all` exited 0. CLI dry-run passed and CLI execute returned the expected
BLOCKED/zero-request result. Final commit build is verified separately in a
detached worktree with no `.env*` during install/build, before push.

## Independent pre-PR review (2026-10-02)

Scope: all twelve changed files in `origin/main...40b1c76d615708495285a7e3e1173d4fdedbf961`,
including the complete contract, planner, parser, boundary, CLI, tests and linked
qualification documents. No provider/production policy, persistence or canonical
asset mapping changes are part of the fixes.

| Finding | Severity | Correction and targeted proof |
|---|---|---|
| Shadowed typed-array byte length/iterator could defeat admission before copy | High, resource boundary | Intrinsic byte slots checked before allocation; shadowed getters/iterator never called; oversized chunk rejected during streaming |
| Documented pre-start candles were classified as parser corruption | Medium | Separate 300-row provider validation from two selected buckets; 298 excluded + 2 selected test, post-end count, malformed/duplicate excluded rows still rejected |
| Local rate lease had no release contract | Medium | Once-only reservation cleanup on success, DNS/HTTP/parse error, timeout and cancellation; late lease/open never starts the next phase |
| Opaque error message access could invoke getters or fail sanitization | Medium | Private error branding; opaque message getter untouched and forged internal message rejected |
| Exported descriptive parser issued operational runtime trust | Medium, latent authority surface; empty registry blocked execution | Separate descriptive provenance from private registry-issued authority; parsed/copy/serialized objects never satisfy runtime-authority predicate |
| Shared hashing depended on locale ordering | Medium, deterministic identity | Local canonical UTF-16 ordering; throwing localeCompare proves no dependency; CoinGecko primitive unchanged |
| Blank CLI argument bypassed dry-run environment rejection | Low | Reject empty values; Windows subprocess exit-code and sanitized output tests |

The tests explicitly reject Coinbase observations at CoinGecko smoke, acquisition,
acquisition-ingestion handoff and manual persistence boundaries before credential,
rate, transport or UoW calls. Deep-freeze checks traverse every nested authority,
plan and observation. CLI subprocesses use an explicit minimal environment, the
programmatic TypeScript loader without IPC listening, and no network ports.

Review verification: focused Coinbase tests **158/158 twice**; provider/smoke/
execution/readiness/acquisition/qualification regressions **203/203** across
18 files; full unit suite **990 passed / 35 skipped**. Typecheck and lint pass;
`npm audit --audit-level=high` finds **0 vulnerabilities** and `npm ls --all`
exits 0 without invalid/extraneous/missing packages. Both working diff and
`origin/main...HEAD` pass `git diff --check`. Detached final-SHA env-free build
and test-material output scans are verified separately before push. The existing
Vite warning about the SEC test loader import extension is unchanged baseline
information. No SEC/database integration tests are run by this review.
Operational execution, source qualification and use/storage approvals remain
blocked.
