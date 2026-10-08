import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getRepository: vi.fn(), loadOwnedStatus: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/infrastructure/postgres/standing-paper-policy-repository", () => ({ getStandingPaperStatusRepository: mocks.getRepository }));
import { GET } from "@/app/api/dashboard/paper-status/route";

describe("private standing paper status route", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset().mockResolvedValue({ id: "owner-1" });
    mocks.loadOwnedStatus.mockReset().mockResolvedValue({ status: "NO_POLICY", classification: "PAPER_ONLY_SYNTHETIC_SIMULATION", workerStatus: "UNKNOWN", policies: [] });
    mocks.getRepository.mockReset().mockReturnValue({ loadOwnedStatus: mocks.loadOwnedStatus });
  });

  it("rejects unauthenticated access before creating a repository or querying account data", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.getRepository).not.toHaveBeenCalled();
    expect(mocks.loadOwnedStatus).not.toHaveBeenCalled();
  });

  it("loads by authenticated owner and marks every private response no-store", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(mocks.loadOwnedStatus).toHaveBeenCalledWith("owner-1");
  });

  it("returns no-store on storage unavailable and read failure responses", async () => {
    mocks.getRepository.mockReturnValueOnce(undefined);
    const unavailable = await GET();
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("Cache-Control")).toContain("no-store");
    mocks.loadOwnedStatus.mockRejectedValueOnce(new Error("db"));
    const failed = await GET();
    expect(failed.status).toBe(503);
    expect(failed.headers.get("Cache-Control")).toContain("no-store");
  });
});
