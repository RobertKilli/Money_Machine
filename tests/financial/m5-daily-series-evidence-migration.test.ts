import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260921105605_m5_daily_series_evidence_binding.sql", "utf8");

describe("M5 daily-series evidence migration contract", () => {
  it("adds only conditional daily authority and exact composite foreign keys", () => {
    expect(migration).toContain("daily_series_authority_id text");
    expect(migration).toContain("daily_series_authority_fingerprint text");
    expect(migration).toContain("daily_series_derivation_fingerprint text");
    expect(migration).toContain("metric_kind in ('HISTORY_SPAN','VOLATILITY')");
    expect(migration).toContain("metric_kind in ('SINGLE_CONCENTRATION','TOP10_CONCENTRATION')");
    expect(migration).toContain("eligibility_quantitative_daily_authority_fk");
    expect(migration).toContain("eligibility_quantitative_daily_derivation_fk");
    expect(migration).toContain("eligibility_quantitative_daily_authority_fk_idx");
    expect(migration).toContain("eligibility_quantitative_daily_derivation_fk_idx");
    expect(migration).toContain("drop constraint eligibility_quantitative_holder_authority_fields_check");
    expect(migration).toContain("and as_of is null");
    expect(migration).toContain("and daily_series_authority_id is null");
    expect(migration).toContain("and holder_snapshot_id is null");
    expect(migration).toContain("and holder_snapshot_fingerprint is not null");
    expect(migration).toContain("and holder_derivation_fingerprint is not null");
    expect(migration).toContain("and daily_series_authority_fingerprint is not null");
    expect(migration).toContain("and daily_series_derivation_fingerprint is not null");
  });

  it("keeps the daily and holder metric branches mutually exclusive", () => {
    expect(migration).toContain("metric_kind in ('HISTORY_SPAN','VOLATILITY')");
    expect(migration).toContain("metric_kind in ('SINGLE_CONCENTRATION','TOP10_CONCENTRATION')");
    expect(migration).toContain("metric_kind not in ('HISTORY_SPAN','VOLATILITY','SINGLE_CONCENTRATION','TOP10_CONCENTRATION')");
    expect(migration).toContain("eligibility_quantitative_daily_temporal_check");
  });

  it("is fail-closed and contains no application-data operations or client access", () => {
    expect(migration).toContain("M5_DAILY_SERIES_EVIDENCE_MIGRATION_REQUIRES_EMPTY_DAILY_ROWS");
    expect(migration).not.toMatch(/\b(insert|update|delete)\s+into\s+public\./i);
    expect(migration).not.toMatch(/create\s+policy|grant\s+.*\b(anon|authenticated|public)\b|security\s+definer/i);
  });
});
