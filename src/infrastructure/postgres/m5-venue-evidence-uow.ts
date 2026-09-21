import "server-only";
import type { Sql } from "postgres";
import type { M5VenueEvidenceUnitOfWork } from "@/application/intelligence/m5-venue-evidence";
import { createSourceLineageRepository } from "./source-lineage-repository";
import { createProviderAssetIdentityReadRepository } from "./provider-asset-identity-repository";
import { createAssetMappingRevisionRepository } from "./asset-mapping-revision-repository";
import { createRawEligibilityEvidenceRepository } from "./eligibility-evidence-repository";
import { createM5VenueAuthorityTransactionRepository } from "./m5-venue-authority-repository";

export function createM5VenueEvidenceUnitOfWork(sql: Sql): M5VenueEvidenceUnitOfWork {
  return Object.freeze({
    withTransaction: <T>(work: Parameters<M5VenueEvidenceUnitOfWork["withTransaction"]>[0]) => sql.begin(async transaction => {
      const lineage = createSourceLineageRepository(transaction);
      const assertion = createProviderAssetIdentityReadRepository(transaction);
      const mappingBase = createAssetMappingRevisionRepository(transaction, lineage, assertion);
      const mapping = { readById: async (id: string) => mappingBase.readById ? mappingBase.readById(id) : undefined };
      const evidence = createRawEligibilityEvidenceRepository(transaction, mapping, lineage);
      const venue = createM5VenueAuthorityTransactionRepository(transaction);
      return work(Object.freeze({ mapping, lineage, assertion, venue, evidence }));
    }) as unknown as Promise<T>,
  });
}
