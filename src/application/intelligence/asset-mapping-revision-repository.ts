import type { AssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import type { SourceLineage } from "@/domain/intelligence/source-lineage";

export interface AssetMappingRevisionLookup {
  readonly providerId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly providerAssetNamespace: string;
  readonly providerAssetId: string;
  readonly asOf: string;
}

export interface AssetMappingRevisionRepository {
  readonly save: (mapping: AssetMappingRevision) => Promise<AssetMappingRevision>;
  readonly readCandidatesAt: (lookup: AssetMappingRevisionLookup) => Promise<readonly AssetMappingRevision[]>;
  readonly readById?: (mappingRevisionId: string) => Promise<AssetMappingRevision | undefined>;
}

export interface MappingSourceLineageReader {
  readonly readById: (sourceLineageId: string) => Promise<SourceLineage | undefined>;
}
