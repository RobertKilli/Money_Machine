import "server-only";
import postgres, { type Sql } from "postgres";
import type { ManualIngestionToLineageUnitOfWork } from "@/application/intelligence/manual-ingestion-to-lineage-uow";
import { createTransactionIngestionProvenanceRepositories } from "@/infrastructure/postgres/ingestion-provenance-repository";
import { createTransactionSourceLineageRepository } from "@/infrastructure/postgres/source-lineage-repository";

export function createPostgresManualIngestionToLineageUnitOfWork(sql: Sql): ManualIngestionToLineageUnitOfWork {
  return Object.freeze({
    withTransaction: <T>(work: Parameters<ManualIngestionToLineageUnitOfWork["withTransaction"]>[0]) =>
      sql.begin(async transaction => work(Object.freeze({ ...createTransactionIngestionProvenanceRepositories(transaction), sourceLineage: createTransactionSourceLineageRepository(transaction) }))) as unknown as Promise<T>,
  });
}

export async function withPostgresManualIngestionToLineageUnitOfWork<T>(databaseUrl: string, work: Parameters<ManualIngestionToLineageUnitOfWork["withTransaction"]>[0]): Promise<T> {
  const sql = postgres(databaseUrl, { max: 1, prepare: true, ssl: "require" });
  try { return await createPostgresManualIngestionToLineageUnitOfWork(sql).withTransaction(work) as T; }
  finally { await sql.end({ timeout: 5 }); }
}
