import "server-only";
import postgres, { type Sql, type TransactionSql } from "postgres";
import {
  mapAvailabilityClaimRow,
  mapIngestionAttemptRow,
  mapLifecycleEventRow,
  mapSourceArtifactRow,
  mapSourceEnvelopeRow,
  mapSourceObservationRow,
} from "@/infrastructure/postgres/ingestion-provenance-repository";
import { reduceIngestionLifecycle } from "@/domain/intelligence/ingestion-provenance";
import {
  assertSourceLineage,
  assertSourceLineageMember,
  createSourceLineage,
  SOURCE_LINEAGE_CONTRACT_VERSION,
  type SourceLineage,
  type SourceLineageMember,
  type SourceLineageMemberInput,
} from "@/domain/intelligence/source-lineage";
import type { SourceLineageRepository, SourceLineageUnitOfWork } from "@/application/intelligence/source-lineage-repository";

type RawRow = Record<string, unknown>;
const row = (value: unknown): RawRow => value as RawRow;
const text = (value: unknown, code: string): string => { if (typeof value !== "string" || !value.trim()) throw new Error(code); return value.trim(); };
const timestamp = (value: unknown, code: string): string => { const result = value instanceof Date ? value.toISOString() : text(value, code); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) || Number.isNaN(Date.parse(result)) || new Date(result).toISOString() !== result) throw new Error(code); return result; };
const jsonArray = (value: unknown, code: string): readonly string[] => { if (!Array.isArray(value)) throw new Error(code); return Object.freeze(value.map(item => text(item, code))); };
const json = (value: unknown): string => JSON.stringify(value);
const sortedUnique = (values: readonly string[], code: string): readonly string[] => { const sorted = [...values].sort((a, b) => a.localeCompare(b)); if (sorted.length === 0 || sorted.some((value, index) => index > 0 && value === sorted[index - 1])) throw new Error(code); if (sorted.some((value, index) => value !== values[index])) throw new Error(code); return sorted; };

function mapLineageRow(value: RawRow): SourceLineage {
  if (value.contract_version !== SOURCE_LINEAGE_CONTRACT_VERSION) throw new Error("M5_SOURCE_LINEAGE_STORED_CONTRACT_INVALID");
  const record = Object.freeze({
    contractVersion: text(value.contract_version, "M5_SOURCE_LINEAGE_STORED_CONTRACT_INVALID") as typeof SOURCE_LINEAGE_CONTRACT_VERSION,
    sourceLineageId: text(value.source_lineage_id, "M5_SOURCE_LINEAGE_STORED_ID_INVALID"),
    providerId: text(value.provider_id, "M5_SOURCE_LINEAGE_STORED_PROVIDER_INVALID"),
    datasetId: text(value.dataset_id, "M5_SOURCE_LINEAGE_STORED_DATASET_INVALID"),
    datasetVersion: text(value.dataset_version, "M5_SOURCE_LINEAGE_STORED_VERSION_INVALID"),
    availabilityClaimIds: jsonArray(value.availability_claim_ids, "M5_SOURCE_LINEAGE_STORED_CLAIMS_INVALID"),
    sourceArtifactIds: jsonArray(value.source_artifact_ids, "M5_SOURCE_LINEAGE_STORED_ARTIFACTS_INVALID"),
    ingestionAttemptIds: jsonArray(value.ingestion_attempt_ids, "M5_SOURCE_LINEAGE_STORED_ATTEMPTS_INVALID"),
    memberCount: Number(value.member_count),
    observedAt: timestamp(value.observed_at, "M5_SOURCE_LINEAGE_STORED_OBSERVED_INVALID"),
    effectiveAvailableAt: timestamp(value.effective_available_at, "M5_SOURCE_LINEAGE_STORED_AVAILABLE_INVALID"),
    fingerprint: text(value.fingerprint, "M5_SOURCE_LINEAGE_STORED_FINGERPRINT_INVALID"),
    recordedAt: timestamp(value.recorded_at, "M5_SOURCE_LINEAGE_STORED_RECORDED_INVALID"),
  });
  sortedUnique(record.availabilityClaimIds, "M5_SOURCE_LINEAGE_STORED_FINGERPRINT_INVALID");
  if (record.sourceArtifactIds.some((value, index) => record.sourceArtifactIds.indexOf(value) !== index) || record.ingestionAttemptIds.some((value, index) => record.ingestionAttemptIds.indexOf(value) !== index)) throw new Error("M5_SOURCE_LINEAGE_STORED_FINGERPRINT_INVALID");
  try { assertSourceLineage(record); } catch { throw new Error("M5_SOURCE_LINEAGE_STORED_FINGERPRINT_INVALID"); }
  return record;
}

