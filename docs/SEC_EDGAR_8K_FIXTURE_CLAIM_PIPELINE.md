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

Only `text/plain; charset=utf-8` is accepted. Canonical text converts CRLF to LF and Unicode to NFC; other whitespace is preserved. Control/format characters except line feed, BOM, lone CR, markup, active HTML, external-resource syntax, empty lines, tabs, unsupported encodings and documents outside the byte limits are rejected. The document content SHA-256 is computed over the canonical UTF-8 bytes. Each descriptor binds sequence, role, unique document type, filename, content type, canonicalization version, byte length and lowercase SHA-256. The filing index declares and must match the exact descriptor count. The package hash binds source profile, filing identity and descriptors, but excludes receipt timestamps.

Artifact identity binds source profile, filing key, role/sequence/document type/filename, content type, canonicalization version, byte count and canonical content hash. It does not bind the whole package fingerprint, so changing a separate exhibit does not re-identify an unchanged primary document. Package and sealed claim-set identities still bind the complete document set. Claim identity includes filing metadata and normalized claim fields, but receipt/publication-observation material is kept in the separate receipt record. A later receipt preserves package, artifact, claim and claim-set identity while changing receipt-bound provenance and the replay fingerprint.

The extraction grammar has one explicit key/value line for each supported field (item, event, lifecycle, synthetic issuer and asset candidates, announcement time, signing/expected-close/completion dates, amount class/value/currency, binding, and amendment reference/correction field). It is a synthetic fixture grammar, not a general SEC filing parser. Unknown, repeated, missing, reordered only where prohibited, or malformed fields fail closed. Public results expose locators and a hash computed from the parsed source grammar fields, never a caller-supplied excerpt hash or raw document text.

## Claim semantics and correction lineage

Flow A is a synthetic Form 8-K Item 1.01 definitive purchase agreement: it records a signed/binding agreement, exact amount/currency, signing date and a separate expected closing date. It explicitly has no completion date.

Flow B is a different synthetic Form 8-K Item 2.01 completed purchase with an explicit completion date. Completion is accepted only when the supported fixture grammar says so; item metadata alone cannot establish it.

Flow C is an 8-K/A tied to Flow A's original accession and corrects the amount. Both artifacts and claims remain in the output; a typed append-only correction edge links the two. The original is never replaced or deleted. Later amendments can form a deterministic parent-linked chain; cycles, missing parents, cross-CIK links, timestamp-inverted parent links and correction forks are rejected. Each amendment must extend the previous amendment when multiple corrections occur; competing siblings are not resolved newest-wins.

The mapping assembler can map a correction only when given the trusted
immediate parent mapped claim and the exact fixture correction edge. The
correction retains a distinct claim, package, artifact and mapped-claim
identity while inheriting the original's stable event-candidate identity.
The corroboration input sealer binds the ordered chain and every source,
issuer, asset-mention and canonical mapping revision fingerprint. Evaluation
uses `evaluationAsOf`: before amendment publication the original is current;
at and after publication the unique active terminal amendment is selected.
This is historical reconstruction of issuer disclosures, not event truth.
A retraction has its own later source-origin edge, leaves prior artifacts
intact, and makes the current eligibility result `RETRACTED`. Amendment
artifacts remain in one regulatory origin family and do not satisfy extra
independence or artifact-count thresholds.

Flow D is purchase intent with a target amount and expected closing date. It remains `INTENT`; a target is not exact consideration and expected closing is not completion. Missing amount is `UNKNOWN`, never zero. Currency and asset identity must be explicit. A symbol, ticker, CIK, or name does not create issuer/asset mapping authority.

Decimal amounts use canonical non-negative strings: no exponent, leading zeros, trailing fractional zeros or more than eight fractional digits. Zero is explicitly represented as `0`; negative values are rejected. Ranges have two canonical decimal endpoints with lower less than upper. `UNKNOWN` requires both amount and currency to be absent; amount and currency are never inferred. Duplicate document types/locators and claims, conflicting unlinked lifecycle/amount material, missing original amendments, and wrong-CIK amendment links invalidate the whole sealed claim set. There is no newest-wins behavior.

## Runtime trust and limits

