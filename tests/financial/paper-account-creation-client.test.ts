import { describe, expect, it, vi } from "vitest";
import { requestPaperAccount } from "@/components/paper-account-creation";

const accountId = "123e4567-e89b-42d3-a456-426614174001";
const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("paper account creation client action", () => {
  it("requests only a server-selected empty PAPER/NOK account", async () => {
    const fetcher = vi.fn(async () => response(201, { financialAccountId: accountId, mode: "PAPER", baseCurrencyCode: "NOK", status: "ACTIVE" }));
    await expect(requestPaperAccount(fetcher)).resolves.toBe(accountId);
    expect(fetcher).toHaveBeenCalledWith("/api/dashboard/paper-policies/accounts", {
      method: "POST", cache: "no-store", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" }, body: "{}",
    });
  });

  it.each([
    response(201, { financialAccountId: accountId, mode: "LIVE", baseCurrencyCode: "NOK", status: "ACTIVE" }),
    response(201, { financialAccountId: accountId, mode: "PAPER", baseCurrencyCode: "USD", status: "ACTIVE" }),
    response(201, { financialAccountId: "not-an-id", mode: "PAPER", baseCurrencyCode: "NOK", status: "ACTIVE" }),
    response(503, { error: "PRIVATE_DATABASE_ERROR" }),
  ])("fails closed on an invalid account response", async result => {
    await expect(requestPaperAccount(async () => result)).rejects.toThrow("PAPER_ACCOUNT_CREATE_FAILED");
  });
});
