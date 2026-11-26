# Standing PAPER external price evidence package

`external-paper-price-evidence-package/v1` is an offline, provider-independent
content package built around a validated parser result. The first adapter
boundary uses only synthetic Kraken Post-Trade responses. It performs no
transport, persistence, source approval, or worker integration.

Each package binds an exact external instrument mapping (instrument ID, base
asset, venue product, venue, quote currency), the caller-asserted source
identity, the exact selected trade, and the parser's exact raw response and
payload fingerprint. Price and quantity stay as original decimal text plus
integer coefficient and scale. Trade, publication, and retrieval timestamps
retain their original precision alongside the parser's conservative
millisecond values. A SHA-256 fingerprint commits to the complete package
material; stable serialized input replays to the same fingerprint. Readback
reparses the original response and verifies the trade projection. Callers can
also supply a previously recorded fingerprint; replay with another fingerprint
fails closed.

This fingerprint is a content commitment, not proof of provider origin or an
authenticated signature. Package origin is always
`CALLER_SUPPLIED_UNVERIFIED`. The package also reports source approval as
`NOT_APPROVED`, and decision readiness as
`BLOCKED_UNCLASSIFIED_PRICE_TYPE`. A successfully parsed Kraken trade remains
`UNCLASSIFIED_POST_TRADE`: the parser does not assign `LAST_TRADE`, and neither
`count=1` nor response ordering establishes that it is the latest trade.
Package creation requires the caller to name a trade ID; it never selects the
last array element. No package is directly consumable by the standing PAPER
price resolver.

## Future decision and fill linkage

After an exact data product, rights, instrument map, and price semantics have
been independently reviewed and approved, a later persistence design can
store the immutable serialized package and its fingerprint as an append-only
price-evidence record. A decision should bind that record ID and fingerprint,
the approved `PaperPriceKind`, the resolver's normalized price and timestamp
cutoff, plus a separate decision-input fingerprint. A simulated fill should
reference the same decision and price-evidence record/fingerprint while
recording its own execution-price, quantity, fee, and fill fingerprint. Replay
must reread the immutable package, verify its fingerprint, re-run the approved
parser and price resolver, and reject any mismatch before reconstructing the
decision or fill. Ledger postings remain authoritative for financial effects.

That future linkage is a design note only. This change adds no database schema,
database writes, worker changes, provider requests, or source authorization.