function mapMemberRow(value: RawRow): SourceLineageMember {
  const record = Object.freeze({
    sourceLineageId: text(value.source_lineage_id, "M5_SOURCE_LINEAGE_MEMBER_LINEAGE_INVALID"),
    memberOrdinal: Number(value.member_ordinal),
    availabilityClaimId: text(value.availability_claim_id, "M5_SOURCE_LINEAGE_MEMBER_CLAIM_INVALID"),
    sourceArtifactId: text(value.source_artifact_id, "M5_SOURCE_LINEAGE_MEMBER_ARTIFACT_INVALID"),
    sourceEnvelopeId: text(value.source_envelope_id, "M5_SOURCE_LINEAGE_MEMBER_ENVELOPE_INVALID"),
    sourceObservationId: text(value.source_observation_id, "M5_SOURCE_LINEAGE_MEMBER_OBSERVATION_INVALID"),
    ingestionAttemptId: text(value.ingestion_attempt_id, "M5_SOURCE_LINEAGE_MEMBER_ATTEMPT_INVALID"),
    providerId: text(value.provider_id, "M5_SOURCE_LINEAGE_MEMBER_PROVIDER_INVALID"),
    datasetId: text(value.dataset_id, "M5_SOURCE_LINEAGE_MEMBER_DATASET_INVALID"),
    datasetVersion: text(value.dataset_version, "M5_SOURCE_LINEAGE_MEMBER_VERSION_INVALID"),
    observedAt: timestamp(value.observed_at, "M5_SOURCE_LINEAGE_MEMBER_OBSERVED_INVALID"),
    effectiveAvailableAt: timestamp(value.effective_available_at, "M5_SOURCE_LINEAGE_MEMBER_AVAILABLE_INVALID"),
    memberFingerprint: text(value.member_fingerprint, "M5_SOURCE_LINEAGE_MEMBER_FINGERPRINT_INVALID"),
  });
  try { assertSourceLineageMember(record); } catch { throw new Error("M5_SOURCE_LINEAGE_MEMBER_FINGERPRINT_INVALID"); }
  return record;
}

