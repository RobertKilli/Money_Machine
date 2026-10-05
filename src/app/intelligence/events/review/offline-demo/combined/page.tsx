import { notFound } from "next/navigation";
import Link from "next/link";
import { EvidenceReviewQueueWorkspace } from "@/components/intelligence/evidence-review-queue-workspace";
import { OfflineReviewDemoDetailSection } from "@/components/intelligence/offline-review-demo-detail-section";

export const metadata = {
  title: "Samlet syntetisk review-kø | Evidence review queue",
  description: "Én lokal composition med faste syntetiske review-kandidater.",
};

const OFFLINE_DEMO_PATH = "/intelligence/events/review/offline-demo";
const COMBINED_QUEUE_HEADING_ID = "queue-combined-offline-demo-items-heading";

export default async function OfflineCombinedReviewQueuePage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const { loadEventIntelligenceOfflineCombinedReviewQueue } = await import("@/application/intelligence/load-event-intelligence-offline-combined-review-queue");
  const result = await loadEventIntelligenceOfflineCombinedReviewQueue();

  return <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
    <header className="mb-8 rounded-2xl border border-amber-300/70 bg-amber-300/10 p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">SYNTETISK OFFLINE-DEMO</p>
      <h1 className="mt-2 text-2xl font-semibold">Samlet syntetisk review-kø</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">Dette er én samlet kø fra én syntetisk composition. Den viser read-only review-behov, ikke godkjente events eller handelssignaler. Køens rekkefølge gjelder review-behov, ikke investeringsverdi.</p>
      <Link href={OFFLINE_DEMO_PATH} className="mt-4 inline-block rounded px-1 py-1 text-sm font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Tilbake til demooversikten</Link>
      <Link href={`${OFFLINE_DEMO_PATH}/replay`} className="mt-4 ml-4 inline-block rounded px-1 py-1 text-sm font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Sammenlign to observasjonstidspunkter</Link>
    </header>

    {result.status === "UNAVAILABLE" ? <section role="status" className="rounded-2xl border border-amber-300/60 p-6">Den samlede demo-køen kunne ikke settes sammen. Ingen rader er laget utenom den eksisterende komposisjonen.</section> : <>
      <section aria-label="Køoversikt" className="mb-6 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 sm:grid-cols-3">
        <p className="text-sm"><span className="font-semibold">Composition:</span> {result.compositionStatus}</p>
        <p className="text-sm"><span className="font-semibold">Køstatus:</span> {result.model.state}</p>
        <p className="text-sm"><span className="font-semibold">Totalt antall kandidater:</span> {result.model.items.length}</p>
        <p className="text-sm sm:col-span-3"><span className="font-semibold">Felles cutoff (UTC):</span> <time dateTime={result.evaluatedAsOf}>{result.evaluatedAsOf}</time></p>
      </section>
      <EvidenceReviewQueueWorkspace
        model={result.model}
        presentation="SYNTHETIC_OFFLINE_DEMO"
        idPrefix="combined-offline-demo"
        detailLinks={result.details.map(detail => ({
          itemPublicKey: detail.item.publicKey,
          fragmentId: detail.detailId,
          linkText: "Se forklaring og syntetisk kildekontekst",
        }))}
      />
      <section aria-label="Kandidatdetaljer" className="mt-8 space-y-5">
        {result.details.map(detail => <OfflineReviewDemoDetailSection key={detail.key} detail={detail} backHref={`#${COMBINED_QUEUE_HEADING_ID}`} />)}
      </section>
    </>}

    <footer className="mt-8 border-t border-[var(--border)] pt-5 text-sm text-[var(--muted)]">Syntetiske fixture-data er kun lokal presentasjonskontekst. De etablerer ikke kilde-, policy-, review- eller producer-authority.</footer>
  </main>;
}
