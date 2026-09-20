import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { executeManualIngestionToLineage } from "@/application/intelligence/manual-ingestion-to-lineage";
import { createPostgresManualIngestionToLineageUnitOfWork } from "@/infrastructure/postgres/manual-ingestion-to-lineage-uow";

const databaseUrl = process.env.DATABASE_URL;
const enabled = process.env.MONEY_MACHINE_MANUAL_INGESTION_INTEGRATION === "1" && process.env.MONEY_MACHINE_MANUAL_INGESTION_SCHEMA_READY === "1" && Boolean(databaseUrl);

function assertLocalDatabaseUrl(value: string): void {
  const parsed = new URL(value);
  if (!(["localhost", "127.0.0.1", "::1"].includes(parsed.hostname))) throw new Error("M5_MANUAL_INTEGRATION_REQUIRES_LOCAL_DATABASE");
}

const providerId = "MM_LOCAL_MANUAL_TEST_PROVIDER";
const datasetId = "mm-local-manual-test-dataset";
const datasetVersion = "manual-test/v1";
const packageValue = (idempotencyKey: string, fingerprintSuffix = "a") => ({
  contractVersion: "m5-normalized-source-package/v1",
  idempotencyKey,
  providerId,
  datasetId,
  datasetVersion,
  providerSourceNamespace: "SYNTHETIC",
  adapterContractVersion: "manual/v1",
  adapterVersion: "manual/v1",
  parserContractVersion: "normalized/v1",
  parserVersion: "normalized/v1",
  envelopeSchemaVersion: "envelope/v1",
  attemptNumber: 1,
  requestedAt: "2026-01-01T00:00:00.000Z",
  startedAt: "2026-01-01T00:00:00.000Z",
  recordedAt: "2026-01-01T00:02:00.000Z",
  requestScope: { scope: "synthetic-local" },
  provenance: { system: "m5-manual-integration" },
  executionInput: { mode: "manual-test" },
  records: [0, 1].map(itemOrdinal => ({
    providerExternalRecordId: `record-${itemOrdinal + 1}`,
    payloadFingerprint: (fingerprintSuffix === "a" ? "a" : "b").repeat(64),
    pageOrdinal: 0,
    itemOrdinal,
    retrievedAt: `2026-01-01T00:0${itemOrdinal + 1}:00.000Z`,
    recordedAt: "2026-01-01T00:02:00.000Z",
    observedAt: `2026-01-01T00:0${itemOrdinal}:00.000Z`,
    normalizedEnvelope: { kind: "synthetic", itemOrdinal },
    selectedAuditableFields: { record: `record-${itemOrdinal + 1}` },
    metadata: { cursorSafety: "NONE" },
  })),
});

type CountSnapshot = Record<string, number>;
async function counts(sql: postgres.Sql): Promise<CountSnapshot> {
  const rows = await sql`
    select * from (
      select 'requests' as name, count(*)::int as count from public.intelligence_ingestion_requests where provider_id=${providerId}
      union all select 'attempts', count(*)::int from public.intelligence_ingestion_attempts where ingestion_request_id in (select ingestion_request_id from public.intelligence_ingestion_requests where provider_id=${providerId})
      union all select 'events', count(*)::int from public.intelligence_ingestion_events where ingestion_attempt_id in (select a.ingestion_attempt_id from public.intelligence_ingestion_attempts a join public.intelligence_ingestion_requests r on r.ingestion_request_id=a.ingestion_request_id where r.provider_id=${providerId})
      union all select 'artifacts', count(*)::int from public.intelligence_source_artifacts where provider_id=${providerId}
      union all select 'envelopes', count(*)::int from public.intelligence_source_envelopes where source_artifact_id in (select source_artifact_id from public.intelligence_source_artifacts where provider_id=${providerId})
      union all select 'observations', count(*)::int from public.intelligence_ingestion_source_observations where source_artifact_id in (select source_artifact_id from public.intelligence_source_artifacts where provider_id=${providerId})
      union all select 'claims', count(*)::int from public.intelligence_source_availability_claims where source_artifact_id in (select source_artifact_id from public.intelligence_source_artifacts where provider_id=${providerId})
      union all select 'lineages', count(*)::int from public.intelligence_source_lineages where provider_id=${providerId}
      union all select 'members', count(*)::int from public.intelligence_source_lineage_members where provider_id=${providerId}
    ) as q order by name
  `;
  return Object.fromEntries(rows.map(row => [String(row.name), Number(row.count)]));
}

