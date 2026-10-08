import { getCurrentUser } from "@/lib/auth/current-user";
import { getStandingPaperStatusRepository } from "@/infrastructure/postgres/standing-paper-policy-repository";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Cookie" };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401, headers });
  const repository = getStandingPaperStatusRepository();
  if (!repository) return Response.json({ error: "PAPER_STATUS_UNAVAILABLE" }, { status: 503, headers });
  try {
    return Response.json(await repository.loadOwnedStatus(user.id), { headers });
  } catch {
    return Response.json({ error: "PAPER_STATUS_READ_FAILED" }, { status: 503, headers });
  }
}
