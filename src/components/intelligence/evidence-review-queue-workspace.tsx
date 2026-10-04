"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EvidenceReviewQueueViewModel, EvidenceReviewQueueViewModelItem } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";

type Props = Readonly<{ model: EvidenceReviewQueueViewModel; presentation?: "DEFAULT" | "SYNTHETIC_OFFLINE_DEMO"; idPrefix?: string }>;

const STATUS_OPTIONS = ["OPEN", "BLOCKED", "NO_ACTION", "RESOLVED_NON_AUTHORITATIVE", "SUPERSEDED", "RETRACTED"] as const;
const PRIORITY_OPTIONS = ["URGENT_RETRACTION_REVIEW", "URGENT_CORRECTION_REVIEW", "CONFLICT_REVIEW", "BLOCKED_RIGHTS", "JURISDICTION_UNKNOWN", "MAPPING_REQUIRED", "PRIMARY_SOURCE_MISSING", "ROUTINE_DISCOVERY_REVIEW", "NO_ACTION_DUPLICATE"] as const;
const TYPE_OPTIONS = ["PRIMARY_SOURCE_RETRIEVAL_REVIEW", "ISSUER_MAPPING_REVIEW", "ASSET_MAPPING_REVIEW", "CORRECTION_LINEAGE_REVIEW", "RETRACTION_REVIEW", "SOURCE_CONFLICT_REVIEW", "ORIGIN_GROUP_REVIEW", "RIGHTS_APPROVAL_REVIEW", "JURISDICTION_REVIEW", "LIFECYCLE_REVIEW", "DUPLICATE_NO_ACTION", "BLOCKED_UNSUPPORTED_CORROBORATION", "NON_AUTHORITATIVE_REVIEW_COMPLETE"] as const;
const STATUS_LABELS: Readonly<Record<(typeof STATUS_OPTIONS)[number], string>> = Object.freeze({ OPEN: "Open review", BLOCKED: "Blocked", NO_ACTION: "No new queue action", RESOLVED_NON_AUTHORITATIVE: "Review completed; non-authoritative", SUPERSEDED: "Historical snapshot superseded", RETRACTED: "Retracted; not active" });
const PRIORITY_LABELS: Readonly<Record<(typeof PRIORITY_OPTIONS)[number], string>> = Object.freeze({ URGENT_RETRACTION_REVIEW: "Urgent retraction review", URGENT_CORRECTION_REVIEW: "Urgent correction review", CONFLICT_REVIEW: "Conflict review", BLOCKED_RIGHTS: "Blocked by rights approval", JURISDICTION_UNKNOWN: "Jurisdiction review", MAPPING_REQUIRED: "Mapping review required", PRIMARY_SOURCE_MISSING: "Primary source missing", ROUTINE_DISCOVERY_REVIEW: "Routine discovery review", NO_ACTION_DUPLICATE: "No new action for duplicate" });
const TYPE_LABELS: Readonly<Record<(typeof TYPE_OPTIONS)[number], string>> = Object.freeze({ PRIMARY_SOURCE_RETRIEVAL_REVIEW: "Primary source review", ISSUER_MAPPING_REVIEW: "Issuer mapping review", ASSET_MAPPING_REVIEW: "Asset mapping review", CORRECTION_LINEAGE_REVIEW: "Correction lineage review", RETRACTION_REVIEW: "Retraction review", SOURCE_CONFLICT_REVIEW: "Source conflict review", ORIGIN_GROUP_REVIEW: "Origin group review", RIGHTS_APPROVAL_REVIEW: "Rights approval review", JURISDICTION_REVIEW: "Jurisdiction review", LIFECYCLE_REVIEW: "Lifecycle review", DUPLICATE_NO_ACTION: "Duplicate candidate", BLOCKED_UNSUPPORTED_CORROBORATION: "Corroboration unavailable", NON_AUTHORITATIVE_REVIEW_COMPLETE: "Non-authoritative review" });

export type EvidenceQueueFilters = Readonly<{ status?: string; priority?: string; type?: string; query?: string }>;

function matches(item: EvidenceReviewQueueViewModelItem, query: string): boolean {
  if (!query) return true;
  const terms = [item.title, item.typeLabel, item.statusLabel, item.priorityLabel, item.nextActionLabel, item.jurisdictionLabel, item.sourceStrengthLabel, ...item.reasonLabels, ...item.sourceFamilies].join(" ").toLowerCase();
  return terms.includes(query);
}

