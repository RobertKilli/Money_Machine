import { describe, expect, it } from "vitest";
import { processAdminNotificationAlerts, type NotificationOperationalRecord } from "@/domain/notifications/processor";
import type { AlertCandidate, NotificationPreferences } from "@/domain/notifications/alerts";

const at = new Date("2026-01-01T12:00:00.000Z");
const prefs: NotificationPreferences = { enabledCategories: ["HIGH_INTEREST_CANDIDATE", "RISK_BLOCKED", "SYSTEM_CRITICAL", "SIMULATION_PNL_GAIN"], pnlMilestoneThresholdMinor: 1000n, currency: "NOK", quietHoursEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "07:00", timezone: "UTC", maxNonCriticalPerHour: 10 };
const candidate = (id: string, category: AlertCandidate["category"] = "HIGH_INTEREST_CANDIDATE"): AlertCandidate => ({ alertEventId: id, alertFingerprint: id, category, severity: category === "SYSTEM_CRITICAL" ? "CRITICAL" : "INFO", title: category, body: "SIMULATION TEST", occurredAt: at.toISOString(), safeRelativeUrl: "/admin/activity", reasonCodes: ["TEST"], simulation: true, candidateId: id });
const run = (overrides: Partial<Parameters<typeof processAdminNotificationAlerts>[0]> = {}) => processAdminNotificationAlerts({ asOf: at, candidates: [candidate("a")], preferences: prefs, subscriptions: [{ subscriptionId: "s", active: true }], history: [], send: async () => "SENT", ...overrides });

describe("notification processor", () => {
  it("is deterministic and preserves production dedupe", async () => { const first = await run(); const second = await run(); expect(first).toEqual(second); const duplicate = await run({ history: [{ alertEventId: "a", category: "HIGH_INTEREST_CANDIDATE", status: "SENT", occurredAt: new Date(at.getTime() - 1_000), subscriptionId: "s", cooldownKey: "HIGH_INTEREST:a" }] }); expect(duplicate.results[0]?.reasonCode).toBe("COOLDOWN_ACTIVE"); });
  it("suppresses disabled categories and inactive subscriptions", async () => { expect((await run({ preferences: { ...prefs, enabledCategories: [] } })).results[0]?.reasonCode).toBe("SUPPRESSED_CATEGORY_DISABLED"); expect((await run({ subscriptions: [{ subscriptionId: "s", active: false }] })).results[0]?.reasonCode).toBe("NO_ACTIVE_SUBSCRIPTION"); });
  it("defers quiet hours with a deterministic identity and not-before", async () => { const result = await run({ asOf: new Date("2026-01-01T23:00:00.000Z"), preferences: { ...prefs, quietHoursEnabled: true, timezone: "UTC", quietHoursStart: "22:00", quietHoursEnd: "07:00" } }); expect(result.results[0]?.reasonCode).toBe("QUIET_HOURS"); expect(result.results[0]?.deferredUntil).toBe("2026-01-02T07:00:00.000Z"); expect(result.results[0]?.alertEventId).toBe("a"); });
  it("enforces cooldown boundaries", async () => { const history = (minutes: number): NotificationOperationalRecord[] => [{ alertEventId: "old", category: "HIGH_INTEREST_CANDIDATE", status: "SENT", occurredAt: new Date(at.getTime() - minutes * 60_000), cooldownKey: "HIGH_INTEREST:a" }]; expect((await run({ history: history(359) })).results[0]?.reasonCode).toBe("COOLDOWN_ACTIVE"); expect((await run({ history: history(360) })).results[0]?.outcome).toBe("SENT"); });
  it("enforces rolling ten-delivery rate limit at the exact boundary", async () => { const history: NotificationOperationalRecord[] = Array.from({ length: 10 }, (_, i) => ({ alertEventId: `old-${i}`, category: "HIGH_INTEREST_CANDIDATE" as const, status: "SENT" as const, occurredAt: new Date(at.getTime() - 30_000), cooldownKey: `old:${i}` })); expect((await run({ history })).results[0]?.reasonCode).toBe("RATE_LIMIT_EXCEEDED"); const outside = history.map(x => ({ ...x, occurredAt: new Date(at.getTime() - 3_600_000) })); expect((await run({ history: outside })).results[0]?.outcome).toBe("SENT"); });
  it("allows P&L milestone dedupe without a time cooldown", async () => { const c = candidate("p", "SIMULATION_PNL_GAIN"); const result = await run({ candidates: [c], history: [{ alertEventId: "p", category: "SIMULATION_PNL_GAIN", status: "SENT", occurredAt: new Date(at.getTime() - 1), subscriptionId: "s" }] }); expect(result.results[0]?.reasonCode).toBe("ALREADY_DELIVERED"); });
  it("failed delivery has no domain authority", async () => { const result = await run({ send: async () => "FAILED" }); expect(result.failed).toBe(1); expect(result.results[0]?.reasonCode).toBe("DELIVERY_FAILED"); });
  it("prevents duplicate in-flight sends for concurrent processor runs", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let sends = 0;
    const send = async () => { sends += 1; await gate; return "SENT" as const; };
    const first = run({ send });
    await Promise.resolve();
    const second = await run({ send });
    release();
    await first;
    expect(sends).toBe(1);
    expect(second.results[0]?.reasonCode).toBe("ALREADY_DELIVERED");
  });
});
