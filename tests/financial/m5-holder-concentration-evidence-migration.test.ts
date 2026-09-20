import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260920232010_m5_holder_concentration_evidence_binding.sql"), "utf8");
describe("M5 holder concentration evidence migration contract", () => {
  it("adds only conditional holder authority and exact composite references", () => {
    expect(sql).toContain("M5_CONCENTRATION_EVIDENCE_MIGRATION_REQUIRES_EMPTY_CONCENTRATION_ROWS");
    expect(sql).toContain("holder_snapshot_id text"); expect(sql).toContain("holder_derivation_fingerprint text"); expect(sql).toContain("as_of timestamptz");
    expect(sql).toContain("eligibility_quantitative_holder_snapshot_fk"); expect(sql).toContain("eligibility_quantitative_holder_derivation_fk");
    expect(sql).not.toMatch(/\b(insert|update|delete)\s+into?\s+public\.(?!eligibility_quantitative_evidence)/i);
  });
  it("does not add client access or unsafe schema operations", () => {
    expect(sql).not.toMatch(/\b(grant|create\s+policy|security\s+definer|drop\s+table|truncate|seed|backfill)\b/i);
    expect(sql).toContain("eligibility_quantitative_holder_authority_fields_check");
    expect(sql).toContain("metric_kind not in ('SINGLE_CONCENTRATION','TOP10_CONCENTRATION')");
  });
});
