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

const time = "2026-01-01T00:00:00.000Z";

describe("M5 provenance PostgreSQL row mapping", () => {
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
});
