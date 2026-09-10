import fs from "node:fs";
import { createConnection } from "node:net";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

const PROJECT_REF = "flsfallpputejojncyue";
const enabled = process.env.MONEY_MACHINE_INTEGRATION_TEST === "1" && process.env.MONEY_MACHINE_APPLY_M1D_MIGRATION === "1";

function socket({ host, port }: { host: string[]; port: number[] }) {
  const hostname = host[0]; const portNumber = port[0];
  if (!hostname || !portNumber) throw new Error("Database host and port are required");
  const connection = createConnection({ host: hostname, port: portNumber, family: 4, autoSelectFamily: false });
  Object.defineProperties(connection, { host: { value: hostname, writable: true, configurable: true }, port: { value: portNumber, writable: true, configurable: true } });
  return connection;
}

describe.skipIf(!enabled)("guarded M1D migration bootstrap", () => {
  it("applies only the existing M1D migration to the authorized project", async () => {
    if (process.env.MONEY_MACHINE_INTEGRATION_PROJECT_REF !== PROJECT_REF) throw new Error("Refusing migration for an unauthorized project");
    const url = process.env.DATABASE_URL;
    if (!url || !url.includes(PROJECT_REF)) throw new Error("Refusing migration for an unauthorized database");
    const sql = postgres(url, { max: 1, prepare: true, ssl: "require", socket } as Parameters<typeof postgres>[1]);
    try {
      const existing = await sql<{ table_name: string | null }[]>`select to_regclass('public.simulation_executions') as table_name`;
      if (existing[0]?.table_name) return;
      const migration = fs.readFileSync("supabase/migrations/20260910010000_m1d_simulation_execution.sql", "utf8");
      await sql.begin(async (tx) => { await tx.unsafe(migration); });
      const objects = await sql<{ table_name: string | null }[]>`select to_regclass('public.simulation_executions') as table_name`;
      expect(objects[0]?.table_name).toBe("simulation_executions");
    } finally { await sql.end({ timeout: 5 }); }
  });
});
