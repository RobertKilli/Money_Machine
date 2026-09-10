import { createHash } from "node:crypto";

export const NOTIFICATION_ALERT_POLICY_VERSION = "notification-alert-policy/v1";
export const NOTIFICATION_PROFILE_VERSION = "mm-synthetic-notification-profile/v1";
export const WEB_PUSH_DELIVERY_VERSION = "web-push-delivery/v1";

export type AlertCategory =
  | "SIMULATION_PNL_GAIN"
  | "SIMULATION_PNL_LOSS"
  | "HIGH_INTEREST_CANDIDATE"
  | "ELIGIBILITY_CHANGED"
  | "ADMISSION_CHANGED"
  | "ALLOCATION_PLAN_RESULT"
  | "RISK_BLOCKED"
  | "SIMULATION_FILL"
  | "SYSTEM_CRITICAL";
export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";
export type AlertStatus = "CANDIDATE" | "DEFERRED" | "SENT" | "FAILED" | "SUPPRESSED";

export interface NotificationPreferences {
  readonly enabledCategories: readonly AlertCategory[];
  readonly pnlMilestoneThresholdMinor: bigint;
  readonly currency: string;
  readonly quietHoursEnabled: boolean;
  readonly quietHoursStart: string;
  readonly quietHoursEnd: string;
  readonly timezone: string;
  readonly maxNonCriticalPerHour: number;
}

export interface PnlAlertInput {
  readonly accountId: string;
  readonly asOf: Date;
  readonly pnlMinor: bigint;
  readonly currency: string;
  readonly thresholdMinor: bigint;
}

export interface HighInterestInput {
  readonly candidateId: string;
  readonly assetDisplayIdentifier: string;
  readonly assetClass: string;
  readonly eligibilityStatus: "ELIGIBLE" | "INELIGIBLE" | "INCOMPLETE";
  readonly trendStatus: "COMPLETE" | "INCOMPLETE" | "NO_DATA";
  readonly trendDirection: "UP" | "DOWN" | "FLAT" | null;
  readonly signedChangeBps: bigint | null;
  readonly accelerationStatus: "COMPLETE" | "INCOMPLETE" | "NO_DATA";
  readonly accelerationBps: bigint | null;
  readonly distinctProviderCount: number | null;
  readonly suspiciousFlags: readonly string[];
  readonly asOf: Date;
}

export interface AlertCandidate {
  readonly alertEventId: string;
  readonly alertFingerprint: string;
  readonly category: AlertCategory;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly body: string;
  readonly occurredAt: string;
  readonly safeRelativeUrl: string;
  readonly reasonCodes: readonly string[];
  readonly simulation: boolean;
  readonly accountId?: string;
  readonly candidateId?: string;
}

export function testNotificationEventId(userId: string, invocationNumber: bigint | number | string): string {
  if (!userId || !/^\d+$/.test(String(invocationNumber))) throw new Error("INVALID_TEST_INVOCATION");
  return `test:${userId}:${String(invocationNumber)}`;
}

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v instanceof Date ? v.toISOString() : v)).digest("hex");

export function milestoneIndex(pnlMinor: bigint, thresholdMinor: bigint): bigint {
  if (thresholdMinor <= 0n) throw new Error("INVALID_PNL_THRESHOLD");
  const absolute = pnlMinor < 0n ? -pnlMinor : pnlMinor;
  return absolute / thresholdMinor;
}

export function evaluatePnlAlert(input: PnlAlertInput): AlertCandidate | null {
  if (input.thresholdMinor <= 0n) throw new Error("INVALID_PNL_CONFIGURATION");
  if (input.currency.length !== 3 || input.pnlMinor === 0n) return null;
  const index = milestoneIndex(input.pnlMinor, input.thresholdMinor);
  if (index < 1n) return null;
  const category: AlertCategory = input.pnlMinor > 0n ? "SIMULATION_PNL_GAIN" : "SIMULATION_PNL_LOSS";
  const sign = input.pnlMinor > 0n ? "+" : "-";
  const milestone = input.thresholdMinor * index;
  const identity = { accountId: input.accountId, category, thresholdMinor: input.thresholdMinor.toString(), currency: input.currency, milestoneIndex: index.toString(), policy: NOTIFICATION_ALERT_POLICY_VERSION };
  return Object.freeze({ alertEventId: digest(identity), alertFingerprint: digest({ identity, asOf: input.asOf.toISOString(), pnlMinor: input.pnlMinor.toString() }), category, severity: "INFO", title: `SIMULATION ${input.pnlMinor > 0n ? "GAIN" : "LOSS"}`, body: `SIMULATION unrealized P&L: ${sign}${input.pnlMinor < 0n ? -input.pnlMinor : input.pnlMinor} ${input.currency}; milestone: ${sign}${milestone} ${input.currency}; data as of ${input.asOf.toISOString()}.`, occurredAt: input.asOf.toISOString(), safeRelativeUrl: "/admin/activity?category=LEDGER", reasonCodes: ["SIMULATION", "UNREALIZED_PNL_MILESTONE"], simulation: true, accountId: input.accountId });
}

