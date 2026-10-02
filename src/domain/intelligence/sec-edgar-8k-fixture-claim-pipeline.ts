import "server-only";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";
import { canonicalSha256 } from "./ingestion-provenance";
import { parseSecRuntimeSourceProfile, secRuntimeBoundsAreValid, type SecRuntimeMaterial } from "./sec-edgar-event-source-provenance-runtime";

export const SEC_EDGAR_8K_FIXTURE_PACKAGE_VERSION = "sec-edgar-8k-fixture-package/v1" as const;
export const SEC_EDGAR_8K_FIXTURE_PIPELINE_VERSION = "sec-edgar-8k-fixture-claim-pipeline/v1" as const;
export const SEC_EDGAR_8K_FIXTURE_TEXT_VERSION = "sec-edgar-fixture-text/v1" as const;
export const SEC_EDGAR_8K_FIXTURE_EXTRACTION_VERSION = "sec-edgar-8k-fixture-extraction/v1" as const;
export const SEC_EDGAR_8K_FIXTURE_RESULT_KIND = "NON_AUTHORITATIVE_EVENT_CLAIMS" as const;

const LIMITS = Object.freeze({ documentBytes: 32_768, packageBytes: 65_536, packageCount: 16, documentsPerFiling: 8 });
const FAILURE = Object.freeze({ status: "INVALID" as const, classification: SEC_EDGAR_8K_FIXTURE_RESULT_KIND, blockers: Object.freeze(["SEC_8K_FIXTURE_PIPELINE_REJECTED"]), filings: Object.freeze([]), artifacts: Object.freeze([]), receipts: Object.freeze([]), claims: Object.freeze([]), correctionLineage: Object.freeze([]), claimSet: null, sideEffects: Object.freeze({ authority: 0, persistence: 0, signal: 0 }) });
const packageTrust = new WeakSet<object>();
const artifactTrust = new WeakSet<object>();
const claimTrust = new WeakSet<object>();
const claimSetTrust = new WeakSet<object>();
const resultTrust = new WeakSet<object>();
const entityMaterialTrust = new WeakSet<object>();
const privatePackageData = new WeakMap<object, Readonly<{ documents: readonly Readonly<{ filename: string; text: string; lines: readonly string[] }>[]; parsed: ParsedPackage }>>();

type ParsedPackage = Readonly<{
  sourceProfile: "SEC_EDGAR_8K_FIXTURE_PROFILE_V1";
  receipt: Readonly<{ receiptId: string; receivedAt: string; effectiveAvailableAt: string; sourcePublishedAt: string }>;
  filing: Readonly<{ cik: string; accession: string; form: "8-K" | "8-K/A"; filingDate: string; reportDate: string | null; acceptanceDateTime: string; primaryDocument: string; amendmentOfAccession: string | null }>;
  descriptors: readonly Readonly<{ sequence: number; type: "PRIMARY" | "EXHIBIT"; documentType: string; filename: string; contentType: "text/plain; charset=utf-8"; byteLength: number; contentSha256: string; canonicalizationVersion: typeof SEC_EDGAR_8K_FIXTURE_TEXT_VERSION }>[];
  requiredEvidenceFilenames: readonly string[];
  expected: Readonly<{ eventType: string; lifecycleStatus: string; amountClassification: string; amount: string | null; currency: string | null; signingDate: string | null; expectedClosingDate: string | null; completionDate: string | null; claimCount: number }>;
}>;

export type SecEdgar8kFixtureFiling = Readonly<{
  filingPackageId: string; filingPackageFingerprint: string;
  filing: ParsedPackage["filing"];
  metadataArtifactId: string; indexArtifactId: string;
  amendmentOfFilingPackageId: string | null;
  receiptFingerprint: string;
}>;
export type SecEdgar8kFixtureArtifact = Readonly<{
  artifactId: string; fingerprint: string; kind: "FILING_METADATA" | "FILING_INDEX" | "PRIMARY_DOCUMENT" | "EXHIBIT";
  filingPackageId: string; cik: string; accession: string; form: "8-K" | "8-K/A";
  sequence: number | null; documentType: string | null; filename: string | null;
  contentType: string; byteLength: number; canonicalizationVersion: string;
}>;
export type SecEdgar8kFixtureClaim = Readonly<{
  claimId: string; fingerprint: string; extractionVersion: typeof SEC_EDGAR_8K_FIXTURE_EXTRACTION_VERSION;
  sourceArtifactId: string; sourceArtifactFingerprint: string;
  cik: string; accession: string; form: "8-K" | "8-K/A"; itemCode: "1.01" | "2.01" | "OTHER";
  filingDate: string; reportDate: string | null; acceptanceAt: string;
  issuerIdentityCandidate: Readonly<{ syntheticCik: string; displayName: string }>;
  assetIdentityCandidate: Readonly<{ syntheticAssetId: string; displayName: string }>;
  eventTypeCandidate: "PURCHASE_INTENT_ANNOUNCED" | "BOARD_AUTHORIZATION" | "DEFINITIVE_PURCHASE_AGREEMENT" | "PURCHASE_COMPLETED";
  lifecycleStatusCandidate: "INTENT" | "AUTHORIZED" | "SIGNED" | "CONDITIONAL" | "COMPLETED";
  announcementAt: string; signingDate: string | null; expectedClosingDate: string | null; completionDate: string | null;
  amount: string | null; amountClassification: "EXACT" | "RANGE" | "MAXIMUM" | "TARGET" | "UNKNOWN"; currency: string | null;
  bindingStatus: "BINDING" | "NON_BINDING" | "CONDITIONAL" | "UNKNOWN";
  correctionOfClaimId: string | null; locator: string; excerptFingerprint: string;
}>;
export type SecEdgar8kFixtureResult = Readonly<{
  status: "VALID"; classification: typeof SEC_EDGAR_8K_FIXTURE_RESULT_KIND; pipelineVersion: typeof SEC_EDGAR_8K_FIXTURE_PIPELINE_VERSION;
  filings: readonly SecEdgar8kFixtureFiling[]; artifacts: readonly SecEdgar8kFixtureArtifact[]; receipts: readonly Readonly<{ receiptId: string; filingPackageId: string; sourcePublishedAt: string; receivedAt: string; effectiveAvailableAt: string; fingerprint: string }>[];
  claims: readonly SecEdgar8kFixtureClaim[]; correctionLineage: readonly Readonly<{ originalFilingPackageId: string; amendmentFilingPackageId: string; originalClaimId: string; amendedClaimId: string; correctedField: string; relation: "APPEND_ONLY_CORRECTION" }>[];
  claimSet: Readonly<{ claimSetId: string; fingerprint: string; memberCount: number; claimIds: readonly string[]; artifactIds: readonly string[]; locatorKeys: readonly string[]; extractionVersion: typeof SEC_EDGAR_8K_FIXTURE_EXTRACTION_VERSION }>;
  replayFingerprint: string; production: Readonly<{ acquisition: "BLOCKED"; persistence: "BLOCKED"; eventAuthority: "BLOCKED"; signals: "BLOCKED" }>;
  sideEffects: Readonly<{ authority: 0; persistence: 0; signal: 0 }>;
}>;
export type SecEdgar8kFixturePipelineOutcome = SecEdgar8kFixtureResult | typeof FAILURE;