Module-local runtime trust is minted only by the package reconciler, artifact factory, extractor and integrated claim-set builder. Copying, spreading, structured-cloning, serializing or fabricating a package/artifact/claim loses trust. Public parsing alone does not mint trust. Objects and arrays are shape-checked before use, and Proxy objects are rejected without reading through their traps. Fixture claims, artifacts and sealed claim-sets are never accepted as event authority; the authority-boundary function always returns `null`.

Synthetic tests prove parser, reconciliation, deterministic identity, receipt variance, correction lineage, immutability and fail-closed boundaries for these fixtures. They do **not** prove SEC response shape, actual filing contents, extraction accuracy on real documents, source completeness, legal status, source qualification, issuer/asset mapping, corroboration, or rights to acquire/store/use data.

## Next boundaries

Before a fixture pipeline consumes real fixture files, define fixture provenance and review controls separately. Before any live request, a separately approved acquisition slice must use the existing source qualification, approved server-side request identity, fair-access controls and bounded transport; this pipeline itself remains transport-free. Before authoritative events or persistence, add separately reviewed issuer and asset mapping revisions, corroboration, lifecycle/correction policy, source-artifact lineage, storage/retention/use approvals and an authority issuer that cannot be reached from fixture claims. Signal generation and trading remain later, separately gated contexts.

The SEC source's documented scope and current blockers remain in [SEC EDGAR 8-K Event Source Qualification](SEC_EDGAR_8K_EVENT_SOURCE_QUALIFICATION.md). No additional SEC behavior is inferred from these synthetic fixtures.

The mapping follow-on keeps registrant/legal-entity authority separate from
cryptoasset identity. It binds a trusted claim mention to an existing
`AssetMappingRevision` by exact revision ID/fingerprint; it does not create a
canonical asset record or infer a mapping from ticker, symbol, name, price, or
peg. Its result is `MAPPED_NON_AUTHORITATIVE_EVENT_CLAIM`, still not an
authoritative event. Production mapping registries remain empty. See
[`EVENT_INTELLIGENCE_MAPPING_AUTHORITY.md`](EVENT_INTELLIGENCE_MAPPING_AUTHORITY.md).
That follow-on resolves mappings at the explicit claim `announcementAt`,
requires the resolver witnesses to carry that same `asOf`, and includes filing
package/artifact plus mention-binding fingerprints in the mapped-claim identity.

The next policy layer evaluates mapped claims for issuer-disclosure
eligibility after checking source origins, duplicate delivery, lifecycle,
correction, cutoff and conflict rules. It does not issue event authority.
`EXTERNALLY_VERIFIED_EVENT_FACT` remains unsupported. See
[EVENT_INTELLIGENCE_CORROBORATION_AUTHORITY_POLICY](EVENT_INTELLIGENCE_CORROBORATION_AUTHORITY_POLICY.md).
# Persistence boundary

The future relational design reuses existing source artifacts, envelopes, observations, availability claims and `SourceLineage`; the fixture claim pipeline itself remains synthetic and non-authoritative. See [EVENT_INTELLIGENCE_PERSISTENCE_SCHEMA_UOW_DECISION.md](EVENT_INTELLIGENCE_PERSISTENCE_SCHEMA_UOW_DECISION.md). The decision does not copy external artifact/lineage/mapping fingerprints into event child rows; it binds exact immutable parent identities/scopes and reads their fingerprints from the referenced rows inside the future transaction. No raw fixture text, migration, database write, or event authority is introduced here.
# SEC provenance boundary update

The fixture pipeline's `sec-edgar-fixture-artifact:*` identity is a separate
synthetic content identity. Existing M5 source artifacts are provider-scoped
records whose IDs are derived under the M5 contract; putting the SEC fixture
ID into `providerExternalRecordId` does not make the M5 artifact or its
retrieval-observation `SourceLineage` an SEC filing/document authority. The
selected follow-on is a separate immutable SEC package/document/receipt/
lineage model. It binds canonical document bytes and package membership while
keeping receipt timestamps outside document identity. No live source bytes,
database rows or event authority are added by this decision. See
[`SEC_EDGAR_EVENT_SOURCE_PROVENANCE_DECISION.md`](SEC_EDGAR_EVENT_SOURCE_PROVENANCE_DECISION.md).
