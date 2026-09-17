import { describe, expect, it } from "vitest";
import {
  mapAvailabilityClaimRow,
  mapIngestionAttemptRow,
  mapIngestionRequestRow,
  mapLifecycleEventRow,
  mapSourceArtifactRow,
  mapSourceEnvelopeRow,
  mapSourceObservationRow,
} from "@/infrastructure/postgres/ingestion-provenance-repository";
import { createIngestionAttempt, createIngestionRequest, createLifecycleEvent, createRetrievalAvailabilityClaim, createSourceArtifact, createSourceEnvelope, createSourceObservation } from "@/domain/intelligence/ingestion-provenance";
import * as postgresRepository from "@/infrastructure/postgres/ingestion-provenance-repository";

const time = "2026-01-01T00:00:00.000Z";

describe("M5 provenance PostgreSQL row mapping", () => {
  it("exposes lifecycle persistence only through the transaction unit of work", () => {
    expect("createIngestionProvenanceRepositories" in postgresRepository).toBe(false);
    expect(typeof postgresRepository.createIngestionProvenanceUnitOfWork).toBe("function");
  });

  it("maps a request with trusted registry and parser material", () => {
    const record = createIngestionRequest({ idempotencyKey: "key", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", providerSourceNamespace: "FIXTURE", envelopeSchemaVersion: "envelope/v1", requestScope: {}, adapterContractVersion: "adapter/v1", parserContractVersion: "parser/v1", requestedAt: time, provenance: {} });
    const value = mapIngestionRequestRow({ ingestion_request_id: record.ingestionRequestId, contract_version: record.contractVersion, idempotency_key: record.idempotencyKey, provider_id: record.providerId, dataset_id: record.datasetId, dataset_version: record.datasetVersion, provider_source_namespace: record.providerSourceNamespace, envelope_schema_version: record.envelopeSchemaVersion, request_scope: record.requestScope, adapter_contract_version: record.adapterContractVersion, parser_contract_version: record.parserContractVersion, request_fingerprint: record.requestFingerprint, requested_at: record.requestedAt, provenance: record.provenance });
    expect(value.ingestionRequestId).toBe(record.ingestionRequestId);
  });

  it("maps attempts and lifecycle events", () => {
    const attemptRecord = createIngestionAttempt({ ingestionRequestId: "request", attemptNumber: 1, adapterVersion: "adapter/v1", parserVersion: "parser/v1", executionInput: {}, startedAt: time });
    const attempt = mapIngestionAttemptRow({ ingestion_attempt_id: attemptRecord.ingestionAttemptId, ingestion_request_id: attemptRecord.ingestionRequestId, contract_version: attemptRecord.contractVersion, attempt_number: attemptRecord.attemptNumber, adapter_version: attemptRecord.adapterVersion, parser_version: attemptRecord.parserVersion, execution_input: attemptRecord.executionInput, attempt_fingerprint: attemptRecord.attemptFingerprint, started_at: attemptRecord.startedAt });
    expect(attempt.attemptNumber).toBe(1);
    const eventRecord = createLifecycleEvent({ ingestionAttemptId: "attempt", sequence: 1, eventType: "STARTED", payload: {}, recordedAt: time });
    const event = mapLifecycleEventRow({ lifecycle_event_id: eventRecord.lifecycleEventId, ingestion_attempt_id: eventRecord.ingestionAttemptId, contract_version: eventRecord.contractVersion, sequence: eventRecord.sequence, event_type: eventRecord.eventType, payload: eventRecord.payload, event_fingerprint: eventRecord.eventFingerprint, recorded_at: eventRecord.recordedAt });
    expect(event.eventType).toBe("STARTED");
  });

  it("maps artifact, envelope and observation records through domain factories", () => {
    const artifactRecord = createSourceArtifact({ providerId: "provider", datasetId: "dataset", datasetVersion: "v1", providerSourceNamespace: "FIXTURE", providerExternalRecordId: "external", payloadFingerprint: "a".repeat(64), recordedAt: time });
    const artifact = mapSourceArtifactRow({ source_artifact_id: artifactRecord.sourceArtifactId, contract_version: artifactRecord.contractVersion, provider_id: artifactRecord.providerId, dataset_id: artifactRecord.datasetId, dataset_version: artifactRecord.datasetVersion, provider_source_namespace: artifactRecord.providerSourceNamespace, provider_external_record_id: artifactRecord.providerExternalRecordId, provider_revision: null, payload_fingerprint: artifactRecord.payloadFingerprint, source_artifact_fingerprint: artifactRecord.sourceArtifactFingerprint, recorded_at: artifactRecord.recordedAt });
    expect(artifact.payloadFingerprint).toBe(artifactRecord.payloadFingerprint);
    const envelopeRecord = createSourceEnvelope({ sourceArtifactId: artifactRecord.sourceArtifactId, parserContractVersion: "parser/v1", envelopeSchemaVersion: "envelope/v1", normalizedEnvelope: {}, selectedAuditableFields: {}, payloadFingerprint: artifactRecord.payloadFingerprint, observedAt: time, temporalQualityStatus: "RESOLVED", temporalDiagnosticCodes: [], recordedAt: time });
    const envelope = mapSourceEnvelopeRow({ source_envelope_id: envelopeRecord.sourceEnvelopeId, contract_version: envelopeRecord.contractVersion, source_artifact_id: envelopeRecord.sourceArtifactId, parser_contract_version: envelopeRecord.parserContractVersion, envelope_schema_version: envelopeRecord.envelopeSchemaVersion, normalized_envelope: envelopeRecord.normalizedEnvelope, selected_auditable_fields: envelopeRecord.selectedAuditableFields, payload_fingerprint: envelopeRecord.payloadFingerprint, source_envelope_fingerprint: envelopeRecord.sourceEnvelopeFingerprint, provider_published_at: null, observed_at: envelopeRecord.observedAt, temporal_quality_status: envelopeRecord.temporalQualityStatus, temporal_diagnostic_codes: [], recorded_at: envelopeRecord.recordedAt });
    expect(envelope.temporalQualityStatus).toBe("RESOLVED");
    const observationRecord = createSourceObservation({ ingestionAttemptId: "attempt", sourceArtifactId: artifactRecord.sourceArtifactId, responsePageOrdinal: 0, itemOrdinal: 0, retrievedAt: time, metadata: { pageOrdinal: 0, cursorSafety: "NONE" }, recordedAt: time });
    const observation = mapSourceObservationRow({ source_observation_id: observationRecord.sourceObservationId, contract_version: observationRecord.contractVersion, ingestion_attempt_id: observationRecord.ingestionAttemptId, source_artifact_id: observationRecord.sourceArtifactId, response_page_ordinal: observationRecord.responsePageOrdinal, item_ordinal: observationRecord.itemOrdinal, retrieved_at: observationRecord.retrievedAt, metadata: observationRecord.metadata, observation_fingerprint: observationRecord.observationFingerprint, recorded_at: observationRecord.recordedAt });
    expect(observation.itemOrdinal).toBe(0);
  });

  it("maps availability claims and rejects invalid stored fingerprints", () => {
    const artifactRecord = createSourceArtifact({ providerId: "provider", datasetId: "dataset", datasetVersion: "v1", providerSourceNamespace: "FIXTURE", providerExternalRecordId: "external", payloadFingerprint: "a".repeat(64), recordedAt: time });
    const envelopeRecord = createSourceEnvelope({ sourceArtifactId: artifactRecord.sourceArtifactId, parserContractVersion: "parser/v1", envelopeSchemaVersion: "envelope/v1", normalizedEnvelope: {}, selectedAuditableFields: {}, payloadFingerprint: artifactRecord.payloadFingerprint, observedAt: time, temporalQualityStatus: "RESOLVED", temporalDiagnosticCodes: [], recordedAt: time });
    const observationRecord = createSourceObservation({ ingestionAttemptId: "attempt", sourceArtifactId: artifactRecord.sourceArtifactId, responsePageOrdinal: 0, itemOrdinal: 0, retrievedAt: time, metadata: { pageOrdinal: 0, cursorSafety: "NONE" }, recordedAt: time });
    const claimRecord = createRetrievalAvailabilityClaim({ envelope: envelopeRecord, observation: observationRecord, recordedAt: time });
    const claim = mapAvailabilityClaimRow({ availability_claim_id: claimRecord.availabilityClaimId, source_envelope_id: claimRecord.sourceEnvelopeId, source_observation_id: claimRecord.sourceObservationId, contract_version: claimRecord.contractVersion, basis: claimRecord.basis, effective_available_at: claimRecord.effectiveAvailableAt, claim_fingerprint: claimRecord.claimFingerprint, recorded_at: claimRecord.recordedAt, source_artifact_id: artifactRecord.sourceArtifactId, temporal_quality_status: "RESOLVED" });
    expect(claim.basis).toBe("RETRIEVAL_OBSERVED");
    expect(() => mapSourceArtifactRow({ source_artifact_id: artifactRecord.sourceArtifactId, contract_version: artifactRecord.contractVersion, provider_id: artifactRecord.providerId, dataset_id: artifactRecord.datasetId, dataset_version: artifactRecord.datasetVersion, provider_source_namespace: artifactRecord.providerSourceNamespace, provider_external_record_id: artifactRecord.providerExternalRecordId, provider_revision: null, payload_fingerprint: "bad", source_artifact_fingerprint: artifactRecord.sourceArtifactFingerprint, recorded_at: artifactRecord.recordedAt })).toThrow("M5_INGESTION_PAYLOAD_FINGERPRINT_INVALID");
  });

  it("fails closed when stored identifiers or fingerprints do not match reconstructed records", () => {
    const request = createIngestionRequest({ idempotencyKey: "map-key", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", providerSourceNamespace: "FIXTURE", envelopeSchemaVersion: "envelope/v1", requestScope: {}, adapterContractVersion: "adapter/v1", parserContractVersion: "parser/v1", requestedAt: time, provenance: {} });
    const requestRow = { ingestion_request_id: request.ingestionRequestId, contract_version: request.contractVersion, idempotency_key: request.idempotencyKey, provider_id: request.providerId, dataset_id: request.datasetId, dataset_version: request.datasetVersion, provider_source_namespace: request.providerSourceNamespace, envelope_schema_version: request.envelopeSchemaVersion, request_scope: request.requestScope, adapter_contract_version: request.adapterContractVersion, parser_contract_version: request.parserContractVersion, request_fingerprint: request.requestFingerprint, requested_at: request.requestedAt, provenance: request.provenance };
    expect(() => mapIngestionRequestRow({ ...requestRow, ingestion_request_id: "forged" })).toThrow("M5_INGESTION_REQUEST_ROW_ID_MISMATCH");
    expect(() => mapIngestionRequestRow({ ...requestRow, request_fingerprint: "f".repeat(64) })).toThrow("M5_INGESTION_REQUEST_ROW_FINGERPRINT_MISMATCH");
    const attempt = createIngestionAttempt({ ingestionRequestId: request.ingestionRequestId, attemptNumber: 1, adapterVersion: "adapter/v1", parserVersion: "parser/v1", executionInput: {}, startedAt: time });
    const attemptRow = { ingestion_attempt_id: attempt.ingestionAttemptId, ingestion_request_id: attempt.ingestionRequestId, contract_version: attempt.contractVersion, attempt_number: attempt.attemptNumber, adapter_version: attempt.adapterVersion, parser_version: attempt.parserVersion, execution_input: attempt.executionInput, attempt_fingerprint: attempt.attemptFingerprint, started_at: attempt.startedAt };
    expect(() => mapIngestionAttemptRow({ ...attemptRow, attempt_fingerprint: "e".repeat(64) })).toThrow("M5_INGESTION_ATTEMPT_ROW_FINGERPRINT_MISMATCH");
    const event = createLifecycleEvent({ ingestionAttemptId: attempt.ingestionAttemptId, sequence: 1, eventType: "STARTED", payload: {}, recordedAt: time });
    const eventRow = { lifecycle_event_id: event.lifecycleEventId, ingestion_attempt_id: event.ingestionAttemptId, contract_version: event.contractVersion, sequence: event.sequence, event_type: event.eventType, payload: event.payload, event_fingerprint: event.eventFingerprint, recorded_at: event.recordedAt };
    expect(() => mapLifecycleEventRow({ ...eventRow, lifecycle_event_id: "forged" })).toThrow("M5_INGESTION_EVENT_ROW_ID_MISMATCH");
    expect(() => mapLifecycleEventRow({ ...eventRow, event_fingerprint: "d".repeat(64) })).toThrow("M5_INGESTION_EVENT_ROW_FINGERPRINT_MISMATCH");
    const artifact = createSourceArtifact({ providerId: "provider", datasetId: "dataset", datasetVersion: "v1", providerSourceNamespace: "FIXTURE", providerExternalRecordId: "map-external", payloadFingerprint: "a".repeat(64), recordedAt: time });
    const artifactRow = { source_artifact_id: artifact.sourceArtifactId, contract_version: artifact.contractVersion, provider_id: artifact.providerId, dataset_id: artifact.datasetId, dataset_version: artifact.datasetVersion, provider_source_namespace: artifact.providerSourceNamespace, provider_external_record_id: artifact.providerExternalRecordId, provider_revision: null, payload_fingerprint: artifact.payloadFingerprint, source_artifact_fingerprint: artifact.sourceArtifactFingerprint, recorded_at: artifact.recordedAt };
    expect(() => mapSourceArtifactRow({ ...artifactRow, source_artifact_fingerprint: "b".repeat(64) })).toThrow("M5_SOURCE_ARTIFACT_ROW_FINGERPRINT_MISMATCH");
    const envelope = createSourceEnvelope({ sourceArtifactId: artifact.sourceArtifactId, parserContractVersion: "parser/v1", envelopeSchemaVersion: "envelope/v1", normalizedEnvelope: {}, selectedAuditableFields: {}, payloadFingerprint: artifact.payloadFingerprint, observedAt: time, temporalQualityStatus: "RESOLVED", temporalDiagnosticCodes: [], recordedAt: time });
    const envelopeRow = { source_envelope_id: envelope.sourceEnvelopeId, contract_version: envelope.contractVersion, source_artifact_id: envelope.sourceArtifactId, parser_contract_version: envelope.parserContractVersion, envelope_schema_version: envelope.envelopeSchemaVersion, normalized_envelope: envelope.normalizedEnvelope, selected_auditable_fields: envelope.selectedAuditableFields, payload_fingerprint: envelope.payloadFingerprint, source_envelope_fingerprint: envelope.sourceEnvelopeFingerprint, provider_published_at: null, observed_at: envelope.observedAt, temporal_quality_status: envelope.temporalQualityStatus, temporal_diagnostic_codes: [], recorded_at: envelope.recordedAt };
    expect(() => mapSourceEnvelopeRow({ ...envelopeRow, source_envelope_fingerprint: "c".repeat(64) })).toThrow("M5_SOURCE_ENVELOPE_ROW_FINGERPRINT_MISMATCH");
    const observation = createSourceObservation({ ingestionAttemptId: attempt.ingestionAttemptId, sourceArtifactId: artifact.sourceArtifactId, responsePageOrdinal: 0, itemOrdinal: 0, retrievedAt: time, metadata: { pageOrdinal: 0, cursorSafety: "NONE" }, recordedAt: time });
    const observationRow = { source_observation_id: observation.sourceObservationId, contract_version: observation.contractVersion, ingestion_attempt_id: observation.ingestionAttemptId, source_artifact_id: observation.sourceArtifactId, response_page_ordinal: observation.responsePageOrdinal, item_ordinal: observation.itemOrdinal, retrieved_at: observation.retrievedAt, metadata: observation.metadata, observation_fingerprint: observation.observationFingerprint, recorded_at: observation.recordedAt };
    expect(() => mapSourceObservationRow({ ...observationRow, observation_fingerprint: "d".repeat(64) })).toThrow("M5_SOURCE_OBSERVATION_ROW_FINGERPRINT_MISMATCH");
    const claim = createRetrievalAvailabilityClaim({ envelope, observation, recordedAt: time });
    const claimRow = { availability_claim_id: claim.availabilityClaimId, source_envelope_id: claim.sourceEnvelopeId, source_observation_id: claim.sourceObservationId, contract_version: claim.contractVersion, basis: claim.basis, effective_available_at: claim.effectiveAvailableAt, claim_fingerprint: claim.claimFingerprint, recorded_at: claim.recordedAt };
    expect(() => mapAvailabilityClaimRow({ ...claimRow, claim_fingerprint: "e".repeat(64) })).toThrow("M5_AVAILABILITY_ROW_FINGERPRINT_MISMATCH");
    expect(() => mapAvailabilityClaimRow({ ...claimRow, contract_version: "not-v1" })).toThrow("M5_AVAILABILITY_ROW_CONTRACT_INVALID");
  });
});
