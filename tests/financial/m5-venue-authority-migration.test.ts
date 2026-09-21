import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20260921193625_m5_venue_authority.sql", "utf8");
describe("M5 venue authority migration contract", () => {
  it("creates append-only authority/member tables and exact evidence bindings", () => {
    expect(sql).toContain("create table public.intelligence_m5_venue_authorities");
    expect(sql).toContain("create table public.intelligence_m5_venue_authority_members");
    expect(sql).toContain("venue_authority_id"); expect(sql).toContain("venue_member_fingerprint");
    expect(sql).toContain("eligibility_venue_authority_fk"); expect(sql).toContain("eligibility_venue_member_fk");
    expect(sql).toContain("revoke all privileges"); expect(sql).toContain("enable row level security"); expect(sql).toContain("reject_intelligence_mutation");
  });
  it("contains no application data DML, policies, grants or security definer", () => {
    expect(sql).not.toMatch(/\b(insert|update|delete)\s+into\b/i); expect(sql).not.toMatch(/create\s+policy/i); expect(sql).not.toMatch(/security\s+definer/i); expect(sql).not.toMatch(/grant\s+/i);
  });
});
