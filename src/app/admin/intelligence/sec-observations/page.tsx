import { redirect } from "next/navigation";
import { SecObservationPanel } from "@/components/admin/sec-observation-panel";
import { requireAdminUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function SecObservationsAdminPage() {
  try { await requireAdminUser(); } catch { redirect("/dashboard"); }
  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-10">
    <p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">MONEY MACHINE / ADMIN</p>
    <h1 className="mt-3 text-3xl font-semibold">SEC filing observations</h1>
    <p className="mt-3 max-w-3xl text-sm text-[var(--muted)]">Read-only filing metadata and ingestion provenance. These observations are non-authoritative and do not create event claims, financial signals, or trading instructions.</p>
    <SecObservationPanel />
  </main>;
}
