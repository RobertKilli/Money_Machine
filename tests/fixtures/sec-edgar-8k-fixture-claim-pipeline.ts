import { Buffer } from "node:buffer";
import { canonicalSha256 } from "../../src/domain/intelligence/ingestion-provenance";
import { SEC_EDGAR_8K_FIXTURE_PACKAGE_VERSION, SEC_EDGAR_8K_FIXTURE_TEXT_VERSION } from "../../src/domain/intelligence/sec-edgar-8k-fixture-claim-pipeline";

type SyntheticDocument = { filename: string; content: string; sequence: number; type: "PRIMARY" | "EXHIBIT" };
type FixtureSpec = {
  cik: string; accession: string; form: "8-K" | "8-K/A"; filingDate: string; reportDate: string | null; acceptanceDateTime: string;
  primaryDocument: string; amendmentOfAccession: string | null; documents: SyntheticDocument[]; requiredEvidenceFilenames?: string[];
  expected: { eventType: string; lifecycleStatus: string; amountClassification: string; amount: string | null; currency: string | null; signingDate: string | null; expectedClosingDate: string | null; completionDate: string | null; claimCount: 1 };
  receiptId: string; receivedAt: string; effectiveAvailableAt: string; sourcePublishedAt: string;
};

const agreementText = [
  "ITEM|1.01", "EVENT|DEFINITIVE_PURCHASE_AGREEMENT", "LIFECYCLE|SIGNED", "ISSUER_CIK|SYNTH-CIK-0001",
  "ISSUER_NAME|Synthetic Issuer QUILL-0001", "ASSET_ID|asset:fixture:nonexistent-gossamer-0001", "ASSET_NAME|Synthetic Asset GOSSAMER-0001",
  "ANNOUNCEMENT_AT|2026-04-10T14:02:00.000Z", "SIGNING_DATE|2026-04-09", "EXPECTED_CLOSING_DATE|2026-09-30", "COMPLETION_DATE|-",
  "AMOUNT_CLASS|EXACT", "AMOUNT|1250000", "CURRENCY|SYNTH-CUR-01", "BINDING|BINDING", "ORIGINAL_ACCESSION|-", "CORRECTS_FIELD|-",
].join("\n");
const completionText = [
  "ITEM|2.01", "EVENT|PURCHASE_COMPLETED", "LIFECYCLE|COMPLETED", "ISSUER_CIK|SYNTH-CIK-0002",
  "ISSUER_NAME|Synthetic Issuer VELVET-0002", "ASSET_ID|asset:fixture:nonexistent-cloudberry-0002", "ASSET_NAME|Synthetic Asset CLOUDBERRY-0002",
  "ANNOUNCEMENT_AT|2026-05-12T16:20:00.000Z", "SIGNING_DATE|2026-05-01", "EXPECTED_CLOSING_DATE|2026-05-30", "COMPLETION_DATE|2026-05-12",
  "AMOUNT_CLASS|EXACT", "AMOUNT|880000", "CURRENCY|SYNTH-CUR-02", "BINDING|BINDING", "ORIGINAL_ACCESSION|-", "CORRECTS_FIELD|-",
].join("\n");
const amendmentText = agreementText
  .replace("AMOUNT|1250000", "AMOUNT|1300000")
  .replace("ORIGINAL_ACCESSION|-", "ORIGINAL_ACCESSION|SYNTH-ACC-AGREE-0001")
  .replace("CORRECTS_FIELD|-", "CORRECTS_FIELD|AMOUNT");
const intentText = [
  "ITEM|1.01", "EVENT|PURCHASE_INTENT_ANNOUNCED", "LIFECYCLE|INTENT", "ISSUER_CIK|SYNTH-CIK-0003",
  "ISSUER_NAME|Synthetic Issuer THISTLE-0003", "ASSET_ID|asset:fixture:nonexistent-moonstone-0003", "ASSET_NAME|Synthetic Asset MOONSTONE-0003",
  "ANNOUNCEMENT_AT|2026-06-20T10:00:00.000Z", "SIGNING_DATE|-", "EXPECTED_CLOSING_DATE|2027-03-30", "COMPLETION_DATE|-",
  "AMOUNT_CLASS|TARGET", "AMOUNT|750000", "CURRENCY|SYNTH-CUR-03", "BINDING|NON_BINDING", "ORIGINAL_ACCESSION|-", "CORRECTS_FIELD|-",
].join("\n");

