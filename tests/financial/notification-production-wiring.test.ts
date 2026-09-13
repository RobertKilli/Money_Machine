import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertCandidate } from "@/domain/notifications/alerts";

const { deriveNotificationCandidatesAt, deriveAdminNotificationCandidates, processAdminNotificationAlerts } = vi.hoisted(() => ({
  deriveNotificationCandidatesAt: vi.fn(),
  deriveAdminNotificationCandidates: vi.fn(),
  processAdminNotificationAlerts: vi.fn(async (input: { asOf: Date; candidates: readonly AlertCandidate[] }) => ({ asOf: input.asOf.toISOString(), evaluated: input.candidates.length, sent: 0, deferred: 0, suppressed: 0, failed: 0, results: [] }))
}));
const preferences = { enabledCategories: [], pnlMilestoneThresholdMinor: 1000n, currency: "NOK", quietHoursEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "07:00", timezone: "Europe/Oslo", maxNonCriticalPerHour: 10 };

vi.mock("@/application/notifications/derive-notification-candidates", () => ({ deriveNotificationCandidatesAt, deriveAdminNotificationCandidates }));
vi.mock("@/domain/notifications/processor", () => ({ processAdminNotificationAlerts }));
vi.mock("@/infrastructure/postgres/notification-repository", () => ({ getNotificationPreferences: vi.fn(async () => preferences), getActivePushSubscriptions: vi.fn(async () => []), getNotificationOperationalHistory: vi.fn(async () => []), persistNotificationOutcome: vi.fn(), claimNotificationDelivery: vi.fn(), completeNotificationClaim: vi.fn(), sendWebPushCandidate: vi.fn() }));

import { processAdminNotificationAlertsAt } from "@/application/notifications/process-admin-notification-alerts";

const asOf = new Date("2026-01-01T12:00:00.000Z");
const candidate = { alertEventId: "event-1", alertFingerprint: "fingerprint-1", category: "HIGH_INTEREST_CANDIDATE", title: "Informational", body: "Simulation-only", safeRelativeUrl: "/admin/activity" } as AlertCandidate;

describe("production notification candidate wiring", () => {
  beforeEach(() => { vi.clearAllMocks(); deriveNotificationCandidatesAt.mockResolvedValue([]); });

  it("uses the canonical production boundary when no override is supplied", async () => {
    await processAdminNotificationAlertsAt({ adminUserId: "admin-1", asOf });
    expect(deriveNotificationCandidatesAt).toHaveBeenCalledWith("admin-1", asOf);
    expect(deriveAdminNotificationCandidates).not.toHaveBeenCalled();
  });

  it("preserves explicit candidate-source injection", async () => {
    const override = vi.fn(async () => [candidate]);
    await processAdminNotificationAlertsAt({ adminUserId: "admin-1", asOf, deriveCandidates: override });
    expect(override).toHaveBeenCalledWith("admin-1", asOf);
    expect(deriveNotificationCandidatesAt).not.toHaveBeenCalled();
    expect(processAdminNotificationAlerts).toHaveBeenCalledWith(expect.objectContaining({ candidates: [candidate] }));
  });

  it("treats zero canonical rows as healthy", async () => {
    await expect(processAdminNotificationAlertsAt({ adminUserId: "admin-1", asOf })).resolves.toMatchObject({ evaluated: 0, failed: 0 });
  });

  it("propagates canonical reader failure as an operational error", async () => {
    const failure = new Error("CANONICAL_DATABASE_UNAVAILABLE");
    deriveNotificationCandidatesAt.mockRejectedValueOnce(failure);
    await expect(processAdminNotificationAlertsAt({ adminUserId: "admin-1", asOf })).rejects.toBe(failure);
  });
});
