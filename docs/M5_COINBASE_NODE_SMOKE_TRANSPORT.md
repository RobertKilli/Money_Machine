# Coinbase Node smoke transport

Current local status: **AUDIT_REMEDIATION_VERIFIED / APPROACH_REVIEW_REQUIRED**.
This uncommitted preparation has a clean full audit through the narrow local
Next root-glob adapter described in `NEXT_LINT_GLOB_REMEDIATION.md`. This is a
proposed alternative to the original upstream-only remediation, requiring review;
it is not an upstream patch, merge permission or live-data authorization.
The original checkpoint history and prior blocker evidence are retained below.

Execution: **BLOCKED_BACKEND_UNAPPROVED**. Both Coinbase authorization registries
remain empty. The native adapter is implemented and tested with fake primitives;
live DNS, TLS and Coinbase responses have **not** been verified. No authority,
approval, credential, persistence or ETH/WETH mapping is added.

## Composition and authority boundary

`createCoinbaseSmokeExecutor()` exposes the existing application boundary and a
strict CLI reference boundary. A reference alone never becomes authority. Both
paths stop at the empty private registry before lease/DNS/request construction.
`executeCoinbaseSmoke` dynamically imports the server-only native module only
after the existing exact authorization/environment/time guard succeeds. The
native entrypoint checks that guard again and requires a same-runtime immutable
request plan. Caller ports, headers, agents, registries and credentials are not
accepted. Dry-run only constructs the descriptive plan.

No production injection interface, socket handle, raw response, trust issuer,
mutable singleton or environment resolver is exported. Private Node primitives
default to `node:dns`, `node:https` and `performance.now()`. Tests access private
functions through a Vitest compiler transform under `tests/helpers`; this plugin
is absent from Next.js/CLI compilation and introduces no production export or
runtime trust bypass. Positive fake executions exercise the actual private
request builder without pretending to possess operational authorization.

## DNS and pinning

A fresh resolver queries A and AAAA for the internally fixed
`api.exchange.coinbase.com`, with one try, remaining-deadline timeout and explicit
cancellation. ENODATA for one family is allowed; opaque resolver errors, empty
answers and more than 32 combined answers fail closed. This answer-count ceiling
is local safety policy. Addresses are parsed with Node's IP validator and
canonicalized. Invalid, duplicate or mixed public/forbidden answers reject the
entire set. IPv4-mapped IPv6 is normalized to IPv4 before filtering/deduplication.

IPv4 excludes private, loopback, unspecified, link-local, carrier-grade NAT,
benchmark, documentation, multicast/reserved and special-purpose prefixes.
IPv6 conservatively permits only `2000::/3`, excluding `2001::/23`,
`2001:db8::/32`, `2002::/16` and `3fff::/20`. These local conservative exclusions
also reject some IANA global exceptions; they are not a complete classification
of every address as globally unreachable. Transition/local/special ranges outside
the permitted prefix are denied. Selection is IPv4 first, then numeric address
order within family. Only the first validated address is attempted, with no
retry/failover. IP selection is private transport material, never payload or
observation identity.

The HTTPS logical hostname, TLS SNI and Host remain the exact Coinbase hostname.
Custom lookup returns only the chosen address/family, including Node's `all`
lookup form, without another DNS query. Requests use HTTPS GET and a revalidated
exact path/canonical query; no body, userinfo, port override, fragment or redirects.

## TLS, agent and headers

Each request creates a dedicated internal agent: no keepalive, one socket,
no cached TLS sessions and empty explicit `proxyEnv`. The global agent and caller
agents are unused. Native transport never reads proxy environment variables.
Explicit CA material comes solely from Node's bundled `rootCertificates`,
excluding environment/system extra roots. Certificate verification is explicitly
enabled, the built-in hostname verifier is retained and minimum TLS is 1.2.
No caller CA or IP SNI is accepted. Options are tested directly; no live
certificate validation or connectivity claim is made.

Headers are fixed internally: Host, `Accept: application/json`,
`Accept-Encoding: identity` and `User-Agent: MoneyMachine-Coinbase-Smoke/1`.
Auth, cookie, forwarding, proxy and arbitrary caller headers have no input path.
Response headers are bounded to 8 KiB by the native parser. Duplicate security
headers, non-200 status, redirects, non-JSON types and non-identity encoding are
rejected before body consumption. JSON permits absent charset or UTF-8 only.
429 produces a sanitized rate-limit code, without Retry-After waiting.

## Streaming, deadline and cleanup

