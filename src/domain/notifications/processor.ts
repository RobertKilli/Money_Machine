import { isWithinQuietHours, type AlertCandidate, type AlertCategory, type NotificationPreferences } from "@/domain/notifications/alerts";

export const NOTIFICATION_PROCESSOR_VERSION = "notification-processor/v1";
export type OperationalStatus = "DEFERRED" | "SUPPRESSED" | "SENT" | "FAILED";
export interface NotificationOperationalRecord { readonly alertEventId: string; readonly category: AlertCategory; readonly status: OperationalStatus; readonly occurredAt: Date; readonly subscriptionId?: string; readonly reasonCode?: string; readonly cooldownKey?: string; readonly deferredUntil?: string; }
export interface ProcessorInput { readonly asOf: Date; readonly candidates: readonly AlertCandidate[]; readonly preferences: NotificationPreferences; readonly subscriptions: readonly { subscriptionId: string; active: boolean }[]; readonly history: readonly NotificationOperationalRecord[]; readonly send: (candidate: AlertCandidate, subscriptionId: string) => Promise<"SENT" | "FAILED" | "ALREADY_DELIVERED">; readonly persistOutcome?: (outcome: NotificationOperationalRecord) => Promise<void>; }
type ProcessorResultItem = { alertEventId: string; category: AlertCategory; outcome: OperationalStatus; reasonCode: string; deferredUntil?: string };
export interface ProcessorResult { readonly asOf: string; readonly evaluated: number; readonly sent: number; readonly deferred: number; readonly suppressed: number; readonly failed: number; readonly results: readonly ProcessorResultItem[]; }

const nonCritical = (category: AlertCategory) => category !== "SYSTEM_CRITICAL";
const cooldownMinutes: Partial<Record<AlertCategory, number>> = { HIGH_INTEREST_CANDIDATE: 360, RISK_BLOCKED: 30, SYSTEM_CRITICAL: 15 };
const inFlightDeliveries = new Set<string>();
const cooldownKey = (candidate: AlertCandidate) => candidate.category === "HIGH_INTEREST_CANDIDATE" ? `HIGH_INTEREST:${candidate.candidateId ?? candidate.alertEventId}` : `${candidate.category}:${candidate.alertFingerprint}`;
const sortCandidates = (items: readonly AlertCandidate[]) => [...items].sort((a, b) => a.alertEventId.localeCompare(b.alertEventId));
const nextQuietEnd = (at: Date, preferences: NotificationPreferences) => { const end = preferences.quietHoursEnd; const parts = new Intl.DateTimeFormat("en-CA", { timeZone: preferences.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at).split("-").map(Number); const base = new Date(Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!)); const [hour, minute] = end.split(":").map(Number); base.setUTCHours(hour!, minute!, 0, 0); if (base <= at) base.setUTCDate(base.getUTCDate() + 1); return base.toISOString(); };