function digestText(text: string): string {
  const canonical = text.replace(/\r\n/g, "\n").normalize("NFC");
  return canonicalSha256(Buffer.from(canonical, "utf8").toString("hex"));
}

function makePackage(spec: FixtureSpec): Record<string, unknown> {
  const docs = spec.documents.map(({ filename, content }) => ({ filename, content }));
  return {
    contractVersion: SEC_EDGAR_8K_FIXTURE_PACKAGE_VERSION,
    sourceProfile: "SEC_EDGAR_8K_FIXTURE_PROFILE_V1",
    receipt: { receiptId: spec.receiptId, receivedAt: spec.receivedAt, effectiveAvailableAt: spec.effectiveAvailableAt, sourcePublishedAt: spec.sourcePublishedAt },
    submissions: { cik: spec.cik, recent: {
      accessionNumber: [spec.accession], form: [spec.form], filingDate: [spec.filingDate], reportDate: [spec.reportDate],
      acceptanceDateTime: [spec.acceptanceDateTime], primaryDocument: [spec.primaryDocument],
    } },
    filingIndex: {
      cik: spec.cik, accession: spec.accession, form: spec.form,
      archivePath: `/synthetic-edgar/archive/${spec.cik}/${spec.accession}/index.txt`,
      filingDate: spec.filingDate, reportDate: spec.reportDate, acceptanceDateTime: spec.acceptanceDateTime,
      primaryDocument: spec.primaryDocument, amendmentOfAccession: spec.amendmentOfAccession,
      documents: spec.documents.map((doc) => {
        const canonical = doc.content.replace(/\r\n/g, "\n").normalize("NFC"); const byteLength = Buffer.byteLength(canonical, "utf8");
        return { sequence: doc.sequence, type: doc.type, filename: doc.filename, contentType: "text/plain; charset=utf-8", byteLength, contentSha256: digestText(canonical), canonicalizationVersion: SEC_EDGAR_8K_FIXTURE_TEXT_VERSION };
      }),
      requiredEvidenceFilenames: spec.requiredEvidenceFilenames ?? [],
    },
    documents: docs,
    expected: spec.expected,
  };
}

