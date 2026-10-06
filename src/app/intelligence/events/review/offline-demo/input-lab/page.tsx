import { notFound } from "next/navigation";
import Link from "next/link";
import { OfflineReviewWorkbenchNavigation } from "@/components/intelligence/offline-review-workbench-navigation";
import { OfflineReviewInputLab } from "@/components/intelligence/offline-review-input-lab";

export const metadata = {
  title: "Syntetiske input | Offline review-arbeidsflate",
  description: "Development-only laboratorium for avgrensede syntetiske discovery-inputs.",
};

export default function OfflineReviewInputLabPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
    <header className="rounded-2xl border border-amber-300/70 bg-amber-300/10 p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">DEVELOPMENT-ONLY · SYNTHETIC INPUT</p>
      <h1 className="mt-2 text-2xl font-semibold">Syntetiske input-laboratorium</h1>
      <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--muted)]">Endre et lite, lukket sett med discovery-felter for de faste mapping-, rights- og correction-profilene. Hver innsending kjøres i minnet gjennom eksisterende discovery, routing, V2 composition og presentasjons-API-er. Dette er simulering: ingen approval, policy application, persistence eller production-aktivering skjer. Tekst som ligner virkelig materiale er fortsatt bare syntetisk deklarasjon.</p>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Ingen kilde-URL, fil, credentials, provider-valg, private ID-er, fingerprints eller forrige resultat kan sendes inn. Reload tilbakestiller skjemaet.</p>
    </header>
    <OfflineReviewWorkbenchNavigation activePage="input-lab" />
    <OfflineReviewInputLab />
    <footer className="mt-8 border-t border-[var(--border)] pt-5 text-sm text-[var(--muted)]"><Link href="/intelligence/events/review/offline-demo" className="rounded px-1 py-1 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Tilbake til demooversikten</Link></footer>
  </main>;
}
