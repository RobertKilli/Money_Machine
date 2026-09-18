import type {
  AgeReferenceEligibilityEvidenceInput,
  ContractVerificationEligibilityEvidenceInput,
  QuantitativeEligibilityEvidenceInput,
  SuspiciousEligibilityEvidenceInput,
  VenueEligibilityEvidenceInput,
  RawEligibilityEvidence,
} from "@/domain/intelligence/eligibility-evidence";
import { createAgeReferenceEligibilityEvidence, createContractVerificationEligibilityEvidence, createQuantitativeEligibilityEvidence, createSuspiciousEligibilityEvidence, createVenueEligibilityEvidence } from "@/domain/intelligence/eligibility-evidence";
import type { AssetMappingRevisionRepository } from "@/application/intelligence/asset-mapping-revision-repository";
import type { SourceLineageRepository } from "@/application/intelligence/source-lineage-repository";
import type { RawEligibilityEvidenceRepository } from "@/infrastructure/postgres/eligibility-evidence-repository";

type Shared = Readonly<{ evidenceId: string; mappingRevisionId: string; candidateId: string; recordedAt?: string }>;
export type RawEvidenceFromMappingInput = Shared & Readonly<{
  readonly family: "QUANTITATIVE" | "REFERENCE_AGE" | "REFERENCE_CONTRACT" | "VENUE" | "SUSPICIOUS";
  readonly payload: Omit<QuantitativeEligibilityEvidenceInput, "evidenceId" | "candidateId" | "mappingRevisionId" | "sourceLineageId" | "providerId" | "datasetId" | "datasetVersion" | "assetId" | "canonicalIdentifier" | "assetClass" | "observedAt" | "availableAt" | "provenance"> | Omit<AgeReferenceEligibilityEvidenceInput, "evidenceId" | "candidateId" | "mappingRevisionId" | "sourceLineageId" | "providerId" | "datasetId" | "datasetVersion" | "assetId" | "canonicalIdentifier" | "assetClass" | "observedAt" | "availableAt" | "provenance"> | Omit<ContractVerificationEligibilityEvidenceInput, "evidenceId" | "candidateId" | "mappingRevisionId" | "sourceLineageId" | "providerId" | "datasetId" | "datasetVersion" | "assetId" | "canonicalIdentifier" | "assetClass" | "observedAt" | "availableAt" | "provenance"> | Omit<VenueEligibilityEvidenceInput, "evidenceId" | "candidateId" | "mappingRevisionId" | "sourceLineageId" | "providerId" | "datasetId" | "datasetVersion" | "assetId" | "canonicalIdentifier" | "assetClass" | "observedAt" | "availableAt" | "provenance"> | Omit<SuspiciousEligibilityEvidenceInput, "evidenceId" | "candidateId" | "mappingRevisionId" | "sourceLineageId" | "providerId" | "datasetId" | "datasetVersion" | "assetId" | "canonicalIdentifier" | "assetClass" | "observedAt" | "availableAt" | "provenance">;
}>;

export interface RawEvidenceUnitOfWork {
  readonly withTransaction: <T>(work: (repositories: { readonly mappingRepository: AssetMappingRevisionRepository; readonly sourceLineageRepository: SourceLineageRepository; readonly rawEvidenceRepository: Pick<RawEligibilityEvidenceRepository, "save"> }) => Promise<T>) => Promise<T>;
}

export async function createRawEligibilityEvidenceFromMapping(input: Readonly<{ unitOfWork: RawEvidenceUnitOfWork; value: RawEvidenceFromMappingInput }>): Promise<RawEligibilityEvidence> {
  return input.unitOfWork.withTransaction(async ({ mappingRepository, sourceLineageRepository, rawEvidenceRepository }) => {
    const value = input.value;
    const mapping = await mappingRepository.readById?.(value.mappingRevisionId);
    if (!mapping) throw new Error("M5_RAW_MAPPING_NOT_FOUND");
    const lineage = sourceLineageRepository.validateForRawEvidenceCreation
      ? await sourceLineageRepository.validateForRawEvidenceCreation(mapping.sourceLineageId)
      : await sourceLineageRepository.readById(mapping.sourceLineageId);
    if (!lineage) throw new Error("M5_RAW_SOURCE_LINEAGE_NOT_FOUND");
    if (mapping.providerId !== lineage.providerId || mapping.datasetId !== lineage.datasetId || mapping.datasetVersion !== lineage.datasetVersion) throw new Error("M5_RAW_MAPPING_SOURCE_LINEAGE_MISMATCH");
    const shared = { evidenceId: value.evidenceId, candidateId: value.candidateId, mappingRevisionId: mapping.mappingRevisionId, sourceLineageId: lineage.sourceLineageId, providerId: mapping.providerId, datasetId: mapping.datasetId, datasetVersion: mapping.datasetVersion, assetId: mapping.canonicalAssetId, canonicalIdentifier: mapping.canonicalIdentifier, assetClass: mapping.assetClass, observedAt: lineage.observedAt, availableAt: lineage.effectiveAvailableAt, provenance: { sourceType: "M5_SOURCE_LINEAGE" as const, sourceRecordIds: lineage.sourceArtifactIds, payloadFingerprint: lineage.fingerprint } };
    let record: RawEligibilityEvidence;
    if (value.family === "QUANTITATIVE") record = createQuantitativeEligibilityEvidence({ ...shared, ...value.payload } as QuantitativeEligibilityEvidenceInput);
    else if (value.family === "REFERENCE_AGE") record = createAgeReferenceEligibilityEvidence({ ...shared, ...value.payload } as AgeReferenceEligibilityEvidenceInput);
    else if (value.family === "REFERENCE_CONTRACT") record = createContractVerificationEligibilityEvidence({ ...shared, ...value.payload } as ContractVerificationEligibilityEvidenceInput);
    else if (value.family === "VENUE") record = createVenueEligibilityEvidence({ ...shared, ...value.payload } as VenueEligibilityEvidenceInput);
    else record = createSuspiciousEligibilityEvidence({ ...shared, ...value.payload } as SuspiciousEligibilityEvidenceInput);
    await rawEvidenceRepository.save(record);
    return record;
  });
}
