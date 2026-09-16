import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260914000100_canonical_material_availability.sql",
  "utf8",
);
const canonicalBaseMigration = readFileSync(
  "supabase/migrations/20260913153948_m4_m5_canonical_evidence.sql",
  "utf8",
);

describe("canonical material availability migration", () => {
  it("replaces the old temporal direction for M4 and M5", () => {
    expect(canonicalBaseMigration).toMatch(/check \(available_at >= as_of\)/g);
    expect(migration).toContain("drop constraint if exists canonical_m4_analysis_snapshots_check");
    expect(migration).toContain("drop constraint if exists canonical_m5_eligibility_evaluations_check");
    expect(migration).toContain("drop constraint if exists canonical_m4_analysis_snapshots_available_at_as_of_check");
    expect(migration).toContain("drop constraint if exists canonical_m5_eligibility_evaluations_available_at_as_of_check");
    expect(migration).toContain("canonical_m4_available_at_not_after_as_of");
    expect(migration).toContain("canonical_m5_available_at_not_after_as_of");
    expect(migration).toMatch(/check \(available_at <= as_of\) not valid/g);
    expect(migration).not.toMatch(/available_at >= as_of/);
  });

  it("does not alter append-only or access-control behavior", () => {
    expect(migration).not.toMatch(/\b(update|delete)\b/i);
    expect(migration).not.toMatch(/disable row level security|\bgrant\b/i);
  });

  it("adds non-fabricated assembly lineage for future canonical M5 writes", () => {
    expect(migration).toContain("add column if not exists assembly_fingerprint text");
    expect(migration).toContain("canonical_m5_assembly_fingerprint_required");
    expect(migration).toMatch(/assembly_fingerprint is not null and length\(trim\(assembly_fingerprint\)\) > 0\) not valid/);
    expect(migration).not.toMatch(/update\s+public\.canonical_m5_eligibility_evaluations/i);
  });
});
