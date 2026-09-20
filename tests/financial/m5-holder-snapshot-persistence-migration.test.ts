import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260920221139_m5_holder_snapshot_authority.sql", "utf8");

describe("M5 holder snapshot authority migration", () => {
  it("defines the sealed parent/page/holder/derivation schema with NUMERIC authority", () => {
    for (const table of ["intelligence_m5_holder_snapshots", "intelligence_m5_holder_snapshot_pages", "intelligence_m5_holder_snapshot_holders", "intelligence_m5_holder_concentration_derivations"]) expect(sql).toContain(`create table public.${table}`);
    expect(sql).toContain("numeric(78,0)");
    expect(sql).toContain("115792089237316195423570985008687907853269984665640564039457584007913129639935");
    expect(sql).toContain("primary key (snapshot_id, page_ordinal)");
    expect(sql).toContain("unique (snapshot_id, holder_address)");
    expect(sql).toContain("primary key (snapshot_id, metric_kind)");
    expect(sql).toContain("references public.intelligence_source_lineages");
    expect(sql).toContain("references public.intelligence_source_artifacts");
    expect(sql).toContain("intelligence_m5_holder_snapshots_lineage_fk_idx");
    expect(sql).toContain("intelligence_m5_holder_snapshot_pages_source_artifact_fk_idx");
  });

  it("is server-only append-only schema without application DML", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all privileges");
    expect(sql).toContain("before update or delete");
    expect(sql).toContain("public.reject_intelligence_mutation()");
    expect(sql).not.toMatch(/\b(insert|update|delete)\s+into\s+public\./i);
    expect(sql).not.toMatch(/\bgrant\b|create\s+policy|security\s+definer/i);
  });
});
