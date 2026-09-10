import fs from "node:fs";
import { createConnection } from "node:net";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
const ref = "flsfallpputejojncyue";
const enabled = process.env.MONEY_MACHINE_INTEGRATION_TEST === "1" && process.env.MONEY_MACHINE_APPLY_M8_MIGRATION === "1";
function socket({ host, port }: { host: string[]; port: number[] }) { const hostname = host[0]; const portNumber = port[0]; if (!hostname || !portNumber) throw new Error("Database host and port are required"); return createConnection({ host: hostname, port: portNumber, family: 4, autoSelectFamily: false }); }
describe.skipIf(!enabled)("guarded M8 migration", () => it("applies only to the authorized project", async () => { if (process.env.MONEY_MACHINE_INTEGRATION_PROJECT_REF !== ref) throw new Error("Unauthorized project"); const url = process.env.DATABASE_URL; if (!url || !url.includes(ref)) throw new Error("Unauthorized database"); const sql = postgres(url, { max: 1, prepare: true, ssl: "require", socket } as Parameters<typeof postgres>[1]); try { const exists = await sql`select to_regclass('public.push_subscriptions') table_name`; if (!exists[0]?.table_name) await sql.begin(tx => tx.unsafe(fs.readFileSync("supabase/migrations/20260912000000_m8_notification_transport.sql", "utf8"))); expect((await sql`select to_regclass('public.push_subscriptions') table_name`)[0]?.table_name).toBe("push_subscriptions"); } finally { await sql.end({ timeout: 5 }); } }));
