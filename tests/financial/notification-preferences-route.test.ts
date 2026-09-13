import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdminUser: vi.fn(), saveNotificationPreferences: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/infrastructure/postgres/notification-repository", () => ({ getNotificationPreferences: vi.fn(), saveNotificationPreferences: mocks.saveNotificationPreferences }));
import { PUT } from "@/app/api/admin/notifications/preferences/route";

const valid = { enabledCategories: ["SIMULATION_PNL_GAIN", "SYSTEM_CRITICAL"], pnlMilestoneThresholdMinor: "100000", currency: "NOK", quietHoursEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "07:00", timezone: "Europe/Oslo", maxNonCriticalPerHour: 10 };
const request = (body: unknown) => new Request("http://localhost/api/admin/notifications/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("notification preferences PUT API contract", () => {
  beforeEach(() => { mocks.requireAdminUser.mockReset().mockResolvedValue({ id: "admin-id" }); mocks.saveNotificationPreferences.mockReset().mockResolvedValue(undefined); });
  it("returns 200 for valid input", async () => { const response = await PUT(request(valid)); expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true }); expect(mocks.saveNotificationPreferences).toHaveBeenCalledOnce(); });
  it("returns 400 for malformed input and invalid threshold/timezone", async () => { expect((await PUT(new Request("http://localhost", { method: "PUT", body: "{" }))).status).toBe(400); expect((await PUT(request({ ...valid, pnlMilestoneThresholdMinor: "not-an-integer" }))).status).toBe(400); expect((await PUT(request({ ...valid, timezone: "Mars/Olympus" }))).status).toBe(400); expect(mocks.saveNotificationPreferences).not.toHaveBeenCalled(); });
  it("returns 503 with a bounded response when persistence fails", async () => { mocks.saveNotificationPreferences.mockRejectedValueOnce(new Error("raw SQL password DATABASE_URL")); const error = vi.spyOn(console, "error").mockImplementation(() => undefined); const response = await PUT(request(valid)); const body = await response.json(); expect(response.status).toBe(503); expect(body).toEqual({ error: "PREFERENCES_UNAVAILABLE" }); expect(JSON.stringify(body)).not.toContain("DATABASE_URL"); expect(error).toHaveBeenCalledWith("notification_preferences_save_failed", { stage: "persistence", errorClass: "Error" }); error.mockRestore(); });
});
