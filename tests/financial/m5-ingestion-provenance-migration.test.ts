import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260917000051_m5_ingestion_provenance.sql", "utf8");

describe("M5 ingestion provenance migration", () => {
  it("creates all seven server-only append-only tables", () => {
    for (const table of [
      "intelligence_ingestion_requests",
      "intelligence_ingestion_attempts",
      "intelligence_source_artifacts",
      "intelligence_source_envelopes",
      "intelligence_ingestion_source_observations",
      "intelligence_source_availability_claims",
      "intelligence_ingestion_events",
    ]) expect(sql).toContain(`create table public.${table}`);
    expect(sql.match(/enable row level security/g)?.length).toBe(7);
    expect(sql.match(/revoke all on public\./g)?.length).toBe(7);
    expect(sql.match(/before update or delete/g)?.length).toBe(7);
    expect(sql).not.toContain("create policy");
    expect(sql).not.toContain("security definer");
  });

  it("contains the replay, lineage and lifecycle authority constraints", () => {
    expect(sql).toContain("intelligence_ingestion_attempts_contract_fk");
    expect(sql).toContain("intelligence_source_envelopes_artifact_fk");
    expect(sql).toContain("intelligence_availability_envelope_fk");
    expect(sql).toContain("intelligence_availability_observation_fk");
    expect(sql).toContain("intelligence_ingestion_events_observation_fk");
    expect(sql).toContain("unique (ingestion_attempt_id, sequence)");
    expect(sql).toContain("intelligence_ingestion_events_terminal_idx");
    expect(sql).toContain("payload = jsonb_build_object('sourceObservationId', source_observation_id)");
    expect(sql).toContain("~ '^[a-f0-9]{64}$'");
    expect(sql).toContain("jsonb_typeof(request_scope) = 'object'");
    expect(sql).toContain("jsonb_typeof(temporal_diagnostic_codes) = 'array'");
  });

  it("has no seed, backfill or destructive data statements", () => {
    expect(sql).not.toMatch(/\binsert\s+into\s+public\./i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\./i);
    expect(sql).not.toMatch(/\bgrant\s+/i);
    expect(sql).not.toMatch(/eligibility_(quantitative|reference|venue|suspicious)_evidence/i);
    expect(sql).not.toMatch(/canonical_(m4|m5)/i);
    expect(sql).not.toMatch(/intelligence_asset_mapping_revisions/i);
  });
});
