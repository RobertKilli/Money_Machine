import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EVIDENCE_QUEUE_PROVENANCE_FAMILIES,
  EVIDENCE_QUEUE_SCOPE_PROVENANCE_PRODUCTION_CONFIG,
  getEvidenceQueueScopeProvenanceDecision,
  getEvidenceQueueScopeProvenanceProductionConfig,
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
    expect(d.provenanceFamilies.find(x=>x.family==="ISSUER_EVIDENCE")?.authorityStatus).toContain("NO_APPROVED");
    expect(d.provenanceFamilies.find(x=>x.family==="DERIVED_QUEUE_SET")?.authorityStatus).toBe("DERIVED_NON_AUTHORITATIVE");
    expect(d.unsupportedParents.some(x=>x.family==="DISCOVERY_SOURCE_RECORD")).toBe(true);
    expect(d.memberPolicy.origin).toContain("not corroboration");
  });

  it("matches applied SEC and M5 parent keys without inventing event parents", () => {
    const d=get(), sec=readFileSync("supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql","utf8").replace(/\s+/g," ");
    const m5=readFileSync("supabase/migrations/20260918215043_m5_raw_source_lineage.sql","utf8").replace(/\s+/g," ");
    const migrations=readdirSync("supabase/migrations").filter(n=>n.endsWith(".sql")).map(n=>readFileSync(`supabase/migrations/${n}`,"utf8")).join("\n");
    expect(sec).toContain("create table public.sec_event_acquisition_receipts");
    expect(sec).toContain("unique(lineage_id,fingerprint)");
    expect(sec).toContain("unique(artifact_id,fingerprint)");
    expect(m5).toContain("unique (mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class)");
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