Intrinsic byte length is checked before each private chunk copy. The 512 KiB
per-response and 1.5 MiB execution limits apply during streaming; excessive
content-length is rejected before data, understated length cannot defeat the
stream limit, and a length mismatch is rejected at end. At most 4,096 chunks
are admitted as a local fragmentation/memory bound. Bodies are parsed one at a
time by the existing bounded strict UTF-8/lossless JSON parser. Compression is
never decoded: gzip/br/deflate are rejected. No raw body, headers, DNS addresses,
Node errors or request handles enter observations/errors.

One monotonic deadline starts before the local lease. DNS, connect, TLS, headers,
body and parser checks consume the same five seconds across all three requests.
Each phase receives only the remaining budget. A single deadline timer and
AbortSignal stop outstanding work; no wall-clock timeout arithmetic or retries
are used. Private injected clocks/timers make tests deterministic without sleeps.
Wall-clock receipt/evaluation timestamps remain distinct from this deadline.

Completion is once-only. Success/error/timeout/cancellation destroy response,
request and agent, discard private chunks, clear the execution timer and release
the local reservation once. Active listeners are removed. Minimal terminal
error sinks remain only until native close, preventing asynchronous destroy
errors from becoming unhandled; close removes them. Late lease grants are
released; late resolver/response callbacks cannot restart subsequent phases.

The rate lease is per execution, bounded to three distinct profiles, with one
active request and FIFO ordering. Release does not refund a provider request.
This is local safety admission, not Coinbase's IP-wide rate bucket or a
cross-process/distributed quota: other apps sharing the public IP can cause 429.

## Verification and blockers

Transport/composition/CLI tests use synthetic payloads, fake DNS/HTTPS primitives,
fake leases and deterministic clocks. Native defaults are replaced by throwing
network canaries. Tests inspect actual request/agent options, validate IPv4/IPv6
sets, exact byte ceilings, identity encoding, sanitization, event cleanup,
timeout/cancel at each phase and late callbacks. Public execute and CLI execute
remain blocked before all primitive factories; dry-run has no operational effects.
Coinbase parser/authority and CoinGecko/provider/readiness behavior are retained.

Security/merge blocker: `npm audit --audit-level=high` reports five high audit
nodes caused by one installed `braces@3.0.3` instance
([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)).
Affected versions are `braces <=3.0.3`; there is no published patched release at
the 2026-10-03 upstream triage. Registry latest remains 3.0.3. Exact dependency
path, entirely dev-classified in the lockfile:

```text
eslint-config-next@16.3.4
  -> @next/eslint-plugin-next@16.3.4
  -> fast-glob@3.3.1
  -> micromatch@4.0.8
  -> braces@3.0.3
```

A clean disposable worktree at baseline
`0672e9af2e31d019e198b4a000c11eea71f2fd52`, with an unchanged package/lockfile and
fresh `npm ci`, reproduced exit 1 and the same five high findings. Dev-only
classification does not pass the existing CI security job, which audits dev
dependencies with `npm audit --audit-level=high`. The lint config imports
`eslint-config-next`, so removing it as unused would break an existing gate.
Compatible config/plugin 16.3.8 still pins fast-glob 3.3.1; even fast-glob 3.3.3
still requires micromatch 4.0.8 and braces. npm's proposed config downgrade to
14.2.35 lies outside the root range and requires ESLint 7/8 rather than the
installed ESLint 9. No remediation, downgrade, override or waiver is applied.

The user separately authorized a normal checkpoint commit/push despite the red
audit gate. This exception grants no merge/review readiness or production
approval. Final committed-SHA build and production bundle inspection are
intentionally not performed while the overall security gate is red. Static
production import/export checks and sanitized CLI output tests verify that the
private Vitest transform and fixture/sentinel values are absent from those paths;
they do not substitute for a later compiled-bundle inspection.

Local verification on 2026-10-03 (before commit):

| Gate | Result |
|---|---|
| Transport/composition/CLI fake tests | 115/115, twice |
| Existing Coinbase boundary | 158/158 |
| Provider/smoke/execution/readiness/acquisition regressions | 203/203 |
| Full unit suite | 1,105 passed / 35 skipped |
| Typecheck / lint / working diff check | Passed |
| `npm ls --all` | Exit 0; optional platform/peer omissions only |
| `npm audit --audit-level=high` | Exit 1, five high findings in existing lint chain |
| Commit / push | Explicitly authorized blocked checkpoint only |
| Final-SHA env-free build / compiled-bundle inspection | Not performed while security gate is red |

