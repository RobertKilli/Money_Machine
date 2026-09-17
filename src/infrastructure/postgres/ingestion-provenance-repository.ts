import "server-only";
import postgres, { type Sql, type TransactionSql } from "postgres";
import {
  assertAvailabilityClaim,
  assertIngestionAttempt,
  assertIngestionRequest,
  assertLifecycleEvent,
  assertSourceArtifact,
  assertSourceEnvelope,
  assertSourceObservation,
  createIngestionAttempt,
  createIngestionRequest,
  createLifecycleEvent,
  createRetrievalAvailabilityClaim,
  createSourceArtifact,
  createSourceEnvelope,
  createSourceObservation,
  reduceIngestionLifecycle,
  availabilityClaimFingerprint,
  availabilityClaimIdFor,
  INGESTION_REQUEST_CONTRACT_VERSION,
  INGESTION_ATTEMPT_CONTRACT_VERSION,
  INGESTION_EVENT_CONTRACT_VERSION,
  SOURCE_ARTIFACT_CONTRACT_VERSION,
  SOURCE_ENVELOPE_CONTRACT_VERSION,
  SOURCE_OBSERVATION_CONTRACT_VERSION,
  AVAILABILITY_CLAIM_CONTRACT_VERSION,
  type AvailabilityClaim,
  type IngestionAttempt,
  type IngestionRequest,
  type LifecycleEvent,
  type SourceArtifact,
  type SourceEnvelope,
  type SourceObservation,
} from "@/domain/intelligence/ingestion-provenance";
import type {
  AsyncAvailabilityClaimRepository,
  AsyncIngestionAttemptRepository,
  AsyncIngestionEventRepository,
  AsyncIngestionProvenanceRepositories,
  AsyncIngestionRequestRepository,
  AsyncSourceArtifactRepository,
  AsyncSourceEnvelopeRepository,
  AsyncSourceObservationRepository,
  IngestionProvenanceUnitOfWork,
} from "@/application/intelligence/ingestion-provenance-persistence";

type DbClient = TransactionSql;
type RawRow = Record<string, unknown>;

const connection = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_UNCONFIGURED");
  return postgres(url, { max: 1, prepare: true, ssl: "require" });
};
const text = (value: unknown, code: string): string => { if (typeof value !== "string" || !value.trim()) throw new Error(code); return value.trim(); };
const timestamp = (value: unknown, code: string): string => { const result = value instanceof Date ? value.toISOString() : text(value, code); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) || Number.isNaN(Date.parse(result)) || new Date(result).toISOString() !== result) throw new Error(code); return result; };
const jsonObject = (value: unknown, code: string): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code); return value as Record<string, unknown>; };
const jsonArray = (value: unknown, code: string): readonly string[] => { if (!Array.isArray(value)) throw new Error(code); return value.map(item => text(item, code)); };
const json = (value: unknown): string => JSON.stringify(value);
const row = (value: unknown): RawRow => value as RawRow;
const storedContract = (value: unknown, expected: string, code: string): string => { const actual = text(value, code); if (actual !== expected) throw new Error(code); return actual; };
const compareStored = (actualId: string, expectedId: string, actualFingerprint: string, expectedFingerprint: string, idCode: string, fingerprintCode: string): void => { if (actualId !== expectedId) throw new Error(idCode); if (actualFingerprint !== expectedFingerprint) throw new Error(fingerprintCode); };

