import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260917012625_m5_source_lineage.sql", "utf8");

describe("M5 source-lineage migration contract", () => {
  it("defines both immutable server-only tables and parent/member keys", () => {
    expect(sql).toMatch(/create table public\.intelligence_source_lineages\s*\(/i);
    expect(sql).toMatch(/create table public\.intelligence_source_lineage_members\s*\(/i);
    expect(sql).toMatch(/source_lineage_id text primary key/i);
    expect(sql).toMatch(/primary key \(source_lineage_id, member_ordinal\)/i);
    expect(sql).toMatch(/unique \(source_lineage_id, availability_claim_id\)/i);
    expect(sql).toMatch(/unique \(source_lineage_id, provider_id, dataset_id, dataset_version\)/i);
    expect(sql).toMatch(/member_count = jsonb_array_length\(availability_claim_ids\)/i);
    expect(sql).toMatch(/member_count > 0/i);
    expect(sql).toMatch(/member_ordinal >= 0/i);
    expect(sql).toMatch(/observed_at <= effective_available_at/i);
    expect(sql).toMatch(/fingerprint ~ '\^\[a-f0-9\]\{64\}\$'/i);
  });

  it("uses exact referenced keys for every lineage member FK", () => {
    expect(sql).toContain("foreign key (source_lineage_id, provider_id, dataset_id, dataset_version)");
    expect(sql).toContain("references public.intelligence_source_lineages(source_lineage_id, provider_id, dataset_id, dataset_version)");
    expect(sql).toContain("foreign key (availability_claim_id, source_artifact_id, source_envelope_id, source_observation_id, effective_available_at)");
    expect(sql).toContain("references public.intelligence_source_availability_claims(availability_claim_id, source_artifact_id, source_envelope_id, source_observation_id, effective_available_at)");
    expect(sql).toContain("foreign key (source_artifact_id, provider_id, dataset_id, dataset_version)");
    expect(sql).toContain("references public.intelligence_source_artifacts(source_artifact_id, provider_id, dataset_id, dataset_version)");
    expect(sql).toContain("foreign key (source_envelope_id, source_artifact_id)");
    expect(sql).toContain("references public.intelligence_source_envelopes(source_envelope_id, source_artifact_id)");
    expect(sql).toContain("foreign key (source_observation_id, source_artifact_id, effective_available_at)");
    expect(sql).toContain("references public.intelligence_ingestion_source_observations(source_observation_id, source_artifact_id, retrieved_at)");
    expect(sql).toContain("foreign key (ingestion_attempt_id)");
    expect(sql).toContain("references public.intelligence_ingestion_attempts(ingestion_attempt_id)");
  });

  it("has child-side indexes, RLS, revokes, immutable triggers and no client surface", () => {
    for (const index of [
      "intelligence_source_lineage_members_claim_idx",
      "intelligence_source_lineage_members_artifact_idx",
      "intelligence_source_lineage_members_envelope_idx",
      "intelligence_source_lineage_members_observation_idx",
      "intelligence_source_lineage_members_attempt_idx",
    ]) expect(sql).toContain(`create index ${index}`);
    expect(sql).toMatch(/alter table public\.intelligence_source_lineages enable row level security/i);
    expect(sql).toMatch(/alter table public\.intelligence_source_lineage_members enable row level security/i);
    expect(sql).toContain("revoke all on public.intelligence_source_lineages from anon, authenticated");
    expect(sql).toContain("revoke all on public.intelligence_source_lineage_members from anon, authenticated");
    expect(sql.match(/create trigger .*immutable before update or delete/gi)).toHaveLength(2);
    expect(sql.match(/reject_intelligence_mutation\(\)/g)).toHaveLength(2);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/security definer/i);
  });

  it("is forward-only and does not modify downstream tables or data", () => {
    expect(sql).toContain("M5_SOURCE_LINEAGE_REQUIRES_EMPTY_PROVENANCE_TABLES");
    expect(sql).not.toMatch(/\binsert\s+into\s+public\./i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\./i);
    for (const downstream of ["eligibility_", "canonical_", "m5_manifest_authorities", "intelligence_asset_mapping_revisions"]) expect(sql).not.toContain(downstream);
  });
});
