"use client";

import { useMemo, useState } from "react";
import type { EvidenceReviewQueueV2ViewModel, EvidenceReviewQueueV2ViewModelItem } from "@/application/intelligence/project-event-intelligence-evidence-review-queue-v2-view-model";

type Props = Readonly<{ model: EvidenceReviewQueueV2ViewModel; idPrefix: "queue-v2-v1" | "queue-v2-v2" | "queue-v2-compare-v2" | "input-lab-v2" }>;
const STATUSES = ["OPEN", "BLOCKED"] as const;
const PRIORITIES = ["URGENT_RETRACTION_REVIEW", "URGENT_CORRECTION_REVIEW", "CONFLICT_REVIEW", "BLOCKED_RIGHTS", "JURISDICTION_UNKNOWN", "MAPPING_REQUIRED", "PRIMARY_SOURCE_MISSING", "ROUTINE_DISCOVERY_REVIEW", "NO_ACTION_DUPLICATE"] as const;
const TYPES = ["PRIMARY_SOURCE_RETRIEVAL_REVIEW", "ISSUER_MAPPING_REVIEW", "ASSET_MAPPING_REVIEW", "CORRECTION_LINEAGE_REVIEW", "RETRACTION_REVIEW", "SOURCE_CONFLICT_REVIEW", "ORIGIN_GROUP_REVIEW", "RIGHTS_APPROVAL_REVIEW", "JURISDICTION_REVIEW", "LIFECYCLE_REVIEW", "DUPLICATE_NO_ACTION", "BLOCKED_UNSUPPORTED_CORROBORATION", "NON_AUTHORITATIVE_REVIEW_COMPLETE"] as const;
const STATUS_LABELS: Readonly<Record<(typeof STATUSES)[number], string>> = Object.freeze({ OPEN: "Open review", BLOCKED: "Blocked" });
const PRIORITY_LABELS: Readonly<Record<(typeof PRIORITIES)[number], string>> = Object.freeze({ URGENT_RETRACTION_REVIEW: "Urgent retraction review", URGENT_CORRECTION_REVIEW: "Urgent correction review", CONFLICT_REVIEW: "Conflict review", BLOCKED_RIGHTS: "Blocked by rights approval", JURISDICTION_UNKNOWN: "Jurisdiction review", MAPPING_REQUIRED: "Mapping review required", PRIMARY_SOURCE_MISSING: "Primary source missing", ROUTINE_DISCOVERY_REVIEW: "Routine discovery review", NO_ACTION_DUPLICATE: "No new action for duplicate" });
const TYPE_LABELS: Readonly<Record<(typeof TYPES)[number], string>> = Object.freeze({ PRIMARY_SOURCE_RETRIEVAL_REVIEW: "Primary source review", ISSUER_MAPPING_REVIEW: "Issuer mapping review", ASSET_MAPPING_REVIEW: "Asset mapping review", CORRECTION_LINEAGE_REVIEW: "Correction lineage review", RETRACTION_REVIEW: "Retraction review", SOURCE_CONFLICT_REVIEW: "Source conflict review", ORIGIN_GROUP_REVIEW: "Origin group review", RIGHTS_APPROVAL_REVIEW: "Rights approval review", JURISDICTION_REVIEW: "Jurisdiction review", LIFECYCLE_REVIEW: "Lifecycle review", DUPLICATE_NO_ACTION: "Duplicate candidate", BLOCKED_UNSUPPORTED_CORROBORATION: "Corroboration unavailable", NON_AUTHORITATIVE_REVIEW_COMPLETE: "Non-authoritative review" });

function normalize(value: string): string { return value.slice(0, 120).replace(/[\p{Cc}\p{Cf}]/gu, "").trim().toLowerCase(); }
function matches(item: EvidenceReviewQueueV2ViewModelItem, query: string): boolean { return !query || [item.title, item.typeLabel, item.statusLabel, item.priorityLabel, item.nextActionLabel, ...item.reasonLabels].join(" ").toLowerCase().includes(query); }

