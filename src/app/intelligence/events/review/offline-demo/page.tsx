import { notFound } from "next/navigation";
import { EvidenceReviewQueueWorkspace } from "@/components/intelligence/evidence-review-queue-workspace";

export const metadata = {
  title: "Syntetisk offline-demo | Evidence review queue",
  description: "Lokale syntetiske kandidater for read-only gjennomgang.",
};

export default async function OfflineEvidenceReviewDemoPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const { loadEventIntelligenceOfflineReviewDemo } = await import("@/application/intelligence/load-event-intelligence-offline-review-demo");
  const demo = await loadEventIntelligenceOfflineReviewDemo();

  return <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
    <header className="mb-8 rounded-2xl border border-amber-300/70 bg-amber-300/10 p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">SYNTETISK OFFLINE-DEMO</p>
      <h1 className="mt-2 text-2xl font-semibold">Ingen live nyheter eller godkjente events</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">Disse kandidatene er kun til read-only review. De er ikke godkjente events eller handelssignaler. Fast cutoff (UTC): <time dateTime={demo.status === "AVAILABLE" ? demo.evaluatedAsOf : "2026-10-03T12:00:00.000Z"}>{demo.status === "AVAILABLE" ? demo.evaluatedAsOf : "2026-10-03T12:00:00.000Z"}</time>.</p>
    </header>

    {demo.status === "UNAVAILABLE" ? <section role="status" className="rounded-2xl border border-amber-300/60 p-6">Demo-scenarioene kunne ikke settes sammen. Ingen syntetiske rader er laget utenom den eksisterende komposisjonen.</section> : <div className="space-y-8">
      {demo.scenarios.map(scenario => <section key={scenario.key} aria-labelledby={`offline-demo-${scenario.key}`} className="overflow-hidden rounded-2xl border border-[var(--border)]">
        <header className="border-b border-[var(--border)] bg-[var(--panel)] p-5 sm:p-6">
          <h2 id={`offline-demo-${scenario.key}`} className="text-lg font-semibold">{scenario.label}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{scenario.description}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">Evaluert ved fast cutoff: {demo.evaluatedAsOf} UTC · Historical status vises fra modellen.</p>
        </header>
        <EvidenceReviewQueueWorkspace model={scenario.model} presentation="SYNTHETIC_OFFLINE_DEMO" idPrefix={scenario.key} />
      </section>)}
    </div>}

    <footer className="mt-8 border-t border-[var(--border)] pt-5 text-sm text-[var(--muted)]">Ingen writes, fullføring av review, godkjenning eller trading-handlinger er tilgjengelige her.</footer>
  </div>;
}
