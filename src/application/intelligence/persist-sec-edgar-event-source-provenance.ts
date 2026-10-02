import "server-only";
import { adaptSecEdgarFixtureToEntityBytes } from "@/domain/intelligence/sec-edgar-8k-fixture-claim-pipeline";
import { createSecRuntimeBatch } from "@/domain/intelligence/sec-edgar-event-source-provenance-runtime";
import { createSecEventProvenanceUnitOfWork, type SecProvenancePersisted } from "@/infrastructure/postgres/sec-edgar-event-source-provenance-uow";

export type SecRuntimeAdmissionPort=Readonly<{assertCanStartTransaction(batch:ReturnType<typeof createSecRuntimeBatch>):void}>;
export async function persistSyntheticSecEdgarFixtureProvenance(input:unknown,databaseUrl:string,receiptOverride?:Readonly<{receivedAt:string;effectiveAvailableAt:string}>,admission?:SecRuntimeAdmissionPort,selectedAccession?:string):Promise<SecProvenancePersisted|null>{
  const material=adaptSecEdgarFixtureToEntityBytes(input,receiptOverride,selectedAccession);if(!material)return null;
  const batch=createSecRuntimeBatch(material);admission?.assertCanStartTransaction(batch);const uow=createSecEventProvenanceUnitOfWork(databaseUrl);
  try{return await uow.persist(batch);}finally{await uow.close();}
}
