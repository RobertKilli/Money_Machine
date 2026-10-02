import "server-only";
import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

export const SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION_VERSION = "sec-event-document-byte-storage-decision/v1" as const;
export const SEC_EVENT_DOCUMENT_BYTE_STORAGE_PRODUCTION_STATUS = "BLOCKED_BACKEND_UNAPPROVED" as const;
export type ByteStorageOption = "A_POSTGRES_BYTEA" | "B_SUPABASE_PRIVATE_STORAGE" | "C_EXTERNAL_OBJECT_STORAGE" | "D_FINGERPRINT_OR_URL";
export type ByteStorageDecision = Readonly<{
  contractVersion: typeof SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION_VERSION;
  status: "VALID";
  selectedOption: "A_POSTGRES_BYTEA";
  rejectedOptions: readonly Readonly<{ option: Exclude<ByteStorageOption, "A_POSTGRES_BYTEA">; reason: string }>[];
  byteContract: Readonly<{version:string;backendKind:string;blobId:string;sha256:string;byteLength:number;contentType:string;contentEncodingPolicy:string;logicalReadbackPolicy:string;sourceProvider:string;sourceProfile:string;filingPackageId:string;documentLocator:string;documentRole:string;storedAt:string;receipt:string;readbackVerificationStatus:string;retentionClassification:string;deletionStatus:string;legalHoldStatus:string}>;
  limits: Readonly<{maxDocumentBytes:number;maxPackageBytes:number;maxDocumentsPerPackage:number;streaming:string;timeoutMs:number;maxPackageAcquisitionMs:number;maxTransactionMs:number;readback:string;basis:string}>;
  physicalModel: Readonly<{contentBlob:string;documentArtifact:string;filingPackage:string;packageMembers:string;acquisitionReceipts:string;eventLineage:string;deduplication:string}>;
  protocol: Readonly<{states:readonly string[];steps:readonly string[];concurrency:readonly string[];crashRecovery:readonly string[];security:readonly string[];retention:readonly string[]}>;
  approvals: Readonly<{productionStatus:typeof SEC_EVENT_DOCUMENT_BYTE_STORAGE_PRODUCTION_STATUS;liveAcquisition:"NOT_APPROVED";rawByteStorage:"NOT_APPROVED";normalizedStorage:"NOT_APPROVED";authorityPersistence:"NOT_APPROVED";retention:"NOT_APPROVED";deletion:"NOT_APPROVED";redistribution:"NOT_APPROVED";commercialUse:"NOT_APPROVED"}>;
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
    {option:"B_SUPABASE_PRIVATE_STORAGE",reason:"Separate object and database services cannot commit atomically; Storage API object bytes are outside database backups; the published Supabase S3 compatibility matrix lists S3 Versioning and the listed Object Lock operations as unsupported; service-role bypasses RLS."},
    {option:"C_EXTERNAL_OBJECT_STORAGE",reason:"Adds provider credentials, lock-in, versioning/retention configuration and cross-service recovery operations without improving first-version atomicity."},
    {option:"D_FINGERPRINT_OR_URL",reason:"A digest or locator cannot reconstruct or authoritatively reread entity-body octets."},
  ],
  byteContract:{version:"sec-document-byte-storage/v1",backendKind:"POSTGRES_BYTEA",blobId:"sha256:<lowercase-64-hex>:<byte-length>",sha256:"lowercase SHA-256 of exact HTTP entity-body octets",byteLength:0,contentType:"validated response media type; metadata only",contentEncodingPolicy:"request Accept-Encoding: identity; reject unexpected Content-Encoding; hash HTTP entity-body octets after transfer framing and before any decoding, decompression, extraction or normalization",logicalReadbackPolicy:"application hashes incoming raw bytes and rehashes SELECT-returned logical bytea; PostgreSQL does not compute SHA-256; no pgcrypto dependency; TOAST physical compression/chunking is transparent and does not change the logical bytea sequence",sourceProvider:"sec-edgar",sourceProfile:"profile ID plus immutable profile fingerprint",filingPackageId:"filing package identity; package relation is separate from document identity",documentLocator:"canonical SEC archive-relative path; no URL or traversal",documentRole:"index | primary | exhibit",storedAt:"separate receipt metadata; excluded from identity",receipt:"attempt/response receipt; excluded from identity",readbackVerificationStatus:"VERIFIED before authority; reread failure is fail-closed",retentionClassification:"UNAPPROVED_PENDING_TERMS_REVIEW",deletionStatus:"NOT_AUTHORIZED",legalHoldStatus:"NONE_RECORDED"},
  limits:{maxDocumentBytes:8388608,maxPackageBytes:67108864,maxDocumentsPerPackage:32,streaming:"network body is incrementally counted/hashed in 64 KiB chunks, then held as one bounded Buffer; package is acquired sequentially; no PostgreSQL stream API is selected and no chunk/large-object storage in v1",timeoutMs:15000,maxPackageAcquisitionMs:480000,maxTransactionMs:120000,readback:"SELECT and verify one blob/document at a time; never SELECT the package's bytea values as one aggregate",basis:"Local safety/transaction and memory caps, not PostgreSQL or SEC limits; 8-minute package acquisition ceiling is 32 sequential 15-second document ceilings; 2-minute transaction ceiling bounds lock/WAL lifetime and must be demonstrated by local load tests before implementation. Maximum package 64 MiB plus one 8 MiB driver parameter and one 8 MiB readback, with 16 MiB headroom gives a 96 MiB per active package worker envelope; process one document query at a time and validate actual driver copies before implementation."},
  physicalModel:{contentBlob:"Immutable sec_event_content_blobs keyed by (lowercase sha256, byte_length), with an additional UNIQUE(sha256) guard so a digest reported with another length fails closed. One bytea value per unique content; a content insert is provisional until reread and verified.",documentArtifact:"Separate immutable sec_event_document_artifacts authority binds content blob key to source profile/fingerprint, filing identity, canonical SEC locator, document role, media type and document artifact fingerprint. Same blob at another locator/role has another artifact authority.",filingPackage:"Immutable sec_event_filing_packages authority for filing/package revision metadata and package fingerprint.",packageMembers:"Ordered sec_event_package_document_members bind one package to exact document artifact authorities; package membership does not redefine blob or artifact identity.",acquisitionReceipts:"Separate append-only request/attempt/receipt and availability records; receipt time is not blob or document identity.",eventLineage:"Separate sealed event-source lineage and members bind selected package/artifact/receipt authorities; event lineage and event authority remain separate and blocked.",deduplication:"Deduplicate bytes by (sha256, byte_length), compare exact reread bytes on conflict; do not duplicate bytea per locator. UNIQUE(sha256) rejects a digest with inconsistent length. A same-digest/same-length byte mismatch is a collision and fails closed. Never use blob identity as document identity."},
  protocol:{states:["RECEIVED","BLOB_STAGED","BLOB_VERIFIED","AUTHORITIES_STAGED","AUTHORITY_COMMITTED","REJECTED"],steps:["Acquire package documents sequentially outside the database transaction. Incrementally count/hash each 64 KiB body chunk, cap document and running package totals using actual byte lengths, retain only one Buffer per document, and cancel/reject on timeout, abort or overflow.","Begin one PostgreSQL transaction. Insert or locate each blob by (sha256, byte_length); reread and verify one logical bytea value at a time, comparing exact length and application SHA-256 before releasing that query result.","Insert immutable document artifacts, filing package and ordered members; then reread the full authority graph and each referenced blob one at a time. Commit only after exact digest, length, profile/scope, artifact IDs and member set match. Acquisition receipts and event lineage are separate approval boundaries and are not written by this v1 byte/package transaction.","Hashing is application-side twice: incrementally on acquired raw entity-body octets and again on each SELECT-returned logical bytea. PostgreSQL stores/returns bytea; no `pgcrypto`, implicit database hash, text conversion or driver stream behavior is assumed.","Any transaction timeout, cancellation, constraint error, mismatch or serialization/deadlock error aborts the entire package transaction. No partial rows are authority; no automatic retry occurs inside the UoW."],concurrency:["Use READ COMMITTED with unique constraints as the arbitration point; SERIALIZABLE is not required for immutable insert/read workflows. Acquire/read identity keys in deterministic lexical order.","For blob and authority insert-if-absent, use INSERT ... ON CONFLICT DO NOTHING only on the exact immutable unique key, then reread in a new statement snapshot and compare all material and bytes. Never UPDATE/upsert an existing row.","Concurrent identical writers may converge only after one committed row is reread and byte-compared. Concurrent different bytes/material at the same blob or authority key reject. Same bytes under two locators share the blob but produce separate artifact authorities.","Serialization, deadlock, statement timeout or uncertain commit outcome returns a sanitized retryable/unknown result to the caller; the UoW does not retry. A later caller retry resolves outcome by authoritative lookup and full verification."],crashRecovery:["Before transaction: no persistent state.","Transaction failure/crash before commit: database rolls back blobs, manifests, package/member and authority writes together; retry can verify an identical committed identity.","Committed row missing or mismatch on later read: fail closed, emit sanitized integrity incident, never return authority; restore from verified database backup or append a reviewed correction, never silently mutate.","Identical replay with same identity, digest, length and metadata returns existing verified row; any same artifact/package key with different bytes or material binding is conflict/rejection.","No cross-service orphan can occur in the single-database protocol. Any unexpectedly committed content blob without an artifact is a non-authoritative integrity orphan; reconciliation never promotes it without a fully verified authority transaction."],security:["Server-only adapter/UoW; direct server PostgreSQL connection only. Supabase service-role/storage keys are unnecessary and forbidden for this path.","RLS enabled on every exposed public authority table; no policies; revoke privileges from PUBLIC, anon and authenticated. No public URL, signed URL, public views or byte-download path; clients cannot insert/update/delete.","Immutable UPDATE/DELETE rejection triggers; SECURITY INVOKER functions only, fixed search_path, EXECUTE revoked from PUBLIC/anon/authenticated; no SECURITY DEFINER or generic write API.","No secret or raw bytes in IDs, logs, exceptions or results; bounded body, query and response sizes; sanitize all database errors.","Canonical SEC archive-relative locator, reject dot segments, separators/encoded traversal and non-canonical path; never trust content-type without byte-level validation."],retention:["Normal evidence mutation is forbidden: UPDATE/DELETE blocked. Corrections append new authority and explicit supersession; never overwrite historical evidence.","Retention and deletion are both NOT_APPROVED. Legal hold and approved deletion can conflict with indefinite evidence retention; policy and authority remain BLOCKED. No expiry-triggered deletion is implied.","Any future legal deletion needs separately approved administrator authority/workflow, audited scope, approved tombstone semantics and reference impact analysis. Deletion may affect shared blobs, artifacts, packages, lineages and claims; no deletion can start until all dependent authority and backup/PITR-copy effects are specified.","A tombstone alone does not erase bytea. Physical deletion timing must account for dependent rows, backups, WAL/PITR and restore copies; actual erasure window and authorizer are unselected and block production.","Backup/restore covers logical bytea and manifest in the same database recovery unit only to the extent the configured PostgreSQL/Supabase backup includes that database; verify restored hashes. This is not a durability/RPO/RTO guarantee."]},
  approvals:{productionStatus:SEC_EVENT_DOCUMENT_BYTE_STORAGE_PRODUCTION_STATUS,liveAcquisition:"NOT_APPROVED",rawByteStorage:"NOT_APPROVED",normalizedStorage:"NOT_APPROVED",authorityPersistence:"NOT_APPROVED",retention:"NOT_APPROVED",deletion:"NOT_APPROVED",redistribution:"NOT_APPROVED",commercialUse:"NOT_APPROVED"},
  evidenceReferences:[] as {title:string;url:string;checkedAt:string}[],
  reviewedAt:"2026-10-02T08:06:59.000Z",recordedAt:"2026-10-02T07:23:52.000Z",
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
 ["Supabase Storage object deletion","https://supabase.com/docs/guides/storage/management/delete-objects"],
 ["Supabase Storage lifecycle API","https://supabase.com/docs/reference/javascript/file-buckets-updatebucketlifecycle"],
 ["PostgreSQL 18 bytea","https://www.postgresql.org/docs/current/datatype-binary.html"],
 ["PostgreSQL 18 TOAST","https://www.postgresql.org/docs/current/storage-toast.html"],
 ["PostgreSQL 18 limits","https://www.postgresql.org/docs/current/limits.html"],
 ["PostgreSQL 18 transactions","https://www.postgresql.org/docs/current/tutorial-transactions.html"],
 ["PostgreSQL 18 backup and restore","https://www.postgresql.org/docs/current/backup.html"],
 ["PostgreSQL 18 large objects","https://www.postgresql.org/docs/current/largeobjects.html"],
] as const;
for (const [title,url] of evidence) material.evidenceReferences.push({title,url,checkedAt:"2026-10-02T08:06:59.000Z"});
material.evidenceReferences.sort((a,b)=>a.url < b.url ? -1 : a.url > b.url ? 1 : 0);
const freeze = <T>(v:T):T => { if(v && typeof v === "object" && !Object.isFrozen(v)){ for(const x of Object.values(v as Record<string,unknown>)) freeze(x); Object.freeze(v); } return v; };
const canonical = (v:unknown):string => Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().filter(k=>k!=="recordedAt"&&k!=="fingerprint").map(k=>`${JSON.stringify(k)}:${canonical((v as Record<string,unknown>)[k])}`).join(",")}}` : JSON.stringify(v);
export const fingerprintSecEventByteStorageDecision = (v:unknown):string => createHash("sha256").update(canonical(v)).digest("hex");
const exactShape = (v:unknown, template:unknown):boolean => {
  if(v && typeof v === "object" && utilTypes.isProxy(v)) return false;
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
export const secDocumentBlobId=(bytes:Uint8Array):string=>`sha256:${sha256EntityBodyOctets(bytes)}:${bytes.byteLength}`;
export function verifySecDocumentReplay(existing:{sha256:string;byteLength:number;bytes:Uint8Array},incoming:Uint8Array):"IDENTICAL_REPLAY"|"CONTENT_CONFLICT" {
  let equal=existing.bytes.byteLength===incoming.byteLength;
  for(let i=0;equal&&i<incoming.byteLength;i++) equal=existing.bytes[i]===incoming[i];
  return existing.sha256===sha256EntityBodyOctets(incoming)&&existing.byteLength===incoming.byteLength&&equal?"IDENTICAL_REPLAY":"CONTENT_CONFLICT";
}
export type SecDocumentArtifactIdentity=Readonly<{sourceProfileId:string;sourceProfileFingerprint:string;filingIdentityId:string;documentLocator:string;documentRole:"INDEX"|"PRIMARY_DOCUMENT"|"EXHIBIT";contentType:string;canonicalizationVersion:string;blobSha256:string;byteLength:number}>;
export function secDocumentArtifactFingerprint(input:SecDocumentArtifactIdentity):string {
  const id=/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
  const safeId=(v:string)=>id.test(v)&&!v.includes("..")&&!/(?:https?:|www\.|api[_-]?(?:key|token)|token|password|secret|credential)/i.test(v);
  const locator=/^\/Archives\/edgar\/data\/\d{1,10}\/\d{18}\/[A-Za-z0-9_.-]{1,128}$/;
  const shape={sourceProfileId:"",sourceProfileFingerprint:"",filingIdentityId:"",documentLocator:"",documentRole:"INDEX",contentType:"",canonicalizationVersion:"",blobSha256:"",byteLength:0};
  if(!exactShape(input,shape)||!safeId(input.sourceProfileId)||!safeId(input.filingIdentityId)||!HASH.test(input.sourceProfileFingerprint)||!HASH.test(input.blobSha256)||!locator.test(input.documentLocator)||!(["INDEX","PRIMARY_DOCUMENT","EXHIBIT"] as const).includes(input.documentRole)||!/^[-a-z0-9.+]+\/[-a-z0-9.+]+$/.test(input.contentType)||!safeId(input.canonicalizationVersion)||!Number.isSafeInteger(input.byteLength)||input.byteLength<1||input.byteLength>8388608) throw new Error("SEC_DOCUMENT_ARTIFACT_IDENTITY_INVALID");
  return createHash("sha256").update(canonical(input)).digest("hex");
}
export function isSecDocumentPackageWithinLimits(members:readonly Readonly<{artifactId:string;byteLength:number}>[]):boolean {
  if(!Array.isArray(members)||utilTypes.isProxy(members)||Object.getPrototypeOf(members)!==Array.prototype||members.length<1||members.length>32||Reflect.ownKeys(members).length!==members.length+1)return false;
  let total=0;
  const ids=new Set<string>();
  for(let i=0;i<members.length;i++){const slot=Object.getOwnPropertyDescriptor(members,String(i));if(!slot||!("value" in slot)||slot.get||slot.set)return false;const m=slot.value;if(!exactShape(m,{artifactId:"",byteLength:0})||!Number.isSafeInteger(m.byteLength)||m.byteLength<1||m.byteLength>8388608||typeof m.artifactId!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(m.artifactId)||ids.has(m.artifactId))return false;ids.add(m.artifactId);total+=m.byteLength;if(total>67108864)return false;}
  return true;
}
