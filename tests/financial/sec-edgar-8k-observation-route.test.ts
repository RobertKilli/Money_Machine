import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdminUser: vi.fn(), loadReadModel: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/infrastructure/postgres/sec-edgar-8k-observation-read-model-repository", () => ({ loadSecEdgar8kObservationReadModel: mocks.loadReadModel }));
import { GET } from "@/app/api/admin/intelligence/sec-edgar-8k-observations/route";

describe("SEC observation read route", () => {
  beforeEach(() => { mocks.requireAdminUser.mockReset().mockResolvedValue({ id: "admin" }); mocks.loadReadModel.mockReset().mockResolvedValue({ status: "NO_RECORDED_OBSERVATIONS", observations: [], incomplete: [] }); });

  it("rejects non-admin access before starting database reads and disables caching", async () => {
    mocks.requireAdminUser.mockRejectedValueOnce(new Error("ADMIN_REQUIRED"));
    const response = await GET();
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.loadReadModel).not.toHaveBeenCalled();
  });

  it("sets no-store on successful and unavailable responses", async () => {
    const success = await GET();
    expect(success.status).toBe(200);
    expect(success.headers.get("Cache-Control")).toBe("no-store");

    mocks.loadReadModel.mockRejectedValueOnce(new Error("DATABASE_UNAVAILABLE"));
    const unavailable = await GET();
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("Cache-Control")).toBe("no-store");
  });
});