async function authority(client: TransactionSql, claimId: string): Promise<SourceLineageMemberInput & { lifecycle: readonly ReturnType<typeof mapLifecycleEventRow>[] }> {
  const rows = await client`select
    c.availability_claim_id, c.source_envelope_id as claim_source_envelope_id, c.source_observation_id as claim_source_observation_id,
    c.contract_version as claim_contract_version, c.basis, c.effective_available_at, c.claim_fingerprint, c.recorded_at as claim_recorded_at,
    c.source_artifact_id as claim_source_artifact_id, c.temporal_quality_status,
    e.source_envelope_id, e.contract_version as envelope_contract_version, e.source_artifact_id as envelope_source_artifact_id,
    e.parser_contract_version, e.envelope_schema_version, e.normalized_envelope, e.selected_auditable_fields,
    e.payload_fingerprint as envelope_payload_fingerprint, e.source_envelope_fingerprint, e.provider_published_at,
    e.observed_at, e.temporal_quality_status as envelope_temporal_quality_status, e.temporal_diagnostic_codes, e.recorded_at as envelope_recorded_at,
    o.source_observation_id, o.contract_version as observation_contract_version, o.ingestion_attempt_id,
    o.source_artifact_id as observation_source_artifact_id, o.response_page_ordinal, o.item_ordinal, o.retrieved_at,
    o.metadata, o.observation_fingerprint, o.recorded_at as observation_recorded_at,
    a.source_artifact_id, a.contract_version as artifact_contract_version, a.provider_id, a.dataset_id, a.dataset_version,
    a.provider_source_namespace, a.provider_external_record_id, a.provider_revision, a.payload_fingerprint as artifact_payload_fingerprint,
    a.source_artifact_fingerprint, a.recorded_at as artifact_recorded_at,
    at.ingestion_attempt_id as attempt_id, at.ingestion_request_id, at.contract_version as attempt_contract_version,
    at.attempt_number, at.adapter_version, at.parser_version, at.execution_input, at.attempt_fingerprint, at.started_at
    from public.intelligence_source_availability_claims c
    join public.intelligence_source_envelopes e on e.source_envelope_id=c.source_envelope_id and e.source_artifact_id=c.source_artifact_id and e.temporal_quality_status=c.temporal_quality_status
    join public.intelligence_ingestion_source_observations o on o.source_observation_id=c.source_observation_id and o.source_artifact_id=c.source_artifact_id and o.retrieved_at=c.effective_available_at
    join public.intelligence_source_artifacts a on a.source_artifact_id=c.source_artifact_id
    join public.intelligence_ingestion_attempts at on at.ingestion_attempt_id=o.ingestion_attempt_id
    where c.availability_claim_id=${claimId}`;
  if (rows.length !== 1) throw new Error("M5_SOURCE_LINEAGE_CLAIM_INVALID");
  const value = row(rows[0]);
  const claim = mapAvailabilityClaimRow({ availability_claim_id: value.availability_claim_id, source_envelope_id: value.claim_source_envelope_id, source_observation_id: value.claim_source_observation_id, contract_version: value.claim_contract_version, basis: value.basis, effective_available_at: value.effective_available_at, claim_fingerprint: value.claim_fingerprint, recorded_at: value.claim_recorded_at });
  const envelope = mapSourceEnvelopeRow({ source_envelope_id: value.source_envelope_id, contract_version: value.envelope_contract_version, source_artifact_id: value.envelope_source_artifact_id, parser_contract_version: value.parser_contract_version, envelope_schema_version: value.envelope_schema_version, normalized_envelope: value.normalized_envelope, selected_auditable_fields: value.selected_auditable_fields, payload_fingerprint: value.envelope_payload_fingerprint, source_envelope_fingerprint: value.source_envelope_fingerprint, provider_published_at: value.provider_published_at, observed_at: value.observed_at, temporal_quality_status: value.envelope_temporal_quality_status, temporal_diagnostic_codes: value.temporal_diagnostic_codes, recorded_at: value.envelope_recorded_at });
  const observation = mapSourceObservationRow({ source_observation_id: value.source_observation_id, contract_version: value.observation_contract_version, ingestion_attempt_id: value.ingestion_attempt_id, source_artifact_id: value.observation_source_artifact_id, response_page_ordinal: value.response_page_ordinal, item_ordinal: value.item_ordinal, retrieved_at: value.retrieved_at, metadata: value.metadata, observation_fingerprint: value.observation_fingerprint, recorded_at: value.observation_recorded_at });
  const artifact = mapSourceArtifactRow({ source_artifact_id: value.source_artifact_id, contract_version: value.artifact_contract_version, provider_id: value.provider_id, dataset_id: value.dataset_id, dataset_version: value.dataset_version, provider_source_namespace: value.provider_source_namespace, provider_external_record_id: value.provider_external_record_id, provider_revision: value.provider_revision, payload_fingerprint: value.artifact_payload_fingerprint, source_artifact_fingerprint: value.source_artifact_fingerprint, recorded_at: value.artifact_recorded_at });
  if (envelope.payloadFingerprint !== artifact.payloadFingerprint) throw new Error("M5_SOURCE_LINEAGE_CLAIM_INVALID");
  const attempt = mapIngestionAttemptRow({ ingestion_attempt_id: value.attempt_id, ingestion_request_id: value.ingestion_request_id, contract_version: value.attempt_contract_version, attempt_number: value.attempt_number, adapter_version: value.adapter_version, parser_version: value.parser_version, execution_input: value.execution_input, attempt_fingerprint: value.attempt_fingerprint, started_at: value.started_at });
  return { claim, envelope, observation, artifact, attempt, lifecycleStatus: "COMPLETED", lifecycle: Object.freeze([]) };
}

