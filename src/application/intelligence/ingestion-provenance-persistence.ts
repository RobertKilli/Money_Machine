import type {
  AvailabilityClaim,
  IngestionAttempt,
  IngestionRequest,
  LifecycleEvent,
  SourceArtifact,
  SourceEnvelope,
  SourceObservation,
} from "@/domain/intelligence/ingestion-provenance";

export interface AsyncIngestionRequestRepository {
  readonly save: (record: IngestionRequest) => Promise<IngestionRequest>;
  readonly readById: (id: string) => Promise<IngestionRequest | undefined>;
}
export interface AsyncIngestionAttemptRepository {
  readonly save: (record: IngestionAttempt) => Promise<IngestionAttempt>;
  readonly readById: (id: string) => Promise<IngestionAttempt | undefined>;
}
export interface AsyncIngestionEventRepository {
  readonly save: (record: LifecycleEvent) => Promise<LifecycleEvent>;
  readonly readByAttempt: (attemptId: string) => Promise<readonly LifecycleEvent[]>;
}
export interface AsyncSourceArtifactRepository {
  readonly save: (record: SourceArtifact) => Promise<SourceArtifact>;
  readonly readById: (id: string) => Promise<SourceArtifact | undefined>;
}
export interface AsyncSourceEnvelopeRepository {
  readonly save: (record: SourceEnvelope) => Promise<SourceEnvelope>;
  readonly readById: (id: string) => Promise<SourceEnvelope | undefined>;
}
export interface AsyncSourceObservationRepository {
  readonly save: (record: SourceObservation) => Promise<SourceObservation>;
  readonly readById: (id: string) => Promise<SourceObservation | undefined>;
  readonly readByArtifact: (artifactId: string) => Promise<readonly SourceObservation[]>;
}
export interface AsyncAvailabilityClaimRepository {
  readonly save: (record: AvailabilityClaim) => Promise<AvailabilityClaim>;
  readonly readById: (id: string) => Promise<AvailabilityClaim | undefined>;
}

export type AsyncIngestionProvenanceRepositories = Readonly<{
  requests: AsyncIngestionRequestRepository;
  attempts: AsyncIngestionAttemptRepository;
  events: AsyncIngestionEventRepository;
  artifacts: AsyncSourceArtifactRepository;
  envelopes: AsyncSourceEnvelopeRepository;
  observations: AsyncSourceObservationRepository;
  availabilityClaims: AsyncAvailabilityClaimRepository;
}>;

export interface IngestionProvenanceUnitOfWork {
  readonly withTransaction: <T>(work: (repositories: AsyncIngestionProvenanceRepositories) => Promise<T>) => Promise<T>;
}
