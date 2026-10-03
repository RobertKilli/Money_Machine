"use client";

import { useMemo, useState } from "react";
import { filterInbox, inboxFiltersAreValid, INBOX_CATEGORIES, INBOX_SOURCE_TYPES, type DiscoveryInboxViewModel, type InboxFilters } from "../../application/intelligence/discovery-inbox-view-model";

const emptyFilters: InboxFilters = { category: "", sourceType: "", discoveryStatus: "", mappingStatus: "", lifecycle: "", issuer: "", asset: "", from: "", to: "" };
const pipeline = ["Discovery", "Issuer / asset mapping", "Authoritative source retrieval", "Correction / lifecycle reconciliation", "Corroboration", "Event authority", "Separate signal policy"];
const shortTime = (value: string) => `${value.replace("T", " ").replace(".000Z", " UTC").replace(/\.\d{3}Z$/, " UTC")}`;
const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^./, char => char.toUpperCase());
const candidateCategoryLabel = (value: string) => value === "COMPLETED_CRYPTO_PURCHASE" ? "Completed crypto purchase · candidate claim" : label(value);
function safeSourceHref(value: string): { href: string; hostname: string } | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.port || url.hash || url.href !== value) return null;
    return { href: value, hostname: url.hostname };
  } catch { return null; }
}

