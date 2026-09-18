import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260918215043_m5_raw_source_lineage.sql", "utf8");

describe("M5 raw source-lineage migration", () => {
  it("fails closed before altering empty raw tables and adds all lineage columns", () => {
    expect(migration.indexOf("M5_RAW_SOURCE_LINEAGE_REQUIRES_EMPTY_RAW_EVIDENCE")).toBeGreaterThanOrEqual(0);
    expect(migration.indexOf("M5_RAW_SOURCE_LINEAGE_REQUIRES_EMPTY_RAW_EVIDENCE")).toBeLessThan(migration.indexOf("alter table public.eligibility_quantitative_evidence add column"));
    for (const table of ["eligibility_quantitative_evidence", "eligibility_reference_evidence", "eligibility_venue_evidence", "eligibility_suspicious_evidence"]) {
      expect(migration).toContain(`alter table public.${table} add column source_lineage_id text not null`);
      expect(migration).toContain(`${table.replace("_evidence", "")}_source_lineage_nonblank`);
      const short = table.replace("_evidence", "");
      expect(migration).toContain(`${short}_mapping_lineage_fk`);
      expect(migration).toContain(`${short}_mapping_lineage_idx`);
    }
  });

  it("uses one exact extended mapping authority key and replaces old raw FKs", () => {
    expect(migration).toContain("intelligence_asset_mapping_lineage_identity_key unique");
    expect(migration).toContain("mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class");
    expect(migration).toContain("(mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class)");
    expect(migration).toContain("drop constraint eligibility_quantitative_mapping_revision_fk");
    expect(migration).toContain("drop constraint eligibility_reference_mapping_revision_fk");
    expect(migration).toContain("drop constraint eligibility_venue_mapping_revision_fk");
    expect(migration).toContain("drop constraint eligibility_suspicious_mapping_revision_fk");
    expect(migration).not.toMatch(/insert\s+into|update\s+public\.|delete\s+from|truncate|security\s+definer|grant\s+/i);
    expect(migration).not.toContain("create policy");
  });
});