export function mapIngestionRequestRow(value: RawRow): IngestionRequest {
  const storedId = text(value.ingestion_request_id, "M5_INGESTION_REQUEST_ROW_ID_INVALID");
  const storedFingerprint = text(value.request_fingerprint, "M5_INGESTION_REQUEST_ROW_FINGERPRINT_INVALID");
  const record = createIngestionRequest({
    ingestionRequestId: text(value.ingestion_request_id, "M5_INGESTION_REQUEST_ROW_ID_INVALID"),
    contractVersion: storedContract(value.contract_version, INGESTION_REQUEST_CONTRACT_VERSION, "M5_INGESTION_REQUEST_ROW_CONTRACT_INVALID") as IngestionRequest["contractVersion"],
    idempotencyKey: text(value.idempotency_key, "M5_INGESTION_REQUEST_ROW_IDEMPOTENCY_INVALID"),
    providerId: text(value.provider_id, "M5_INGESTION_REQUEST_ROW_PROVIDER_INVALID"),
    datasetId: text(value.dataset_id, "M5_INGESTION_REQUEST_ROW_DATASET_INVALID"),
    datasetVersion: text(value.dataset_version, "M5_INGESTION_REQUEST_ROW_DATASET_VERSION_INVALID"),
    providerSourceNamespace: text(value.provider_source_namespace, "M5_INGESTION_REQUEST_ROW_NAMESPACE_INVALID"),
    envelopeSchemaVersion: text(value.envelope_schema_version, "M5_INGESTION_REQUEST_ROW_SCHEMA_INVALID"),
    requestScope: jsonObject(value.request_scope, "M5_INGESTION_REQUEST_ROW_SCOPE_INVALID") as IngestionRequest["requestScope"],
    adapterContractVersion: text(value.adapter_contract_version, "M5_INGESTION_REQUEST_ROW_ADAPTER_INVALID"),
    parserContractVersion: text(value.parser_contract_version, "M5_INGESTION_REQUEST_ROW_PARSER_INVALID"),
    requestFingerprint: storedFingerprint,
    requestedAt: timestamp(value.requested_at, "M5_INGESTION_REQUEST_ROW_REQUESTED_INVALID"),
    provenance: jsonObject(value.provenance, "M5_INGESTION_REQUEST_ROW_PROVENANCE_INVALID") as IngestionRequest["provenance"],
  } as IngestionRequest);
  compareStored(storedId, record.ingestionRequestId, storedFingerprint, record.requestFingerprint, "M5_INGESTION_REQUEST_ROW_ID_MISMATCH", "M5_INGESTION_REQUEST_ROW_FINGERPRINT_MISMATCH");
  return record;
}

export function mapIngestionAttemptRow(value: RawRow): IngestionAttempt {
  const storedId = text(value.ingestion_attempt_id, "M5_INGESTION_ATTEMPT_ROW_ID_INVALID");
  const storedFingerprint = text(value.attempt_fingerprint, "M5_INGESTION_ATTEMPT_ROW_FINGERPRINT_INVALID");
  const record = createIngestionAttempt({
    ingestionAttemptId: storedId,
    contractVersion: storedContract(value.contract_version, INGESTION_ATTEMPT_CONTRACT_VERSION, "M5_INGESTION_ATTEMPT_ROW_CONTRACT_INVALID") as IngestionAttempt["contractVersion"],
    ingestionRequestId: text(value.ingestion_request_id, "M5_INGESTION_ATTEMPT_ROW_REQUEST_INVALID"),
    attemptNumber: Number(value.attempt_number),
    adapterVersion: text(value.adapter_version, "M5_INGESTION_ATTEMPT_ROW_ADAPTER_INVALID"),
    parserVersion: text(value.parser_version, "M5_INGESTION_ATTEMPT_ROW_PARSER_INVALID"),
    executionInput: jsonObject(value.execution_input, "M5_INGESTION_ATTEMPT_ROW_INPUT_INVALID") as IngestionAttempt["executionInput"],
    attemptFingerprint: storedFingerprint,
    startedAt: timestamp(value.started_at, "M5_INGESTION_ATTEMPT_ROW_STARTED_INVALID"),
  } as IngestionAttempt);
  compareStored(storedId, record.ingestionAttemptId, storedFingerprint, record.attemptFingerprint, "M5_INGESTION_ATTEMPT_ROW_ID_MISMATCH", "M5_INGESTION_ATTEMPT_ROW_FINGERPRINT_MISMATCH");
  return record;
}

export function mapLifecycleEventRow(value: RawRow): LifecycleEvent {
  const payload = jsonObject(value.payload, "M5_INGESTION_EVENT_ROW_PAYLOAD_INVALID");
  const storedId = text(value.lifecycle_event_id, "M5_INGESTION_EVENT_ROW_ID_INVALID");
  const storedFingerprint = text(value.event_fingerprint, "M5_INGESTION_EVENT_ROW_FINGERPRINT_INVALID");
  const record = createLifecycleEvent({
    lifecycleEventId: storedId,
    ingestionAttemptId: text(value.ingestion_attempt_id, "M5_INGESTION_EVENT_ROW_ATTEMPT_INVALID"),
    contractVersion: storedContract(value.contract_version, INGESTION_EVENT_CONTRACT_VERSION, "M5_INGESTION_EVENT_ROW_CONTRACT_INVALID") as LifecycleEvent["contractVersion"],
    sequence: Number(value.sequence),
    eventType: text(value.event_type, "M5_INGESTION_EVENT_ROW_TYPE_INVALID") as LifecycleEvent["eventType"],
    payload: payload as LifecycleEvent["payload"],
    eventFingerprint: storedFingerprint,
    recordedAt: timestamp(value.recorded_at, "M5_INGESTION_EVENT_ROW_RECORDED_INVALID"),
  } as LifecycleEvent);
  compareStored(storedId, record.lifecycleEventId, storedFingerprint, record.eventFingerprint, "M5_INGESTION_EVENT_ROW_ID_MISMATCH", "M5_INGESTION_EVENT_ROW_FINGERPRINT_MISMATCH");
  return record;
}