const PACKAGE_KEYS = ["contractVersion", "sourceProfile", "receipt", "submissions", "filingIndex", "documents", "expected"] as const;
const RECEIPT_KEYS = ["receiptId", "receivedAt", "effectiveAvailableAt", "sourcePublishedAt"] as const;
const SUBMISSIONS_KEYS = ["cik", "recent"] as const;
const RECENT_KEYS = ["accessionNumber", "form", "filingDate", "reportDate", "acceptanceDateTime", "primaryDocument"] as const;
const FILING_INDEX_KEYS = ["cik", "accession", "form", "archivePath", "filingDate", "reportDate", "acceptanceDateTime", "primaryDocument", "amendmentOfAccession", "documentCount", "documents", "requiredEvidenceFilenames"] as const;
const DESCRIPTOR_KEYS = ["sequence", "type", "documentType", "filename", "contentType", "byteLength", "contentSha256", "canonicalizationVersion"] as const;
const DOCUMENT_KEYS = ["filename", "content"] as const;
const EXPECTED_KEYS = ["eventType", "lifecycleStatus", "amountClassification", "amount", "currency", "signingDate", "expectedClosingDate", "completionDate", "claimCount"] as const;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SYNTH_CIK = /^SYNTH-CIK-[0-9]{4}$/;
const SYNTH_ACCESSION = /^SYNTH-ACC-[A-Z0-9-]{4,32}$/;
const SYNTH_NAME = /^Synthetic (?:Issuer|Asset) [A-Z0-9-]{3,24}$/;
const HASH = /^[0-9a-f]{64}$/;
const ACTIVE_HTML = /<(?:script|iframe|object|embed|base|form|svg|math)\b|\bon(?:load|error|click|mouseover)\s*=|(?:src|href|action)\s*=\s*["']?\s*(?:https?:|\/\/|data:|javascript:)/i;
const OBJECT_INTRINSICS = new Set<PropertyKey>(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "toString", "valueOf", "__proto__"]);
const ARRAY_INTRINSICS = new Set<PropertyKey>(["length", "constructor", "at", "concat", "copyWithin", "fill", "find", "findIndex", "findLast", "findLastIndex", "lastIndexOf", "pop", "push", "reverse", "shift", "unshift", "slice", "sort", "splice", "includes", "indexOf", "join", "keys", "entries", "values", "forEach", "filter", "flat", "flatMap", "map", "every", "some", "reduce", "reduceRight", "toLocaleString", "toString", "toReversed", "toSorted", "toSpliced", "with", Symbol.iterator, Symbol.unscopables]);

function plain(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  try {
    if (!value || typeof value !== "object" || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(Object.prototype).some((key) => !OBJECT_INTRINSICS.has(key))) return false;
    const ownKeys = Reflect.ownKeys(value);
    return ownKeys.length === keys.length && ownKeys.every((key) => typeof key === "string" && keys.includes(key) && (() => { const d = Object.getOwnPropertyDescriptor(value, key); return !!d && "value" in d && !d.get && !d.set; })());
  } catch { return false; }
}
function safeArray(value: unknown, max = 128): value is unknown[] {
  try {
    if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(Array.prototype).some((key) => !ARRAY_INTRINSICS.has(key)) || value.length > max) return false;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== value.length + 1 || keys.some((key) => typeof key !== "string")) return false;
    for (let i = 0; i < value.length; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d || !("value" in d) || d.get || d.set) return false; }
    return true;
  } catch { return false; }
}
function iso(value: unknown): value is string { return typeof value === "string" && UTC.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function date(value: unknown): value is string { return typeof value === "string" && DATE.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value; }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const child of Object.values(value as Record<string, unknown>)) freeze(child); Object.freeze(value); } return value; }
function fail(): typeof FAILURE { return FAILURE; }
function hash(value: unknown): string { return canonicalSha256(value); }
function sha256Bytes(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }

function canonicalText(input: string): string | null {
  if (/\r(?!\n)/.test(input)) return null;
  const text = input.replace(/\r\n/g, "\n").normalize("NFC");
  if (/\p{Cc}/u.test(text.replace(/\n/g, "")) || /\p{Cf}/u.test(text)) return null;
  const bytes = Buffer.from(text, "utf8");
  if (bytes.toString("utf8") !== text) return null;
  return text;
}

