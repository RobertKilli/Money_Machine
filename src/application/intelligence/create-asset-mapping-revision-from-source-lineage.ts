import { createAssetMappingRevision, type AssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import type { AssetMappingRevisionRepository } from "@/application/intelligence/asset-mapping-revision-repository";
import type { SourceLineageRepository } from "@/application/intelligence/source-lineage-repository";
import type { AsyncProviderAssetIdentityAssertionRepository } from "@/application/intelligence/provider-asset-identity-repository";

export type AssetMappingFromLineageInput = Readonly<{
  sourceLineageId: string;
  providerAssetIdentityAssertionId: string;
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
    readonly providerAssetIdentityAssertionRepository: Pick<AsyncProviderAssetIdentityAssertionRepository, "readById">;
    readonly mappingRepository: AssetMappingRevisionRepository;
  }) => Promise<T>) => Promise<T>;
}

/** Creates a mapping from one exact, already sealed source-lineage authority. */
export async function createAssetMappingRevisionFromSourceLineage(input: {
  readonly unitOfWork: AssetMappingSourceLineageUnitOfWork;
  readonly value: AssetMappingFromLineageInput;
}): Promise<AssetMappingRevision> {
 return input.unitOfWork.withTransaction(async ({ sourceLineageRepository, providerAssetIdentityAssertionRepository, mappingRepository }) => {
  const value = input.value;
  const assertion = await providerAssetIdentityAssertionRepository.readById(value.providerAssetIdentityAssertionId);
  if (!assertion) throw new Error("M5_MAPPING_PROVIDER_ASSET_IDENTITY_ASSERTION_NOT_FOUND");
  const lineage = sourceLineageRepository.validateForMappingCreation
    ? await sourceLineageRepository.validateForMappingCreation(value.sourceLineageId)
    : await sourceLineageRepository.readById(value.sourceLineageId);
  if (!lineage) throw new Error("M5_MAPPING_SOURCE_LINEAGE_NOT_FOUND");
  if (lineage.providerId !== assertion.providerId || lineage.datasetId !== assertion.datasetId || lineage.datasetVersion !== assertion.datasetVersion) throw new Error("M5_MAPPING_SOURCE_LINEAGE_SCOPE_MISMATCH");
  const members = await sourceLineageRepository.readMembers(value.sourceLineageId);
  if (!members.some(member => member.sourceArtifactId === assertion.sourceArtifactId && member.sourceEnvelopeId === assertion.sourceEnvelopeId && member.providerId === assertion.providerId && member.datasetId === assertion.datasetId && member.datasetVersion === assertion.datasetVersion)) throw new Error("M5_MAPPING_ASSERTION_LINEAGE_MEMBERSHIP_MISMATCH");

  // SourceLineage accepts PARTIAL for source-material reuse. Mapping creation is
  // deliberately stricter; the transaction-aware repository must re-read and
  // reduce every referenced attempt before calling this service in production.
  const mapping = createAssetMappingRevision({
    ...value,
    providerId: assertion.providerId,
    datasetId: assertion.datasetId,
    datasetVersion: assertion.datasetVersion,
    providerAssetNamespace: assertion.providerSourceNamespace,
    providerAssetId: assertion.providerAssetId,
    sourceRecordIds: lineage.sourceArtifactIds,
    payloadFingerprint: lineage.fingerprint,
    observedAt: lineage.observedAt,
    availableAt: lineage.effectiveAvailableAt,
  });
  return mappingRepository.save(mapping);
 });
}