export function mapSourceArtifactRow(value: RawRow): SourceArtifact {
  const storedId = text(value.source_artifact_id, "M5_SOURCE_ARTIFACT_ROW_ID_INVALID");
  const storedFingerprint = text(value.source_artifact_fingerprint, "M5_SOURCE_ARTIFACT_ROW_FINGERPRINT_INVALID");
  const record = createSourceArtifact({
    sourceArtifactId: storedId,
    contractVersion: storedContract(value.contract_version, SOURCE_ARTIFACT_CONTRACT_VERSION, "M5_SOURCE_ARTIFACT_ROW_CONTRACT_INVALID") as SourceArtifact["contractVersion"],
    providerId: text(value.provider_id, "M5_SOURCE_ARTIFACT_ROW_PROVIDER_INVALID"),
    datasetId: text(value.dataset_id, "M5_SOURCE_ARTIFACT_ROW_DATASET_INVALID"),
    datasetVersion: text(value.dataset_version, "M5_SOURCE_ARTIFACT_ROW_DATASET_VERSION_INVALID"),
    providerSourceNamespace: text(value.provider_source_namespace, "M5_SOURCE_ARTIFACT_ROW_NAMESPACE_INVALID"),
    providerExternalRecordId: text(value.provider_external_record_id, "M5_SOURCE_ARTIFACT_ROW_EXTERNAL_INVALID"),
    ...(value.provider_revision == null ? {} : { providerRevision: text(value.provider_revision, "M5_SOURCE_ARTIFACT_ROW_REVISION_INVALID") }),
    payloadFingerprint: text(value.payload_fingerprint, "M5_SOURCE_ARTIFACT_ROW_PAYLOAD_INVALID"),
    sourceArtifactFingerprint: storedFingerprint,
    recordedAt: timestamp(value.recorded_at, "M5_SOURCE_ARTIFACT_ROW_RECORDED_INVALID"),
  } as SourceArtifact);
  compareStored(storedId, record.sourceArtifactId, storedFingerprint, record.sourceArtifactFingerprint, "M5_SOURCE_ARTIFACT_ROW_ID_MISMATCH", "M5_SOURCE_ARTIFACT_ROW_FINGERPRINT_MISMATCH");
  return record;
}

export function mapSourceEnvelopeRow(value: RawRow): SourceEnvelope {
  const storedId = text(value.source_envelope_id, "M5_SOURCE_ENVELOPE_ROW_ID_INVALID");
  const storedFingerprint = text(value.source_envelope_fingerprint, "M5_SOURCE_ENVELOPE_ROW_FINGERPRINT_INVALID");
  const record = createSourceEnvelope({
    sourceEnvelopeId: storedId,
    contractVersion: storedContract(value.contract_version, SOURCE_ENVELOPE_CONTRACT_VERSION, "M5_SOURCE_ENVELOPE_ROW_CONTRACT_INVALID") as SourceEnvelope["contractVersion"],
    sourceArtifactId: text(value.source_artifact_id, "M5_SOURCE_ENVELOPE_ROW_ARTIFACT_INVALID"),
    parserContractVersion: text(value.parser_contract_version, "M5_SOURCE_ENVELOPE_ROW_PARSER_INVALID"),
    envelopeSchemaVersion: text(value.envelope_schema_version, "M5_SOURCE_ENVELOPE_ROW_SCHEMA_INVALID"),
    normalizedEnvelope: jsonObject(value.normalized_envelope, "M5_SOURCE_ENVELOPE_ROW_NORMALIZED_INVALID") as SourceEnvelope["normalizedEnvelope"],
    selectedAuditableFields: jsonObject(value.selected_auditable_fields, "M5_SOURCE_ENVELOPE_ROW_FIELDS_INVALID") as SourceEnvelope["selectedAuditableFields"],
    payloadFingerprint: text(value.payload_fingerprint, "M5_SOURCE_ENVELOPE_ROW_PAYLOAD_INVALID"),
    sourceEnvelopeFingerprint: storedFingerprint,
    ...(value.provider_published_at == null ? {} : { providerPublishedAt: timestamp(value.provider_published_at, "M5_SOURCE_ENVELOPE_ROW_PUBLISHED_INVALID") }),
    observedAt: timestamp(value.observed_at, "M5_SOURCE_ENVELOPE_ROW_OBSERVED_INVALID"),
    temporalQualityStatus: text(value.temporal_quality_status, "M5_SOURCE_ENVELOPE_ROW_STATUS_INVALID") as SourceEnvelope["temporalQualityStatus"],
    temporalDiagnosticCodes: jsonArray(value.temporal_diagnostic_codes, "M5_SOURCE_ENVELOPE_ROW_DIAGNOSTICS_INVALID"),
    recordedAt: timestamp(value.recorded_at, "M5_SOURCE_ENVELOPE_ROW_RECORDED_INVALID"),
  } as SourceEnvelope);
  compareStored(storedId, record.sourceEnvelopeId, storedFingerprint, record.sourceEnvelopeFingerprint, "M5_SOURCE_ENVELOPE_ROW_ID_MISMATCH", "M5_SOURCE_ENVELOPE_ROW_FINGERPRINT_MISMATCH");
  return record;
}

