import { createSecRuntimeBatch } from "test-only:sec-runtime-constructor";
import { afterAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { runSecEdgar8kFixtureClaimPipeline } from "@/domain/intelligence/sec-edgar-8k-fixture-claim-pipeline";
import { adaptSecEdgarFixtureToEntityBytes } from "@/domain/intelligence/sec-edgar-8k-fixture-claim-pipeline";
import { createSecRuntimeBatch as createAuthenticatedBatch, isTrustedSecRuntimeBatch, parseSecRuntimeSourceProfile } from "@/domain/intelligence/sec-edgar-event-source-provenance-runtime";
import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";
import { createCanonicalSecEventSourceProvenanceDecision } from "@/domain/intelligence/sec-edgar-event-source-provenance-decision";
import { persistSyntheticSecEdgarFixtureProvenance } from "@/application/intelligence/persist-sec-edgar-event-source-provenance";
import { createSecEventProvenanceUnitOfWork } from "@/infrastructure/postgres/sec-edgar-event-source-provenance-uow";
import { persistSecEventProvenance, type SecDocumentArtifactWrite } from "@/infrastructure/postgres/sec-edgar-event-source-provenance-uow";
import * as productionUow from "@/infrastructure/postgres/sec-edgar-event-source-provenance-uow";
import { persistDocumentArtifact } from "test-only:sec-artifact-uow";
import { SEC_EDGAR_8K_SYNTHETIC_FIXTURES } from "../fixtures/sec-edgar-8k-fixture-claim-pipeline";

const url=process.env.DATABASE_URL;
const tableNames=["sec_event_source_profiles","sec_event_filing_identities","sec_event_acquisition_requests","sec_event_acquisition_attempts","sec_event_content_blobs","sec_event_document_artifacts","sec_event_filing_packages","sec_event_package_document_members","sec_event_acquisition_receipts","sec_event_source_lineages","sec_event_source_lineage_members"];
const runSeed=randomBytes(16).toString("hex");
const caseId=(name:string)=>createHash("sha256").update(`${runSeed}:${name}`).digest("hex").slice(0,24);
const connect=()=>{let parsed:URL|undefined;try{parsed=new URL(url??"");}catch{}if(!parsed||parsed.protocol!=="postgresql:"||parsed.username!=="postgres"||parsed.password!=="postgres"||parsed.hostname!=="127.0.0.1"||Number(parsed.port)<55439||Number(parsed.port)>55999)throw new Error("SEC_RUNTIME_REQUIRES_DISPOSABLE_LOOPBACK_DATABASE");return postgres(url!,{max:2,prepare:true});};
const fixture=(index:number)=>runSecEdgar8kFixtureClaimPipeline([SEC_EDGAR_8K_SYNTHETIC_FIXTURES[index]]);
const fixtureSet=(...indexes:number[])=>runSecEdgar8kFixtureClaimPipeline(indexes.map(index=>SEC_EDGAR_8K_SYNTHETIC_FIXTURES[index]));
const counts=async(sql:ReturnType<typeof connect>)=>{const rows=await sql`select table_name,(xpath('/row/count/text()',query_to_xml(format('select count(*) as count from public.%I',table_name),false,true,'')))[1]::text::int as count from information_schema.tables where table_schema='public' and table_name in ${sql(tableNames)}`;return Object.fromEntries(tableNames.map(name=>[name,Number(rows.find(r=>r.table_name===name)?.count??0)]));};

type PgFailure=Error&{code?:string;constraint_name?:string;column_name?:string;table_name?:string;where?:string};
type Tx=postgres.TransactionSql;
async function expectDbFailure(name:string,expectedState:string,expectedConstraint:string,operation:(tx:Tx)=>Promise<unknown>){
  const writer=connect();const before=await counts(writer);let failure:PgFailure|undefined;let insertsSucceeded=false;
  try{await writer.begin(async tx=>{await operation(tx);insertsSucceeded=true;});}catch(error){failure=error as PgFailure;}finally{await writer.end({timeout:5});}
  expect(insertsSucceeded,`${name}: failure during INSERT`).toBe(false);
  expect(failure?.code,`${name}: SQLSTATE`).toBe(expectedState);
  expect(failure?.constraint_name??failure?.column_name,`${name}: actual constraint/column`).toBe(expectedConstraint);
  expect(failure?.message,`${name}: sanitized database error`).not.toMatch(/ITEM\||SYNTHETIC FIXTURE|agreement\.txt|[A-Za-z0-9+/]{80,}/);
  const verify=connect();let after:Record<string,number>;try{after=await counts(verify);expect(after,`${name}: exact all-table rollback counts`).toEqual(before);}finally{await verify.end({timeout:5});}
  console.info("SEC_TRUTH_TABLE_COUNTS",JSON.stringify({case:name,before,after,sqlState:failure?.code,constraint:failure?.constraint_name??failure?.column_name,stage:"INSERT"}));
  return {name,expectedState,actualState:failure?.code,constraint:failure?.constraint_name??failure?.column_name,stage:"INSERT",before,after:before};
}
async function expectDeferredDbFailure(name:string,expectedState:string,invariant:string,functionName:string,operation:(tx:Tx)=>Promise<unknown>){
  const writer=connect();const before=await counts(writer);let failure:PgFailure|undefined;let insertsSucceeded=false;
  try{await writer.begin(async tx=>{await operation(tx);insertsSucceeded=true;});}catch(error){failure=error as PgFailure;}finally{await writer.end({timeout:5});}
  expect(insertsSucceeded,`${name}: INSERTs must succeed before COMMIT failure`).toBe(true);
  expect(failure?.code,`${name}: SQLSTATE`).toBe(expectedState);expect(failure?.message,`${name}: invariant`).toContain(invariant);expect(failure?.where,`${name}: function`).toContain(functionName);
  const verify=connect();let after:Record<string,number>;try{after=await counts(verify);expect(after,`${name}: all-table rollback`).toEqual(before);}finally{await verify.end({timeout:5});}
  console.info("SEC_TRUTH_TABLE_COUNTS",JSON.stringify({case:name,before,after,sqlState:failure?.code,functionName,stage:"COMMIT"}));
}
async function insertTestProfile(tx:Tx,id:string,override:Readonly<{contractVersion?:string;providerId?:string;datasetId?:string;datasetVersion?:string;endpointProfile?:string;pathTemplate?:string;method?:string;requestIdentityPolicy?:string}>={}){
  await tx`insert into public.sec_event_source_profiles(profile_id,fingerprint,contract_version,provider_id,dataset_id,dataset_version,endpoint_profile,hostname_allowlist,path_template,method,supported_forms,authentication_kind,accepted_content_encoding,request_identity_policy,max_timeout_ms,max_response_bytes,max_package_documents,material) values(${id},${"a".repeat(64)},${override.contractVersion??"test/v1"},${override.providerId??"SYNTHETIC_FIXTURE"},${override.datasetId??`dataset-${id.replaceAll("/","-")}`},${override.datasetVersion??"test/v1"},${override.endpointProfile??"TEST"},${tx.json([])},${override.pathTemplate??"/test/{cik}/{accession}"},${override.method??"GET"},${tx.json(["8-K","8-K/A"])},'NONE',${tx.json(["identity"])},${override.requestIdentityPolicy??"test/v1"},1000,8388608,32,${tx.json({testOnly:true})})`;
}
type RuntimeBatch=ReturnType<typeof createSecRuntimeBatch>;
type RuntimeDoc=RuntimeBatch["documents"][number];
function artifactConflictBatch(original:RuntimeBatch["material"],name:string,changeBytes=false):RuntimeBatch {
  const accession=`SYNTH-ACC-${caseId(name).toUpperCase()}`;
  const documents=original.documents.map(d=>{
    const locator=d.locator.replace(original.accession,accession);
    if(d.role==="FILING_INDEX")return {...d,locator,bytes:Buffer.from(JSON.stringify({adapter:"synthetic-artifact-conflict/v1",cik:original.cik,accession,form:original.form,documents:original.documents.filter(x=>x.role!=="FILING_INDEX").map(x=>({locator:x.locator.replace(original.accession,accession),role:x.role,sequence:x.sequence}))}),"utf8")};
    const bytes=Buffer.from(d.bytes);if(changeBytes&&d.role==="PRIMARY_DOCUMENT")bytes[0]=bytes[0]!^1;
    return {...d,locator,bytes};
  });
  return createSecRuntimeBatch({...original,accession,documents});
}
async function artifactConflictProfile(sql:ReturnType<typeof connect>,batch:RuntimeBatch){
  const rows=await sql`select material from public.sec_event_source_profiles where profile_id=${batch.material.profileId}`;
  const profileId=`sec-artifact-conflict-${caseId("profile")}/v1`;
  const profileMaterial={...rows[0]!.material,contractVersion:profileId,dataset:`sec-artifact-conflict-${caseId("dataset")}`};
  const profileFingerprint=canonicalSha256(profileMaterial);
  const descriptor=parseSecRuntimeSourceProfile({profileId,contractVersion:profileMaterial.contractVersion,providerId:profileMaterial.provider,datasetId:profileMaterial.dataset,datasetVersion:profileMaterial.version,endpointProfile:profileMaterial.endpointProfile,pathTemplate:profileMaterial.pathTemplate,method:profileMaterial.method,requestIdentityPolicy:profileMaterial.requestIdentityPolicy});
  const filingMaterial={sourceProfileId:profileId,sourceProfileFingerprint:profileFingerprint,cik:batch.material.cik,accessionNumber:batch.material.accession,form:batch.material.form};
  const filingIdentityId=canonicalSha256(filingMaterial);
  await sql.begin(async tx=>{
    await tx`insert into public.sec_event_source_profiles(profile_id,fingerprint,contract_version,provider_id,dataset_id,dataset_version,endpoint_profile,hostname_allowlist,path_template,method,supported_forms,authentication_kind,accepted_content_encoding,request_identity_policy,max_timeout_ms,max_response_bytes,max_package_documents,material) values(${descriptor.profileId},${profileFingerprint},${descriptor.contractVersion},${descriptor.providerId},${descriptor.datasetId},${descriptor.datasetVersion},${descriptor.endpointProfile},${tx.json(profileMaterial.hostnameAllowlist)},${descriptor.pathTemplate},${descriptor.method},${tx.json(profileMaterial.supportedForms)},${profileMaterial.authenticationKind},${tx.json(profileMaterial.acceptedContentEncoding)},${descriptor.requestIdentityPolicy},${profileMaterial.maxTimeoutMs},${profileMaterial.maxResponseBytes},${profileMaterial.maxPackageDocuments},${tx.json(profileMaterial)})`;
    await tx`insert into public.sec_event_filing_identities(filing_identity_id,profile_id,profile_fingerprint,cik,accession_number,form,amendment_parent_filing_identity_id,material) values(${filingIdentityId},${profileId},${profileFingerprint},${batch.material.cik},${batch.material.accession},${batch.material.form},null,${tx.json(filingMaterial)})`;
  });
  return {profileId,profileFingerprint,filingIdentityId};
}
async function artifactConflictSnapshot(sql:ReturnType<typeof connect>,artifactId:string){
  const rows=await sql`select a.*,f.profile_id,f.profile_fingerprint from public.sec_event_document_artifacts a join public.sec_event_filing_identities f using(filing_identity_id) where a.artifact_id=${artifactId}`;
  expect(rows).toHaveLength(1);return rows[0]!;
}
function artifactWriteDocument(d:RuntimeDoc):SecDocumentArtifactWrite["document"]{
  return {artifactId:d.artifactId,fingerprint:d.fingerprint,blobId:d.blobId,sha256:d.sha256,byteLength:d.byteLength,locator:d.locator,role:d.role,documentType:d.documentType,sequence:d.sequence,contentType:d.contentType,canonicalizationVersion:d.canonicalizationVersion};
}
async function insertPackageCandidate(tx:Tx,batch:RuntimeBatch,options:Readonly<{name:string;docs?:readonly RuntimeDoc[];declaredCount?:number;memberCount?:number;ordinals?:readonly number[];idempotent?:boolean}>){
  const docs=options.docs??batch.documents;const index=batch.documents.find(d=>d.role==="FILING_INDEX")!;const packageMaterial={...batch.packageMaterial,testCase:options.name,orderedDocumentMemberSet:docs.map(d=>({artifactId:d.artifactId,artifactFingerprint:d.fingerprint,canonicalLocator:d.locator,documentRole:d.role,documentType:d.documentType,sequenceOrdinal:d.sequence,sha256:d.sha256,byteLength:d.byteLength})),memberCount:options.memberCount??docs.length,declaredDocumentCount:options.declaredCount??docs.filter(d=>d.role!=="FILING_INDEX").length};const fingerprint=canonicalSha256(packageMaterial);const packageId=createHash("sha256").update("sec-event-package-id/v1:","utf8").update(batch.filingIdentityId,"utf8").update(":","utf8").update(fingerprint,"utf8").digest("hex");
  const insertParent=options.idempotent?tx`insert into public.sec_event_filing_packages(package_id,fingerprint,filing_identity_id,filing_date,acceptance_at,report_period,filing_index_artifact_id,filing_index_artifact_fingerprint,member_count,declared_document_count,material) values(${packageId},${fingerprint},${batch.filingIdentityId},${batch.material.filingDate},${batch.material.acceptanceAt},${batch.material.reportPeriod},${index.artifactId},${index.fingerprint},${options.memberCount??docs.length},${options.declaredCount??docs.filter(d=>d.role!=="FILING_INDEX").length},${tx.json(packageMaterial)}) on conflict do nothing`:tx`insert into public.sec_event_filing_packages(package_id,fingerprint,filing_identity_id,filing_date,acceptance_at,report_period,filing_index_artifact_id,filing_index_artifact_fingerprint,member_count,declared_document_count,material) values(${packageId},${fingerprint},${batch.filingIdentityId},${batch.material.filingDate},${batch.material.acceptanceAt},${batch.material.reportPeriod},${index.artifactId},${index.fingerprint},${options.memberCount??docs.length},${options.declaredCount??docs.filter(d=>d.role!=="FILING_INDEX").length},${tx.json(packageMaterial)})`;await insertParent;
  for(let i=0;i<docs.length;i++){const doc=docs[i]!;const ordinal=options.ordinals?.[i]??i;const material={packageId,packageFingerprint:fingerprint,ordinal,artifactId:doc.artifactId,fingerprint:doc.fingerprint,role:doc.role,documentType:doc.documentType,sequence:doc.sequence,locator:doc.locator,isPrimary:doc.role==="PRIMARY_DOCUMENT"};if(options.idempotent)await tx`insert into public.sec_event_package_document_members(package_id,package_fingerprint,filing_identity_id,member_ordinal,artifact_id,artifact_fingerprint,document_role,document_type,sequence_ordinal,canonical_locator,is_primary,material) values(${packageId},${fingerprint},${batch.filingIdentityId},${ordinal},${doc.artifactId},${doc.fingerprint},${doc.role},${doc.documentType},${doc.sequence},${doc.locator},${doc.role==="PRIMARY_DOCUMENT"},${tx.json(material)}) on conflict do nothing`;else await tx`insert into public.sec_event_package_document_members(package_id,package_fingerprint,filing_identity_id,member_ordinal,artifact_id,artifact_fingerprint,document_role,document_type,sequence_ordinal,canonical_locator,is_primary,material) values(${packageId},${fingerprint},${batch.filingIdentityId},${ordinal},${doc.artifactId},${doc.fingerprint},${doc.role},${doc.documentType},${doc.sequence},${doc.locator},${doc.role==="PRIMARY_DOCUMENT"},${tx.json(material)})`;}
  return {packageId,fingerprint};
}
async function insertLineageCandidate(tx:Tx,batch:RuntimeBatch,options:Readonly<{name:string;docs:readonly RuntimeDoc[];profileId?:string;profileFingerprint?:string;rootFilingIdentityId?:string;amendmentParentChain?:readonly string[];memberCount?:number;ordinals?:readonly number[];idempotent?:boolean}>){
  const profileId=options.profileId??batch.material.profileId;const profileFingerprint=options.profileFingerprint??batch.profileFingerprint;const memberCount=options.memberCount??options.docs.length;const refs=options.docs.map(d=>({packageId:batch.packageId,packageFingerprint:batch.packageFingerprint,packageMemberOrdinal:d.sequence,artifactId:d.artifactId,artifactFingerprint:d.fingerprint}));const lineageId=canonicalSha256({sourceProfileId:profileId,orderedPackageDocumentMemberReferences:refs,memberCount});const rootFilingIdentityId=options.rootFilingIdentityId??batch.amendmentParentFilingIdentityId??batch.filingIdentityId;const amendmentParentChain=options.amendmentParentChain??(batch.amendmentParentFilingIdentityId?[batch.amendmentParentFilingIdentityId,batch.filingIdentityId]:[batch.filingIdentityId]);const material={lineageId,sourceProfileId:profileId,sourceProfileFingerprint:profileFingerprint,orderedPackageDocumentMemberSet:refs,memberCount,rootFilingIdentityId,amendmentParentChain};const fingerprint=canonicalSha256({lineageId,sourceProfileId:profileId,sourceProfileFingerprint:profileFingerprint,orderedPackageDocumentMemberSet:refs,memberCount,rootFilingIdentityId,amendmentParentChain});
  if(options.idempotent)await tx`insert into public.sec_event_source_lineages(lineage_id,fingerprint,profile_id,profile_fingerprint,member_count,member_set_fingerprint,material) values(${lineageId},${fingerprint},${profileId},${profileFingerprint},${memberCount},${fingerprint},${tx.json(material)}) on conflict do nothing`;else await tx`insert into public.sec_event_source_lineages(lineage_id,fingerprint,profile_id,profile_fingerprint,member_count,member_set_fingerprint,material) values(${lineageId},${fingerprint},${profileId},${profileFingerprint},${memberCount},${fingerprint},${tx.json(material)})`;
  for(let i=0;i<options.docs.length;i++){const d=options.docs[i]!;const ordinal=options.ordinals?.[i]??i;const m={lineageId,ordinal,packageId:batch.packageId,packageFingerprint:batch.packageFingerprint,packageMemberOrdinal:d.sequence,artifactId:d.artifactId,artifactFingerprint:d.fingerprint};if(options.idempotent)await tx`insert into public.sec_event_source_lineage_members(lineage_id,member_ordinal,package_id,package_fingerprint,package_member_ordinal,artifact_id,artifact_fingerprint,material) values(${lineageId},${ordinal},${batch.packageId},${batch.packageFingerprint},${d.sequence},${d.artifactId},${d.fingerprint},${tx.json(m)}) on conflict do nothing`;else await tx`insert into public.sec_event_source_lineage_members(lineage_id,member_ordinal,package_id,package_fingerprint,package_member_ordinal,artifact_id,artifact_fingerprint,material) values(${lineageId},${ordinal},${batch.packageId},${batch.packageFingerprint},${d.sequence},${d.artifactId},${d.fingerprint},${tx.json(m)})`;}
  return {lineageId,fingerprint};
}

describe("SEC EDGAR provenance PostgreSQL runtime",()=>{
  const sql=connect();afterAll(async()=>sql.end({timeout:5}));
  it("review: serializes concurrently arriving parent/child packages at deferred chronology validation",async()=>{
    await persistSyntheticSecEdgarFixtureProvenance(fixture(0),url!);
    const parent=artifactConflictBatch(adaptSecEdgarFixtureToEntityBytes(fixture(0))!,"review-package-race-parent");
    const seed=artifactConflictBatch(parent.material,"review-package-race-child");
    const child=createSecRuntimeBatch({...seed.material,form:"8-K/A",amendmentParent:parent.material.accession,filingDate:"2000-01-01",acceptanceAt:"2000-01-01T12:00:00.000Z"});
    await sql.begin(async tx=>{for(const batch of [parent,child]){const m=batch.material;await tx`insert into public.sec_event_filing_identities(filing_identity_id,profile_id,profile_fingerprint,cik,accession_number,form,amendment_parent_filing_identity_id,material) values(${batch.filingIdentityId},${m.profileId},${batch.profileFingerprint},${m.cik},${m.accession},${m.form},${batch.amendmentParentFilingIdentityId},${tx.json({sourceProfileId:m.profileId,sourceProfileFingerprint:batch.profileFingerprint,cik:m.cik,accessionNumber:m.accession,form:m.form})})`;}});
    const before=await counts(sql);let arrived=0;let release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});
    const observe=async(phase:string)=>{if(phase==="BEFORE_COMMIT"){arrived++;if(arrived===2)release();await barrier;}};
    const a=createSecEventProvenanceUnitOfWork(url!),b=createSecEventProvenanceUnitOfWork(url!);
    try{
      const outcomes=await Promise.allSettled([a.persist(parent,observe),b.persist(child,observe)]);
      expect(arrived).toBe(2);expect(outcomes.filter(x=>x.status==="fulfilled")).toHaveLength(1);
      const failure=outcomes.find(x=>x.status==="rejected");if(failure?.status!=="rejected")throw new Error("SEC_TEST_EXPECTED_CHRONOLOGY_FAILURE");
      expect(failure.reason.code).toBe("23514");expect(failure.reason.message).toBe("SEC_EVENT_AMENDMENT_CHRONOLOGY_INVALID");expect(failure.reason.where).toContain("sec_event_assert_amendment_parent");
      const fresh=connect();try{const after=await counts(fresh);const delta:Record<string,number>={sec_event_source_profiles:0,sec_event_filing_identities:0,sec_event_acquisition_requests:1,sec_event_acquisition_attempts:1,sec_event_content_blobs:1,sec_event_document_artifacts:3,sec_event_filing_packages:1,sec_event_package_document_members:3,sec_event_acquisition_receipts:1,sec_event_source_lineages:1,sec_event_source_lineage_members:3};expect(after).toEqual(Object.fromEntries(tableNames.map(table=>[table,before[table]!+delta[table]!])));console.info("SEC_REVIEW_COUNTS",JSON.stringify({case:"concurrent amendment packages",before,after,sqlState:failure.reason.code,stage:"COMMIT",functionName:"sec_event_assert_amendment_parent",fulfilled:1,rejected:1}));}finally{await fresh.end({timeout:5});}
    }finally{await Promise.all([a.close(),b.close()]);}
  });
  it.each(["root","chain"])("review: rejects contradictory lineage amendment %s context",async dimension=>{
    const batch=artifactConflictBatch(adaptSecEdgarFixtureToEntityBytes(fixture(0))!,`review-lineage-${dimension}`);
    const uow=createSecEventProvenanceUnitOfWork(url!);try{await uow.persist(batch);}finally{await uow.close();}
    await expectDeferredDbFailure(`review lineage ${dimension} context`,"23514","SEC_EVENT_LINEAGE_CONTEXT_INVALID","sec_event_assert_lineage_seal",tx=>insertLineageCandidate(tx,batch,{name:caseId(`lineage-${dimension}`),docs:[batch.documents[1]!],...(dimension==="root"?{rootFilingIdentityId:caseId("wrong-root")}:{amendmentParentChain:[caseId("wrong-chain")]})}));
  });
  it("review: serializes a new identical receipt on an already committed request",async()=>{
    const baseline=artifactConflictBatch(adaptSecEdgarFixtureToEntityBytes(fixture(0))!,"review-receipt-race");
    const baselineUow=createSecEventProvenanceUnitOfWork(url!);try{await baselineUow.persist(baseline);}finally{await baselineUow.close();}
    const batch=createSecRuntimeBatch({...baseline.material,receipt:{...baseline.material.receipt,receivedAt:"2026-10-06T12:00:00.000Z"}});
    const before=await counts(sql);const left=connect(),right=connect();let releaseLeft!:()=>void;let leftArrived!:()=>void;let leftCommitted!:()=>void;
    const leftGate=new Promise<void>(resolve=>{releaseLeft=resolve;});const arrival=new Promise<void>(resolve=>{leftArrived=resolve;});const committed=new Promise<void>(resolve=>{leftCommitted=resolve;});
    const first=left.begin(async tx=>persistSecEventProvenance(tx as never,batch,async phase=>{if(phase==="REQUEST"){leftArrived();await leftGate;}}));
    void first.then(()=>leftCommitted(),()=>leftCommitted());
    try{
      await arrival;
      const second=right.begin(async tx=>{
        const ordered=new Proxy(tx,{apply:async(target,thisArg,args)=>{
          const query=(args[0] as TemplateStringsArray).join("?");
          if(query.startsWith("select fingerprint,idempotency_key")&&query.includes("for update"))releaseLeft();
          const rows=await Reflect.apply(target,thisArg,args);
          if(query.startsWith("select attempt_ordinal from")){releaseLeft();await committed;}
          return rows;
        }});
        return persistSecEventProvenance(ordered as never,batch);
      });
      const results=await Promise.all([first,second]);expect(results[0]).toEqual(results[1]);
      const fresh=connect();try{const after=await counts(fresh);const expected={...before,sec_event_acquisition_attempts:before.sec_event_acquisition_attempts!+1,sec_event_acquisition_receipts:before.sec_event_acquisition_receipts!+1};expect(after).toEqual(expected);console.info("SEC_REVIEW_COUNTS",JSON.stringify({case:"new identical receipt race",before,after,results}));}finally{await fresh.end({timeout:5});}
    }finally{releaseLeft();await first.catch(()=>{});await Promise.all([left.end({timeout:5}),right.end({timeout:5})]);}
  });
  it("review: rejects a late amendment package after filing identities were already committed",async()=>{
    const parent=artifactConflictBatch(adaptSecEdgarFixtureToEntityBytes(fixture(0))!,"review-late-parent");
    const uow=createSecEventProvenanceUnitOfWork(url!);try{await uow.persist(parent);}finally{await uow.close();}
    const seed=artifactConflictBatch(parent.material,"review-late-child");
    const child=createSecRuntimeBatch({...seed.material,form:"8-K/A",amendmentParent:parent.material.accession,filingDate:"2000-01-01",acceptanceAt:"2000-01-01T12:00:00.000Z"});
    const material={sourceProfileId:child.material.profileId,sourceProfileFingerprint:child.profileFingerprint,cik:child.material.cik,accessionNumber:child.material.accession,form:child.material.form};
    await sql.begin(async tx=>{await tx`insert into public.sec_event_filing_identities(filing_identity_id,profile_id,profile_fingerprint,cik,accession_number,form,amendment_parent_filing_identity_id,material) values(${child.filingIdentityId},${child.material.profileId},${child.profileFingerprint},${child.material.cik},${child.material.accession},${child.material.form},${parent.filingIdentityId},${tx.json(material)})`;});
    await expectDeferredDbFailure("review late amendment package","23514","SEC_EVENT_AMENDMENT_CHRONOLOGY_INVALID","sec_event_assert_amendment_parent",tx=>persistSecEventProvenance(tx as never,child));
  });
  it("review: rejects a copied member document type that contradicts its immutable artifact",async()=>{
    const batch=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(fixture(0))!);await persistSyntheticSecEdgarFixtureProvenance(fixture(0),url!);
    const docs=batch.documents.map((d,i)=>i===1?{...d,documentType:"CONTRADICTING-TYPE"}:d);
    await expectDeferredDbFailure("review member document type","23514","SEC_EVENT_PACKAGE_UNSEALED","sec_event_assert_package_seal",tx=>insertPackageCandidate(tx,batch,{name:caseId("review-member-type"),docs}));
  });
  it("review: rejects a two-row INSERT amendment cycle without bypassing any constraint",async()=>{
    const profile=`sec-review-cycle-${caseId("profile")}/v1`;const a=caseId("cycle-a"),b=caseId("cycle-b");
    await expectDeferredDbFailure("review multi-row cycle","23514","SEC_EVENT_AMENDMENT_CYCLE","sec_event_assert_amendment_parent",async tx=>{
      await insertTestProfile(tx,profile);
      await tx`insert into public.sec_event_filing_identities(filing_identity_id,profile_id,profile_fingerprint,cik,accession_number,form,amendment_parent_filing_identity_id,material) values(${a},${profile},${"a".repeat(64)},'SYNTH-CIK-0001',${`SYNTH-ACC-${a}`},'8-K/A',${b},${tx.json({case:"cycle-a"})}),(${b},${profile},${"a".repeat(64)},'SYNTH-CIK-0001',${`SYNTH-ACC-${b}`},'8-K/A',${a},${tx.json({case:"cycle-b"})})`;
    });
  });
  it.each([
    {name:"provider",field:"provider_id",value:"CONFLICTING_PROVIDER"},
    {name:"endpoint profile",field:"endpoint_profile",value:"CONFLICTING_ENDPOINT"},
    {name:"contract version",field:"contract_version",value:"conflicting/v2"},
  ])("rejects same source-profile ID with changed $name by authoritative reread",async conflict=>{
    const result=fixture(0);expect(result.status).toBe("VALID");if(result.status!=="VALID")return;
    const batch=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(result)!);await persistSyntheticSecEdgarFixtureProvenance(result,url!);const before=await counts(sql);let calls=0;let caught:Error|undefined;
    try{await sql.begin(async tx=>{await tx`alter table public.sec_event_source_profiles disable trigger sec_event_source_profiles_immutable`;await tx`update public.sec_event_source_profiles set ${tx(conflict.field)}=${conflict.value} where profile_id=${batch.material.profileId}`;calls++;await persistSecEventProvenance(tx as never,batch);});}catch(error){caught=error as Error;}
    expect(caught?.message).toBe("SEC_EVENT_SOURCE_PROFILE_AUTHORITY_CONFLICT");expect(calls).toBe(1);expect(caught?.message).not.toMatch(/ITEM\||SYNTHETIC FIXTURE|agreement\.txt/);const fresh=connect();try{const after=await counts(fresh);expect(after).toEqual(before);console.info("SEC_RUNTIME_DOMAIN_COUNTS",JSON.stringify({case:conflict.name,stage:"AUTHORITATIVE_REREAD",domainError:caught?.message,before,after,rollback:true}));}finally{await fresh.end({timeout:5});}
  });
  it.each([
    {name:"CIK",field:"cik",value:"SYNTH-CIK-9999"},
    {name:"accession",field:"accession_number",value:"SYNTH-ACC-CHANGED-0001"},
    {name:"form",field:"form",value:"8-K/A"},
  ])("rejects same filing identity with changed $name during authoritative reread",async conflict=>{
    const result=fixture(1);expect(result.status).toBe("VALID");if(result.status!=="VALID")return;const batch=artifactConflictBatch(adaptSecEdgarFixtureToEntityBytes(result)!,`filing-conflict-${conflict.name}`);await persistSyntheticSecEdgarFixtureProvenance(fixture(0),url!);const before=await counts(sql);let caught:Error|undefined;
    try{await sql.begin(async tx=>{await tx`alter table public.sec_event_filing_identities disable trigger sec_event_filing_identities_immutable`;const filingMaterial={sourceProfileId:batch.material.profileId,sourceProfileFingerprint:batch.profileFingerprint,cik:batch.material.cik,accessionNumber:batch.material.accession,form:batch.material.form};await tx`insert into public.sec_event_filing_identities(filing_identity_id,profile_id,profile_fingerprint,cik,accession_number,form,amendment_parent_filing_identity_id,material) values(${batch.filingIdentityId},${batch.material.profileId},${batch.profileFingerprint},${batch.material.cik},${batch.material.accession},${batch.material.form},null,${tx.json(filingMaterial)})`;await tx`update public.sec_event_filing_identities set ${tx(conflict.field)}=${conflict.value} where filing_identity_id=${batch.filingIdentityId}`;await persistSecEventProvenance(tx as never,batch);});}catch(error){caught=error as Error;}
    expect(caught?.message).toBe("SEC_EVENT_FILING_IDENTITY_AUTHORITY_CONFLICT");expect(caught?.message).not.toMatch(/ITEM\||SYNTHETIC FIXTURE|agreement\.txt/);const fresh=connect();try{const after=await counts(fresh);expect(after).toEqual(before);console.info("SEC_RUNTIME_DOMAIN_COUNTS",JSON.stringify({case:conflict.name,stage:"AUTHORITATIVE_REREAD",domainError:caught?.message,before,after,rollback:true}));}finally{await fresh.end({timeout:5});}
  });
  it("commits, replays, appends receipt and rolls back verified bytes",async()=>{
    const version=await sql`show server_version`;expect(String(version[0]?.server_version)).toMatch(/^17\./);
    const before=await counts(sql);
    const result=fixture(0);expect(result.status).toBe("VALID");if(result.status!=="VALID")return;
    const persisted=await persistSyntheticSecEdgarFixtureProvenance(result,url!);expect(persisted?.status).toBe("PERSISTED_VERIFIED");expect(persisted?.documentCount).toBeGreaterThanOrEqual(2);expect(persisted?.memberCount).toBe(persisted!.documentCount+1);
    expect(JSON.stringify(persisted)).not.toMatch(/ITEM\||DEFINITIVE_PURCHASE|SYNTHETIC FIXTURE|agreement\.txt/);
    const first=await counts(sql);expect(first.sec_event_content_blobs).toBeGreaterThanOrEqual(before.sec_event_content_blobs);expect(first.sec_event_document_artifacts).toBeGreaterThanOrEqual(before.sec_event_document_artifacts);
    const positiveBatch=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(result)!);const persistedScope=await sql`select (select count(*)::int from public.sec_event_filing_identities where filing_identity_id=${positiveBatch.filingIdentityId}) as filing,(select count(*)::int from public.sec_event_acquisition_requests where request_id=${positiveBatch.requestId}) as requests,(select count(*)::int from public.sec_event_acquisition_attempts where attempt_id=${positiveBatch.attemptId}) as attempts,(select count(*)::int from public.sec_event_content_blobs where blob_id in ${sql(positiveBatch.documents.map(d=>d.blobId))}) as blobs,(select count(*)::int from public.sec_event_document_artifacts where artifact_id in ${sql(positiveBatch.documents.map(d=>d.artifactId))}) as artifacts,(select count(*)::int from public.sec_event_filing_packages where package_id=${positiveBatch.packageId}) as packages,(select count(*)::int from public.sec_event_package_document_members where package_id=${positiveBatch.packageId}) as members,(select count(*)::int from public.sec_event_acquisition_receipts where receipt_id=${positiveBatch.receiptId}) as receipts,(select count(*)::int from public.sec_event_source_lineages where lineage_id=${positiveBatch.lineageId}) as lineages,(select count(*)::int from public.sec_event_source_lineage_members where lineage_id=${positiveBatch.lineageId}) as lineage_members`;
    expect(Object.values(persistedScope[0]!).map(Number)).toEqual([1,1,1,3,3,1,3,1,1,3]);
    const replay=await persistSyntheticSecEdgarFixtureProvenance(result,url!);expect(replay).toEqual(persisted);expect(await counts(sql)).toEqual(first);
    const later=await persistSyntheticSecEdgarFixtureProvenance(result,url!,{receivedAt:"2026-10-04T12:00:00.000Z",effectiveAvailableAt:"2026-10-03T12:00:00.000Z"});expect(later?.profileId).toBe(persisted?.profileId);expect(later?.filingIdentityId).toBe(persisted?.filingIdentityId);expect(later?.packageId).toBe(persisted?.packageId);expect(later?.packageFingerprint).toBe(persisted?.packageFingerprint);expect(later?.receiptId).not.toBe(persisted?.receiptId);expect(later?.lineageId).toBe(persisted?.lineageId);
    const laterBatch=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(result,{receivedAt:"2026-10-04T12:00:00.000Z",effectiveAvailableAt:"2026-10-03T12:00:00.000Z"})!);expect(laterBatch.documents.map(d=>d.blobId)).toEqual(positiveBatch.documents.map(d=>d.blobId));expect(laterBatch.documents.map(d=>d.artifactId)).toEqual(positiveBatch.documents.map(d=>d.artifactId));expect(laterBatch.packageId).toBe(positiveBatch.packageId);expect(laterBatch.lineageId).toBe(positiveBatch.lineageId);expect(laterBatch.attemptId).not.toBe(positiveBatch.attemptId);
    const variant=await counts(sql);console.info("SEC_RUNTIME_FOUNDATION_COUNTS",JSON.stringify({before,first,replay:first,receiptVariant:variant,scopedCounts:persistedScope[0]}));expect(variant.sec_event_acquisition_requests).toBe(first.sec_event_acquisition_requests);expect(variant.sec_event_content_blobs).toBe(first.sec_event_content_blobs);expect(variant.sec_event_document_artifacts).toBe(first.sec_event_document_artifacts);expect(variant.sec_event_filing_packages).toBe(first.sec_event_filing_packages);expect(variant.sec_event_package_document_members).toBe(first.sec_event_package_document_members);expect(variant.sec_event_acquisition_receipts).toBeGreaterThanOrEqual(first.sec_event_acquisition_receipts);expect(variant.sec_event_source_lineages).toBe(first.sec_event_source_lineages);
    for(const code of ["SEC_EVENT_PACKAGE_TIMEOUT","SEC_EVENT_REQUEST_CANCELLED"]){const sentinel=new Error(code);await expect(persistSyntheticSecEdgarFixtureProvenance(result,"postgresql://invalid",undefined,{assertCanStartTransaction(){throw sentinel;}})).rejects.toBe(sentinel);}expect(await counts(sql)).toEqual(variant);
    const copied=structuredClone(result) as unknown as {filings?:{filing?:{accession?:string}}[]};if(copied.filings?.[0]?.filing)copied.filings[0].filing.accession="SYNTH-ACC-FABRICATED-9999";
    for(const untrusted of [{...result},structuredClone(result),JSON.parse(JSON.stringify(result)),copied,{status:"VALID",claims:[],fixtureId:"fabricated"},{...result,sourceProfile:"wrong-profile"}])expect(await persistSyntheticSecEdgarFixtureProvenance(untrusted,"postgresql://invalid")).toBeNull();
    expect(await counts(sql)).toEqual(variant);
    const rollbackResult=fixture(1);expect(rollbackResult.status).toBe("VALID");if(rollbackResult.status!=="VALID")return;
    const original=adaptSecEdgarFixtureToEntityBytes(rollbackResult)!;const accession=`SYNTH-ACC-RB-${caseId("foundation-rollback").slice(0,16).toUpperCase()}`;const batch=createSecRuntimeBatch({...original,accession,documents:original.documents.map(d=>({...d,locator:d.locator.replace(original.accession,accession),bytes:Buffer.concat([d.bytes,Buffer.from(caseId("foundation-rollback"))])}))});
    const corrupt=batch.documents[0]!;const altered=corrupt.bytes;altered[0]^=1;const corruptMaterial={blobId:corrupt.blobId,sha256:corrupt.sha256,byteLength:corrupt.byteLength,contractVersion:"sec-event-document-byte-storage-decision/v1",readbackVerified:true,retentionClassification:"NOT_APPROVED",deletionLegalHoldStatus:"NOT_APPROVED"};
    const corruptBefore=await counts(sql);let mismatch:Error|undefined;
    try{await sql.begin(async tx=>{await tx`insert into public.sec_event_content_blobs(blob_id,sha256,byte_length,storage_contract_version,entity_body,readback_verified,retention_classification,deletion_legal_hold_status,material) values(${corrupt.blobId},${corrupt.sha256},${corrupt.byteLength},'sec-event-document-byte-storage-decision/v1',${altered},true,'NOT_APPROVED','NOT_APPROVED',${tx.json(corruptMaterial)})`;return persistSecEventProvenance(tx as never,batch);});}catch(error){mismatch=error as Error;}
    expect(mismatch?.message).toBe("SEC_EVENT_BLOB_READBACK_MISMATCH");expect(mismatch?.message).not.toMatch(/ITEM\||SYNTHETIC FIXTURE|agreement\.txt|[A-Za-z0-9+/]{80,}/);const mismatchCheck=connect();try{const after=await counts(mismatchCheck);expect(after).toEqual(corruptBefore);console.info("SEC_RUNTIME_G_COUNTS",JSON.stringify({case:"corrupt logical blob readback",stage:"AUTHORITATIVE_REREAD",domainError:mismatch?.message,before:corruptBefore,after,rollback:true}));}finally{await mismatchCheck.end({timeout:5});}
    for(const phase of ["BLOB_VERIFIED","DOCUMENT_ARTIFACTS","PACKAGE_MEMBERS","RECEIPT","LINEAGE_MEMBERS"] as const){
      const sentinel=new Error(`rollback-sentinel:${phase}`);const uow=createSecEventProvenanceUnitOfWork(url!);
      try{await expect(uow.persist(batch,current=>{if(current===phase)throw sentinel;})).rejects.toBe(sentinel);}finally{await uow.close();}
      const rollbackIds=await sql`select (select count(*)::int from public.sec_event_filing_identities where filing_identity_id=${batch.filingIdentityId}) as filing,(select count(*)::int from public.sec_event_content_blobs where blob_id in ${sql(batch.documents.map(d=>d.blobId))}) as blobs,(select count(*)::int from public.sec_event_document_artifacts where artifact_id in ${sql(batch.documents.map(d=>d.artifactId))}) as artifacts,(select count(*)::int from public.sec_event_filing_packages where package_id=${batch.packageId}) as packages,(select count(*)::int from public.sec_event_package_document_members where package_id=${batch.packageId}) as members,(select count(*)::int from public.sec_event_acquisition_requests where request_id=${batch.requestId}) as requests,(select count(*)::int from public.sec_event_acquisition_attempts where attempt_id=${batch.attemptId}) as attempts,(select count(*)::int from public.sec_event_acquisition_receipts where receipt_id=${batch.receiptId}) as receipts,(select count(*)::int from public.sec_event_source_lineages where lineage_id=${batch.lineageId}) as lineages,(select count(*)::int from public.sec_event_source_lineage_members where lineage_id=${batch.lineageId}) as lineage_members`;
      expect(Object.values(rollbackIds[0]!).map(Number),phase).toEqual(Array(10).fill(0));
    }
  });
  it("binds an amendment only to an already persisted filing parent",async()=>{
    const result=fixtureSet(0,2);expect(result.status).toBe("VALID");if(result.status!=="VALID")return;
    const persisted=await persistSyntheticSecEdgarFixtureProvenance(result,url!,undefined,undefined,"SYNTH-ACC-AMEND-0001");expect(persisted?.status).toBe("PERSISTED_VERIFIED");
    const amendment=adaptSecEdgarFixtureToEntityBytes(result,undefined,"SYNTH-ACC-AMEND-0001")!;const batch=createSecRuntimeBatch(amendment);expect(batch.amendmentParentFilingIdentityId).not.toBeNull();
    const rows=await sql`select child.form as child_form,child.amendment_parent_filing_identity_id,parent.form as parent_form,parent.cik as parent_cik,child.cik as child_cik,parent.profile_id as parent_profile,child.profile_id as child_profile from public.sec_event_filing_identities child join public.sec_event_filing_identities parent on parent.filing_identity_id=child.amendment_parent_filing_identity_id where child.filing_identity_id=${batch.filingIdentityId}`;
    expect(rows).toHaveLength(1);expect(rows[0]?.child_form).toBe("8-K/A");expect(rows[0]?.parent_form).toBe("8-K");expect(rows[0]?.parent_cik).toBe(rows[0]?.child_cik);expect(rows[0]?.parent_profile).toBe(rows[0]?.child_profile);
  });
  it("proves amendment chronology is deferred until COMMIT without authority reread",async()=>{
    const result=fixture(3);expect(result.status).toBe("VALID");if(result.status!=="VALID")return;
    await persistSyntheticSecEdgarFixtureProvenance(result,url!);
    const sourceBatch=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(result)!);
    const parentAccession=`SYNTH-ACC-CHRON-P-${caseId("chronology-parent-accession").slice(0,8).toUpperCase()}`;
    const childAccession=`SYNTH-ACC-CHRON-C-${caseId("chronology-child-accession").slice(0,8).toUpperCase()}`;
    const parentId=canonicalSha256({sourceProfileId:sourceBatch.material.profileId,sourceProfileFingerprint:sourceBatch.profileFingerprint,cik:sourceBatch.material.cik,accessionNumber:parentAccession,form:"8-K"});
    const childId=canonicalSha256({sourceProfileId:sourceBatch.material.profileId,sourceProfileFingerprint:sourceBatch.profileFingerprint,cik:sourceBatch.material.cik,accessionNumber:childAccession,form:"8-K/A"});
    const writer=connect();const before=await counts(writer);let insertedIdentity=false;let insertedArtifacts=0;let insertedPackage=false;let insertedMembers=0;let failure:PgFailure|undefined;
    try{await writer.begin(async tx=>{
      const parent=await tx`insert into public.sec_event_filing_identities(filing_identity_id,profile_id,profile_fingerprint,cik,accession_number,form,amendment_parent_filing_identity_id,material) values(${parentId},${sourceBatch.material.profileId},${sourceBatch.profileFingerprint},${sourceBatch.material.cik},${parentAccession},'8-K',null,${tx.json({sourceProfileId:sourceBatch.material.profileId,sourceProfileFingerprint:sourceBatch.profileFingerprint,cik:sourceBatch.material.cik,accessionNumber:parentAccession,form:"8-K",amendmentParentFilingIdentityId:null})}) returning filing_identity_id`;
      const child=await tx`insert into public.sec_event_filing_identities(filing_identity_id,profile_id,profile_fingerprint,cik,accession_number,form,amendment_parent_filing_identity_id,material) values(${childId},${sourceBatch.material.profileId},${sourceBatch.profileFingerprint},${sourceBatch.material.cik},${childAccession},'8-K/A',${parentId},${tx.json({sourceProfileId:sourceBatch.material.profileId,sourceProfileFingerprint:sourceBatch.profileFingerprint,cik:sourceBatch.material.cik,accessionNumber:childAccession,form:"8-K/A",amendmentParentFilingIdentityId:parentId})}) returning filing_identity_id`;
      insertedIdentity=parent.length===1&&child.length===1;
      const insertPackage=async(identityId:string,accession:string,filingDate:string)=>{
        const docs=sourceBatch.documents.map(doc=>{const locator=doc.locator.replace(sourceBatch.material.accession,accession);const material={filingIdentityId:identityId,canonicalLocator:locator,documentRole:doc.role,documentType:doc.documentType,exactEntityBodyOctetsSha256:doc.sha256,contentType:doc.contentType,byteLength:doc.byteLength,sequenceOrdinal:doc.sequence,canonicalizationVersion:doc.canonicalizationVersion,noContentNormalization:true};const fingerprint=canonicalSha256(material);const artifactId=createHash("sha256").update("sec-event-document-id/v1:","utf8").update(fingerprint,"utf8").digest("hex");return {...doc,locator,artifactId,fingerprint,material};});
        for(const doc of docs)await tx`insert into public.sec_event_document_artifacts(artifact_id,fingerprint,filing_identity_id,blob_id,content_sha256,byte_length,document_role,document_type,sequence_ordinal,canonical_locator,content_type,canonicalization_version,material) values(${doc.artifactId},${doc.fingerprint},${identityId},${doc.blobId},${doc.sha256},${doc.byteLength},${doc.role},${doc.documentType},${doc.sequence},${doc.locator},${doc.contentType},${doc.canonicalizationVersion},${tx.json(doc.material)})`;
        const index=docs.find(doc=>doc.role==="FILING_INDEX")!;const packageMaterial={sourceProfileId:sourceBatch.material.profileId,sourceProfileFingerprint:sourceBatch.profileFingerprint,filingIdentityId:identityId,cik:sourceBatch.material.cik,accessionNumber:accession,form:identityId===parentId?"8-K":"8-K/A",filingDate,acceptanceTimestamp:null,reportPeriodDate:sourceBatch.material.reportPeriod,filingIndexArtifactId:index.artifactId,filingIndexArtifactFingerprint:index.fingerprint,orderedDocumentMemberSet:docs.map(doc=>({artifactId:doc.artifactId,artifactFingerprint:doc.fingerprint,canonicalLocator:doc.locator,documentRole:doc.role,documentType:doc.documentType,sequenceOrdinal:doc.sequence,sha256:doc.sha256,byteLength:doc.byteLength})),memberCount:docs.length,declaredDocumentCount:docs.length-1,amendmentParentFilingIdentityId:identityId===parentId?null:parentId};const packageFingerprint=canonicalSha256(packageMaterial);const packageId=createHash("sha256").update("sec-event-package-id/v1:","utf8").update(identityId,"utf8").update(":","utf8").update(packageFingerprint,"utf8").digest("hex");
        await tx`insert into public.sec_event_filing_packages(package_id,fingerprint,filing_identity_id,filing_date,acceptance_at,report_period,filing_index_artifact_id,filing_index_artifact_fingerprint,member_count,declared_document_count,material) values(${packageId},${packageFingerprint},${identityId},${filingDate},null,${sourceBatch.material.reportPeriod},${index.artifactId},${index.fingerprint},${docs.length},${docs.length-1},${tx.json(packageMaterial)}) returning package_id`;
        for(let ordinal=0;ordinal<docs.length;ordinal++){const doc=docs[ordinal]!;await tx`insert into public.sec_event_package_document_members(package_id,package_fingerprint,filing_identity_id,member_ordinal,artifact_id,artifact_fingerprint,document_role,document_type,sequence_ordinal,canonical_locator,is_primary,material) values(${packageId},${packageFingerprint},${identityId},${ordinal},${doc.artifactId},${doc.fingerprint},${doc.role},${doc.documentType},${doc.sequence},${doc.locator},${doc.role==="PRIMARY_DOCUMENT"},${tx.json({artifactId:doc.artifactId,documentRole:doc.role,documentType:doc.documentType,sequenceOrdinal:doc.sequence,canonicalLocator:doc.locator,isPrimary:doc.role==="PRIMARY_DOCUMENT"})})`;}
        return docs.length;
      };
      const parentDocs=await insertPackage(parentId,parentAccession,sourceBatch.material.filingDate);insertedArtifacts+=parentDocs;insertedPackage=true;insertedMembers+=parentDocs;
      const childDocs=await insertPackage(childId,childAccession,"2000-01-01");insertedArtifacts+=childDocs;insertedPackage=true;insertedMembers+=childDocs;
    });}catch(error){failure=error as PgFailure;}finally{await writer.end({timeout:5});}
    expect(insertedIdentity).toBe(true);expect(insertedArtifacts).toBe(sourceBatch.documents.length*2);expect(insertedPackage).toBe(true);expect(insertedMembers).toBe(sourceBatch.documents.length*2);
    expect(failure?.code).toBe("23514");expect(failure?.message).toContain("SEC_EVENT_AMENDMENT_CHRONOLOGY_INVALID");expect(failure?.where).toContain("sec_event_assert_amendment_parent");
    const verify=connect();try{const after=await counts(verify);expect(after).toEqual(before);console.info("SEC_EVENT_AMENDMENT_CHRONOLOGY_DEFERRED_COUNTS",JSON.stringify({before,after,insertedIdentity,insertedArtifacts,insertedPackage,insertedMembers,sqlState:failure?.code,where:failure?.where}));}finally{await verify.end({timeout:5});}
  });
  it("rejects a second amendment child as a filing-parent fork",async()=>{
    const result=fixtureSet(0,2);expect(result.status).toBe("VALID");if(result.status!=="VALID")return;const amended=adaptSecEdgarFixtureToEntityBytes(result,undefined,"SYNTH-ACC-AMEND-0001")!;const batch=createSecRuntimeBatch(amended);await persistSyntheticSecEdgarFixtureProvenance(result,url!,undefined,undefined,"SYNTH-ACC-AMEND-0001");const childId=`sec-edgar-truth-${caseId("amendment-fork-child")}`;
    await expectDbFailure("amendment fork", "23505", "sec_event_filing_identities_amendment_parent_filing_identit_key", tx=>tx`insert into public.sec_event_filing_identities(filing_identity_id,profile_id,profile_fingerprint,cik,accession_number,form,amendment_parent_filing_identity_id,material) values(${childId},${batch.material.profileId},${batch.profileFingerprint},${batch.material.cik},${`SYNTH-ACC-${caseId("fork-accession").slice(0,20)}`},'8-K/A',${batch.amendmentParentFilingIdentityId},${tx.json({caseId:caseId("amendment-fork-child")})})`);
  });
  it("serializes concurrent identical and conflicting writers with two connections",async()=>{
    const fixtureResult=fixture(3);expect(fixtureResult.status).toBe("VALID");if(fixtureResult.status!=="VALID")return;
    const material=adaptSecEdgarFixtureToEntityBytes(fixtureResult)!;const batch=createSecRuntimeBatch(material);
    let arrived=0;let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const barrier=async(phase:string)=>{if(phase!=="TRANSACTION_STARTED")return;arrived++;if(arrived===2)release();await gate;};
    const firstUow=createSecEventProvenanceUnitOfWork(url!);const secondUow=createSecEventProvenanceUnitOfWork(url!);
    try{const [a,b]=await Promise.all([firstUow.persist(batch,barrier),secondUow.persist(batch,barrier)]);expect(a).toEqual(b);expect(a.status).toBe("PERSISTED_VERIFIED");}finally{await Promise.all([firstUow.close(),secondUow.close()]);}
    const packageRows=await sql`select count(*)::int as packages from public.sec_event_filing_packages where package_id=${batch.packageId}`;const memberRows=await sql`select count(*)::int as members from public.sec_event_package_document_members where package_id=${batch.packageId}`;expect(Number(packageRows[0]?.packages)).toBe(1);expect(Number(memberRows[0]?.members)).toBe(batch.documents.length);

    const changedDocuments=material.documents.map((document,index)=>index===1?{...document,bytes:Buffer.from([...document.bytes.slice(0,-1),document.bytes.at(-1)!^1])}:document);
    const conflicting=createSecRuntimeBatch({...material,documents:changedDocuments});arrived=0;release=()=>{};const conflictGate=new Promise<void>(resolve=>{release=resolve;});const conflictBarrier=async(phase:string)=>{if(phase!=="TRANSACTION_STARTED")return;arrived++;if(arrived===2)release();await conflictGate;};
    const left=createSecEventProvenanceUnitOfWork(url!);const right=createSecEventProvenanceUnitOfWork(url!);let outcomes:PromiseSettledResult<unknown>[];
    try{outcomes=await Promise.allSettled([left.persist(batch,conflictBarrier),right.persist(conflicting,conflictBarrier)]);}finally{await Promise.all([left.close(),right.close()]);}
    expect(outcomes.filter(o=>o.status==="fulfilled")).toHaveLength(1);expect(outcomes.filter(o=>o.status==="rejected")).toHaveLength(1);
    const authority=await sql`select count(*)::int as count from public.sec_event_document_artifacts where filing_identity_id=${batch.filingIdentityId} and canonical_locator=${batch.documents[1]!.locator}`;expect(Number(authority[0]?.count)).toBe(1);
    const winner=await sql`select count(*)::int as packages from public.sec_event_filing_packages where filing_identity_id=${batch.filingIdentityId}`;expect(Number(winner[0]?.packages)).toBe(1);
  });
  it.each(["blob","locator","document role","source profile","filing identity"])("D: rejects same artifact ID with changed %s at authoritative reread",async dimension=>{
    expect(Object.hasOwn(productionUow,"persistDocumentArtifact")).toBe(false);
    const fixtureResult=fixture(0);expect(fixtureResult.status).toBe("VALID");if(fixtureResult.status!=="VALID")return;
    // Commit the baseline through the real authenticated application -> UoW.
    await persistSyntheticSecEdgarFixtureProvenance(fixtureResult,url!);
    const original=adaptSecEdgarFixtureToEntityBytes(fixtureResult)!;
    const baselineBatch=createSecRuntimeBatch(original);const baselineDoc=baselineBatch.documents[1]!;
    const baselineRow=await artifactConflictSnapshot(sql,baselineDoc.artifactId);
    let naturalDoc=artifactWriteDocument(baselineDoc);
    let scope={filingIdentityId:baselineBatch.filingIdentityId,profileId:original.profileId,profileFingerprint:baselineBatch.profileFingerprint};
    if(dimension==="blob"){
      const parentBatch=artifactConflictBatch(original,"blob-parent",true);
      expect(parentBatch.documents[1]!.bytes.equals(baselineDoc.bytes)).toBe(false);
      const parentUow=createSecEventProvenanceUnitOfWork(url!);try{await parentUow.persist(parentBatch);}finally{await parentUow.close();}
      const documents=original.documents.map((d,i)=>i===1?{...d,bytes:parentBatch.documents[1]!.bytes}:d);
      const natural=createSecRuntimeBatch({...original,documents});expect(isTrustedSecRuntimeBatch(natural)).toBe(true);
      naturalDoc=artifactWriteDocument(natural.documents[1]!);expect(naturalDoc.blobId).not.toBe(baselineDoc.blobId);expect(naturalDoc.sha256).not.toBe(baselineDoc.sha256);
    }else if(dimension==="locator"){
      const documents=original.documents.map((d,i)=>i===1?{...d,locator:`/synthetic-edgar/archive/${original.cik}/${original.accession}/alternate-${caseId("locator")}.txt`}:d);
      const natural=createSecRuntimeBatch({...original,documents});expect(isTrustedSecRuntimeBatch(natural)).toBe(true);naturalDoc=artifactWriteDocument(natural.documents[1]!);
      expect(naturalDoc.blobId).toBe(baselineDoc.blobId);expect(naturalDoc.role).toBe(baselineDoc.role);
    }else if(dimension==="document role"){
      const documents=original.documents.map((d,i)=>i===1?{...d,role:"EXHIBIT" as const,documentType:"EXHIBIT-99.2"}:i===2?{...d,role:"PRIMARY_DOCUMENT" as const,documentType:"PRIMARY_DOCUMENT"}:d);
      const natural=createSecRuntimeBatch({...original,documents});expect(isTrustedSecRuntimeBatch(natural)).toBe(true);naturalDoc=artifactWriteDocument(natural.documents[1]!);
      expect(naturalDoc.role).toBe("EXHIBIT");expect(baselineDoc.role).toBe("PRIMARY_DOCUMENT");expect(naturalDoc.blobId).toBe(baselineDoc.blobId);
    }else if(dimension==="source profile"){
      scope=await artifactConflictProfile(sql,baselineBatch);
      expect(()=>createSecRuntimeBatch({...original,profileId:scope.profileId,profileFingerprint:scope.profileFingerprint})).toThrow("SEC_EVENT_RUNTIME_INPUT_INVALID");
      const material={filingIdentityId:scope.filingIdentityId,canonicalLocator:baselineDoc.locator,documentRole:baselineDoc.role,documentType:baselineDoc.documentType,exactEntityBodyOctetsSha256:baselineDoc.sha256,contentType:baselineDoc.contentType,byteLength:baselineDoc.byteLength,sequenceOrdinal:baselineDoc.sequence,canonicalizationVersion:baselineDoc.canonicalizationVersion,noContentNormalization:true};
      const fingerprint=canonicalSha256(material);naturalDoc={...naturalDoc,fingerprint,artifactId:createHash("sha256").update("sec-event-document-id/v1:").update(fingerprint).digest("hex")};
    }else{
      const natural=artifactConflictBatch(original,"filing-parent");expect(isTrustedSecRuntimeBatch(natural)).toBe(true);
      scope={filingIdentityId:natural.filingIdentityId,profileId:original.profileId,profileFingerprint:baselineBatch.profileFingerprint};naturalDoc=artifactWriteDocument(natural.documents[1]!);
      const filingMaterial={sourceProfileId:scope.profileId,sourceProfileFingerprint:scope.profileFingerprint,cik:natural.material.cik,accessionNumber:natural.material.accession,form:natural.material.form};
      await sql`insert into public.sec_event_filing_identities(filing_identity_id,profile_id,profile_fingerprint,cik,accession_number,form,amendment_parent_filing_identity_id,material) values(${scope.filingIdentityId},${scope.profileId},${scope.profileFingerprint},${natural.material.cik},${natural.material.accession},${natural.material.form},null,${sql.json(filingMaterial)})`;
    }
    // Private compiler access exercises the unchanged identity algorithm.
    // Public construction additionally requires authentic adapter material. Only this test's private
    // persistence record deliberately reuses it; no trusted batch is fabricated.
    expect(naturalDoc.artifactId).not.toBe(baselineDoc.artifactId);
    const candidate:SecDocumentArtifactWrite={...scope,document:{...naturalDoc,artifactId:baselineDoc.artifactId}};
    expect(isTrustedSecRuntimeBatch(candidate)).toBe(false);
    const parentRows=await sql`select b.sha256,b.byte_length,f.profile_id,f.profile_fingerprint,f.cik,f.accession_number from public.sec_event_content_blobs b cross join public.sec_event_filing_identities f where b.blob_id=${candidate.document.blobId} and f.filing_identity_id=${scope.filingIdentityId}`;
    expect(parentRows).toHaveLength(1);expect(parentRows[0]?.sha256).toBe(candidate.document.sha256);expect(Number(parentRows[0]?.byte_length)).toBe(candidate.document.byteLength);expect(parentRows[0]?.profile_id).toBe(scope.profileId);expect(parentRows[0]?.profile_fingerprint).toBe(scope.profileFingerprint);
    expect(candidate.document.locator).toMatch(new RegExp(`^/synthetic-edgar/archive/${parentRows[0]!.cik}/${parentRows[0]!.accession_number}/[A-Za-z0-9._-]+$`));expect(candidate.document.locator).not.toMatch(/\.\.|%|\\/);
    const duplicateLocator=await sql`select count(*)::int as count from public.sec_event_document_artifacts where filing_identity_id=${scope.filingIdentityId} and canonical_locator=${candidate.document.locator} and artifact_id<>${baselineDoc.artifactId}`;expect(Number(duplicateLocator[0]?.count)).toBe(0);
    const before=await counts(sql);const canary=artifactConflictBatch(original,`rollback-${dimension}`,true);
    let started=0;let uowCalls=0;let insertNoops=0;let rereads=0;let innerError:unknown;let propagatedError:unknown;const phases:string[]=[];
    try{await sql.begin(async tx=>{
      started++;await tx`set transaction isolation level read committed`;
      uowCalls++;await persistSecEventProvenance(tx as unknown as Parameters<typeof persistSecEventProvenance>[0],canary);
      const within=await counts(tx as unknown as ReturnType<typeof connect>);for(const table of tableNames.filter(t=>t!=="sec_event_source_profiles"))expect(within[table]).toBeGreaterThan(before[table]!);
      const tracked=new Proxy(tx,{apply(target,thisArg,args){
        const statement=Array.isArray(args[0])?args[0].join("?"):"";
        const pending=Reflect.apply(target,thisArg,args);
        if(!statement.includes("public.sec_event_document_artifacts"))return pending;
        return pending.then((rows:Record<string,unknown>[])=>{if(statement.startsWith("insert")){expect(rows).toHaveLength(0);insertNoops++;}else{expect(rows).toHaveLength(1);expect(rows[0]?.filing_identity_id).toBe(baselineBatch.filingIdentityId);expect(rows[0]?.blob_id).toBe(baselineDoc.blobId);rereads++;}return rows;});
      }});
      uowCalls++;await persistSecEventProvenance(tx as unknown as Parameters<typeof persistSecEventProvenance>[0],baselineBatch,async phase=>{
        phases.push(phase);if(phase!=="BLOB_VERIFIED")return;
        try{await persistDocumentArtifact(tracked as unknown as Parameters<typeof persistDocumentArtifact>[0],candidate);}catch(error){innerError=error;throw error;}
      });
    });}catch(error){propagatedError=error;}
    expect(started).toBe(1);expect(uowCalls).toBe(2);expect(insertNoops).toBe(1);expect(rereads).toBe(1);expect(phases.at(-1)).toBe("BLOB_VERIFIED");expect(phases).not.toContain("DOCUMENT_ARTIFACTS");
    expect(propagatedError).toBeInstanceOf(Error);expect(propagatedError).toBe(innerError);expect((propagatedError as Error).message).toBe("SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT");expect((propagatedError as PgFailure).code).toBeUndefined();expect((propagatedError as Error).message).not.toMatch(/ITEM\||SYNTHETIC FIXTURE|agreement\.txt/);
    const verify=connect();let after:Record<string,number>;try{after=await counts(verify);expect(after).toEqual(before);expect(await artifactConflictSnapshot(verify,baselineDoc.artifactId)).toEqual(baselineRow);const leftover=await verify`select count(*)::int as count from public.sec_event_filing_identities where filing_identity_id=${canary.filingIdentityId}`;expect(Number(leftover[0]?.count)).toBe(0);}finally{await verify.end({timeout:5});}
    console.info("SEC_ARTIFACT_CONFLICT_COUNTS",JSON.stringify({case:dimension,construction:"UNREACHABLE_BY_AUTHENTICATED_CONSTRUCTION",stage:"AUTHORITATIVE_REREAD",domainError:(propagatedError as Error).message,transactionStarted:started,uowCalls,insertNoops,rereads,sameErrorInstance:true,baseline:{artifactId:baselineDoc.artifactId,fingerprint:baselineDoc.fingerprint,blobId:baselineDoc.blobId,filingIdentityId:baselineBatch.filingIdentityId,profileId:original.profileId,locator:baselineDoc.locator,role:baselineDoc.role},before,after,rollback:true,baselineUnchanged:true}));
  });
  it("D-F: verifies document artifact identity, blob sharing, and authoritative reread",async()=>{
    const result=fixture(0);expect(result.status).toBe("VALID");if(result.status!=="VALID")return;await persistSyntheticSecEdgarFixtureProvenance(result,url!);const original=adaptSecEdgarFixtureToEntityBytes(result)!;const originalBatch=createSecRuntimeBatch(original);
    const newAccession="SYNTH-ACC-DUPBLOB-0001";const changedDocs=original.documents.map((doc,index)=>({...doc,locator:doc.locator.replace(original.accession,newAccession),bytes:index===2?original.documents[1]!.bytes:doc.bytes}));const sharedBatch=createSecRuntimeBatch({...original,accession:newAccession,documents:changedDocs});const uow=createSecEventProvenanceUnitOfWork(url!);
    try{const saved=await uow.persist(sharedBatch);expect(saved.status).toBe("PERSISTED_VERIFIED");}finally{await uow.close();}
    expect(sharedBatch.documents[1]?.blobId).toBe(sharedBatch.documents[2]?.blobId);expect(sharedBatch.documents[1]?.artifactId).not.toBe(sharedBatch.documents[2]?.artifactId);
    const sharedRows=await sql`select (select count(*)::int from public.sec_event_content_blobs where blob_id=${sharedBatch.documents[1]!.blobId}) as blobs,(select count(*)::int from public.sec_event_document_artifacts where artifact_id in ${sql([sharedBatch.documents[1]!.artifactId,sharedBatch.documents[2]!.artifactId])}) as artifacts`;
    expect(Number(sharedRows[0]?.blobs)).toBe(1);expect(Number(sharedRows[0]?.artifacts)).toBe(2);
    const receiptVariant=await persistSyntheticSecEdgarFixtureProvenance(result,url!,{receivedAt:"2026-10-05T12:00:00.000Z",effectiveAvailableAt:"2026-10-04T12:00:00.000Z"});expect(receiptVariant?.filingIdentityId).toBe(originalBatch.filingIdentityId);expect(receiptVariant?.packageId).toBe(originalBatch.packageId);expect(receiptVariant?.lineageId).toBe(originalBatch.lineageId);
    const uowStarts=0;const unsafe={...original,documents:original.documents.map((doc,index)=>index===1?{...doc,locator:"/synthetic-edgar/archive/../../outside.txt"}:doc)};expect(()=>createSecRuntimeBatch(unsafe)).toThrow("SEC_EVENT_RUNTIME_INPUT_INVALID");expect(uowStarts).toBe(0);
    const constraints=await sql`select conname,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.sec_event_document_artifacts'::regclass`;
    const constraint=(part:string)=>{const row=constraints.find(item=>String(item.definition).includes(part));if(!row)throw new Error("SEC_RUNTIME_EXPECTED_CONSTRAINT_MISSING");return String(row.conname);};
    const candidate=originalBatch.documents[1]!;const badId=`artifact-d-${caseId("unknown-blob")}`;const locator=`${candidate.locator}.unknown-${caseId("blob-locator")}`;
    await expectDbFailure("artifact references unknown blob","23503",constraint("FOREIGN KEY (blob_id, content_sha256, byte_length)"),tx=>tx`insert into public.sec_event_document_artifacts(artifact_id,fingerprint,filing_identity_id,blob_id,content_sha256,byte_length,document_role,document_type,sequence_ordinal,canonical_locator,content_type,canonicalization_version,material) values(${badId},${"a".repeat(64)},${originalBatch.filingIdentityId},${`missing:${caseId("blob")}`},${candidate.sha256},${candidate.byteLength},${candidate.role},${candidate.documentType},90,${locator},${candidate.contentType},${candidate.canonicalizationVersion},${tx.json({testCase:"unknown-blob"})})`);
    await expectDbFailure("artifact invalid role","23514",constraint("document_role = ANY"),tx=>tx`insert into public.sec_event_document_artifacts(artifact_id,fingerprint,filing_identity_id,blob_id,content_sha256,byte_length,document_role,document_type,sequence_ordinal,canonical_locator,content_type,canonicalization_version,material) values(${`artifact-d-${caseId("role")}`},${"b".repeat(64)},${originalBatch.filingIdentityId},${candidate.blobId},${candidate.sha256},${candidate.byteLength},'UNKNOWN',${candidate.documentType},90,${`${candidate.locator}.role-${caseId("role")}`},${candidate.contentType},${candidate.canonicalizationVersion},${tx.json({testCase:"invalid-role"})})`);
    await expectDbFailure("artifact duplicate locator","23505",constraint("UNIQUE (filing_identity_id, canonical_locator)"),tx=>tx`insert into public.sec_event_document_artifacts(artifact_id,fingerprint,filing_identity_id,blob_id,content_sha256,byte_length,document_role,document_type,sequence_ordinal,canonical_locator,content_type,canonicalization_version,material) values(${`artifact-d-${caseId("duplicate-locator")}`},${"c".repeat(64)},${originalBatch.filingIdentityId},${candidate.blobId},${candidate.sha256},${candidate.byteLength},${candidate.role},${candidate.documentType},90,${candidate.locator},${candidate.contentType},${candidate.canonicalizationVersion},${tx.json({testCase:"duplicate-locator"})})`);
    const before=await counts(sql);let conflict:Error|undefined;try{await sql.begin(async tx=>{await tx`alter table public.sec_event_document_artifacts disable trigger sec_event_document_artifacts_immutable`;await tx`update public.sec_event_document_artifacts set content_type='application/octet-stream' where artifact_id=${candidate.artifactId}`;await persistSecEventProvenance(tx as never,originalBatch);});}catch(error){conflict=error as Error;}
    expect(conflict?.message).toBe("SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT");const fresh=connect();try{expect(await counts(fresh)).toEqual(before);const row=await fresh`select content_type from public.sec_event_document_artifacts where artifact_id=${candidate.artifactId}`;expect(row[0]?.content_type).toBe(candidate.contentType);}finally{await fresh.end({timeout:5});}
  });
  it("E: seals package counts, ordering, roles, and scope at COMMIT",async()=>{
    const result=fixture(0);expect(result.status).toBe("VALID");if(result.status!=="VALID")return;await persistSyntheticSecEdgarFixtureProvenance(result,url!);const batch=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(result)!);const docs=batch.documents;
    for(const scenario of [
      {name:"package declared count low",docs,declaredCount:1},
      {name:"package declared count high",docs,declaredCount:3},
      {name:"package ordinal gap",docs,ordinals:[0,2,3]},
      {name:"package starts at wrong ordinal",docs,ordinals:[1,2,3]},
      {name:"package missing primary",docs:docs.filter(d=>d.role!=="PRIMARY_DOCUMENT"),memberCount:2,declaredCount:1},
    ])await expectDeferredDbFailure(scenario.name,"23514","SEC_EVENT_PACKAGE_UNSEALED","sec_event_assert_package_seal",tx=>insertPackageCandidate(tx,batch,scenario));
    const noRequiredExhibit=await sql.begin(async tx=>insertPackageCandidate(tx,batch,{name:"no-required-exhibit",docs:docs.filter(d=>d.role!=="EXHIBIT"),memberCount:2,declaredCount:1,idempotent:true}));expect(noRequiredExhibit.packageId).not.toBe(batch.packageId);
    await expectDbFailure("package duplicate ordinal","23505","sec_event_package_document_members_pkey",async tx=>insertPackageCandidate(tx,batch,{name:"duplicate-ordinal",docs,ordinals:[0,0,2]}));
    const extraSource=docs.find(d=>d.role==="EXHIBIT")!;const extraLocator=`${extraSource.locator}.extra-${caseId("extra-exhibit")}`;const extraMaterial={filingIdentityId:batch.filingIdentityId,canonicalLocator:extraLocator,documentRole:"EXHIBIT",documentType:"EXHIBIT-99.2",exactEntityBodyOctetsSha256:extraSource.sha256,contentType:extraSource.contentType,byteLength:extraSource.byteLength,sequenceOrdinal:3,canonicalizationVersion:extraSource.canonicalizationVersion,noContentNormalization:true};const extraFingerprint=canonicalSha256(extraMaterial);const extraArtifactId=createHash("sha256").update("sec-event-document-id/v1:","utf8").update(extraFingerprint,"utf8").digest("hex");const extraDoc={...extraSource,artifactId:extraArtifactId,fingerprint:extraFingerprint,locator:extraLocator,role:"EXHIBIT" as const,documentType:"EXHIBIT-99.2",sequence:3};
    await expectDeferredDbFailure("package extra member","23514","SEC_EVENT_PACKAGE_UNSEALED","sec_event_assert_package_seal",async tx=>{await tx`insert into public.sec_event_document_artifacts(artifact_id,fingerprint,filing_identity_id,blob_id,content_sha256,byte_length,document_role,document_type,sequence_ordinal,canonical_locator,content_type,canonicalization_version,material) values(${extraArtifactId},${extraFingerprint},${batch.filingIdentityId},${extraSource.blobId},${extraSource.sha256},${extraSource.byteLength},'EXHIBIT','EXHIBIT-99.2',3,${extraLocator},${extraSource.contentType},${extraSource.canonicalizationVersion},${tx.json(extraMaterial)})`;return insertPackageCandidate(tx,batch,{name:"extra-member",docs:[...docs,extraDoc],memberCount:4,declaredCount:2});});
    const alternate=fixture(1);expect(alternate.status).toBe("VALID");if(alternate.status!=="VALID")return;await persistSyntheticSecEdgarFixtureProvenance(alternate,url!);const foreignBatch=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(alternate)!);const fk=await sql`select conname from pg_constraint where conrelid='public.sec_event_package_document_members'::regclass and contype='f' and pg_get_constraintdef(oid) like '%artifact_id%filing_identity_id%'`;
    await expectDbFailure("package member from another filing","23503",String(fk[0]?.conname),async tx=>{const custom=await insertPackageCandidate(tx,batch,{name:"wrong-filing",docs,memberCount:4,declaredCount:3});const foreign=foreignBatch.documents[0]!;return tx`insert into public.sec_event_package_document_members(package_id,package_fingerprint,filing_identity_id,member_ordinal,artifact_id,artifact_fingerprint,document_role,document_type,sequence_ordinal,canonical_locator,is_primary,material) values(${custom.packageId},${custom.fingerprint},${batch.filingIdentityId},3,${foreign.artifactId},${foreign.fingerprint},${foreign.role},${foreign.documentType},${foreign.sequence},${foreign.locator},false,${tx.json({testCase:"wrong-filing"})})`;});
    const before=await counts(sql);let conflict:Error|undefined;try{await sql.begin(async tx=>{await tx`alter table public.sec_event_filing_packages disable trigger sec_event_filing_packages_immutable`;await tx`update public.sec_event_filing_packages set material=${tx.json({conflictingPackageMaterial:true})} where package_id=${batch.packageId}`;await persistSecEventProvenance(tx as never,batch);});}catch(error){conflict=error as Error;}expect(conflict?.message).toBe("SEC_EVENT_FILING_PACKAGE_AUTHORITY_CONFLICT");const fresh=connect();try{expect(await counts(fresh)).toEqual(before);const row=await fresh`select material from public.sec_event_filing_packages where package_id=${batch.packageId}`;expect(row[0]?.material).toEqual(batch.packageMaterial);}finally{await fresh.end({timeout:5});}
  });
  it("F: seals selected lineage references independently from package membership",async()=>{
    const result=fixture(0);expect(result.status).toBe("VALID");if(result.status!=="VALID")return;await persistSyntheticSecEdgarFixtureProvenance(result,url!);const batch=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(result)!);const primary=batch.documents.find(d=>d.role==="PRIMARY_DOCUMENT")!;const exhibit=batch.documents.find(d=>d.role==="EXHIBIT")!;
    const subsetRefs=[{packageId:batch.packageId,packageFingerprint:batch.packageFingerprint,packageMemberOrdinal:primary.sequence,artifactId:primary.artifactId,artifactFingerprint:primary.fingerprint}];const subsetId=canonicalSha256({sourceProfileId:batch.material.profileId,orderedPackageDocumentMemberReferences:subsetRefs,memberCount:1});const subsetRows=await sql`select lineage_id from public.sec_event_source_lineages where lineage_id=${subsetId}`;if(subsetRows.length===0)await sql.begin(async tx=>insertLineageCandidate(tx,batch,{name:"selected-primary-only",docs:[primary],idempotent:true}));expect(subsetId).not.toBe(batch.lineageId);const selected=await sql`select member_count,member_ordinal,artifact_id from public.sec_event_source_lineages l join public.sec_event_source_lineage_members m using(lineage_id) where l.lineage_id=${subsetId}`;expect(selected.map(row=>Number(row.member_ordinal))).toEqual([0]);expect(Number(selected[0]?.member_count)).toBe(1);expect(selected[0]?.artifact_id).toBe(primary.artifactId);
    const selectedRefs=[primary,exhibit].map(d=>({packageId:batch.packageId,packageFingerprint:batch.packageFingerprint,packageMemberOrdinal:d.sequence,artifactId:d.artifactId,artifactFingerprint:d.fingerprint}));const changedId=canonicalSha256({sourceProfileId:batch.material.profileId,orderedPackageDocumentMemberReferences:selectedRefs,memberCount:2});const changedRows=await sql`select lineage_id from public.sec_event_source_lineages where lineage_id=${changedId}`;if(changedRows.length===0)await sql.begin(async tx=>insertLineageCandidate(tx,batch,{name:"selected-primary-exhibit",docs:[primary,exhibit],idempotent:true}));expect(changedId).not.toBe(subsetId);
    for(const scenario of [
      {name:"lineage declared count low",docs:[primary,exhibit],memberCount:1},
      {name:"lineage declared count high",docs:[primary],memberCount:2},
      {name:"lineage missing member",docs:[primary,exhibit],memberCount:3},
      {name:"lineage extra member",docs:[primary,exhibit],memberCount:1},
      {name:"lineage ordinal gap",docs:[exhibit,primary],ordinals:[0,2]},
      {name:"lineage starts at wrong ordinal",docs:[exhibit],ordinals:[1]},
    ])await expectDeferredDbFailure(scenario.name,"23514","SEC_EVENT_LINEAGE_UNSEALED","sec_event_assert_lineage_seal",tx=>insertLineageCandidate(tx,batch,scenario));
    await expectDbFailure("lineage duplicate ordinal","23505","sec_event_source_lineage_members_pkey",tx=>insertLineageCandidate(tx,batch,{name:"duplicate-ordinal",docs:[exhibit,primary],ordinals:[0,0]}));
    const alternateProfile=`sec-edgar-truth-${caseId("lineage-other-profile")}/v1`;await expectDeferredDbFailure("lineage member from wrong source profile","23514","SEC_EVENT_LINEAGE_UNSEALED","sec_event_assert_lineage_seal",async tx=>{await insertTestProfile(tx,alternateProfile);return insertLineageCandidate(tx,batch,{name:"wrong-source-profile",docs:[primary],profileId:alternateProfile,profileFingerprint:"a".repeat(64)});});
    const constraints=await sql`select conname,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.sec_event_source_lineage_members'::regclass and contype='f'`;const artifactMemberFk=String(constraints.find(r=>String(r.definition).includes("FOREIGN KEY (package_id, package_fingerprint, package_member_ordinal, artifact_id, artifact_fingerprint)"))?.conname);
    await expectDbFailure("lineage references a package member that does not exist","23503",artifactMemberFk,tx=>{const unknown={...primary,sequence:99};return insertLineageCandidate(tx,batch,{name:"unknown-package-member",docs:[unknown]});});
    const before=await counts(sql);let conflict:Error|undefined;try{await sql.begin(async tx=>{await tx`alter table public.sec_event_source_lineages disable trigger sec_event_source_lineages_immutable`;await tx`update public.sec_event_source_lineages set member_set_fingerprint=${"f".repeat(64)} where lineage_id=${batch.lineageId}`;await persistSecEventProvenance(tx as never,batch);});}catch(error){conflict=error as Error;}expect(conflict?.message).toBe("SEC_EVENT_SOURCE_LINEAGE_AUTHORITY_CONFLICT");const fresh=connect();try{expect(await counts(fresh)).toEqual(before);const row=await fresh`select member_set_fingerprint from public.sec_event_source_lineages where lineage_id=${batch.lineageId}`;expect(row[0]?.member_set_fingerprint?.trim()).toBe(batch.lineageFingerprint);}finally{await fresh.end({timeout:5});}
    expect(batch.lineageId).toBe(createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(result,{receivedAt:"2026-10-05T12:00:00.000Z",effectiveAvailableAt:"2026-10-04T12:00:00.000Z"})!).lineageId);
    const amendmentResult=fixtureSet(0,2);expect(amendmentResult.status).toBe("VALID");if(amendmentResult.status==="VALID"){const amendment=await persistSyntheticSecEdgarFixtureProvenance(amendmentResult,url!,undefined,undefined,"SYNTH-ACC-AMEND-0001");const amendmentBatch=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(amendmentResult,undefined,"SYNTH-ACC-AMEND-0001")!);const amendmentRows=await sql`select material from public.sec_event_source_lineages where lineage_id=${amendmentBatch.lineageId}`;expect(amendment?.lineageId).toBe(amendmentBatch.lineageId);expect(amendmentRows[0]?.material.rootFilingIdentityId).toBe(amendmentBatch.amendmentParentFilingIdentityId);expect(amendmentRows[0]?.material.amendmentParentChain).toEqual([amendmentBatch.amendmentParentFilingIdentityId,amendmentBatch.filingIdentityId]);}
  });
  it.each([
    {name:"empty bytea is forbidden",sha256:"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",length:0,bytes:Buffer.alloc(0),state:"23514",constraint:"sec_event_content_blobs_byte_length_limit"},
    {name:"uppercase digest is forbidden",sha256:"A".repeat(64),length:1,bytes:Buffer.from([1]),state:"23514",constraint:"sec_event_content_blobs_sha256_canonical"},
    {name:"declared octet length mismatch is forbidden",sha256:"4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a",length:2,bytes:Buffer.from([1]),state:"23514",constraint:"sec_event_content_blobs_octet_length_check"},
  ])("database truth-table: $name",async testCase=>{
    const blobId=`sha256:${testCase.sha256}:${testCase.length}`;
    await expectDbFailure(testCase.name,testCase.state,testCase.constraint,async tx=>tx`insert into public.sec_event_content_blobs(blob_id,sha256,byte_length,storage_contract_version,entity_body,readback_verified,retention_classification,deletion_legal_hold_status,material) values(${blobId},${testCase.sha256},${testCase.length},'sec-event-document-byte-storage-decision/v1',${testCase.bytes},true,'NOT_APPROVED','NOT_APPROVED',${tx.json({caseId:caseId(testCase.name)})})`);
  });
  it("records structural blob constraints with exact all-authority rollback snapshots",async()=>{
    const bytes=Buffer.from([0x42]);const sha=createHash("sha256").update(bytes).digest("hex");
    const cases:[string,string,string,string|null,number|null,Buffer|null][]=[
      ["blob null bytes","23502","entity_body",sha,1,null],
      ["blob null sha","23502","sha256",null,1,bytes],
      ["blob null length","23502","byte_length",sha,null,bytes],
      ["blob blank sha","23514","sec_event_content_blobs_sha256_canonical","",1,bytes],
      ["blob uppercase sha","23514","sec_event_content_blobs_sha256_canonical",sha.toUpperCase(),1,bytes],
      ["blob malformed sha","23514","sec_event_content_blobs_sha256_canonical","g".repeat(64),1,bytes],
      ["blob zero length","23514","sec_event_content_blobs_byte_length_limit","e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",0,Buffer.alloc(0)],
      ["blob negative length","23514","sec_event_content_blobs_byte_length_limit",sha,-1,bytes],
      ["blob declared octet mismatch","23514","sec_event_content_blobs_octet_length_check",sha,2,bytes],
      ["blob address digest mismatch","23514","sec_event_content_blobs_address_check","a".repeat(64),1,bytes],
    ];
    for(const [name,state,constraint,digest,length,body] of cases){
      const id=name==="blob address digest mismatch"?`sha256:${sha}:${length}`:`sha256:${digest??"null"}:${length??"null"}`;
      await expectDbFailure(name,state,constraint,async(tx)=>tx`insert into public.sec_event_content_blobs(blob_id,sha256,byte_length,storage_contract_version,entity_body,readback_verified,retention_classification,deletion_legal_hold_status,material) values(${id},${digest},${length},'sec-event-document-byte-storage-decision/v1',${body},true,'NOT_APPROVED','NOT_APPROVED',${tx.json({caseId:caseId(name)})})`);
    }
  });
  it("checks database source-profile and filing constraints with transaction-wide rollback",async()=>{
    const profileIdFor=(name:string)=>`sec-edgar-truth-${caseId(name)}/v1`;
    const nullProvider=profileIdFor("profile-null-provider");
    await expectDbFailure("source profile NULL provider", "23502", "provider_id", async tx=>tx`insert into public.sec_event_source_profiles(profile_id,fingerprint,contract_version,provider_id,dataset_id,dataset_version,endpoint_profile,hostname_allowlist,path_template,method,supported_forms,authentication_kind,accepted_content_encoding,request_identity_policy,max_timeout_ms,max_response_bytes,max_package_documents,material) values(${nullProvider},${"b".repeat(64)},'test/v1',null,'test-dataset','test/v1','TEST',${tx.json([])},'/test','GET',${tx.json(["8-K"])},'NONE',${tx.json(["identity"])},'test/v1',1000,8388608,32,${tx.json({})})`);
    const profileCases=[
      ["blank provider","providerId","", "sec_event_source_profiles_provider_id_canonical"],
      ["whitespace provider","providerId","  ", "sec_event_source_profiles_provider_id_canonical"],
      ["blank endpoint profile","endpointProfile","", "sec_event_source_profiles_endpoint_profile_canonical"],
      ["whitespace endpoint profile","endpointProfile"," \t", "sec_event_source_profiles_endpoint_profile_canonical"],
      ["blank contract version","contractVersion","", "sec_event_source_profiles_contract_version_canonical"],
      ["whitespace contract version","contractVersion"," ", "sec_event_source_profiles_contract_version_canonical"],
      ["blank dataset version","datasetVersion","", "sec_event_source_profiles_dataset_version_canonical"],
      ["blank dataset id","datasetId","", "sec_event_source_profiles_dataset_id_canonical"],
      ["blank profile id","profileId","", "sec_event_source_profiles_profile_id_canonical"],
      ["noncanonical profile id","profileId","sec-edgar-truth-invalid", "sec_event_source_profiles_profile_id_canonical"],
    ] as const;
    for(const [name,field,value,constraint] of profileCases){const profileId=profileIdFor(`profile-${name}`);if(field==="profileId"){await expectDbFailure(`source profile ${name}`,"23514",constraint,tx=>insertTestProfile(tx,value));}else{await expectDbFailure(`source profile ${name}`,"23514",constraint,tx=>insertTestProfile(tx,profileId,{[field]:value}));}}
    const invalidForm=`truth-${caseId("filing-form")}`;const profileId=profileIdFor("filing-profile");
    await expectDbFailure("filing unsupported form", "23514", "sec_event_filing_identities_form_check", async tx=>{await insertTestProfile(tx,profileId);return tx`insert into public.sec_event_filing_identities(filing_identity_id,profile_id,profile_fingerprint,cik,accession_number,form,amendment_parent_filing_identity_id,material) values(${invalidForm},${profileId},${"a".repeat(64)},'SYNTH-CIK-0001','SYNTH-ACC-CASE-0001','10-K',null,${tx.json({})})`;});
    const missingParent=`truth-${caseId("filing-parent")}`;const amendmentProfile=profileIdFor("filing-parent-profile");
    await expectDbFailure("filing missing amendment parent", "23503", "sec_event_filing_identities_amendment_parent_filing_identi_fkey", async tx=>{await insertTestProfile(tx,amendmentProfile);return tx`insert into public.sec_event_filing_identities(filing_identity_id,profile_id,profile_fingerprint,cik,accession_number,form,amendment_parent_filing_identity_id,material) values(${missingParent},${amendmentProfile},${"a".repeat(64)},'SYNTH-CIK-0001','SYNTH-ACC-CASE-0002','8-K/A',${`truth-${caseId("absent-parent")}`},${tx.json({})})`;});
    const crossCikProfile=profileIdFor("cross-cik-profile");const parentId=`truth-${caseId("cross-cik-parent")}`;const childId=`truth-${caseId("cross-cik-child")}`;
    await expectDbFailure("filing amendment parent cross-CIK", "23503", "sec_event_filing_identities_amendment_parent_filing_identi_fkey", async tx=>{await insertTestProfile(tx,crossCikProfile);await tx`insert into public.sec_event_filing_identities(filing_identity_id,profile_id,profile_fingerprint,cik,accession_number,form,amendment_parent_filing_identity_id,material) values(${parentId},${crossCikProfile},${"a".repeat(64)},'SYNTH-CIK-0001','SYNTH-ACC-PARENT-0001','8-K',null,${tx.json({})})`;return tx`insert into public.sec_event_filing_identities(filing_identity_id,profile_id,profile_fingerprint,cik,accession_number,form,amendment_parent_filing_identity_id,material) values(${childId},${crossCikProfile},${"a".repeat(64)},'SYNTH-CIK-0002','SYNTH-ACC-CHILD-0001','8-K/A',${parentId},${tx.json({})})`;});
    const requestProfile=profileIdFor("request-unknown-filing");const requestId=`sec-edgar-truth-${caseId("request-unknown-filing")}`;
    await expectDbFailure("request references unknown filing identity", "23503", "sec_event_acquisition_request_filing_identity_id_profile_i_fkey", async tx=>{await insertTestProfile(tx,requestProfile);return tx`insert into public.sec_event_acquisition_requests(request_id,fingerprint,idempotency_key,profile_id,profile_fingerprint,filing_identity_id,requested_at,material) values(${requestId},${"d".repeat(64)},${`idem-${caseId("request")}`},${requestProfile},${"a".repeat(64)},${`missing-${caseId("filing")}`},'2026-10-01T12:00:00Z',${tx.json({caseId:caseId("request-unknown-filing")})})`;});
  });
  it("rejects acquisition attempts that reference an unknown request",async()=>{
    const attempt=`sec-edgar-truth-${caseId("attempt-unknown-request")}`;
    await expectDbFailure("attempt unknown request", "23503", "sec_event_acquisition_attempts_request_id_fkey", tx=>tx`insert into public.sec_event_acquisition_attempts(attempt_id,fingerprint,request_id,attempt_ordinal,started_at,material) values(${attempt},${"c".repeat(64)},${`sec-edgar-truth-${caseId("absent-request")}`},0,'2026-10-01T12:00:00Z',${tx.json({caseId:caseId("attempt-unknown-request")})})`);
  });
  it("rejects acquisition attempt ordinal and receipt scope mismatches",async()=>{
    const first=fixture(0),second=fixture(3);expect(first.status).toBe("VALID");expect(second.status).toBe("VALID");if(first.status!=="VALID"||second.status!=="VALID")return;
    await persistSyntheticSecEdgarFixtureProvenance(first,url!);await persistSyntheticSecEdgarFixtureProvenance(second,url!);
    const a=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(first)!);const b=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(second)!);
    const constraints=await sql`select conname,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid in ('public.sec_event_acquisition_attempts'::regclass,'public.sec_event_acquisition_receipts'::regclass) and contype in ('u','f')`;
    const constraint=(part:string)=>{const row=constraints.find(item=>String(item.definition).includes(part));if(!row)throw new Error("SEC_RUNTIME_EXPECTED_CONSTRAINT_MISSING");return String(row.conname);};
    await expectDbFailure("duplicate attempt ordinal","23505",constraint("UNIQUE (request_id, attempt_ordinal)"),tx=>tx`insert into public.sec_event_acquisition_attempts(attempt_id,fingerprint,request_id,attempt_ordinal,started_at,material) values(${`sec-attempt:${caseId("duplicate-ordinal")}`},${"d".repeat(64)},${a.requestId},0,${a.material.receipt.receivedAt},${tx.json({caseId:caseId("duplicate-ordinal")})})`);
    await expectDbFailure("receipt attempt/request mismatch","23503",constraint("FOREIGN KEY (attempt_id, request_id)"),tx=>tx`insert into public.sec_event_acquisition_receipts(receipt_id,fingerprint,request_id,attempt_id,filing_identity_id,package_id,package_fingerprint,retrieved_at,effective_available_at,response_status,content_encoding,response_material_fingerprint,material) values(${`receipt:${caseId("receipt-wrong-attempt")}`},${"e".repeat(64)},${a.requestId},${b.attemptId},${a.filingIdentityId},${a.packageId},${a.packageFingerprint},${a.material.receipt.receivedAt},${a.material.receipt.effectiveAvailableAt},200,'identity',${"f".repeat(64)},${tx.json({caseId:caseId("receipt-wrong-attempt")})})`);
    await expectDbFailure("receipt package/filing scope mismatch","23503",constraint("FOREIGN KEY (package_id, package_fingerprint, filing_identity_id)"),tx=>tx`insert into public.sec_event_acquisition_receipts(receipt_id,fingerprint,request_id,attempt_id,filing_identity_id,package_id,package_fingerprint,retrieved_at,effective_available_at,response_status,content_encoding,response_material_fingerprint,material) values(${`receipt:${caseId("receipt-wrong-package")}`},${"1".repeat(64)},${a.requestId},${a.attemptId},${a.filingIdentityId},${b.packageId},${b.packageFingerprint},${a.material.receipt.receivedAt},${a.material.receipt.effectiveAvailableAt},200,'identity',${"2".repeat(64)},${tx.json({caseId:caseId("receipt-wrong-package")})})`);
  });
  it("rejects request source-profile binding mismatches by composite authority FK",async()=>{
    const result=fixture(0);expect(result.status).toBe("VALID");if(result.status!=="VALID")return;const batch=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(result)!);await persistSyntheticSecEdgarFixtureProvenance(result,url!);
    await expectDbFailure("request source profile fingerprint mismatch","23503","sec_event_acquisition_request_filing_identity_id_profile_i_fkey",tx=>tx`insert into public.sec_event_acquisition_requests(request_id,fingerprint,idempotency_key,profile_id,profile_fingerprint,filing_identity_id,requested_at,material) values(${`sec-request:${caseId("scope-mismatch")}`},${"a".repeat(64)},${`idem-${caseId("scope-mismatch")}`},${batch.material.profileId},${"0".repeat(64)},${batch.filingIdentityId},${batch.material.acceptanceAt},${tx.json({caseId:caseId("scope-mismatch")})})`);
  });
  it("rejects attempt before request and receipt before attempt at deferred COMMIT",async()=>{
    const result=fixture(0);expect(result.status).toBe("VALID");if(result.status!=="VALID")return;const batch=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(result)!);await persistSyntheticSecEdgarFixtureProvenance(result,url!);
    await expectDeferredDbFailure("attempt starts before request","23514","SEC_EVENT_ACQUISITION_CHRONOLOGY_INVALID","sec_event_assert_acquisition_chronology",tx=>tx`insert into public.sec_event_acquisition_attempts(attempt_id,fingerprint,request_id,attempt_ordinal,started_at,material) values(${`sec-attempt:${caseId("early-attempt")}`},${"a".repeat(64)},${batch.requestId},91,'1900-01-01T00:00:00Z',${tx.json({caseId:caseId("early-attempt")})})`);
    await expectDeferredDbFailure("receipt retrieved before attempt","23514","SEC_EVENT_ACQUISITION_CHRONOLOGY_INVALID","sec_event_assert_acquisition_chronology",tx=>tx`insert into public.sec_event_acquisition_receipts(receipt_id,fingerprint,request_id,attempt_id,filing_identity_id,package_id,package_fingerprint,retrieved_at,effective_available_at,response_status,content_encoding,response_material_fingerprint,material) values(${`receipt:${caseId("early-receipt")}`},${"b".repeat(64)},${batch.requestId},${batch.attemptId},${batch.filingIdentityId},${batch.packageId},${batch.packageFingerprint},'1900-01-01T00:00:00Z','1899-01-01T00:00:00Z',200,'identity',${"c".repeat(64)},${tx.json({caseId:caseId("early-receipt")})})`);
  });
  it("rejects receipts that reference an unknown attempt",async()=>{
    const result=fixture(0);expect(result.status).toBe("VALID");if(result.status!=="VALID")return;const batch=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(result)!);await persistSyntheticSecEdgarFixtureProvenance(result,url!);const receipt=`sec-edgar-truth-${caseId("receipt-unknown-attempt")}`;
    await expectDbFailure("receipt unknown attempt", "23503", "sec_event_acquisition_receipts_attempt_id_request_id_fkey", tx=>tx`insert into public.sec_event_acquisition_receipts(receipt_id,fingerprint,request_id,attempt_id,filing_identity_id,package_id,package_fingerprint,retrieved_at,effective_available_at,response_status,content_encoding,response_material_fingerprint,material) values(${receipt},${"e".repeat(64)},${batch.requestId},${`missing-${caseId("attempt")}`},${batch.filingIdentityId},${batch.packageId},${batch.packageFingerprint},'2026-10-02T12:00:00Z','2026-10-01T12:00:00Z',200,'identity',${"f".repeat(64)},${tx.json({caseId:caseId("receipt-unknown-attempt")})})`);
  });
  it("rejects unsupported receipt content encoding",async()=>{
    const result=fixture(0);expect(result.status).toBe("VALID");if(result.status!=="VALID")return;const batch=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(result)!);await persistSyntheticSecEdgarFixtureProvenance(result,url!);const receipt=`sec-edgar-truth-${caseId("receipt-gzip")}`;
    await expectDbFailure("receipt unsupported content encoding", "23514", "sec_event_acquisition_receipts_content_encoding_check", tx=>tx`insert into public.sec_event_acquisition_receipts(receipt_id,fingerprint,request_id,attempt_id,filing_identity_id,package_id,package_fingerprint,retrieved_at,effective_available_at,response_status,content_encoding,response_material_fingerprint,material) values(${receipt},${"1".repeat(64)},${batch.requestId},${batch.attemptId},${batch.filingIdentityId},${batch.packageId},${batch.packageFingerprint},'2026-10-02T12:00:00Z','2026-10-01T12:00:00Z',200,'gzip',${"2".repeat(64)},${tx.json({caseId:caseId("receipt-gzip")})})`);
  });
  it.each([
    {name:"request",table:"sec_event_acquisition_requests",trigger:"sec_event_acquisition_requests_immutable",key:"request_id",field:"fingerprint",error:"SEC_EVENT_ACQUISITION_REQUEST_AUTHORITY_CONFLICT",target:"requestId"},
    {name:"attempt",table:"sec_event_acquisition_attempts",trigger:"sec_event_acquisition_attempts_immutable",key:"attempt_id",field:"fingerprint",error:"SEC_EVENT_ACQUISITION_ATTEMPT_AUTHORITY_CONFLICT",target:"attemptId"},
    {name:"receipt",table:"sec_event_acquisition_receipts",trigger:"sec_event_acquisition_receipts_immutable",key:"receipt_id",field:"response_status",error:"SEC_EVENT_ACQUISITION_RECEIPT_AUTHORITY_CONFLICT",target:"receiptId"},
  ])("rejects same $name authority ID with conflicting material",async conflict=>{
    const result=fixture(0);expect(result.status).toBe("VALID");if(result.status!=="VALID")return;const batch=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(result)!);await persistSyntheticSecEdgarFixtureProvenance(result,url!);const before=await counts(sql);let caught:Error|undefined;
    try{await sql.begin(async tx=>{const keyValue=batch[conflict.target as "requestId"|"attemptId"|"receiptId"];await tx`alter table public.${tx(conflict.table)} disable trigger ${tx(conflict.trigger)}`;const changed=conflict.field==="fingerprint"?"f".repeat(64):201;await tx`update public.${tx(conflict.table)} set ${tx(conflict.field)}=${changed} where ${tx(conflict.key)}=${keyValue}`;await persistSecEventProvenance(tx as never,batch);});}catch(error){caught=error as Error;}
    expect(caught?.message).toBe(conflict.error);const fresh=connect();try{const after=await counts(fresh);expect(after).toEqual(before);console.info("SEC_RUNTIME_DOMAIN_COUNTS",JSON.stringify({case:conflict.name,stage:"AUTHORITATIVE_REREAD",domainError:caught?.message,before,after,rollback:true}));}finally{await fresh.end({timeout:5});}
  });
  it.each([
    {name:"missing package member set",kind:"package",state:"23514",invariant:"SEC_EVENT_PACKAGE_UNSEALED",functionName:"sec_event_assert_package_seal"},
    {name:"missing lineage member set",kind:"lineage",state:"23514",invariant:"SEC_EVENT_LINEAGE_UNSEALED",functionName:"sec_event_assert_lineage_seal"},
  ])("deferred truth-table: $name fails at COMMIT and rolls back",async testCase=>{
    const result=fixture(0);expect(result.status).toBe("VALID");if(result.status!=="VALID")return;const batch=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(result)!);const id=`truth-${testCase.kind}-${batch.packageId}`;const fingerprint=(testCase.kind==="package"?"f":"e").repeat(64);let caught:{code?:string;message?:string;where?:string}|undefined;
    try{await sql.begin(async tx=>{if(testCase.kind==="package"){const index=batch.documents.find(d=>d.role==="FILING_INDEX")!;await tx`insert into public.sec_event_filing_packages(package_id,fingerprint,filing_identity_id,filing_date,acceptance_at,report_period,filing_index_artifact_id,filing_index_artifact_fingerprint,member_count,declared_document_count,material) values(${id},${fingerprint},${batch.filingIdentityId},${batch.material.filingDate},${batch.material.acceptanceAt},${batch.material.reportPeriod},${index.artifactId},${index.fingerprint},${batch.documents.length},${batch.documents.length-1},${tx.json({testCase:testCase.name})})`;await tx`insert into public.sec_event_package_document_members(package_id,package_fingerprint,filing_identity_id,member_ordinal,artifact_id,artifact_fingerprint,document_role,document_type,sequence_ordinal,canonical_locator,is_primary,material) values(${id},${fingerprint},${batch.filingIdentityId},0,${index.artifactId},${index.fingerprint},${index.role},${index.documentType},${index.sequence},${index.locator},false,${tx.json({ordinal:0})})`;}else{await tx`insert into public.sec_event_source_lineages(lineage_id,fingerprint,profile_id,profile_fingerprint,member_count,member_set_fingerprint,material) values(${id},${fingerprint},${batch.material.profileId},${batch.profileFingerprint},${batch.documents.length+1},${fingerprint},${tx.json({testCase:testCase.name})})`;const first=batch.documents[0]!;await tx`insert into public.sec_event_source_lineage_members(lineage_id,member_ordinal,package_id,package_fingerprint,package_member_ordinal,artifact_id,artifact_fingerprint,material) values(${id},0,${batch.packageId},${batch.packageFingerprint},0,${first.artifactId},${first.fingerprint},${tx.json({ordinal:0})})`;}});}catch(error){caught=error as {code?:string;message?:string;where?:string};}
    expect(caught?.code,testCase.name).toBe(testCase.state);expect(caught?.message,testCase.name).toContain(testCase.invariant);expect(caught?.where,testCase.name).toContain(testCase.functionName);
    const fromNewConnection=postgres(url!,{max:1});try{if(testCase.kind==="package"){const rows=await fromNewConnection`select count(*)::int as parents from public.sec_event_filing_packages where package_id=${id}`;const members=await fromNewConnection`select count(*)::int as members from public.sec_event_package_document_members where package_id=${id}`;expect(Number(rows[0]?.parents)).toBe(0);expect(Number(members[0]?.members)).toBe(0);}else{const rows=await fromNewConnection`select count(*)::int as parents from public.sec_event_source_lineages where lineage_id=${id}`;const members=await fromNewConnection`select count(*)::int as members from public.sec_event_source_lineage_members where lineage_id=${id}`;expect(Number(rows[0]?.parents)).toBe(0);expect(Number(members[0]?.members)).toBe(0);}}finally{await fromNewConnection.end({timeout:5});}
  });
  it("G: records the public synthetic E2E, replay and receipt boundaries",async()=>{
    // Only raw synthetic fixture data is copied. The public pipeline issues a
    // new authentic result; no caller can copy its runtime trust.
    const raw=JSON.parse(JSON.stringify(SEC_EDGAR_8K_SYNTHETIC_FIXTURES[0]).replaceAll("SYNTH-ACC-AGREE-0001",`SYNTH-ACC-GE2E-${caseId("public-e2e").slice(0,16).toUpperCase()}`));
    const input=runSecEdgar8kFixtureClaimPipeline([raw]);expect(input.status).toBe("VALID");if(input.status!=="VALID")throw new Error("SEC_TEST_SYNTHETIC_FIXTURE_INVALID");expect(input.classification).toBe("NON_AUTHORITATIVE_EVENT_CLAIMS");
    const before=await counts(sql);
    const first=await persistSyntheticSecEdgarFixtureProvenance(input,url!);
    expect(first?.classification).toBe("SYNTHETIC_NON_AUTHORITATIVE");expect(first?.eventAuthorityEligible).toBe(false);
    expect(isTrustedSecRuntimeBatch(first)).toBe(false);
    expect(adaptSecEdgarFixtureToEntityBytes(first)).toBeNull();
    const fresh=connect();const batch=createAuthenticatedBatch(adaptSecEdgarFixtureToEntityBytes(input)!);
    try{
      for(const doc of batch.documents){const rows=await fresh`select entity_body,sha256,byte_length from public.sec_event_content_blobs where blob_id=${doc.blobId}`;expect(rows).toHaveLength(1);expect(rows[0]?.entity_body).toEqual(doc.bytes);expect(createHash("sha256").update(rows[0]!.entity_body).digest("hex")).toBe(doc.sha256);expect(Number(rows[0]?.byte_length)).toBe(doc.byteLength);}
      const committed=await counts(fresh);const delta=Object.fromEntries(tableNames.map(t=>[t,committed[t]!-before[t]!]));
      expect(delta).toEqual({sec_event_source_profiles:0,sec_event_filing_identities:1,sec_event_acquisition_requests:1,sec_event_acquisition_attempts:1,sec_event_content_blobs:1,sec_event_document_artifacts:3,sec_event_filing_packages:1,sec_event_package_document_members:3,sec_event_acquisition_receipts:1,sec_event_source_lineages:1,sec_event_source_lineage_members:3});
      expect(await persistSyntheticSecEdgarFixtureProvenance(input,url!)).toEqual(first);expect(await counts(fresh)).toEqual(committed);
      const receiptOverride={receivedAt:"2026-10-07T12:00:00.000Z",effectiveAvailableAt:"2026-10-06T12:00:00.000Z"};
      const nextBatch=createAuthenticatedBatch(adaptSecEdgarFixtureToEntityBytes(input,receiptOverride)!);
      const existed=await fresh`select receipt_id from public.sec_event_acquisition_receipts where receipt_id=${nextBatch.receiptId}`;
      const later=await persistSyntheticSecEdgarFixtureProvenance(input,url!,receiptOverride);const after=await counts(fresh);
      expect(later?.packageId).toBe(first?.packageId);expect(later?.lineageId).toBe(first?.lineageId);expect(later?.receiptId).not.toBe(first?.receiptId);
      expect(nextBatch.documents.map(d=>[d.blobId,d.artifactId])).toEqual(batch.documents.map(d=>[d.blobId,d.artifactId]));
      for(const table of tableNames)expect(after[table]).toBe(committed[table]!+(!existed.length&&["sec_event_acquisition_attempts","sec_event_acquisition_receipts"].includes(table)?1:0));
      expect(JSON.stringify(later)).not.toMatch(/ITEM\||SYNTHETIC FIXTURE|agreement\.txt|entity_body|sentinel/);
      console.info("SEC_RUNTIME_G_COUNTS",JSON.stringify({case:"public E2E/replay/later receipt",before,committed,replay:committed,after,first,later,perBlobReadback:true}));
    }finally{await fresh.end({timeout:5});}
  });
  it("G: rejects trust copies and conflicting lookalikes before starting UoW",async()=>{
    const input=fixture(0);const before=await counts(sql);let starts=0;
    const lookalikes=[
      ["spread",{...input}],["JSON",JSON.parse(JSON.stringify(input))],["structured clone",structuredClone(input)],
      ["fabricated",{status:"VALID",filings:[],claims:[]}],["wrong profile",{...input,profileId:"wrong-profile"}],
      ["wrong filing",{...input,filingIdentityId:"wrong-filing"}],["wrong package",{...input,packageId:"wrong-package"}],
      ["wrong lineage",{...input,lineageId:"wrong-lineage"}],["fixture mismatch",{...input,documents:[{bytes:[1],sha256:"a".repeat(64)}]}],
    ] as const;
    for(const [name,value] of lookalikes){expect(await persistSyntheticSecEdgarFixtureProvenance(value,"postgresql://invalid",undefined,{assertCanStartTransaction(){starts++;}}),name).toBeNull();expect(starts).toBe(0);const fresh=connect();try{const after=await counts(fresh);expect(after).toEqual(before);console.info("SEC_RUNTIME_G_COUNTS",JSON.stringify({case:name,stage:"pre-UoW",domainResult:"UNTRUSTED_INPUT_NULL",starts,before,after}));}finally{await fresh.end({timeout:5});}}
    const batch=createSecRuntimeBatch(adaptSecEdgarFixtureToEntityBytes(input)!);const uow=createSecEventProvenanceUnitOfWork("postgresql://postgres:postgres@127.0.0.1:1/postgres");
    try{for(const copy of [{...batch},structuredClone(batch),JSON.parse(JSON.stringify(batch)),{...batch,packageId:"wrong"},{...batch,lineageId:"wrong"}])await expect(uow.persist(copy,()=>{starts++;})).rejects.toThrow("SEC_EVENT_RUNTIME_TRUST_REQUIRED");}finally{await uow.close();}
    expect(starts).toBe(0);expect(await counts(sql)).toEqual(before);
  });
  it("G: rejects invalid material and resource bounds before repository calls",async()=>{
    const original=adaptSecEdgarFixtureToEntityBytes(fixture(0))!;const before=await counts(sql);let starts=0;
    const MiB=1024*1024;
    const cases=[
      {name:"wrong profile",build:()=>({...original,profileId:"wrong-profile"})},
      {name:"wrong filing",build:()=>({...original,accession:"../invalid"})},
      {name:"locator traversal",build:()=>({...original,documents:original.documents.map((d,i)=>i===1?{...d,locator:"../outside"}:d)})},
      {name:"unsupported encoding",build:()=>({...original,documents:original.documents.map((d,i)=>i===1?{...d,contentEncoding:"gzip" as never}:d)})},
      {name:"document >8 MiB",build:()=>({...original,documents:original.documents.map((d,i)=>i===1?{...d,bytes:new Uint8Array(8*MiB+1)}:d)})},
      {name:"package >64 MiB",build:()=>({...original,documents:Array.from({length:9},(_,i)=>({...original.documents[Math.min(i,2)]!,sequence:i,role:(i===0?"FILING_INDEX":i===1?"PRIMARY_DOCUMENT":"EXHIBIT") as "EXHIBIT",locator:`/synthetic-edgar/archive/${original.cik}/${original.accession}/bounded-${i}.txt`,bytes:new Uint8Array(8*MiB)}))})},
      {name:"worker budget >96 MiB within package limit",build:()=>({...original,documents:Array.from({length:6},(_,i)=>({...original.documents[Math.min(i,2)]!,sequence:i,role:(i===0?"FILING_INDEX":i===1?"PRIMARY_DOCUMENT":"EXHIBIT") as "EXHIBIT",locator:`/synthetic-edgar/archive/${original.cik}/${original.accession}/budget-${i}.txt`,bytes:new Uint8Array(8*MiB)}))})},
      {name:">32 documents",build:()=>({...original,documents:Array.from({length:34},(_,i)=>({...original.documents[Math.min(i,2)]!,sequence:i,role:(i===0?"FILING_INDEX":i===1?"PRIMARY_DOCUMENT":"EXHIBIT") as "EXHIBIT",locator:`/synthetic-edgar/archive/${original.cik}/${original.accession}/bounded-${i}.txt`}))})},
    ];
    for(const testCase of cases){let failure:Error|undefined;try{const batch=createSecRuntimeBatch(testCase.build());starts++;await persistSecEventProvenance(sql as never,batch);}catch(error){failure=error as Error;}expect(failure?.message,testCase.name).toBe("SEC_EVENT_RUNTIME_INPUT_INVALID");expect(starts).toBe(0);expect(failure?.message).not.toMatch(/ITEM\||agreement\.txt|secret/);const fresh=connect();try{const after=await counts(fresh);expect(after).toEqual(before);console.info("SEC_RUNTIME_G_COUNTS",JSON.stringify({case:testCase.name,stage:"pre-UoW",domainError:failure?.message,starts,repositoryCalls:0,before,after}));}finally{await fresh.end({timeout:5});}}
    for(const code of ["SEC_EVENT_PACKAGE_TIMEOUT","SEC_EVENT_REQUEST_CANCELLED"]){const sentinel=new Error(code);await expect(persistSyntheticSecEdgarFixtureProvenance(fixture(0),"postgresql://invalid",undefined,{assertCanStartTransaction(){throw sentinel;}})).rejects.toBe(sentinel);}expect(await counts(sql)).toEqual(before);
  });
  it.each(["REQUEST","REQUEST_ATTEMPT","BLOB_VERIFIED","DOCUMENT_ARTIFACTS","PACKAGE_PARENT","PACKAGE_MEMBERS","RECEIPT","LINEAGE_PARENT","LINEAGE_MEMBERS","BEFORE_COMMIT"] as const)("G: fully rolls back after %s with the original Error instance",async phase=>{
    const material=adaptSecEdgarFixtureToEntityBytes(fixture(0))!;
    const accession=`SYNTH-ACC-G-${caseId(phase).slice(0,16).toUpperCase()}`;
    const batch=createSecRuntimeBatch({...material,accession,documents:material.documents.map(d=>({...d,locator:d.locator.replace(material.accession,accession),bytes:Buffer.concat([d.bytes,Buffer.from(caseId(phase))])}))});
    const before=await counts(sql);const sentinel=new Error(`SEC_TEST_ROLLBACK_${phase}`);let starts=0;const uow=createSecEventProvenanceUnitOfWork(url!);
    try{await expect(uow.persist(batch,current=>{if(current==="TRANSACTION_STARTED")starts++;if(current===phase)throw sentinel;})).rejects.toBe(sentinel);}finally{await uow.close();}
    expect(starts).toBe(1);const fresh=connect();try{const after=await counts(fresh);expect(after).toEqual(before);console.info("SEC_RUNTIME_G_COUNTS",JSON.stringify({case:`rollback ${phase}`,stage:phase,sameErrorInstance:true,starts,before,after,rollback:true}));}finally{await fresh.end({timeout:5});}
  });
  it("G: rolls back a complete real UoW when deferred validation fails",async()=>{
    const original=adaptSecEdgarFixtureToEntityBytes(fixture(0))!;const accession=`SYNTH-ACC-G-${caseId("commit").slice(0,16).toUpperCase()}`;
    const material={...original,accession,documents:original.documents.map(d=>({...d,locator:d.locator.replace(original.accession,accession),bytes:Buffer.concat([d.bytes,Buffer.from(caseId("commit"))])})),receipt:{...original.receipt,receivedAt:"2000-01-01T00:00:00.000Z"}};
    const batch=createSecRuntimeBatch(material);const before=await counts(sql);const uow=createSecEventProvenanceUnitOfWork(url!);let beforeCommit=false;let failure:PgFailure|undefined;
    try{await uow.persist(batch,phase=>{if(phase==="BEFORE_COMMIT")beforeCommit=true;});}catch(error){failure=error as PgFailure;}finally{await uow.close();}
    expect(beforeCommit).toBe(true);expect(failure?.code).toBe("23514");expect(failure?.where).toContain("sec_event_assert_acquisition_chronology");expect(failure?.message).toBe("SEC_EVENT_ACQUISITION_CHRONOLOGY_INVALID");
    const fresh=connect();try{const after=await counts(fresh);expect(after).toEqual(before);console.info("SEC_RUNTIME_G_COUNTS",JSON.stringify({case:"deferred COMMIT validation",stage:"COMMIT",sqlState:failure?.code,function:"sec_event_assert_acquisition_chronology",beforeCommit,before,after,rollback:true}));}finally{await fresh.end({timeout:5});}
  });
  it.each(["57014","40001","40P01"])("G: propagates injected infrastructure SQLSTATE %s without retry",async state=>{
    const material=adaptSecEdgarFixtureToEntityBytes(fixture(0))!;const batch=artifactConflictBatch(material,`infrastructure-${state}`,true);const before=await counts(sql);let observed:unknown;let propagated:unknown;let calls=0;
    try{await sql.begin(async tx=>{
      await persistSecEventProvenance(tx as never,batch,async phase=>{
        if(phase!=="BLOB_VERIFIED")return;calls++;
        try{await tx.unsafe(`do $$ begin raise exception 'SEC_TEST_INFRASTRUCTURE_FAILURE' using errcode='${state}'; end $$`);}catch(error){observed=error;throw error;}
      });
    });}catch(error){propagated=error;}
    expect(propagated).toBe(observed);expect((propagated as PgFailure).code).toBe(state);expect(calls).toBe(1);
    const fresh=connect();try{const after=await counts(fresh);expect(after).toEqual(before);console.info("SEC_RUNTIME_G_COUNTS",JSON.stringify({case:`injected infrastructure ${state}`,stage:"BLOB_VERIFIED",sqlState:state,injected:true,sameErrorInstance:true,calls,retries:0,before,after,rollback:true}));}finally{await fresh.end({timeout:5});}
  });
  it("G: races fresh identical and conflicting authority scopes without sleeps or retry",async()=>{
    const material=adaptSecEdgarFixtureToEntityBytes(fixture(0))!;
    const runRace=async(left:RuntimeBatch,right:RuntimeBatch)=>{
      let starts=0;let release!:()=>void;const latch=new Promise<void>(resolve=>{release=resolve;});
      const barrier=async(phase:string)=>{if(phase!=="TRANSACTION_STARTED")return;starts++;if(starts===2)release();await latch;};
      const a=createSecEventProvenanceUnitOfWork(url!);const b=createSecEventProvenanceUnitOfWork(url!);
      try{return {outcomes:await Promise.allSettled([a.persist(left,barrier),b.persist(right,barrier)]),starts};}finally{await Promise.all([a.close(),b.close()]);}
    };
    const same=artifactConflictBatch(material,"G-concurrent-identical",true);const before=await counts(sql);
    const identical=await runRace(same,same);expect(identical.starts).toBe(2);expect(identical.outcomes.every(o=>o.status==="fulfilled")).toBe(true);expect(identical.outcomes[0]).toEqual(identical.outcomes[1]);
    const fresh=connect();try{
      const identicalCounts=await counts(fresh);const replayUow=createSecEventProvenanceUnitOfWork(url!);try{await replayUow.persist(same);}finally{await replayUow.close();}expect(await counts(fresh)).toEqual(identicalCounts);
      const seed=artifactConflictBatch(material,"G-concurrent-conflict",true);const left=createSecRuntimeBatch({...seed.material,documents:seed.material.documents.map((d,i)=>i===1?{...d,bytes:Buffer.concat([d.bytes,Buffer.from(caseId("concurrent-primary"))])}:d)});const docs=left.material.documents.map((d,i)=>i===1?{...d,bytes:Buffer.concat([d.bytes,Buffer.from([1])])}:d);const right=createSecRuntimeBatch({...left.material,documents:docs});const conflictBefore=await counts(fresh);
      const conflict=await runRace(left,right);expect(conflict.starts).toBe(2);expect(conflict.outcomes.filter(o=>o.status==="fulfilled")).toHaveLength(1);
      const rejected=conflict.outcomes.find(o=>o.status==="rejected") as PromiseRejectedResult;const error=rejected.reason as PgFailure;expect(error.message).toBe("SEC_EVENT_ACQUISITION_REQUEST_AUTHORITY_CONFLICT");expect(error.code).toBeUndefined();
      const winners=await fresh`select a.artifact_id,a.blob_id from public.sec_event_document_artifacts a where filing_identity_id=${left.filingIdentityId} and canonical_locator=${left.documents[1]!.locator}`;expect(winners).toHaveLength(1);
      const packageRows=await fresh`select package_id,member_count from public.sec_event_filing_packages where filing_identity_id=${left.filingIdentityId}`;expect(packageRows).toHaveLength(1);const winner=packageRows[0]?.package_id===left.packageId?left:right;expect(winners[0]?.artifact_id).toBe(winner.documents[1]!.artifactId);
      const loser=winner===left?right:left;const loserRows=await fresh`select blob_id from public.sec_event_content_blobs where blob_id=${loser.documents[1]!.blobId}`;expect(loserRows).toHaveLength(0);
      console.info("SEC_RUNTIME_G_COUNTS",JSON.stringify({case:"controlled concurrency",isolation:"READ COMMITTED",identical:{starts:2,before,after:identicalCounts,replay:identicalCounts,fulfilled:2},conflicting:{starts:2,before:conflictBefore,after:await counts(fresh),fulfilled:1,rejected:1,domainError:error.message,authorityKey:"request_id (stable filing scope)",stage:"AUTHORITATIVE_REREAD",winnerPackage:winner.packageId,loserBlobRows:0},retryCount:0}));
    }finally{await fresh.end({timeout:5});}
  });
  it("verifies catalog security and deferred seal constraints",async()=>{
    const catalog=await sql`select c.relname,c.relrowsecurity,(select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname)::int as policies,has_table_privilege('anon',c.oid,'select,insert,update,delete') as anon_access,has_table_privilege('authenticated',c.oid,'select,insert,update,delete') as authenticated_access,has_table_privilege('service_role',c.oid,'select,insert,update,delete') as service_role_access,exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee=0 and a.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')) as public_acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ${sql(tableNames)}`;
    expect(catalog).toHaveLength(11);expect(catalog.every(r=>r.relrowsecurity&&Number(r.policies)===0&&!r.anon_access&&!r.authenticated_access&&!r.service_role_access&&!r.public_acl)).toBe(true);
    expect(catalog.map(r=>r.relname).sort()).toEqual([...tableNames].sort());
    const columns=await sql`select table_name,column_name,data_type,is_nullable,ordinal_position from information_schema.columns where table_schema='public' and table_name in ${sql(tableNames)} order by table_name,ordinal_position`;expect(columns.length).toBeGreaterThan(70);expect(columns.some(c=>c.table_name==="sec_event_content_blobs"&&c.column_name==="entity_body"&&c.data_type==="bytea"&&c.is_nullable==="NO")).toBe(true);
    const keys=await sql`select c.conname,c.contype,c.convalidated,c.condeferrable,c.condeferred,pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and t.relname in ${sql(tableNames)} order by t.relname,c.conname`;expect(keys.length).toBeGreaterThan(40);expect(keys.filter(c=>["p","u","f"].includes(c.contype)).every(c=>c.convalidated)).toBe(true);
    const deferred=await sql`select conname,condeferrable,condeferred,convalidated from pg_constraint where conname in ('sec_event_filing_identity_amendment_deferred','sec_event_package_amendment_deferred','sec_event_filing_package_seal_deferred','sec_event_package_document_member_seal_deferred','sec_event_source_lineage_seal_deferred','sec_event_source_lineage_member_seal_deferred','sec_event_request_chronology_deferred','sec_event_attempt_chronology_deferred','sec_event_receipt_chronology_deferred')`;
    expect(deferred).toHaveLength(9);expect(deferred.every(c=>c.condeferrable&&c.condeferred&&c.convalidated)).toBe(true);const triggers=await sql`select tgname,tgdeferrable,tginitdeferred,tgenabled from pg_trigger where not tgisinternal and tgname like 'sec_event_%_deferred'`;expect(triggers).toHaveLength(9);expect(triggers.every(t=>t.tgdeferrable&&t.tginitdeferred&&t.tgenabled==='O')).toBe(true);
    const functions=await sql`select p.proname,p.prosecdef,p.proconfig,has_function_privilege('public',p.oid,'execute') as public_execute,has_function_privilege('anon',p.oid,'execute') as anon_execute,has_function_privilege('authenticated',p.oid,'execute') as auth_execute,has_function_privilege('service_role',p.oid,'execute') as service_role_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'sec_event_%'`;
    expect(functions.length).toBeGreaterThanOrEqual(4);expect(functions.every(f=>!f.prosecdef&&!f.public_execute&&!f.anon_execute&&!f.auth_execute&&!f.service_role_execute&&JSON.stringify(f.proconfig).includes('search_path=public, pg_temp'))).toBe(true);
    const immutable=await sql`select count(*)::int as count from pg_trigger where not tgisinternal and tgname like 'sec_event_%_immutable' and tgenabled='O'`;expect(immutable[0]?.count).toBe(11);
    const views=await sql`select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'sec_event_%' and c.relkind in ('v','m')`;expect(views).toEqual([]);
    const unvalidated=await sql`select conname from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and t.relname like 'sec_event_%' and c.contype in ('p','u','f') and not c.convalidated`;expect(unvalidated).toEqual([]);
    const fkIndexes=await sql`select c.conname from pg_constraint c join pg_class child on child.oid=c.conrelid join pg_namespace n on n.oid=child.relnamespace where n.nspname='public' and child.relname like 'sec_event_%' and c.contype='f' and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid and i.indpred is null and i.indnkeyatts>=cardinality(c.conkey) and (select array_agg(i.indkey[pos] order by pos) from generate_series(0,cardinality(c.conkey)-1) pos)=c.conkey)`;expect(fkIndexes).toEqual([]);
    const duplicateIndexes=await sql`select indexrelid::regclass::text as index_name,indrelid::regclass::text as table_name,indkey::text as keys,count(*) over(partition by indrelid,indkey) as copies from pg_index where indrelid in (select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ${sql(tableNames)})`;expect(duplicateIndexes.filter(r=>Number(r.copies)>1)).toEqual([]);
    expect(keys.filter(c=>["p","u","f","c"].includes(c.contype)).every(c=>c.convalidated)).toBe(true);
    // Compare every column and ordered composite FK to the actual migration,
    // including types/nullability, rather than trusting only row counts.
    const migration=readFileSync(new URL("../../supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql",import.meta.url),"utf8");
    const physicalColumns=await sql`select c.relname,a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ${sql(tableNames)} and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum`;
    const fkDefinitions=await sql`select c.conname,child.relname as child,parent.relname as parent,c.condeferrable,array(select a.attname from unnest(c.conkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by k.ord) as child_columns,array(select a.attname from unnest(c.confkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num order by k.ord) as parent_columns from pg_constraint c join pg_class child on child.oid=c.conrelid join pg_class parent on parent.oid=c.confrelid where child.relname in ${sql(tableNames)} and c.contype='f' order by child.relname,c.conname`;
    const identityKeys=await sql`select t.relname,c.conname,c.contype,array(select a.attname from unnest(c.conkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by k.ord) as columns from pg_constraint c join pg_class t on t.oid=c.conrelid where t.relname in ${sql(tableNames)} and c.contype in ('p','u')`;
    const typeMap:Record<string,string>={text:"text",jsonb:"jsonb",integer:"integer",boolean:"boolean",date:"date",bytea:"bytea",timestamptz:"timestamp with time zone","char(64)":"character(64)"};
    for(const descriptor of createCanonicalSecEventSourceProvenanceDecision("2026-10-02T00:00:00.000Z").authorityTables.filter(t=>t.persistence==="REQUIRED")){
      for(const column of descriptor.columns)expect(physicalColumns.some(c=>c.relname===descriptor.name&&c.attname===column.name&&c.type===typeMap[column.type]),`${descriptor.name}.${column.name}: merged descriptor`).toBe(true);
      expect(identityKeys.some(k=>k.relname===descriptor.name&&k.contype==='p'&&JSON.stringify(k.columns)===JSON.stringify(descriptor.primaryKey)),`${descriptor.name}: PK`).toBe(true);
      for(const key of descriptor.uniqueKeys)expect(identityKeys.some(k=>k.relname===descriptor.name&&JSON.stringify(k.columns)===JSON.stringify(key)),`${descriptor.name}: UNIQUE (${key.join(',')})`).toBe(true);
    }
    for(const table of tableNames){
      const body=migration.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`))![1]!;
      let depth=0;let start=0;const clauses:string[]=[];for(let i=0;i<body.length;i++){if(body[i]==="(")depth++;if(body[i]===")")depth--;if(body[i]===","&&depth===0){clauses.push(body.slice(start,i).trim());start=i+1;}}clauses.push(body.slice(start).trim());
      const primary=clauses.find(c=>c.startsWith("primary key("))?.match(/primary key\(([^)]+)\)/)?.[1]?.split(",").map(c=>c.trim())??[];
      const expected=clauses.flatMap(c=>{const match=c.match(/^(\w+)\s+(char\(64\)|text|jsonb|integer|boolean|date|bytea|timestamptz)/);return match?[{relname:table,attname:match[1],type:typeMap[match[2]!],attnotnull:/not null|primary key/.test(c)||primary.includes(match[1]!)}]:[];});
      expect(physicalColumns.filter(c=>c.relname===table).map(c=>({...c})),table).toEqual(expected);
      for(const fk of clauses.filter(c=>c.startsWith("foreign key("))){const match=fk.match(/foreign key\(([^)]+)\)\s*references public\.(\w+)\(([^)]+)\)/)!;const childColumns=match[1]!.split(",").map(c=>c.trim());const parentColumns=match[3]!.split(",").map(c=>c.trim());expect(fkDefinitions.some(f=>f.child===table&&f.parent===match[2]&&JSON.stringify(f.child_columns)===JSON.stringify(childColumns)&&JSON.stringify(f.parent_columns)===JSON.stringify(parentColumns)&&!f.condeferrable),fk).toBe(true);}
    }
    const baselineFunctions=await sql`select proname,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname='reject_intelligence_mutation'`;
    console.info("SEC_RUNTIME_CATALOG",JSON.stringify({tables:catalog,columns:physicalColumns,constraints:keys,foreignKeys:fkDefinitions,deferredTriggers:triggers,functions,baselineFunctions,immutableCount:immutable[0]?.count,uncoveredForeignKeys:fkIndexes,duplicateIndexes:[],views}));
  });
  it("rejects UPDATE and DELETE on every persisted authority table",async()=>{
    const keys:Record<string,string>={sec_event_source_profiles:"profile_id",sec_event_filing_identities:"filing_identity_id",sec_event_acquisition_requests:"request_id",sec_event_acquisition_attempts:"attempt_id",sec_event_content_blobs:"blob_id",sec_event_document_artifacts:"artifact_id",sec_event_filing_packages:"package_id",sec_event_package_document_members:"package_id",sec_event_acquisition_receipts:"receipt_id",sec_event_source_lineages:"lineage_id",sec_event_source_lineage_members:"lineage_id"};
    for(const table of tableNames){const key=keys[table]!;const row=await sql.unsafe(`select ${key} as authority_key from public.${table} limit 1`);expect(row.length,table).toBeGreaterThan(0);for(const operation of ["update","delete"]){const before=await counts(sql);let error:PgFailure|undefined;try{await sql.begin(async tx=>{if(operation==="update")await tx.unsafe(`update public.${table} set ${key}=${key} where ${key}=$1`,[row[0]?.authority_key]);else await tx.unsafe(`delete from public.${table} where ${key}=$1`,[row[0]?.authority_key]);});}catch(caught){error=caught as PgFailure;}expect(error?.code,`${operation} ${table}`).toBe("55000");expect(error?.message,`${operation} ${table}`).toContain("SEC_EVENT_IMMUTABLE_AUTHORITY");expect(error?.where).toContain("sec_event_reject_mutation");const fresh=connect();try{const after=await counts(fresh);expect(after).toEqual(before);console.info("SEC_RUNTIME_G_COUNTS",JSON.stringify({case:`${operation} ${table}`,stage:operation.toUpperCase(),sqlState:error?.code,function:"sec_event_reject_mutation",trigger:`${table}_immutable`,before,after,rollback:true}));}finally{await fresh.end({timeout:5});}}}
  });
});
