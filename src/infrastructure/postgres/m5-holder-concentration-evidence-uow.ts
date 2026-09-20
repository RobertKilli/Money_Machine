import "server-only";
import type { Sql } from "postgres";
import type { M5HolderConcentrationEvidenceUnitOfWork } from "@/application/intelligence/m5-holder-concentration-evidence";
import { createSourceLineageRepository } from "./source-lineage-repository";
import { createProviderAssetIdentityReadRepository } from "./provider-asset-identity-repository";
import { createAssetMappingRevisionRepository } from "./asset-mapping-revision-repository";
import { createRawEligibilityEvidenceRepository } from "./eligibility-evidence-repository";
import { createM5HolderSnapshotTransactionRepository } from "./m5-holder-snapshot-repository";

export function createM5HolderConcentrationEvidenceUnitOfWork(sql: Sql): M5HolderConcentrationEvidenceUnitOfWork {
  return Object.freeze({
    withTransaction: <T>(work: Parameters<M5HolderConcentrationEvidenceUnitOfWork["withTransaction"]>[0]) => sql.begin(async transaction => {
      const lineage = createSourceLineageRepository(transaction);
      const assertion = createProviderAssetIdentityReadRepository(transaction);
      const mapping = createAssetMappingRevisionRepository(transaction, lineage, assertion);
      const evidence = createRawEligibilityEvidenceRepository(transaction, mapping, lineage);
      const snapshots = createM5HolderSnapshotTransactionRepository(transaction);
      return work(Object.freeze({ mapping, lineage, assertion, snapshots, evidence }));
    }) as unknown as Promise<T>,
  });
}
