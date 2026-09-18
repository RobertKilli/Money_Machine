import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260918181115_m5_mapping_source_lineage.sql", "utf8");

describe("M5 mapping/source-lineage migration", () => {
  it("is forward-only, empty-table guarded, and binds the exact lineage authority", () => {
    expect(sql).toContain("M5_MAPPING_SOURCE_LINEAGE_REQUIRES_EMPTY_MAPPING_TABLE");
    expect(sql).toMatch(/add column source_lineage_id text not null/i);
    expect(sql).toMatch(/check \(length\(trim\(source_lineage_id\)\) > 0\)/i);
    expect(sql).toMatch(/foreign key \(source_lineage_id, provider_id, dataset_id, dataset_version\)/i);
    expect(sql).toMatch(/references public\.intelligence_source_lineages\(source_lineage_id, provider_id, dataset_id, dataset_version\)/i);
    expect(sql).toContain("intelligence_asset_mapping_source_lineage_idx");
    expect(sql).not.toMatch(/\b(insert into|update|delete from|drop table|security definer|create policy|grant)\b/i);
  });
});
