import "server-only";
import { assertWebPushConfigured, toSafePushPayload, type AlertCandidate } from "@/domain/notifications/alerts";
import { processAdminNotificationAlerts, type ProcessorResult } from "@/domain/notifications/processor";
import { getNotificationPreferences, getActivePushSubscriptions, getNotificationOperationalHistory, persistNotificationOutcome, claimNotificationDelivery, completeNotificationClaim, sendWebPushCandidate } from "@/infrastructure/postgres/notification-repository";
import { deriveAdminNotificationCandidates } from "@/application/notifications/derive-notification-candidates";

export type AlertCandidateSource = (adminUserId: string, asOf: Date) => Promise<readonly AlertCandidate[]>;

export async function processAdminNotificationAlertsAt(input: { adminUserId: string; asOf: Date; deriveCandidates?: AlertCandidateSource; send?: (candidate: AlertCandidate, subscriptionId: string) => Promise<"SENT" | "FAILED" | "ALREADY_DELIVERED"> }): Promise<ProcessorResult> {
  if (!input.adminUserId) throw new Error("INVALID_ADMIN_USER");
  const preferences = await getNotificationPreferences(input.adminUserId);
  if (!preferences) throw new Error("NOTIFICATION_PREFERENCES_NOT_FOUND");
  const [candidates, subscriptions, history] = await Promise.all([
    (input.deriveCandidates ?? ((adminUserId, asOf) => deriveAdminNotificationCandidates({ adminUserId, asOf })))(input.adminUserId, input.asOf),
    getActivePushSubscriptions(input.adminUserId),
    getNotificationOperationalHistory(input.adminUserId)
  ]);
  return processAdminNotificationAlerts({
    asOf: input.asOf,
    candidates,
    preferences,
    subscriptions,
    history,
    send: async (candidate, subscriptionId) => {
      if (!(await claimNotificationDelivery(candidate.alertEventId, subscriptionId, input.asOf))) return "ALREADY_DELIVERED";
      try {
        const result = await (input.send ?? sendWebPushCandidate)(candidate, subscriptionId);
        if (result !== "ALREADY_DELIVERED") await completeNotificationClaim(candidate.alertEventId, subscriptionId, result, input.asOf, result === "FAILED" ? "DELIVERY_FAILED" : undefined);
        return result;
      } catch {
        await completeNotificationClaim(candidate.alertEventId, subscriptionId, "FAILED", input.asOf, "DELIVERY_FAILED");
        return "FAILED";
      }
    },
    persistOutcome: outcome => persistNotificationOutcome(input.adminUserId, outcome)
  });
}

export function validateProcessorPushPayload(candidate: AlertCandidate): Readonly<Record<string, unknown>> {
  assertWebPushConfigured();
  return toSafePushPayload(candidate);
}
