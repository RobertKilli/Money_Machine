# SEC EDGAR LOCAL_SMOKE qualification v1

This is a separate, bounded qualification model for one local metadata smoke. It does not replace or relax `sec-edgar-8k-event-source-qualification/v1`; the production contract and its seven usage approvals remain unchanged. Parsing a smoke record proves only its closed syntax and self-consistent fingerprint. Runtime use additionally requires an `APPROVED_FOR_LOCAL_SMOKE` record whose exact fingerprint and reference are reviewed and code-pinned in `SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_PINS`. That pin list is empty. The separate `LOCAL_SMOKE` permit registry is also empty.

## Fixed scope

The only modeled filing is Microsoft Corporation, CIK `0000789019`, Form `8-K`, accession `0001193125-23-255762`, filing date `2023-10-13`. The stages are company submissions, at most one historical submissions JSON explicitly referenced by that manifest and covering the filing date, then that accession's filing index. The aggregate run allows at most three GET requests, at least 1000 ms between request starts, no retries, and the existing 10-second per-request and 2 MiB response bounds. Qualification is not itself an operational permit; the permit must separately bind the same qualification reference, identity reference, filing scope, expiry, and request limits.

Raw response bytes are transient process-memory data behind the existing one-shot exchange binding and cleanup path. Structured filing metadata is non-authoritative and process-local. This scope asserts no completeness or freshness guarantee; it excludes primary-document and exhibit retrieval, event inference, AI processing, persistence, retention for later use, and redistribution.

## Evidence required before a code pin

The qualification fingerprint covers the entire fixed scope and restriction set, both approval decisions, the opaque `userAgentIdentityRef`, all evidence, blockers, and the review/effective/expiry times. Changing any of them requires a new fingerprint/reference and a new reviewed pin. `userAgentIdentityRef` is only a code-level binding label: it does not authenticate an operator or prove that the configured contact belongs to that person. The separate permit must repeat both the exact qualification reference and the same identity reference.

The closed evidence identifiers are:

- `SEC_PUBLIC_ACCESS_AND_REUSE`: current official SEC access/dissemination terms supporting the narrowly described retrieval and transient local handling.
- `SEC_SUBMISSIONS_AND_HISTORY_FORMAT`: current official API documentation supporting the manifest and referenced-history selection behavior used by this exact flow.
- `SEC_FAIR_ACCESS_AND_USER_AGENT`: current request-rate and identifying User-Agent requirements, plus the actual operator contact/identity binding that will be used for the one run. The contact must be supplied through local process configuration and must not be committed or copied into argv/logs.
- `SELECTED_FILING_IDENTITY`: reviewed evidence for the selected issuer, CIK, form, accession, and filing date. A prior SEC filing-index lookup is source-review evidence, not a response acquired by this application's transport and not proof that the submissions response has been reconciled.

Each evidence item needs an official SEC URL, title, checked time, and explicit bounded claims. Before pinning, reviewers must decide and record both `acquisitionDecision` and `processMemoryDecision` as approved for this exact scope; confirm the local-use interpretation and that no body/document content is retained or redistributed; acknowledge that metadata can be incomplete/stale and this run makes no such guarantees; and approve a separate short-lived permit only when the operator contact and exact invocation are known. A code pin must be a separately reviewed change; neither a CLI argument nor caller-supplied material can create it. This branch publishes no qualification or permit pin.

## Decisions that remain open

No source is runtime-qualified for this smoke in this branch. The qualification and permit registries intentionally remain empty. The CLI/dry-run code changes do not qualify a source, approve acquisition or process-memory use, set operator identity, or permit a request. No live request or runtime registry entry is issued here.

This model does not establish policy application, issuer/reviewer identity or authorization, lifecycle or event authority, producer readiness, or production qualification. Production still requires the broader v1 evidence and separate decisions for coverage/completeness, correction behavior, storage, retention, redistribution, commercial use, authority issuance, and operational acquisition.

## Source material reviewed

- SEC EDGAR APIs: <https://www.sec.gov/search-filings/edgar-application-programming-interfaces>
- SEC Developer Resources: <https://www.sec.gov/about/developer-resources>
- SEC dissemination/privacy policy: <https://www.sec.gov/about/privacy-information>
- SEC webmaster FAQ: <https://www.sec.gov/about/webmaster-frequently-asked-questions>
- Selected filing index: <https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/0001193125-23-255762-index.htm>

These sources were reviewed for qualification modeling only. No SEC filing/API endpoint was requested by this implementation task.
