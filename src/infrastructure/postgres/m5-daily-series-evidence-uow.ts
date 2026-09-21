import "server-only";
import type { Sql } from "postgres";
import type { M5DailySeriesEvidenceUnitOfWork } from "@/application/intelligence/m5-daily-series-evidence";
import { createSourceLineageRepository } from "./source-lineage-repository";
import { createProviderAssetIdentityReadRepository } from "./provider-asset-identity-repository";
import { createAssetMappingRevisionRepository } from "./asset-mapping-revision-repository";
import { createRawEligibilityEvidenceRepository } from "./eligibility-evidence-repository";
import { createM5DailySeriesAuthorityTransactionRepository } from "./m5-daily-series-authority-repository";

export function createM5DailySeriesEvidenceUnitOfWork(sql: Sql): M5DailySeriesEvidenceUnitOfWork {
  return Object.freeze({
    withTransaction: <T>(work: Parameters<M5DailySeriesEvidenceUnitOfWork["withTransaction"]>[0]) => sql.begin(async transaction => {
      const lineage = createSourceLineageRepository(transaction);
      const assertion = createProviderAssetIdentityReadRepository(transaction);
      const mapping = createAssetMappingRevisionRepository(transaction, lineage, assertion);
      const evidence = createRawEligibilityEvidenceRepository(transaction, mapping, lineage);
      const dailySeries = createM5DailySeriesAuthorityTransactionRepository(transaction);
      return work(Object.freeze({ mapping, lineage, assertion, dailySeries, evidence }));
    }) as unknown as Promise<T>,
  });
}
