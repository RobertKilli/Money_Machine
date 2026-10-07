"use client";

import { useEffect, useState } from "react";
import { isLifecycleStatus } from "@/domain/intelligence/ingestion-lifecycle-contract";
import type { SecObservationReadModel } from "@/domain/intelligence/sec-edgar-8k-observation-read-model";

export type SecObservationPanelState =
  | Readonly<{ kind: "LOADING" }>
  | Readonly<{ kind: "FORBIDDEN" }>
  | Readonly<{ kind: "READ_ERROR" }>
  | Readonly<{ kind: "DATA"; model: SecObservationReadModel }>;

export type SecObservationFetch = (input: string, init?: RequestInit) => Promise<Response>;

export async function loadSecObservationPanelState(fetcher: SecObservationFetch): Promise<SecObservationPanelState> {
  try {
    const response = await fetcher("/api/admin/intelligence/sec-edgar-8k-observations", { cache: "no-store" });
    if (response.status === 403) return Object.freeze({ kind: "FORBIDDEN" });
    if (!response.ok) return Object.freeze({ kind: "READ_ERROR" });
    const body: unknown = await response.json();
    if (!isReadModel(body)) return Object.freeze({ kind: "READ_ERROR" });
    return Object.freeze({ kind: "DATA", model: body });
  } catch {
    return Object.freeze({ kind: "READ_ERROR" });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isSources(value: unknown, required: boolean): value is readonly string[] {
  return Array.isArray(value) && (!required || value.length > 0) && value.every(nonEmptyString);
}

function isField(value: unknown, required: boolean): value is { value: string | null; sources: readonly string[] } {
  if (!isRecord(value) || !(value.value === null || nonEmptyString(value.value)) || !isSources(value.sources, required)) return false;
  return value.value === null ? !required : value.sources.length > 0;
}

function isObservation(value: unknown): value is SecObservationReadModel["observations"][number] {
  if (!isRecord(value)) return false;
  if (![value.requestId, value.attemptId, value.sourceObservationId].every(nonEmptyString) || value.lifecycleStatus !== "COMPLETED") return false;
  if (!isField(value.cik, true) || !/^\d{10}$/.test(value.cik.value as string)) return false;
  if (!isField(value.accession, true) || !/^\d{10}-\d{2}-\d{6}$/.test(value.accession.value as string)) return false;
  if (!isField(value.form, true) || !/^[A-Z0-9][A-Z0-9/-]{0,15}$/.test(value.form.value as string)) return false;
  if (!isField(value.filingDate, true) || !/^\d{4}-\d{2}-\d{2}$/.test(value.filingDate.value as string)) return false;
  if (!isField(value.acceptanceDateTime, false) || !isField(value.retrievedAt, true)) return false;
  if (value.authority !== "NON_AUTHORITATIVE_SOURCE_OBSERVATION" || value.primaryDocumentContent !== "NOT_RETRIEVED") return false;
  if (!isRecord(value.eventDate) || value.eventDate.status !== "UNKNOWN" || value.eventDate.value !== null || !isSources(value.eventDate.sources, false) || value.eventDate.sources.length !== 0) return false;
  return true;
}

function isIncompleteAttempt(value: unknown): value is SecObservationReadModel["incomplete"][number] {
  if (!isRecord(value) || !nonEmptyString(value.requestId)) return false;
  if (!(value.attemptId === null || nonEmptyString(value.attemptId))) return false;
  return isLifecycleStatus(value.lifecycleStatus);
}

function isReadModel(value: unknown): value is SecObservationReadModel {
  if (!isRecord(value) || !Array.isArray(value.observations) || !Array.isArray(value.incomplete)) return false;
  if (!value.observations.every(isObservation) || !value.incomplete.every(isIncompleteAttempt)) return false;
  const observations = value.observations as SecObservationReadModel["observations"];
  const incomplete = value.incomplete as SecObservationReadModel["incomplete"];
  const identityKeys = observations.map(item => JSON.stringify([item.requestId, item.attemptId, item.sourceObservationId]));
  if (new Set(identityKeys).size !== identityKeys.length) return false;

  if (value.status === "NO_RECORDED_OBSERVATIONS") return observations.length === 0 && incomplete.length === 0;
  if (value.status === "INGESTION_INCOMPLETE") return observations.length === 0 && incomplete.length > 0;
  if (value.status === "OBSERVATIONS_AVAILABLE") return observations.length > 0;
  return false;
}

const statusLabels = {
  NO_RECORDED_OBSERVATIONS: "No recorded observations",
  INGESTION_INCOMPLETE: "Ingestion incomplete",
  OBSERVATIONS_AVAILABLE: "Observations available",
} as const;

function Field({ label, field }: { label: string; field: { value: string | null; sources: readonly string[] } }) {
  return <div className="min-w-0"><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</dt><dd className="mt-1 break-words text-sm">{field.value ?? "Unknown"}</dd><dd className="mt-1 text-xs text-[var(--muted)]">{field.sources.length ? <>Source: {field.sources.map((source, index) => <span key={`${source}-${index}`} className="block break-all font-mono">{source}</span>)}</> : "No field source recorded"}</dd></div>;
}

function ObservationCard({ observation }: { observation: SecObservationReadModel["observations"][number] }) {
  return <article className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-5" aria-label={`Filing ${observation.accession.value}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="font-mono text-xs text-[var(--muted)]">{observation.accession.value}</p><h3 className="mt-1 text-lg font-semibold">{observation.form.value} · {observation.cik.value}</h3></div>
      <span className="rounded-full border border-[var(--accent)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">{observation.lifecycleStatus}</span>
    </div>
    <p className="mt-4 rounded-lg border border-[var(--accent)]/40 bg-[var(--panel)] px-3 py-2 text-xs font-semibold tracking-wide text-[var(--accent)]">NON-AUTHORITATIVE SOURCE OBSERVATION</p>
    <dl className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="CIK" field={observation.cik} />
      <Field label="Accession" field={observation.accession} />
      <Field label="Form" field={observation.form} />
      <Field label="Filing date" field={observation.filingDate} />
      <Field label="Acceptance time" field={observation.acceptanceDateTime} />
      <Field label="Retrieved time" field={observation.retrievedAt} />
    </dl>
    <div className="mt-5 grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
      <p className="text-sm"><span className="text-[var(--muted)]">Event date:</span> <strong>Unknown</strong></p>
      <p className="text-sm"><span className="text-[var(--muted)]">Primary document content:</span> <strong>Not retrieved</strong></p>
    </div>
  </article>;
}

export function SecObservationPanelView({ state }: { state: SecObservationPanelState }) {
  if (state.kind === "LOADING") return <section aria-live="polite" className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6"><h2 className="text-lg font-semibold">Loading observations</h2><p className="mt-2 text-sm text-[var(--muted)]">Reading the admin observation endpoint…</p></section>;
  if (state.kind === "FORBIDDEN") return <section role="alert" className="mt-8 rounded-2xl border border-amber-400/60 bg-[var(--panel)] p-6"><h2 className="text-lg font-semibold">Access denied</h2><p className="mt-2 text-sm text-[var(--muted)]">Administrator access is required to read filing observations.</p></section>;
  if (state.kind === "READ_ERROR") return <section role="alert" className="mt-8 rounded-2xl border border-rose-400/60 bg-[var(--panel)] p-6"><h2 className="text-lg font-semibold">Observation read unavailable</h2><p className="mt-2 text-sm text-[var(--muted)]">The read failed. No conclusion about filing activity can be drawn.</p></section>;

  const { model } = state;
  const hasObservations = model.observations.length > 0;
  const hasIncomplete = model.incomplete.length > 0;
  const empty = model.status === "NO_RECORDED_OBSERVATIONS" && !hasObservations && !hasIncomplete;
  return <section className="mt-8 space-y-5" aria-label="SEC filing observation results">
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <h2 className="text-lg font-semibold">{statusLabels[model.status]}</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">SEC filing metadata is a non-authoritative source observation. Missing data does not mean that no filing exists.</p>
      <p className="mt-2 text-xs text-[var(--muted)]">Event date is unknown. Primary document content has not been retrieved.</p>
    </div>
    {empty && <p className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 text-sm">No filing observations are recorded. This is not a negative filing determination.</p>}
    {hasObservations && <div className="space-y-4">{model.observations.map(observation => <ObservationCard key={`${observation.requestId}-${observation.attemptId}-${observation.sourceObservationId}`} observation={observation} />)}</div>}
    {hasIncomplete && <section className="rounded-2xl border border-amber-400/50 bg-[var(--panel)] p-5" aria-label="Incomplete ingestion attempts"><h3 className="font-semibold">Incomplete ingestion attempts</h3><p className="mt-1 text-sm text-[var(--muted)]">These attempts remain visible alongside any completed observations.</p><ul className="mt-3 space-y-2">{model.incomplete.map((attempt, index) => <li key={`${attempt.requestId}-${attempt.attemptId ?? "none"}-${index}`} className="rounded-lg border border-[var(--border)] p-3 text-sm"><span className="font-mono">Request {attempt.requestId}</span><span className="mx-2 text-[var(--muted)]">·</span><span>{attempt.lifecycleStatus}</span>{attempt.attemptId && <span className="ml-2 break-all font-mono text-xs text-[var(--muted)]">Attempt {attempt.attemptId}</span>}</li>)}</ul></section>}
  </section>;
}

export function SecObservationPanel() {
  const [state, setState] = useState<SecObservationPanelState>({ kind: "LOADING" });
  useEffect(() => { let active = true; void loadSecObservationPanelState(fetch).then(result => { if (active) setState(result); }); return () => { active = false; }; }, []);
  return <SecObservationPanelView state={state} />;
}
