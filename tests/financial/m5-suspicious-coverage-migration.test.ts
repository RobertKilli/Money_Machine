import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260921205811_m5_suspicious_coverage_authority.sql", "utf8");
describe("suspicious coverage authority migration", () => {
  it("creates normalized append-only authority tables", () => {
    expect(sql).toContain("create table public.m5_suspicious_rule_set_authorities");
    expect(sql).toContain("create table public.m5_suspicious_rule_set_rules");
    expect(sql).toContain("create table public.m5_suspicious_coverage_authorities");
    expect(sql).toContain("create table public.m5_suspicious_coverage_rule_inputs");
    expect(sql).toContain("rule_set_authority_id text primary key");
    expect(sql).toContain("coverage_authority_id text primary key");
  });
  it("is server-only and has no data writes", () => {
    expect(sql).toMatch(/enable row level security/gi);
    expect(sql).toContain("revoke all privileges");
    expect(sql).toContain("reject_intelligence_mutation()");
    expect(sql).not.toMatch(/\b(insert into|update\s+public\.|delete from)\b/i);
    expect(sql).not.toMatch(/security definer/i);
    expect(sql).not.toMatch(/create policy/i);
  });
  it("uses fail-closed complete coverage checks", () => {
    expect(sql).toContain("coverage_status = 'COMPLETE'");
    expect(sql).toContain("required_rule_ids = evaluated_rule_ids");
    expect(sql).toContain("jsonb_array_length(source_materials) = evaluated_rule_count");
  });
  it("seals member sets and binds structured lineage material at commit", () => {
    expect(sql).toContain("deferrable initially deferred");
    expect(sql).toContain("M5_SUSPICIOUS_RULE_SET_MEMBER_COUNT_INVALID");
    expect(sql).toContain("M5_SUSPICIOUS_COMPLETE_COVERAGE_MEMBER_SET_INVALID");
    expect(sql).toContain("source_lineage_member_fingerprint");
    expect(sql).toContain("availability_claim_fingerprint");
    expect(sql).toContain("source_artifact_fingerprint");
    expect(sql).toContain("source_envelope_fingerprint");
    expect(sql).toContain("source_observation_fingerprint");
    expect(sql).toContain("m5_suspicious_coverage_inputs_lineage_member_fk");
    expect(sql).toContain("m5_suspicious_coverage_inputs_artifact_fk");
    expect(sql).toContain("m5_suspicious_coverage_inputs_envelope_fk");
    expect(sql).toContain("m5_suspicious_coverage_inputs_observation_fk");
    expect(sql).toContain("m5_suspicious_coverage_rule_inputs_parent_fk_idx");
    expect(sql).toContain("coverage_status, mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version");
    expect(sql).toContain("set search_path = public, pg_temp");
    expect(sql).toContain("revoke all on function public.m5_suspicious_assert_rule_set_count()");
  });
});