/** Presentation-only filtering; invalid selections degrade to unfiltered values. */
export function filterEvidenceReviewItems(items: readonly EvidenceReviewQueueViewModelItem[], filters: EvidenceQueueFilters): readonly EvidenceReviewQueueViewModelItem[] {
  const status = typeof filters.status === "string" && STATUS_OPTIONS.some(value => value === filters.status) ? filters.status : "";
  const priority = typeof filters.priority === "string" && PRIORITY_OPTIONS.some(value => value === filters.priority) ? filters.priority : "";
  const type = typeof filters.type === "string" && TYPE_OPTIONS.some(value => value === filters.type) ? filters.type : "";
  const query = typeof filters.query === "string" ? filters.query.slice(0, 120).replace(/[\p{Cc}\p{Cf}]/gu, "").trim().toLowerCase() : "";
  return items.filter(item => (!status || item.status === status) && (!priority || item.operationalPriority === priority) && (!type || item.reviewType === type) && matches(item, query));
}

function Summary({ model }: Props) {
  const counts = [
    ["Queue items", model.summary.totalItems],
    ["Open review", model.summary.open],
    ["Blocked", model.summary.blocked],
    ["No new action", model.summary.noAction],
    ["Non-authoritative review complete", model.summary.resolvedNonAuthoritative],
    ["Superseded snapshots", model.summary.superseded],
    ["Correction review", model.summary.correctionsRequiringReview],
    ["Retracted", model.summary.retracted],
    ["Conflicts", model.summary.conflicts],
    ["Mapping reviews", model.summary.mappingReviews],
    ["Primary-source reviews", model.summary.primarySourceReviews],
  ] as const;
  return <dl aria-label="Evidence review queue summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
    {counts.map(([label, count]) => <div key={label} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
      <dt className="text-xs font-medium text-[var(--muted)]">{label}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{count}</dd>
    </div>)}
  </dl>;
}

