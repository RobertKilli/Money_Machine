import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20260921131302_m5_market_metrics_authority.sql", "utf8");
describe("M5 market metrics authority migration", () => {
  it("creates the three server-only append-only tables and exact authority FKs", () => {
    expect(sql.match(/create table public\.intelligence_m5_market_metric_/g)).toHaveLength(3);
    expect(sql).toContain("numeric(78,0)");
    expect(sql).toContain("eligibility_quantitative_market_authority_fk");
    expect(sql).toContain("eligibility_quantitative_market_derivation_fk");
    expect(sql).toContain("intelligence_m5_market_metric_materials_artifact_idx");
    expect(sql).toContain("intelligence_m5_market_metric_materials_envelope_idx");
    expect(sql).toContain("intelligence_m5_market_metric_materials_observation_idx");
    expect(sql).toContain("coverage_complete boolean");
    expect(sql).toContain("expected_component_count integer");
    expect(sql).toContain("derivation_version = 'm5-market-metrics-authority/v1'");
    expect(sql).toContain("jsonb_array_length(component_ids)");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all privileges");
    expect(sql).toContain("reject_intelligence_mutation()");
  });

  it("is fail-closed for all authority branches and has no application DML", () => {
    expect(sql).toContain("market_metrics_authority_id is not null");
    expect(sql).toContain("daily_series_authority_id is not null");
    expect(sql).toContain("holder_snapshot_id is not null");
    expect(sql).toContain(") is true)");
    expect(sql.toLowerCase()).not.toMatch(/\b(insert into|update|delete from)\s+public\.(?!intelligence_m5_market_metric_)/);
    expect(sql.toLowerCase()).not.toContain("security definer");
    expect(sql.toLowerCase()).not.toContain("create policy");
  });

  it("fails closed before replacing the existing quantitative constraints", () => {
    expect(sql.indexOf("M5_MARKET_METRICS_EVIDENCE_PRECONDITION")).toBeGreaterThan(-1);
    expect(sql.indexOf("M5_MARKET_METRICS_EVIDENCE_PRECONDITION")).toBeLessThan(sql.indexOf("drop constraint eligibility_quantitative_holder_authority_fields_check"));
  });

  it("guards liquidity completeness without unsafe jsonb array evaluation", () => {
    expect(sql).toContain("jsonb_typeof(component_ids) = 'array'");
    expect(sql).toContain("case when jsonb_typeof(component_ids) = 'array'");
    expect(sql).toContain("case when jsonb_typeof(components) = 'array'");
    expect(sql).toContain("coverage_complete is true");
  });
});
