import type { SourceLineage } from "@/domain/intelligence/source-lineage";
import type { SourceLineageRepository } from "@/application/intelligence/source-lineage-repository";

export async function createSourceLineageAuthority(input: {
  readonly repository: SourceLineageRepository;
  readonly providerId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly claimIds: readonly string[];
  readonly recordedAt: string;
}): Promise<SourceLineage> {
  // The PostgreSQL repository performs authoritative parent reads, lifecycle locks,
  // domain reconstruction and sealed-member equality inside one transaction.
  return input.repository.createFromClaims(
    { providerId: input.providerId, datasetId: input.datasetId, datasetVersion: input.datasetVersion },
    input.claimIds,
    input.recordedAt,
  );
}
