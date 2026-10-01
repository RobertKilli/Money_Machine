import { describe, expect, it } from "vitest";
import { createCanonicalSecEventSourceProvenanceDecision, isAuthenticSecEdgarEventSourceProvenanceDecision, parseSecEdgarEventSourceProvenanceDecision, secEventDocumentArtifactFingerprint, secEventDocumentArtifactId, secEventDocumentContentSha256, secEventFilingPackageFingerprint, secEventFilingPackageId } from "@/domain/intelligence/sec-edgar-event-source-provenance-decision";
import { createHash } from "node:crypto";
import { SEC_EDGAR_8K_SYNTHETIC_FIXTURES } from "../fixtures/sec-edgar-8k-fixture-claim-pipeline";
import { runSecEdgar8kFixtureClaimPipeline } from "@/domain/intelligence/sec-edgar-8k-fixture-claim-pipeline";
import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";

const at="2026-10-02T10:00:00.000Z";
const decision=()=>createCanonicalSecEventSourceProvenanceDecision(at);

describe("SEC event source provenance decision",()=>{
  it("selects a provider-neutral SEC document authority (option C) and fails production closed",()=>{
    const value=decision(); expect(value.selectedOption).toBe("C"); expect(value.rejectedOptions.map(x=>x.option)).toEqual(["A","B"]);
    expect(value.persistence).toEqual({liveAcquisition:"BLOCKED",sourceArtifact:"BLOCKED",eventLineage:"BLOCKED",issuerEvidence:"BLOCKED",eventAuthority:"BLOCKED",scheduler:"BLOCKED",signals:"BLOCKED",trading:"BLOCKED"});
    expect(isAuthenticSecEdgarEventSourceProvenanceDecision(value)).toBe(true); expect(Object.isFrozen(value.authorityTables[0]!.columns[0])).toBe(true);
  });
  it("round-trips deterministically while recordedAt remains outside identity",()=>{
    const a=decision(), b=createCanonicalSecEventSourceProvenanceDecision("2026-10-03T10:00:00.000Z");
    expect(a.fingerprint).toBe(b.fingerprint); expect(parseSecEdgarEventSourceProvenanceDecision(JSON.parse(JSON.stringify(a))).fingerprint).toBe(a.fingerprint);
  });
  it("rejects unknown, accessor, inherited, and symbol properties",()=>{
    const base=decision(); expect(()=>parseSecEdgarEventSourceProvenanceDecision({...base,providerExternalRecordId:"not authority"})).toThrow("SEC_EVENT_PROVENANCE_DECISION_INVALID");
    const accessor=Object.create(null); Object.defineProperty(accessor,"recordedAt",{get(){throw Error("sentinel");}}); expect(()=>parseSecEdgarEventSourceProvenanceDecision(accessor)).toThrow("SEC_EVENT_PROVENANCE_DECISION_INVALID");
    const inherited=Object.assign(Object.create({hidden:true}),base); expect(()=>parseSecEdgarEventSourceProvenanceDecision(inherited)).toThrow("SEC_EVENT_PROVENANCE_DECISION_INVALID");
    const symbol={...base,[Symbol("extra")]:true}; expect(()=>parseSecEdgarEventSourceProvenanceDecision(symbol)).toThrow("SEC_EVENT_PROVENANCE_DECISION_INVALID");
    const proxy=new Proxy(base,{get(){throw Error("must not inspect proxy traps");},ownKeys(){throw Error("must not enumerate proxy traps");}}); expect(()=>parseSecEdgarEventSourceProvenanceDecision(proxy)).toThrow("SEC_EVENT_PROVENANCE_DECISION_INVALID");
  });
  it("rejects a self-hashed schema mutation that breaks external parent bindings",()=>{
    const altered=structuredClone(decision()) as Record<string,unknown>; const schemas=altered.authorityTables as {name:string;columns:{name:string;type:string}[]}[]; schemas[0]!.columns[0]!.type="uuid";
    const material={...altered}; delete material.recordedAt; delete material.fingerprint; altered.fingerprint=canonicalSha256(material);
    expect(()=>parseSecEdgarEventSourceProvenanceDecision(altered)).toThrow("SEC_EVENT_PROVENANCE_DECISION_INVALID");
  });
  it("binds document bytes and package membership separately from receipt identity",()=>{
    const value=decision(); expect(value.authorityMaterial.document).toContain("exactEntityBodyOctetsSha256");
    expect(value.authorityMaterial.package).toContain("amendmentParentFilingIdentityId"); expect(value.authorityMaterial.receipt).toContain("retrievedAt");
    expect(value.authorityMaterial.document).not.toContain("retrievedAt");
  });
  it("defines the hashed octet layer and blocks byte custody until immutable readback is approved",()=>{
    const value=decision();
    expect(value.byteIdentityPolicy.hashedLayer).toContain("before content decoding or character decoding");
    expect(value.byteIdentityPolicy.acceptedContentEncoding).toEqual(["identity","absent"]);
    expect(value.byteIdentityPolicy.newlineNormalization).toBe("NONE; CR, LF and CRLF octets remain distinct in the document hash.");
    expect(value.byteIdentityPolicy.unicodeNormalization).toContain("never NFC/NFD");
    expect(value.byteIdentityPolicy.storageStatus).toBe("BLOCKED_BACKEND_UNSELECTED");
    expect(value.byteIdentityPolicy.requiredStorageReadback).toContain("reread exact stored octets");
    expect(value.persistenceClassification.find(x=>x.object==="immutable document bytes and artifact metadata")?.classification).toBe("PERSISTED");
    expect(value.persistence.sourceArtifact).toBe("BLOCKED");
  });
  it("hashes exact entity bytes independently of receipt and extraction text",()=>{
    const bytes=Buffer.from("<p>line\r\nvalue</p>","utf8");
    const contentSha=secEventDocumentContentSha256(bytes);
    const base={filingIdentityId:"sha256:filing-scope-01",canonicalLocator:"/Archives/edgar/data/0000000001/000000000126000001/primary.htm",documentRole:"PRIMARY_DOCUMENT" as const,documentType:"HTML",contentSha256:contentSha,contentType:"text/html",byteLength:bytes.byteLength,sequenceOrdinal:1,canonicalizationVersion:"sec-document-entity-octets/v1" as const};
    expect(secEventDocumentArtifactFingerprint(base)).toBe(secEventDocumentArtifactFingerprint({...base}));
    const artifactFingerprint=secEventDocumentArtifactFingerprint(base); expect(secEventDocumentArtifactId(artifactFingerprint)).toBe(secEventDocumentArtifactId(artifactFingerprint));
    const newlineVariant=Buffer.from("<p>line\nvalue</p>","utf8");
    expect(secEventDocumentContentSha256(newlineVariant)).not.toBe(contentSha);
    expect(secEventDocumentArtifactFingerprint({...base,contentSha256:secEventDocumentContentSha256(newlineVariant),byteLength:newlineVariant.byteLength})).not.toBe(secEventDocumentArtifactFingerprint(base));
  });
  it("keeps artifact identity independent of package revision and seals package membership without a fingerprint cycle",()=>{
    const value=decision();
    expect(value.authorityMaterial.document).toContain("filingIdentityId");
    expect(value.authorityMaterial.document).not.toContain("filingPackageFingerprint");
    expect(value.authorityTables.find(x=>x.name==="sec_event_package_document_members")).toBeDefined();
    expect(value.authorityTables.find(x=>x.name==="sec_event_source_lineage_members")).toBeDefined();
    const members=[
      {ordinal:0,artifactId:"index-01",artifactFingerprint:"a".repeat(64),canonicalLocator:"/Archives/edgar/data/0000000001/000000000126000001/index.json",documentRole:"FILING_INDEX" as const,sequenceOrdinal:0,byteLength:10},
      {ordinal:1,artifactId:"primary-01",artifactFingerprint:"b".repeat(64),canonicalLocator:"/Archives/edgar/data/0000000001/000000000126000001/primary.htm",documentRole:"PRIMARY_DOCUMENT" as const,sequenceOrdinal:1,byteLength:10},
      {ordinal:2,artifactId:"exhibit-01",artifactFingerprint:"c".repeat(64),canonicalLocator:"/Archives/edgar/data/0000000001/000000000126000001/exhibit.htm",documentRole:"EXHIBIT" as const,sequenceOrdinal:2,byteLength:10},
    ];
    const packageInput={filingIdentityId:"sha256:filing-scope-01",filingDate:"2026-04-10",acceptanceAt:at,reportPeriod:"2026-03-31",filingIndexArtifactFingerprint:"a".repeat(64),members};
    const first=secEventFilingPackageFingerprint(packageInput);
    const firstId=secEventFilingPackageId(packageInput.filingIdentityId,first);
    const reordered=secEventFilingPackageFingerprint({...packageInput,members:[members[2]!,members[0]!,members[1]!]});
    expect(reordered).toBe(first);
    const changedExhibit=secEventFilingPackageFingerprint({...packageInput,members:[members[0]!,members[1]!,{...members[2]!,artifactId:"exhibit-02",artifactFingerprint:"d".repeat(64)}]});
    expect(changedExhibit).not.toBe(first);
    expect(secEventFilingPackageId(packageInput.filingIdentityId,changedExhibit)).not.toBe(firstId);
    expect(secEventDocumentArtifactFingerprint({filingIdentityId:packageInput.filingIdentityId,canonicalLocator:members[1]!.canonicalLocator,documentRole:"PRIMARY_DOCUMENT",documentType:"HTML",contentSha256:"b".repeat(64),contentType:"text/html",byteLength:12,sequenceOrdinal:1,canonicalizationVersion:"sec-document-entity-octets/v1"})).toBe(secEventDocumentArtifactFingerprint({filingIdentityId:packageInput.filingIdentityId,canonicalLocator:members[1]!.canonicalLocator,documentRole:"PRIMARY_DOCUMENT",documentType:"HTML",contentSha256:"b".repeat(64),contentType:"text/html",byteLength:12,sequenceOrdinal:1,canonicalizationVersion:"sec-document-entity-octets/v1"}));
    expect(()=>secEventFilingPackageFingerprint({...packageInput,members:[members[0]!,members[1]!,members[2]!,{...members[2]!,ordinal:3}]})).toThrow("SEC_EVENT_PACKAGE_MEMBERS_INVALID");
    expect(()=>secEventFilingPackageFingerprint({...packageInput,members:[members[0]!,members[1]!,{...members[2]!,canonicalLocator:"/../../escape"}]})).toThrow("SEC_EVENT_PACKAGE_MEMBERS_INVALID");
  });
  it("keeps the M5 parent-key catalog exact and selects its own SEC profile authority",()=>{
    const value=decision(); const byName=new Map(value.authorityTables.map(x=>[x.name,x]));
    const datasets=byName.get("intelligence_datasets")!; expect(datasets.primaryKey).toEqual(["dataset_id"]); expect(datasets.uniqueKeys).toContainEqual(["dataset_id","provider_id","dataset_version"]);
    const artifacts=byName.get("intelligence_source_artifacts")!; expect(artifacts.uniqueKeys).toContainEqual(["source_artifact_id","payload_fingerprint"]); expect(artifacts.uniqueKeys).toContainEqual(["source_artifact_id","provider_id","dataset_id","dataset_version"]); expect(artifacts.uniqueKeys.some(x=>x.includes("source_artifact_fingerprint"))).toBe(false);
    const lineages=byName.get("intelligence_source_lineages")!; expect(lineages.uniqueKeys).toEqual([["source_lineage_id","provider_id","dataset_id","dataset_version"]]);
    const members=byName.get("intelligence_source_lineage_members")!; expect(members.primaryKey).toEqual(["source_lineage_id","member_ordinal"]); expect(members.uniqueKeys).toEqual([["source_lineage_id","availability_claim_id"]]);
    expect(byName.get("intelligence_asset_mapping_revisions")!.uniqueKeys).toContainEqual(["mapping_revision_id","source_lineage_id","provider_id","dataset_id","dataset_version","canonical_asset_id","canonical_identifier","asset_class"]);
    expect(byName.get("sec_event_source_profiles")!.persistence).toBe("REQUIRED");
    expect(byName.get("sec_event_filing_packages")!.foreignKeys.some(x=>x.parent==="intelligence_datasets")).toBe(false);
  });
  it("keeps event, issuer-evidence, and asset-mapping lineage scopes separate",()=>{
    const value=decision(); expect(value.downstreamBindings.map(x=>x.role)).toEqual(["event_source_provenance","issuer_evidence_provenance","asset_mapping_provenance"]);
    expect(value.downstreamBindings[0]!.excludes).toContain("M5 SourceLineage and AssetMappingRevision lineage"); expect(value.downstreamBindings[1]!.excludes).toContain("untyped referenceId as lineage ID");
    expect(value.downstreamBindings[2]!.excludes).toContain("SEC source lineage");
  });
  it("does not treat manual M5 external record id as SEC artifact authority",()=>{
    const value=decision(); const artifact=value.existingObjects.find(x=>x.table==="intelligence_source_artifacts")!;
    expect(artifact.identityMaterial).toContain("provider_external_record_id"); expect(artifact.canonicalDocumentBytes).toBe("NO");
    expect(artifact.reuse).toBe("VALID_WITH_EXPLICIT_BINDING"); expect(value.rejectedOptions[1]!.reason).toContain("external IDs do not prove byte-equivalence");
  });
  it("does not classify market observations or asset mapping lineage as SEC document provenance",()=>{
    const value=decision(); expect(value.existingObjects.find(x=>x.table==="market_observations")!.reuse).toBe("INVALID"); expect(value.existingObjects.find(x=>x.table==="intelligence_asset_mapping_revisions")!.reuse).toBe("INVALID");
    expect(value.authorityTables.map(x=>x.name)).toContain("sec_event_document_artifacts");
  });
  it("keeps an unchanged primary artifact stable when an exhibit changes, while re-identifying the package",()=>{
    const source=SEC_EDGAR_8K_SYNTHETIC_FIXTURES[0]!;
    const before=runSecEdgar8kFixtureClaimPipeline([source]); expect(before.status).toBe("VALID"); if(before.status!=="VALID")return;
    const changed=structuredClone(source) as {documents:{filename:string;content:string}[];filingIndex:{documents:{filename:string;byteLength:number;contentSha256:string}[]}}; const exhibit=changed.documents.find(x=>x.filename==="schedule.txt")!; exhibit.content=exhibit.content.replace("SCHEDULE-0001","SCHEDULE-0002");
    const canonical=exhibit.content.replace(/\r\n/g,"\n").normalize("NFC"); const descriptor=changed.filingIndex.documents.find(x=>x.filename==="schedule.txt")!; descriptor.byteLength=Buffer.byteLength(canonical,"utf8"); descriptor.contentSha256=createHash("sha256").update(Buffer.from(canonical,"utf8")).digest("hex");
    const after=runSecEdgar8kFixtureClaimPipeline([changed]); expect(after.status).toBe("VALID"); if(after.status!=="VALID")return;
    expect(after.filings[0]!.filingPackageId).not.toBe(before.filings[0]!.filingPackageId);
    expect(after.artifacts.find(x=>x.kind==="PRIMARY_DOCUMENT")!.artifactId).toBe(before.artifacts.find(x=>x.kind==="PRIMARY_DOCUMENT")!.artifactId);
  });
  it("preserves original and binds amendment to its immutable parent",()=>{
    const output=runSecEdgar8kFixtureClaimPipeline(SEC_EDGAR_8K_SYNTHETIC_FIXTURES); expect(output.status).toBe("VALID"); if(output.status!=="VALID")return;
    expect(output.correctionLineage).toHaveLength(1); const edge=output.correctionLineage[0]!;
    expect(output.claims.some(x=>x.claimId===edge.originalClaimId)).toBe(true); expect(output.claims.some(x=>x.claimId===edge.amendedClaimId)).toBe(true);
    expect(output.filings.find(x=>x.filingPackageId===edge.amendmentFilingPackageId)?.amendmentOfFilingPackageId).toBe(edge.originalFilingPackageId);
  });
  it("keeps production source, storage, lineage, scheduler, signal and trading blocked",()=>{
    const value=decision(); expect(value.persistence).toEqual({liveAcquisition:"BLOCKED",sourceArtifact:"BLOCKED",eventLineage:"BLOCKED",issuerEvidence:"BLOCKED",eventAuthority:"BLOCKED",scheduler:"BLOCKED",signals:"BLOCKED",trading:"BLOCKED"});
    expect(value.schemaRules.rls).toEqual({enabled:true,policyCount:0,revokedFrom:["PUBLIC","anon","authenticated"],views:false,clientAccess:false});
    expect(value.schemaRules.invariantFunctions.security).toBe("INVOKER"); expect(value.schemaRules.invariantFunctions.securityDefiner).toBe(false);
  });
});