export function mapSourceObservationRow(value: RawRow): SourceObservation {
  const storedId = text(value.source_observation_id, "M5_SOURCE_OBSERVATION_ROW_ID_INVALID");
  const storedFingerprint = text(value.observation_fingerprint, "M5_SOURCE_OBSERVATION_ROW_FINGERPRINT_INVALID");
  const record = createSourceObservation({
    sourceObservationId: storedId,
    contractVersion: storedContract(value.contract_version, SOURCE_OBSERVATION_CONTRACT_VERSION, "M5_SOURCE_OBSERVATION_ROW_CONTRACT_INVALID") as SourceObservation["contractVersion"],
    ingestionAttemptId: text(value.ingestion_attempt_id, "M5_SOURCE_OBSERVATION_ROW_ATTEMPT_INVALID"),
    sourceArtifactId: text(value.source_artifact_id, "M5_SOURCE_OBSERVATION_ROW_ARTIFACT_INVALID"),
    responsePageOrdinal: Number(value.response_page_ordinal),
    itemOrdinal: Number(value.item_ordinal),
    retrievedAt: timestamp(value.retrieved_at, "M5_SOURCE_OBSERVATION_ROW_RETRIEVED_INVALID"),
    metadata: jsonObject(value.metadata, "M5_SOURCE_OBSERVATION_ROW_METADATA_INVALID") as SourceObservation["metadata"],
    observationFingerprint: storedFingerprint,
    recordedAt: timestamp(value.recorded_at, "M5_SOURCE_OBSERVATION_ROW_RECORDED_INVALID"),
  } as SourceObservation);
  compareStored(storedId, record.sourceObservationId, storedFingerprint, record.observationFingerprint, "M5_SOURCE_OBSERVATION_ROW_ID_MISMATCH", "M5_SOURCE_OBSERVATION_ROW_FINGERPRINT_MISMATCH");
  return record;
}

export function mapAvailabilityClaimRow(value: RawRow): AvailabilityClaim {
  const storedId = text(value.availability_claim_id, "M5_AVAILABILITY_ROW_ID_INVALID");
  const storedFingerprint = text(value.claim_fingerprint, "M5_AVAILABILITY_ROW_FINGERPRINT_INVALID");
  const record: AvailabilityClaim = {
    availabilityClaimId: storedId,
    sourceEnvelopeId: text(value.source_envelope_id, "M5_AVAILABILITY_ROW_ENVELOPE_INVALID"),
    sourceObservationId: text(value.source_observation_id, "M5_AVAILABILITY_ROW_OBSERVATION_INVALID"),
    contractVersion: storedContract(value.contract_version, AVAILABILITY_CLAIM_CONTRACT_VERSION, "M5_AVAILABILITY_ROW_CONTRACT_INVALID") as AvailabilityClaim["contractVersion"],
    basis: text(value.basis, "M5_AVAILABILITY_ROW_BASIS_INVALID") as AvailabilityClaim["basis"],
    effectiveAvailableAt: timestamp(value.effective_available_at, "M5_AVAILABILITY_ROW_AVAILABLE_INVALID"),
    claimFingerprint: storedFingerprint,
    recordedAt: timestamp(value.recorded_at, "M5_AVAILABILITY_ROW_RECORDED_INVALID"),
  };
  try { assertAvailabilityClaim(record); } catch (error) {
    if (error instanceof Error && error.message === "M5_INGESTION_AVAILABILITY_CLAIM_FINGERPRINT_MISMATCH") throw new Error("M5_AVAILABILITY_ROW_FINGERPRINT_MISMATCH");
    throw error;
  }
  const expectedId = availabilityClaimIdFor(record);
  const expectedFingerprint = availabilityClaimFingerprint(record);
  compareStored(storedId, expectedId, storedFingerprint, expectedFingerprint, "M5_AVAILABILITY_ROW_ID_MISMATCH", "M5_AVAILABILITY_ROW_FINGERPRINT_MISMATCH");
  return Object.freeze({ ...record });
}

