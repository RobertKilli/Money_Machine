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

/** Creates a mapping from one exact, already sealed source-lineage authority. */
export async function createAssetMappingRevisionFromSourceLineage(input: {
  readonly sourceLineageRepository: SourceLineageRepository;
  readonly mappingRepository: AssetMappingRevisionRepository;
  readonly value: AssetMappingFromLineageInput;
}): Promise<AssetMappingRevision> {
  const value = input.value;
  const lineage = input.sourceLineageRepository.validateForMappingCreation
    ? await input.sourceLineageRepository.validateForMappingCreation(value.sourceLineageId)
    : await input.sourceLineageRepository.readById(value.sourceLineageId);
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
  return input.mappingRepository.save(mapping);
}
