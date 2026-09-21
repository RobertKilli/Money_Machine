import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260921095507_m5_daily_series_authority.sql", "utf8");

describe("M5 daily-series authority migration contract", () => {
  it("is three-table server-only append-only schema with NUMERIC atom material", () => {
    expect(migration).toContain("intelligence_m5_daily_series_authorities");
    expect(migration).toContain("intelligence_m5_daily_series_observations");
    expect(migration).toContain("intelligence_m5_daily_series_derivations");
    expect(migration.match(/create table public\.intelligence_m5_daily_series_/g)).toHaveLength(3);
    expect(migration).toContain("numeric(78,0)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all privileges");
    expect(migration).toContain("reject_intelligence_mutation()");
    expect(migration).not.toMatch(/security\s+definer/i);
    expect(migration).not.toMatch(/\b(insert|update|delete)\s+into\s+public/i);
    expect(migration).not.toMatch(/create policy|grant\s+/i);
  });
});
