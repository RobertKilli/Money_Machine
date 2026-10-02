import "server-only";
import { createHash } from "node:crypto";

export const SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION_VERSION = "sec-event-document-byte-storage-decision/v1" as const;
export const SEC_EVENT_DOCUMENT_BYTE_STORAGE_PRODUCTION_STATUS = "BLOCKED_BACKEND_UNAPPROVED" as const;
export type ByteStorageOption = "A_POSTGRES_BYTEA" | "B_SUPABASE_PRIVATE_STORAGE" | "C_EXTERNAL_OBJECT_STORAGE" | "D_FINGERPRINT_OR_URL";
export type ByteStorageDecision = Readonly<{
  contractVersion: typeof SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION_VERSION;
  status: "VALID";
  selectedOption: "A_POSTGRES_BYTEA";
  rejectedOptions: readonly Readonly<{ option: Exclude<ByteStorageOption, "A_POSTGRES_BYTEA">; reason: string }>[];
  byteContract: Readonly<{version:string;backendKind:string;blobId:string;sha256:string;byteLength:number;contentType:string;contentEncodingPolicy:string;sourceProvider:string;sourceProfile:string;filingPackageId:string;documentLocator:string;documentRole:string;storedAt:string;receipt:string;readbackVerificationStatus:string;retentionClassification:string;deletionStatus:string;legalHoldStatus:string}>;
  limits: Readonly<{maxDocumentBytes:number;maxPackageBytes:number;maxDocumentsPerPackage:number;streaming:string;timeoutMs:number;readback:string;basis:string}>;
  protocol: Readonly<{states:readonly string[];steps:readonly string[];crashRecovery:readonly string[];security:readonly string[];retention:readonly string[]}>;
  approvals: Readonly<{productionStatus:typeof SEC_EVENT_DOCUMENT_BYTE_STORAGE_PRODUCTION_STATUS;liveAcquisition:"NOT_APPROVED";rawByteStorage:"NOT_APPROVED";normalizedStorage:"NOT_APPROVED";authorityPersistence:"NOT_APPROVED";retention:"NOT_APPROVED";redistribution:"NOT_APPROVED";commercialUse:"NOT_APPROVED"}>;
  evidenceReferences: readonly Readonly<{title:string;url:string;checkedAt:string}>[];
  reviewedAt:string;recordedAt:string;fingerprint:string;
}>;
const HASH = /^[a-f0-9]{64}$/;
const trusted = new WeakSet<object>();
const INVALID = Object.freeze({status:"INVALID", blocker:"SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION_INVALID"} as const);
const material = {
  contractVersion: SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION_VERSION,
  status:"VALID", selectedOption:"A_POSTGRES_BYTEA",
  rejectedOptions:[
    {option:"B_SUPABASE_PRIVATE_STORAGE",reason:"Separate object and database services cannot commit atomically; Storage API objects are outside database backups, S3 versioning and Object Lock are unsupported, service-role bypasses RLS."},
    {option:"C_EXTERNAL_OBJECT_STORAGE",reason:"Adds provider credentials, lock-in, versioning/retention configuration and cross-service recovery operations without improving first-version atomicity."},
    {option:"D_FINGERPRINT_OR_URL",reason:"A digest or locator cannot reconstruct or authoritatively reread entity-body octets."},
  ],
  byteContract:{version:"sec-document-byte-storage/v1",backendKind:"POSTGRES_BYTEA",blobId:"sha256:<lowercase-64-hex>",sha256:"lowercase SHA-256 of exact HTTP entity-body octets",byteLength:0,contentType:"validated response media type; metadata only",contentEncodingPolicy:"request identity-encoded; reject unexpected content encoding; hash bytes delivered as entity body before text decoding/extraction",sourceProvider:"sec-edgar",sourceProfile:"profile ID plus immutable profile fingerprint",filingPackageId:"filing package identity",documentLocator:"canonical SEC archive-relative path; no URL or traversal",documentRole:"index | primary | exhibit",storedAt:"separate receipt metadata; excluded from identity",receipt:"attempt/response receipt; excluded from identity",readbackVerificationStatus:"VERIFIED before authority; reread failure is fail-closed",retentionClassification:"UNAPPROVED_PENDING_TERMS_REVIEW",deletionStatus:"NOT_AUTHORIZED",legalHoldStatus:"NONE_RECORDED"},
  limits:{maxDocumentBytes:8388608,maxPackageBytes:67108864,maxDocumentsPerPackage:32,streaming:"bounded streaming into transaction-owned buffer; reject over-limit before persistence; no chunk/large-object streaming in v1",timeoutMs:15000,readback:"same transaction reread; exact length and lowercase SHA-256 recomputation before commit",basis:"Local safety/transaction and memory budgets, not PostgreSQL/provider limits; 8 MiB accommodates an SEC filing exhibit while bounding buffering; 64 MiB and 32 documents bound package transaction; assess fixture distributions before production."},
  protocol:{states:["RECEIVED","BYTES_VERIFIED","AUTHORITY_COMMITTED","REJECTED"],steps:["Receive bounded entity-body octets; reject invalid profile, locator, media type, encoding, timeout, document/package limits.","Stream-hash exact octets and count bytes; compute document ID sha256:<digest>; compare any declared manifest digest/length.","Begin one PostgreSQL transaction; insert immutable artifact manifest and bytea only if absent; unique key arbitrates concurrency. Never use ON CONFLICT DO UPDATE/upsert; overwrite and delete are prohibited.","Reread bytea and manifest using the same transaction connection; compare exact byte length and recomputed SHA-256; only then commit authority and package membership atomically."],crashRecovery:["Before transaction: no persistent state.","Transaction failure/crash before commit: database rolls back both bytes and manifest; retry identical key/digest is safe.","Committed row missing or mismatch on later read: fail closed, emit sanitized integrity incident, never return authority; restore from verified database backup or append a reviewed correction, never silently mutate.","Identical replay with same identity, digest, length and metadata returns existing verified row; any same artifact/package key with different bytes or material binding is conflict/rejection.","No cross-service orphan class exists. Unreferenced staged bytes cannot become authority; reconciliation finds rows by immutable manifest references and verifies bytes, without promoting unverified content."],security:["Server-only adapter; resolve credentials at final use boundary; no secret in IDs, logs or returned errors.","No public bucket/URL or signed URL authority; clients have no insert/update/delete rights; deny by default and enforce RLS where Supabase PostgreSQL is used.","Narrow server database role only; service-role is never a general mutation bypass. Grant only dedicated command path; constraints/triggers enforce insert-only immutable records; no generic repository mutation API.","Canonical SEC archive-relative locator, reject dot segments, separators/encoded traversal and non-canonical path; bounded body/time; sanitized failures; never trust content-type without checking bytes."],retention:["No deletion until explicit retention approval and policy; deletion is a separately authorized audited operation and legal hold blocks it.","Reversal/correction records preserve history; retention expiry does not itself authorize deletion.","Backups/restores include bytea and manifest in the same PostgreSQL recovery unit; validate digest after restore."]},
  approvals:{productionStatus:SEC_EVENT_DOCUMENT_BYTE_STORAGE_PRODUCTION_STATUS,liveAcquisition:"NOT_APPROVED",rawByteStorage:"NOT_APPROVED",normalizedStorage:"NOT_APPROVED",authorityPersistence:"NOT_APPROVED",retention:"NOT_APPROVED",redistribution:"NOT_APPROVED",commercialUse:"NOT_APPROVED"},
  evidenceReferences:[] as {title:string;url:string;checkedAt:string}[],
  reviewedAt:"2026-10-02T07:23:52.000Z",recordedAt:"2026-10-02T07:23:52.000Z",
};
const evidence = [
 ["Supabase changelog: Storage security overhaul","https://supabase.com/changelog/43465-developer-update-march-2026"],
 ["Supabase Storage architecture","https://supabase.com/docs/guides/storage/schema/design"],
 ["Supabase private buckets","https://supabase.com/docs/guides/storage/buckets/fundamentals"],
 ["Supabase Storage access control and service keys","https://supabase.com/docs/guides/storage/security/access-control"],
 ["Supabase standard upload and upsert semantics","https://supabase.com/docs/guides/storage/uploads/standard-uploads"],
 ["Supabase download and metadata","https://supabase.com/docs/guides/storage/management/download-objects"],
 ["Supabase S3 compatibility, versioning and Object Lock","https://supabase.com/docs/guides/storage/s3/compatibility"],
 ["Supabase file limits","https://supabase.com/docs/guides/storage/uploads/file-limits"],
 ["Supabase Storage pricing","https://supabase.com/docs/guides/storage/pricing"],
 ["Supabase egress pricing","https://supabase.com/docs/guides/platform/manage-your-usage/egress"],
 ["Supabase database backups","https://supabase.com/docs/guides/platform/backups"],
 ["Supabase local development and Storage","https://supabase.com/docs/guides/local-development"],
 ["PostgreSQL 18 bytea","https://www.postgresql.org/docs/current/datatype-binary.html"],
 ["PostgreSQL 18 TOAST","https://www.postgresql.org/docs/current/storage-toast.html"],
 ["PostgreSQL 18 limits","https://www.postgresql.org/docs/current/limits.html"],
 ["PostgreSQL 18 transactions","https://www.postgresql.org/docs/current/tutorial-transactions.html"],
 ["PostgreSQL 18 backup and restore","https://www.postgresql.org/docs/current/backup.html"],
 ["PostgreSQL 18 large objects","https://www.postgresql.org/docs/current/largeobjects.html"],
] as const;
for (const [title,url] of evidence) material.evidenceReferences.push({title,url,checkedAt:"2026-10-02T07:23:52.000Z"});
material.evidenceReferences.sort((a,b)=>a.url.localeCompare(b.url));
const freeze = <T>(v:T):T => { if(v && typeof v === "object" && !Object.isFrozen(v)){ for(const x of Object.values(v as Record<string,unknown>)) freeze(x); Object.freeze(v); } return v; };
const canonical = (v:unknown):string => Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().filter(k=>k!=="recordedAt"&&k!=="fingerprint").map(k=>`${JSON.stringify(k)}:${canonical((v as Record<string,unknown>)[k])}`).join(",")}}` : JSON.stringify(v);
export const fingerprintSecEventByteStorageDecision = (v:unknown):string => createHash("sha256").update(canonical(v)).digest("hex");
const exactShape = (v:unknown, template:unknown):boolean => {
  if(Array.isArray(template)) { if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length!==template.length||Reflect.ownKeys(v).length!==v.length+1) return false; for(let i=0;i<v.length;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!("value" in d)||d.get||d.set||!exactShape(d.value,template[i]))return false;} return true; }
  if(template && typeof template==="object") { if(!v || typeof v!=="object" || Object.getPrototypeOf(v)!==Object.prototype) return false; const tk=Object.keys(template); if(Reflect.ownKeys(v).length!==tk.length || Object.keys(v).length!==tk.length) return false; return tk.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return !!d&&"value" in d&&!d.get&&!d.set&&exactShape(d.value,(template as Record<string,unknown>)[k]);}); }
  return typeof v===typeof template;
};
const template = {...material,fingerprint:""};
export type ByteStorageDecisionParse = Readonly<{status:"VALID";decision:ByteStorageDecision}> | typeof INVALID;
export function parseSecEventDocumentByteStorageDecision(input:unknown):ByteStorageDecisionParse {
 try {
  if(!exactShape(input,template)) return INVALID;
  const x=input as Record<string,unknown>;
  const candidateMaterial=structuredClone(x) as Record<string,unknown>;
  delete candidateMaterial.fingerprint; delete candidateMaterial.recordedAt;
  if(canonical(candidateMaterial)!==canonical(material)) return INVALID;
  if(x.contractVersion!==SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION_VERSION || x.selectedOption!=="A_POSTGRES_BYTEA" || x.status!=="VALID" || x.fingerprint!==fingerprintSecEventByteStorageDecision(x) || !HASH.test(String(x.fingerprint))) return INVALID;
  if(!/^[0-9]{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(String(x.recordedAt)) || !Number.isFinite(Date.parse(String(x.recordedAt))) || new Date(String(x.recordedAt)).toISOString()!==x.recordedAt) return INVALID;
  const d=freeze(structuredClone(x)) as unknown as ByteStorageDecision; trusted.add(d as object); return freeze({status:"VALID" as const,decision:d});
 } catch { return INVALID; }
}
export const isTrustedSecEventDocumentByteStorageDecision=(v:unknown):v is ByteStorageDecision=>!!v&&typeof v==="object"&&trusted.has(v as object);
export const SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION = (()=>{const x={...material,fingerprint:""};x.fingerprint=fingerprintSecEventByteStorageDecision(x);return parseSecEventDocumentByteStorageDecision(x);})();
export const sha256EntityBodyOctets=(bytes:Uint8Array):string=>createHash("sha256").update(bytes).digest("hex");
export const secDocumentBlobId=(bytes:Uint8Array):string=>`sha256:${sha256EntityBodyOctets(bytes)}`;
export function verifySecDocumentReplay(existing:{sha256:string;byteLength:number},incoming:Uint8Array):"IDENTICAL_REPLAY"|"CONTENT_CONFLICT" { return existing.sha256===sha256EntityBodyOctets(incoming)&&existing.byteLength===incoming.byteLength?"IDENTICAL_REPLAY":"CONTENT_CONFLICT"; }