function QueueItem({ item, idPrefix }: { item: EvidenceReviewQueueViewModelItem; idPrefix?: string }) {
  const emphasis = item.retracted ? "border-rose-400/70 bg-rose-400/10" : item.correctionPresent ? "border-amber-300/70 bg-amber-300/10" : "border-[var(--border)] bg-[var(--panel)]";
  const headingId = idPrefix ? `queue-${idPrefix}-item-${item.publicKey}` : `queue-item-${item.publicKey}`;
  return <article aria-labelledby={headingId} className={`min-w-0 rounded-2xl border p-5 sm:p-6 ${emphasis}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="break-words text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{item.typeLabel}</p>
        <h3 id={headingId} className="mt-2 break-words text-lg font-semibold">{item.title}</h3>
      </div>
      <div className="flex max-w-full flex-wrap gap-2" role="group" aria-label="Item status and operational priority">
        <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold">{item.statusLabel}</span>
        <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs">{item.priorityLabel}</span>
      </div>
    </div>

    <div className="mt-4 flex flex-wrap gap-2 text-xs">
      {item.historical && <span className="rounded-md border border-sky-300/50 px-2.5 py-1">Historical snapshot</span>}
      {item.superseded && <span className="rounded-md border border-slate-300/60 px-2.5 py-1">Superseded; history retained</span>}
      {item.correctionPresent && <span className="rounded-md border border-amber-300/70 px-2.5 py-1">Correction material present</span>}
      {item.retracted && <span className="rounded-md border border-rose-300/70 px-2.5 py-1">Retracted; not active</span>}
    </div>

    <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.75fr)]">
      <section aria-label="Review reasons" className="min-w-0">
        <h4 className="text-sm font-semibold">Why this is in the queue</h4>
        {item.reasonLabels.length ? <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-6 text-[var(--muted)]">{item.reasonLabels.map(reason => <li className="break-words" key={reason}>{reason}</li>)}</ul> : <p className="mt-2 text-sm text-[var(--muted)]">Routine non-authoritative review.</p>}
        <p className="mt-4 text-sm"><span className="font-semibold">Next step: </span><span className="break-words text-[var(--muted)]">{item.nextActionLabel}</span></p>
      </section>
      <section aria-label="Source and timing summary" className="min-w-0 rounded-xl border border-[var(--border)] p-4">
        <h4 className="text-sm font-semibold">Source and cutoff</h4>
        <dl className="mt-3 grid min-w-0 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div><dt className="text-[var(--muted)]">Source family</dt><dd className="mt-1 break-words">{item.sourceFamilies.join(", ")}</dd></div>
          <div><dt className="text-[var(--muted)]">Source strength</dt><dd className="mt-1 break-words">{item.sourceStrengthLabel}</dd></div>
          <div><dt className="text-[var(--muted)]">Jurisdiction</dt><dd className="mt-1 break-words">{item.jurisdictionLabel}</dd></div>
          <div><dt className="text-[var(--muted)]">Origin groups</dt><dd className="mt-1">{item.originGroupCount} origin group(s); {item.syndicatedCopyCount} syndicated copy/copies</dd></div>
          <div><dt className="text-[var(--muted)]">Primary source</dt><dd className="mt-1">{item.primarySourcePresent ? "Present for review" : "Missing"}</dd></div>
          <div><dt className="text-[var(--muted)]">Evaluated as of (UTC)</dt><dd className="mt-1 break-all font-mono"><time dateTime={item.evaluatedAsOf}>{item.evaluatedAsOf}</time></dd></div>
        </dl>
      </section>
    </div>

    <details className="mt-5 border-t border-[var(--border)] pt-4">
      <summary className="w-fit cursor-pointer rounded px-1 py-1 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Evidence times and limits</summary>
      <dl className="mt-4 grid min-w-0 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
        {[["Published (UTC)", item.publicationAt], ["Discovered (UTC)", item.discoveredAt], ["Received (UTC)", item.receivedAt], ["Evaluated as of (UTC)", item.evaluatedAsOf]].map(([label, time]) => <div className="min-w-0" key={label}><dt className="text-[var(--muted)]">{label}</dt><dd className="mt-1 break-all font-mono"><time dateTime={time}>{time}</time></dd></div>)}
      </dl>
      <ul className="mt-4 space-y-1 text-xs leading-5 text-[var(--muted)]">{item.forbiddenConclusionLabels.map(label => <li key={label}>{label}</li>)}</ul>
    </details>
  </article>;
}

export function EvidenceReviewQueueWorkspace({ model, presentation = "DEFAULT", idPrefix }: Props) {
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterEvidenceReviewItems(model.items, { status, priority, type, query }), [model.items, status, priority, type, query]);
  const Root = presentation === "SYNTHETIC_OFFLINE_DEMO" ? "div" : "main";
  const filterId = (name: string) => idPrefix ? `queue-${idPrefix}-${name}` : `queue-${name}`;
  const sectionId = (name: string) => idPrefix ? `queue-${idPrefix}-${name}` : name;

  return <Root className={presentation === "SYNTHETIC_OFFLINE_DEMO" ? "w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8" : "mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8"}>
    {presentation === "DEFAULT" && <header className="mb-8 flex flex-wrap items-start justify-between gap-5 border-b border-[var(--border)] pb-6">
      <div className="min-w-0 max-w-3xl">
        <p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">MONEY MACHINE / INTELLIGENCE</p>
        <h1 className="mt-3 break-words text-3xl font-semibold tracking-tight sm:text-4xl">Evidence review queue</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">A read-only workspace for non-authoritative evidence candidates. A candidate is not a verified event or a confirmed purchase.</p>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-3">
        <nav aria-label="Workspace navigation"><Link href="/" className="rounded px-1 py-1 text-sm text-[var(--muted)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Home</Link></nav>
        <div className="flex flex-col items-start gap-2" aria-label="Production status">
          <span className="rounded-full border border-sky-300/60 bg-sky-300/10 px-3 py-1.5 text-xs font-bold tracking-wide">DISCOVERY ONLY</span>
          <span className="rounded-full border border-amber-300/70 bg-amber-300/10 px-3 py-1.5 text-xs font-bold tracking-wide">ACQUISITION BLOCKED</span>
        </div>
      </div>
    </header>}

    {presentation === "DEFAULT" && <section aria-labelledby={sectionId("verification-heading")} className="mb-8 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Evidence path</p><h2 id={sectionId("verification-heading")} className="mt-2 text-lg font-semibold">Review before any authority decision</h2></div><p className="max-w-xl text-sm leading-6 text-[var(--muted)]">Issuer and asset mapping, primary-source retrieval, lifecycle review and corroboration remain separate required steps.</p></div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {["Discovery", "Issuer mapping", "Asset mapping", "Primary source", "Correction review", "Corroboration", "Separate authority policy"].map((label, i) => <li key={label} className={`min-w-0 rounded-lg border p-3 text-sm ${i === 0 ? "border-sky-300/60 bg-sky-300/10" : "border-[var(--border)]"}`}><span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">{i === 0 ? "Current" : "Pending"}</span><span className="mt-1 block break-words font-medium">{label}</span></li>)}
      </ol>
      <p className="mt-4 text-xs leading-5 text-[var(--muted)]">Discovery, issuer disclosure and a filed claim do not by themselves establish underlying truth, completion, corroboration, recommendation or trading eligibility.</p>
    </section>}

    {presentation === "DEFAULT" && <section aria-label="Queue overview" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Queue snapshot</p><h2 className="mt-1 text-xl font-semibold">Review workload</h2></div><p className="text-xs text-[var(--muted)]">{model.generatedForAsOf ? <>Cutoff (UTC): <time dateTime={model.generatedForAsOf}>{model.generatedForAsOf}</time></> : "No evaluated snapshot is available."}</p></div>
      <Summary model={model} />
    </section>}

    {model.state === "BLOCKED" && <section role="status" aria-labelledby={sectionId("blocked-heading")} className="mt-8 rounded-2xl border border-amber-300/60 bg-amber-300/10 p-6 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-100">Production queue unavailable</p><h2 id={sectionId("blocked-heading")} className="mt-2 text-xl font-semibold">Acquisition and queue projection are blocked</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">No provider stack is selected and no persisted read model is available. No synthetic candidates are shown in production.</p>
      <ul className="mt-4 list-inside list-disc space-y-1 text-sm">{model.blockedReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
      <p className="mt-5 text-sm leading-6">Before an event could be considered authoritative, a separately reviewed source must be retrieved, issuer and asset mappings resolved, corrections reconciled, and the corroboration and authority policies evaluated.</p>
    </section>}

    {model.state === "HAS_REVIEW_ITEMS" && <section aria-labelledby={sectionId("items-heading")} className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Candidates</p><h2 id={sectionId("items-heading")} className="mt-1 text-xl font-semibold">Evidence items</h2></div><p className="text-sm text-[var(--muted)]" aria-live="polite">{filtered.length} of {model.items.length} items shown</p></div>
      <fieldset className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
        <legend className="px-2 text-sm font-semibold">Presentation filters</legend>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0"><label className="mb-1.5 block text-xs font-medium text-[var(--muted)]" htmlFor={filterId("status")}>Status</label><select id={filterId("status")} value={status} onChange={e => setStatus(e.target.value)} className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><option value="">All statuses</option>{STATUS_OPTIONS.map(value => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</select></div>
          <div className="min-w-0"><label className="mb-1.5 block text-xs font-medium text-[var(--muted)]" htmlFor={filterId("priority")}>Operational priority</label><select id={filterId("priority")} value={priority} onChange={e => setPriority(e.target.value)} className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><option value="">All priorities</option>{PRIORITY_OPTIONS.map(value => <option key={value} value={value}>{PRIORITY_LABELS[value]}</option>)}</select></div>
          <div className="min-w-0"><label className="mb-1.5 block text-xs font-medium text-[var(--muted)]" htmlFor={filterId("type")}>Review type</label><select id={filterId("type")} value={type} onChange={e => setType(e.target.value)} className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><option value="">All review types</option>{TYPE_OPTIONS.map(value => <option key={value} value={value}>{TYPE_LABELS[value]}</option>)}</select></div>
          <div className="min-w-0"><label className="mb-1.5 block text-xs font-medium text-[var(--muted)]" htmlFor={filterId("search")}>Search safe labels</label><input id={filterId("search")} type="search" maxLength={120} value={query} onChange={e => setQuery(e.target.value.slice(0, 120))} placeholder="Type, reason or source family" className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm placeholder:text-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" /></div>
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Filters change only what is shown. Corrections and retractions are included by default; queue status and source material are never changed.</p>
      </fieldset>
      {filtered.length === 0 ? <div role="status" className="mt-5 rounded-2xl border border-[var(--border)] p-8 text-center"><h3 className="font-semibold">No items match these filters</h3><p className="mt-2 text-sm text-[var(--muted)]">Clear or change the presentation filters to view the available cutoff-bound snapshots.</p></div> : <div className="mt-5 space-y-4">{filtered.map(item => <QueueItem key={item.publicKey} item={item} idPrefix={idPrefix} />)}</div>}
    </section>}

    {model.state === "EMPTY" && <section role="status" className="mt-8 rounded-2xl border border-[var(--border)] p-8 text-center"><h2 className="text-lg font-semibold">No evidence-review items</h2><p className="mt-2 text-sm text-[var(--muted)]">{model.emptyState}</p></section>}

    {presentation === "DEFAULT" && <footer className="mt-10 border-t border-[var(--border)] pt-5 text-xs leading-5 text-[var(--muted)]">This workspace is not an event-authority, recommendation, signal or trading interface. A queue item records review work only; it does not verify its underlying claim.</footer>}
  </Root>;
}
