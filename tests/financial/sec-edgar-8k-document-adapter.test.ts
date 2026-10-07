import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();
vi.mock("node:https", () => ({ request }));

import { adaptSecEdgar8kDocumentObservations, SEC_EDGAR_8K_DOCUMENT_ADAPTER_VERSION, SEC_EDGAR_8K_DOCUMENT_MAX_BYTES } from "@/infrastructure/intelligence/sec-edgar-8k-document-adapter";
import type { SecEdgar8kFilingEvidence } from "@/infrastructure/intelligence/sec-edgar-8k-response-adapter";

const filingUrl = "https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/d537928d8k.htm";
const metadata = (): SecEdgar8kFilingEvidence => Object.freeze({
  contractVersion: "sec-edgar-8k-structured-filing-evidence/v1",
  status: "RECONCILED_METADATA_ONLY",
  authority: "NON_AUTHORITATIVE_SOURCE_METADATA",
  identity: Object.freeze({ cik: "0000789019", accession: "0001193125-23-255762", form: "8-K" }),
  filingDate: "2023-10-13",
  acceptanceDateTime: "2023-10-13T08:37:32.000Z",
  eventDate: null,
  retrievedAt: "2026-10-07T08:00:00.000Z",
  primaryDocument: Object.freeze({ filename: "d537928d8k.htm", url: filingUrl, contentRetrieved: false }),
  evidence: Object.freeze({
    cik: Object.freeze({ value: "0000789019", sources: Object.freeze(["https://data.sec.gov/submissions/CIK0000789019.json#/cik"]) }),
    accession: Object.freeze({ value: "0001193125-23-255762", sources: Object.freeze(["https://data.sec.gov/submissions/CIK0000789019.json#/filings/recent/accessionNumber"]) }),
    form: Object.freeze({ value: "8-K", sources: Object.freeze(["https://data.sec.gov/submissions/CIK0000789019.json#/filings/recent/form"]) }),
    filingDate: Object.freeze({ value: "2023-10-13", sources: Object.freeze(["https://data.sec.gov/submissions/CIK0000789019.json#/filings/recent/filingDate"]) }),
    primaryDocument: Object.freeze({ value: "d537928d8k.htm", sources: Object.freeze(["https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/0001193125-23-255762-index.htm#Document-Format-Files-table"]) }),
    acceptanceDateTime: Object.freeze({ value: "2023-10-13T08:37:32.000Z", sources: Object.freeze(["https://data.sec.gov/submissions/CIK0000789019.json#/filings/recent/acceptanceDateTime"]) }),
  }),
});
const body = `<!doctype html><html><head><title>Current Report</title>
<meta name="description" content="Synthetic description">
<meta name="x-future-sec-field" content="Retain this unknown field">
</head><body><p>Date of Report: this is not inferred as an event date.</p></body></html>`;
const input = (html = body) => ({ filename: "d537928d8k.htm", sourceUrl: filingUrl, contentType: "text/html; charset=utf-8", bytes: Buffer.from(html, "utf8") });

