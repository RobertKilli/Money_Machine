import { createSecRuntimeBatch } from "test-only:sec-runtime-constructor";
import { describe, expect, it, vi } from "vitest";
import * as postgresUow from "@/infrastructure/postgres/sec-edgar-event-source-provenance-uow";
import { persistSyntheticSecEdgarFixtureProvenance } from "@/application/intelligence/persist-sec-edgar-event-source-provenance";
import { createSecRuntimeBatch as createAuthenticatedBatch } from "@/domain/intelligence/sec-edgar-event-source-provenance-runtime";
import { adaptSecEdgarFixtureToEntityBytes, runSecEdgar8kFixtureClaimPipeline } from "@/domain/intelligence/sec-edgar-8k-fixture-claim-pipeline";
import { SEC_EDGAR_8K_SYNTHETIC_FIXTURES } from "../fixtures/sec-edgar-8k-fixture-claim-pipeline";
import { createSecRuntimeDeadline, hashExactEntityBody, isTrustedSecRuntimeBatch, parseSecRuntimeSourceProfile, SEC_EVENT_RUNTIME_LIMITS, secRuntimeBoundsAreValid } from "@/domain/intelligence/sec-edgar-event-source-provenance-runtime";

const bytes=(s:string)=>new TextEncoder().encode(s);
const material=(overrides:Record<string,unknown>={})=>({profileId:"sec-edgar-synthetic-fixture-profile/v1",profileFingerprint:"a".repeat(64),cik:"SYNTH-CIK-0001",accession:"SYNTH-ACC-AGREE-0001",form:"8-K" as const,filingDate:"2026-10-01",acceptanceAt:"2026-10-01T12:00:00.000Z",reportPeriod:null,amendmentParent:null,receipt:{receiptId:"SYNTH-RECEIPT-TEST-0001",receivedAt:"2026-10-02T12:00:00.000Z",effectiveAvailableAt:"2026-10-01T12:00:00.000Z",responseStatus:200},documents:[{locator:"/synthetic-edgar/archive/SYNTH-CIK-0001/SYNTH-ACC-AGREE-0001/index.json",role:"FILING_INDEX" as const,documentType:"FILING_INDEX",sequence:0,contentType:"application/json",contentEncoding:"identity" as const,bytes:bytes("index")},{locator:"/synthetic-edgar/archive/SYNTH-CIK-0001/SYNTH-ACC-AGREE-0001/primary.txt",role:"PRIMARY_DOCUMENT" as const,documentType:"PRIMARY_DOCUMENT",sequence:1,contentType:"text/plain",contentEncoding:"identity" as const,bytes:bytes("primary")},{locator:"/synthetic-edgar/archive/SYNTH-CIK-0001/SYNTH-ACC-AGREE-0001/exhibit.txt",role:"EXHIBIT" as const,documentType:"EXHIBIT-99.1",sequence:2,contentType:"text/plain",contentEncoding:"identity" as const,bytes:bytes("exhibit")}],...overrides});

