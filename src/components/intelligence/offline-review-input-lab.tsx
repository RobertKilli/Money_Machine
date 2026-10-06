"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { EvidenceReviewQueueV2Workspace } from "@/components/intelligence/evidence-review-queue-v2-workspace";
import {
  defaultOfflineInputLabInput,
  offlineInputLabFieldName,
  type OfflineInputLabInput,
  type OfflineInputLabRecord,
} from "@/application/intelligence/offline-input-lab-contract";
import { evaluateOfflineInputLabAction, type OfflineInputLabActionResult } from "@/app/intelligence/events/review/offline-demo/input-lab/actions";
import type { OfflineInputLabResult } from "@/application/intelligence/run-offline-review-input-lab";

const EVENT_HINTS = [
  ["PURCHASE_INTENT", "Purchase intent"],
  ["BOARD_AUTHORIZATION", "Board authorization"],
  ["BINDING_AGREEMENT", "Binding agreement"],
  ["COMPLETED_PURCHASE", "Completed purchase"],
  ["TREASURY_POLICY", "Treasury policy change"],
  ["CORRECTION_AMENDMENT", "Correction / amendment"],
] as const;
const JURISDICTIONS = ["US", "GB", "AU", "UNKNOWN"] as const;
const FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  form: "Input",
  cutoff: "Felles cutoff",
});

function getError(result: OfflineInputLabActionResult | null, field: string): string | undefined {
  return result?.status === "INVALID" ? result.errors.find(error => error.field === field || error.field.startsWith(`${field}.`))?.message : undefined;
}

