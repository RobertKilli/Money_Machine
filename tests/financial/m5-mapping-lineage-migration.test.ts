import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260916212845_m5_mapping_lineage.sql", "utf8");

describe("M5 mapping lineage migration", () => {
  it("creates the revision table, exact lookup index, FKs, and raw bindings", () => {
    expect(sql).toContain("create table public.intelligence_asset_mapping_revisions");
    expect(sql).toContain("mapping_revision_id text primary key");
    expect(sql).toContain("references public.intelligence_providers(provider_id)");
    expect(sql).toContain("intelligence_datasets_mapping_owner_key unique (dataset_id, provider_id, dataset_version)");
    expect(sql).toContain("intelligence_asset_mapping_dataset_owner_fk");
    expect(sql).toContain("references public.intelligence_datasets(dataset_id, provider_id, dataset_version)");
    expect(sql).toContain("intelligence_asset_mapping_identity_key unique");
    expect(sql).toContain("intelligence_asset_mapping_lookup_idx");
    for (const table of ["quantitative", "reference", "venue", "suspicious"]) {
      expect(sql).toContain(`alter table public.eligibility_${table}_evidence add column mapping_revision_id text not null`);
      expect(sql).toContain(`eligibility_${table}_mapping_revision_fk`);
      expect(sql).toContain(`mapping_revision_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class`);
      expect(sql).toContain(`eligibility_${table}_mapping_revision_idx`);
    }
  });

  it("is server-only and fail-closed without seed, backfill, or destructive data operations", () => {
    expect(sql).toContain("M5_MAPPING_LINEAGE_REQUIRES_EMPTY_RAW_EVIDENCE");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.intelligence_asset_mapping_revisions from anon, authenticated");
    expect(sql).toContain("before update or delete");
    expect(sql).not.toMatch(/\binsert\s+into\s+public\.intelligence_asset_mapping_revisions\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\./i);
    expect(sql).not.toContain("security definer");
    expect(sql).not.toContain("grant ");
  });
});
