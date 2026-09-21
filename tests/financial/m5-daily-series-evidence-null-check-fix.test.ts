import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

const originalMigration = readFileSync(
  "supabase/migrations/20260921105605_m5_daily_series_evidence_binding.sql",
  "utf8",
);
const fixMigration = readFileSync(
  "supabase/migrations/20260921120642_fix_m5_daily_series_evidence_null_checks.sql",
  "utf8",
);

describe("M5 daily-series evidence NULL-check fix migration", () => {
  it("does not modify the applied migration and recreates the exact checks", () => {
    expect(createHash("sha256").update(originalMigration).digest("hex")).toBe("7871540901ce38d87b8cb8942ada058d112831a0c9ae94b044d3bc78cddc162b");
    expect(originalMigration).toContain("eligibility_quantitative_holder_authority_fields_check");
    expect(originalMigration).toContain("eligibility_quantitative_daily_authority_fields_check");
    expect(fixMigration).toContain("drop constraint eligibility_quantitative_holder_authority_fields_check");
    expect(fixMigration).toContain("drop constraint eligibility_quantitative_daily_authority_fields_check");
    expect(fixMigration).toContain("add constraint eligibility_quantitative_holder_authority_fields_check");
    expect(fixMigration).toContain("add constraint eligibility_quantitative_daily_authority_fields_check");
  });

  it("makes every required branch explicit and wraps both checks in IS TRUE", () => {
    expect(fixMigration.match(/daily_series_authority_id is not null/g)).toHaveLength(2);
    expect(fixMigration.match(/daily_series_authority_fingerprint is not null/g)).toHaveLength(2);
    expect(fixMigration.match(/daily_series_derivation_fingerprint is not null/g)).toHaveLength(2);
    expect(fixMigration.match(/as_of is not null/g)).toHaveLength(3);
    expect(fixMigration.match(/\) is true\)/g)).toHaveLength(2);
    expect(fixMigration).toContain("daily_series_authority_id is null");
    expect(fixMigration).toContain("daily_series_authority_fingerprint is null");
    expect(fixMigration).toContain("daily_series_derivation_fingerprint is null");
  });

  it("contains no schema or data operations beyond the two CHECK replacements", () => {
    expect(fixMigration).not.toMatch(/add column|drop column|foreign key|create index|drop index/i);
    expect(fixMigration).not.toMatch(/\b(insert|update|delete)\s+into\b/i);
    expect(fixMigration).not.toMatch(/grant\s+|create\s+policy|security\s+definer/i);
    expect(fixMigration).not.toMatch(/create\s+table|drop\s+table|truncate/i);
  });
});
