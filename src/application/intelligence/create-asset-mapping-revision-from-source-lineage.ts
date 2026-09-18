import { createAssetMappingRevision, type AssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import type { AssetMappingRevisionRepository } from "@/application/intelligence/asset-mapping-revision-repository";
import type { SourceLineageRepository } from "@/application/intelligence/source-lineage-repository";

export type AssetMappingFromLineageInput = Readonly<{
  sourceLineageId: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  providerSourceNamespace: string;
  providerAssetId: string;
  canonicalAssetId: string;
  canonicalIdentifier: string;
  assetClass: string;
  mappingRevisionVersion: string;
  validFrom: string;
  validTo?: string;
  recordedAt: string;
}>;

export interface AssetMappingSourceLineageUnitOfWork {
  readonly withTransaction: <T>(work: (repositories: {
    readonly sourceLineageRepository: SourceLineageRepository;
    readonly mappingRepository: AssetMappingRevisionRepository;
  }) => Promise<T>) => Promise<T>;
}

/** Creates a mapping from one exact, already sealed source-lineage authority. */
export async function createAssetMappingRevisionFromSourceLineage(input: {
  readonly unitOfWork: AssetMappingSourceLineageUnitOfWork;
  readonly value: AssetMappingFromLineageInput;
}): Promise<AssetMappingRevision> {
 return input.unitOfWork.withTransaction(async ({ sourceLineageRepository, mappingRepository }) => {
  const value = input.value;
  const lineage = sourceLineageRepository.validateForMappingCreation
    ? await sourceLineageRepository.validateForMappingCreation(value.sourceLineageId)
    : await sourceLineageRepository.readById(value.sourceLineageId);
  if (!lineage) throw new Error("M5_MAPPING_SOURCE_LINEAGE_NOT_FOUND");
  if (lineage.providerId !== value.providerId || lineage.datasetId !== value.datasetId || lineage.datasetVersion !== value.datasetVersion) throw new Error("M5_MAPPING_SOURCE_LINEAGE_SCOPE_MISMATCH");

  // SourceLineage accepts PARTIAL for source-material reuse. Mapping creation is
  // deliberately stricter; the transaction-aware repository must re-read and
  // reduce every referenced attempt before calling this service in production.
  const mapping = createAssetMappingRevision({
    ...value,
    providerAssetNamespace: value.providerSourceNamespace,
    sourceRecordIds: lineage.sourceArtifactIds,
    payloadFingerprint: lineage.fingerprint,
    observedAt: lineage.observedAt,
    availableAt: lineage.effectiveAvailableAt,
  });
  return mappingRepository.save(mapping);
 });
}
