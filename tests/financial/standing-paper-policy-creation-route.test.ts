import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getRepository: vi.fn(), createOwnedDraft: vi.fn(), listOwnedEmptyPaperAccounts: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/infrastructure/postgres/standing-paper-policy-repository", () => ({ getStandingPaperStatusRepository: mocks.getRepository }));
import { GET, POST } from "@/app/api/dashboard/paper-policies/route";

const body = {
  financialAccountId: "123e4567-e89b-42d3-a456-426614174000", allowedInstrumentIds: ["mm.fixture.global.v1"],
  capitalBudgetNok: "5000", maxOrderNok: "500", maxPositionNok: "1000", maxGrossExposureNok: "2000", maxLossNok: "250", maxPriceAgeMinutes: 60,
};
function request(payload: unknown, origin = "https://money.example") {
  return new Request("https://money.example/api/dashboard/paper-policies", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" }, body: JSON.stringify(payload) });
}

describe("owner-bound standing paper policy creation route", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset().mockResolvedValue({ id: "owner-1" });
    mocks.createOwnedDraft.mockReset().mockResolvedValue(undefined);
    mocks.listOwnedEmptyPaperAccounts.mockReset().mockResolvedValue([{ financialAccountId: body.financialAccountId }]);
    mocks.getRepository.mockReset().mockReturnValue({ createOwnedDraft: mocks.createOwnedDraft, listOwnedEmptyPaperAccounts: mocks.listOwnedEmptyPaperAccounts });
  });

  it("lists eligible accounts only after authentication and with no-store", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
    expect(mocks.getRepository).not.toHaveBeenCalled();
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.listOwnedEmptyPaperAccounts).toHaveBeenCalledWith("owner-1");
  });

  it("creates DRAFT for the authenticated owner and exact chosen account", async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const payload = await response.json();
    expect(payload.status).toBe("DRAFT");
    expect(payload.policyId).toMatch(/^paper-/);
    expect(mocks.createOwnedDraft).toHaveBeenCalledWith("owner-1", expect.objectContaining({ status: "DRAFT", mode: "PAPER_ONLY", financialAccountId: body.financialAccountId }));
  });

  it("rejects CSRF, wrong-owner account, and invalid limits before repository writes", async () => {
    expect((await POST(request(body, "https://attacker.example"))).status).toBe(403);
    const wrongAccount = { ...body, financialAccountId: "123e4567-e89b-42d3-a456-426614174001" };
    mocks.createOwnedDraft.mockRejectedValueOnce(new Error("PAPER_ACCOUNT_NOT_FOUND"));
    expect((await POST(request(wrongAccount))).status).toBe(404);
    const badLimits = { ...body, maxOrderNok: "5001" };
    expect((await POST(request(badLimits))).status).toBe(400);
    expect(mocks.createOwnedDraft).toHaveBeenCalledTimes(1);
  });
});
