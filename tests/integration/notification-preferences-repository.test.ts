import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NotificationPreferences } from "@/domain/notifications/alerts";
import { getNotificationPreferences, saveNotificationPreferences } from "@/infrastructure/postgres/notification-repository";

const PROJECT_REF = "flsfallpputejojncyue";
const enabled = process.env.MONEY_MACHINE_INTEGRATION_TEST === "1";
const runId = randomUUID();
const userId = randomUUID();
let sql: Sql;

function socket({ host, port }: { host: string[]; port: number[] }) { const hostname = host[0]; const portNumber = port[0]; if (!hostname || !portNumber) throw new Error("Database host and port are required"); return createConnection({ host: hostname, port: portNumber, family: 4, autoSelectFamily: false }); }
function databaseUrl() { if (process.env.MONEY_MACHINE_INTEGRATION_PROJECT_REF !== PROJECT_REF) throw new Error("Unauthorized project"); const value = process.env.DATABASE_URL; if (!value || !value.includes(PROJECT_REF)) throw new Error("Unauthorized database"); return value; }

describe.skipIf(!enabled)("hosted notification preference persistence", () => {
  beforeAll(async () => { sql = postgres(databaseUrl(), { max: 2, prepare: true, ssl: "require", socket } as Parameters<typeof postgres>[1]); await sql`insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values (${userId}, 'authenticated', 'authenticated', ${`notification-preferences-${runId}@example.invalid`}, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`; });
  afterAll(async () => { if (!sql) return; await sql`delete from public.admin_notification_preferences where user_id=${userId}`; await sql`delete from auth.users where id=${userId}`; await sql.end({ timeout: 5 }); });
  it("round-trips exact values and updates through ON CONFLICT", async () => {
    const first: NotificationPreferences = { enabledCategories: ["SIMULATION_PNL_GAIN", "RISK_BLOCKED", "SYSTEM_CRITICAL"], pnlMilestoneThresholdMinor: 100000n, currency: "NOK", quietHoursEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "07:00", timezone: "Europe/Oslo", maxNonCriticalPerHour: 10 };
    await saveNotificationPreferences(userId, first);
    expect(await getNotificationPreferences(userId)).toEqual(first);
    const updated: NotificationPreferences = { ...first, enabledCategories: ["SIMULATION_PNL_LOSS", "SIMULATION_FILL"], pnlMilestoneThresholdMinor: 250050n, quietHoursEnabled: false, quietHoursStart: "01:02", quietHoursEnd: "03:04", timezone: "UTC", maxNonCriticalPerHour: 7 };
    await saveNotificationPreferences(userId, updated);
    expect(await getNotificationPreferences(userId)).toEqual(updated);
  });
});
