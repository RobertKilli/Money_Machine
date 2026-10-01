import { describe, expect, it } from "vitest";
import { createCanonicalSecEventSourceProvenanceDecision, isAuthenticSecEdgarEventSourceProvenanceDecision, parseSecEdgarEventSourceProvenanceDecision } from "@/domain/intelligence/sec-edgar-event-source-provenance-decision";
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
  });
  it("rejects a self-hashed schema mutation that breaks external parent bindings",()=>{
    const altered=structuredClone(decision()) as Record<string,unknown>; const schemas=altered.authorityTables as {name:string;columns:{name:string;type:string}[]}[]; schemas[0]!.columns[0]!.type="uuid";
    const material={...altered}; delete material.recordedAt; delete material.fingerprint; altered.fingerprint=canonicalSha256(material);
    expect(()=>parseSecEdgarEventSourceProvenanceDecision(altered)).toThrow("SEC_EVENT_PROVENANCE_DECISION_INVALID");
  });
  it("binds document bytes and package membership separately from receipt identity",()=>{
    const value=decision(); expect(value.authorityMaterial.document).toContain("canonicalUtf8BytesSha256");
    expect(value.authorityMaterial.package).toContain("amendmentParentIdentity"); expect(value.authorityMaterial.receipt).toContain("retrievedAt");
    expect(value.authorityMaterial.document).not.toContain("retrievedAt");
  });
  it("keeps event, issuer-evidence, and asset-mapping lineage scopes separate",()=>{
    const value=decision(); expect(value.downstreamBindings.map(x=>x.role)).toEqual(["event_source_provenance","issuer_evidence_provenance","asset_mapping_provenance"]);
    expect(value.downstreamBindings[0]!.excludes).toContain("AssetMappingRevision lineage"); expect(value.downstreamBindings[1]!.excludes).toContain("untyped referenceId as lineage ID");
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
});