export async function processAdminNotificationAlerts(input: ProcessorInput): Promise<ProcessorResult> {
  if (!Number.isFinite(input.asOf.getTime())) throw new Error("INVALID_AS_OF");
  const enabled = new Set(input.preferences.enabledCategories);
  const active = input.subscriptions.filter(s => s.active).sort((a, b) => a.subscriptionId.localeCompare(b.subscriptionId));
  const results: ProcessorResultItem[] = [];
  let sent = 0; let deferred = 0; let suppressed = 0; let failed = 0;
  const history = [...input.history].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.alertEventId.localeCompare(b.alertEventId));
  for (const candidate of sortCandidates(input.candidates)) {
    if (!enabled.has(candidate.category)) { const item = { alertEventId: candidate.alertEventId, category: candidate.category, outcome: "SUPPRESSED" as const, reasonCode: "SUPPRESSED_CATEGORY_DISABLED" }; results.push(item); suppressed++; await input.persistOutcome?.({ alertEventId: candidate.alertEventId, category: candidate.category, status: "SUPPRESSED", occurredAt: input.asOf, reasonCode: item.reasonCode }); continue; }
    if (isWithinQuietHours(input.asOf, input.preferences)) { const until = nextQuietEnd(input.asOf, input.preferences); const item = { alertEventId: candidate.alertEventId, category: candidate.category, outcome: "DEFERRED" as const, reasonCode: "QUIET_HOURS", deferredUntil: until }; results.push(item); deferred++; await input.persistOutcome?.({ alertEventId: candidate.alertEventId, category: candidate.category, status: "DEFERRED", occurredAt: input.asOf, reasonCode: item.reasonCode, deferredUntil: until }); continue; }
    const key = cooldownKey(candidate); const windowMs = (cooldownMinutes[candidate.category] ?? 0) * 60_000;
    let prior: NotificationOperationalRecord | undefined;
    if (windowMs > 0) {
      for (let index = history.length - 1; index >= 0; index -= 1) {
        const record = history[index]!;
        if (record.cooldownKey === key && record.status === "SENT" && input.asOf.getTime() - record.occurredAt.getTime() < windowMs) { prior = record; break; }
      }
    }
    if (prior) { const item = { alertEventId: candidate.alertEventId, category: candidate.category, outcome: "SUPPRESSED" as const, reasonCode: "COOLDOWN_ACTIVE" }; results.push(item); suppressed++; await input.persistOutcome?.({ alertEventId: candidate.alertEventId, category: candidate.category, status: "SUPPRESSED", occurredAt: input.asOf, reasonCode: item.reasonCode, cooldownKey: key }); continue; }
    const delivered = history.filter(x => x.status === "SENT" && nonCritical(x.category) && x.occurredAt.getTime() > input.asOf.getTime() - 3_600_000 && x.occurredAt.getTime() <= input.asOf.getTime()).length;
    if (nonCritical(candidate.category) && delivered >= input.preferences.maxNonCriticalPerHour) { const item = { alertEventId: candidate.alertEventId, category: candidate.category, outcome: "SUPPRESSED" as const, reasonCode: "RATE_LIMIT_EXCEEDED" }; results.push(item); suppressed++; await input.persistOutcome?.({ alertEventId: candidate.alertEventId, category: candidate.category, status: "SUPPRESSED", occurredAt: input.asOf, reasonCode: item.reasonCode }); continue; }
    if (active.length === 0) { const item = { alertEventId: candidate.alertEventId, category: candidate.category, outcome: "SUPPRESSED" as const, reasonCode: "NO_ACTIVE_SUBSCRIPTION" }; results.push(item); suppressed++; await input.persistOutcome?.({ alertEventId: candidate.alertEventId, category: candidate.category, status: "SUPPRESSED", occurredAt: input.asOf, reasonCode: item.reasonCode }); continue; }
    let candidateSent = false; let alreadyDelivered = 0;
    for (const subscription of active) {
      const deliveryKey = `${candidate.alertEventId}:${subscription.subscriptionId}`;
      if (history.some(x => x.alertEventId === candidate.alertEventId && x.subscriptionId === subscription.subscriptionId && x.status === "SENT") || inFlightDeliveries.has(deliveryKey)) { alreadyDelivered++; continue; }
      inFlightDeliveries.add(deliveryKey);
      let outcome: "SENT" | "FAILED" | "ALREADY_DELIVERED";
      try { outcome = await input.send(candidate, subscription.subscriptionId); } finally { inFlightDeliveries.delete(deliveryKey); }
      if (outcome === "SENT") { candidateSent = true; sent++; } else if (outcome === "FAILED") failed++; else alreadyDelivered++;
    }
    const already = !candidateSent && alreadyDelivered === active.length;
    const item = { alertEventId: candidate.alertEventId, category: candidate.category, outcome: (already ? "SUPPRESSED" : candidateSent ? "SENT" : "FAILED") as OperationalStatus, reasonCode: already ? "ALREADY_DELIVERED" : candidateSent ? "DELIVERED" : "DELIVERY_FAILED" };
    results.push(item);
    await input.persistOutcome?.({ alertEventId: candidate.alertEventId, category: candidate.category, status: item.outcome, occurredAt: input.asOf, reasonCode: item.reasonCode, cooldownKey: key });
    if (already) suppressed++;
  }
  return Object.freeze({ asOf: input.asOf.toISOString(), evaluated: input.candidates.length, sent, deferred, suppressed, failed, results: Object.freeze(results) });
}