/** Pure pre-replay guard used inside the locked transaction before ID replay handling. */
export function validateLifecycleHistoryForReplay(history: readonly LifecycleEvent[]): void {
  reduceIngestionLifecycle(history);
}

async function saveRequest(client: DbClient, input: IngestionRequest): Promise<IngestionRequest> {
  assertIngestionRequest(input); const record = createIngestionRequest(input);
  const inserted = await client`insert into public.intelligence_ingestion_requests (ingestion_request_id,contract_version,idempotency_key,provider_id,dataset_id,dataset_version,provider_source_namespace,envelope_schema_version,request_scope,adapter_contract_version,parser_contract_version,request_fingerprint,requested_at,provenance) values (${record.ingestionRequestId},${record.contractVersion},${record.idempotencyKey},${record.providerId},${record.datasetId},${record.datasetVersion},${record.providerSourceNamespace},${record.envelopeSchemaVersion},${json(record.requestScope)}::jsonb,${record.adapterContractVersion},${record.parserContractVersion},${record.requestFingerprint},${record.requestedAt},${json(record.provenance)}::jsonb) on conflict (ingestion_request_id) do nothing returning ingestion_request_id`;
  if (inserted.length) {
    const authoritative = await client`select * from public.intelligence_ingestion_requests where ingestion_request_id=${record.ingestionRequestId}`;
    return mapIngestionRequestRow(row(authoritative[0]));
  }
  const rows = await client`select * from public.intelligence_ingestion_requests where ingestion_request_id=${record.ingestionRequestId}`;
  const stored = mapIngestionRequestRow(row(rows[0]));
  if (stored.requestFingerprint !== record.requestFingerprint) throw new Error("M5_INGESTION_REQUEST_CONFLICT");
  return stored;
}

async function saveAttempt(client: DbClient, input: IngestionAttempt): Promise<IngestionAttempt> {
  assertIngestionAttempt(input); const record = createIngestionAttempt(input);
  const requests = await client`select * from public.intelligence_ingestion_requests where ingestion_request_id=${record.ingestionRequestId}`;
  if (requests.length !== 1) throw new Error("M5_INGESTION_REQUEST_NOT_FOUND");
  const request = mapIngestionRequestRow(row(requests[0]));
  if (record.parserVersion !== request.parserContractVersion) throw new Error("M5_INGESTION_ATTEMPT_PARSER_REQUEST_MISMATCH");
  if (record.adapterVersion !== request.adapterContractVersion) throw new Error("M5_INGESTION_ATTEMPT_ADAPTER_REQUEST_MISMATCH");
  const inserted = await client`insert into public.intelligence_ingestion_attempts (ingestion_attempt_id,ingestion_request_id,contract_version,attempt_number,adapter_version,parser_version,execution_input,attempt_fingerprint,started_at) values (${record.ingestionAttemptId},${record.ingestionRequestId},${record.contractVersion},${record.attemptNumber},${record.adapterVersion},${record.parserVersion},${json(record.executionInput)}::jsonb,${record.attemptFingerprint},${record.startedAt}) on conflict (ingestion_attempt_id) do nothing returning ingestion_attempt_id`;
  if (inserted.length) {
    const authoritative = await client`select * from public.intelligence_ingestion_attempts where ingestion_attempt_id=${record.ingestionAttemptId}`;
    return mapIngestionAttemptRow(row(authoritative[0]));
  }
  const rows = await client`select * from public.intelligence_ingestion_attempts where ingestion_attempt_id=${record.ingestionAttemptId}`;
  const stored = mapIngestionAttemptRow(row(rows[0]));
  if (stored.attemptFingerprint !== record.attemptFingerprint) throw new Error("M5_INGESTION_ATTEMPT_CONFLICT");
  return stored;
}

async function saveArtifact(client: DbClient, input: SourceArtifact): Promise<SourceArtifact> {
  assertSourceArtifact(input); const record = createSourceArtifact(input);
  const inserted = await client`insert into public.intelligence_source_artifacts (source_artifact_id,contract_version,provider_id,dataset_id,dataset_version,provider_source_namespace,provider_external_record_id,provider_revision,payload_fingerprint,source_artifact_fingerprint,recorded_at) values (${record.sourceArtifactId},${record.contractVersion},${record.providerId},${record.datasetId},${record.datasetVersion},${record.providerSourceNamespace},${record.providerExternalRecordId},${record.providerRevision ?? null},${record.payloadFingerprint},${record.sourceArtifactFingerprint},${record.recordedAt}) on conflict (source_artifact_id) do nothing returning source_artifact_id`;
  if (inserted.length) {
    const authoritative = await client`select * from public.intelligence_source_artifacts where source_artifact_id=${record.sourceArtifactId}`;
    return mapSourceArtifactRow(row(authoritative[0]));
  }
  const rows = await client`select * from public.intelligence_source_artifacts where source_artifact_id=${record.sourceArtifactId}`;
  const stored = mapSourceArtifactRow(row(rows[0]));
  if (stored.sourceArtifactFingerprint !== record.sourceArtifactFingerprint) throw new Error("M5_SOURCE_ARTIFACT_CONFLICT");
  return stored;
}