Next slice: separately review applicable terms/use, issue a short-lived
registry-pinned Coinbase smoke authority, implement reviewed CLI reference
resolution and authorize exactly one live smoke. This implementation grants no
live execution, production qualification, storage, persistence, signal or trade.

## Official implementation references

Checked at **2026-10-03T04:36:18Z**. Documentation requests are separate from
provider endpoint/DNS/transport execution; no Coinbase endpoint was contacted.

| Page title | Official URL |
|---|---|
| HTTPS | https://nodejs.org/api/https.html |
| DNS | https://nodejs.org/api/dns.html |
| HTTP (Node 22) | https://nodejs.org/docs/latest-v22.x/api/http.html |
| TLS (Node 22) | https://nodejs.org/docs/latest-v22.x/api/tls.html |
| IANA IPv4 Special-Purpose Address Registry | https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml |
| IANA IPv6 Special-Purpose Address Registry | https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml |

Node 22 HTTP documents explicit agent proxy options; TLS documents that explicit
CA replaces default CA selection, and `rootCertificates` exposes the bundled
roots. IANA registry exclusions inform a conservative local allow policy.
Existing reviewed Coinbase endpoint/rate/terms references remain in the
[smoke-boundary document](M5_COINBASE_ETH_USD_LIVE_SMOKE_BOUNDARY.md).

## Current-main preparation — 2026-10-06

The existing transport/composition/CLI implementation from `723d77c5cfc1409dc3451cb7adb52f67c4dcfe82` was applied as an uncommitted patch to main `1c555ff87d8213fe4ccbc686fba6be3c0981dbb1` in an isolated worktree. The original branch remains unchanged. This is preparation for technical review, not a completed live-data/UI milestone or merge authorization. No authorization registry was changed. No provider request, credential access or persistence occurred.

The baseline `npm audit` still reports five high package findings through `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`. These are one transitive advisory, not five independent product defects. Current registry metadata for eslint-config-next/plugin 16.3.8 still includes fast-glob 3.3.1; braces latest is 3.0.3. GitHub advisory GHSA-vfj7-8cjw-p6xm lists no patched version. A compatible official dependency update has therefore not been identified. No downgrade, package override, audit exclusion or security waiver is applied.

The next bounded live-data candidate is this public Coinbase Exchange ETH-USD smoke (three fixed GET profiles, at most two daily buckets, one run, no retries, in-memory observations only). Operational authority remains absent, and this checkpoint creates neither persistence nor UI integration. Event-source acquisition is a separate next path: SEC filing evidence first, broad GDELT discovery later; NewsAPI and issuer/exchange feeds remain deferred.

## Latest local remediation — 2026-10-06

Full audit now exits zero with zero findings. The vulnerable glob dependency
chain is removed through a Next-scoped local adapter; upstream rule code and
all 113 effective lint rules/options remain unchanged. Fresh npm ci, dependency
graph validation, compatibility regressions, typecheck and lint pass. Full unit
suite: 1,624 passed / 35 skipped. Local uncommitted Next production build passes;
18 client JS bundles contain no private transport-test or lint-adapter markers.
CLI dry-run works, and execute without a pinned authority still blocks with zero
provider requests. Both approval registries remain empty. These observations
supersede the previous local audit blocker, not the historical Oct 3 evidence.

No commit, push, merge or live provider request has occurred. The local adapter
approach must be reviewed explicitly as a maintenance tradeoff. The larger
source-to-persistence-to-UI milestone remains unfinished.

## Current Coinbase use-terms recheck — 2026-10-06 11:22 UTC

**Execution remains BLOCKED by use terms.** The official [Coinbase Market Data
Terms of Use](https://www.coinbase.com/legal/market_data), last updated
2026-08-07, define Market Data broadly to include data Coinbase makes available,
including exchange order and transaction information. Their general license is
for personal or research purposes for the user/entity's officers and employees,
and does not permit building an application for other end users. Without prior
express written Coinbase consent, the terms also prohibit using Market Data or
Derived Works to develop, validate, benchmark or improve an algorithm or other
automated system. Money Machine's proposed automated market-data processing is
within that stated restriction. This finding concerns the fixed public
ETH-USD product/candles/stats smoke profiles documented above; it does not
assume that public unauthenticated endpoints create a separate usage right.

This is a documentation-only status update: no Coinbase endpoint was queried,
no terms were accepted, no authorization was issued, and the `LOCAL_SMOKE` and
`PRODUCTION` authorization registries remain empty. The implemented transport
and request profiles are retained unchanged. A future Coinbase use requires a
separate written permission that expressly covers Money Machine's automated
algorithm/system use and intended audience; this review does not grant that
permission.
