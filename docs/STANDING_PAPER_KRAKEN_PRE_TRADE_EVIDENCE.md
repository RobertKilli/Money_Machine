# Offline Pre-Trade evidence and replay

Baseline: `9c763d8b1114cbdc18bab1abcc3b25db2f15dbb5` (PR #100).

`kraken-pre-trade-evidence-package/v1` bundles one caller-supplied book response
with explicit instrument and source assertions. This is an offline content
commitment, not an authenticated quote or a source qualification.

## Contract

`createKrakenPreTradeEvidencePackage` accepts raw JSON text, its caller-supplied
retrieval time, an `ExternalPaperInstrument` and `PaperPriceSource`. It invokes
the existing Pre-Trade parser itself; callers cannot provide a trusted parsed
projection. Pair symbol, base asset, quote currency and venue must match the
raw response exactly. Provider ID must be `kraken`; source dataset/adapter labels
remain bounded caller assertions. The instrument ID must be a nonempty
`paper.external.*` identifier, not a fixture asset. No conversion from USD to NOK
is performed, and there is no account or worker connection.

The package preserves all bid/ask levels in their response order, including
response indexes, side, exact price and quantity strings/coefficient/scales,
order counts, original submission/publication times and their mechanical
floor/ceil millisecond projections. It also carries original/ceil retrieval time,
parser version, raw-text SHA-256 and the complete raw JSON text. Empty sides,
duplicates, unsorted levels and crossed prices remain evidence; none is selected
as the best or an executable quote.

A canonical SHA-256 covers all package material except the fingerprint itself:
contract and parser versions, trust markers, instrument/source assertions,
complete level projection, original/normalized times, raw text and raw-text
fingerprint. The existing repository canonicalization is reused. Exact monetary
and quantity values remain decimal strings; no financial floating point is used.

## Verification and serialization

- `verifyKrakenPreTradeEvidencePackage(value, expectedFingerprint?)` reparses raw
  text under the supplied binding, reconstructs the bounded package, computes
  its fingerprint and requires the candidate to match every projected field.
  Extra fields, changed parser versions, trust markers and normalized values
  are rejected, even when the raw response is unchanged.
- Verification walks only the bounded reconstructed shape. It does not hash
  arbitrary caller graphs, so cyclic/deep extras are rejected without recursive
  traversal of those extras. Own data properties are required by the comparison.
- Verification returns a newly reconstructed, deeply frozen graph. Creation,
  verification and readback retain no caller-owned object references.
- `serializeKrakenPreTradeEvidencePackage` verifies before producing stable JSON
  text. `readKrakenPreTradeEvidencePackage` bounds the text, parses and verifies
  it. Neither function reads/writes files or stores data in a database.

Raw text is limited by the parser's **65,536 UTF-8 bytes**, and each side by ten
levels. Serialized text is limited to `2 * 65,536 + 32,768` characters: this
accounts for JSON escaping of raw text plus the bounded normalized projection.
Oversized material fails closed. Failures return fixed codes without raw values;
the serializer throws a fixed prefixed error when verification fails.

An externally retained expected fingerprint detects replacement with another
otherwise internally consistent package. Without that expected commitment,
changing a source assertion or retrieval time and rebuilding the entire package
can produce another internally valid package. A hash does not establish who
provided the data or whether the assertions are true. It is not a signature,
proof of acquisition, or approval.

## Boundaries retained

Every package remains `CALLER_SUPPLIED_UNVERIFIED`, `NOT_APPROVED`, snapshot
`UNVERIFIED`, and `BLOCKED_UNVERIFIED_QUOTE_SEMANTICS`. The package contains no
selected quote, price-kind assignment, midpoint, freshness guarantee or mapping
to decision-ready `observedAt`/`availableAt` semantics. Historical evidence can
remain structurally valid while being unusable for a current decision.

No transport, operational registry, database schema, persistence path, policy,
worker, execution or Post-Trade contract changes are included. All regression
material is synthetic. No market-data request or outbound email is needed.
Rights and economic time/snapshot semantics remain subject to the separate
[Kraken clarification](STANDING_PAPER_KRAKEN_DATA_CLARIFICATION.md).

## Focused checks

```sh
npx vitest run tests/financial/kraken-pre-trade-evidence-package.test.ts tests/financial/kraken-pre-trade-parser.test.ts tests/financial/external-paper-price-evidence-package.test.ts tests/financial/kraken-post-trade-parser.test.ts
```

Regressions cover exact roundtrip, raw/source/retrieval binding, mutation,
recomputed fabricated projections, caller assertions versus authentication,
wrong currency/identity, empty/unsorted/duplicate/crossed books, replay pinning,
escape-heavy maximum-size raw text, oversized serialization and cyclic extras.