describe.skipIf(!enabled)("M5 manual ingestion-to-lineage PostgreSQL integration", () => {
  it("persists, replays, and rolls back a synthetic normalized package", async () => {
    assertLocalDatabaseUrl(databaseUrl!);
    const sql = postgres(databaseUrl!, { max: 1, prepare: true });
    try {
      await sql`insert into public.intelligence_providers (provider_id,name,provider_type,canonical_source,provenance_policy_version,content_storage_mode) values (${providerId},${providerId},'SYNTHETIC_FIXTURE','local-test','provenance/v1','METADATA_ONLY') on conflict (provider_id) do nothing`;
      await sql`insert into public.intelligence_datasets (dataset_id,provider_id,dataset_version,source_description,content_storage_mode) values (${datasetId},${providerId},${datasetVersion},'local synthetic integration','METADATA_ONLY') on conflict (dataset_id) do nothing`;
      const unitOfWork = createPostgresManualIngestionToLineageUnitOfWork(sql);
      const packageInput = packageValue("m5-manual-local-replay-v1");
      const before = await counts(sql);
      const first = await executeManualIngestionToLineage(packageInput, { apply: true, unitOfWork });
      expect(first.status).toBe("PERSISTED");
      if (first.status !== "PERSISTED") return;
      const afterFirst = await counts(sql);
      expect(afterFirst).toEqual({ ...before, requests: before.requests + 1, attempts: before.attempts + 1, events: before.events + 4, artifacts: before.artifacts + 2, envelopes: before.envelopes + 2, observations: before.observations + 2, claims: before.claims + 2, lineages: before.lineages + 1, members: before.members + 2 });
      const eventRows = await sql`select sequence,event_type,ingestion_attempt_id from public.intelligence_ingestion_events where ingestion_attempt_id=${first.attemptId} order by sequence`;
      expect(eventRows.map(row => [Number(row.sequence), row.event_type])).toEqual([[1, "STARTED"], [2, "SOURCE_OBSERVED"], [3, "SOURCE_OBSERVED"], [4, "COMPLETED"]]);
      expect(new Set(eventRows.map(row => String(row.ingestion_attempt_id)))).toEqual(new Set([first.attemptId]));
      const lineageRows = await sql`select source_lineage_id,fingerprint,member_count,availability_claim_ids,source_artifact_ids,ingestion_attempt_ids,observed_at,effective_available_at from public.intelligence_source_lineages where source_lineage_id=${first.sourceLineageId}`;
      expect(lineageRows).toHaveLength(1);
      expect(Number(lineageRows[0]!.member_count)).toBe(2);
      expect(String(lineageRows[0]!.fingerprint)).toBe(first.sourceLineageFingerprint);
      const memberRows = await sql`select member_ordinal,availability_claim_id,source_artifact_id,source_envelope_id,source_observation_id,ingestion_attempt_id from public.intelligence_source_lineage_members where source_lineage_id=${first.sourceLineageId} order by member_ordinal`;
      expect(memberRows).toHaveLength(2);
      expect(memberRows.map(row => Number(row.member_ordinal))).toEqual([0, 1]);
      expect(memberRows.every(row => String(row.ingestion_attempt_id) === first.attemptId)).toBe(true);

      const replay = await executeManualIngestionToLineage(packageInput, { apply: true, unitOfWork });
      expect(replay).toMatchObject(first);
      expect(await counts(sql)).toEqual(afterFirst);

      const beforeConflict = await counts(sql);
      await expect(executeManualIngestionToLineage(packageValue("m5-manual-local-conflict-v1", "b"), { apply: true, unitOfWork })).rejects.toThrow(/M5_SOURCE_ARTIFACT_CONFLICT|M5_INGESTION/);
      expect(await counts(sql)).toEqual(beforeConflict);
      expect(await sql`select count(*)::int as count from public.intelligence_source_lineage_members where source_lineage_id=${first.sourceLineageId}`).toEqual([{ count: 2 }]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