function validateMembers(parent: SourceLineage, members: readonly SourceLineageMember[], expected?: readonly SourceLineageMember[]): void {
  if (members.length !== parent.memberCount) throw new Error("M5_SOURCE_LINEAGE_SEAL_INCOMPLETE");
  const seen = new Set<string>();
  members.forEach((member, index) => {
    if (member.memberOrdinal !== index || member.availabilityClaimId !== parent.availabilityClaimIds[index]) throw new Error("M5_SOURCE_LINEAGE_MEMBER_MISMATCH");
    if (seen.has(member.availabilityClaimId)) throw new Error("M5_SOURCE_LINEAGE_MEMBER_MISMATCH");
    seen.add(member.availabilityClaimId);
    if (member.sourceLineageId !== parent.sourceLineageId || member.providerId !== parent.providerId || member.datasetId !== parent.datasetId || member.datasetVersion !== parent.datasetVersion) throw new Error("M5_SOURCE_LINEAGE_MEMBER_MISMATCH");
    if (expected) {
      const canonical = expected[index];
      if (!canonical || JSON.stringify(member) !== JSON.stringify(canonical)) throw new Error("M5_SOURCE_LINEAGE_MEMBER_MISMATCH");
    }
  });
  if (seen.size !== parent.availabilityClaimIds.length || !parent.sourceArtifactIds.every(id => members.some(member => member.sourceArtifactId === id)) || !parent.ingestionAttemptIds.every(id => members.some(member => member.ingestionAttemptId === id))) throw new Error("M5_SOURCE_LINEAGE_MEMBER_MISMATCH");
}

