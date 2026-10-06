import "server-only";

import { EvidenceReviewQueueWorkspace } from "@/components/intelligence/evidence-review-queue-workspace";
import { OfflineReviewDemoDetailSection } from "@/components/intelligence/offline-review-demo-detail-section";
import type { OfflineTemporalReplayEpisode } from "@/application/intelligence/load-event-intelligence-offline-temporal-replay";

export function OfflineTemporalReplayEpisodeSection({ episode }: { episode: OfflineTemporalReplayEpisode }) {
  const idPrefix = `temporal-replay-${episode.key.toLowerCase()}`;
  const queueHeadingId = `queue-${idPrefix}-items-heading`;
  const details = episode.details.map(detail => ({
    ...detail,
    detailId: `${idPrefix}-${detail.detailId}`,
  }));

  return <section aria-labelledby={`${idPrefix}-heading`} className="overflow-hidden rounded-2xl border border-[var(--border)]">
    <header className="border-b border-[var(--border)] bg-[var(--panel)] p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">Syntetisk offline-observasjon</p>
      <h2 id={`${idPrefix}-heading`} className="mt-2 text-xl font-semibold">{episode.label}</h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-xs text-[var(--muted)]">Cutoff (UTC)</dt><dd className="mt-1 break-all font-mono text-sm"><time dateTime={episode.evaluatedAsOf}>{episode.evaluatedAsOf}</time></dd></div>
        <div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-xs text-[var(--muted)]">Composition</dt><dd className="mt-1 break-words text-sm">{episode.compositionStatus}</dd></div>
        <div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-xs text-[var(--muted)]">Køstatus</dt><dd className="mt-1 text-sm">{episode.model.state}</dd></div>
        <div className="rounded-lg border border-[var(--border)] p-3 sm:col-span-3"><dt className="text-xs text-[var(--muted)]">Totalt antall kandidater</dt><dd className="mt-1 text-sm tabular-nums">{episode.model.items.length}</dd></div>
      </dl>
      <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Dette er en historisk syntetisk observasjon, ikke en current eller godkjent tilstand. Cutoff og fixture-input er fast definert for denne demoen.</p>
    </header>

    <EvidenceReviewQueueWorkspace
      model={episode.model}
      presentation="SYNTHETIC_OFFLINE_DEMO"
      idPrefix={idPrefix}
      detailLinks={details.map(detail => ({
        itemPublicKey: detail.item.publicKey,
        fragmentId: detail.detailId,
        linkText: "Se forklaring og syntetisk kildekontekst",
      }))}
    />
    <section aria-label={`${episode.label} kandidatdetaljer`} className="space-y-5 px-4 pb-6 sm:px-6">
      {details.map(detail => <OfflineReviewDemoDetailSection key={detail.key} detail={detail} backHref={`#${queueHeadingId}`} />)}
    </section>
  </section>;
}
