import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getRepository: vi.fn(), transitionOwned: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/infrastructure/postgres/standing-paper-policy-repository", () => ({ getStandingPaperStatusRepository: mocks.getRepository }));
import { POST } from "@/app/api/dashboard/paper-policies/[policyId]/transition/route";

const policyId = "policy-owned";
const context = { params: Promise.resolve({ policyId }) };
function request(body: unknown, options: { origin?: string | null; site?: string; contentType?: string } = {}) {
  return new Request(`https://money.example/api/dashboard/paper-policies/${policyId}/transition`, {
    method: "POST",
    headers: {
      ...(options.origin === undefined ? { Origin: "https://money.example" } : options.origin === null ? {} : { Origin: options.origin }),
      ...(options.site ? { "Sec-Fetch-Site": options.site } : {}),
      "Content-Type": options.contentType ?? "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("owner-bound standing paper transition route", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset().mockResolvedValue({ id: "owner-1" });
    mocks.transitionOwned.mockReset().mockImplementation(async (_owner: string, id: string, action: string) => ({ policyId: id, status: action === "PAUSE" ? "PAUSED" : action === "RESUME" ? "ACTIVE" : "STOPPED" }));
    mocks.getRepository.mockReset().mockReturnValue({ transitionOwned: mocks.transitionOwned });
  });

  it("rejects unauthenticated requests before acquiring the repository", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    const response = await POST(request({ action: "PAUSE", expectedStatus: "ACTIVE" }), context);
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.getRepository).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests without querying or changing policy state", async () => {
    const response = await POST(request({ action: "PAUSE", expectedStatus: "ACTIVE" }, { origin: "https://attacker.example", site: "cross-site" }), context);
    expect(response.status).toBe(403);
    expect(mocks.getRepository).not.toHaveBeenCalled();
    const missingOrigin = await POST(request({ action: "PAUSE", expectedStatus: "ACTIVE" }, { origin: null }), context);
    expect(missingOrigin.status).toBe(403);
    expect(mocks.getRepository).not.toHaveBeenCalled();
  });

  it("binds the owner, exact policy, action, and expected status to the repository call", async () => {
    const response = await POST(request({ action: "PAUSE", expectedStatus: "ACTIVE" }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(mocks.transitionOwned).toHaveBeenCalledWith("owner-1", policyId, "PAUSE", "ACTIVE");
    expect(await response.json()).toEqual({ policyId, status: "PAUSED" });
  });

  it("requires explicit terminal-stop confirmation and rejects invalid or stale command shapes", async () => {
    expect((await POST(request({ action: "STOP", expectedStatus: "ACTIVE" }), context)).status).toBe(400);
    expect((await POST(request({ action: "PAUSE", expectedStatus: "PAUSED" }), context)).status).toBe(409);
    expect((await POST(request({ action: "ACTIVATE", expectedStatus: "DRAFT" }), context)).status).toBe(400);
    expect(mocks.transitionOwned).not.toHaveBeenCalled();
    const confirmed = await POST(request({ action: "STOP", expectedStatus: "ACTIVE", confirmStop: true }), context);
    expect(confirmed.status).toBe(200);
    expect(mocks.transitionOwned).toHaveBeenCalledWith("owner-1", policyId, "STOP", "ACTIVE");
  });

  it("rejects non-string and unknown actions before repository access", async () => {
    for (const action of [["STOP"], {}, null, "ACTIVATE", "DELETE"]) {
      const response = await POST(request({ action, expectedStatus: "ACTIVE" }), context);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "INVALID_REQUEST" });
    }
    expect(mocks.getRepository).not.toHaveBeenCalled();
    expect(mocks.transitionOwned).not.toHaveBeenCalled();
  });

  it("maps ownership and stale-status failures without exposing private data", async () => {
    mocks.transitionOwned.mockRejectedValueOnce(new Error("PAPER_POLICY_NOT_FOUND"));
    const hidden = await POST(request({ action: "PAUSE", expectedStatus: "ACTIVE" }), context);
    expect(hidden.status).toBe(404);
    expect(hidden.headers.get("Cache-Control")).toContain("no-store");
    mocks.transitionOwned.mockRejectedValueOnce(new Error("PAPER_POLICY_STALE_STATUS"));
    const stale = await POST(request({ action: "PAUSE", expectedStatus: "ACTIVE" }), context);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "STALE_STATUS" });
  });
});