export function EvidenceReviewQueueV2Workspace({ model, idPrefix }: Props) {
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const query = normalize(search);
    return model.items.filter(item => (!status || item.status === status) && (!priority || item.operationalPriority === priority) && (!type || item.reviewType === type) && matches(item, query));
  }, [model.items, status, priority, type, search]);
  const labels = [status ? `Status: ${STATUS_LABELS[status as (typeof STATUSES)[number]]}` : null, priority ? `Priority: ${PRIORITY_LABELS[priority as (typeof PRIORITIES)[number]]}` : null, type ? `Review type: ${TYPE_LABELS[type as (typeof TYPES)[number]]}` : null, normalize(search) ? `Search: ${normalize(search)}` : null].filter((label): label is string => label !== null);
  const reset = () => { setStatus(""); setPriority(""); setType(""); setSearch(""); };
  const fieldId = (name: string) => `${idPrefix}-${name}`;

  return <section aria-label="V2 read-only workspace" className="w-full min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">V2 candidates</p><h3 id={`${idPrefix}-items-heading`} className="mt-1 text-xl font-semibold">Evidence items</h3></div>
      <p className="text-sm text-[var(--muted)]" aria-live="polite">{filtered.length} shown of {model.summary.totalItems} total</p>
    </div>
    <fieldset className="mt-5 min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
      <legend className="px-2 text-sm font-semibold">Presentation filters</legend>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0"><label className="mb-1.5 block text-xs font-medium text-[var(--muted)]" htmlFor={fieldId("status")}>Status</label><select id={fieldId("status")} value={status} onChange={event => setStatus(event.target.value)} className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">All statuses</option>{STATUSES.map(value => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</select></div>
        <div className="min-w-0"><label className="mb-1.5 block text-xs font-medium text-[var(--muted)]" htmlFor={fieldId("priority")}>Operational priority</label><select id={fieldId("priority")} value={priority} onChange={event => setPriority(event.target.value)} className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">All priorities</option>{PRIORITIES.map(value => <option key={value} value={value}>{PRIORITY_LABELS[value]}</option>)}</select></div>
        <div className="min-w-0"><label className="mb-1.5 block text-xs font-medium text-[var(--muted)]" htmlFor={fieldId("type")}>Review type</label><select id={fieldId("type")} value={type} onChange={event => setType(event.target.value)} className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">All review types</option>{TYPES.map(value => <option key={value} value={value}>{TYPE_LABELS[value]}</option>)}</select></div>
        <div className="min-w-0"><label className="mb-1.5 block text-xs font-medium text-[var(--muted)]" htmlFor={fieldId("search")}>Search safe labels</label><input id={fieldId("search")} type="search" maxLength={120} value={search} onChange={event => setSearch(event.target.value.slice(0, 120))} className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" /></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
        <p className="text-xs leading-5 text-[var(--muted)]" aria-live="polite">{labels.length ? `Active filters: ${labels.join(" · ")}` : "No active filters."}</p>
        {labels.length > 0 && <button type="button" onClick={reset} className="rounded px-2 py-1 text-sm font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Reset filters</button>}
      </div>
    </fieldset>
    {filtered.length === 0 ? <div role="status" className="mt-5 rounded-2xl border border-[var(--border)] p-8 text-center"><h4 className="font-semibold">No items match these filters</h4><p className="mt-2 text-sm text-[var(--muted)]">Change or reset the local presentation filters to show this V2 queue.</p><button type="button" onClick={reset} className="mt-4 rounded px-2 py-1 text-sm font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Reset filters</button></div> : <div className="mt-5 space-y-4">{filtered.map(item => <article key={item.publicKey} aria-labelledby={`${idPrefix}-${item.publicKey}`} className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 sm:p-6">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="break-words text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{item.typeLabel}</p><h4 id={`${idPrefix}-${item.publicKey}`} className="mt-2 break-words text-lg font-semibold">{item.title}</h4></div><div className="flex max-w-full flex-wrap gap-2" role="group" aria-label="Status and operational priority"><span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold">{item.statusLabel}</span><span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs">{item.priorityLabel}</span></div></div>
      <span className="mt-4 inline-block rounded-md border border-sky-300/50 px-2.5 py-1 text-xs">Historical snapshot</span>
      {item.reasonLabels.length > 0 && <section aria-label="Review blockers" className="mt-4"><h5 className="text-sm font-semibold">Review blockers</h5><ul className="mt-2 list-inside list-disc space-y-1 break-words text-sm text-[var(--muted)]">{item.reasonLabels.map(reason => <li key={reason}>{reason}</li>)}</ul></section>}
      <p className="mt-4 break-words text-sm"><span className="font-semibold">Next step: </span><span className="text-[var(--muted)]">{item.nextActionLabel}</span></p>
      <dl className="mt-4 grid min-w-0 gap-3 text-xs sm:grid-cols-2"><div className="min-w-0"><dt className="text-[var(--muted)]">Published (UTC)</dt><dd className="mt-1 break-all font-mono">{item.publicationAt}</dd></div><div className="min-w-0"><dt className="text-[var(--muted)]">Cutoff (UTC)</dt><dd className="mt-1 break-all font-mono">{item.evaluatedAsOf}</dd></div></dl>
    </article>)}</div>}
    <p className="mt-5 text-xs leading-5 text-[var(--muted)]">Filters affect only this presentation. V2 is an opt-in synthetic evaluator result; OPEN is not approval, and queue priority is not investment ranking.</p>
  </section>;
}
