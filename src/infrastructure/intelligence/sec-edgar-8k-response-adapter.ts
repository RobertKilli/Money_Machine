import "server-only";

import { TextDecoder } from "node:util";
import { SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE, type SecEdgar8kTransportExchange } from "@/infrastructure/intelligence/sec-edgar-8k-node-transport";
import { consumeSecEdgar8kExchangeBodiesForAdapter } from "@/infrastructure/intelligence/sec-edgar-8k-node-transport";
import type { SecEdgar8kRequestPlan } from "@/domain/intelligence/sec-edgar-8k-event-source-qualification";

export type SecEdgar8kResponseAdapterCode =
  | "SEC_RESPONSE_EXCHANGE_UNAUTHENTIC"
  | "SEC_RESPONSE_PLAN_INVALID"
  | "SEC_RESPONSE_CONTENT_TYPE_INVALID"
  | "SEC_RESPONSE_BODY_INVALID"
  | "SEC_SUBMISSIONS_SCHEMA_INVALID"
  | "SEC_SUBMISSIONS_CIK_MISMATCH"
  | "SEC_SUBMISSIONS_PARALLEL_ARRAYS_MISMATCH"
  | "SEC_TARGET_ACCESSION_NOT_FOUND"
  | "SEC_HISTORY_FILE_REQUIRED"
  | "SEC_HISTORY_FILE_NOT_REFERENCED"
  | "SEC_HISTORY_FILE_AMBIGUOUS"
  | "SEC_FILING_INDEX_INVALID"
  | "SEC_FILING_IDENTITY_MISMATCH"
  | "SEC_FILING_DOCUMENT_PATH_INVALID"
  | "SEC_FILING_EVIDENCE_INCOMPLETE";

export type SecEdgar8kFilingEvidence = Readonly<{
  contractVersion: "sec-edgar-8k-structured-filing-evidence/v1";
  status: "RECONCILED_METADATA_ONLY";
  authority: "NON_AUTHORITATIVE_SOURCE_METADATA";
  identity: Readonly<{ cik: "0000789019"; accession: "0001193125-23-255762"; form: "8-K" }>;
  filingDate: "2023-10-13";
  acceptanceDateTime: string | null;
  eventDate: null;
  retrievedAt: string;
  primaryDocument: Readonly<{ filename: "d537928d8k.htm"; url: string; contentRetrieved: false }>;
  evidence: Readonly<{
    cik: Readonly<{ value: string; sources: readonly string[] }>;
    accession: Readonly<{ value: string; sources: readonly string[] }>;
    form: Readonly<{ value: string; sources: readonly string[] }>;
    filingDate: Readonly<{ value: string; sources: readonly string[] }>;
    primaryDocument: Readonly<{ value: string; sources: readonly string[] }>;
    acceptanceDateTime: Readonly<{ value: string | null; sources: readonly string[] }>;
  }>;
}>;

export type SecEdgar8kResponseAdapterResult =
  | Readonly<{ status: "BLOCKED"; code: SecEdgar8kResponseAdapterCode; diagnostic?: SecEdgar8kSanitizedDiagnostic; historyRequest?: Readonly<{ filename: string; url: string }> }>
  | Readonly<{ status: "VERIFIED"; evidence: SecEdgar8kFilingEvidence }>;

/** Fixed, value-free diagnostics. Never includes response values, excerpts, or contact data. */
export type SecEdgar8kSanitizedDiagnostic = Readonly<{
  stage: "TRANSPORT" | "JSON" | "SUBMISSIONS" | "HISTORY_MANIFEST" | "HISTORY_SUBMISSIONS";
  reason: "HTTP_STATUS_REJECTED" | "CONTENT_TYPE_REJECTED" | "INVALID_UTF8" | "INVALID_JSON" | "FIELD_MISSING" | "FIELD_INVALID" | "ARRAY_ELEMENT_INVALID" | "PARALLEL_ARRAY_LENGTH_MISMATCH" | "ROW_INVALID";
  field?: "root" | "cik" | "filings" | "filings.recent" | "filings.recent.accessionNumber" | "filings.recent.form" | "filings.recent.filingDate" | "filings.recent.acceptanceDateTime" | "filings.recent.primaryDocument" | "filings.files" | "filings.files[].name" | "filings.files[].filingFrom" | "filings.files[].filingTo";
}>;

