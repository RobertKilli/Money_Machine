import { requireAdminUser } from "@/lib/auth/current-user";
import { processAdminNotificationAlertsAt } from "@/application/notifications/process-admin-notification-alerts";

export async function POST() {
  let user;
  try { user = await requireAdminUser(); } catch { return Response.json({ error: "FORBIDDEN" }, { status: 403 }); }
  const asOf = new Date();
  try {
    const result = await processAdminNotificationAlertsAt({ adminUserId: user.id, asOf });
    return Response.json(result);
  } catch (error) {
    const code = error instanceof Error && ["NOTIFICATION_PREFERENCES_NOT_FOUND", "DATABASE_UNCONFIGURED"].includes(error.message) ? error.message : "NOTIFICATION_PROCESSING_UNAVAILABLE";
    return Response.json({ error: code }, { status: 503 });
  }
}
