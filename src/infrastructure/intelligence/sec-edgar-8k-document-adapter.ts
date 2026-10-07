import "server-only";

import { TextDecoder, types as utilTypes } from "node:util";
import { SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE } from "@/domain/intelligence/sec-edgar-8k-local-smoke-scope";
import type { SecEdgar8kFilingEvidence } from "./sec-edgar-8k-response-adapter";

export const SEC_EDGAR_8K_DOCUMENT_ADAPTER_VERSION = "sec-edgar-8k-document-observations/v1" as const;
export const SEC_EDGAR_8K_DOCUMENT_MAX_BYTES = 2 * 1024 * 1024;
const MAX_META_TAGS = 64;
const MAX_META_TAG_CHARS = 2_048;
const MAX_FIELD_VALUE_CHARS = 512;
const MAX_TITLE_CHARS = 512;

export type SecEdgar8kDocumentInput = Readonly<{
  filename: string;
  sourceUrl: string;
  contentType: string;
  bytes: Buffer;
}>;

export type SecEdgar8kDocumentObservation = Readonly<{
  field: string;
  value: string;
  source: string;
  classification: "RECOGNIZED_DOCUMENT_METADATA" | "UNRECOGNIZED_DOCUMENT_METADATA";
}>;

export type SecEdgar8kDocumentObservationResult =
  | Readonly<{ status: "BLOCKED"; code: "DOCUMENT_IDENTITY_MISMATCH" | "DOCUMENT_INPUT_INVALID" | "DOCUMENT_CONTENT_TYPE_INVALID" | "DOCUMENT_BYTES_INVALID" | "DOCUMENT_BYTES_TOO_LARGE" | "DOCUMENT_UTF8_INVALID" | "DOCUMENT_PARSE_LIMIT_EXCEEDED" | "DOCUMENT_HTML_INVALID" }>
  | Readonly<{
      status: "OBSERVED_METADATA_ONLY";
      contractVersion: typeof SEC_EDGAR_8K_DOCUMENT_ADAPTER_VERSION;
      authority: "NON_AUTHORITATIVE_DOCUMENT_OBSERVATIONS";
      identity: Readonly<{ cik: "0000789019"; accession: "0001193125-23-255762"; form: "8-K"; filingDate: "2023-10-13" }>;
      eventDate: null;
      source: Readonly<{ kind: "CALLER_SUPPLIED_BYTES_UNVERIFIED"; filename: "d537928d8k.htm"; url: string; contentType: "text/html"; byteLength: number }>;
      title: Readonly<{ value: string | null; source: string | null }>;
      observations: readonly SecEdgar8kDocumentObservation[];
      unknownFields: readonly SecEdgar8kDocumentObservation[];
      identitySources: readonly string[];
    }>;

const blocked = (code: Extract<SecEdgar8kDocumentObservationResult, { status: "BLOCKED" }>['code']): SecEdgar8kDocumentObservationResult => Object.freeze({ status: "BLOCKED", code });
const expectedUrl = `https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/${SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.primaryDocument}`;
const expectedIndexPrefix = "https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/0001193125-23-255762-index.htm#";
const expectedSubmissionsPrefix = "https://data.sec.gov/submissions/CIK0000789019.json#";
const HISTORICAL_SUBMISSIONS_SOURCE = /^https:\/\/data\.sec\.gov\/submissions\/CIK0000789019-submissions-\d+\.json#[A-Za-z0-9_./~-]+$/;
const RECOGNIZED_META_FIELDS = new Set(["description", "dc.title", "dc.subject", "keywords", "date", "dcterms.date", "og:title"]);
const UTC_MILLIS = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

function validSourceList(value: unknown, allowEmpty = false): value is readonly string[] {
  try {
    if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < (allowEmpty ? 0 : 1) || value.length > 4 || Reflect.ownKeys(value).length !== value.length + 1) return false;
    return value.every((source) => typeof source === "string" && source.length <= 512 && (source.startsWith(expectedSubmissionsPrefix) || HISTORICAL_SUBMISSIONS_SOURCE.test(source) || source.startsWith(expectedIndexPrefix)) && !/[\u0000-\u0020\u007f]/u.test(source));
  } catch { return false; }
}

function evidenceFieldMatches(value: unknown, expected: string): boolean {
  return exactDataObject(value, ["value", "sources"]) && value.value === expected && validSourceList(value.sources);
}

function exactDataObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  try {
    if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const ownKeys = Reflect.ownKeys(value);
    return ownKeys.length === keys.length && ownKeys.every((key) => typeof key === "string" && keys.includes(key) && (() => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !!descriptor && "value" in descriptor && !descriptor.get && !descriptor.set;
    })());
  } catch { return false; }
}

function evidenceHasFixedIdentity(evidence: unknown): evidence is SecEdgar8kFilingEvidence {
  try {
    if (!evidence || typeof evidence !== "object" || Object.getPrototypeOf(evidence) !== Object.prototype || !exactDataObject(evidence, ["contractVersion", "status", "authority", "identity", "filingDate", "acceptanceDateTime", "eventDate", "retrievedAt", "primaryDocument", "evidence"])) return false;
    const value = evidence as SecEdgar8kFilingEvidence;
    if (value.contractVersion !== "sec-edgar-8k-structured-filing-evidence/v1" || value.status !== "RECONCILED_METADATA_ONLY" || value.authority !== "NON_AUTHORITATIVE_SOURCE_METADATA" || value.filingDate !== SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.filingDate || value.eventDate !== null || typeof value.retrievedAt !== "string" || !UTC_MILLIS.test(value.retrievedAt) || !Number.isFinite(Date.parse(value.retrievedAt)) || new Date(value.retrievedAt).toISOString() !== value.retrievedAt) return false;
    if (!exactDataObject(value.identity, ["cik", "accession", "form"]) || value.identity.cik !== SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.cik || value.identity.accession !== SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.accession || value.identity.form !== SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.form) return false;
    if (!exactDataObject(value.primaryDocument, ["filename", "url", "contentRetrieved"]) || value.primaryDocument.filename !== SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.primaryDocument || value.primaryDocument.url !== expectedUrl || value.primaryDocument.contentRetrieved !== false) return false;
    if (!exactDataObject(value.evidence, ["cik", "accession", "form", "filingDate", "primaryDocument", "acceptanceDateTime"])) return false;
    const acceptedDate = value.acceptanceDateTime;
    if (acceptedDate !== null && (typeof acceptedDate !== "string" || !UTC_MILLIS.test(acceptedDate) || !Number.isFinite(Date.parse(acceptedDate)) || new Date(acceptedDate).toISOString() !== acceptedDate)) return false;
    if (!exactDataObject(value.evidence.acceptanceDateTime, ["value", "sources"]) || value.evidence.acceptanceDateTime.value !== acceptedDate) return false;
    if (!validSourceList(value.evidence.acceptanceDateTime.sources, acceptedDate === null)) return false;
    return evidenceFieldMatches(value.evidence.cik, SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.cik) &&
      evidenceFieldMatches(value.evidence.accession, SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.accession) &&
      evidenceFieldMatches(value.evidence.form, SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.form) &&
      evidenceFieldMatches(value.evidence.filingDate, SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.filingDate) &&
      evidenceFieldMatches(value.evidence.primaryDocument, SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.primaryDocument);
  } catch { return false; }
}

function decodeHtmlAttribute(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#\d+;|&#x[\da-f]+;/gi, (entity) => {
    const named: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " };
    if (entity in named) return named[entity]!;
    const code = entity.startsWith("&#x") || entity.startsWith("&#X") ? Number.parseInt(entity.slice(3, -1), 16) : Number.parseInt(entity.slice(2, -1), 10);
    return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

function tagEnd(html: string, start: number): number {
  let quote = "";
  for (let index = start + 1; index < html.length; index++) {
    const character = html[index]!;
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === "\"" || character === "'") quote = character;
    else if (character === ">") return index;
  }
  return -1;
}

