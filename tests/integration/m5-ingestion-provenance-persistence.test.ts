import postgres from "postgres";
import { describe, expect, it } from "vitest";

const enabled = process.env.MONEY_MACHINE_PROVENANCE_SCHEMA_READY === "1" && process.env.MONEY_MACHINE_INTEGRATION_PROJECT_REF === "flsfallpputejojncyue" && Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("M5 ingestion provenance PostgreSQL integration", () => {
  it("reads the seven server-only tables without mutating them", async () => {
    const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: true, ssl: "require" });
    try {
      const tables = await sql`select table_name from information_schema.tables where table_schema='public' and table_name in ${sql(["intelligence_ingestion_requests", "intelligence_ingestion_attempts", "intelligence_source_artifacts", "intelligence_source_envelopes", "intelligence_ingestion_source_observations", "intelligence_source_availability_claims", "intelligence_ingestion_events"])} order by table_name`;
      expect(tables).toHaveLength(7);
      const counts = await sql`select (select count(*) from public.intelligence_ingestion_requests) requests, (select count(*) from public.intelligence_ingestion_attempts) attempts, (select count(*) from public.intelligence_ingestion_events) events`;
      expect(counts[0]).toBeDefined();
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