function Status({ children, tone = "neutral" }: { children: string; tone?: "neutral" | "warning" | "terminal" }) {
  const colors = tone === "terminal" ? "border-rose-400/50 text-rose-200" : tone === "warning" ? "border-amber-300/50 text-amber-100" : "border-[var(--border)] text-[var(--muted)]";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] ${colors}`}>{children}</span>;
}

function Details({ item }: { item: DiscoveryInboxViewModel["items"][number] }) {
  const terminal = item.lifecycle !== "ACTIVE";
  const source = safeSourceHref(item.sourceUrl);
  return <details className={`group rounded-xl border bg-[var(--panel)] ${terminal ? "border-rose-400/50" : "border-[var(--border)]"}`}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:p-5">
      <span className="min-w-0"><span className="block break-words font-semibold leading-snug">{item.headline}</span><span className="mt-2 block text-xs text-[var(--muted)]">{item.publisher}{item.distributor ? ` · distributed by ${item.distributor}` : ""}</span></span>
      <span className="flex shrink-0 flex-col items-end gap-2"><Status tone={terminal ? "terminal" : "warning"}>{item.discoveryStatus}</Status><span aria-hidden="true" className="text-[var(--muted)] transition-transform motion-reduce:transition-none group-open:rotate-180">⌄</span></span>
    </summary>
    <div className="border-t border-[var(--border)] px-4 py-5 sm:px-5">
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          {item.summary && <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">{item.summary}</p>}
          {item.correctionParentHeadline && <div className="rounded-lg border border-rose-400/40 p-3"><p className="text-xs font-semibold uppercase tracking-wider text-rose-200">Retained prior record</p><p className="mt-2 text-sm">{item.correctionParentHeadline}</p></div>}
          <dl className="grid min-w-0 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-[var(--muted)]">Candidate categories · unverified claims</dt><dd className="mt-1 break-words">{item.categories.map(candidateCategoryLabel).join(" · ")}</dd></div>
            <div><dt className="text-xs text-[var(--muted)]">Publisher relationship</dt><dd className="mt-1">{item.sourceRelationship}</dd></div>
            <div><dt className="text-xs text-[var(--muted)]">Issuer mention</dt><dd className="mt-1 break-words">{item.issuerCandidate ?? "Not attributed"}{item.issuerRelationship ? ` · ${label(item.issuerRelationship)}` : ""}</dd></div>
            {item.entities.length > 0 && <div><dt className="text-xs text-[var(--muted)]">Other legal-entity mentions</dt><dd className="mt-1">{item.entities.map(entity => `${entity.name} · ${label(entity.relationship)}`).join("; ")}</dd></div>}
            <div><dt className="text-xs text-[var(--muted)]">Asset mentions</dt><dd className="mt-1">{item.assets.length ? item.assets.map(asset => `${asset.label}${asset.ticker ? ` (${asset.ticker})` : ""} · ${label(asset.representation)}`).join("; ") : "None"}<span className="mt-1 block text-xs text-[var(--muted)]">Mention only; no canonical asset mapping.</span></dd></div>
            <div><dt className="text-xs text-[var(--muted)]">Origin / syndication</dt><dd className="mt-1">{item.originalPublisher ?? "Origin unresolved"}<span className="mt-1 block text-xs text-[var(--muted)]">{item.originGroupLabel} · {item.originGroupCount} discovery origin group · {item.originGroupMemberCount} record(s)</span></dd></div>
            <div><dt className="text-xs text-[var(--muted)]">Published (UTC)</dt><dd className="mt-1"><time dateTime={item.publishedAt}>{shortTime(item.publishedAt)}</time></dd></div>
            {item.sourceUpdatedAt && <div><dt className="text-xs text-[var(--muted)]">Source updated (UTC)</dt><dd className="mt-1"><time dateTime={item.sourceUpdatedAt}>{shortTime(item.sourceUpdatedAt)}</time></dd></div>}
            <div><dt className="text-xs text-[var(--muted)]">Discovered (UTC)</dt><dd className="mt-1"><time dateTime={item.discoveredAt}>{shortTime(item.discoveredAt)}</time></dd></div>
            <div><dt className="text-xs text-[var(--muted)]">Received (UTC)</dt><dd className="mt-1"><time dateTime={item.receivedAt}>{shortTime(item.receivedAt)}</time></dd></div>
            <div><dt className="text-xs text-[var(--muted)]">Evaluated (UTC)</dt><dd className="mt-1"><time dateTime={item.evaluatedAt}>{shortTime(item.evaluatedAt)}</time></dd></div>
          </dl>
          {source ? <a className="inline-flex max-w-full break-all text-sm text-[var(--accent)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]" href={source.href} target="_blank" rel="noopener noreferrer">Open source at {source.hostname}<span className="sr-only"> (opens in a new tab)</span></a> : <p className="text-sm text-[var(--muted)]">Source link unavailable.</p>}
        </div>
        <aside className="rounded-xl border border-[var(--border)] p-4" aria-label="Verification status">
          <h3 className="text-sm font-semibold">What remains unverified</h3>
          <ul className="mt-4 space-y-3 text-xs text-[var(--muted)]"><li>• {label(item.mappingStatus)}</li><li>• {label(item.retrievalStatus)}</li><li>• {label(item.corroborationStatus)}</li><li>• No event authority</li><li>• No signal or trading action</li></ul>
          <p className="mt-4 border-t border-[var(--border)] pt-4 text-xs leading-5">{terminal ? "This candidate is terminally marked by a correction or retraction hint. Original history remains visible." : "Discovery is a lead for further verification. Intent, plans and expected closing do not establish completion."}</p>
          <p className="mt-3"><Status tone="warning">{item.authorityStatus}</Status></p>
        </aside>
      </div>
    </div>
  </details>;
}

export function DiscoveryInbox({ model }: { model: DiscoveryInboxViewModel }) {
  const [filters, setFilters] = useState<InboxFilters>(emptyFilters);
  const visible = useMemo(() => filterInbox(model.items, filters), [model.items, filters]);
  const invalidFilters = !inboxFiltersAreValid(filters);
  const update = (key: keyof InboxFilters, value: string) => setFilters(previous => ({ ...previous, [key]: value }));
  const clear = () => setFilters(emptyFilters);
  return <div className="space-y-8">
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 sm:p-7" aria-labelledby="pipeline-title">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Verification pipeline</p><h2 id="pipeline-title" className="mt-2 text-xl font-semibold">Discovery is the only active stage</h2></div><Status tone="warning">Step 1 of 7</Status></div>
      <ol className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{pipeline.map((step, index) => <li key={step} className={`min-w-0 rounded-xl border p-3 ${index === 0 ? "border-[var(--accent)] text-[var(--foreground)]" : "border-[var(--border)] text-[var(--muted)]"}`}><span className="text-[0.65rem] font-semibold uppercase tracking-wider">{index === 0 ? "Active" : "Blocked / pending"}</span><span className="mt-2 block text-sm leading-5">{index + 1}. {step}</span></li>)}</ol>
    </section>
    <section aria-labelledby="inbox-title" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Read-only workspace</p><h2 id="inbox-title" className="mt-2 text-2xl font-semibold">Discovery inbox</h2><p className="mt-2 text-sm text-[var(--muted)]">{model.items.length} candidates · discovery origin groups are not independent confirmations</p></div>{model.items.length > 0 && <Status>{`${visible.length} shown`}</Status>}</div>
      <fieldset className="grid gap-3 rounded-2xl border border-[var(--border)] p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filter discovery candidates"><legend className="px-2 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Filters · all lifecycle states included by default</legend>
        <label className="text-xs text-[var(--muted)]">Category<select value={filters.category} onChange={e => update("category", e.target.value)} className="filter-control"><option value="">All categories</option>{INBOX_CATEGORIES.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label className="text-xs text-[var(--muted)]">Source type<select value={filters.sourceType} onChange={e => update("sourceType", e.target.value)} className="filter-control"><option value="">All source types</option>{INBOX_SOURCE_TYPES.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label className="text-xs text-[var(--muted)]">Discovery status<select value={filters.discoveryStatus} onChange={e => update("discoveryStatus", e.target.value)} className="filter-control"><option value="">All statuses</option>{["NEW_DISCOVERY", "CORRECTED", "RETRACTED", "DISCOVERY_ONLY"].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label className="text-xs text-[var(--muted)]">Mapping status<select value={filters.mappingStatus} onChange={e => update("mappingStatus", e.target.value)} className="filter-control"><option value="">All mapping</option><option value="NEEDS_MAPPING">Needs mapping</option></select></label>
        <label className="text-xs text-[var(--muted)]">Correction / retraction<select value={filters.lifecycle} onChange={e => update("lifecycle", e.target.value)} className="filter-control"><option value="">All lifecycle states</option><option value="ACTIVE">Active discovery</option><option value="CORRECTED">Corrected</option><option value="RETRACTED">Retracted</option></select></label>
        <label className="text-xs text-[var(--muted)]">Issuer candidate<input value={filters.issuer} onChange={e => update("issuer", e.target.value)} className="filter-control" placeholder="Any issuer" /></label>
        <label className="text-xs text-[var(--muted)]">Asset candidate<input value={filters.asset} onChange={e => update("asset", e.target.value)} className="filter-control" placeholder="Any mentioned asset" /></label>
        <div className="grid grid-cols-2 gap-2"><label className="text-xs text-[var(--muted)]">Published from<input type="date" value={filters.from} onChange={e => update("from", e.target.value)} className="filter-control" /></label><label className="text-xs text-[var(--muted)]">To<input type="date" value={filters.to} onChange={e => update("to", e.target.value)} className="filter-control" /></label></div>
        <div className="sm:col-span-2 lg:col-span-4"><button type="button" onClick={clear} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Clear filters</button></div>
      </fieldset>
      {invalidFilters && <p role="status" className="rounded-lg border border-amber-300/50 p-3 text-xs">An invalid filter value was ignored. Candidate lifecycle and authority data are unchanged.</p>}
      {model.state === "SANITIZED_ERROR" && <div role="alert" className="rounded-xl border border-amber-300/50 p-4 text-sm">{model.notice}</div>}
      {model.items.length === 0 ? <div role="status" className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel)] p-7 sm:p-10"><div className="flex flex-wrap items-center gap-3"><span aria-hidden="true" className="grid size-10 place-items-center rounded-full border border-amber-300/50 text-amber-100">—</span><h3 className="text-lg font-semibold">No discovery records available</h3></div><p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--muted)]">{model.notice} No provider stack is selected, acquisition is blocked, and persistence is unavailable. A separately reviewed source adapter and usage approval must precede acquisition; issuer and asset mapping, authoritative retrieval and corroboration remain later gates.</p><div className="mt-5 flex flex-wrap gap-2"><Status tone="warning">{model.productionStatus}</Status><Status>{model.persistenceStatus}</Status><Status>{model.providerStack}</Status></div></div> : visible.length === 0 ? <div role="status" className="rounded-xl border border-[var(--border)] p-6 text-sm text-[var(--muted)]"><p>No candidates match these filters.</p><button className="mt-3 underline underline-offset-4" type="button" onClick={clear}>Clear filters</button></div> : <>
        <div className="hidden overflow-x-auto rounded-2xl border border-[var(--border)] lg:block"><table className="w-full min-w-[1120px] text-left text-xs"><caption className="sr-only">Non-authoritative discovery candidates and verification statuses</caption><thead className="bg-[var(--panel)] text-[var(--muted)]"><tr>{["Candidate", "Candidate category · unverified", "Issuer / assets", "Publisher", "Source", "Published (UTC)", "Discovered (UTC)", "Origin groups", "Lifecycle", "Mapping", "Corroboration", "Authority"].map(value => <th key={value} scope="col" className="px-4 py-3 font-medium">{value}</th>)}</tr></thead><tbody className="divide-y divide-[var(--border)]">{visible.map(item => <tr key={item.id} className={item.lifecycle === "RETRACTED" ? "bg-rose-950/20" : ""}><th scope="row" className="max-w-60 px-4 py-4 font-medium"><a href={`#candidate-${encodeURIComponent(item.id)}`} className="break-words underline decoration-[var(--border)] underline-offset-4 focus-visible:outline-2">{item.headline}</a></th><td className="px-4 py-4">{candidateCategoryLabel(item.category)}</td><td className="max-w-48 px-4 py-4">{item.issuerCandidate ?? "Unresolved"}<span className="mt-1 block text-[var(--muted)]">{item.assets.map(asset => asset.ticker ?? asset.label).join(", ") || "No asset mention"}</span></td><td className="px-4 py-4">{item.publisher}</td><td className="px-4 py-4">{label(item.sourceType)}</td><td className="whitespace-nowrap px-4 py-4">{shortTime(item.publishedAt)}</td><td className="whitespace-nowrap px-4 py-4">{shortTime(item.discoveredAt)}</td><td className="px-4 py-4">{item.originGroupCount} · {item.originGroupMemberCount} record(s)</td><td className="px-4 py-4"><Status tone={item.lifecycle === "ACTIVE" ? "warning" : "terminal"}>{item.discoveryStatus}</Status></td><td className="px-4 py-4">{label(item.mappingStatus)}</td><td className="px-4 py-4">{label(item.corroborationStatus)}</td><td className="px-4 py-4"><Status tone="warning">{item.authorityStatus}</Status></td></tr>)}</tbody></table></div>
        <div className="space-y-3 lg:hidden">{visible.map(item => <div key={item.id} className="scroll-mt-4"><div className="mb-2 flex flex-wrap gap-2"><Status tone="warning">{item.discoveryStatus}</Status><Status>{item.authorityStatus}</Status></div><Details item={item} /></div>)}</div>
        <div className="hidden lg:block">{visible.map(item => <div id={`candidate-${encodeURIComponent(item.id)}`} key={item.id} className="mb-3 scroll-mt-4"><Details item={item} /></div>)}</div>
      </>}
      {model.items.some(item => item.lifecycle !== "ACTIVE") && <p className="text-xs text-[var(--muted)]">Corrected and retracted history is included by default. Use filters only to narrow the view; lifecycle states are never silently replaced.</p>}
    </section>
  </div>;
}