function maskNonMetadataRegions(html: string): Readonly<{ html: string; title: string | null }> | null {
  const rawTextElements = new Set(["script", "style", "title", "textarea", "xmp", "iframe", "noembed", "noframes", "noscript"]);
  let masked = "";
  let copiedThrough = 0;
  let title: string | null = null;
  let index = 0;
  while (index < html.length) {
    if (html.startsWith("<!--", index)) {
      const close = html.indexOf("-->", index + 4);
      if (close < 0) return null;
      masked += html.slice(copiedThrough, index) + " ".repeat(close + 3 - index);
      copiedThrough = close + 3;
      index = close + 3;
      continue;
    }
    if (html[index] !== "<" || !/[A-Za-z]/.test(html[index + 1] ?? "")) { index++; continue; }
    const end = tagEnd(html, index);
    if (end < 0) return null;
    const openTag = html.slice(index, end + 1);
    const rawName = openTag.match(/^<([A-Za-z][A-Za-z0-9:-]*)\b/)?.[1]?.toLowerCase();
    const closing = /^<\//.test(openTag);
    const selfClosing = /\/\s*>$/.test(openTag);
    if (rawName && !closing && !selfClosing && rawTextElements.has(rawName)) {
      const closeTag = new RegExp(`<\\/${rawName}\\s*>`, "ig");
      closeTag.lastIndex = end + 1;
      const close = closeTag.exec(html);
      if (!close) return null;
      const limit = close.index + close[0].length;
      masked += html.slice(copiedThrough, index) + " ".repeat(limit - index);
      copiedThrough = limit;
      if (rawName === "title") {
        if (title !== null) return null;
        title = html.slice(end + 1, close.index);
      }
      index = limit;
      continue;
    }
    index = end + 1;
  }
  masked += html.slice(copiedThrough);
  return Object.freeze({ html: masked, title });
}

function collectMetaTags(html: string): string[] | "LIMIT" | null {
  const starts = /<meta\b/gi;
  const tags: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = starts.exec(html)) !== null) {
    const start = match.index;
    let quote = "";
    let end = -1;
    for (let index = starts.lastIndex; index < html.length; index++) {
      const character = html[index]!;
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === "\"" || character === "'") quote = character;
      else if (character === ">") { end = index; break; }
      if (index - start + 1 > MAX_META_TAG_CHARS) return "LIMIT";
    }
    if (end < 0) return null;
    const tag = html.slice(start, end + 1);
    tags.push(tag);
    if (tags.length > MAX_META_TAGS) return "LIMIT";
    starts.lastIndex = end + 1;
  }
  return tags;
}

function parseMetaAttributes(tag: string): Map<string, string | true> | null {
  const attributes = new Map<string, string | true>();
  let index = tag.search(/\s/);
  if (index < 0) return attributes;
  const limit = tag.length - 1;
  while (index < limit) {
    while (index < limit && /[\s/]/.test(tag[index]!)) index++;
    if (index >= limit) break;
    const nameMatch = tag.slice(index, limit).match(/^[^\s=/>]+/);
    if (!nameMatch) return null;
    const name = nameMatch[0].toLowerCase();
    if (attributes.has(name)) return null;
    index += nameMatch[0].length;
    while (index < limit && /\s/.test(tag[index]!)) index++;
    if (tag[index] !== "=") { attributes.set(name, true); continue; }
    index++;
    while (index < limit && /\s/.test(tag[index]!)) index++;
    const quote = tag[index] === "\"" || tag[index] === "'" ? tag[index]! : "";
    if (quote) {
      index++;
      const valueStart = index;
      while (index < limit && tag[index] !== quote) index++;
      if (index >= limit) return null;
      attributes.set(name, tag.slice(valueStart, index));
      index++;
    } else {
      const valueStart = index;
      while (index < limit && !/\s/.test(tag[index]!)) index++;
      if (valueStart === index) return null;
      attributes.set(name, tag.slice(valueStart, index));
    }
  }
  return attributes;
}

/**
 * Extracts only bounded document-level HTML metadata. Bytes are supplied by the
 * caller (normally a synthetic fixture); this adapter performs no network I/O.
 * Unknown meta names are retained as observations rather than interpreted.
 */
