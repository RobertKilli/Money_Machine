import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getStandingPaperStatusRepository } from "@/infrastructure/postgres/standing-paper-policy-repository";
import { StandingPaperDecisionDetailView } from "@/components/standing-paper-decision-detail";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function StandingPaperDecisionPage({ searchParams }: {
  searchParams: Promise<{ policy?: string | string[]; order?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { policy, order } = await searchParams;
  if (typeof policy !== "string" || !policy || typeof order !== "string" || !order || policy.length > 256 || order.length > 256) notFound();
  const repository = getStandingPaperStatusRepository();
  const detail = await repository?.loadOwnedDecisionDetail(user.id, policy, order).catch(() => undefined);
  if (detail === null) notFound();
  return <main className="mx-auto min-h-screen max-w-6xl space-y-6 px-5 py-8 sm:px-8">
    <Link href="/dashboard/paper" className="inline-block rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Tilbake til paper-historikk</Link>
    {detail ? <StandingPaperDecisionDetailView detail={detail} /> : <p role="status">Lagret beslutningsmateriale er utilgjengelig.</p>}
  </main>;
}