function createRepository(client: TransactionSql): SourceLineageRepository {
  return {
    createFromClaims: async (scope, claimIds, recordedAt) => {
      const normalized = [...new Set(claimIds.map(id => text(id, "M5_SOURCE_LINEAGE_CLAIM_INVALID")))].sort((a, b) => a.localeCompare(b));
      if (normalized.length !== claimIds.length) throw new Error("M5_SOURCE_LINEAGE_CLAIM_INVALID");
      const authorities = [] as Array<SourceLineageMemberInput & { lifecycle: readonly ReturnType<typeof mapLifecycleEventRow>[] }>;
      for (const claimId of normalized) authorities.push(await authority(client, claimId));
      const attemptIds = [...new Set(authorities.map(value => value.attempt.ingestionAttemptId))].sort((a, b) => a.localeCompare(b));
      for (const attemptId of attemptIds) await client`select ingestion_attempt_id from public.intelligence_ingestion_attempts where ingestion_attempt_id=${attemptId} for update`;
      const lifecycleByAttempt = new Map<string, readonly ReturnType<typeof mapLifecycleEventRow>[]>();
      for (const attemptId of attemptIds) {
        const eventRows = await client`select * from public.intelligence_ingestion_events where ingestion_attempt_id=${attemptId} order by sequence asc, lifecycle_event_id asc`;
        lifecycleByAttempt.set(attemptId, Object.freeze(eventRows.map(value => mapLifecycleEventRow(row(value)))));
      }
      const validatedAuthorities = authorities.map(value => {
        const lifecycle = lifecycleByAttempt.get(value.attempt.ingestionAttemptId);
        if (!lifecycle) throw new Error("M5_SOURCE_LINEAGE_ATTEMPT_INVALID");
        const status = reduceIngestionLifecycle(lifecycle).status;
        if (status !== "COMPLETED" && status !== "PARTIAL") throw new Error("M5_SOURCE_LINEAGE_ATTEMPT_NOT_TERMINAL");
        return { ...value, lifecycle, lifecycleStatus: status } as SourceLineageMemberInput;
      });
      const built = createSourceLineage({ providerId: scope.providerId, datasetId: scope.datasetId, datasetVersion: scope.datasetVersion, members: validatedAuthorities, recordedAt });
      const inserted = await client`insert into public.intelligence_source_lineages (contract_version,source_lineage_id,provider_id,dataset_id,dataset_version,availability_claim_ids,source_artifact_ids,ingestion_attempt_ids,member_count,observed_at,effective_available_at,fingerprint,recorded_at) values (${built.lineage.contractVersion},${built.lineage.sourceLineageId},${built.lineage.providerId},${built.lineage.datasetId},${built.lineage.datasetVersion},${json(built.lineage.availabilityClaimIds)}::jsonb,${json(built.lineage.sourceArtifactIds)}::jsonb,${json(built.lineage.ingestionAttemptIds)}::jsonb,${built.lineage.memberCount},${built.lineage.observedAt},${built.lineage.effectiveAvailableAt},${built.lineage.fingerprint},${built.lineage.recordedAt}) on conflict (source_lineage_id) do nothing returning source_lineage_id`;
      const parentRows = await client`select * from public.intelligence_source_lineages where source_lineage_id=${built.lineage.sourceLineageId} for update`;
      if (parentRows.length !== 1) throw new Error("M5_SOURCE_LINEAGE_REPOSITORY_CONTRACT_VIOLATION");
      const parent = mapLineageRow(row(parentRows[0]));
      if (inserted.length) {
        for (const member of built.members) await client`insert into public.intelligence_source_lineage_members (source_lineage_id,member_ordinal,availability_claim_id,source_artifact_id,source_envelope_id,source_observation_id,ingestion_attempt_id,provider_id,dataset_id,dataset_version,observed_at,effective_available_at,member_fingerprint) values (${member.sourceLineageId},${member.memberOrdinal},${member.availabilityClaimId},${member.sourceArtifactId},${member.sourceEnvelopeId},${member.sourceObservationId},${member.ingestionAttemptId},${member.providerId},${member.datasetId},${member.datasetVersion},${member.observedAt},${member.effectiveAvailableAt},${member.memberFingerprint}) on conflict do nothing`;
      }
      const memberRows = await client`select * from public.intelligence_source_lineage_members where source_lineage_id=${parent.sourceLineageId} order by member_ordinal asc`;
      const members = Object.freeze(memberRows.map(value => mapMemberRow(row(value))));
      if (parent.fingerprint !== built.lineage.fingerprint || JSON.stringify(parent.availabilityClaimIds) !== JSON.stringify(built.lineage.availabilityClaimIds)) throw new Error("M5_SOURCE_LINEAGE_CONFLICT");
      validateMembers(parent, members, built.members);
      return parent;
    },
    readById: async sourceLineageId => {
      const rows = await client`select * from public.intelligence_source_lineages where source_lineage_id=${sourceLineageId}`;
      return rows.length === 0 ? undefined : mapLineageRow(row(rows[0]));
    },
    readMembers: async sourceLineageId => {
      const rows = await client`select * from public.intelligence_source_lineage_members where source_lineage_id=${sourceLineageId} order by member_ordinal asc`;
      return Object.freeze(rows.map(value => mapMemberRow(row(value))));
    },
  };
}

export function createSourceLineageUnitOfWork(client: Sql): SourceLineageUnitOfWork {
  return { withTransaction: <T>(work: (repository: SourceLineageRepository) => Promise<T>) => client.begin(async transaction => work(createRepository(transaction))) as unknown as Promise<T> };
}

export async function withSourceLineageUnitOfWork<T>(work: (repository: SourceLineageRepository) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_UNCONFIGURED");
  const sql = postgres(url, { max: 1, prepare: true, ssl: "require" });
  try { return await sql.begin(async transaction => work(createRepository(transaction))) as unknown as T; } finally { await sql.end({ timeout: 5 }); }
}