export function adaptSecEdgar8kDocumentObservations(evidence: unknown, input: unknown): SecEdgar8kDocumentObservationResult {
  if (!evidenceHasFixedIdentity(evidence)) return blocked("DOCUMENT_IDENTITY_MISMATCH");
  if (!exactDataObject(input, ["filename", "sourceUrl", "contentType", "bytes"])) return blocked("DOCUMENT_INPUT_INVALID");
  const document = input as SecEdgar8kDocumentInput;
  if (document.filename !== SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.primaryDocument || document.sourceUrl !== expectedUrl) return blocked("DOCUMENT_IDENTITY_MISMATCH");
  if (document.contentType !== "text/html" && document.contentType !== "text/html; charset=utf-8") return blocked("DOCUMENT_CONTENT_TYPE_INVALID");
  if (!Buffer.isBuffer(document.bytes) || utilTypes.isProxy(document.bytes) || document.bytes.byteLength === 0) return blocked("DOCUMENT_BYTES_INVALID");
  if (document.bytes.byteLength > SEC_EDGAR_8K_DOCUMENT_MAX_BYTES) return blocked("DOCUMENT_BYTES_TOO_LARGE");

  let ownedBytes: Buffer;
  try { ownedBytes = Buffer.from(document.bytes); } catch { return blocked("DOCUMENT_BYTES_INVALID"); }
  try {
    let html: string;
    try { html = new TextDecoder("utf-8", { fatal: true }).decode(ownedBytes); } catch { return blocked("DOCUMENT_UTF8_INVALID"); }
    const parsedRegions = maskNonMetadataRegions(html);
    if (parsedRegions === null || !/<html\b[^>]*>/i.test(parsedRegions.html) || !/<\/html\s*>/i.test(parsedRegions.html)) return blocked("DOCUMENT_HTML_INVALID");

    const observations: SecEdgar8kDocumentObservation[] = [];
    const metaTags = collectMetaTags(parsedRegions.html);
    if (metaTags === null) return blocked("DOCUMENT_HTML_INVALID");
    if (metaTags === "LIMIT") return blocked("DOCUMENT_PARSE_LIMIT_EXCEEDED");
    for (let index = 0; index < metaTags.length; index++) {
      const attributes = parseMetaAttributes(metaTags[index]!);
      if (!attributes) return blocked("DOCUMENT_HTML_INVALID");
      const fieldNames = ["name", "property", "http-equiv"].filter((key) => attributes.has(key));
      if (fieldNames.length > 1) return blocked("DOCUMENT_HTML_INVALID");
      const rawName = fieldNames.length === 1 ? attributes.get(fieldNames[0]!) : undefined;
      const rawContent = attributes.get("content");
      if (typeof rawName !== "string" || typeof rawContent !== "string") continue;
      const name = rawName.trim();
      const content = rawContent;
      const field = decodeHtmlAttribute(name).toLowerCase();
      const value = decodeHtmlAttribute(content);
      if (!field || field.length > 128 || value.length > MAX_FIELD_VALUE_CHARS || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return blocked("DOCUMENT_PARSE_LIMIT_EXCEEDED");
      observations.push(Object.freeze({
        field,
        value,
        source: `${expectedUrl}#meta[${index}](${field})`,
        classification: RECOGNIZED_META_FIELDS.has(field) ? "RECOGNIZED_DOCUMENT_METADATA" : "UNRECOGNIZED_DOCUMENT_METADATA",
      }));
    }

    const rawTitle = parsedRegions.title;
    if (rawTitle && rawTitle.length > MAX_TITLE_CHARS * 4) return blocked("DOCUMENT_PARSE_LIMIT_EXCEEDED");
    const title = rawTitle === null ? null : decodeHtmlAttribute(rawTitle.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
    if (title !== null && (title.length > MAX_TITLE_CHARS || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(title))) return blocked("DOCUMENT_PARSE_LIMIT_EXCEEDED");
    const documentSource = `${expectedUrl}#title`;
    const unknownFields = observations.filter((observation) => observation.classification === "UNRECOGNIZED_DOCUMENT_METADATA");
    return Object.freeze({
      status: "OBSERVED_METADATA_ONLY",
      contractVersion: SEC_EDGAR_8K_DOCUMENT_ADAPTER_VERSION,
      authority: "NON_AUTHORITATIVE_DOCUMENT_OBSERVATIONS",
      identity: Object.freeze({ cik: evidence.identity.cik, accession: evidence.identity.accession, form: evidence.identity.form, filingDate: evidence.filingDate }),
      eventDate: null,
      source: Object.freeze({ kind: "CALLER_SUPPLIED_BYTES_UNVERIFIED", filename: document.filename, url: expectedUrl, contentType: "text/html", byteLength: ownedBytes.byteLength }),
      title: Object.freeze({ value: title, source: title === null ? null : documentSource }),
      observations: Object.freeze(observations),
      unknownFields: Object.freeze(unknownFields),
      identitySources: Object.freeze([
        ...evidence.evidence.cik.sources,
        ...evidence.evidence.accession.sources,
        ...evidence.evidence.form.sources,
        ...evidence.evidence.filingDate.sources,
        ...evidence.evidence.primaryDocument.sources,
      ]),
    });
  } finally {
    ownedBytes.fill(0);
  }
}