function parsePackage(input: unknown): Readonly<{ parsed: ParsedPackage; documents: readonly Readonly<{ filename: string; text: string; lines: readonly string[] }>[] }> | null {
  try {
    if (!plain(input, PACKAGE_KEYS) || input.contractVersion !== SEC_EDGAR_8K_FIXTURE_PACKAGE_VERSION || input.sourceProfile !== "SEC_EDGAR_8K_FIXTURE_PROFILE_V1") return null;
    if (!plain(input.receipt, RECEIPT_KEYS) || typeof input.receipt.receiptId !== "string" || !/^SYNTH-RECEIPT-[A-Z0-9-]{4,32}$/.test(input.receipt.receiptId) || !iso(input.receipt.receivedAt) || !iso(input.receipt.effectiveAvailableAt) || !iso(input.receipt.sourcePublishedAt) || Date.parse(input.receipt.receivedAt) < Date.parse(input.receipt.sourcePublishedAt) || Date.parse(input.receipt.effectiveAvailableAt) < Date.parse(input.receipt.receivedAt)) return null;
    if (!plain(input.submissions, SUBMISSIONS_KEYS) || typeof input.submissions.cik !== "string" || !SYNTH_CIK.test(input.submissions.cik) || !plain(input.submissions.recent, RECENT_KEYS)) return null;
    const recent = input.submissions.recent;
    const columns = [recent.accessionNumber, recent.form, recent.filingDate, recent.reportDate, recent.acceptanceDateTime, recent.primaryDocument] as unknown[][];
    if (columns.some((column) => !safeArray(column, 32)) || columns.some((column) => column.length !== columns[0].length) || columns[0].length !== 1) return null;
    const [accessions, forms, filingDates, reportDates, acceptanceTimes, primaryDocuments] = columns as [unknown[], unknown[], unknown[], unknown[], unknown[], unknown[]];
    const accession = accessions[0]; const form = forms[0]; const filingDate = filingDates[0]; const reportDate = reportDates[0]; const acceptanceDateTime = acceptanceTimes[0]; const primaryDocument = primaryDocuments[0];
    if (typeof accession !== "string" || !SYNTH_ACCESSION.test(accession) || !(form === "8-K" || form === "8-K/A") || !date(filingDate) || (reportDate !== null && !date(reportDate)) || !iso(acceptanceDateTime) || typeof primaryDocument !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}\.txt$/.test(primaryDocument) || primaryDocument.includes("..")) return null;
    const index = input.filingIndex;
    if (!plain(index, FILING_INDEX_KEYS) || index.cik !== input.submissions.cik || index.accession !== accession || index.form !== form || index.archivePath !== `/synthetic-edgar/archive/${input.submissions.cik}/${accession}/index.txt` || index.filingDate !== filingDate || index.reportDate !== reportDate || index.acceptanceDateTime !== acceptanceDateTime || index.primaryDocument !== primaryDocument) return null;
    if (index.amendmentOfAccession !== null && (typeof index.amendmentOfAccession !== "string" || !SYNTH_ACCESSION.test(index.amendmentOfAccession) || index.amendmentOfAccession === accession)) return null;
    if ((form === "8-K/A") !== (index.amendmentOfAccession !== null)) return null;
    if (!Number.isSafeInteger(index.documentCount) || !safeArray(index.documents, LIMITS.documentsPerFiling) || index.documentCount !== index.documents.length || index.documents.length < 1 || !safeArray(index.requiredEvidenceFilenames, LIMITS.documentsPerFiling)) return null;
    const requiredEvidenceFilenames = index.requiredEvidenceFilenames as string[];
    if (requiredEvidenceFilenames.some((filename) => typeof filename !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}\.txt$/.test(filename)) || new Set(requiredEvidenceFilenames).size !== requiredEvidenceFilenames.length || [...requiredEvidenceFilenames].sort(ordinal).some((filename, i) => filename !== requiredEvidenceFilenames[i])) return null;
    const descriptors: ParsedPackage["descriptors"][number][] = [];
    for (const d of index.documents) {
      if (!plain(d, DESCRIPTOR_KEYS) || !Number.isSafeInteger(d.sequence) || (d.sequence as number) < 1 || !(d.type === "PRIMARY" || d.type === "EXHIBIT") || typeof d.documentType !== "string" || !(/^PRIMARY_DOCUMENT$/.test(d.documentType) && d.type === "PRIMARY" || /^EXHIBIT-[A-Z0-9.-]{1,20}$/.test(d.documentType) && d.type === "EXHIBIT") || typeof d.filename !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}\.txt$/.test(d.filename) || d.filename.includes("..") || d.contentType !== "text/plain; charset=utf-8" || !Number.isSafeInteger(d.byteLength) || (d.byteLength as number) < 1 || (d.byteLength as number) > LIMITS.documentBytes || typeof d.contentSha256 !== "string" || !HASH.test(d.contentSha256) || d.canonicalizationVersion !== SEC_EDGAR_8K_FIXTURE_TEXT_VERSION) return null;
      descriptors.push({ sequence: d.sequence as number, type: d.type, documentType: d.documentType, filename: d.filename, contentType: d.contentType, byteLength: d.byteLength as number, contentSha256: d.contentSha256, canonicalizationVersion: d.canonicalizationVersion });
    }
    if (new Set(descriptors.map((d) => d.sequence)).size !== descriptors.length || new Set(descriptors.map((d) => d.filename)).size !== descriptors.length || new Set(descriptors.map((d) => d.documentType)).size !== descriptors.length || descriptors.filter((d) => d.type === "PRIMARY").length !== 1 || descriptors.filter((d) => d.type === "PRIMARY" && d.filename === primaryDocument).length !== 1) return null;
    if (descriptors.some((d, i) => d.sequence !== i + 1) || descriptors[0].type !== "PRIMARY" || descriptors[0].filename !== primaryDocument) return null;
    if (requiredEvidenceFilenames.some((f) => !descriptors.some((d) => d.filename === f))) return null;
    if (!safeArray(input.documents, LIMITS.documentsPerFiling) || input.documents.length !== descriptors.length) return null;
    const documents: { filename: string; text: string; lines: readonly string[] }[] = []; let packageBytes = 0;
    for (let i = 0; i < input.documents.length; i++) {
      const doc = input.documents[i]; if (!plain(doc, DOCUMENT_KEYS) || typeof doc.filename !== "string" || typeof doc.content !== "string" || doc.filename !== descriptors[i].filename) return null;
      if (doc.content.length > LIMITS.documentBytes * 2) return null;
      if (ACTIVE_HTML.test(doc.content) || /<\/?[a-z][^>]*>/i.test(doc.content) || /(?:https?:\/\/|\/\/)[a-z0-9.-]+/i.test(doc.content)) return null;
      const text = canonicalText(doc.content); if (text === null) return null;
      const bytes = Buffer.byteLength(text, "utf8"); packageBytes += bytes;
      if (bytes !== descriptors[i].byteLength || sha256Bytes(Buffer.from(text, "utf8")) !== descriptors[i].contentSha256 || bytes > LIMITS.documentBytes) return null;
      const lines = text.split("\n"); if (lines.some((line) => line.length === 0 || line.includes("\t"))) return null;
      documents.push({ filename: doc.filename, text, lines });
    }
    if (packageBytes > LIMITS.packageBytes) return null;
    if (!plain(input.expected, EXPECTED_KEYS) || !Number.isSafeInteger(input.expected.claimCount) || input.expected.claimCount !== 1 || !(input.expected.eventType === "PURCHASE_INTENT_ANNOUNCED" || input.expected.eventType === "BOARD_AUTHORIZATION" || input.expected.eventType === "DEFINITIVE_PURCHASE_AGREEMENT" || input.expected.eventType === "PURCHASE_COMPLETED") || !(input.expected.lifecycleStatus === "INTENT" || input.expected.lifecycleStatus === "AUTHORIZED" || input.expected.lifecycleStatus === "SIGNED" || input.expected.lifecycleStatus === "CONDITIONAL" || input.expected.lifecycleStatus === "COMPLETED") || !(input.expected.amountClassification === "EXACT" || input.expected.amountClassification === "RANGE" || input.expected.amountClassification === "MAXIMUM" || input.expected.amountClassification === "TARGET" || input.expected.amountClassification === "UNKNOWN") || (input.expected.signingDate !== null && !date(input.expected.signingDate)) || (input.expected.expectedClosingDate !== null && !date(input.expected.expectedClosingDate)) || (input.expected.completionDate !== null && !date(input.expected.completionDate))) return null;
    if (!amountValid(input.expected.amountClassification, input.expected.amount ?? "-", input.expected.currency ?? "-")) return null;
    const parsed: ParsedPackage = freeze({ sourceProfile: input.sourceProfile, receipt: { receiptId: input.receipt.receiptId, receivedAt: input.receipt.receivedAt, effectiveAvailableAt: input.receipt.effectiveAvailableAt, sourcePublishedAt: input.receipt.sourcePublishedAt }, filing: { cik: input.submissions.cik, accession, form, filingDate, reportDate, acceptanceDateTime, primaryDocument, amendmentOfAccession: index.amendmentOfAccession }, descriptors: descriptors.sort((a, b) => a.sequence - b.sequence), requiredEvidenceFilenames: [...requiredEvidenceFilenames], expected: { eventType: input.expected.eventType as string, lifecycleStatus: input.expected.lifecycleStatus as string, amountClassification: input.expected.amountClassification as string, amount: input.expected.amount as string | null, currency: input.expected.currency as string | null, signingDate: input.expected.signingDate as string | null, expectedClosingDate: input.expected.expectedClosingDate as string | null, completionDate: input.expected.completionDate as string | null, claimCount: input.expected.claimCount as number } });
    return { parsed, documents: freeze(documents) };
  } catch { return null; }
}

function grammar(text: string): Readonly<Record<string, string>> | null {
  const output: Record<string, string> = Object.create(null) as Record<string, string>;
  const expectedKeys = ["ITEM", "EVENT", "LIFECYCLE", "ISSUER_CIK", "ISSUER_NAME", "ASSET_ID", "ASSET_NAME", "ANNOUNCEMENT_AT", "SIGNING_DATE", "EXPECTED_CLOSING_DATE", "COMPLETION_DATE", "AMOUNT_CLASS", "AMOUNT", "CURRENCY", "BINDING", "ORIGINAL_ACCESSION", "CORRECTS_FIELD"];
  for (const line of text.split("\n")) {
    const sep = line.indexOf("|"); if (sep < 1) return null;
    const key = line.slice(0, sep); const value = line.slice(sep + 1);
    if (!expectedKeys.includes(key) || Object.hasOwn(output, key) || !value || value.includes("|") || value.trim() !== value) return null;
    output[key] = value;
  }
  if (Object.keys(output).sort().join("|") !== [...expectedKeys].sort().join("|")) return null;
  return output;
}