type Row = { accession: string; form: string; filingDate: string; acceptanceDateTime: string | null; primaryDocument: string };
type ParsedSubmissions = { cik: string | null; rows: Row[]; files: { name: string; filingFrom: string; filingTo: string }[] };
const SCOPE = SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE;
const fail = (code: SecEdgar8kResponseAdapterCode, diagnostic?: SecEdgar8kSanitizedDiagnostic): SecEdgar8kResponseAdapterResult => Object.freeze({ status: "BLOCKED", code, ...(diagnostic ? { diagnostic } : {}) });
const dateOnly = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00.000Z`)) && new Date(`${v}T00:00:00.000Z`).toISOString().slice(0, 10) === v;
const utcMillis = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const acceptedUtc = (v: unknown): string | null => {
  if (utcMillis(v)) return v;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) && Number.isFinite(Date.parse(v))) return new Date(v).toISOString();
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) && Number.isFinite(Date.parse(v.replace(" ", "T") + "Z"))) return new Date(v.replace(" ", "T") + "Z").toISOString();
  return null;
};
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const normalizeCik = (v: unknown): string | null => {
  if (typeof v === "number" && Number.isSafeInteger(v) && v > 0) return String(v).padStart(10, "0");
  if (typeof v === "string" && /^\d{1,10}$/.test(v)) return v.padStart(10, "0");
  return null;
};
const decode = (bytes: Buffer): string | null => {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return null; }
};
type JsonParseResult = Readonly<{ status: "VALID"; value: unknown }> | Readonly<{ status: "INVALID_UTF8" }> | Readonly<{ status: "INVALID_JSON" }>;
const parseJson = (bytes: Buffer): JsonParseResult => {
  const text = decode(bytes);
  if (text === null) return Object.freeze({ status: "INVALID_UTF8" });
  try { return Object.freeze({ status: "VALID", value: JSON.parse(text) as unknown }); }
  catch { return Object.freeze({ status: "INVALID_JSON" }); }
};
type StringArrayIssue = "FIELD_INVALID" | "ARRAY_ELEMENT_INVALID" | null;
function stringArrayIssue(value: unknown): StringArrayIssue {
  if (!Array.isArray(value) || value.length > 1000) return "FIELD_INVALID";
  return value.every((entry) => typeof entry === "string") ? null : "ARRAY_ELEMENT_INVALID";
}
function parallelArraysUnequal(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const filings = isRecord(value.filings) ? value.filings : value;
  const source = isRecord(filings.recent) ? filings.recent : filings;
  const allArrayColumns = Object.values(source).filter(Array.isArray) as unknown[][];
  return new Set(allArrayColumns.map((column) => column.length)).size > 1;
}

type SubmissionsValidation = Readonly<{ status: "VALID"; value: ParsedSubmissions }> | Readonly<{ status: "INVALID"; diagnostic: SecEdgar8kSanitizedDiagnostic }>;
const schemaIssue = (stage: "SUBMISSIONS" | "HISTORY_MANIFEST" | "HISTORY_SUBMISSIONS", reason: SecEdgar8kSanitizedDiagnostic["reason"], field?: NonNullable<SecEdgar8kSanitizedDiagnostic["field"]>): SubmissionsValidation => ({
  status: "INVALID",
  diagnostic: Object.freeze({ stage, reason, ...(field ? { field } : {}) }),
});

function submissions(value: unknown, allowMissingCik = false): SubmissionsValidation {
  const stage = allowMissingCik ? "HISTORY_SUBMISSIONS" : "SUBMISSIONS";
  if (!isRecord(value)) return schemaIssue(stage, "FIELD_INVALID", "root");
  if (value.cik === undefined && !allowMissingCik) return schemaIssue(stage, "FIELD_MISSING", "cik");
  const cik = normalizeCik(value.cik);
  if ((value.cik !== undefined && !cik) || (!cik && !allowMissingCik)) return schemaIssue(stage, "FIELD_INVALID", "cik");
  if (value.filings !== undefined && !isRecord(value.filings)) return schemaIssue(stage, "FIELD_INVALID", "filings");
  const wrapped = isRecord(value.filings);
  const filings = wrapped ? value.filings as Record<string, unknown> : value;
  const rawFiles = filings.files;
  const files: ParsedSubmissions["files"] = [];
  const manifestStage = stage === "SUBMISSIONS" ? "HISTORY_MANIFEST" : "HISTORY_SUBMISSIONS";
  if (rawFiles !== undefined) {
    if (!Array.isArray(rawFiles) || rawFiles.length > 1000) return schemaIssue(manifestStage, "FIELD_INVALID", "filings.files");
    for (const entry of rawFiles) {
      if (!isRecord(entry)) return schemaIssue(manifestStage, "FIELD_INVALID", "filings.files");
      if (typeof entry.name !== "string" || !/^CIK\d{10}-submissions-\d+\.json$/.test(entry.name)) return schemaIssue(manifestStage, "FIELD_INVALID", "filings.files[].name");
      if (!dateOnly(entry.filingFrom)) return schemaIssue(manifestStage, "FIELD_INVALID", "filings.files[].filingFrom");
      if (!dateOnly(entry.filingTo) || entry.filingFrom > entry.filingTo) return schemaIssue(manifestStage, "FIELD_INVALID", "filings.files[].filingTo");
      files.push({ name: entry.name, filingFrom: entry.filingFrom, filingTo: entry.filingTo });
    }
  }

  const recent = filings.recent;
  if (recent === undefined && !Array.isArray(filings.accessionNumber)) return schemaIssue(stage, "FIELD_MISSING", "filings.recent");
  if (recent !== undefined && !isRecord(recent)) return schemaIssue(stage, "FIELD_INVALID", "filings.recent");
  const source = recent === undefined ? filings : recent;
  if (!isRecord(source)) return schemaIssue(stage, "FIELD_INVALID", "filings.recent");
  const names = ["accessionNumber", "form", "filingDate", "primaryDocument"] as const;
  const diagnosticField = (name: string): NonNullable<SecEdgar8kSanitizedDiagnostic["field"]> => `filings.recent.${name}` as NonNullable<SecEdgar8kSanitizedDiagnostic["field"]>;
  const columns = names.map((name) => source[name]);
  for (let i = 0; i < names.length; i++) {
    if (source[names[i]!] === undefined) return schemaIssue(stage, "FIELD_MISSING", diagnosticField(names[i]!));
    const issue = stringArrayIssue(columns[i]);
    if (issue) return schemaIssue(stage, issue, diagnosticField(names[i]!));
  }
  const acceptancePresent = source.acceptanceDateTime !== undefined;
  if (acceptancePresent) {
    const issue = stringArrayIssue(source.acceptanceDateTime);
    if (issue) return schemaIssue(stage, issue, "filings.recent.acceptanceDateTime");
  }
  const accessions = columns[0] as string[];
  const forms = columns[1] as string[];
  const filingDates = columns[2] as string[];
  const documents = columns[3] as string[];
  const accepted = acceptancePresent ? source.acceptanceDateTime as string[] : null;
  const rowCount = accessions.length;
  if (columns.some((column) => (column as string[]).length !== rowCount) || (accepted && accepted.length !== rowCount)) return schemaIssue(stage, "PARALLEL_ARRAY_LENGTH_MISMATCH", "filings.recent");
  const rows: Row[] = [];
  for (let i = 0; i < accessions.length; i++) {
    const acceptedValue = accepted?.[i] ?? "";
    const normalizedAcceptance = acceptedValue === "" ? null : acceptedUtc(acceptedValue);
    if (!/^\d{10}-\d{2}-\d{6}$/.test(accessions[i]!)) return schemaIssue(stage, "ROW_INVALID", "filings.recent.accessionNumber");
    if (!/^[A-Z0-9/-]{1,20}$/.test(forms[i]!)) return schemaIssue(stage, "ROW_INVALID", "filings.recent.form");
    if (!dateOnly(filingDates[i]!)) return schemaIssue(stage, "ROW_INVALID", "filings.recent.filingDate");
    if (acceptedValue !== "" && !normalizedAcceptance) return schemaIssue(stage, "ROW_INVALID", "filings.recent.acceptanceDateTime");
    if (documents[i] !== "" && !safeFilename(documents[i]!)) return schemaIssue(stage, "ROW_INVALID", "filings.recent.primaryDocument");
    rows.push({ accession: accessions[i]!, form: forms[i]!, filingDate: filingDates[i]!, acceptanceDateTime: normalizedAcceptance, primaryDocument: documents[i]! });
  }
  return Object.freeze({ status: "VALID", value: { cik, rows, files } });
}

function safeFilename(filename: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(filename) && !filename.includes("..") && !filename.includes("/") && !filename.includes("\\") && !filename.includes("?") && !filename.includes("#");
}
function expectedDocumentHref(href: string, filename: string): boolean {
  const path = `/Archives/edgar/data/789019/000119312523255762/${filename}`;
  return href === filename || href === path || href === `https://www.sec.gov${path}`;
}

