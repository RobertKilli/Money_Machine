# Standing PAPER Kraken Post-Trade transport boundary

This is a server-only, synthetic-tested transport boundary for the conditional
Kraken Spot REST `GET /0/public/PostTrade` candidate. It does not approve the
source, establish request rights, connect to the standing PAPER worker, read or
write a database, or create a price decision.

## Fixed transport contract

- HTTPS host is fixed to `api.kraken.com`; the path is fixed to
  `/0/public/PostTrade`. Callers supply an exact external instrument/source
  binding, never a URL, host, path, or query string. The only request query is
  that binding's exact pair symbol plus fixed `count=1`.
- `count=1` is a request bound only. It does not prove the item is the latest
  trade. The parser and evidence package continue to represent an
  `UNCLASSIFIED_POST_TRADE` record; they never set `LAST_TRADE` or decision
  readiness. The caller must name the trade ID that the package records.
- Node `https.request` uses certificate verification (`rejectUnauthorized`),
  has no redirect handling and no retry loop, requests identity encoding and
  closes its socket after the response. A redirect is rejected.
- The response cap is 64 KiB. Only HTTP 200 with JSON and identity encoding is
  accepted; bytes are decoded with fatal UTF-8 before JSON parsing. Connect
  timeout is 2 seconds and total request timeout is 5 seconds. Caller abort,
  timeout, and error paths abort the request and clear timers/listeners and the
  process-level in-flight marker.
- The process allows at most one active request and at least 1 second between
  requests. Excess calls fail closed rather than queueing or retrying. This
  implementation's cap is stricter than the reviewed provider ceiling.
- Receipt time is captured after the full response body reaches the transport
  boundary. Because the clock has millisecond precision, one millisecond is
  added to the captured time before passing retrieval time to the parser.
  Request, response payload, and combined transport fingerprints are returned
  with the evidence package.

## Operational gates and remaining evidence

The default instrument binding list is empty. The default authorizer returns
`sourceApproval: NOT_APPROVED` and `runtimePermission: NOT_AUTHORIZED`, and the
normal exported entrypoint stops before opening a socket. The factory
dependencies used by tests inject only synthetic HTTPS-like responses. No
operational approval, request permission, source credential, or product
mapping has been provisioned.

The source review still blocks external acquisition and use until written
permission covers automated PAPER processing, intended storage/retention and
display. It also requires static authoritative identity evidence for an exact
active Kraken pair and its venue MIC mapping. The current model has one venue
binding while Post-Trade returns trade and publication MIC fields; their
relationship must be qualified before any live binding is configured.

Price semantics remain unresolved. Official documentation reviewed so far does
not prove that `symbol` plus `count=1` returns the latest eligible trade, nor
does it qualify `publication_ts` as a bounded-availability guarantee. This
transport's response is therefore never decision-ready and cannot be used as
`LAST_TRADE`. Before any live run, source rights, exact instrument/venue
identity, publication-time availability, latest-as-of semantics, freshness,
retention, and the product's price-use policy must be separately documented
and approved. See [the source review](STANDING_PAPER_MARKET_SOURCE_REVIEW.md).

All transport tests use injected synthetic responses and assert that the
default, unapproved entrypoint makes no network request. No provider endpoint
was called during this implementation.