async function saveEnvelope(client: DbClient, input: SourceEnvelope): Promise<SourceEnvelope> {
  assertSourceEnvelope(input); const record = createSourceEnvelope(input);
  const artifacts = await client`select * from public.intelligence_source_artifacts where source_artifact_id=${record.sourceArtifactId}`;
  if (artifacts.length !== 1) throw new Error("M5_SOURCE_ARTIFACT_NOT_FOUND");
  const artifact = mapSourceArtifactRow(row(artifacts[0]));
  if (artifact.payloadFingerprint !== record.payloadFingerprint) throw new Error("M5_SOURCE_ENVELOPE_PAYLOAD_MISMATCH");
  const inserted = await client`insert into public.intelligence_source_envelopes (source_envelope_id,contract_version,source_artifact_id,parser_contract_version,envelope_schema_version,normalized_envelope,selected_auditable_fields,payload_fingerprint,source_envelope_fingerprint,provider_published_at,observed_at,temporal_quality_status,temporal_diagnostic_codes,recorded_at) values (${record.sourceEnvelopeId},${record.contractVersion},${record.sourceArtifactId},${record.parserContractVersion},${record.envelopeSchemaVersion},${json(record.normalizedEnvelope)}::jsonb,${json(record.selectedAuditableFields)}::jsonb,${record.payloadFingerprint},${record.sourceEnvelopeFingerprint},${record.providerPublishedAt ?? null},${record.observedAt},${record.temporalQualityStatus},${json(record.temporalDiagnosticCodes)}::jsonb,${record.recordedAt}) on conflict (source_envelope_id) do nothing returning source_envelope_id`;
  if (inserted.length) {
    const authoritative = await client`select * from public.intelligence_source_envelopes where source_envelope_id=${record.sourceEnvelopeId}`;
    return mapSourceEnvelopeRow(row(authoritative[0]));
  }
  const rows = await client`select * from public.intelligence_source_envelopes where source_envelope_id=${record.sourceEnvelopeId}`;
  const stored = mapSourceEnvelopeRow(row(rows[0]));
  if (stored.sourceEnvelopeFingerprint !== record.sourceEnvelopeFingerprint) throw new Error("M5_SOURCE_ENVELOPE_CONFLICT");
  return stored;
}

async function saveObservation(client: DbClient, input: SourceObservation): Promise<SourceObservation> {
  assertSourceObservation(input); const record = createSourceObservation(input);
  const attempts = await client`select * from public.intelligence_ingestion_attempts where ingestion_attempt_id=${record.ingestionAttemptId}`;
  if (attempts.length !== 1) throw new Error("M5_INGESTION_ATTEMPT_NOT_FOUND");
  const attempt = mapIngestionAttemptRow(row(attempts[0]));
  const requests = await client`select * from public.intelligence_ingestion_requests where ingestion_request_id=${attempt.ingestionRequestId}`;
  if (requests.length !== 1) throw new Error("M5_INGESTION_REQUEST_NOT_FOUND");
  const request = mapIngestionRequestRow(row(requests[0]));
  const artifacts = await client`select * from public.intelligence_source_artifacts where source_artifact_id=${record.sourceArtifactId}`;
  if (artifacts.length !== 1) throw new Error("M5_SOURCE_ARTIFACT_NOT_FOUND");
  const artifact = mapSourceArtifactRow(row(artifacts[0]));
  if (artifact.providerId !== request.providerId || artifact.datasetId !== request.datasetId || artifact.datasetVersion !== request.datasetVersion) throw new Error("M5_INGESTION_OBSERVATION_REQUEST_MISMATCH");
  const inserted = await client`insert into public.intelligence_ingestion_source_observations (source_observation_id,contract_version,ingestion_attempt_id,source_artifact_id,response_page_ordinal,item_ordinal,retrieved_at,metadata,observation_fingerprint,recorded_at) values (${record.sourceObservationId},${record.contractVersion},${record.ingestionAttemptId},${record.sourceArtifactId},${record.responsePageOrdinal},${record.itemOrdinal},${record.retrievedAt},${json(record.metadata)}::jsonb,${record.observationFingerprint},${record.recordedAt}) on conflict (source_observation_id) do nothing returning source_observation_id`;
  if (inserted.length) {
    const authoritative = await client`select * from public.intelligence_ingestion_source_observations where source_observation_id=${record.sourceObservationId}`;
    return mapSourceObservationRow(row(authoritative[0]));
  }
  const rows = await client`select * from public.intelligence_ingestion_source_observations where source_observation_id=${record.sourceObservationId}`;
  const stored = mapSourceObservationRow(row(rows[0]));
  if (stored.observationFingerprint !== record.observationFingerprint) throw new Error("M5_SOURCE_OBSERVATION_CONFLICT");
  return stored;
}