function RowEditor({ index, row, disabled, onChange, errors }: {
  index: number;
  row: OfflineInputLabRecord;
  disabled: boolean;
  onChange: (index: number, field: keyof OfflineInputLabRecord, value: string | boolean) => void;
  errors: OfflineInputLabActionResult | null;
}) {
  const field = (name: keyof OfflineInputLabRecord) => offlineInputLabFieldName(index, name as Parameters<typeof offlineInputLabFieldName>[1]);
  const profileId = `input-lab-${index}-profile`;
  const includeId = `input-lab-${index}-included`;
  const headlineId = `input-lab-${index}-headline`;
  const jurisdictionId = `input-lab-${index}-jurisdiction`;
  const eventHintId = `input-lab-${index}-event-hint`;
  const errorBase = `records.${index}`;
  const isCorrection = row.profile === "unresolved-correction";
  const hintOptions = isCorrection ? EVENT_HINTS.filter(([value]) => value === "CORRECTION_AMENDMENT") : EVENT_HINTS.filter(([value]) => value !== "CORRECTION_AMENDMENT");
  const errorText = (name: string) => getError(errors, `${errorBase}.${name}`);
  const discoveryOutcome = errors?.status === "EVALUATED" && errors.result.status === "EVALUATED"
    ? errors.result.outcomes.find(outcome => outcome.slot === index && outcome.state === "DISCOVERY_REJECTED")
    : undefined;
  const timestampFields = [
    ["publishedAt", "Publiseringstid"],
    ["discoveredAt", "Discovery-tid"],
    ["receivedAt", "Mottakstid"],
    ["recordedAt", "Registreringstid"],
  ] as const;

  return <fieldset className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
    <legend className="px-2 text-sm font-semibold">Syntetisk record {index + 1}</legend>
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <div className="min-w-0">
        <label htmlFor={profileId} className="mb-1 block text-sm font-medium">Scenario-profil</label>
        <select id={profileId} name={field("profile")} value={row.profile} onChange={event => onChange(index, "profile", event.target.value)} aria-invalid={Boolean(errorText("profile"))} aria-describedby={errorText("profile") ? `${profileId}-error` : undefined} disabled={disabled} className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm">
          <option value="issuer-mapping">Mapping</option><option value="rights-blocked">Rights</option><option value="unresolved-correction">Correction</option>
        </select>
        <p className="mt-1 text-xs text-[var(--muted)]">Source type and routing flags remain fixed by this server profile.</p>
        {errorText("profile") && <p id={`${profileId}-error`} className="mt-1 text-sm text-rose-300">{errorText("profile")}</p>}
      </div>
      <div className="min-w-0">
        <label htmlFor={includeId} className="mb-1 block text-sm font-medium">Med i denne kjøringen?</label>
        <select id={includeId} name={field("included")} value={row.included ? "yes" : "no"} onChange={event => onChange(index, "included", event.target.value === "yes")} aria-invalid={Boolean(errorText("included"))} aria-describedby={errorText("included") ? `${includeId}-error` : undefined} disabled={disabled} className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm"><option value="yes">Inkluder</option><option value="no">Utelat</option></select>
        {errorText("included") && <p id={`${includeId}-error`} className="mt-1 text-sm text-rose-300">{errorText("included")}</p>}
      </div>
      <div className="min-w-0 sm:col-span-2">
        <label htmlFor={headlineId} className="mb-1 block text-sm font-medium">Syntetisk overskrift (maks. 160 UTF-16-kodeenheter)</label>
        <input id={headlineId} name={field("headline")} type="text" maxLength={160} value={row.headline} onChange={event => onChange(index, "headline", event.target.value)} aria-invalid={Boolean(errorText("headline"))} aria-describedby={`${headlineId}-help${errorText("headline") ? ` ${headlineId}-error` : ""}`} disabled={disabled} className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm" />
        <p id={`${headlineId}-help`} className="mt-1 text-xs text-[var(--muted)]">Enhver tekst du skriver behandles bare som syntetisk input.</p>
        {errorText("headline") && <p id={`${headlineId}-error`} className="mt-1 text-sm text-rose-300">{errorText("headline")}</p>}
      </div>
      {timestampFields.map(([name, label]) => {
        const id = `input-lab-${index}-${name}`;
        return <div key={name} className="min-w-0">
          <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
          <input id={id} name={field(name)} type="text" inputMode="text" maxLength={24} value={row[name]} onChange={event => onChange(index, name, event.target.value)} aria-invalid={Boolean(errorText(name))} aria-describedby={`${id}-help${errorText(name) ? ` ${id}-error` : ""}`} disabled={disabled} className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 font-mono text-xs" />
          <p id={`${id}-help`} className="mt-1 text-xs text-[var(--muted)]">UTC: YYYY-MM-DDTHH:mm:ss.sssZ</p>
          {errorText(name) && <p id={`${id}-error`} className="mt-1 text-sm text-rose-300">{errorText(name)}</p>}
        </div>;
      })}
      <div className="min-w-0">
        <label htmlFor={jurisdictionId} className="mb-1 block text-sm font-medium">Syntetisk jurisdiksjon</label>
        <select id={jurisdictionId} name={field("jurisdiction")} value={row.jurisdiction} onChange={event => onChange(index, "jurisdiction", event.target.value)} aria-invalid={Boolean(errorText("jurisdiction"))} aria-describedby={errorText("jurisdiction") ? `${jurisdictionId}-error` : undefined} disabled={disabled} className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm">{JURISDICTIONS.map(value => <option key={value} value={value}>{value}</option>)}</select>
        {errorText("jurisdiction") && <p id={`${jurisdictionId}-error`} className="mt-1 text-sm text-rose-300">{errorText("jurisdiction")}</p>}
      </div>
      <div className="min-w-0">
        <label htmlFor={eventHintId} className="mb-1 block text-sm font-medium">Syntetisk event-hint</label>
        <select id={eventHintId} name={field("eventHint")} value={row.eventHint} onChange={event => onChange(index, "eventHint", event.target.value)} aria-invalid={Boolean(errorText("eventHint"))} aria-describedby={errorText("eventHint") ? `${eventHintId}-error` : undefined} disabled={disabled} className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm">{hintOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        {errorText("eventHint") && <p id={`${eventHintId}-error`} className="mt-1 text-sm text-rose-300">{errorText("eventHint")}</p>}
      </div>
    </div>
    {discoveryOutcome && <p role="status" className="mt-4 rounded-lg border border-amber-300/50 bg-amber-300/5 p-3 text-sm">{discoveryOutcome.rejectionCode}: parentens discovery-API avviste denne recorden. Kontroller publiseringstid, discovery-tid, mottakstid, registreringstid og felles cutoff; ingen kandidat ble komponert for recorden.</p>}
  </fieldset>;
}