const decodeEntities = (text: string): string => text.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#\d+;|&#x[\da-f]+;/gi, (entity) => {
  const named: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&apos;": "'", "&nbsp;": " " };
  if (entity in named) return named[entity]!;
  const code = entity.startsWith("&#x") || entity.startsWith("&#X") ? Number.parseInt(entity.slice(3, -1), 16) : Number.parseInt(entity.slice(2, -1), 10);
  return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : "";
});
const cellText = (html: string): string => decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

type ParsedIndex = { cik: string; accession: string; form: string; filingDate: string; acceptanceDateTime: string | null; primaryDocument: string };
type IndexParse = Readonly<{ status: "VALID"; index: ParsedIndex }> | Readonly<{ status: "INVALID"; code: "SEC_FILING_INDEX_INVALID" | "SEC_FILING_DOCUMENT_PATH_INVALID" }>;
function parseIndex(html: string): IndexParse {
  const formMatch = html.match(/Form\s+([A-Z0-9/-]+)\s*-/i);
  const accessionMatch = html.match(/SEC\s+Accession\s+No\.\s*([\d-]+)/i);
  const cikMatch = html.match(/\bCIK:\s*(?:<[^>]*>\s*)?(\d{1,10})/i);
  const filingMatch = html.match(/<div[^>]*class=["'][^"']*infoHead[^"']*["'][^>]*>Filing Date<\/div>\s*<div[^>]*class=["'][^"']*info[^"']*["'][^>]*>([\d-]+)<\/div>/i)
    ?? html.match(/Filing Date\s*<\/[^>]+>\s*<[^>]+>([\d-]+)</i);
  const acceptedMatch = html.match(/<div[^>]*class=["'][^"']*infoHead[^"']*["'][^>]*>Accepted<\/div>\s*<div[^>]*class=["'][^"']*info[^"']*["'][^>]*>([^<]+)<\/div>/i)
    ?? html.match(/Accepted\s*<\/[^>]+>\s*<[^>]+>(\d{4}-\d\d-\d\d\s+\d\d:\d\d:\d\d)/i);
  if (!formMatch || !accessionMatch || !cikMatch || !filingMatch) return { status: "INVALID", code: "SEC_FILING_INDEX_INVALID" };
  const cik = normalizeCik(cikMatch[1]);
  const form = formMatch[1]!.toUpperCase();
  const filingDate = filingMatch[1]!;
  const accession = accessionMatch[1]!;
  if (!cik || !dateOnly(filingDate) || !/^\d{10}-\d{2}-\d{6}$/.test(accession) || !["8-K", "8-K/A"].includes(form)) return { status: "INVALID", code: "SEC_FILING_INDEX_INVALID" };

  const documentSection = html.match(/<table[^>]*class=["'][^"']*tableFile[^"']*["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!documentSection) return { status: "INVALID", code: "SEC_FILING_INDEX_INVALID" };
  const rows = [...documentSection.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const candidates: string[] = [];
  for (const match of rows) {
    const cells = [...match[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cell[1]!);
    if (cells.length < 4) continue;
    const documentCell = cells[2]!;
    const type = cellText(cells[3]!).toUpperCase();
    if (type !== form) continue;
    const link = documentCell.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) return { status: "INVALID", code: "SEC_FILING_INDEX_INVALID" };
    const href = decodeEntities(link[1]!);
    const linkedName = href.split("/").at(-1) ?? "";
    const shownName = cellText(link[2]!);
    if (!safeFilename(linkedName) || !expectedDocumentHref(href, linkedName)) return { status: "INVALID", code: "SEC_FILING_DOCUMENT_PATH_INVALID" };
    if (shownName !== linkedName) return { status: "INVALID", code: "SEC_FILING_INDEX_INVALID" };
    candidates.push(linkedName);
  }
  if (candidates.length !== 1) return { status: "INVALID", code: "SEC_FILING_INDEX_INVALID" };
  const acceptedRaw = acceptedMatch?.[1]?.trim();
  const acceptanceDateTime = acceptedRaw ? acceptedUtc(acceptedRaw.replace(" ", "T") + "Z") : null;
  if (acceptedRaw && !acceptanceDateTime) return { status: "INVALID", code: "SEC_FILING_INDEX_INVALID" };
  return { status: "VALID", index: { cik, accession, form, filingDate, acceptanceDateTime, primaryDocument: candidates[0]! } };
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export type SecEdgar8kManifestStageResult = Readonly<{ status: "READY_FOR_INDEX" } | { status: "HISTORY_REQUIRED"; filename: string } | { status: "BLOCKED"; code: SecEdgar8kResponseAdapterCode; diagnostic?: SecEdgar8kSanitizedDiagnostic }>;
const manifestBlocked = (code: SecEdgar8kResponseAdapterCode, diagnostic?: SecEdgar8kSanitizedDiagnostic): SecEdgar8kManifestStageResult => Object.freeze({ status: "BLOCKED", code, ...(diagnostic ? { diagnostic } : {}) });
function inspectSingleJsonExchange(exchange: SecEdgar8kTransportExchange, expectedProfile: "COMPANY_SUBMISSIONS_JSON" | "SUBMISSIONS_HISTORY_JSON"):
  | { status: "OK"; value: unknown; plan: SecEdgar8kRequestPlan }
  | { status: "BLOCKED"; code: SecEdgar8kResponseAdapterCode; diagnostic?: SecEdgar8kSanitizedDiagnostic } {
  const responses = consumeSecEdgar8kExchangeBodiesForAdapter(exchange);
  if (!responses || responses.length !== 1) return { status: "BLOCKED", code: "SEC_RESPONSE_EXCHANGE_UNAUTHENTIC" };
  const response = responses[0]!;
  const observation = exchange.observations[0];
  if (response.plan.profileId !== expectedProfile || observation?.profileId !== expectedProfile || observation.url !== response.plan.url || observation.statusCode !== 200 || observation.contentType !== "application/json" || observation.byteLength !== response.bytes.length || response.bytes.length > SCOPE.maxResponseBytes || response.plan.cik !== SCOPE.cik || response.plan.accession !== SCOPE.accession) {
    response.bytes.fill(0);
    return { status: "BLOCKED", code: "SEC_RESPONSE_PLAN_INVALID" };
  }
  const parsedJson = parseJson(response.bytes);
  response.bytes.fill(0);
  if (parsedJson.status === "INVALID_UTF8") return { status: "BLOCKED", code: "SEC_RESPONSE_BODY_INVALID", diagnostic: Object.freeze({ stage: "JSON", reason: "INVALID_UTF8" }) };
  if (parsedJson.status === "INVALID_JSON") return { status: "BLOCKED", code: "SEC_RESPONSE_BODY_INVALID", diagnostic: Object.freeze({ stage: "JSON", reason: "INVALID_JSON" }) };
  return { status: "OK", value: parsedJson.value, plan: response.plan };
}

/** Internal staged preflight. It exposes only the single safe manifest filename needed by the server transport. */
export function inspectSecEdgar8kSubmissionsStage(exchange: SecEdgar8kTransportExchange): SecEdgar8kManifestStageResult {
  const result = inspectSingleJsonExchange(exchange, "COMPANY_SUBMISSIONS_JSON");
  if (result.status !== "OK") return manifestBlocked(result.code, result.diagnostic);
  const current = result.value;
  if (parallelArraysUnequal(current)) return manifestBlocked("SEC_SUBMISSIONS_PARALLEL_ARRAYS_MISMATCH", Object.freeze({ stage: "SUBMISSIONS", reason: "PARALLEL_ARRAY_LENGTH_MISMATCH", field: "filings.recent" }));
  const parsed = submissions(current);
  if (parsed.status === "INVALID") return manifestBlocked("SEC_SUBMISSIONS_SCHEMA_INVALID", parsed.diagnostic);
  if (parsed.value.cik !== SCOPE.cik) return manifestBlocked("SEC_SUBMISSIONS_CIK_MISMATCH", Object.freeze({ stage: "SUBMISSIONS", reason: "FIELD_INVALID", field: "cik" }));
  const selected = parsed.value.rows.filter((row) => row.accession === SCOPE.accession);
  if (selected.length > 1) return manifestBlocked("SEC_FILING_IDENTITY_MISMATCH");
  if (selected.length === 1) {
    const row = selected[0]!;
    if (row.form !== SCOPE.form || row.filingDate !== SCOPE.filingDate || row.primaryDocument !== SCOPE.primaryDocument) return manifestBlocked("SEC_FILING_IDENTITY_MISMATCH");
    return Object.freeze({ status: "READY_FOR_INDEX" });
  }
  const candidates = parsed.value.files.filter((file) => file.filingFrom <= SCOPE.filingDate && file.filingTo >= SCOPE.filingDate);
  if (candidates.length > 1) return manifestBlocked("SEC_HISTORY_FILE_AMBIGUOUS");
  if (candidates.length === 0) return manifestBlocked("SEC_TARGET_ACCESSION_NOT_FOUND");
  return Object.freeze({ status: "HISTORY_REQUIRED", filename: candidates[0]!.name });
}

/** Reject historical payloads before the filing index can be requested. */
export function validateSecEdgar8kHistoryStage(exchange: SecEdgar8kTransportExchange, selectedFilename: string): SecEdgar8kManifestStageResult {
  if (!/^CIK0000789019-submissions-[0-9]+\.json$/.test(selectedFilename)) return manifestBlocked("SEC_HISTORY_FILE_NOT_REFERENCED");
  const result = inspectSingleJsonExchange(exchange, "SUBMISSIONS_HISTORY_JSON");
  if (result.status !== "OK") return manifestBlocked(result.code, result.diagnostic);
  const actualFilename = new URL(result.plan.url).pathname.split("/").at(-1);
  if (actualFilename !== selectedFilename) return manifestBlocked("SEC_HISTORY_FILE_NOT_REFERENCED");
  if (parallelArraysUnequal(result.value)) return manifestBlocked("SEC_SUBMISSIONS_PARALLEL_ARRAYS_MISMATCH", Object.freeze({ stage: "HISTORY_SUBMISSIONS", reason: "PARALLEL_ARRAY_LENGTH_MISMATCH", field: "filings.recent" }));
  const history = submissions(result.value, true);
  if (history.status === "INVALID") return manifestBlocked("SEC_SUBMISSIONS_SCHEMA_INVALID", history.diagnostic);
  if (history.value.cik !== null && history.value.cik !== SCOPE.cik) return manifestBlocked("SEC_SUBMISSIONS_CIK_MISMATCH", Object.freeze({ stage: "HISTORY_SUBMISSIONS", reason: "FIELD_INVALID", field: "cik" }));
  const selected = history.value.rows.filter((row) => row.accession === SCOPE.accession);
  if (selected.length !== 1) return manifestBlocked("SEC_TARGET_ACCESSION_NOT_FOUND");
  const row = selected[0]!;
  if (row.form !== SCOPE.form || row.filingDate !== SCOPE.filingDate || row.primaryDocument !== SCOPE.primaryDocument) return manifestBlocked("SEC_FILING_IDENTITY_MISMATCH");
  return Object.freeze({ status: "READY_FOR_INDEX" });
}

/** Parse only bodies held by an authentic server transport exchange; raw payload never leaves this server-only adapter. */
export function adaptSecEdgar8kTransportExchange(exchange: SecEdgar8kTransportExchange, retrievedAt: string): SecEdgar8kResponseAdapterResult {
  const responses = consumeSecEdgar8kExchangeBodiesForAdapter(exchange);
  if (!responses || responses.length < 2 || responses.length > 3) return fail("SEC_RESPONSE_EXCHANGE_UNAUTHENTIC");
  try {
  if (!utcMillis(retrievedAt)) return fail("SEC_RESPONSE_PLAN_INVALID");
  const expectedProfiles = responses.length === 2
    ? ["COMPANY_SUBMISSIONS_JSON", "FILING_INDEX"]
    : ["COMPANY_SUBMISSIONS_JSON", "SUBMISSIONS_HISTORY_JSON", "FILING_INDEX"];
  for (let i = 0; i < responses.length; i++) {
    const { plan, bytes } = responses[i]!;
    const observation = exchange.observations[i];
    const contentType = plan.profileId === "FILING_INDEX" ? "text/html" : "application/json";
    if (plan.profileId !== expectedProfiles[i] || observation?.profileId !== plan.profileId || observation.url !== plan.url || observation.contentType !== contentType || observation.statusCode !== 200 || observation.byteLength !== bytes.length || bytes.length > SCOPE.maxResponseBytes || plan.accession !== SCOPE.accession || plan.cik !== SCOPE.cik) return fail("SEC_RESPONSE_PLAN_INVALID");
  }
  const currentBytes = responses[0]!.bytes;
  const currentParse = parseJson(currentBytes);
  if (currentParse.status !== "VALID") return fail("SEC_RESPONSE_BODY_INVALID", Object.freeze({ stage: "JSON", reason: currentParse.status }));
  const currentJson = currentParse.value;
  if (parallelArraysUnequal(currentJson)) return fail("SEC_SUBMISSIONS_PARALLEL_ARRAYS_MISMATCH", Object.freeze({ stage: "SUBMISSIONS", reason: "PARALLEL_ARRAY_LENGTH_MISMATCH", field: "filings.recent" }));
  const current = submissions(currentJson);
  if (current.status === "INVALID") return fail("SEC_SUBMISSIONS_SCHEMA_INVALID", current.diagnostic);
  if (current.value.cik !== SCOPE.cik) return fail("SEC_SUBMISSIONS_CIK_MISMATCH");
  let match = current.value.rows.filter((row) => row.accession === SCOPE.accession);
  let usedHistory = false;
  if (responses.length === 3) {
    const historyName = responses[1]!.plan.url.split("/").at(-1);
    const matchingFiles = current.value.files.filter((file) => file.filingFrom <= SCOPE.filingDate && file.filingTo >= SCOPE.filingDate);
    if (matchingFiles.length > 1) return fail("SEC_HISTORY_FILE_AMBIGUOUS");
    if (matchingFiles.length !== 1 || matchingFiles[0]!.name !== historyName) return fail("SEC_HISTORY_FILE_NOT_REFERENCED");
    if (current.value.rows.some((row) => row.accession === SCOPE.accession)) return fail("SEC_FILING_EVIDENCE_INCOMPLETE");
    const historyParse = parseJson(responses[1]!.bytes);
    if (historyParse.status !== "VALID") return fail("SEC_RESPONSE_BODY_INVALID", Object.freeze({ stage: "JSON", reason: historyParse.status }));
    const historyJson = historyParse.value;
    if (parallelArraysUnequal(historyJson)) return fail("SEC_SUBMISSIONS_PARALLEL_ARRAYS_MISMATCH", Object.freeze({ stage: "HISTORY_SUBMISSIONS", reason: "PARALLEL_ARRAY_LENGTH_MISMATCH", field: "filings.recent" }));
    const history = submissions(historyJson, true);
    if (history.status === "INVALID") return fail("SEC_SUBMISSIONS_SCHEMA_INVALID", history.diagnostic);
    if (history.value.cik !== null && history.value.cik !== SCOPE.cik) return fail("SEC_SUBMISSIONS_CIK_MISMATCH");
    match = history.value.rows.filter((row) => row.accession === SCOPE.accession);
    usedHistory = true;
  } else if (match.length === 0) {
    const matchingFiles = current.value.files.filter((file) => file.filingFrom <= SCOPE.filingDate && file.filingTo >= SCOPE.filingDate);
    if (matchingFiles.length === 1) return Object.freeze({ status: "BLOCKED", code: "SEC_HISTORY_FILE_REQUIRED", historyRequest: Object.freeze({ filename: matchingFiles[0]!.name, url: `https://data.sec.gov/submissions/${matchingFiles[0]!.name}` }) });
    if (matchingFiles.length > 1) return fail("SEC_HISTORY_FILE_AMBIGUOUS");
    return fail("SEC_TARGET_ACCESSION_NOT_FOUND");
  }
  if (match.length !== 1) return fail("SEC_TARGET_ACCESSION_NOT_FOUND");
  const row = match[0]!;
  if (row.form !== SCOPE.form || row.filingDate !== SCOPE.filingDate || row.primaryDocument !== SCOPE.primaryDocument) return fail("SEC_FILING_IDENTITY_MISMATCH");
  const indexText = decode(responses.at(-1)!.bytes);
  if (indexText === null) return fail("SEC_RESPONSE_BODY_INVALID");
  const indexResult = parseIndex(indexText);
  if (indexResult.status !== "VALID") return fail(indexResult.code);
  const index = indexResult.index;
  if (index.cik !== SCOPE.cik || index.accession !== SCOPE.accession || index.form !== row.form || index.filingDate !== row.filingDate || index.primaryDocument !== row.primaryDocument) return fail("SEC_FILING_IDENTITY_MISMATCH");
  if (row.acceptanceDateTime && index.acceptanceDateTime && row.acceptanceDateTime !== index.acceptanceDateTime) return fail("SEC_FILING_IDENTITY_MISMATCH");
  const submissionsUrl = usedHistory ? `https://data.sec.gov/submissions/${responses[1]!.plan.url.split("/").at(-1)}` : `https://data.sec.gov/submissions/CIK${SCOPE.cik}.json`;
  const indexUrl = "https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/0001193125-23-255762-index.htm";
  const evidence = freezeDeep({
    contractVersion: "sec-edgar-8k-structured-filing-evidence/v1" as const,
    status: "RECONCILED_METADATA_ONLY" as const,
    authority: "NON_AUTHORITATIVE_SOURCE_METADATA" as const,
    identity: { cik: SCOPE.cik, accession: SCOPE.accession, form: SCOPE.form },
    filingDate: SCOPE.filingDate,
    acceptanceDateTime: row.acceptanceDateTime ?? index.acceptanceDateTime,
    eventDate: null,
    retrievedAt,
    primaryDocument: { filename: SCOPE.primaryDocument, url: `https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/${SCOPE.primaryDocument}`, contentRetrieved: false as const },
    evidence: {
      cik: { value: SCOPE.cik, sources: [`https://data.sec.gov/submissions/CIK${SCOPE.cik}.json#/cik`, `${indexUrl}#registrant-CIK-header`] },
      accession: { value: SCOPE.accession, sources: [`${submissionsUrl}#/${usedHistory ? "accessionNumber" : "filings.recent.accessionNumber"}`, `${indexUrl}#SEC-Accession-No`] },
      form: { value: SCOPE.form, sources: [`${submissionsUrl}#/${usedHistory ? "form" : "filings.recent.form"}`, `${indexUrl}#filing-heading`] },
      filingDate: { value: SCOPE.filingDate, sources: [`${submissionsUrl}#/${usedHistory ? "filingDate" : "filings.recent.filingDate"}`, `${indexUrl}#Filing-Date`] },
      primaryDocument: { value: SCOPE.primaryDocument, sources: [`${submissionsUrl}#/${usedHistory ? "primaryDocument" : "filings.recent.primaryDocument"}`, `${indexUrl}#Document-Format-Files-table`] },
      acceptanceDateTime: {
        value: row.acceptanceDateTime ?? index.acceptanceDateTime,
        sources: [
          ...(row.acceptanceDateTime ? [`${submissionsUrl}#/${usedHistory ? "acceptanceDateTime" : "filings.recent.acceptanceDateTime"}`] : []),
          ...(index.acceptanceDateTime ? [`${indexUrl}#Accepted`] : []),
        ],
      },
    },
  });
  return Object.freeze({ status: "VERIFIED", evidence });
  } finally {
    for (const response of responses) response.bytes.fill(0);
  }
}
