import type { AvailabilityClaim, IngestionAttempt, LifecycleEvent, SourceArtifact, SourceEnvelope, SourceObservation } from "@/domain/intelligence/ingestion-provenance";
import type { SourceLineage, SourceLineageMember, SourceLineageMemberInput } from "@/domain/intelligence/source-lineage";

export type SourceLineageClaimAuthority = Readonly<{
  claim: AvailabilityClaim;
  envelope: SourceEnvelope;
  observation: SourceObservation;
  artifact: SourceArtifact;
  attempt: IngestionAttempt;
  lifecycle: readonly LifecycleEvent[];
}>;

export interface SourceLineageRepository {
  readonly createFromClaims: (scope: Readonly<{ providerId: string; datasetId: string; datasetVersion: string }>, claimIds: readonly string[], recordedAt: string) => Promise<SourceLineage>;
  readonly readById: (sourceLineageId: string) => Promise<SourceLineage | undefined>;
  readonly readMembers: (sourceLineageId: string) => Promise<readonly SourceLineageMember[]>;
}

export interface SourceLineageUnitOfWork {
  readonly withTransaction: <T>(work: (repository: SourceLineageRepository) => Promise<T>) => Promise<T>;
}

/** Narrow seam used by deterministic tests and non-Postgres adapters. */
export interface SourceLineageAuthorityReader {
  readonly readClaimAuthority: (claimId: string) => Promise<SourceLineageClaimAuthority | undefined>;
  readonly lockAttempts: (attemptIds: readonly string[]) => Promise<void>;
}

export type SourceLineageMemberFactory = (authority: SourceLineageClaimAuthority) => SourceLineageMemberInput;