describe("bounded SEC 8-K document observation adapter", () => {
  beforeEach(() => request.mockReset());

  it("returns only source-bound non-authoritative observations and preserves unknown metadata", () => {
    const result = adaptSecEdgar8kDocumentObservations(metadata(), input());
    expect(result.status).toBe("OBSERVED_METADATA_ONLY");
    if (result.status !== "OBSERVED_METADATA_ONLY") return;
    expect(result.contractVersion).toBe(SEC_EDGAR_8K_DOCUMENT_ADAPTER_VERSION);
    expect(result.identity).toEqual({ cik: "0000789019", accession: "0001193125-23-255762", form: "8-K", filingDate: "2023-10-13" });
    expect(result.eventDate).toBeNull();
    expect(result.source.kind).toBe("CALLER_SUPPLIED_BYTES_UNVERIFIED");
    expect(result.title).toEqual({ value: "Current Report", source: `${filingUrl}#title` });
    expect(result.observations).toHaveLength(2);
    expect(result.unknownFields).toEqual([expect.objectContaining({ field: "x-future-sec-field", value: "Retain this unknown field", classification: "UNRECOGNIZED_DOCUMENT_METADATA", source: `${filingUrl}#meta[1](x-future-sec-field)` })]);
    expect(result.identitySources).toContain("https://data.sec.gov/submissions/CIK0000789019.json#/filings/recent/filingDate");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.observations)).toBe(true);
    expect("bytes" in result.source).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects mismatched filing evidence and document locators", () => {
    expect(adaptSecEdgar8kDocumentObservations({ ...metadata(), identity: { cik: "0000789019", accession: "0000000000-00-000000", form: "8-K" } }, input())).toEqual({ status: "BLOCKED", code: "DOCUMENT_IDENTITY_MISMATCH" });
    expect(adaptSecEdgar8kDocumentObservations(metadata(), { ...input(), filename: "other.htm" })).toEqual({ status: "BLOCKED", code: "DOCUMENT_IDENTITY_MISMATCH" });
    expect(adaptSecEdgar8kDocumentObservations(metadata(), { ...input(), sourceUrl: "https://www.sec.gov/Archives/edgar/data/789019/other.htm" })).toEqual({ status: "BLOCKED", code: "DOCUMENT_IDENTITY_MISMATCH" });
    expect(adaptSecEdgar8kDocumentObservations({ ...metadata(), filingDate: "2023-10-14" }, input())).toEqual({ status: "BLOCKED", code: "DOCUMENT_IDENTITY_MISMATCH" });
    const conflictingEvidence = metadata();
    expect(adaptSecEdgar8kDocumentObservations({ ...conflictingEvidence, evidence: { ...conflictingEvidence.evidence, accession: { value: "0000000000-00-000000", sources: conflictingEvidence.evidence.accession.sources } } }, input())).toEqual({ status: "BLOCKED", code: "DOCUMENT_IDENTITY_MISMATCH" });
    expect(adaptSecEdgar8kDocumentObservations({ ...conflictingEvidence, evidence: { ...conflictingEvidence.evidence, filingDate: { value: "2023-10-12", sources: ["https://attacker.invalid/filing"] } } }, input())).toEqual({ status: "BLOCKED", code: "DOCUMENT_IDENTITY_MISMATCH" });
  });

  it("retains a manifest-selected historical-submissions source reference", () => {
    const value = metadata();
    const historyUrl = "https://data.sec.gov/submissions/CIK0000789019-submissions-001.json#/accessionNumber";
    const result = adaptSecEdgar8kDocumentObservations({ ...value, evidence: { ...value.evidence, accession: { value: value.identity.accession, sources: [historyUrl] } } }, input());
    expect(result.status).toBe("OBSERVED_METADATA_ONLY");
    if (result.status === "OBSERVED_METADATA_ONLY") expect(result.identitySources).toContain(historyUrl);
  });

  it("enforces content type, UTF-8, HTML and body-byte limits", () => {
    expect(adaptSecEdgar8kDocumentObservations(metadata(), { ...input(), contentType: "application/octet-stream" })).toEqual({ status: "BLOCKED", code: "DOCUMENT_CONTENT_TYPE_INVALID" });
    expect(adaptSecEdgar8kDocumentObservations(metadata(), { ...input(), bytes: Buffer.from([0xff, 0xfe]) })).toEqual({ status: "BLOCKED", code: "DOCUMENT_UTF8_INVALID" });
    expect(adaptSecEdgar8kDocumentObservations(metadata(), { ...input(), bytes: Buffer.from([0xc3, 0x28]) })).toEqual({ status: "BLOCKED", code: "DOCUMENT_UTF8_INVALID" });
    expect(adaptSecEdgar8kDocumentObservations(metadata(), { ...input(), bytes: Buffer.from([0xe2, 0x82]) })).toEqual({ status: "BLOCKED", code: "DOCUMENT_UTF8_INVALID" });
    expect(adaptSecEdgar8kDocumentObservations(metadata(), input("not html"))).toEqual({ status: "BLOCKED", code: "DOCUMENT_HTML_INVALID" });
    expect(adaptSecEdgar8kDocumentObservations(metadata(), input("<html><head><title>SEC format</title></head><body></body></html>")).status).toBe("OBSERVED_METADATA_ONLY");
    expect(adaptSecEdgar8kDocumentObservations(metadata(), { ...input(), bytes: Buffer.alloc(SEC_EDGAR_8K_DOCUMENT_MAX_BYTES + 1) })).toEqual({ status: "BLOCKED", code: "DOCUMENT_BYTES_TOO_LARGE" });
    expect(request).not.toHaveBeenCalled();
  });

  it("bounds metadata count, values and attribute parsing without dropping unknown field names", () => {
    const tooMany = `<!doctype html><html><head>${"<meta name=\"x\" content=\"v\">".repeat(65)}</head></html>`;
    expect(adaptSecEdgar8kDocumentObservations(metadata(), input(tooMany))).toEqual({ status: "BLOCKED", code: "DOCUMENT_PARSE_LIMIT_EXCEEDED" });
    const tooLargeValue = `<!doctype html><html><head><meta name="x" content="${"v".repeat(513)}"></head></html>`;
    expect(adaptSecEdgar8kDocumentObservations(metadata(), input(tooLargeValue))).toEqual({ status: "BLOCKED", code: "DOCUMENT_PARSE_LIMIT_EXCEEDED" });
    const bounded = `<!doctype html><html><head><meta name="new-field" content="${"v".repeat(512)}"></head></html>`;
    const result = adaptSecEdgar8kDocumentObservations(metadata(), input(bounded));
    expect(result.status).toBe("OBSERVED_METADATA_ONLY");
    if (result.status === "OBSERVED_METADATA_ONLY") expect(result.unknownFields[0]?.value).toHaveLength(512);
    expect(request).not.toHaveBeenCalled();
  });

  it("preserves duplicate metadata observations without choosing a winner", () => {
    const duplicate = `<!doctype html><html><head>
      <meta name="description" content="First value">
      <meta name='description' content='Second &amp; distinct value'>
    </head></html>`;
    const result = adaptSecEdgar8kDocumentObservations(metadata(), input(duplicate));
    expect(result.status).toBe("OBSERVED_METADATA_ONLY");
    if (result.status !== "OBSERVED_METADATA_ONLY") return;
    expect(result.observations).toEqual([
      expect.objectContaining({ field: "description", value: "First value", source: `${filingUrl}#meta[0](description)` }),
      expect.objectContaining({ field: "description", value: "Second & distinct value", source: `${filingUrl}#meta[1](description)` }),
    ]);
    expect(request).not.toHaveBeenCalled();
  });

  it("ignores metadata-like markup inside comments and HTML raw-text elements", () => {
    const hidden = `<!doctype html><html><head>
      <!-- <meta name="description" content="commented out"><title>comment title</title> -->
      <script data-note="quoted > character">const sample = '<meta name="description" content="script text"><title>script title</title>';</script>
      <style>.x::after { content: '<meta name="description" content="style text">'; }</style>
      <textarea><meta name="description" content="textarea text"></textarea>
      <div data-markup="<meta name='description' content='attribute text'>"></div>
      <template><title>template title</title><meta name="description" content="template text"></template>
      <title>Visible &amp; bounded title</title>
      <meta name="description" content="actual metadata">
    </head></html>`;
    const result = adaptSecEdgar8kDocumentObservations(metadata(), input(hidden));
    expect(result.status).toBe("OBSERVED_METADATA_ONLY");
    if (result.status !== "OBSERVED_METADATA_ONLY") return;
    expect(result.title.value).toBe("Visible & bounded title");
    expect(result.observations.map(item => item.value)).toEqual(["actual metadata"]);
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects unterminated comments and raw-text elements instead of interpreting their contents", () => {
    expect(adaptSecEdgar8kDocumentObservations(metadata(), input("<html><head><!-- <meta name=\"x\" content=\"hidden\"></head></html>"))).toEqual({ status: "BLOCKED", code: "DOCUMENT_HTML_INVALID" });
    expect(adaptSecEdgar8kDocumentObservations(metadata(), input("<html><head><script>const x = '<meta name=\"x\" content=\"hidden\">';</head></html>"))).toEqual({ status: "BLOCKED", code: "DOCUMENT_HTML_INVALID" });
    expect(request).not.toHaveBeenCalled();
  });

  it("handles quoted greater-than characters and rejects ambiguous duplicate attributes", () => {
    const withGreaterThan = `<!doctype html><html><head><meta name="x-note" content="left > right"></head></html>`;
    const parsed = adaptSecEdgar8kDocumentObservations(metadata(), input(withGreaterThan));
    expect(parsed.status).toBe("OBSERVED_METADATA_ONLY");
    if (parsed.status === "OBSERVED_METADATA_ONLY") expect(parsed.unknownFields[0]?.value).toBe("left > right");

    const duplicateAttribute = `<!doctype html><html><head><meta name="description" name="og:title" content="ambiguous"></head></html>`;
    expect(adaptSecEdgar8kDocumentObservations(metadata(), input(duplicateAttribute))).toEqual({ status: "BLOCKED", code: "DOCUMENT_HTML_INVALID" });
    expect(request).not.toHaveBeenCalled();
  });
});