export function evaluateHighInterest(input: HighInterestInput): AlertCandidate | null {
  if (input.assetClass !== "CRYPTO" || input.eligibilityStatus !== "ELIGIBLE" || input.trendStatus !== "COMPLETE" || input.trendDirection !== "UP" || input.signedChangeBps === null || input.signedChangeBps < 500n || input.accelerationStatus !== "COMPLETE" || input.accelerationBps === null || input.accelerationBps < 100n || input.distinctProviderCount === null || input.distinctProviderCount < 2 || input.suspiciousFlags.length > 0) return null;
  const reasonCodes = ["M5_ELIGIBLE", "TREND_UP", "TREND_CHANGE_GTE_500_BPS", "ACCELERATION_GTE_100_BPS", "CORROBORATION_GTE_2"] as const;
  const identity = { candidateId: input.candidateId, asOf: input.asOf.toISOString(), policy: NOTIFICATION_ALERT_POLICY_VERSION, profile: NOTIFICATION_PROFILE_VERSION };
  return Object.freeze({ alertEventId: digest(identity), alertFingerprint: digest({ identity, reasons: reasonCodes }), category: "HIGH_INTEREST_CANDIDATE", severity: "INFO", title: "HIGH-INTEREST RESEARCH CANDIDATE", body: `${input.assetDisplayIdentifier} matches configured research-alert conditions. This is analytical context, not investment advice.`, occurredAt: input.asOf.toISOString(), safeRelativeUrl: `/admin/activity?category=DISCOVERY&candidateId=${encodeURIComponent(input.candidateId)}`, reasonCodes, simulation: true, candidateId: input.candidateId });
}

export function validateNotificationPreferences(preferences: NotificationPreferences): void {
  if (!Number.isInteger(preferences.maxNonCriticalPerHour) || preferences.maxNonCriticalPerHour < 1 || preferences.maxNonCriticalPerHour > 100) throw new Error("INVALID_RATE_LIMIT");
  if (preferences.pnlMilestoneThresholdMinor <= 0n) throw new Error("INVALID_PNL_THRESHOLD");
  if (!/^[A-Z]{3}$/.test(preferences.currency)) throw new Error("INVALID_CURRENCY");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(preferences.quietHoursStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(preferences.quietHoursEnd)) throw new Error("INVALID_QUIET_HOURS");
  try { new Intl.DateTimeFormat("en-US", { timeZone: preferences.timezone }).format(new Date(0)); } catch { throw new Error("INVALID_TIMEZONE"); }
}

export function isWithinQuietHours(at: Date, preferences: NotificationPreferences): boolean {
  validateNotificationPreferences(preferences);
  if (!preferences.quietHoursEnabled) return false;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: preferences.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const minute = Number(parts.find(x => x.type === "hour")?.value ?? 0) * 60 + Number(parts.find(x => x.type === "minute")?.value ?? 0);
  const parse = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = parse(preferences.quietHoursStart); const end = parse(preferences.quietHoursEnd);
  return start === end ? true : start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

export function toSafePushPayload(candidate: AlertCandidate): Readonly<Record<string, unknown>> {
  if (!candidate.safeRelativeUrl.startsWith("/" ) || candidate.safeRelativeUrl.startsWith("//") || candidate.safeRelativeUrl.includes("\\")) throw new Error("UNSAFE_NOTIFICATION_URL");
  return Object.freeze({ alertEventId: candidate.alertEventId, category: candidate.category, severity: candidate.severity, title: candidate.title, body: candidate.body, occurredAt: candidate.occurredAt, safeRelativeUrl: candidate.safeRelativeUrl, assetDisplayIdentifier: candidate.candidateId ?? null, reasonCodes: [...candidate.reasonCodes], simulation: candidate.simulation });
}

export function assertWebPushConfigured(): void {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) throw new Error("WEB_PUSH_TRANSPORT_UNCONFIGURED");
}
