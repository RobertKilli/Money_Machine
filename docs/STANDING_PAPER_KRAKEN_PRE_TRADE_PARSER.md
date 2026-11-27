# Offline Kraken Pre-Trade parser

Baseline: `43a9930786d890cb7516401dfd5e1e5dd41ac2ab` (PR #99).

`parseKrakenPreTradeResponse` accepts caller-supplied JSON text, an explicit
pair/base/quote/venue binding and a caller-supplied retrieval timestamp. It does
no I/O. The shape follows the single-book response example in Kraken's
[Pre-Trade reference](https://docs.kraken.com/api-reference/transparency/pre-trade-data),
reviewed 2026-11-27. No market-data endpoint was called. Synthetic test identities
and levels are not evidence for any actual pair, venue or source approval.

## Accepted material

- An empty provider error array and one result object with exact symbol, base,
  quote and venue matches; `CLOB`, `UNIT` base and `MONE` quote notation.
- Separate `bids` / `asks`, containing `BUY` / `SELL` levels respectively.
- Positive decimal-string price and quantity, preserved as original text plus
  an exact integer coefficient and declared scale. No financial float math.
- Positive safe-integer order counts, original per-level submission and
  publication timestamps, original retrieval timestamp, raw JSON text and its
  UTF-8 SHA-256 fingerprint. Optional/unknown source metadata remains in raw JSON.

The local response limit is **65,536 UTF-8 bytes**, including unknown metadata.
Each side is limited to ten levels. Decimal strings are limited to 64 characters.
These are parser restrictions, not a right to access the API or a completeness
guarantee. Array/multi-book response variants are not accepted by this version.

Timestamp parsing reuses the unchanged exact decimal/timestamp implementation
extracted from the Post-Trade parser. It checks calendar validity and up to nine
fractional digits using integer nanoseconds before normalization. A conservative
local restriction rejects submission after publication or publication after
caller-supplied retrieval; this is not an asserted Kraken clock guarantee.
Submission milliseconds round down; publication and retrieval round up. Fields
are named `submissionAtFloor`, `publicationAtCeil` and `retrievedAtCeil`, not
`observedAt` or `availableAt`: the economic mapping remains unresolved. Original
strings remain available for later review and versioned mapping.

The result and all nested projected objects/arrays are frozen and hold no caller
object references. Identical raw input and binding replay identically. The payload
fingerprint binds raw text only; it does not authenticate source, instrument,
retrieval time or approval. A future evidence envelope must bind these together.
Failure results contain fixed codes only, never response values or raw JSON.

## Explicit semantic boundary

`VALID` means only that the supplied text passes this local parsing contract.
The result always has:

- `sourceOrigin: CALLER_SUPPLIED_UNVERIFIED`
- `sourceApproval: NOT_APPROVED`
- `snapshotSemantics: UNVERIFIED`
- `decisionReadiness: BLOCKED_UNVERIFIED_QUOTE_SEMANTICS`

Response order and each level's original index are preserved. The parser does
not sort, deduplicate, choose best bid/ask, construct a midpoint, assign
`LAST_TRADE`, or assert a coherent/current snapshot. Duplicate levels, unsorted
levels, crossed prices and empty sides remain inspectable evidence; none can
be used as a decision-ready quote through this parser. No synthetic fallback
or price is invented for an empty side.

Old timestamps can be valid historical evidence. Price age, a decision cutoff,
clock tolerance and quote selection belong to a later, explicitly versioned
qualification/projection. The parser does not impose or claim those guarantees.

The parser itself adds no Pre-Trade transport, database storage, account,
policy, worker hookup, source qualification or runtime authorization.
Existing Post-Trade output contracts and fixture-worker behavior are unchanged.
The subsequent [offline evidence-package layer](STANDING_PAPER_KRAKEN_PRE_TRADE_EVIDENCE.md)
adds content commitments and verified replay without changing parser semantics
or enabling decision use.
See [the clarification and unsent email draft](STANDING_PAPER_KRAKEN_DATA_CLARIFICATION.md)
for outstanding permissions, level selection and snapshot/time semantics.

## Synthetic regression command

```sh
npx vitest run tests/financial/kraken-pre-trade-parser.test.ts tests/financial/kraken-post-trade-parser.test.ts tests/financial/external-paper-price-evidence-package.test.ts
```

Tests cover exact arithmetic, nanosecond ordering, pre-epoch/day rollover,
identity/side/venue/notation conflicts, malformed envelopes, provider errors,
empty/unsorted/duplicate/crossed levels, byte and level limits, mutation and
deterministic replay. They do not validate Kraken responses or grant usage rights.
