import { assertAssetMappingRevision, type AssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import type { AssetMappingRevisionLookup, AssetMappingRevisionRepository } from "@/application/intelligence/asset-mapping-revision-repository";

export type AssetMappingResolution =
  | { readonly status: "RESOLVED"; readonly mapping: AssetMappingRevision }
  | { readonly status: "NOT_FOUND"; readonly lookup: AssetMappingRevisionLookup }
  | { readonly status: "AMBIGUOUS"; readonly lookup: AssetMappingRevisionLookup; readonly mappings: readonly AssetMappingRevision[] };

const validTimestamp = (value: string): void => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error("M5_MAPPING_LOOKUP_AS_OF_INVALID");
};

export async function resolveAssetMappingRevision(repository: AssetMappingRevisionRepository, lookup: AssetMappingRevisionLookup): Promise<AssetMappingResolution> {
  for (const field of [lookup.providerId, lookup.datasetId, lookup.datasetVersion, lookup.providerAssetNamespace, lookup.providerAssetId]) if (typeof field !== "string" || !field.trim()) throw new Error("M5_MAPPING_LOOKUP_INVALID");
  validTimestamp(lookup.asOf);
  const mappings = [...await repository.readCandidatesAt(lookup)].sort((left, right) => left.mappingRevisionId.localeCompare(right.mappingRevisionId));
  for (const mapping of mappings) {
    assertAssetMappingRevision(mapping);
    const exactIdentity = mapping.providerId === lookup.providerId
      && mapping.datasetId === lookup.datasetId
      && mapping.datasetVersion === lookup.datasetVersion
      && mapping.providerAssetNamespace === lookup.providerAssetNamespace
      && mapping.providerAssetId === lookup.providerAssetId;
    const activeAt = mapping.validFrom <= lookup.asOf && (mapping.validTo === undefined || lookup.asOf < mapping.validTo);
    if (!exactIdentity || !activeAt) throw new Error("M5_MAPPING_REPOSITORY_CONTRACT_VIOLATION");
  }
  if (mappings.length === 0) return { status: "NOT_FOUND", lookup };
  if (mappings.length > 1) return { status: "AMBIGUOUS", lookup, mappings: Object.freeze(mappings) };
  return { status: "RESOLVED", mapping: mappings[0]! };
}
