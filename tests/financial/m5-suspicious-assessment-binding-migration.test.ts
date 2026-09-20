import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260920165728_m5_suspicious_assessment_binding.sql", "utf8");

describe("M5 suspicious assessment binding migration contract", () => {
  it("fails closed and makes manifest authority strict v2", () => {
    expect(sql).toContain("M5_SUSPICIOUS_ASSESSMENT_BINDING_REQUIRES_EMPTY_AUTHORITY_TABLES");
    expect(sql).toContain("manifest_schema_version = 'm5-evidence-manifest/v2'");
    expect(sql).toContain("manifest->>'version' = manifest_schema_version");
    expect(sql).toContain("jsonb_typeof(manifest->'suspiciousAssessment') = 'object'");
    expect(sql).toContain("manifest ? 'suspiciousAssessment'");
    expect(sql).toContain("manifest->'suspiciousAssessment' <> 'null'::jsonb");
    expect(sql).toContain("jsonb_typeof((manifest->'suspiciousAssessment')->'assessmentId') = 'string'");
    expect(sql).toContain("jsonb_typeof((manifest->'suspiciousAssessment')->'fingerprint') = 'string'");
    expect(sql).toContain("not (manifest ? 'suspicious')");
    expect(sql).toContain("~ '^[a-f0-9]{64}$'");
  });
  it("binds canonical M5 to immutable assessment authority", () => {
    expect(sql).toContain("add column suspicious_assessment_id text not null");
    expect(sql).toContain("add column suspicious_assessment_fingerprint text not null");
    expect(sql).toContain("add column suspicious_assessment_result text not null");
    expect(sql).toContain("canonical_m5_suspicious_assessment_fk");
    expect(sql).toContain("references public.eligibility_suspicious_assessments(suspicious_assessment_id, fingerprint)");
    expect(sql).toContain("canonical_m5_suspicious_assessment_idx");
    expect(sql).toContain("canonical_m5_suspicious_status_binding_check");
  });
  it("does not seed, backfill, grant, or weaken server-only security", () => {
    expect(sql).not.toMatch(/\binsert\s+into\s+public\./i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\./i);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/security definer/i);
    expect(sql).toContain("revoke all privileges on table public.m5_manifest_authorities from anon, authenticated");
    expect(sql).toContain("revoke all privileges on table public.canonical_m5_eligibility_evaluations from anon, authenticated");
  });
});
