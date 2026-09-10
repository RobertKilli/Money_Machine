import fs from "node:fs";
import { createConnection } from "node:net";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
const ref = "flsfallpputejojncyue";
const enabled = process.env.MONEY_MACHINE_INTEGRATION_TEST === "1" && process.env.MONEY_MACHINE_APPLY_M3_MIGRATION === "1";
function socket({ host, port }: { host: string[]; port: number[] }) { const h = host[0]; const p = port[0]; if (!h || !p) throw new Error("Database host and port are required"); return createConnection({ host: h, port: p, family: 4, autoSelectFamily: false }); }
describe.skipIf(!enabled)("guarded M3 migration", () => it("applies only to the authorized project", async () => {
  if (process.env.MONEY_MACHINE_INTEGRATION_PROJECT_REF !== ref) throw new Error("Unauthorized project"); const url = process.env.DATABASE_URL; if (!url || !url.includes(ref)) throw new Error("Unauthorized database"); const sql = postgres(url, { max: 1, prepare: true, ssl: "require", socket } as Parameters<typeof postgres>[1]);
  try { const exists = await sql`select to_regclass('public.intelligence_providers') table_name`; if (!exists[0]?.table_name) await sql.begin(tx => tx.unsafe(fs.readFileSync("supabase/migrations/20260911000000_m3_intelligence_foundation.sql", "utf8"))); expect((await sql`select to_regclass('public.intelligence_providers') table_name`)[0]?.table_name).toBe("intelligence_providers"); } finally { await sql.end({ timeout: 5 }); }
}));