function decimal(value: string): boolean { return /^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{0,7}[1-9])?$/.test(value); }
function compareDecimal(a: string, b: string): number {
  const parts = (value: string) => { const [integer, fraction = ""] = value.split("."); return [integer, fraction.padEnd(8, "0")] as const; };
  const [ai, af] = parts(a); const [bi, bf] = parts(b);
  if (ai.length !== bi.length) return ai.length < bi.length ? -1 : 1;
  if (ai !== bi) return ai < bi ? -1 : 1;
  return af === bf ? 0 : af < bf ? -1 : 1;
}
function amountValid(kind: unknown, amount: unknown, currency: unknown): boolean {
  if (kind === "UNKNOWN") return amount === "-" && currency === "-";
  if (typeof currency !== "string" || !/^SYNTH-CUR-[A-Z0-9]{2,8}$/.test(currency)) return false;
  if (typeof amount !== "string" || amount.length > 64) return false;
  if (kind === "RANGE") {
    const parts = amount.split("..");
    return parts.length === 2 && decimal(parts[0]) && decimal(parts[1]) && compareDecimal(parts[0], parts[1]) < 0;
  }
  return (kind === "EXACT" || kind === "MAXIMUM" || kind === "TARGET") && decimal(amount);
}
function parseClaims(data: Readonly<{ documents: readonly Readonly<{ filename: string; text: string; lines: readonly string[] }>[]; parsed: ParsedPackage }>, sourceArtifact: SecEdgar8kFixtureArtifact): Readonly<{ fields: Readonly<Record<string, string>>; locator: string; excerptFingerprint: string }> | null {
  const primary = data.documents.find((doc) => doc.filename === data.parsed.filing.primaryDocument); if (!primary) return null;
  const fields = grammar(primary.text); if (!fields) return null;
  if (!SYNTH_CIK.test(fields.ISSUER_CIK) || fields.ISSUER_CIK !== data.parsed.filing.cik || !SYNTH_NAME.test(fields.ISSUER_NAME) || !/^asset:fixture:[a-z0-9-]{5,40}$/.test(fields.ASSET_ID) || !SYNTH_NAME.test(fields.ASSET_NAME) || !iso(fields.ANNOUNCEMENT_AT)) return null;
  if (!(fields.ITEM === "1.01" || fields.ITEM === "2.01" || fields.ITEM === "OTHER")) return null;
  if (!(fields.EVENT === "PURCHASE_INTENT_ANNOUNCED" || fields.EVENT === "BOARD_AUTHORIZATION" || fields.EVENT === "DEFINITIVE_PURCHASE_AGREEMENT" || fields.EVENT === "PURCHASE_COMPLETED")) return null;
  if (!(fields.LIFECYCLE === "INTENT" || fields.LIFECYCLE === "AUTHORIZED" || fields.LIFECYCLE === "SIGNED" || fields.LIFECYCLE === "CONDITIONAL" || fields.LIFECYCLE === "COMPLETED")) return null;
  if (!(fields.AMOUNT_CLASS === "EXACT" || fields.AMOUNT_CLASS === "RANGE" || fields.AMOUNT_CLASS === "MAXIMUM" || fields.AMOUNT_CLASS === "TARGET" || fields.AMOUNT_CLASS === "UNKNOWN")) return null;
  if (!amountValid(fields.AMOUNT_CLASS, fields.AMOUNT, fields.CURRENCY)) return null;
  const signingDate = fields.SIGNING_DATE === "-" ? null : fields.SIGNING_DATE; const expectedClosingDate = fields.EXPECTED_CLOSING_DATE === "-" ? null : fields.EXPECTED_CLOSING_DATE; const completionDate = fields.COMPLETION_DATE === "-" ? null : fields.COMPLETION_DATE;
  if ((signingDate !== null && !date(signingDate)) || (expectedClosingDate !== null && !date(expectedClosingDate)) || (completionDate !== null && !date(completionDate))) return null;
  if (!(fields.BINDING === "BINDING" || fields.BINDING === "NON_BINDING" || fields.BINDING === "CONDITIONAL" || fields.BINDING === "UNKNOWN")) return null;
  if (fields.ORIGINAL_ACCESSION !== "-" && !SYNTH_ACCESSION.test(fields.ORIGINAL_ACCESSION)) return null;
  if (!(fields.CORRECTS_FIELD === "-" || fields.CORRECTS_FIELD === "AMOUNT" || fields.CORRECTS_FIELD === "SIGNING_DATE" || fields.CORRECTS_FIELD === "EXPECTED_CLOSING_DATE")) return null;
  if (sourceArtifact.form === "8-K/A" ? fields.ORIGINAL_ACCESSION !== data.parsed.filing.amendmentOfAccession || fields.CORRECTS_FIELD === "-" : fields.ORIGINAL_ACCESSION !== "-" || fields.CORRECTS_FIELD !== "-") return null;
  if (fields.EVENT === "PURCHASE_COMPLETED") { if (fields.ITEM !== "2.01" || fields.LIFECYCLE !== "COMPLETED" || completionDate === null) return null; }
  else if (fields.LIFECYCLE === "COMPLETED" || completionDate !== null) return null;
  if (fields.ITEM === "1.01" && !(fields.EVENT === "DEFINITIVE_PURCHASE_AGREEMENT" && (fields.LIFECYCLE === "SIGNED" || fields.LIFECYCLE === "CONDITIONAL") || fields.EVENT === "PURCHASE_INTENT_ANNOUNCED" && fields.LIFECYCLE === "INTENT")) return null;
  if (fields.ITEM === "2.01" && fields.EVENT !== "PURCHASE_COMPLETED") return null;
  if (fields.EVENT === "DEFINITIVE_PURCHASE_AGREEMENT" && (fields.BINDING !== "BINDING" && fields.BINDING !== "CONDITIONAL" || signingDate === null)) return null;
  if (fields.EVENT === "PURCHASE_INTENT_ANNOUNCED" && fields.BINDING === "BINDING") return null;
  if (fields.EVENT === "BOARD_AUTHORIZATION" && (fields.ITEM !== "OTHER" || fields.LIFECYCLE !== "AUTHORIZED" || fields.BINDING === "BINDING" || completionDate !== null)) return null;
  const expected = data.parsed.expected;
  if (expected.eventType !== fields.EVENT || expected.lifecycleStatus !== fields.LIFECYCLE || expected.amountClassification !== fields.AMOUNT_CLASS || expected.amount !== (fields.AMOUNT === "-" ? null : fields.AMOUNT) || expected.currency !== (fields.CURRENCY === "-" ? null : fields.CURRENCY) || expected.signingDate !== signingDate || expected.expectedClosingDate !== expectedClosingDate || expected.completionDate !== completionDate) return null;
  const locator = `primary:${primary.filename}:line:${primary.lines.indexOf(primary.lines.find((line) => line.startsWith("EVENT|")) ?? "") + 1}`;
  const excerptFingerprint = hash({ extractionVersion: SEC_EDGAR_8K_FIXTURE_EXTRACTION_VERSION, locator, normalizedGrammarFields: canonicalJson(fields) });
  return { fields, locator, excerptFingerprint };
}

export function parseSecEdgar8kFixturePackage(input: unknown): Readonly<{ status: "VALID"; packageId: string }> | Readonly<{ status: "INVALID"; blocker: "SEC_8K_FIXTURE_PACKAGE_INVALID" }> {
  const parsed = parsePackage(input); if (!parsed) return Object.freeze({ status: "INVALID", blocker: "SEC_8K_FIXTURE_PACKAGE_INVALID" });
  return Object.freeze({ status: "VALID", packageId: hash({ version: SEC_EDGAR_8K_FIXTURE_PACKAGE_VERSION, profile: parsed.parsed.sourceProfile, filing: parsed.parsed.filing, descriptors: parsed.parsed.descriptors, requiredEvidenceFilenames: parsed.parsed.requiredEvidenceFilenames }) });
}

