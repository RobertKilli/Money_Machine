import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260920161300_m5_suspicious_assessment_authority.sql", "utf8");

describe("M5 suspicious assessment migration contract", () => {
  it("guards absent assessment tables without SQLSTATE 42P01 pre-CREATE binding", () => {
    const createPosition = sql.toLowerCase().indexOf("create table public.eligibility_suspicious_assessments");
    expect(createPosition).toBeGreaterThan(0);
    const beforeCreate = sql.slice(0, createPosition);
    const executable = beforeCreate
      .replace(/--[^\r\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/'(?:''|[^'])*'/g, "''");
    expect(executable).not.toMatch(/\bfrom\s+public\.eligibility_suspicious_assessments\b/i);
    expect(executable).not.toMatch(/\bfrom\s+public\.eligibility_suspicious_assessment_findings\b/i);
    expect(beforeCreate).toContain("relation_name := to_regclass('public.eligibility_suspicious_assessments')");
    expect(beforeCreate).toContain("execute 'select count(*) from public.eligibility_suspicious_assessments' into row_count");
    expect(beforeCreate).toContain("execute 'select count(*) from public.eligibility_suspicious_assessment_findings' into row_count");
    expect((beforeCreate.match(/if relation_name is not null/g) ?? []).length).toBe(2);
  });

  it("defines immutable parent and exact membership tables", () => {
    expect(sql).toContain("create table public.eligibility_suspicious_assessments");
    expect(sql).toContain("create table public.eligibility_suspicious_assessment_findings");
    expect(sql).toContain("suspicious_assessment_id text primary key");
    expect(sql).toContain("primary key (suspicious_assessment_id, member_ordinal)");
    expect(sql).toContain("unique (suspicious_assessment_id, evidence_id)");
    expect(sql).toContain("result in ('NO_FINDINGS','FINDINGS_PRESENT')");
    expect(sql).toContain("jsonb_array_length(finding_references) = 0");
    expect(sql).toContain("jsonb_array_length(finding_references) > 0");
    expect(sql).toContain("observed_at <= available_at and available_at <= as_of");
  });

  it("uses exact registry, mapping, lineage and finding authority keys", () => {
    expect(sql).toContain("foreign key (dataset_id, provider_id, dataset_version)");
    expect(sql).toContain("references public.intelligence_datasets(dataset_id, provider_id, dataset_version)");
    expect(sql).toContain("references public.intelligence_asset_mapping_revisions(mapping_revision_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class)");
    expect(sql).toContain("references public.intelligence_source_lineages(source_lineage_id, provider_id, dataset_id, dataset_version)");
    expect(sql).toContain("foreign key (evidence_id, evidence_fingerprint)");
    expect(sql).toContain("references public.eligibility_suspicious_evidence(evidence_id, fingerprint)");
    expect(sql).toContain("eligibility_suspicious_evidence_identity_key");
    expect(sql).toContain("intelligence_asset_mapping_assessment_authority_key");
    expect(sql).toContain("unique (mapping_revision_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class)");
  });

  it("is server-only append-only DDL without application data writes", () => {
    expect(sql).toMatch(/alter table public\.eligibility_suspicious_assessments enable row level security/i);
    expect(sql).toMatch(/alter table public\.eligibility_suspicious_assessment_findings enable row level security/i);
    expect(sql).toContain("revoke all privileges on table public.eligibility_suspicious_assessments from anon, authenticated");
    expect(sql).toContain("revoke all privileges on table public.eligibility_suspicious_assessment_findings from anon, authenticated");
    expect(sql).toMatch(/create trigger .*immutable before update or delete/gi);
    expect(sql).toContain("reject_intelligence_mutation()");
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/security definer/i);
    expect(sql).not.toMatch(/\binsert\s+into\s+public\./i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\./i);
    expect(sql).not.toContain("m5_manifest_authorities");
    expect(sql).not.toContain("canonical_m5_eligibility_evaluations");
  });
});