export function OfflineReviewInputLab() {
  const [input, setInput] = useState<OfflineInputLabInput>(() => defaultOfflineInputLabInput());
  const [response, setResponse] = useState<OfflineInputLabActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const fieldError = (field: string) => getError(response, field);

  const updateRow = (index: number, field: keyof OfflineInputLabRecord, value: string | boolean) => {
    setInput(current => {
      const records = current.records.map((record, rowIndex) => {
        if (rowIndex !== index) return record;
        const next = { ...record, [field]: value };
        if (field === "profile") {
          const profile = value as OfflineInputLabRecord["profile"];
          if (profile === "unresolved-correction") next.eventHint = "CORRECTION_AMENDMENT";
          else if (next.eventHint === "CORRECTION_AMENDMENT") next.eventHint = "PURCHASE_INTENT";
        }
        return Object.freeze(next);
      });
      return Object.freeze({ ...current, records: Object.freeze(records) });
    });
    setResponse(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    const formData = new FormData(event.currentTarget);
    formData.set("version", input.version);
    formData.set("cutoff", input.cutoff);
    setResponse(null);
    startTransition(async () => {
      try {
        const result = await evaluateOfflineInputLabAction(formData);
        setResponse(result);
      } finally {
        inFlight.current = false;
      }
    });
  };

  const reset = () => {
    setInput(defaultOfflineInputLabInput());
    setResponse(null);
  };

  return <>
    <form onSubmit={submit} className="mt-6 space-y-5" aria-describedby="input-lab-form-note">
      <input type="hidden" name="version" value={input.version} readOnly />
      <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
        <label htmlFor="input-lab-cutoff" className="mb-1 block text-sm font-semibold">Felles evaluering-cutoff (UTC)</label>
        <input id="input-lab-cutoff" name="cutoff" type="text" maxLength={24} value={input.cutoff} onChange={event => { setInput(current => Object.freeze({ ...current, cutoff: event.target.value })); setResponse(null); }} aria-invalid={Boolean(fieldError("cutoff"))} aria-describedby={`input-lab-cutoff-help${fieldError("cutoff") ? " input-lab-cutoff-error" : ""}`} disabled={pending} className="w-full max-w-xl rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-sm" />
        <p id="input-lab-cutoff-help" className="mt-1 text-xs text-[var(--muted)]">Eksakt UTC-format: YYYY-MM-DDTHH:mm:ss.sssZ. Parentens discovery-validering avgjør om records er kjent innen cutoff.</p>
        {fieldError("cutoff") && <p id="input-lab-cutoff-error" className="mt-1 text-sm text-rose-300">{fieldError("cutoff")}</p>}
      </section>
      {input.records.map((record, index) => <RowEditor key={index} index={index} row={record} disabled={pending} onChange={updateRow} errors={response} />)}
      <p id="input-lab-form-note" className="text-xs leading-5 text-[var(--muted)]">Maksimalt tre slots og 16 KiB applikasjonsinput. Server Action-runtime parser requesten før applikasjonskontrollen; Next.js sin eksisterende request-grense er 1 MiB. Denne laboratoriegrensen hindrer at større application-input når fixture- og domain-kjeden.</p>
      {response?.status === "INVALID" && <section role="alert" className="rounded-xl border border-rose-300/60 bg-rose-300/5 p-4"><h2 className="font-semibold">Input ble avvist før evaluering</h2><ul className="mt-2 list-inside list-disc text-sm">{response.errors.map((error, index) => <li key={`${error.field}-${index}`}><span className="font-semibold">{FIELD_LABELS[error.field] ?? error.field}:</span> {error.message}</li>)}</ul></section>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="rounded-lg border border-amber-200/70 bg-amber-200/10 px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60">{pending ? "Evaluerer …" : "Kjør syntetisk evaluering"}</button>
        <button type="button" onClick={reset} disabled={pending} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60">Tilbakestill eksempel</button>
      </div>
    </form>
    {response?.status === "EVALUATED" && response.result.status === "EVALUATED" && <EvaluationResult result={response.result} />}
  </>;
}

function EvaluationResult({ result }: { result: OfflineInputLabResult }) {
  if (result.status !== "EVALUATED") return <section role="status" className="mt-8 rounded-xl border p-5"><h2 className="font-semibold">Evalueringen ble avvist</h2>{result.errors.map((error, index) => <p key={`${error.field}-${index}`} className="mt-2 text-sm">{error.message}</p>)}</section>;
  return <section aria-labelledby="input-lab-results-heading" className="mt-8 space-y-5">
    <header className="rounded-xl border border-amber-300/60 bg-amber-300/5 p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Syntetisk · non-authoritative</p>
      <h2 id="input-lab-results-heading" className="mt-1 text-xl font-semibold">Faktisk evaluering</h2>
      <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-xs text-[var(--muted)]">Cutoff (UTC)</dt><dd className="break-all font-mono">{result.cutoff}</dd></div>
        <div><dt className="text-xs text-[var(--muted)]">Composition</dt><dd className="break-words">{result.compositionStatus}</dd></div>
        <div><dt className="text-xs text-[var(--muted)]">Køstatus</dt><dd className="break-words">{result.queueStatus}</dd></div>
      </dl>
      <p className="mt-3 text-sm font-semibold">Resultatnivå: {result.model ? result.discoveryRejectedCount > 0 ? "Delvis discovery-akseptert; delkø komponert" : "Alle inkluderte records discovery-akseptert; kø komponert" : result.compositionStatus === "BLOCKED_NO_ACCEPTED_RECORDS" ? "Ingen kandidater komponert" : "Composition avvist; ingen delkø presentert"}</p>
      <p className="mt-4 text-sm leading-6">Innsendt: {result.submittedCount}; inkludert: {result.includedCount}; utelatt: {result.omittedCount}; discovery akseptert: {result.discoveryAcceptedCount}; discovery avvist: {result.discoveryRejectedCount}; komponert: {result.composedCount}. Historical-markeringer følger den faktiske V2-projeksjonen.</p>
      {result.compositionCode && <p role="status" className="mt-3 break-words font-mono text-sm">Bounded parent-kode: {result.compositionCode}. Ingen kø ble konstruert.</p>}
      {result.compositionStatus === "BLOCKED_NO_ACCEPTED_RECORDS" && <p className="mt-3 text-sm text-[var(--muted)]">Forelderens V2-composer krever minst én discovery-akseptert record og avviser tomt input med koden over; laboratoriet lager derfor ingen syntetisk tom kø.</p>}
    </header>
    <section aria-labelledby="input-lab-record-outcomes" className="rounded-xl border border-[var(--border)] p-5">
      <h3 id="input-lab-record-outcomes" className="font-semibold">Record-utfall</h3>
      <ul className="mt-3 space-y-3">{result.outcomes.map(outcome => <li key={outcome.slot} className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3"><p className="break-words text-sm font-semibold">{outcome.profileLabel}: {outcome.headline}</p><p className="mt-1 text-sm">{outcome.state}{outcome.rejectionCode ? ` · ${outcome.rejectionCode}` : ""}</p><p className="mt-1 text-xs text-[var(--muted)]">{outcome.explanation}</p></li>)}</ul>
    </section>
    <p role="status" aria-live="polite" className="sr-only">Evalueringen er fullført. Resultatet gjelder den siste innsendingen.</p>
    {result.model && <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)]" aria-label="Actual V2 review queue"><EvidenceReviewQueueV2Workspace model={result.model} idPrefix="input-lab-v2" /></section>}
  </section>;
}