export function reconcileSecEdgar8kFixturePackages(inputs: readonly unknown[]): readonly SecEdgar8kFixtureFiling[] | null {
  try {
    if (!safeArray(inputs, LIMITS.packageCount) || inputs.length === 0) return null;
    const parsed = inputs.map(parsePackage); if (parsed.some((entry) => entry === null)) return null;
    const valid = parsed as NonNullable<(typeof parsed)[number]>[];
    const byAccession = new Map<string, number>();
    const receiptIds = new Set<string>();
    for (let i = 0; i < valid.length; i++) { const { filing, receipt } = valid[i].parsed; if (byAccession.has(filing.accession) || receiptIds.has(receipt.receiptId)) return null; byAccession.set(filing.accession, i); receiptIds.add(receipt.receiptId); }
    const amendmentChildren = new Set<string>();
    for (const { parsed: p } of valid) if (p.filing.form === "8-K/A") {
      if (amendmentChildren.has(p.filing.amendmentOfAccession!)) return null;
      amendmentChildren.add(p.filing.amendmentOfAccession!);
      const visited = new Set<string>([p.filing.accession]); let cursor = p.filing;
      while (cursor.form === "8-K/A") {
        const parentAccession = cursor.amendmentOfAccession!; if (visited.has(parentAccession)) return null; visited.add(parentAccession);
        const parentIndex = byAccession.get(parentAccession); if (parentIndex === undefined) return null;
        const parent = valid[parentIndex].parsed.filing; if (parent.cik !== p.filing.cik || parent.accession === cursor.accession || Date.parse(cursor.filingDate) < Date.parse(parent.filingDate) || Date.parse(cursor.acceptanceDateTime) < Date.parse(parent.acceptanceDateTime)) return null;
        cursor = parent;
      }
      if (cursor.form !== "8-K") return null;
    }
    const basePackages = valid.map(({ parsed: p }) => hash({ version: SEC_EDGAR_8K_FIXTURE_PACKAGE_VERSION, profile: p.sourceProfile, filing: p.filing, descriptors: p.descriptors, requiredEvidenceFilenames: p.requiredEvidenceFilenames }));
    const filings: SecEdgar8kFixtureFiling[] = valid.map(({ parsed: p }, i) => {
      const metaId = artifactId("FILING_METADATA", p, null, canonicalJson({ filing: p.filing }), "application/json; charset=utf-8", "sec-edgar-filing-metadata/v1");
      const idxId = artifactId("FILING_INDEX", p, null, canonicalJson({ filing: p.filing, descriptors: p.descriptors, documentCount: p.descriptors.length, requiredEvidenceFilenames: p.requiredEvidenceFilenames }), "application/json; charset=utf-8", "sec-edgar-filing-index/v1");
      const originalIndex = p.filing.amendmentOfAccession ? byAccession.get(p.filing.amendmentOfAccession) : undefined;
      const filing: SecEdgar8kFixtureFiling = freeze({ filingPackageId: `sec-edgar-fixture-filing:${basePackages[i]}`, filingPackageFingerprint: basePackages[i], filing: p.filing, metadataArtifactId: metaId, indexArtifactId: idxId, amendmentOfFilingPackageId: originalIndex === undefined ? null : `sec-edgar-fixture-filing:${basePackages[originalIndex]}`, receiptFingerprint: hash({ receiptId: p.receipt.receiptId, sourcePublishedAt: p.receipt.sourcePublishedAt, receivedAt: p.receipt.receivedAt, effectiveAvailableAt: p.receipt.effectiveAvailableAt }) });
      packageTrust.add(filing); privatePackageData.set(filing, valid[i]);
      return filing;
    });
    return freeze(filings.sort((a, b) => ordinal(a.filing.cik, b.filing.cik) || ordinal(a.filing.accession, b.filing.accession)));
  } catch { return null; }
}

function ordinal(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort(ordinal).map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}
function artifactMaterial(kind: SecEdgar8kFixtureArtifact["kind"], p: ParsedPackage, descriptor: ParsedPackage["descriptors"][number] | null, canonicalContent: string, contentType: string, canonicalizationVersion: string) {
  const bytes = Buffer.from(canonicalContent, "utf8");
  return { sourceProfile: p.sourceProfile, cik: p.filing.cik, accession: p.filing.accession, form: p.filing.form, kind, sequence: descriptor?.sequence ?? null, documentType: descriptor?.documentType ?? null, filename: descriptor?.filename ?? null, contentType, byteLength: bytes.byteLength, contentSha256: sha256Bytes(bytes), canonicalizationVersion };
}
function artifactId(kind: SecEdgar8kFixtureArtifact["kind"], p: ParsedPackage, descriptor: ParsedPackage["descriptors"][number] | null, canonicalContent: string, contentType: string, canonicalizationVersion: string): string {
  return `sec-edgar-fixture-artifact:${hash(artifactMaterial(kind, p, descriptor, canonicalContent, contentType, canonicalizationVersion))}`;
}
function makeArtifact(kind: SecEdgar8kFixtureArtifact["kind"], p: ParsedPackage, packageFingerprint: string, descriptor: ParsedPackage["descriptors"][number] | null, canonicalContent: string, contentType: string, canonicalizationVersion: string): SecEdgar8kFixtureArtifact {
  const material = artifactMaterial(kind, p, descriptor, canonicalContent, contentType, canonicalizationVersion);
  const fingerprint = hash(material); const artifact = freeze({ artifactId: `sec-edgar-fixture-artifact:${fingerprint}`, fingerprint, kind, filingPackageId: `sec-edgar-fixture-filing:${packageFingerprint}`, cik: p.filing.cik, accession: p.filing.accession, form: p.filing.form, sequence: descriptor?.sequence ?? null, documentType: descriptor?.documentType ?? null, filename: descriptor?.filename ?? null, contentType, byteLength: material.byteLength, canonicalizationVersion });
  artifactTrust.add(artifact); return artifact;
}

export function createSecEdgar8kFixtureArtifacts(filing: SecEdgar8kFixtureFiling): readonly SecEdgar8kFixtureArtifact[] | null {
  try {
    if (!filing || typeof filing !== "object" || !packageTrust.has(filing)) return null;
    const stored = privatePackageData.get(filing); if (!stored) return null;
    const { parsed, documents } = stored; const packageFingerprint = filing.filingPackageFingerprint;
    const artifacts: SecEdgar8kFixtureArtifact[] = [
      makeArtifact("FILING_METADATA", parsed, packageFingerprint, null, canonicalJson({ filing: parsed.filing }), "application/json; charset=utf-8", "sec-edgar-filing-metadata/v1"),
      makeArtifact("FILING_INDEX", parsed, packageFingerprint, null, canonicalJson({ filing: parsed.filing, descriptors: parsed.descriptors, documentCount: parsed.descriptors.length, requiredEvidenceFilenames: parsed.requiredEvidenceFilenames }), "application/json; charset=utf-8", "sec-edgar-filing-index/v1"),
    ];
    for (const d of parsed.descriptors) {
      const doc = documents.find((entry) => entry.filename === d.filename); if (!doc) return null;
      artifacts.push(makeArtifact(d.type === "PRIMARY" ? "PRIMARY_DOCUMENT" : "EXHIBIT", parsed, packageFingerprint, d, doc.text, d.contentType, d.canonicalizationVersion));
    }
    return freeze(artifacts);
  } catch { return null; }
}

