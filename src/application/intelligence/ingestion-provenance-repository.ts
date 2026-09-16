import {
  assertAvailabilityClaim,
  assertIngestionAttempt,
  assertIngestionRequest,
  assertSourceArtifact,
  assertSourceEnvelope,
  assertSourceObservation,
  reduceIngestionLifecycle,
  type AvailabilityClaim,
  type IngestionAttempt,
  type IngestionRequest,
  type LifecycleEvent,
  type SourceArtifact,
  type SourceEnvelope,
  type SourceObservation,
} from "@/domain/intelligence/ingestion-provenance";

export interface IngestionRequestRepository {
  readonly save: (record: IngestionRequest) => IngestionRequest;
  readonly readById: (id: string) => IngestionRequest | undefined;
}

export interface IngestionAttemptRepository {
  readonly save: (record: IngestionAttempt) => IngestionAttempt;
  readonly readById: (id: string) => IngestionAttempt | undefined;
}

export interface IngestionEventRepository {
  readonly save: (record: LifecycleEvent) => LifecycleEvent;
  readonly readByAttempt: (attemptId: string) => readonly LifecycleEvent[];
}

export interface SourceArtifactRepository {
  readonly save: (record: SourceArtifact) => SourceArtifact;
  readonly readById: (id: string) => SourceArtifact | undefined;
}

export interface SourceEnvelopeRepository {
  readonly save: (record: SourceEnvelope) => SourceEnvelope;
  readonly readById: (id: string) => SourceEnvelope | undefined;
}

export interface SourceObservationRepository {
  readonly save: (record: SourceObservation) => SourceObservation;
  readonly readById: (id: string) => SourceObservation | undefined;
  readonly readByArtifact: (artifactId: string) => readonly SourceObservation[];
}

export interface AvailabilityClaimRepository {
  readonly save: (record: AvailabilityClaim) => AvailabilityClaim;
  readonly readById: (id: string) => AvailabilityClaim | undefined;
}

export type InMemoryIngestionProvenanceRepositories = Readonly<{
  requests: IngestionRequestRepository;
  attempts: IngestionAttemptRepository;
  events: IngestionEventRepository;
  artifacts: SourceArtifactRepository;
  envelopes: SourceEnvelopeRepository;
  observations: SourceObservationRepository;
  availabilityClaims: AvailabilityClaimRepository;
}>;

function idempotentSave<T extends { readonly [key: string]: unknown }>(
  map: Map<string, T>,
  id: string,
  value: T,
  fingerprintKey: keyof T,
  conflictCode: string,
): T {
  const existing = map.get(id);
  if (!existing) {
    map.set(id, value);
    return value;
  }
  if (existing[fingerprintKey] !== value[fingerprintKey]) throw new Error(conflictCode);
  return existing;
}

export function createInMemoryIngestionProvenanceRepositories(): InMemoryIngestionProvenanceRepositories {
  const requests = new Map<string, IngestionRequest>();
  const attempts = new Map<string, IngestionAttempt>();
  const events = new Map<string, LifecycleEvent>();
  const artifacts = new Map<string, SourceArtifact>();
  const envelopes = new Map<string, SourceEnvelope>();
  const observations = new Map<string, SourceObservation>();
  const availabilityClaims = new Map<string, AvailabilityClaim>();

  const requestRepository: IngestionRequestRepository = {
    save: record => { assertIngestionRequest(record); return idempotentSave(requests, record.ingestionRequestId, record, "requestFingerprint", "M5_INGESTION_REQUEST_CONFLICT"); },
    readById: id => requests.get(id),
  };
  const attemptRepository: IngestionAttemptRepository = {
    save: record => { assertIngestionAttempt(record); if (!requests.has(record.ingestionRequestId)) throw new Error("M5_INGESTION_REQUEST_NOT_FOUND"); return idempotentSave(attempts, record.ingestionAttemptId, record, "attemptFingerprint", "M5_INGESTION_ATTEMPT_CONFLICT"); },
    readById: id => attempts.get(id),
  };
  const eventRepository: IngestionEventRepository = {
    save: record => {
      const attempt = attempts.get(record.ingestionAttemptId);
      if (!attempt) throw new Error("M5_INGESTION_ATTEMPT_NOT_FOUND");
      const existing = events.get(record.lifecycleEventId);
      if (existing) {
        if (existing.eventFingerprint !== record.eventFingerprint) throw new Error("M5_INGESTION_LIFECYCLE_EVENT_CONFLICT");
        return existing;
      }
      const history = [...events.values()].filter(event => event.ingestionAttemptId === record.ingestionAttemptId);
      reduceIngestionLifecycle([...history, record].sort((a, b) => a.sequence - b.sequence));
      events.set(record.lifecycleEventId, record);
      return record;
    },
    readByAttempt: attemptId => Object.freeze([...events.values()].filter(event => event.ingestionAttemptId === attemptId).sort((a, b) => a.sequence - b.sequence)),
  };
  const artifactRepository: SourceArtifactRepository = {
    save: record => { assertSourceArtifact(record); return idempotentSave(artifacts, record.sourceArtifactId, record, "sourceArtifactFingerprint", "M5_SOURCE_ARTIFACT_CONFLICT"); },
    readById: id => artifacts.get(id),
  };
  const envelopeRepository: SourceEnvelopeRepository = {
    save: record => { assertSourceEnvelope(record); if (!artifacts.has(record.sourceArtifactId)) throw new Error("M5_SOURCE_ARTIFACT_NOT_FOUND"); return idempotentSave(envelopes, record.sourceEnvelopeId, record, "sourceEnvelopeFingerprint", "M5_SOURCE_ENVELOPE_CONFLICT"); },
    readById: id => envelopes.get(id),
  };
  const observationRepository: SourceObservationRepository = {
    save: record => { assertSourceObservation(record); if (!attempts.has(record.ingestionAttemptId)) throw new Error("M5_INGESTION_ATTEMPT_NOT_FOUND"); if (!artifacts.has(record.sourceArtifactId)) throw new Error("M5_SOURCE_ARTIFACT_NOT_FOUND"); return idempotentSave(observations, record.sourceObservationId, record, "observationFingerprint", "M5_SOURCE_OBSERVATION_CONFLICT"); },
    readById: id => observations.get(id),
    readByArtifact: artifactId => Object.freeze([...observations.values()].filter(value => value.sourceArtifactId === artifactId).sort((a, b) => a.retrievedAt.localeCompare(b.retrievedAt) || a.sourceObservationId.localeCompare(b.sourceObservationId))),
  };
  const claimRepository: AvailabilityClaimRepository = {
    save: record => { assertAvailabilityClaim(record); if (!envelopes.has(record.sourceEnvelopeId)) throw new Error("M5_SOURCE_ENVELOPE_NOT_FOUND"); const observation = observations.get(record.sourceObservationId); if (!observation) throw new Error("M5_SOURCE_OBSERVATION_NOT_FOUND"); const envelope = envelopes.get(record.sourceEnvelopeId)!; if (envelope.sourceArtifactId !== observation.sourceArtifactId) throw new Error("M5_INGESTION_AVAILABILITY_ARTIFACT_MISMATCH"); return idempotentSave(availabilityClaims, record.availabilityClaimId, record, "claimFingerprint", "M5_AVAILABILITY_CLAIM_CONFLICT"); },
    readById: id => availabilityClaims.get(id),
  };
  return Object.freeze({ requests: requestRepository, attempts: attemptRepository, events: eventRepository, artifacts: artifactRepository, envelopes: envelopeRepository, observations: observationRepository, availabilityClaims: claimRepository });
}
