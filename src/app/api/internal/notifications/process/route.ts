import { isValidSchedulerBearer } from "@/domain/notifications/scheduler-auth";
import { processAdminNotificationAlertsAt } from "@/application/notifications/process-admin-notification-alerts";

export async function POST(request: Request) {
  if (!isValidSchedulerBearer(request.headers.get("authorization"), process.env.NOTIFICATION_SCHEDULER_SECRET)) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const adminUserId = process.env.NOTIFICATION_SCHEDULER_ADMIN_USER_ID;
  if (!adminUserId) return Response.json({ error: "SCHEDULER_NOT_CONFIGURED" }, { status: 503 });
  const asOf = new Date();
  const started = Date.now();
  try {
    const result = await processAdminNotificationAlertsAt({ adminUserId, asOf });
    const summary = { ok: true, asOf: result.asOf, evaluated: result.evaluated, sent: result.sent, deferred: result.deferred, suppressed: result.suppressed, failed: result.failed };
    console.info("notification_scheduler_run", { schedulerRunId: `${result.asOf}:${adminUserId}`, asOf: result.asOf, evaluated: result.evaluated, sent: result.sent, deferred: result.deferred, suppressed: result.suppressed, failed: result.failed, durationMs: Date.now() - started });
    return Response.json(summary);
  } catch {
    console.error("notification_scheduler_failed", { asOf: asOf.toISOString(), durationMs: Date.now() - started });
    return Response.json({ error: "SCHEDULER_PROCESSING_FAILED" }, { status: 503 });
  }
}
