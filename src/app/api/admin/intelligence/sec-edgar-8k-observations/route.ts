import { requireAdminUser } from "@/lib/auth/current-user";
import { loadSecEdgar8kObservationReadModel } from "@/infrastructure/postgres/sec-edgar-8k-observation-read-model-repository";

export async function GET() {
  try { await requireAdminUser(); } catch { return Response.json({ error: "FORBIDDEN" }, { status: 403, headers: { "Cache-Control": "no-store" } }); }
  try { return Response.json(await loadSecEdgar8kObservationReadModel(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "SEC_OBSERVATION_READ_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
