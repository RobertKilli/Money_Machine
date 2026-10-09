import { getPostgresFinancialRepository } from "@/infrastructure/postgres/postgres-financial-repository";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Cookie" };

function sameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { if (new URL(origin).origin !== new URL(request.url).origin) return false; }
  catch { return false; }
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === null || fetchSite === "same-origin";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401, headers });
  if (!sameOriginRequest(request)) return Response.json({ error: "CSRF_REJECTED" }, { status: 403, headers });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 256) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
    body = JSON.parse(text) as unknown;
  } catch { return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0) {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  }

  const repository = getPostgresFinancialRepository();
  if (!repository) return Response.json({ error: "PAPER_ACCOUNT_UNAVAILABLE" }, { status: 503, headers });
  try {
    const account = await repository.createOwnedPaperAccount(user.id);
    if (account.ownerId !== user.id || account.mode !== "PAPER" || account.status !== "ACTIVE" || account.baseCurrencyCode !== "NOK") {
      return Response.json({ error: "PAPER_ACCOUNT_CREATE_FAILED" }, { status: 503, headers });
    }
    return Response.json({ financialAccountId: account.id, mode: "PAPER", baseCurrencyCode: "NOK", status: "ACTIVE" }, { status: 201, headers });
  } catch {
    return Response.json({ error: "PAPER_ACCOUNT_CREATE_FAILED" }, { status: 503, headers });
  }
}
