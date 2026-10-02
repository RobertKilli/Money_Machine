import "server-only";
import { adaptSecEdgarFixtureToEntityBytes } from "@/domain/intelligence/sec-edgar-8k-fixture-claim-pipeline";
import { createSecRuntimeBatch } from "@/domain/intelligence/sec-edgar-event-source-provenance-runtime";
import { createSecEventProvenanceUnitOfWork, type SecProvenancePersisted } from "@/infrastructure/postgres/sec-edgar-event-source-provenance-uow";

export type SecRuntimeAdmissionPort=Readonly<{assertCanStartTransaction(batch:ReturnType<typeof createSecRuntimeBatch>):void;reservePayload?(byteBudget:number):Readonly<{release():void}>}>;
export async function persistSyntheticSecEdgarFixtureProvenance(input:unknown,databaseUrl:string,receiptOverride?:Readonly<{receivedAt:string;effectiveAvailableAt:string}>,admission?:SecRuntimeAdmissionPort,selectedAccession?:string):Promise<SecProvenancePersisted|null>{
  let reservation:Readonly<{release():void}>|undefined;
  let failed=false;
  try {
    const material=adaptSecEdgarFixtureToEntityBytes(input,receiptOverride,selectedAccession,byteBudget=>{reservation=admission?.reservePayload?.(byteBudget);});if(!material)return null;
    const batch=createSecRuntimeBatch(material);admission?.assertCanStartTransaction(batch);const uow=createSecEventProvenanceUnitOfWork(databaseUrl);
    let transactionFailed=false;
    try{return await uow.persist(batch);}catch(error){transactionFailed=true;throw error;}finally{try{await uow.close();}catch(error){if(!transactionFailed)throw error;}}
  } catch(error) {failed=true;throw error;} finally {try{reservation?.release();}catch(error){if(!failed)throw error;}}
}
