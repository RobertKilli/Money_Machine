import "server-only";
import postgres, { type Sql } from "postgres";
import { projectSecEdgar8kObservations } from "@/domain/intelligence/sec-edgar-8k-observation-read-model";
import { mapLifecycleEventRow } from "@/infrastructure/postgres/ingestion-provenance-repository";

type DbRow = Record<string, unknown>;

export async function readSecEdgar8kObservationReadModel(client: Sql) {
  const result = await client`select r.ingestion_request_id as request_id, a.ingestion_attempt_id as attempt_id,
      o.source_observation_id, o.retrieved_at,
      e.normalized_envelope as envelope,
      coalesce((select jsonb_agg(jsonb_build_object('lifecycle_event_id',ev.lifecycle_event_id,'ingestion_attempt_id',ev.ingestion_attempt_id,'contract_version',ev.contract_version,'sequence',ev.sequence,'event_type',ev.event_type,'payload',ev.payload,'event_fingerprint',ev.event_fingerprint,'recorded_at',to_char(ev.recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by ev.sequence, ev.lifecycle_event_id)
        from public.intelligence_ingestion_events ev where ev.ingestion_attempt_id=a.ingestion_attempt_id), '[]'::jsonb) as events
    from public.intelligence_ingestion_requests r
    left join public.intelligence_ingestion_attempts a using (ingestion_request_id)
    left join lateral (select (ev.payload->>'sourceObservationId') as source_observation_id
      from public.intelligence_ingestion_events ev where ev.ingestion_attempt_id=a.ingestion_attempt_id and ev.event_type='SOURCE_OBSERVED'
      order by ev.sequence desc, ev.lifecycle_event_id desc limit 1) observed on true
    left join public.intelligence_ingestion_source_observations o on o.source_observation_id=observed.source_observation_id and o.ingestion_attempt_id=a.ingestion_attempt_id
    left join lateral (select se.normalized_envelope from public.intelligence_source_envelopes se
      join public.intelligence_source_artifacts ar using (source_artifact_id)
      where ar.provider_id='SEC_EDGAR' and ar.dataset_id='FILING_METADATA' and ar.dataset_version='sec-edgar-8k-metadata/v1'
        and o.source_artifact_id=se.source_artifact_id and se.parser_contract_version=r.parser_contract_version
      order by se.observed_at desc, se.source_envelope_id desc limit 1) e on true
    where r.provider_id='SEC_EDGAR' and r.dataset_id='FILING_METADATA' and r.dataset_version='sec-edgar-8k-metadata/v1'
    order by r.requested_at desc, a.started_at desc nulls last, a.ingestion_attempt_id`;
  const rows = result.map((raw) => {
    const value = raw as DbRow;
    const events = Array.isArray(value.events) ? value.events.map(event => mapLifecycleEventRow(event as DbRow)) : [];
    const retrievedAt = value.retrieved_at instanceof Date ? value.retrieved_at.toISOString() : value.retrieved_at == null ? null : String(value.retrieved_at);
    return { requestId: String(value.request_id), attemptId: value.attempt_id == null ? null : String(value.attempt_id), sourceObservationId: value.source_observation_id == null ? null : String(value.source_observation_id), retrievedAt, envelope: value.envelope, events };
  });
  return projectSecEdgar8kObservations(rows);
}

export async function loadSecEdgar8kObservationReadModel() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_UNCONFIGURED");
  const sql = postgres(url, { max: 1, prepare: true, ssl: "require" });
  try { return await readSecEdgar8kObservationReadModel(sql); } finally { await sql.end({ timeout: 5 }); }
}