type PendingClaim = Readonly<{ fields: Readonly<Record<string, string>>; parsed: ParsedPackage; packageId: string; sourceArtifact: SecEdgar8kFixtureArtifact; locator: string; excerptFingerprint: string }>;
function makeClaim(pending: PendingClaim, correctionOfClaimId: string | null): SecEdgar8kFixtureClaim | null {
  const f = pending.fields; const p = pending.parsed; const signingDate = f.SIGNING_DATE === "-" ? null : f.SIGNING_DATE; const expectedClosingDate = f.EXPECTED_CLOSING_DATE === "-" ? null : f.EXPECTED_CLOSING_DATE; const completionDate = f.COMPLETION_DATE === "-" ? null : f.COMPLETION_DATE;
  const lifecycle = f.LIFECYCLE as SecEdgar8kFixtureClaim["lifecycleStatusCandidate"];
  const amount = f.AMOUNT === "-" ? null : f.AMOUNT; const currency = f.CURRENCY === "-" ? null : f.CURRENCY;
  const issuerIdentityCandidate = { syntheticCik: f.ISSUER_CIK, displayName: f.ISSUER_NAME };
  const assetIdentityCandidate = { syntheticAssetId: f.ASSET_ID, displayName: f.ASSET_NAME };
  const material = { extractionVersion: SEC_EDGAR_8K_FIXTURE_EXTRACTION_VERSION, sourceArtifactId: pending.sourceArtifact.artifactId, sourceArtifactFingerprint: pending.sourceArtifact.fingerprint, cik: p.filing.cik, accession: p.filing.accession, form: p.filing.form, filingDate: p.filing.filingDate, reportDate: p.filing.reportDate, acceptanceAt: p.filing.acceptanceDateTime, issuerIdentityCandidate, assetIdentityCandidate, itemCode: f.ITEM, eventTypeCandidate: f.EVENT, lifecycleStatusCandidate: lifecycle, announcementAt: f.ANNOUNCEMENT_AT, signingDate, expectedClosingDate, completionDate, amount, amountClassification: f.AMOUNT_CLASS, currency, bindingStatus: f.BINDING, correctionOfClaimId, locator: pending.locator, excerptFingerprint: pending.excerptFingerprint };
  const fingerprint = hash(material);
  return freeze({ claimId: `sec-edgar-fixture-claim:${fingerprint}`, fingerprint, extractionVersion: SEC_EDGAR_8K_FIXTURE_EXTRACTION_VERSION, sourceArtifactId: pending.sourceArtifact.artifactId, sourceArtifactFingerprint: pending.sourceArtifact.fingerprint, cik: p.filing.cik, accession: p.filing.accession, form: p.filing.form, itemCode: f.ITEM as SecEdgar8kFixtureClaim["itemCode"], filingDate: p.filing.filingDate, reportDate: p.filing.reportDate, acceptanceAt: p.filing.acceptanceDateTime, issuerIdentityCandidate, assetIdentityCandidate, eventTypeCandidate: f.EVENT as SecEdgar8kFixtureClaim["eventTypeCandidate"], lifecycleStatusCandidate: lifecycle, announcementAt: f.ANNOUNCEMENT_AT, signingDate, expectedClosingDate, completionDate, amount, amountClassification: f.AMOUNT_CLASS as SecEdgar8kFixtureClaim["amountClassification"], currency, bindingStatus: f.BINDING as SecEdgar8kFixtureClaim["bindingStatus"], correctionOfClaimId, locator: pending.locator, excerptFingerprint: pending.excerptFingerprint });
}

function amendmentMatches(original: Readonly<Record<string, string>>, amendment: Readonly<Record<string, string>>): boolean {
  const corrected = amendment.CORRECTS_FIELD;
  const amountKeys = new Set(["AMOUNT_CLASS", "AMOUNT", "CURRENCY"]);
  const allowed = corrected === "AMOUNT" ? amountKeys : new Set([corrected]);
  const invariantKeys = ["ITEM", "EVENT", "LIFECYCLE", "ISSUER_CIK", "ISSUER_NAME", "ASSET_ID", "ASSET_NAME", "ANNOUNCEMENT_AT", "SIGNING_DATE", "EXPECTED_CLOSING_DATE", "COMPLETION_DATE", "AMOUNT_CLASS", "AMOUNT", "CURRENCY", "BINDING"];
  if (!invariantKeys.every((key) => allowed.has(key) || original[key] === amendment[key])) return false;
  if (corrected === "AMOUNT") return [...amountKeys].some((key) => original[key] !== amendment[key]);
  return (corrected === "SIGNING_DATE" || corrected === "EXPECTED_CLOSING_DATE") && original[corrected] !== amendment[corrected];
}

export function extractSecEdgar8kFixtureClaims(filing: SecEdgar8kFixtureFiling, artifacts: readonly SecEdgar8kFixtureArtifact[]): readonly SecEdgar8kFixtureClaim[] | null {
  try {
    if (!filing || !packageTrust.has(filing) || filing.filing.form === "8-K/A" || !safeArray(artifacts, LIMITS.documentsPerFiling + 2) || artifacts.some((a) => !artifactTrust.has(a) || a.filingPackageId !== filing.filingPackageId) || new Set(artifacts.map((a) => a.artifactId)).size !== artifacts.length) return null;
    const stored = privatePackageData.get(filing); if (!stored) return null;
    const expectedDocumentCount = stored.parsed.descriptors.length;
    if (artifacts.length !== expectedDocumentCount + 2 || artifacts.filter((a) => a.kind === "FILING_METADATA").length !== 1 || artifacts.filter((a) => a.kind === "FILING_INDEX").length !== 1 || artifacts.filter((a) => a.kind === "PRIMARY_DOCUMENT").length !== 1 || artifacts.filter((a) => a.kind === "EXHIBIT").length !== expectedDocumentCount - 1) return null;
    if (artifacts.find((a) => a.kind === "FILING_METADATA")?.artifactId !== filing.metadataArtifactId || artifacts.find((a) => a.kind === "FILING_INDEX")?.artifactId !== filing.indexArtifactId) return null;
    for (const descriptor of stored.parsed.descriptors) if (!artifacts.some((a) => a.sequence === descriptor.sequence && a.filename === descriptor.filename && a.documentType === descriptor.documentType && a.kind === (descriptor.type === "PRIMARY" ? "PRIMARY_DOCUMENT" : "EXHIBIT"))) return null;
    const primaryArtifact = artifacts.find((a) => a.kind === "PRIMARY_DOCUMENT"); if (!primaryArtifact || primaryArtifact.filename !== stored.parsed.filing.primaryDocument) return null;
    const parsedClaim = parseClaims(stored, primaryArtifact); if (!parsedClaim) return null;
    const claim = makeClaim({ fields: parsedClaim.fields, parsed: stored.parsed, packageId: filing.filingPackageId, sourceArtifact: primaryArtifact, locator: parsedClaim.locator, excerptFingerprint: parsedClaim.excerptFingerprint }, null);
    if (!claim) return null; claimTrust.add(claim); return freeze([claim]);
  } catch { return null; }
}

