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
    expect(sql).toContain("jsonb_array_length(source_materials) > 0");
  });
});
