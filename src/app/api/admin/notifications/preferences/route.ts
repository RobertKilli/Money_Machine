import { requireAdminUser } from "@/lib/auth/current-user";
import { getNotificationPreferences, saveNotificationPreferences } from "@/infrastructure/postgres/notification-repository";
import { validateNotificationPreferences, type AlertCategory, type NotificationPreferences } from "@/domain/notifications/alerts";
const categories: AlertCategory[] = ["SIMULATION_PNL_GAIN", "SIMULATION_PNL_LOSS", "HIGH_INTEREST_CANDIDATE", "ELIGIBILITY_CHANGED", "ADMISSION_CHANGED", "ALLOCATION_PLAN_RESULT", "RISK_BLOCKED", "SIMULATION_FILL", "SYSTEM_CRITICAL"];
const safeErrorField = (error: unknown, ...keys: string[]): string | undefined => { if (!error || typeof error !== "object") return undefined; const record = error as Record<string, unknown>; const value = keys.map(key => record[key]).find(candidate => typeof candidate === "string"); return typeof value === "string" ? value : undefined; };
const safePersistenceErrorMetadata = (error: unknown) => ({ stage: "persistence", errorName: safeErrorField(error, "name"), code: safeErrorField(error, "code"), severity: safeErrorField(error, "severity"), routine: safeErrorField(error, "routine"), constraint: safeErrorField(error, "constraint_name", "constraint"), column: safeErrorField(error, "column_name", "column"), dataType: safeErrorField(error, "datatype_name", "dataType"), schema: safeErrorField(error, "schema_name", "schema"), table: safeErrorField(error, "table_name", "table") });
export async function GET() { let user; try { user = await requireAdminUser(); } catch { return Response.json({ error: "FORBIDDEN" }, { status: 403 }); } try { const preferences = await getNotificationPreferences(user.id); return Response.json(preferences ? { ...preferences, pnlMilestoneThresholdMinor: preferences.pnlMilestoneThresholdMinor.toString() } : null); } catch { return Response.json({ error: "PREFERENCES_UNAVAILABLE" }, { status: 503 }); } }
export async function PUT(request: Request) {
  let user;
  try { user = await requireAdminUser(); } catch { return Response.json({ error: "FORBIDDEN" }, { status: 403 }); }
  let preferences: NotificationPreferences;
  try {
    const body = await request.json() as Partial<Record<keyof NotificationPreferences, unknown>>;
    preferences = { enabledCategories: Array.isArray(body.enabledCategories) ? body.enabledCategories.filter((x): x is AlertCategory => typeof x === "string" && categories.includes(x as AlertCategory)) : [], pnlMilestoneThresholdMinor: BigInt(String(body.pnlMilestoneThresholdMinor ?? "0")), currency: String(body.currency ?? ""), quietHoursEnabled: body.quietHoursEnabled === true, quietHoursStart: String(body.quietHoursStart ?? "22:00"), quietHoursEnd: String(body.quietHoursEnd ?? "07:00"), timezone: String(body.timezone ?? "UTC"), maxNonCriticalPerHour: Number(body.maxNonCriticalPerHour ?? 10) };
    validateNotificationPreferences(preferences);
  } catch (error) {
    const code = error instanceof Error && error.message.startsWith("INVALID_") ? error.message : "INVALID_PREFERENCES";
    return Response.json({ error: code }, { status: 400 });
  }
  try {
    await saveNotificationPreferences(user.id, preferences);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("notification_preferences_save_failed", safePersistenceErrorMetadata(error));
    return Response.json({ error: "PREFERENCES_UNAVAILABLE" }, { status: 503 });
  }
}
