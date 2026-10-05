"use client";

import { useMemo, useState } from "react";
import type { ReadinessDemoResult } from "@/application/intelligence/load-offline-review-readiness-demo";

export function OfflineReviewReadinessDemoView({ result }: { result: ReadinessDemoResult }) {
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const items = useMemo(() => result.status === "AVAILABLE" ? result.items : [], [result]);
  const shown = useMemo(() => items.filter(item =>
    (!filter || item.localReview === filter) &&
    (!search || `${item.scenario} ${item.title} ${item.localReview} ${item.priority} ${item.blockers.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase())),
  ), [items, filter, search]);
  const reset = () => { setFilter(""); setSearch(""); };

  return <section aria-labelledby="readiness-items-heading" className="mt-8 min-w-0">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Syntetiske kandidater</p><h2 id="readiness-items-heading" className="mt-1 text-xl font-semibold">Lokal review readiness</h2></div>
      <p aria-live="polite" className="text-sm text-[var(--muted)]">{shown.length} vist av {items.length} varianter</p>
    </div>
    <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] p-4">
      <label className="grid gap-1 text-sm" htmlFor="readiness-local-filter">Filtrer på lokal reviewstatus
        <select id="readiness-local-filter" value={filter} onChange={event => setFilter(event.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2">
          <option value="">Alle statuser</option>{["NO_REVIEW_EVIDENCE", "COMPLETED_PROCEED", "COMPLETED_STOP", "HELD"].map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm" htmlFor="readiness-search">Søk i visningsetiketter
        <input id="readiness-search" type="search" maxLength={80} value={search} onChange={event => setSearch(event.target.value.slice(0, 80))} className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" />
      </label>
      <button type="button" onClick={reset} className="rounded px-2 py-2 text-sm font-semibold underline focus-visible:outline focus-visible:outline-2">Nullstill filtre</button>
      <p aria-live="polite" className="text-xs text-[var(--muted)]">{filter || search ? `Aktive filtre: ${[filter && `Lokal reviewstatus: ${filter}`, search && `Søk: ${search}`].filter(Boolean).join(" · ")}` : "Ingen aktive filtre."}</p>
    </div>
    {!shown.length ? <div role="status" className="mt-4 rounded-xl border border-[var(--border)] p-8 text-center"><p>Ingen varianter matcher filtrene.</p><button type="button" onClick={reset} className="mt-3 underline">Nullstill filtre</button></div> :
      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">{shown.map(item => <article key={item.key} className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{item.scenario}</p><h3 className="mt-2 break-words text-lg font-semibold">{item.title}</h3><p className="mt-2 text-sm text-[var(--muted)]">{item.description}</p>
        <dl className="mt-4 grid min-w-0 gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-[var(--muted)]">Lokal review-milepæl</dt><dd className="break-words">{item.localReview}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Queue status / prioritet</dt><dd className="break-words">{item.queueStatus} / {item.priority}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Reviewens routing-kontekst (A)</dt><dd className="break-words">{item.reviewRouting}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Køens routing-kontekst (B)</dt><dd className="break-words">{item.queueRouting}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Relasjon mellom A og B</dt><dd className="break-words">{item.routingRelation}; anvendelse på B: {item.reviewApplication}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Cutoff UTC</dt><dd className="break-all font-mono text-xs">{item.cutoff}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Fersk evaluering</dt><dd>{item.fresh}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Eldre referanse</dt><dd>{item.stale}</dd></div>
        </dl>
        <p className="mt-4 text-xs font-semibold">Historical syntetisk snapshot</p>
        <div className="mt-3"><h4 className="text-sm font-semibold">Gjenværende queue-blockers</h4>{item.blockers.length ? <ul className="mt-1 list-inside list-disc break-words text-sm text-[var(--muted)]">{item.blockers.map(code => <li key={code}>{code}</li>)}</ul> : <p className="text-sm text-[var(--muted)]">Ingen queue-blockers i dette faktiske V2-resultatet.</p>}</div>
        <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs leading-5">Syntetisk og non-authoritative. Reviewet gjelder kontekst A. Det finnes ingen verifisert anvendelse på køkontekst B. Authorization er ikke etablert; samlet progresjon er ikke gitt. COMPLETED_PROCEED fullfører bare lokal review-milepæl og endrer ikke routing eller blockers.</p>
      </article>)}</div>}
  </section>;
}
