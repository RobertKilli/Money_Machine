import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getRepository: vi.fn(), createOwnedPaperAccount: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/infrastructure/postgres/postgres-financial-repository", () => ({ getPostgresFinancialRepository: mocks.getRepository }));
import { POST } from "@/app/api/dashboard/paper-policies/accounts/route";

const ownerId = "123e4567-e89b-42d3-a456-426614174000";
const accountId = "123e4567-e89b-42d3-a456-426614174001";
const request = (body = "{}", origin = "https://money.example", contentType = "application/json") => new Request("https://money.example/api/dashboard/paper-policies/accounts", {
  method: "POST", headers: { Origin: origin, "Content-Type": contentType, "Sec-Fetch-Site": "same-origin" }, body,
});

describe("owner-scoped PAPER account creation route", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset().mockResolvedValue({ id: ownerId });
    mocks.createOwnedPaperAccount.mockReset().mockResolvedValue({ id: accountId, ownerId, mode: "PAPER", status: "ACTIVE", baseCurrencyCode: "NOK" });
    mocks.getRepository.mockReset().mockReturnValue({ createOwnedPaperAccount: mocks.createOwnedPaperAccount });
  });

  it("rejects unauthenticated and cross-origin requests before repository access", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request("{}", "https://attacker.example"))).status).toBe(403);
    expect(mocks.getRepository).not.toHaveBeenCalled();
  });

  it.each([
    ["{\"ownerId\":\"123e4567-e89b-42d3-a456-426614174099\"}"],
    ["{\"mode\":\"LIVE\"}"],
    ["[]"],
    ["null"],
  ])("rejects client-selected account attributes before writing", async ([body]) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.getRepository).not.toHaveBeenCalled();
  });

  it("creates only the authenticated owner's active PAPER/NOK account with no caller-selected fields", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ financialAccountId: accountId, mode: "PAPER", baseCurrencyCode: "NOK", status: "ACTIVE" });
    expect(mocks.createOwnedPaperAccount).toHaveBeenCalledExactlyOnceWith(ownerId);
  });

  it("rejects missing CSRF metadata and unsupported content types", async () => {
    expect((await POST(request("{}", "", "application/json"))).status).toBe(403);
    expect((await POST(request("{}", "https://money.example", "text/plain"))).status).toBe(400);
    expect(mocks.getRepository).not.toHaveBeenCalled();
  });
});