async function saveClaim(client: DbClient, input: AvailabilityClaim): Promise<AvailabilityClaim> {
  assertAvailabilityClaim(input);
  const envelopes = await client`select * from public.intelligence_source_envelopes where source_envelope_id=${input.sourceEnvelopeId}`;
  if (envelopes.length !== 1) throw new Error("M5_SOURCE_ENVELOPE_NOT_FOUND");
  const envelope = mapSourceEnvelopeRow(row(envelopes[0]));
  const observations = await client`select * from public.intelligence_ingestion_source_observations where source_observation_id=${input.sourceObservationId}`;
  if (observations.length !== 1) throw new Error("M5_SOURCE_OBSERVATION_NOT_FOUND");
  const observation = mapSourceObservationRow(row(observations[0]));
  const record = createRetrievalAvailabilityClaim({ envelope, observation, recordedAt: input.recordedAt });
  if (record.availabilityClaimId !== input.availabilityClaimId || record.claimFingerprint !== input.claimFingerprint || record.effectiveAvailableAt !== input.effectiveAvailableAt) throw new Error("M5_INGESTION_AVAILABILITY_CLAIM_INVALID");
  const inserted = await client`insert into public.intelligence_source_availability_claims (availability_claim_id,source_envelope_id,source_observation_id,contract_version,basis,effective_available_at,claim_fingerprint,recorded_at,source_artifact_id,temporal_quality_status) values (${record.availabilityClaimId},${record.sourceEnvelopeId},${record.sourceObservationId},${record.contractVersion},${record.basis},${record.effectiveAvailableAt},${record.claimFingerprint},${record.recordedAt},${envelope.sourceArtifactId},${envelope.temporalQualityStatus}) on conflict (availability_claim_id) do nothing returning availability_claim_id`;
  if (inserted.length) {
    const authoritative = await client`select * from public.intelligence_source_availability_claims where availability_claim_id=${record.availabilityClaimId}`;
    return mapAvailabilityClaimRow(row(authoritative[0]));
  }
  const rows = await client`select * from public.intelligence_source_availability_claims where availability_claim_id=${record.availabilityClaimId}`;
  const stored = mapAvailabilityClaimRow(row(rows[0]));
  assertAvailabilityClaim(stored);
  if (stored.claimFingerprint !== record.claimFingerprint) throw new Error("M5_AVAILABILITY_CLAIM_CONFLICT");
  return stored;
}

async function saveEvent(client: DbClient, input: LifecycleEvent): Promise<LifecycleEvent> {
  assertLifecycleEvent(input); const record = createLifecycleEvent(input);
  const attempts = await client`select * from public.intelligence_ingestion_attempts where ingestion_attempt_id=${record.ingestionAttemptId} for update`;
  if (attempts.length !== 1) throw new Error("M5_INGESTION_ATTEMPT_NOT_FOUND");
  const historyRows = await client`select * from public.intelligence_ingestion_events where ingestion_attempt_id=${record.ingestionAttemptId} order by sequence asc, lifecycle_event_id asc`;
  const history = historyRows.map(value => mapLifecycleEventRow(row(value)));
  validateLifecycleHistoryForReplay(history);
  const existing = history.find(value => value.lifecycleEventId === record.lifecycleEventId);
  if (existing) {
    if (existing.eventFingerprint !== record.eventFingerprint) throw new Error("M5_INGESTION_LIFECYCLE_EVENT_CONFLICT");
    return existing;
  }
  if (record.eventType === "SOURCE_OBSERVED") {
    const observationId = record.payload.sourceObservationId;
    if (typeof observationId !== "string") throw new Error("M5_INGESTION_SOURCE_OBSERVED_PAYLOAD_INVALID");
    const observations = await client`select * from public.intelligence_ingestion_source_observations where source_observation_id=${observationId}`;
    if (observations.length !== 1 || mapSourceObservationRow(row(observations[0])).ingestionAttemptId !== record.ingestionAttemptId) throw new Error("M5_INGESTION_EVENT_OBSERVATION_MISMATCH");
  }
  reduceIngestionLifecycle([...history, record].sort((a, b) => a.sequence - b.sequence || a.lifecycleEventId.localeCompare(b.lifecycleEventId)));
  const sourceObservationId = record.eventType === "SOURCE_OBSERVED" && typeof record.payload.sourceObservationId === "string" ? record.payload.sourceObservationId : null;
  const inserted = await client`insert into public.intelligence_ingestion_events (lifecycle_event_id,ingestion_attempt_id,contract_version,sequence,event_type,payload,event_fingerprint,recorded_at,source_observation_id) values (${record.lifecycleEventId},${record.ingestionAttemptId},${record.contractVersion},${record.sequence},${record.eventType},${json(record.payload)}::jsonb,${record.eventFingerprint},${record.recordedAt},${sourceObservationId}) on conflict (lifecycle_event_id) do nothing returning lifecycle_event_id`;
  if (!inserted.length) {
    const rows = await client`select * from public.intelligence_ingestion_events where lifecycle_event_id=${record.lifecycleEventId}`;
    const stored = mapLifecycleEventRow(row(rows[0]));
    if (stored.eventFingerprint !== record.eventFingerprint) throw new Error("M5_INGESTION_LIFECYCLE_EVENT_CONFLICT");
    return stored;
  }
  const authoritative = await client`select * from public.intelligence_ingestion_events where lifecycle_event_id=${record.lifecycleEventId}`;
  return mapLifecycleEventRow(row(authoritative[0]));
}

