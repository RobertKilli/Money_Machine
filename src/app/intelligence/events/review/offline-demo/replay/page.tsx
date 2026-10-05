import { notFound } from "next/navigation";
import { OfflineTemporalReplayEpisodeSection } from "@/components/intelligence/offline-temporal-replay-episode-section";
import { OfflineReviewWorkbenchNavigation } from "@/components/intelligence/offline-review-workbench-navigation";

export const metadata = {
  title: "Syntetisk tidsreplay | Evidence review queue",
  description: "To faste syntetiske offline-observasjoner gjennom eksisterende read-only review-kø.",
};

export default async function OfflineTemporalReplayPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const { loadEventIntelligenceOfflineTemporalReplay } = await import("@/application/intelligence/load-event-intelligence-offline-temporal-replay");
  const result = await loadEventIntelligenceOfflineTemporalReplay();

  return <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
    <header className="mb-8 rounded-2xl border border-amber-300/70 bg-amber-300/10 p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">READ-ONLY / SYNTETISK OFFLINE-REPLAY</p>
      <h1 className="mt-2 text-2xl font-semibold">Sammenlign to faste observasjonstidspunkter</h1>
      <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--muted)]">Hver observasjon bruker sitt eget eksplisitte syntetiske inputsett, sin egen queue-composition og sin egen view-model. Tidligere inngår mapping- og rights-kandidaten. Senere er et correction-materiale med mottakstid 2026-10-02T08:01:01.000Z lagt til, og det gir en correction-review-rad. Materialet hevder ikke validert lifecycle, retraction eller supersession.</p>
      <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--muted)]">Discovery avviser records der recordedAt ligger etter evalueringens cutoff. Demoen velger derfor correction-materialet bare i det senere inputsettet. Dette er ikke generell point-in-time retrieval, persisted snapshots eller et produksjonsklart as-of-filter; ingen observasjon er current, approved eller authoritative.</p>
    </header>
    <OfflineReviewWorkbenchNavigation activePage="replay" />

    {result.status === "UNAVAILABLE" ? <section role="status" className="rounded-2xl border border-amber-300/60 p-6">Tidsreplayen kunne ikke settes sammen gjennom de eksisterende komposisjonene. Ingen rader ble konstruert utenom queue-kontrakten.</section> : <div className="space-y-8">
      {result.episodes.map(episode => <OfflineTemporalReplayEpisodeSection key={episode.key} episode={episode} />)}
    </div>}

    <footer className="mt-8 border-t border-[var(--border)] pt-5 text-sm text-[var(--muted)]">Filtre påvirker bare sin lokale workspace-visning. De endrer ikke den andre observasjonen, composition, cutoff, status eller source-materiale.</footer>
  </main>;
}
