# SEC EDGAR 8-K Fixture Claim Pipeline

Status: fixture-only, deterministic, and non-authoritative. This slice performs no SEC requests, writes no data, and cannot issue an authoritative event.

## Boundary and stages

The pipeline is in the upstream event-intelligence context, downstream of the SEC source qualification and upstream of any event authority. It implements these explicit stages:

1. **Fixture input** — `sec-edgar-8k-fixture-package/v1` accepts only tightly bounded synthetic metadata and UTF-8 plain-text documents.
2. **Metadata reconciliation** — submissions parallel columns, filing index, document descriptors and bytes must agree on CIK, accession, form, dates, primary document, amendment and document set.
3. **Filing package assembly** — authentic in-process package objects are minted only by the reconciler. An 8-K/A must reference an included same-CIK original 8-K.
4. **Artifact creation** — metadata, index, primary document and exhibit artifacts have separate deterministic content identities. Receipt/effective-availability material is separate.
5. **Claim extraction** — a fixed pipe-delimited synthetic grammar is bound to the extraction version and primary artifact fingerprint. There is no LLM or free-form interpretation.
6. **Claim-set validation** — claims, source artifacts and locators are sealed into sorted, unique membership with exact count and correction lineage.
7. **Fixture result** — the result is explicitly `NON_AUTHORITATIVE_EVENT_CLAIMS`; acquisition, persistence, authority and signals are all `BLOCKED` and side-effect counters are zero.

The pipeline never upgrades the SEC source qualification. Acquisition receipt, filing metadata, document content, artifact identity, extracted claim, event candidate and authoritative event remain separate concepts. No event-authority or persistence API is present.

## Synthetic input and canonical identity

Fixtures use reserved synthetic namespaces (`SYNTH-CIK-*`, `SYNTH-ACC-*`, `SYNTH-RECEIPT-*`, `asset:fixture:*`, `SYNTH-CUR-*`) and invented names only. These values are not SEC identifiers and do not identify real issuers, securities, assets, agreements or investments.

Only `text/plain; charset=utf-8` is accepted. Canonical text converts CRLF to LF and Unicode to NFC; other whitespace is preserved. NUL, BOM, lone CR, markup, active HTML, external-resource syntax, empty lines, tabs, unsupported encodings and documents outside the byte limits are rejected. Each descriptor binds sequence, type, filename, content type, canonicalization version, byte length and SHA-256. The package hash binds source profile, filing identity and descriptors, but excludes receipt timestamps. Artifact and claim identity therefore remain stable when the same fixture is observed at a later receipt time; the receipt fingerprint and overall replay fingerprint change separately.

The extraction grammar has one explicit key/value line for each supported field (item, event, lifecycle, synthetic issuer and asset candidates, announcement time, signing/expected-close/completion dates, amount class/value/currency, binding, and amendment reference/correction field). Unknown, repeated, missing, reordered only where prohibited, or malformed fields fail closed. Public results expose locators and excerpt hashes, never the raw document text.

## Claim semantics and correction lineage

Flow A is a synthetic Form 8-K Item 1.01 definitive purchase agreement: it records a signed/binding agreement, exact amount/currency, signing date and a separate expected closing date. It explicitly has no completion date.

Flow B is a different synthetic Form 8-K Item 2.01 completed purchase with an explicit completion date. Completion is accepted only when the supported fixture grammar says so; item metadata alone cannot establish it.

Flow C is an 8-K/A tied to Flow A's original accession and corrects the amount. Both artifacts and claims remain in the output; a typed append-only correction edge links the two. The original is never replaced or deleted.

Flow D is purchase intent with a target amount and expected closing date. It remains `INTENT`; a target is not exact consideration and expected closing is not completion. Missing amount is `UNKNOWN`, never zero. Currency and asset identity must be explicit. A symbol, ticker, CIK, or name does not create issuer/asset mapping authority.

Duplicate document locators and claims, conflicting unlinked lifecycle/amount material, missing original amendments, and wrong-CIK amendment links invalidate the whole sealed claim set. There is no newest-wins behavior.

## Runtime trust and limits

Module-local runtime trust is minted only by the package reconciler, artifact factory, extractor and claim-set builder. Copying, spreading, serializing or fabricating a package/artifact/claim loses trust. Fixture claims are never accepted as event authority; the authority-boundary function always returns `null`.

Synthetic tests prove parser, reconciliation, deterministic identity, receipt variance, correction lineage, immutability and fail-closed boundaries for these fixtures. They do **not** prove SEC response shape, actual filing contents, extraction accuracy on real documents, source completeness, legal status, source qualification, issuer/asset mapping, corroboration, or rights to acquire/store/use data.

## Next boundaries

Before a fixture pipeline consumes real fixture files, define fixture provenance and review controls separately. Before any live request, a separately approved acquisition slice must use the existing source qualification, approved server-side request identity, fair-access controls and bounded transport; this pipeline itself remains transport-free. Before authoritative events or persistence, add separately reviewed issuer and asset mapping revisions, corroboration, lifecycle/correction policy, source-artifact lineage, storage/retention/use approvals and an authority issuer that cannot be reached from fixture claims. Signal generation and trading remain later, separately gated contexts.

The SEC source's documented scope and current blockers remain in [SEC EDGAR 8-K Event Source Qualification](SEC_EDGAR_8K_EVENT_SOURCE_QUALIFICATION.md). No additional SEC behavior is inferred from these synthetic fixtures.