export function runSecEdgar8kFixtureClaimPipeline(inputs: readonly unknown[]): SecEdgar8kFixturePipelineOutcome {
  try {
    const filings = reconcileSecEdgar8kFixturePackages(inputs); if (!filings) return fail();
    const artifactsByPackage = new Map<string, readonly SecEdgar8kFixtureArtifact[]>(); const artifacts: SecEdgar8kFixtureArtifact[] = [];
    for (const filing of filings) { const made = createSecEdgar8kFixtureArtifacts(filing); if (!made) return fail(); artifactsByPackage.set(filing.filingPackageId, made); artifacts.push(...made); }
    const pending: PendingClaim[] = [];
    for (const filing of filings) {
      const stored = privatePackageData.get(filing); const primaryArtifact = artifactsByPackage.get(filing.filingPackageId)?.find((a) => a.kind === "PRIMARY_DOCUMENT");
      if (!stored || !primaryArtifact) return fail(); const extracted = parseClaims(stored, primaryArtifact); if (!extracted) return fail();
      pending.push({ fields: extracted.fields, parsed: stored.parsed, packageId: filing.filingPackageId, sourceArtifact: primaryArtifact, locator: extracted.locator, excerptFingerprint: extracted.excerptFingerprint });
    }
    const pendingByAccession = new Map(pending.map((p, i) => [p.parsed.filing.accession, i]));
    const claims: SecEdgar8kFixtureClaim[] = [];
    const amendmentDepth = (entry: PendingClaim): number => {
      let depth = 0; let current = entry; const seen = new Set<string>();
      while (current.parsed.filing.form === "8-K/A") {
        const parent = current.parsed.filing.amendmentOfAccession!; if (seen.has(parent)) return LIMITS.packageCount + 1; seen.add(parent);
        const parentIndex = pendingByAccession.get(parent); if (parentIndex === undefined) return LIMITS.packageCount + 1;
        current = pending[parentIndex]; depth++;
      }
      return depth;
    };
    const claimBuildOrder = [...pending].sort((a, b) => amendmentDepth(a) - amendmentDepth(b) || ordinal(a.parsed.filing.accession, b.parsed.filing.accession));
    for (const p of claimBuildOrder) {
      const originalAccession = p.parsed.filing.amendmentOfAccession;
      const originalIndex = originalAccession === null ? undefined : pendingByAccession.get(originalAccession);
      const originalPending = originalIndex === undefined ? null : pending[originalIndex];
      const originalClaim = originalPending === null || originalPending === undefined ? null : claims.find((entry) => entry.accession === originalAccession) ?? null;
      if (p.parsed.filing.form === "8-K/A") {
        if (!originalPending || !originalClaim || !amendmentMatches(originalPending.fields, p.fields)) return fail();
      }
      const claim = makeClaim(p, originalClaim?.claimId ?? null); if (!claim) return fail(); claimTrust.add(claim); claims.push(claim);
    }
    if (claims.length !== inputs.length || new Set(claims.map((c) => c.claimId)).size !== claims.length || new Set(claims.map((c) => `${c.sourceArtifactId}#${c.locator}`)).size !== claims.length) return fail();
    const correctionLineage: { originalFilingPackageId: string; amendmentFilingPackageId: string; originalClaimId: string; amendedClaimId: string; correctedField: string; relation: "APPEND_ONLY_CORRECTION" }[] = [];
    for (const claim of claims) if (claim.form === "8-K/A") {
      const p = pending.find((entry) => entry.parsed.filing.accession === claim.accession)!; const original = claims.find((entry) => entry.accession === p.parsed.filing.amendmentOfAccession);
      if (!original || claim.cik !== original.cik || claim.correctionOfClaimId !== original.claimId || p.fields.CORRECTS_FIELD === "-") return fail();
      const originalPackage = pending.find((entry) => entry.parsed.filing.accession === original.accession); if (!originalPackage) return fail();
      correctionLineage.push({ originalFilingPackageId: originalPackage.packageId, amendmentFilingPackageId: p.packageId, originalClaimId: original.claimId, amendedClaimId: claim.claimId, correctedField: p.fields.CORRECTS_FIELD, relation: "APPEND_ONLY_CORRECTION" });
    }
    const correctionAncestors = new Map<string, Set<string>>();
    for (const claim of claims) {
      const ancestors = new Set<string>(); let parentId = claim.correctionOfClaimId;
      while (parentId) { if (ancestors.has(parentId)) return fail(); ancestors.add(parentId); const parentClaim = claims.find((candidate) => candidate.claimId === parentId); parentId = parentClaim?.correctionOfClaimId ?? null; }
      correctionAncestors.set(claim.claimId, ancestors);
    }
    for (let i = 0; i < claims.length; i++) for (let j = i + 1; j < claims.length; j++) {
      const left = claims[i]; const right = claims[j];
      if (left.cik !== right.cik || left.issuerIdentityCandidate.syntheticCik !== right.issuerIdentityCandidate.syntheticCik || left.assetIdentityCandidate.syntheticAssetId !== right.assetIdentityCandidate.syntheticAssetId || left.eventTypeCandidate !== right.eventTypeCandidate) continue;
      const conflict = left.lifecycleStatusCandidate !== right.lifecycleStatusCandidate || left.amount !== right.amount || left.amountClassification !== right.amountClassification || left.currency !== right.currency || left.signingDate !== right.signingDate || left.expectedClosingDate !== right.expectedClosingDate || left.completionDate !== right.completionDate;
      if (conflict && !correctionAncestors.get(left.claimId)?.has(right.claimId) && !correctionAncestors.get(right.claimId)?.has(left.claimId)) return fail();
    }
    for (const claim of claims) claimTrust.add(claim);
    const sortedClaims = claims.sort((a, b) => ordinal(a.cik, b.cik) || ordinal(a.accession, b.accession) || ordinal(a.claimId, b.claimId));
    const locators = sortedClaims.map((c) => `${c.sourceArtifactId}#${c.locator}`).sort(ordinal);
    const artifactIds = artifacts.map((a) => a.artifactId).sort(ordinal);
    if (new Set(artifactIds).size !== artifactIds.length || new Set(locators).size !== locators.length) return fail();
    const claimIds = sortedClaims.map((c) => c.claimId).sort(ordinal);
    const claimMaterial = { pipelineVersion: SEC_EDGAR_8K_FIXTURE_PIPELINE_VERSION, extractionVersion: SEC_EDGAR_8K_FIXTURE_EXTRACTION_VERSION, filingPackageIds: filings.map((f) => f.filingPackageId).sort(ordinal), artifactIds, claimIds, locators, correctionLineage };
    const claimSetFingerprint = hash(claimMaterial); const claimSet = freeze({ claimSetId: `sec-edgar-fixture-claim-set:${claimSetFingerprint}`, fingerprint: claimSetFingerprint, memberCount: sortedClaims.length, claimIds, artifactIds, locatorKeys: locators, extractionVersion: SEC_EDGAR_8K_FIXTURE_EXTRACTION_VERSION }); claimSetTrust.add(claimSet);
    const receipts = filings.map((filing) => { const p = privatePackageData.get(filing)!.parsed.receipt; return freeze({ receiptId: p.receiptId, filingPackageId: filing.filingPackageId, sourcePublishedAt: p.sourcePublishedAt, receivedAt: p.receivedAt, effectiveAvailableAt: p.effectiveAvailableAt, fingerprint: hash({ receiptId: p.receiptId, filingPackageId: filing.filingPackageId, sourcePublishedAt: p.sourcePublishedAt, receivedAt: p.receivedAt, effectiveAvailableAt: p.effectiveAvailableAt }) }); });
    const replayFingerprint = hash({ claimSetFingerprint, receipts: receipts.map((r) => r.fingerprint).sort(ordinal) });
    const result: SecEdgar8kFixtureResult = freeze({ status: "VALID", classification: SEC_EDGAR_8K_FIXTURE_RESULT_KIND, pipelineVersion: SEC_EDGAR_8K_FIXTURE_PIPELINE_VERSION, filings, artifacts: artifacts.sort((a, b) => ordinal(a.artifactId, b.artifactId)), receipts, claims: sortedClaims, correctionLineage: correctionLineage.sort((a, b) => ordinal(a.amendedClaimId, b.amendedClaimId)), claimSet, replayFingerprint, production: Object.freeze({ acquisition: "BLOCKED", persistence: "BLOCKED", eventAuthority: "BLOCKED", signals: "BLOCKED" }), sideEffects: Object.freeze({ authority: 0, persistence: 0, signal: 0 }) });
    resultTrust.add(result); return result;
  } catch { return fail(); }
}