export const SEC_EDGAR_8K_SYNTHETIC_FIXTURES = Object.freeze([
  makePackage({
    cik: "SYNTH-CIK-0001", accession: "SYNTH-ACC-AGREE-0001", form: "8-K", filingDate: "2026-04-10", reportDate: "2026-04-09", acceptanceDateTime: "2026-04-10T14:05:10.000Z",
    primaryDocument: "agreement.txt", amendmentOfAccession: null,
    documents: [{ filename: "agreement.txt", content: agreementText, sequence: 1, type: "PRIMARY" }, { filename: "schedule.txt", content: "SYNTHETIC EXHIBIT SCHEDULE-0001\nNO EXTERNAL DOCUMENT REFERENCES", sequence: 2, type: "EXHIBIT" }], requiredEvidenceFilenames: ["schedule.txt"],
    expected: { eventType: "DEFINITIVE_PURCHASE_AGREEMENT", lifecycleStatus: "SIGNED", amountClassification: "EXACT", amount: "1250000", currency: "SYNTH-CUR-01", signingDate: "2026-04-09", expectedClosingDate: "2026-09-30", completionDate: null, claimCount: 1 },
    receiptId: "SYNTH-RECEIPT-AGREE-0001", sourcePublishedAt: "2026-04-10T14:02:00.000Z", receivedAt: "2026-04-10T14:06:00.000Z", effectiveAvailableAt: "2026-04-10T14:06:01.000Z",
  }),
  makePackage({
    cik: "SYNTH-CIK-0002", accession: "SYNTH-ACC-COMPLETE-0002", form: "8-K", filingDate: "2026-05-12", reportDate: "2026-05-12", acceptanceDateTime: "2026-05-12T16:24:00.000Z",
    primaryDocument: "completion.txt", amendmentOfAccession: null, documents: [{ filename: "completion.txt", content: completionText, sequence: 1, type: "PRIMARY" }],
    expected: { eventType: "PURCHASE_COMPLETED", lifecycleStatus: "COMPLETED", amountClassification: "EXACT", amount: "880000", currency: "SYNTH-CUR-02", signingDate: "2026-05-01", expectedClosingDate: "2026-05-30", completionDate: "2026-05-12", claimCount: 1 },
    receiptId: "SYNTH-RECEIPT-COMPLETE-0002", sourcePublishedAt: "2026-05-12T16:20:00.000Z", receivedAt: "2026-05-12T16:25:00.000Z", effectiveAvailableAt: "2026-05-12T16:25:02.000Z",
  }),
  makePackage({
    cik: "SYNTH-CIK-0001", accession: "SYNTH-ACC-AMEND-0001", form: "8-K/A", filingDate: "2026-04-15", reportDate: "2026-04-09", acceptanceDateTime: "2026-04-15T09:15:00.000Z",
    primaryDocument: "amendment.txt", amendmentOfAccession: "SYNTH-ACC-AGREE-0001", documents: [{ filename: "amendment.txt", content: amendmentText, sequence: 1, type: "PRIMARY" }],
    expected: { eventType: "DEFINITIVE_PURCHASE_AGREEMENT", lifecycleStatus: "SIGNED", amountClassification: "EXACT", amount: "1300000", currency: "SYNTH-CUR-01", signingDate: "2026-04-09", expectedClosingDate: "2026-09-30", completionDate: null, claimCount: 1 },
    receiptId: "SYNTH-RECEIPT-AMEND-0001", sourcePublishedAt: "2026-04-15T09:10:00.000Z", receivedAt: "2026-04-15T09:16:00.000Z", effectiveAvailableAt: "2026-04-15T09:16:01.000Z",
  }),
  makePackage({
    cik: "SYNTH-CIK-0003", accession: "SYNTH-ACC-INTENT-0003", form: "8-K", filingDate: "2026-06-20", reportDate: "2026-06-20", acceptanceDateTime: "2026-06-20T10:03:00.000Z",
    primaryDocument: "intent.txt", amendmentOfAccession: null, documents: [{ filename: "intent.txt", content: intentText, sequence: 1, type: "PRIMARY" }],
    expected: { eventType: "PURCHASE_INTENT_ANNOUNCED", lifecycleStatus: "INTENT", amountClassification: "TARGET", amount: "750000", currency: "SYNTH-CUR-03", signingDate: null, expectedClosingDate: "2027-03-30", completionDate: null, claimCount: 1 },
    receiptId: "SYNTH-RECEIPT-INTENT-0003", sourcePublishedAt: "2026-06-20T10:00:00.000Z", receivedAt: "2026-06-20T10:04:00.000Z", effectiveAvailableAt: "2026-06-20T10:04:02.000Z",
  }),
]);

export function cloneSyntheticFixtures(): Record<string, unknown>[] { return JSON.parse(JSON.stringify(SEC_EDGAR_8K_SYNTHETIC_FIXTURES)) as Record<string, unknown>[]; }
export function syntheticReceiptVariant(receivedAt = "2026-07-01T12:00:00.000Z"): Record<string, unknown>[] {
  const result = cloneSyntheticFixtures();
  for (const [index, pkg] of result.entries()) {
    const receipt = pkg.receipt as Record<string, unknown>;
    receipt.receivedAt = receivedAt;
    receipt.effectiveAvailableAt = new Date(Date.parse(receivedAt) + index + 1).toISOString();
    receipt.receiptId = `SYNTH-RECEIPT-REPLAY-${String(index + 1).padStart(4, "0")}`;
  }
  return result;
}
