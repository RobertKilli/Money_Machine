const accountIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export async function requestPaperAccount(fetcher: Fetcher = fetch): Promise<string> {
  const response = await fetcher("/api/dashboard/paper-policies/accounts", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
    body: "{}",
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof payload.financialAccountId !== "string" || !accountIdPattern.test(payload.financialAccountId) ||
    payload.mode !== "PAPER" || payload.baseCurrencyCode !== "NOK" || payload.status !== "ACTIVE") {
    const code = typeof payload.error === "string" ? payload.error : "";
    if (code === "INVALID_REQUEST" || code === "CSRF_REJECTED") throw new Error(code);
    throw new Error("PAPER_ACCOUNT_CREATE_FAILED");
  }
  return payload.financialAccountId;
}