export function isAuthenticSecEdgar8kFixturePackage(value: unknown): value is SecEdgar8kFixtureFiling { return !!value && typeof value === "object" && packageTrust.has(value); }
export function isAuthenticSecEdgar8kFixtureArtifact(value: unknown): value is SecEdgar8kFixtureArtifact { return !!value && typeof value === "object" && artifactTrust.has(value); }
export function isAuthenticSecEdgar8kFixtureClaim(value: unknown): value is SecEdgar8kFixtureClaim { return !!value && typeof value === "object" && claimTrust.has(value); }
export function isAuthenticSecEdgar8kFixtureClaimSet(value: unknown): boolean { return !!value && typeof value === "object" && claimSetTrust.has(value); }
export function isAuthenticSecEdgar8kFixtureResult(value: unknown): value is SecEdgar8kFixtureResult { return !!value && typeof value === "object" && resultTrust.has(value); }
/** Versioned synthetic adapter. UTF-8 bytes here are fixture entity bodies, never observed SEC HTTP responses. */
export function isAuthenticSecFixtureEntityMaterial(value:unknown):value is SecRuntimeMaterial {
  return !!value && typeof value === "object" && entityMaterialTrust.has(value);
}
export function adaptSecEdgarFixtureToEntityBytes(value: unknown, receiptOverride?: Readonly<{receivedAt:string;effectiveAvailableAt:string}>, selectedAccession?:string,reservePayload?:(byteBudget:number)=>void): SecRuntimeMaterial | null {
  let reservationFailed=false;
  try {
    if (!isAuthenticSecEdgar8kFixtureResult(value)) return null;
    if(selectedAccession!==undefined&&(typeof selectedAccession!=="string"||!SYNTH_ACCESSION.test(selectedAccession)))return null;
    if(receiptOverride){if(!receiptOverride||typeof receiptOverride!=="object"||utilTypes.isProxy(receiptOverride)||Object.getPrototypeOf(receiptOverride)!==Object.prototype||Reflect.ownKeys(receiptOverride).length!==2||!Reflect.ownKeys(receiptOverride).every(k=>k==="receivedAt"||k==="effectiveAvailableAt")||Reflect.ownKeys(receiptOverride).some(k=>{const d=Object.getOwnPropertyDescriptor(receiptOverride,k);return !d||!("value" in d)||!!d.get||!!d.set;}))return null;}
    const filing=selectedAccession===undefined?value.filings[0]:value.filings.find(candidate=>candidate.filing.accession===selectedAccession); if(!filing) return null;
    const stored=privatePackageData.get(filing); if(!stored) return null;
    const p=stored.parsed; const sourceProfile=parseSecRuntimeSourceProfile({profileId:"sec-edgar-synthetic-fixture-profile/v1",contractVersion:"sec-edgar-synthetic-fixture-profile/v1",providerId:"SYNTHETIC_FIXTURE",datasetId:"sec-edgar-8k-fixture",datasetVersion:SEC_EDGAR_8K_FIXTURE_PACKAGE_VERSION,endpointProfile:"SYNTHETIC_FIXTURE_ADAPTER",pathTemplate:"/synthetic-edgar/archive/{cik}/{accession}",method:"FIXTURE_ADAPTER",requestIdentityPolicy:"synthetic-fixture-replay/v1"});const profileId=sourceProfile.profileId;
    const profileFingerprint=canonicalSha256({contractVersion:sourceProfile.contractVersion,provider:sourceProfile.providerId,dataset:sourceProfile.datasetId,version:sourceProfile.datasetVersion,endpointProfile:sourceProfile.endpointProfile,hostnameAllowlist:[],pathTemplate:sourceProfile.pathTemplate,method:sourceProfile.method,supportedForms:["8-K","8-K/A"],authenticationKind:"NONE",acceptedContentEncoding:["identity"],requestIdentityPolicy:sourceProfile.requestIdentityPolicy,maxTimeoutMs:15_000,maxResponseBytes:8*1024*1024,maxPackageDocuments:32,classification:"SYNTHETIC_NON_AUTHORITATIVE"});
    const archive=`/synthetic-edgar/archive/${p.filing.cik}/${p.filing.accession}`;
    const indexText=canonicalJson({adapter:"sec-edgar-synthetic-entity-bytes/v1",filing:p.filing,descriptors:p.descriptors,documentCount:p.descriptors.length,requiredEvidenceFilenames:p.requiredEvidenceFilenames});
    const sizes=[Buffer.byteLength(indexText,"utf8"),...p.descriptors.map(d=>Buffer.byteLength(stored.documents.find(x=>x.filename===d.filename)!.text,"utf8"))];
    if(!secRuntimeBoundsAreValid(sizes,p.descriptors.length))return null;
    try{reservePayload?.(2*sizes.reduce((sum,size)=>sum+size,0)+4*Math.max(...sizes));}catch(error){reservationFailed=true;throw error;}
    const indexBody=Buffer.from(indexText,"utf8");
    const documents:SecRuntimeMaterial["documents"][number][]=[{locator:`${archive}/index.json`,role:"FILING_INDEX",documentType:"FILING_INDEX",sequence:0,contentType:"application/json",contentEncoding:"identity",bytes:indexBody}];
    for(const d of p.descriptors){const doc=stored.documents.find(x=>x.filename===d.filename);if(!doc)return null;documents.push({locator:`${archive}/${d.filename}`,role:d.type==="PRIMARY"?"PRIMARY_DOCUMENT":"EXHIBIT",documentType:d.documentType,sequence:d.sequence,contentType:"text/plain",contentEncoding:"identity",bytes:Buffer.from(doc.text,"utf8")});}
    const material=Object.freeze({profileId,profileFingerprint,cik:p.filing.cik,accession:p.filing.accession,form:p.filing.form,filingDate:p.filing.filingDate,acceptanceAt:p.filing.acceptanceDateTime,reportPeriod:p.filing.reportDate,amendmentParent:p.filing.amendmentOfAccession,receipt:Object.freeze({receiptId:p.receipt.receiptId,receivedAt:receiptOverride?.receivedAt??p.receipt.receivedAt,effectiveAvailableAt:receiptOverride?.effectiveAvailableAt??p.receipt.effectiveAvailableAt,responseStatus:200}),documents:Object.freeze(documents.map(doc=>{const snapshot=doc.bytes;return Object.freeze({...doc,get bytes(){return Buffer.from(snapshot);}});}))});
    entityMaterialTrust.add(material);
    return material;
  } catch(error) { if(reservationFailed)throw error;return null; }
}
export function rejectSecEdgar8kFixtureClaimAsAuthority(value: unknown): null { void value; return null; }
