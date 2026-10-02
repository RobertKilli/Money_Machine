import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  fingerprintSecEventByteStorageDecision,
  isTrustedSecEventDocumentByteStorageDecision,
  isSecDocumentPackageWithinLimits,
  parseSecEventDocumentByteStorageDecision,
  SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION,
  SEC_EVENT_DOCUMENT_BYTE_STORAGE_PRODUCTION_STATUS,
  secDocumentArtifactFingerprint,
  secDocumentBlobId,
  sha256EntityBodyOctets,
  verifySecDocumentReplay,
} from "@/domain/intelligence/sec-event-document-byte-storage-decision";

const decision = () => {
  expect(SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION.status).toBe("VALID");
  if (SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION.status !== "VALID") throw new Error("invalid checked-in decision");
  return SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION.decision;
};
type MutableDecision = { [key: string]: unknown; byteContract: Record<string, unknown>; rejectedOptions: Array<Record<string, unknown>>; evidenceReferences: Array<Record<string, unknown>>; fingerprint: string; recordedAt: string; status?: unknown };
const copy = () => structuredClone(decision()) as unknown as MutableDecision;

describe("SEC event document byte storage decision", () => {
  it("selects exactly one candidate and remains blocked for production", () => {
    const d = decision();
    expect(d.selectedOption).toBe("A_POSTGRES_BYTEA");
    expect(d.rejectedOptions.map(x => x.option)).toEqual(["B_SUPABASE_PRIVATE_STORAGE", "C_EXTERNAL_OBJECT_STORAGE", "D_FINGERPRINT_OR_URL"]);
    expect(d.approvals.productionStatus).toBe(SEC_EVENT_DOCUMENT_BYTE_STORAGE_PRODUCTION_STATUS);
    expect(d.approvals.productionStatus).toBe("BLOCKED_BACKEND_UNAPPROVED");
    expect(Object.values(d.approvals).filter(x => x === "NOT_APPROVED")).toHaveLength(8);
  });
  it("hashes exact entity bytes, not decoded or extracted text", () => {
    const raw = Uint8Array.from([0x3c, 0x70, 0x3e, 0xc3, 0xa9, 0x0d, 0x0a, 0x3c, 0x2f, 0x70, 0x3e]);
    const decodedAndNormalized = new TextDecoder().decode(raw).replace(/\r\n/g, "\n");
    expect(sha256EntityBodyOctets(raw)).not.toBe(sha256EntityBodyOctets(new TextEncoder().encode(decodedAndNormalized)));
    expect(sha256EntityBodyOctets(raw)).not.toBe(sha256EntityBodyOctets(new TextEncoder().encode("é")));
    const changed = raw.slice(); changed[4] ^= 1;
    expect(sha256EntityBodyOctets(changed)).not.toBe(sha256EntityBodyOctets(raw));
  });
  it("keeps receipt, storedAt and readback time outside byte/document identity", () => {
    const bytes = Uint8Array.from([0, 1, 2, 255]);
    const digest = sha256EntityBodyOctets(bytes);
    const receipt = { sha256: digest, byteLength: bytes.byteLength, storedAt: "2026-10-02T07:00:00.000Z", readbackAt: "2026-10-02T07:01:00.000Z" };
    const changedReceipt = { ...receipt, storedAt: "2026-10-03T01:00:00.000Z", readbackAt: "2026-10-04T01:00:00.000Z" };
    expect(changedReceipt.sha256).toBe(receipt.sha256);
    expect(changedReceipt.byteLength).toBe(receipt.byteLength);
    expect(digest).toBe(sha256EntityBodyOctets(bytes));
  });
  it("uses content-addressed blob IDs and accepts identical replay only", () => {
    const bytes = Uint8Array.from([0, 2, 4, 6]);
    const identity = { sha256: sha256EntityBodyOctets(bytes), byteLength: bytes.length, bytes };
    expect(secDocumentBlobId(bytes)).toBe(`sha256:${identity.sha256}:${identity.byteLength}`);
    expect(verifySecDocumentReplay(identity, bytes)).toBe("IDENTICAL_REPLAY");
    expect(verifySecDocumentReplay(identity, Uint8Array.from([0, 2, 4, 7]))).toBe("CONTENT_CONFLICT");
    expect(verifySecDocumentReplay({ ...identity, byteLength: 99 }, bytes)).toBe("CONTENT_CONFLICT");
    expect(verifySecDocumentReplay({ ...identity, byteLength: bytes.length + 1, sha256: identity.sha256 }, bytes)).toBe("CONTENT_CONFLICT");
    const collision = Uint8Array.from([0, 2, 4, 5]);
    expect(verifySecDocumentReplay({ sha256: sha256EntityBodyOctets(bytes), byteLength: bytes.length, bytes: collision }, bytes)).toBe("CONTENT_CONFLICT");
  });
  it("separates deduplicated blob identity from locator-scoped artifact identity", () => {
    const bytes = Uint8Array.from([10, 20, 30]); const sha256 = sha256EntityBodyOctets(bytes);
    const base = { sourceProfileId: "sec-edgar-8k-v1", sourceProfileFingerprint: "a".repeat(64), filingIdentityId: "sec-filing-1", documentRole: "EXHIBIT" as const, contentType: "text/html", canonicalizationVersion: "sec-document-entity-octets/v1", blobSha256: sha256, byteLength: bytes.length };
    const first = secDocumentArtifactFingerprint({ ...base, documentLocator: "/Archives/edgar/data/1/000000000126000001/exhibit.htm" });
    const second = secDocumentArtifactFingerprint({ ...base, documentLocator: "/Archives/edgar/data/1/000000000126000001/exhibit-2.htm" });
    expect(secDocumentBlobId(bytes)).toBe(secDocumentBlobId(bytes));
    expect(second).not.toBe(first);
    expect(secDocumentArtifactFingerprint({ ...base, documentLocator: "/Archives/edgar/data/1/000000000126000001/exhibit.htm", blobSha256: "b".repeat(64) })).not.toBe(first);
    expect(()=>secDocumentArtifactFingerprint({ ...base, documentLocator: "/Archives/edgar/data/1/000000000126000001/../../secret" })).toThrow("SEC_DOCUMENT_ARTIFACT_IDENTITY_INVALID");
  });
  it("rejects URL and secret-like artifact identifiers", () => {
    const bytes=Uint8Array.from([1]); const base={sourceProfileFingerprint:"a".repeat(64),filingIdentityId:"sec-filing-1",documentLocator:"/Archives/edgar/data/1/000000000126000001/a.htm",documentRole:"PRIMARY_DOCUMENT" as const,contentType:"text/html",canonicalizationVersion:"sec-document-entity-octets/v1",blobSha256:sha256EntityBodyOctets(bytes),byteLength:bytes.length};
    expect(()=>secDocumentArtifactFingerprint({...base,sourceProfileId:"https://host/path"})).toThrow("SEC_DOCUMENT_ARTIFACT_IDENTITY_INVALID");
    expect(()=>secDocumentArtifactFingerprint({...base,sourceProfileId:"secret-token-value"})).toThrow("SEC_DOCUMENT_ARTIFACT_IDENTITY_INVALID");
  });
  it("enforces package bytes and count from actual members", () => {
    expect(isSecDocumentPackageWithinLimits([{artifactId:"a",byteLength:8388608},{artifactId:"b",byteLength:8388608}])).toBe(true);
    expect(isSecDocumentPackageWithinLimits(Array.from({length:8},(_,i)=>({artifactId:`d${i}`,byteLength:8388608})))).toBe(true);
    expect(isSecDocumentPackageWithinLimits(Array.from({length:9},(_,i)=>({artifactId:`d${i}`,byteLength:8388608})))).toBe(false);
    expect(isSecDocumentPackageWithinLimits(Array.from({length:33},(_,i)=>({artifactId:`d${i}`,byteLength:1})))).toBe(false);
    expect(isSecDocumentPackageWithinLimits([{artifactId:"a",byteLength:1},{artifactId:"a",byteLength:1}])).toBe(false);
  });
  it("rejects an altered same-key byte binding, fingerprint-only and URL-only authority", () => {
    const x = copy(); x.byteContract.blobId = "sha256:" + "0".repeat(64); x.fingerprint = fingerprintSecEventByteStorageDecision(x);
    expect(parseSecEventDocumentByteStorageDecision(x).status).toBe("INVALID");
    const d = decision(); expect(d.rejectedOptions.find(x => x.option === "D_FINGERPRINT_OR_URL")?.reason).toMatch(/cannot reconstruct/i);
    expect(d.byteContract.blobId).toBe("sha256:<lowercase-64-hex>:<byte-length>");
  });
  it("records private/server-only and overwrite/delete prohibitions", () => {
    const d = decision();
    expect(d.protocol.security.join(" ")).toMatch(/Server-only/);
    expect(d.protocol.security.join(" ")).toMatch(/RLS/);
    expect(d.protocol.security.join(" ")).toMatch(/No public URL, signed URL/);
    expect(d.protocol.concurrency.join(" ")).toMatch(/Never UPDATE\/upsert an existing row/);
    expect(d.protocol.security.join(" ")).toMatch(/UPDATE\/DELETE rejection triggers/);
    expect(d.protocol.retention.join(" ")).toMatch(/Retention and deletion are both NOT_APPROVED/);
    expect(d.rejectedOptions[0]?.reason).toMatch(/service-role bypasses RLS/i);
  });
  it("specifies atomic crash, replay, concurrency, orphan and missing-byte outcomes", () => {
    const d = decision();
    expect(d.protocol.crashRecovery.join(" ")).toMatch(/rolls back/i);
    expect(d.protocol.crashRecovery.join(" ")).toMatch(/same artifact\/package key with different bytes/);
    expect(d.protocol.crashRecovery.join(" ")).toMatch(/No cross-service orphan can occur/);
    expect(d.protocol.crashRecovery.join(" ")).toMatch(/never silently mutate/);
    expect(d.protocol.steps.join(" ")).toMatch(/one PostgreSQL transaction/);
    expect(d.protocol.concurrency.join(" ")).toMatch(/READ COMMITTED/);
    expect(d.protocol.concurrency.join(" ")).toMatch(/DO NOTHING/);
    expect(d.protocol.steps.join(" ")).toMatch(/no automatic retry/);
  });
  it("does not treat ETag as a digest guarantee", () => {
    expect(decision().rejectedOptions[0]?.reason).toContain("published Supabase S3 compatibility matrix lists S3 Versioning");
    expect(decision().evidenceReferences.some(x => x.title.includes("S3 compatibility"))).toBe(true);
    expect(decision().protocol.steps.join(" ")).toMatch(/application SHA-256/);
  });
  it("binds justified local hard limits and bounded non-chunked readback", () => {
    const { limits } = decision();
    expect(limits.maxDocumentBytes).toBe(8 * 1024 * 1024);
    expect(limits.maxPackageBytes).toBe(64 * 1024 * 1024);
    expect(limits.maxDocumentsPerPackage).toBe(32);
    expect(limits.timeoutMs).toBe(15000);
    expect(limits.maxPackageAcquisitionMs).toBe(limits.timeoutMs * limits.maxDocumentsPerPackage);
    expect(limits.maxTransactionMs).toBe(120000);
    expect(limits.streaming).toContain("no PostgreSQL stream API is selected");
    expect(limits.basis).toContain("not PostgreSQL or SEC limits");
    expect(limits.basis).toContain("96 MiB");
    expect(decision().protocol.steps.join(" ")).toMatch(/no `pgcrypto`/);
    expect(decision().protocol.steps.join(" ")).toMatch(/one logical bytea value at a time/);
  });
  it("distinguishes logical TOAST bytes from physical representation", () => {
    expect(decision().byteContract.logicalReadbackPolicy).toMatch(/logical bytea sequence/);
    expect(decision().byteContract.logicalReadbackPolicy).toMatch(/no pgcrypto dependency/);
    expect(decision().physicalModel.contentBlob).toContain("UNIQUE(sha256)");
    expect(decision().physicalModel.documentArtifact).toContain("Same blob at another locator/role");
    expect(decision().physicalModel.eventLineage).toContain("sealed event-source lineage");
  });
  it("rejects copied/serialized runtime trust and non-plain or accessor shapes", () => {
    const d = decision(); expect(isTrustedSecEventDocumentByteStorageDecision(d)).toBe(true);
    const serialized = JSON.parse(JSON.stringify(d));
    expect(isTrustedSecEventDocumentByteStorageDecision(serialized)).toBe(false);
    expect(parseSecEventDocumentByteStorageDecision(serialized).status).toBe("VALID");
    expect(parseSecEventDocumentByteStorageDecision(Object.assign(Object.create({ inherited: true }), serialized)).status).toBe("INVALID");
    const symbol = copy(); Object.defineProperty(symbol, Symbol("x"), { value: "no", enumerable: true });
    expect(parseSecEventDocumentByteStorageDecision(symbol).status).toBe("INVALID");
    const accessor = copy(); Object.defineProperty(accessor, "recordedAt", { get: () => "2026-10-02T07:23:52.000Z", enumerable: true });
    expect(parseSecEventDocumentByteStorageDecision(accessor).status).toBe("INVALID");
    let proxyTrapCalls=0; const proxy=new Proxy(copy(),{getPrototypeOf(){proxyTrapCalls++;throw new Error("trap");}});
    expect(parseSecEventDocumentByteStorageDecision(proxy).status).toBe("INVALID"); expect(proxyTrapCalls).toBe(0);
    const nestedProxy=copy(); nestedProxy.byteContract=new Proxy(nestedProxy.byteContract,{getPrototypeOf(){proxyTrapCalls++;throw new Error("trap");}});
    expect(parseSecEventDocumentByteStorageDecision(nestedProxy).status).toBe("INVALID"); expect(proxyTrapCalls).toBe(0);
    const duplicate = copy(); duplicate.rejectedOptions[2] = { ...duplicate.rejectedOptions[1] }; duplicate.fingerprint = fingerprintSecEventByteStorageDecision(duplicate);
    expect(parseSecEventDocumentByteStorageDecision(duplicate).status).toBe("INVALID");
    const invalidTime=copy(); invalidTime.recordedAt="2026-02-31T01:02:03.000Z"; invalidTime.fingerprint=fingerprintSecEventByteStorageDecision(invalidTime);
    expect(parseSecEventDocumentByteStorageDecision(invalidTime).status).toBe("INVALID");
    const unsafe=copy(); unsafe.byteContract.documentLocator="/../../secret"; unsafe.fingerprint=fingerprintSecEventByteStorageDecision(unsafe);
    expect(parseSecEventDocumentByteStorageDecision(unsafe).status).toBe("INVALID");
    const duplicateRef=copy(); duplicateRef.evidenceReferences[1]={...duplicateRef.evidenceReferences[0]}; duplicateRef.fingerprint=fingerprintSecEventByteStorageDecision(duplicateRef);
    expect(parseSecEventDocumentByteStorageDecision(duplicateRef).status).toBe("INVALID");
  });
  it("has deterministic fingerprint/order, deep immutability and recording-time independence", () => {
    const d = decision();
    expect(d.fingerprint).toBe(fingerprintSecEventByteStorageDecision(d));
    expect(d.evidenceReferences.map(x => x.url)).toEqual([...d.evidenceReferences.map(x => x.url)].sort());
    expect(Object.isFrozen(d)).toBe(true);
    expect(Object.isFrozen(d.protocol.crashRecovery)).toBe(true);
    const x = copy(); const fp = x.fingerprint; x.recordedAt = "2026-10-04T00:00:00.000Z"; x.fingerprint = fingerprintSecEventByteStorageDecision(x);
    expect(x.fingerprint).toBe(fp);
    expect(parseSecEventDocumentByteStorageDecision(x).status).toBe("VALID");
  });
  it("pins the contract identity and refuses production readiness", () => {
    const x = copy(); x.status = "READY"; x.fingerprint = fingerprintSecEventByteStorageDecision(x);
    expect(parseSecEventDocumentByteStorageDecision(x).status).toBe("INVALID");
    const d = decision(); expect(d.contractVersion).toBe("sec-event-document-byte-storage-decision/v1");
    expect(d.approvals.productionStatus).toBe("BLOCKED_BACKEND_UNAPPROVED");
  });
  it("keeps Storage metadata backup distinct from object payload and blocks retention deletion", () => {
    const d=decision();
    expect(d.rejectedOptions[0]?.reason).toContain("Storage API object bytes are outside database backups");
    expect(d.rejectedOptions[0]?.reason).toContain("published Supabase S3 compatibility matrix lists");
    expect(d.protocol.retention.join(" ")).toMatch(/Retention and deletion are both NOT_APPROVED/);
    expect(d.protocol.retention.join(" ")).toMatch(/A tombstone alone does not erase bytea/);
    expect(d.approvals.deletion).toBe("NOT_APPROVED");
  });
  it("keeps the checked-in production configuration blocked", () => {
    const production=JSON.parse(readFileSync("config/intelligence/sec-event-document-byte-storage.production.json","utf8").replace(/^\uFEFF/,"")) as Record<string,unknown>;
    expect(production.status).toBe("BLOCKED_BACKEND_UNAPPROVED");
    expect(production.enabled).toBe(false);
    expect(production.deletion).toBe("NOT_APPROVED");
  });
});
