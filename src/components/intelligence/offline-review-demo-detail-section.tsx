import "server-only";

import type { OfflineReviewDemoDetail } from "@/application/intelligence/offline-review-demo-presentation";

type Props = Readonly<{ detail: OfflineReviewDemoDetail; backHref?: string }>;

export function OfflineReviewDemoDetailSection({ detail, backHref }: Props) {
  const headingId = `${detail.detailId}-heading`;
  const sourceSummaryId = `${detail.detailId}-source-context-heading`;
  const item = detail.item;

  return <section id={detail.detailId} tabIndex={-1} aria-labelledby={headingId} className="scroll-mt-6 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] sm:p-6">
    <header>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{detail.label}</p>
      <h2 id={headingId} className="mt-2 break-words text-xl font-semibold">{item.title}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail.description}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-[var(--border)] px-3 py-1 font-semibold">{item.statusLabel}</span>
        <span className="rounded-full border border-[var(--border)] px-3 py-1">{item.priorityLabel}</span>
        {item.historical && <span className="rounded-md border border-sky-300/50 px-2.5 py-1">Historical snapshot</span>}
        {item.correctionPresent && <span className="rounded-md border border-amber-300/70 px-2.5 py-1">Correction material present</span>}
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">Evaluert ved fast cutoff: <time dateTime={item.evaluatedAsOf}>{item.evaluatedAsOf}</time> UTC.</p>
    </header>

    <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-3">
      <section aria-label="Why this candidate requires review" className="min-w-0 rounded-xl border border-[var(--border)] p-4">
        <h3 className="text-sm font-semibold">Hvorfor er kandidaten her?</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail.reviewGuidance.why}</p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm leading-6 text-[var(--muted)]">
          {item.reasonLabels.map(reason => <li className="break-words" key={reason}>{reason}</li>)}
        </ul>
      </section>
      <section aria-label="Missing information" className="min-w-0 rounded-xl border border-[var(--border)] p-4">
        <h3 className="text-sm font-semibold">Hva mangler?</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail.reviewGuidance.missing}</p>
      </section>
      <section aria-label="Suggested investigation" className="min-w-0 rounded-xl border border-[var(--border)] p-4">
        <h3 className="text-sm font-semibold">Hva må undersøkes videre?</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail.reviewGuidance.investigate}</p>
      </section>
    </div>

    <p className="mt-4 text-sm"><span className="font-semibold">Veiledende neste handling: </span><span className="text-[var(--muted)]">{item.nextActionLabel}</span></p>

    <details aria-label="Synthetic source context" aria-labelledby={sourceSummaryId} className="mt-5 rounded-xl border border-[var(--border)] p-4">
      <summary id={sourceSummaryId} className="w-fit cursor-pointer rounded px-1 py-1 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">View synthetic source context</summary>
      <div className="mt-4 rounded-lg border border-amber-300/40 bg-amber-300/5 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-100">Synthetic fixture material · read-only</p>
        <p className="mt-2 text-sm font-semibold">{detail.sourceMaterial.sourceLabel} <span className="font-normal text-[var(--muted)]">({detail.sourceMaterial.sourceType})</span></p>
        <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
          <div className="min-w-0"><dt className="text-xs text-[var(--muted)]">Fixture ID</dt><dd className="mt-1 break-all font-mono">{detail.sourceMaterial.fixtureId}</dd></div>
          <div className="min-w-0"><dt className="text-xs text-[var(--muted)]">Received (UTC)</dt><dd className="mt-1 break-all font-mono"><time dateTime={detail.sourceMaterial.receivedAt}>{detail.sourceMaterial.receivedAt}</time></dd></div>
          <div className="min-w-0 sm:col-span-2"><dt className="text-xs text-[var(--muted)]">Synthetic title</dt><dd className="mt-1 break-words">{detail.sourceMaterial.title}</dd></div>
          <div className="min-w-0 sm:col-span-2"><dt className="text-xs text-[var(--muted)]">Fixture summary</dt><dd className="mt-1 break-words leading-6 text-[var(--muted)]">{detail.sourceMaterial.summary}</dd></div>
          {detail.sourceMaterial.evidence.map(entry => <div className="min-w-0" key={entry.label}><dt className="text-xs text-[var(--muted)]">{entry.label}</dt><dd className="mt-1 break-words">{entry.value}</dd></div>)}
          <div className="min-w-0 sm:col-span-2"><dt className="text-xs text-[var(--muted)]">Why it is relevant</dt><dd className="mt-1 break-words leading-6 text-[var(--muted)]">{detail.sourceMaterial.relevance}</dd></div>
        </dl>
        <p className="mt-4 text-xs font-semibold">{detail.sourceMaterial.synthetic ? "Synthetic/offline context only. This fixture is not a source of truth or proof of approval, rights, or lifecycle relationships." : ""}</p>
      </div>
    </details>

    {backHref && <a href={backHref} className="mt-5 inline-block rounded px-1 py-1 text-sm font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Tilbake til køen</a>}
  </section>;
}
