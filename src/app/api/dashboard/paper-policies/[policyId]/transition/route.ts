import { getCurrentUser } from "@/lib/auth/current-user";
import { getStandingPaperStatusRepository } from "@/infrastructure/postgres/standing-paper-policy-repository";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Cookie" };
const statuses = ["DRAFT", "ACTIVE", "PAUSED", "STOPPED"] as const;
const actions = ["ACTIVATE", "PAUSE", "RESUME", "STOP"] as const;
type DashboardTransitionAction = typeof actions[number];

function isDashboardTransitionAction(value: unknown): value is DashboardTransitionAction {
  return typeof value === "string" && (actions as readonly string[]).includes(value);
}

function sameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return false;
  } catch { return false; }
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === null || fetchSite === "same-origin";
}

export async function POST(request: Request, context: { params: Promise<{ policyId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401, headers });
  if (!sameOriginRequest(request)) return Response.json({ error: "CSRF_REJECTED" }, { status: 403, headers });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 2_048) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
    body = parsed as Record<string, unknown>;
  } catch { return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers }); }

  const { policyId } = await context.params;
  const action = body.action;
  if (!policyId.trim() || policyId.length > 160 || Object.keys(body).some(key => !["action", "expectedStatus", "confirmStop", "confirmActivation", "activationConfirmationHash"].includes(key)) ||
    !isDashboardTransitionAction(action) || !statuses.includes(body.expectedStatus as typeof statuses[number]) ||
    (action === "STOP" ? body.confirmStop !== true : body.confirmStop !== undefined && body.confirmStop !== false) ||
    (action === "ACTIVATE" ? body.confirmActivation !== true || typeof body.activationConfirmationHash !== "string" || !/^[0-9a-f]{64}$/.test(body.activationConfirmationHash) : body.confirmActivation !== undefined || body.activationConfirmationHash !== undefined)) {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  }
  if (action === "ACTIVATE" && body.expectedStatus !== "DRAFT" || action === "PAUSE" && body.expectedStatus !== "ACTIVE" || action === "RESUME" && body.expectedStatus !== "PAUSED" ||
    action === "STOP" && !["DRAFT", "ACTIVE", "PAUSED"].includes(String(body.expectedStatus))) {
    return Response.json({ error: "INVALID_TRANSITION" }, { status: 409, headers });
  }

  const repository = getStandingPaperStatusRepository();
  if (!repository) return Response.json({ error: "PAPER_STATUS_UNAVAILABLE" }, { status: 503, headers });
  try {
    const policy = action === "ACTIVATE"
      ? await repository.activateOwnedDraft(user.id, policyId, body.activationConfirmationHash as string)
      : await repository.transitionOwned(user.id, policyId, action, body.expectedStatus as typeof statuses[number]);
    return Response.json({ policyId: policy.policyId, status: policy.status }, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "PAPER_POLICY_NOT_FOUND") return Response.json({ error: "NOT_FOUND" }, { status: 404, headers });
    if (code === "PAPER_POLICY_STALE_STATUS") return Response.json({ error: "STALE_STATUS" }, { status: 409, headers });
    if (code === "PAPER_POLICY_STALE_CONFIRMATION") return Response.json({ error: "STALE_CONFIRMATION" }, { status: 409, headers });
    if (code === "PAPER_POLICY_TRANSITION_INVALID" || code === "STANDING_PAPER_ACCOUNT_NOT_RUNNABLE") return Response.json({ error: "INVALID_TRANSITION" }, { status: 409, headers });
    return Response.json({ error: "PAPER_POLICY_TRANSITION_FAILED" }, { status: 503, headers });
  }
}
