import { createStandingPaperDraft } from "@/application/paper-trading/create-standing-paper-policy";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getStandingPaperStatusRepository } from "@/infrastructure/postgres/standing-paper-policy-repository";

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

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401, headers });
  const repository = getStandingPaperStatusRepository();
  if (!repository) return Response.json({ error: "PAPER_POLICY_UNAVAILABLE" }, { status: 503, headers });
  try {
    const accounts = await repository.listOwnedEmptyPaperAccounts(user.id);
    return Response.json({ accounts }, { headers });
  } catch {
    return Response.json({ error: "PAPER_POLICY_READ_FAILED" }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401, headers });
  if (!sameOriginRequest(request)) return Response.json({ error: "CSRF_REJECTED" }, { status: 403, headers });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 8_192) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
    body = JSON.parse(text) as unknown;
  } catch { return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers }); }

  let policy;
  try { policy = createStandingPaperDraft(body); }
  catch (error) {
    const code = error instanceof Error ? error.message : "";
    return Response.json({ error: code === "PAPER_POLICY_LIMIT_INVALID" ? "INVALID_LIMITS" : "INVALID_REQUEST" }, { status: 400, headers });
  }

  const repository = getStandingPaperStatusRepository();
  if (!repository) return Response.json({ error: "PAPER_POLICY_UNAVAILABLE" }, { status: 503, headers });
  try {
    await repository.createOwnedDraft(user.id, policy);
    return Response.json({ policyId: policy.policyId, status: "DRAFT" }, { status: 201, headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "PAPER_ACCOUNT_NOT_FOUND") return Response.json({ error: "NOT_FOUND" }, { status: 404, headers });
    if (code === "STANDING_PAPER_ACCOUNT_NOT_RUNNABLE") return Response.json({ error: "ACCOUNT_NOT_ELIGIBLE" }, { status: 409, headers });
    if (code === "PAPER_ACCOUNT_NOT_EMPTY_AT_POLICY_CREATION") return Response.json({ error: "ACCOUNT_NOT_EMPTY" }, { status: 409, headers });
    if (code === "PAPER_ACCOUNT_ALREADY_HAS_POLICY") return Response.json({ error: "ACCOUNT_ALREADY_CONFIGURED" }, { status: 409, headers });
    return Response.json({ error: "PAPER_POLICY_CREATE_FAILED" }, { status: 503, headers });
  }
}
