import "server-only";
import { executeManualIngestionToLineage } from "@/application/intelligence/manual-ingestion-to-lineage";
import { createPostgresManualIngestionToLineageUnitOfWork } from "@/infrastructure/postgres/manual-ingestion-to-lineage-uow";
import postgres from "postgres";
export async function runManualIngestionToLineage(input: unknown, apply: boolean) { if (!apply) return executeManualIngestionToLineage(input, { apply: false }); const databaseUrl = process.env.DATABASE_URL; if (!databaseUrl) throw new Error("M5_MANUAL_DATABASE_UNCONFIGURED"); const sql = postgres(databaseUrl, { max: 1, prepare: true, ssl: "require" }); try { return await executeManualIngestionToLineage(input, { apply: true, unitOfWork: createPostgresManualIngestionToLineageUnitOfWork(sql) }); } finally { await sql.end({ timeout: 5 }); } }