function createTransactionIngestionProvenanceRepositories(client: TransactionSql): AsyncIngestionProvenanceRepositories {
  const requests: AsyncIngestionRequestRepository = { save: record => saveRequest(client, record), readById: async id => { const rows = await client`select * from public.intelligence_ingestion_requests where ingestion_request_id=${id}`; return rows.length === 0 ? undefined : mapIngestionRequestRow(row(rows[0])); } };
  const attempts: AsyncIngestionAttemptRepository = { save: record => saveAttempt(client, record), readById: async id => { const rows = await client`select * from public.intelligence_ingestion_attempts where ingestion_attempt_id=${id}`; return rows.length === 0 ? undefined : mapIngestionAttemptRow(row(rows[0])); } };
  const events: AsyncIngestionEventRepository = { save: record => saveEvent(client, record), readByAttempt: async id => { const rows = await client`select * from public.intelligence_ingestion_events where ingestion_attempt_id=${id} order by sequence asc, lifecycle_event_id asc`; return Object.freeze(rows.map(value => mapLifecycleEventRow(row(value)))); } };
  const artifacts: AsyncSourceArtifactRepository = { save: record => saveArtifact(client, record), readById: async id => { const rows = await client`select * from public.intelligence_source_artifacts where source_artifact_id=${id}`; return rows.length === 0 ? undefined : mapSourceArtifactRow(row(rows[0])); } };
  const envelopes: AsyncSourceEnvelopeRepository = { save: record => saveEnvelope(client, record), readById: async id => { const rows = await client`select * from public.intelligence_source_envelopes where source_envelope_id=${id}`; return rows.length === 0 ? undefined : mapSourceEnvelopeRow(row(rows[0])); } };
  const observations: AsyncSourceObservationRepository = { save: record => saveObservation(client, record), readById: async id => { const rows = await client`select * from public.intelligence_ingestion_source_observations where source_observation_id=${id}`; return rows.length === 0 ? undefined : mapSourceObservationRow(row(rows[0])); }, readByArtifact: async id => { const rows = await client`select * from public.intelligence_ingestion_source_observations where source_artifact_id=${id} order by retrieved_at asc, source_observation_id asc`; return Object.freeze(rows.map(value => mapSourceObservationRow(row(value)))); } };
  const availabilityClaims: AsyncAvailabilityClaimRepository = { save: record => saveClaim(client, record), readById: async id => { const rows = await client`select * from public.intelligence_source_availability_claims where availability_claim_id=${id}`; return rows.length === 0 ? undefined : mapAvailabilityClaimRow(row(rows[0])); } };
  return Object.freeze({ requests, attempts, events, artifacts, envelopes, observations, availabilityClaims });
}

export function createIngestionProvenanceUnitOfWork(client: Sql): IngestionProvenanceUnitOfWork {
  return { withTransaction: <T>(work: (repositories: AsyncIngestionProvenanceRepositories) => Promise<T>) => client.begin(async transaction => work(createTransactionIngestionProvenanceRepositories(transaction))) as unknown as Promise<T> };
}

export async function withIngestionProvenanceUnitOfWork<T>(work: (repositories: AsyncIngestionProvenanceRepositories) => Promise<T>): Promise<T> {
  const sql = connection();
  try { return await sql.begin(async transaction => work(createTransactionIngestionProvenanceRepositories(transaction))) as unknown as T; } finally { await sql.end({ timeout: 5 }); }
}
