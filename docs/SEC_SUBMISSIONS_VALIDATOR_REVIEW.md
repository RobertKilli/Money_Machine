# SEC submissions validator review

This review investigates the sanitized outcome
`SEC_SUBMISSIONS_SCHEMA_INVALID / SUBMISSIONS / FIELD_INVALID /
filings.recent.accessionNumber` from the one bounded metadata smoke.

The live submissions response was not retained. This review does not recreate
its bytes, infer its contents, or claim that a synthetic case explains the
live failure.

## Contract comparison

The repository qualification documents a CIK-scoped submissions record with
parallel filing-field arrays and a general accession representation of
`##########-YY-######`. The adapter must preserve row alignment, allow an empty
recent list so referenced history can be considered, and enforce exact filing
identity only for the selected accession. Other recent rows can legitimately
describe different forms and filings.

The adapter already accepts empty equal-length arrays, checks parallel lengths
before zipping, accepts general form strings, validates accession syntax
without requiring the selected CIK/accession on unrelated rows, and compares
the selected form/date/primary filename only after accession selection. The
new regression covers a non-target 10-K row beside the selected 8-K row and
retains the existing empty-recent/history transition test.

One diagnostic defect was confirmed: the string-array predicate classified a
non-string element the same as a field whose value was not an array. The parser
still rejected both inputs, but the reason code did not identify which
contract failed. Diagnostics now distinguish `FIELD_MISSING`, `FIELD_INVALID`,
`ARRAY_ELEMENT_INVALID`, `ROW_INVALID`, and
`PARALLEL_ARRAY_LENGTH_MISMATCH`; they contain only fixed field paths and no
response values.

## Evidence and limits

- Synthetic adapter tests prove the listed branches and preserve exact selected
  filing reconciliation and manifest checks.
- The first live request failed before history or filing-index validation. Its
  raw response was discarded; the reported field-level failure cannot be
  independently diagnosed from retained evidence.
- These tests do not prove that the prior SEC response was malformed, that the
  validator caused the live outcome, or that SEC responses generally contain
  non-string accession elements.
- No live request, provider call, database operation, qualification change, or
  permit change is part of this review.
