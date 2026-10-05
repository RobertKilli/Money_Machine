import { notFound } from "next/navigation";
import Link from "next/link";
import { OfflineReviewReadinessDemoView } from "@/components/intelligence/offline-review-readiness-demo-view";

export const metadata = { title: "Offline review readiness | Evidence review queue", description: "Read-only syntetisk demonstrasjon av lokal review readiness og gjenværende queue-blockers." };

export default async function OfflineReviewReadinessPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const { loadOfflineReviewReadinessDemo } = await import("@/application/intelligence/load-offline-review-readiness-demo");
  const result = await loadOfflineReviewReadinessDemo();
  return <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8"><header className="rounded-2xl border border-amber-300/70 bg-amber-300/10 p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-widest text-amber-200">READ-ONLY / SYNTHETIC OFFLINE DEMO</p><h1 className="mt-2 text-2xl font-semibold">Offline review readiness</h1><p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--muted)]">Sessionreferanser er ferske bare for den eksakte in-memory session-revisjonen. Lokal milepæl, faktiske V2-blockers og manglende domain-authority vises separat. Ingen vurdering gir samlet progresjonstillatelse.</p><nav aria-label="Readiness navigation" className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold"><Link href="/intelligence/events/review/offline-demo" className="underline underline-offset-4">Til demooversikten</Link><Link href="/intelligence/events/review/offline-demo/queue-v2" className="underline underline-offset-4">Til V1/V2-sammenligning</Link><Link href="/intelligence/events/review/offline-demo/review-session" className="underline underline-offset-4">Til session-demonstrasjon</Link><Link href="/intelligence/events/review" className="underline underline-offset-4">Vanlig review</Link></nav></header>{result.status === "UNAVAILABLE" ? <p role="status" className="mt-6 rounded-xl border p-6">Den syntetiske readiness-demonstrasjonen kunne ikke bygges gjennom de autentiske API-ene.</p> : <OfflineReviewReadinessDemoView result={result} />}</main>;
}
