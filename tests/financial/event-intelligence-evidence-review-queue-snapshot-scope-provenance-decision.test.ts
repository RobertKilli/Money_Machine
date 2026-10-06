import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EVIDENCE_QUEUE_PROVENANCE_FAMILIES,
  EVIDENCE_QUEUE_SCOPE_PROVENANCE_PRODUCTION_CONFIG,
  getEvidenceQueueScopeProvenanceDecision,
  getEvidenceQueueScopeProvenanceProductionConfig,
  parseEvidenceQueueProvenanceReference,
  parseEvidenceQueueScopeProvenanceDecision,
  parseEvidenceQueueScopeProvenanceProductionConfig,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-scope-provenance-decision";

const RECORDED = "2026-10-03T12:00:00.000Z";
const get = (at = RECORDED) => getEvidenceQueueScopeProvenanceDecision(at);
function canonical(v: unknown): string { if (v === null || typeof v !== "object") return JSON.stringify(v); if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`; const o=v as Record<string,unknown>; return `{${Object.keys(o).sort((a,b)=>a<b?-1:a>b?1:0).map(k=>`${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`; }
function reseal(v: Record<string,unknown>): Record<string,unknown> { const m={...v}; delete m.decisionId; delete m.fingerprint; delete m.recordedAt; const fingerprint=createHash("sha256").update(`event-intelligence-evidence-review-queue-snapshot-scope-decision/v1\0${canonical(m)}`,"utf8").digest("hex"); return {...m,decisionId:`event-queue-scope-provenance:${fingerprint}`,fingerprint,recordedAt:RECORDED}; }

describe("evidence review queue snapshot scope/provenance decision", () => {
  it("selects a blocked explicit review-universe scope and excludes presentation/cutoff data", () => {
    const d=get();
    expect(d.selectedScopeModel).toBe("EXPLICIT_VERSIONED_REVIEW_UNIVERSE");
    expect(d.scopePolicy.identityFields).toContain("sourcePortfolioDecisionVersionAndMaterial");
    expect(d.scopePolicy.excludedFields).toContain("uiStatusFilter");
    expect(d.scopePolicy.excludedFields).toContain("evaluationAsOf");
    expect(d.scopePolicy.identityEncoding).toContain("eviqs1_");
    expect(d.scopePolicy.canonicalRules.join(" ")).toContain("duplicates reject");
    expect(d.scopePolicy.canonicalRules.join(" ")).toContain("version plus canonical material identity/fingerprint");
    expect(d.scopeAlternatives.map(x=>x.disposition)).toEqual(["REJECTED_V1","INSUFFICIENT_ALONE","INSUFFICIENT_ALONE","RECOMMENDED_LOGICAL_V1_SCOPE_BLOCKED_FOR_RUNTIME"]);
    expect(d.scopePolicy.currentSelection).toContain("exact snapshotIdentity");
  });

  it("has deterministic material identity, excluding recordedAt, and deep-freezes parsed material", () => {
    const a=get(), b=get("2026-10-03T13:00:00.000Z");
    expect(a.fingerprint).toBe(b.fingerprint); expect(a.decisionId).toBe(b.decisionId); expect(a.recordedAt).not.toBe(b.recordedAt);
    expect(Object.isFrozen(a)).toBe(true); expect(Object.isFrozen(a.provenanceFamilies[0]?.referenceSchema)).toBe(true);
    expect(parseEvidenceQueueScopeProvenanceDecision(JSON.parse(JSON.stringify(a)))).toMatchObject({status:"VALID"});
    expect(parseEvidenceQueueScopeProvenanceDecision(reseal({...a,selectedScopeModel:"JURISDICTION_SCOPE"})).status).toBe("INVALID");
  });

  it("closes provenance family union and separates applied, design-only and derived references", () => {
    const d=get();
    expect(d.provenanceFamilies.map(x=>x.family)).toEqual(EVIDENCE_QUEUE_PROVENANCE_FAMILIES);
    expect(d.provenanceFamilies.find(x=>x.family==="SEC_EVENT_DOCUMENT")?.authorityStatus).toContain("APPLIED_PERSISTED");
    expect(d.provenanceFamilies.find(x=>x.family==="ISSUER_EVIDENCE")?.authorityStatus).toContain("UNSUPPORTED_UNIMPLEMENTED");
    expect(d.provenanceFamilies.find(x=>x.family==="DERIVED_QUEUE_SET")?.authorityStatus).toBe("DERIVED_NON_AUTHORITATIVE");
    expect(d.unsupportedParents.some(x=>x.family==="DISCOVERY_SOURCE_RECORD")).toBe(true);
    expect(d.memberPolicy.origin).toContain("not corroboration");
  });

  it("validates family-tagged exact reference shapes without granting parent authority", () => {
    const sha="a".repeat(64);
    const refs: Record<string,unknown>[]=[
      {family:"SEC_EVENT_DOCUMENT",schemaVersion:"sec-event-document-reference/v1",targetKind:"PROFILE",key:{profile_id:"sec-event/v1",fingerprint:sha}},
      {family:"ISSUER_EVIDENCE",schemaVersion:"issuer-evidence-reference/v1",issuerEvidenceContractVersion:"event-intelligence-issuer-evidence/v1",evidenceMaterialIdentity:sha,sourceOriginBinding:sha},
      {family:"ASSET_MAPPING_REVISION",schemaVersion:"m5-asset-mapping-reference/v1",mapping_revision_id:"mapping-1",source_lineage_id:"lineage-1",provider_id:"PROVIDER",dataset_id:"dataset",dataset_version:"dataset/v1",canonical_asset_id:"asset-1",canonical_identifier:"ETH",asset_class:"CRYPTO"},
      {family:"DISCOVERY_SOURCE_RECORD",schemaVersion:"discovery-source-record-reference/v1",sourceType:"GDELT",localCandidateIdentity:sha,materialVariantIdentity:sha,receiptIdentity:sha},
      {family:"CORRECTION_LINEAGE",schemaVersion:"correction-lineage-reference/v1",lineageContractVersion:"event-intelligence-correction-lineage/v1",rootClaimIdentity:sha,orderedMemberIdentities:[sha],selectedTerminalIdentity:sha,evaluationAsOf:"2026-10-03T12:00:00.000Z"},
      {family:"DERIVED_COMPOSITION",schemaVersion:"derived-composition-reference/v1",compositionContractVersion:"event-intelligence-evidence-review-queue-composition/v1",compositionMaterialIdentity:sha},
      {family:"DERIVED_QUEUE_SET",schemaVersion:"derived-queue-set-reference/v1",queueContractVersion:"event-intelligence-evidence-review-queue-contract/v1",queueSetMaterialIdentity:sha,sealedMemberSetIdentity:sha},
      {family:"DERIVED_VIEW_MODEL",schemaVersion:"derived-view-model-reference/v1",viewModelContractVersion:"event-intelligence-evidence-review-queue-view-model/v1",safePayloadDigest:sha,payloadLength:12},
    ];
    for (const ref of refs) expect(parseEvidenceQueueProvenanceReference(ref).status).toBe("VALID_SYNTAX_ONLY");
    expect(parseEvidenceQueueProvenanceReference({...refs[0],family:"DISCOVERY_SOURCE_RECORD"}).status).toBe("INVALID");
    expect(parseEvidenceQueueProvenanceReference({...refs[4],lineageContractVersion:"correction-lineage/v99"}).status).toBe("INVALID");
    expect(parseEvidenceQueueProvenanceReference({...refs[2],source_lineage_id:undefined}).status).toBe("INVALID");
    expect(parseEvidenceQueueProvenanceReference({...refs[2],unexpected:"x"}).status).toBe("INVALID");
    let traps=0;
    expect(parseEvidenceQueueProvenanceReference({...refs[3],sourceType:{[Symbol.toPrimitive](){traps++;throw Error("TRAP");}}}).status).toBe("INVALID");
    const nestedGetter={family:"SEC_EVENT_DOCUMENT",schemaVersion:"sec-event-document-reference/v1",targetKind:"PROFILE",key:Object.defineProperty({profile_id:"sec-event/v1"},"fingerprint",{enumerable:true,get(){traps++;return sha;}})};
    expect(parseEvidenceQueueProvenanceReference(nestedGetter).status).toBe("INVALID");
    const sparse=[sha,,]; expect(parseEvidenceQueueProvenanceReference({...refs[4],orderedMemberIdentities:sparse}).status).toBe("INVALID");
    expect(parseEvidenceQueueProvenanceReference({family:"FUTURE_FAMILY",schemaVersion:"future/v1"}).status).toBe("INVALID");
    const valid=parseEvidenceQueueProvenanceReference(refs[0]); expect(valid).toMatchObject({status:"VALID_SYNTAX_ONLY"});
    if(valid.status==="VALID_SYNTAX_ONLY") { expect(Object.isFrozen(valid.reference)).toBe(true); expect(Object.isFrozen(valid.reference.key)).toBe(true); }
    expect(traps).toBe(0);
  });

  it("matches applied SEC and M5 parent keys without inventing event parents", () => {
    const d=get(), sec=readFileSync("supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql","utf8").replace(/\s+/g," ");
    const m5=readFileSync("supabase/migrations/20260918215043_m5_raw_source_lineage.sql","utf8").replace(/\s+/g," ");
    const m5Assertion=readFileSync("supabase/migrations/20260918234933_m5_provider_asset_identity.sql","utf8").replace(/\s+/g," ");
    const m5Assessment=readFileSync("supabase/migrations/20260920161300_m5_suspicious_assessment_authority.sql","utf8").replace(/\s+/g," ");
    const migrations=readdirSync("supabase/migrations").filter(n=>n.endsWith(".sql")).map(n=>readFileSync(`supabase/migrations/${n}`,"utf8")).join("\n");
    expect(sec).toContain("create table public.sec_event_acquisition_receipts");
    expect(sec).toContain("unique(lineage_id,fingerprint)");
    expect(sec).toContain("unique(artifact_id,fingerprint)");
    expect(m5).toContain("unique (mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class)");
    expect(m5Assertion).toContain("alter table public.intelligence_asset_mapping_revisions add column provider_asset_identity_assertion_id text not null");
    expect(m5Assertion).toContain("intelligence_asset_mapping_identity_assertion_fk");
    expect(m5Assessment).toContain("intelligence_asset_mapping_assessment_authority_key");
    expect(m5Assessment).toContain("eligibility_suspicious_assessments_mapping_fk");
    expect(d.appliedParentCatalog.find(x=>x.table==="intelligence_asset_mapping_revisions")?.key).toHaveLength(8);
    expect(migrations).not.toContain("create table public.event_issuer_mapping_authorities");
    expect(migrations).not.toContain("create table public.event_claims");
    expect(migrations).not.toContain("event_intelligence_evidence_review_queue_snapshots");
    expect(d.unsupportedParents.map(x=>x.family)).toContain("CORRECTION_LINEAGE");
  });

  it("rejects caller-controlled unsafe shapes without running getters or proxy traps", () => {
    const d=get(); let calls=0;
    expect(parseEvidenceQueueScopeProvenanceDecision({...d,extra:true}).status).toBe("INVALID");
    const getter={...d,get status(){calls++;return d.status;}};
    expect(parseEvidenceQueueScopeProvenanceDecision(getter).status).toBe("INVALID");
    const symbol={...d,[Symbol("extra")]:true}; expect(parseEvidenceQueueScopeProvenanceDecision(symbol).status).toBe("INVALID");
    const inherited=Object.assign(Object.create({polluted:true}),d); expect(parseEvidenceQueueScopeProvenanceDecision(inherited).status).toBe("INVALID");
    const sparse=new Array((d.references as readonly unknown[]).length); expect(parseEvidenceQueueScopeProvenanceDecision({...d,references:sparse}).status).toBe("INVALID");
    const proxy=new Proxy(d,{ownKeys(){calls++;throw Error("SENTINEL");},get(){calls++;throw Error("SENTINEL");}});
    expect(parseEvidenceQueueScopeProvenanceDecision(proxy).status).toBe("INVALID"); expect(calls).toBe(0);
    expect(parseEvidenceQueueScopeProvenanceDecision({...d,recordedAt:"2026-10-03T12:00:00Z"}).status).toBe("INVALID");
  });

  it("keeps the production decision unselectable and fail-closed", () => {
    const config=getEvidenceQueueScopeProvenanceProductionConfig();
    expect(config).toMatchObject({status:"BLOCKED",selectedScopeModel:null,selectedScopeAuthority:null,activeScopeRegistry:[],selectedProvenanceFamilies:[],snapshotScopeReadiness:"BLOCKED",provenanceReadiness:"BLOCKED",persistence:"BLOCKED",readPath:"BLOCKED",currentSelection:"BLOCKED",authorityUpgrade:"UNSUPPORTED",signal:"BLOCKED",trading:"BLOCKED"});
    expect(Object.values(config.approvals).every(x=>x==="NOT_APPROVED")).toBe(true);
    expect(parseEvidenceQueueScopeProvenanceProductionConfig(config)).toBe(EVIDENCE_QUEUE_SCOPE_PROVENANCE_PRODUCTION_CONFIG);
    expect(parseEvidenceQueueScopeProvenanceProductionConfig({...config,status:"READY"})).toBeNull();
    expect(parseEvidenceQueueScopeProvenanceProductionConfig(new Proxy(config,{ownKeys(){throw Error("SENTINEL");}}))).toBeNull();
  });
});
