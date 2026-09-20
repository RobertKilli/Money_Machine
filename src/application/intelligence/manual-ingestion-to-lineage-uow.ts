import type { AsyncIngestionProvenanceRepositories } from "@/application/intelligence/ingestion-provenance-persistence";
import type { SourceLineageRepository } from "@/application/intelligence/source-lineage-repository";

/** The only write capability exposed to the manual ingestion command. */
export type ManualIngestionToLineageRepositories = AsyncIngestionProvenanceRepositories & Readonly<{ sourceLineage: SourceLineageRepository }>;

export interface ManualIngestionToLineageUnitOfWork {
  readonly withTransaction: <T>(work: (repositories: ManualIngestionToLineageRepositories) => Promise<T>) => Promise<T>;
}
