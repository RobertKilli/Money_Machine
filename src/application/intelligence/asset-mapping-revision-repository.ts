import type { AssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";

export interface AssetMappingRevisionLookup {
  readonly providerId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly providerAssetNamespace: string;
  readonly providerAssetId: string;
  readonly asOf: string;
}

export interface AssetMappingRevisionRepository {
  readonly save: (mapping: AssetMappingRevision) => Promise<void>;
  readonly readCandidatesAt: (lookup: AssetMappingRevisionLookup) => Promise<readonly AssetMappingRevision[]>;
  readonly readById?: (mappingRevisionId: string) => Promise<AssetMappingRevision | undefined>;
}