describe("SEC provenance runtime foundation domain",()=>{
  it("preserves the original transaction Error if connection/lease cleanup also fails",async()=>{
    const input=runSecEdgar8kFixtureClaimPipeline([SEC_EDGAR_8K_SYNTHETIC_FIXTURES[0]]);const primary=new Error("SEC_TEST_PRIMARY_FAILURE");let releases=0;
    const factory=vi.spyOn(postgresUow,"createSecEventProvenanceUnitOfWork").mockImplementation(()=>({persist:async()=>{throw primary;},close:async()=>{throw new Error("SEC_TEST_CLOSE_FAILURE");}}));
    try{await expect(persistSyntheticSecEdgarFixtureProvenance(input,"unused",undefined,{assertCanStartTransaction(){},reservePayload:()=>({release:()=>{releases++;throw new Error("SEC_TEST_RELEASE_FAILURE");}})})).rejects.toBe(primary);expect(releases).toBe(1);}finally{factory.mockRestore();}
  });
  it("propagates payload cancellation before byte allocation or UoW",async()=>{
    const input=runSecEdgar8kFixtureClaimPipeline([SEC_EDGAR_8K_SYNTHETIC_FIXTURES[0]]);let starts=0;const failure=new Error("SEC_EVENT_REQUEST_CANCELLED");
    await expect(persistSyntheticSecEdgarFixtureProvenance(input,"unused",undefined,{reservePayload:()=>{throw failure;},assertCanStartTransaction:()=>{starts++;}})).rejects.toBe(failure);expect(starts).toBe(0);
  });
  it.each(["success","parser","admission","uow"])("releases payload admission on %s",async scenario=>{
    const fixture=runSecEdgar8kFixtureClaimPipeline([SEC_EDGAR_8K_SYNTHETIC_FIXTURES[0]]);
    const failure=new Error("SEC_TEST_RESOURCE_FAILURE");let reserved=0,released=0,starts=0;
    const factory=vi.spyOn(postgresUow,"createSecEventProvenanceUnitOfWork").mockImplementation(()=>({persist:async()=>{starts++;if(scenario==="uow")throw failure;return Object.freeze({profileId:"test",filingIdentityId:"test",packageId:"test",packageFingerprint:"test",receiptId:"test",lineageId:"test",documentCount:2,memberCount:3,blobCount:3,status:"PERSISTED_VERIFIED",classification:"SYNTHETIC_NON_AUTHORITATIVE",eventAuthorityEligible:false});},close:async()=>{}}));
    try{
      const operation=persistSyntheticSecEdgarFixtureProvenance(fixture,"unused",scenario==="parser"?{receivedAt:"invalid",effectiveAvailableAt:"invalid"}:undefined,{reservePayload:budget=>{expect(budget).toBeGreaterThan(0);expect(budget).toBeLessThanOrEqual(SEC_EVENT_RUNTIME_LIMITS.workerBytes);reserved++;return {release:()=>{released++;}};},assertCanStartTransaction:()=>{expect(reserved).toBe(1);if(scenario==="admission")throw failure;}});
      if(scenario==="success")await operation;else if(scenario==="parser")await expect(operation).rejects.toThrow("SEC_EVENT_RUNTIME_INPUT_INVALID");else await expect(operation).rejects.toBe(failure);
      expect(reserved).toBe(1);expect(released).toBe(1);expect(starts).toBe(scenario==="success"||scenario==="uow"?1:0);
    }finally{factory.mockRestore();}
  });
  it("does not issue production trust to caller material, copies, or proxies",()=>{
    let reads=0;
    const proxy=new Proxy(material(),{get(){reads++;throw new Error("sensitive");},getPrototypeOf(){reads++;throw new Error("sensitive");}});
    for(const input of [material(),proxy])expect(()=>createAuthenticatedBatch(input)).toThrow("SEC_EVENT_RUNTIME_TRUST_REQUIRED");
    const adapted=adaptSecEdgarFixtureToEntityBytes(runSecEdgar8kFixtureClaimPipeline([SEC_EDGAR_8K_SYNTHETIC_FIXTURES[0]]))!;
    expect(isTrustedSecRuntimeBatch(createAuthenticatedBatch(adapted))).toBe(true);
    for(const input of [{...adapted},structuredClone(adapted),JSON.parse(JSON.stringify(adapted))])expect(()=>createAuthenticatedBatch(input)).toThrow("SEC_EVENT_RUNTIME_TRUST_REQUIRED");
    expect(reads).toBe(0);
    const original=createAuthenticatedBatch(adapted);adapted.documents[1]!.bytes[0]^=1;
    expect(Reflect.set(adapted.documents[1]!,"role","EXHIBIT")).toBe(false);
    expect(createAuthenticatedBatch(adapted).packageId).toBe(original.packageId);
  });
  it("rejects source-profile proxies before any trap",()=>{
    let traps=0;const input=new Proxy({}, {getPrototypeOf(){traps++;throw new Error("sensitive");},ownKeys(){traps++;throw new Error("sensitive");}});
    expect(()=>parseSecRuntimeSourceProfile(input)).toThrow("SEC_EVENT_SOURCE_PROFILE_INVALID");expect(traps).toBe(0);
  });
  const validProfile={profileId:"sec-edgar-synthetic-fixture-profile/v1",contractVersion:"sec-edgar-synthetic-fixture-profile/v1",providerId:"SYNTHETIC_FIXTURE",datasetId:"sec-edgar-8k-fixture",datasetVersion:"sec-edgar-8k-fixture-package/v1",endpointProfile:"SYNTHETIC_FIXTURE_ADAPTER",pathTemplate:"/synthetic-edgar/archive/{cik}/{accession}",method:"FIXTURE_ADAPTER",requestIdentityPolicy:"synthetic-fixture-replay/v1"};
  it.each([["blank provider",{providerId:""}],["whitespace provider",{providerId:"  "}],["blank endpoint profile",{endpointProfile:""}],["blank contract version",{contractVersion:" "}],["blank profile ID",{profileId:""}],["noncanonical profile ID",{profileId:"../unsafe"}]])("rejects source profile parser input before any UoW: %s",(_name,change)=>expect(()=>parseSecRuntimeSourceProfile({...validProfile,...change})).toThrow("SEC_EVENT_SOURCE_PROFILE_INVALID"));
  it("accepts and freezes the canonical source profile descriptor",()=>{const parsed=parseSecRuntimeSourceProfile(validProfile);expect(parsed.providerId).toBe("SYNTHETIC_FIXTURE");expect(Object.isFrozen(parsed)).toBe(true);});
  it("rejects inherited, extra-key, and accessor source profile shapes without invoking getters",()=>{let reads=0;const accessor=Object.defineProperty({...validProfile},"providerId",{enumerable:true,get(){reads++;return "SYNTHETIC_FIXTURE";}});expect(()=>parseSecRuntimeSourceProfile(Object.assign(Object.create({extra:"inherited"}),validProfile))).toThrow("SEC_EVENT_SOURCE_PROFILE_INVALID");expect(()=>parseSecRuntimeSourceProfile({...validProfile,secret:"unsafe"})).toThrow("SEC_EVENT_SOURCE_PROFILE_INVALID");expect(()=>parseSecRuntimeSourceProfile(accessor)).toThrow("SEC_EVENT_SOURCE_PROFILE_INVALID");expect(reads).toBe(0);});
  it("binds exact bytes into stable blob and authority identities",()=>{const a=createSecRuntimeBatch(material());const b=createSecRuntimeBatch(material());expect(a.documents[1]?.sha256).toBe(b.documents[1]?.sha256);expect(a.packageFingerprint).toBe(b.packageFingerprint);expect(a.documents).toHaveLength(3);expect(a.documents[0]?.blobId).toMatch(/^sha256:[0-9a-f]{64}:5$/);});
  it("one changed byte changes blob, artifact, and package identity",()=>{const a=createSecRuntimeBatch(material());const m=material();const ds=[...m.documents];ds[1]={...ds[1]!,bytes:bytes("primarx")};const b=createSecRuntimeBatch({...m,documents:ds});expect(b.documents[1]?.blobId).not.toBe(a.documents[1]?.blobId);expect(b.documents[1]?.artifactId).not.toBe(a.documents[1]?.artifactId);expect(b.packageFingerprint).not.toBe(a.packageFingerprint);});
  it("a changed exhibit changes only its blob/artifact and package identity",()=>{const a=createSecRuntimeBatch(material());const m=material();const ds=[...m.documents];ds[2]={...ds[2]!,bytes:bytes("exhibix")};const b=createSecRuntimeBatch({...m,documents:ds});expect(b.documents[1]?.artifactId).toBe(a.documents[1]?.artifactId);expect(b.documents[2]?.blobId).not.toBe(a.documents[2]?.blobId);expect(b.documents[2]?.artifactId).not.toBe(a.documents[2]?.artifactId);expect(b.packageId).not.toBe(a.packageId);});
  it("keeps filing package and event lineage as distinct authorities",()=>{const b=createSecRuntimeBatch(material());expect(b.packageId).not.toBe(b.lineageId);expect(b.packageFingerprint).not.toBe(b.lineageFingerprint);expect(b.documents.map(d=>d.sequence)).toEqual([0,1,2]);});
  it("receipt variation preserves content/document/package identity",()=>{const a=createSecRuntimeBatch(material());const b=createSecRuntimeBatch(material({receipt:{receiptId:"SYNTH-RECEIPT-TEST-0002",receivedAt:"2026-10-03T12:00:00.000Z",effectiveAvailableAt:"2026-10-01T00:00:00.000Z",responseStatus:200}}));expect(b.documents.map(d=>d.artifactId)).toEqual(a.documents.map(d=>d.artifactId));expect(b.packageId).toBe(a.packageId);expect(b.receiptId).not.toBe(a.receiptId);});
  it("keeps lineage stable because the decision binds package members and amendment context, not receipt",()=>{const a=createSecRuntimeBatch(material());const b=createSecRuntimeBatch(material({receipt:{receiptId:"SYNTH-RECEIPT-TEST-0002",receivedAt:"2026-10-03T12:00:00.000Z",effectiveAvailableAt:"2026-10-01T00:00:00.000Z",responseStatus:200}}));expect(b.lineageId).toBe(a.lineageId);expect(b.lineageFingerprint).toBe(a.lineageFingerprint);expect(b.attemptId).not.toBe(a.attemptId);});
  it("returns isolated byte copies and deeply freezes authority collections",()=>{const b=createSecRuntimeBatch(material());const first=b.documents[1]!.bytes;first[0]=0;expect(b.documents[1]!.bytes).not.toEqual(first);expect(Object.isFrozen(b.documents)).toBe(true);expect(Object.isFrozen(b.documents[1])).toBe(true);expect(Object.isFrozen(b.packageMaterial.orderedDocumentMemberSet)).toBe(true);});
  it("same bytes at separate locators share blob but retain distinct artifacts",()=>{const m=material();const ds=[...m.documents];ds[2]={...ds[2]!,bytes:bytes("primary")};const a=createSecRuntimeBatch({...m,documents:ds});expect(a.documents[1]?.blobId).toBe(a.documents[2]?.blobId);expect(a.documents[1]?.artifactId).not.toBe(a.documents[2]?.artifactId);});
  it.each([""," ","/synthetic-edgar/archive/../../outside.txt","/synthetic-edgar/archive/SYNTH-CIK-0001/SYNTH-ACC-AGREE-0001/%2e%2e/out.txt"]) ("rejects blank or unsafe artifact locator before UoW: %s",locator=>{const m=material();const docs=[...m.documents];docs[1]={...docs[1]!,locator};expect(()=>createSecRuntimeBatch({...m,documents:docs})).toThrow("SEC_EVENT_RUNTIME_INPUT_INVALID");});
  it("rejects invalid encoding and package/document/memory bounds",()=>{const m=material();const ds=[...m.documents];ds[1]={...ds[1]!,contentEncoding:"gzip" as never};expect(()=>createSecRuntimeBatch({...m,documents:ds})).toThrow("SEC_EVENT_RUNTIME_INPUT_INVALID");expect(SEC_EVENT_RUNTIME_LIMITS.documentBytes).toBe(8*1024*1024);expect(SEC_EVENT_RUNTIME_LIMITS.packageBytes).toBe(64*1024*1024);});
  it.each([
    ["source profile identifier",{profileId:"https://token:secret@example.test/profile"}],
    ["source profile fingerprint",{profileFingerprint:"A".repeat(64)}],
    ["CIK",{cik:"0000000001"}],
    ["blank CIK",{cik:""}],
    ["accession",{accession:"../unsafe"}],
    ["blank accession",{accession:""}],
    ["filing form",{form:"10-K"}],
    ["amendment parent identifier",{form:"8-K/A",amendmentParent:"../unsafe"}],
    ["self-parent amendment",{form:"8-K/A",amendmentParent:"SYNTH-ACC-AGREE-0001"}],
    ["missing amendment parent",{form:"8-K/A",amendmentParent:null}],
    ["filing date",{filingDate:"2026-02-30"}],
    ["acceptance timestamp",{acceptanceAt:"2026-10-01"}],
    ["missing receipt timestamp",{receipt:{receiptId:"SYNTH-RECEIPT-TEST-0001",receivedAt:null,effectiveAvailableAt:"2026-10-01T12:00:00.000Z",responseStatus:200}}],
  ])("rejects invalid source/filing material before UoW: %s",(_name,override)=>expect(()=>createSecRuntimeBatch(material(override as Record<string,unknown>))).toThrow("SEC_EVENT_RUNTIME_INPUT_INVALID"));
  it("enforces local document, package, count, and worker byte boundaries",()=>{const MiB=1024*1024;expect(secRuntimeBoundsAreValid([1,8*MiB],1)).toBe(true);expect(secRuntimeBoundsAreValid([1,0],1)).toBe(false);expect(secRuntimeBoundsAreValid([1,8*MiB+1],1)).toBe(false);expect(secRuntimeBoundsAreValid([8*MiB,...Array(3).fill(8*MiB)],3)).toBe(true);expect(secRuntimeBoundsAreValid([8*MiB,...Array(7).fill(8*MiB)],7)).toBe(false);expect(secRuntimeBoundsAreValid([8*MiB,...Array(8).fill(8*MiB)],8)).toBe(false);expect(secRuntimeBoundsAreValid([1,...Array(32).fill(1)],32)).toBe(true);expect(secRuntimeBoundsAreValid([1,...Array(33).fill(1)],33)).toBe(false);expect(SEC_EVENT_RUNTIME_LIMITS.workerBytes).toBe(96*MiB);});
  it("rejects an over-limit entity body at the application boundary",()=>{const m=material();const docs=[...m.documents];docs[1]={...docs[1]!,bytes:new Uint8Array(8*1024*1024+1)};expect(()=>createSecRuntimeBatch({...m,documents:docs})).toThrow("SEC_EVENT_RUNTIME_INPUT_INVALID");});
  it("exposes deterministic timeout gates without sleeping",()=>{const deadline=createSecRuntimeDeadline(100,SEC_EVENT_RUNTIME_LIMITS.documentTimeoutMs);expect(deadline.remainingMs(101)).toBe(14_999);expect(deadline.expired(15_100)).toBe(true);});
  it("rejects copied and serialized runtime trust",()=>{const b=createSecRuntimeBatch(material());expect(isTrustedSecRuntimeBatch(b)).toBe(true);expect(isTrustedSecRuntimeBatch({...b})).toBe(false);expect(isTrustedSecRuntimeBatch(structuredClone(b))).toBe(false);expect(isTrustedSecRuntimeBatch(JSON.parse(JSON.stringify(b)))).toBe(false);});
  it("snapshots receipt and bytes against caller mutation",()=>{const input=material();const batch=createSecRuntimeBatch(input);const receipt=batch.material.receipt.receivedAt;const digest=batch.documents[1]!.sha256;Reflect.set(input.receipt,"receivedAt","2000-01-01T00:00:00.000Z");input.documents[1]!.bytes[0]^=1;const exposed=batch.material.documents[1]!.bytes;exposed[0]^=1;expect(Object.isFrozen(batch.material.receipt)).toBe(true);expect(batch.material.receipt.receivedAt).toBe(receipt);expect(hashExactEntityBody(batch.documents[1]!.bytes)).toBe(digest);});
  it("does not expose bytes in the only public summary shape",()=>{const batch=createSecRuntimeBatch(material());const result={packageId:batch.packageId,packageFingerprint:batch.packageFingerprint,documentCount:batch.documents.length,receiptId:batch.receiptId,lineageId:batch.lineageId};expect(JSON.stringify(result)).not.toMatch(/primary|exhibit|index/);});
});
