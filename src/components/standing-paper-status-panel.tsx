"use client";

import { useEffect, useState } from "react";
import { formatMoney, money } from "@/domain/financial/money";
import type { StandingPaperStatus, StandingPaperStatusReadModel, StandingPaperPolicyStatusCard } from "@/application/paper-trading/standing-paper-status";

export type PaperStatusPanelState = { readonly kind: "LOADING" } | { readonly kind: "FORBIDDEN" } | { readonly kind: "READ_ERROR" } | { readonly kind: "DATA"; readonly model: StandingPaperStatusReadModel };
type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isAmount = (value: unknown): value is string => typeof value === "string" && /^-?\d+$/.test(value);
const isNonnegativeAmount = (value: unknown): value is string => isAmount(value) && BigInt(value) >= 0n;
const isPositiveAmount = (value: unknown): value is string => isAmount(value) && BigInt(value) > 0n;
const isDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const policyStatuses = ["DRAFT", "ACTIVE", "PAUSED", "STOPPED", "UNKNOWN"];
const cardStatuses = ["NO_ROUNDS", "AVAILABLE", "INCOMPLETE", "INVALID"];
const topStatuses: StandingPaperStatus[] = ["NO_POLICY", "NO_ROUNDS", "AVAILABLE", "INCOMPLETE", "INVALID"];
const workerInstanceStatuses = ["RUNNING", "WAITING_PAUSED", "WAITING_INTERVAL", "ENDED", "STALE"];
function summaryWorkerStatus(workers: readonly Record<string, unknown>[]) {
  return workers.length === 0 ? "UNKNOWN"
    : workers.some(worker => worker.status === "RUNNING") ? "RUNNING"
      : workers.some(worker => worker.status === "WAITING_PAUSED") ? "WAITING_PAUSED"
        : workers.some(worker => worker.status === "WAITING_INTERVAL") ? "WAITING_INTERVAL"
          : workers.some(worker => worker.status === "STALE") ? "STALE" : "ENDED";
}

function validCard(value: unknown): value is StandingPaperPolicyStatusCard {
  if (!isRecord(value) || !cardStatuses.includes(String(value.status)) || !isText(value.policyId) || !policyStatuses.includes(String(value.policyStatus)) ||
    !Array.isArray(value.workerInstances) || value.workerInstances.length > 20 || !Number.isSafeInteger(value.workerInstanceCount) || (value.workerInstanceCount as number) < value.workerInstances.length ||
    typeof value.workerInstancesTruncated !== "boolean" || value.workerInstancesTruncated !== ((value.workerInstanceCount as number) > value.workerInstances.length) ||
    (value.workerInstancesTruncated && (value.workerInstances.length !== 20 || (value.workerInstanceCount as number) <= 20)) ||
    !workerInstanceStatuses.concat("UNKNOWN").includes(String(value.workerStatus)) || !Array.isArray(value.allowedInstrumentIds) || value.allowedInstrumentIds.some(item => !isText(item)) ||
    new Set(value.allowedInstrumentIds).size !== value.allowedInstrumentIds.length || !isRecord(value.riskLimits) ||
    !Array.isArray(value.decisions) || value.decisions.length > 20 || !Array.isArray(value.fills) || value.fills.length > 20) return false;
  const processIds = new Set<string>();
  const workersValid = value.workerInstances.every(item => {
    if (!isRecord(item) || !isText(item.workerId) || !/^[A-Za-z0-9_-]{1,64}$/.test(item.workerId) || !isText(item.processInstanceId) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.processInstanceId) || !workerInstanceStatuses.includes(String(item.status)) || !isDate(item.lastHeartbeatAt) || processIds.has(item.processInstanceId)) return false;
    processIds.add(item.processInstanceId);
    return true;
  });
  if (!workersValid || (!value.workerInstancesTruncated && value.workerStatus !== summaryWorkerStatus(value.workerInstances as Record<string, unknown>[]))) return false;
  if ((value.workerInstanceCount === 0) !== (value.workerStatus === "UNKNOWN")) return false;
  const limits = value.riskLimits;
  const monetaryLimits = [limits.capitalBudgetMinor, limits.maxOrderMinor, limits.maxPositionMinor, limits.maxGrossExposureMinor, limits.maxLossMinor];
  if (value.status === "INVALID") return value.identity === null && value.version === null && value.policyStatus === "UNKNOWN" && value.mode === "UNKNOWN" &&
    monetaryLimits.every(item => item === null) && limits.maxPriceAgeMs === null && value.allowedInstrumentIds.length === 0 && value.lastRound === null &&
    value.workerInstances.length === 0 && value.workerInstanceCount === 0 && !value.workerInstancesTruncated && value.netContributionsMinor === null && value.committedCapitalMinor === null && value.remainingCapitalBudgetMinor === null && value.portfolioValueMinor === null &&
    value.portfolioValueAsOf === null && value.currentLossMinor === null && value.remainingLossMarginMinor === null && value.decisions.length === 0 && value.fills.length === 0 &&
    value.issueCode === "PAPER_MATERIAL_INVALID";
  if (!isText(value.identity) || value.version !== "standing-paper-policy/v1" || value.mode !== "PAPER_ONLY" || value.policyStatus === "UNKNOWN" ||
    value.allowedInstrumentIds.length === 0 || !monetaryLimits.slice(0, 4).every(isPositiveAmount) || !isNonnegativeAmount(limits.maxLossMinor) ||
    typeof limits.maxPriceAgeMs !== "number" || !Number.isSafeInteger(limits.maxPriceAgeMs) || limits.maxPriceAgeMs <= 0 ||
    ![value.netContributionsMinor, value.committedCapitalMinor, value.remainingCapitalBudgetMinor].every(isNonnegativeAmount)) return false;
  if (value.lastRound !== null && (!isRecord(value.lastRound) || !isText(value.lastRound.id) || !isDate(value.lastRound.completedAt) || !isDate(value.lastRound.asOf))) return false;
  const noValuationAmounts = value.portfolioValueMinor === null && value.currentLossMinor === null && value.remainingLossMarginMinor === null;
  const noSavedValuation = noValuationAmounts && value.portfolioValueAsOf === null;
  if (value.status === "NO_ROUNDS") return value.lastRound === null && noSavedValuation && value.decisions.length === 0 && value.fills.length === 0 && value.issueCode === null;
  if (value.lastRound === null) return false;
  if (value.status === "AVAILABLE" && (!isNonnegativeAmount(value.portfolioValueMinor) || !isDate(value.portfolioValueAsOf) || value.portfolioValueAsOf !== value.lastRound.asOf ||
    !isNonnegativeAmount(value.currentLossMinor) || !isNonnegativeAmount(value.remainingLossMarginMinor) || value.issueCode !== null)) return false;
  if (value.status === "INCOMPLETE" && (!noValuationAmounts || !isDate(value.portfolioValueAsOf) || value.portfolioValueAsOf !== value.lastRound.asOf || value.issueCode !== "PAPER_VALUATION_INCOMPLETE")) return false;
  const decisionCodes = ["POLICY_NOT_ACTIVE", "PRICE_MISSING", "PRICE_STALE", "INSTRUMENT_NOT_ALLOWED", "ORDER_LIMIT_EXCEEDED", "POSITION_LIMIT_EXCEEDED", "EXPOSURE_LIMIT_EXCEEDED", "CAPITAL_BUDGET_EXCEEDED", "LOSS_LIMIT_EXCEEDED", "M1_RISK_REJECTED", "APPROVED"];
  const decisionsValid = value.decisions.every(item => isRecord(item) && isText(item.orderId) && isText(item.decisionId) &&
    ["SIMULATED_FILLED", "REJECTED"].includes(String(item.outcome)) && decisionCodes.includes(String(item.reasonCode)) &&
    ["APPROVE", "REJECT"].includes(String(item.disposition)) && isDate(item.recordedAt) &&
    (item.outcome === "SIMULATED_FILLED" ? item.reasonCode === "APPROVED" && item.disposition === "APPROVE" : item.reasonCode !== "APPROVED" && item.disposition === "REJECT"));
  const fillsValid = value.fills.every(item => isRecord(item) && isText(item.fillId) && isText(item.orderId) && isText(item.instrumentId) &&
    isPositiveAmount(item.quantityAtoms) && typeof item.quantityScale === "number" && Number.isSafeInteger(item.quantityScale) && item.quantityScale >= 0 &&
    isPositiveAmount(item.grossMinor) && isNonnegativeAmount(item.feeMinor) && item.currency === "NOK" && isDate(item.simulatedAt) && item.executionPolicyVersion === "m1-market-execution/v1");
  if (!decisionsValid || !fillsValid) return false;
  if (BigInt(value.remainingCapitalBudgetMinor as string) !== (BigInt(limits.capitalBudgetMinor as string) > BigInt(value.committedCapitalMinor as string) ? BigInt(limits.capitalBudgetMinor as string) - BigInt(value.committedCapitalMinor as string) : 0n)) return false;
  if (value.status === "AVAILABLE" && BigInt(value.remainingLossMarginMinor as string) !== (BigInt(limits.maxLossMinor as string) > BigInt(value.currentLossMinor as string) ? BigInt(limits.maxLossMinor as string) - BigInt(value.currentLossMinor as string) : 0n)) return false;
  const outcomeByOrder = new Map(value.decisions.map(item => [(item as Record<string, unknown>).orderId, (item as Record<string, unknown>).outcome]));
  if (value.fills.some(item => outcomeByOrder.has((item as Record<string, unknown>).orderId) && outcomeByOrder.get((item as Record<string, unknown>).orderId) !== "SIMULATED_FILLED")) return false;
  return new Set(value.decisions.map(item => (item as Record<string, unknown>).orderId)).size === value.decisions.length &&
    new Set(value.fills.map(item => (item as Record<string, unknown>).fillId)).size === value.fills.length &&
    new Set(value.fills.map(item => (item as Record<string, unknown>).orderId)).size === value.fills.length;
}

export function parseStandingPaperStatus(value: unknown): StandingPaperStatusReadModel | null {
  if (!isRecord(value) || !topStatuses.includes(value.status as StandingPaperStatus) || value.classification !== "PAPER_ONLY_SYNTHETIC_SIMULATION" || value.workerStatus !== "UNKNOWN" || !Array.isArray(value.policies) || value.policies.length > 20 || !value.policies.every(validCard)) return null;
  const policies = value.policies as StandingPaperPolicyStatusCard[];
  if (value.status !== (policies.length === 0 ? "NO_POLICY" : policies.some(policy => policy.status === "AVAILABLE") ? "AVAILABLE" : policies.some(policy => policy.status === "INCOMPLETE") ? "INCOMPLETE" : policies.some(policy => policy.status === "INVALID") ? "INVALID" : "NO_ROUNDS")) return null;
  if (new Set(policies.map(policy => policy.policyId)).size !== policies.length || new Set(policies.map(policy => policy.identity).filter((identity): identity is string => identity !== null)).size !== policies.filter(policy => policy.identity !== null).length) return null;
  return value as unknown as StandingPaperStatusReadModel;
}

export async function loadStandingPaperStatus(fetcher: Fetcher = fetch): Promise<PaperStatusPanelState> {
  try {
    const response = await fetcher("/api/dashboard/paper-status", { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401 || response.status === 403) return { kind: "FORBIDDEN" };
    if (!response.ok) return { kind: "READ_ERROR" };
    const model = parseStandingPaperStatus(await response.json());
    return model ? { kind: "DATA", model } : { kind: "READ_ERROR" };
  } catch { return { kind: "READ_ERROR" }; }
}

const amount = (minor: string | null) => minor === null ? "Ikke tilgjengelig" : formatMoney(money("NOK", BigInt(minor)));
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString("nb-NO", { timeZone: "UTC", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }) : "Ikke tilgjengelig";
const titleCase = (value: string) => value.replaceAll("_", " ").toLocaleLowerCase("nb-NO").replace(/^./, character => character.toLocaleUpperCase("nb-NO"));

function PolicyControls({ card, onRefresh }: { card: StandingPaperPolicyStatusCard; onRefresh?: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const actions: Array<{ action: "PAUSE" | "RESUME" | "STOP"; label: string }> = card.policyStatus === "ACTIVE"
    ? [{ action: "PAUSE", label: "Pause" }, { action: "STOP", label: "Stopp" }]
    : card.policyStatus === "PAUSED" ? [{ action: "RESUME", label: "Gjenoppta" }, { action: "STOP", label: "Stopp" }]
      : card.policyStatus === "DRAFT" ? [{ action: "STOP", label: "Stopp" }] : [];
  if (!actions.length) return null;

  async function submit(action: "PAUSE" | "RESUME" | "STOP") {
    if (action === "STOP" && !window.confirm(`Stopp policy ${card.identity ?? card.policyId}? Stoppet status er terminal og kan ikke angres.`)) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/dashboard/paper-policies/${encodeURIComponent(card.policyId)}/transition`, {
        method: "POST", cache: "no-store", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
        body: JSON.stringify({ action, expectedStatus: card.policyStatus, ...(action === "STOP" ? { confirmStop: true } : {}) }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: unknown };
        setMessage(payload.error === "STALE_STATUS" ? "Policyen ble endret et annet sted. Status er hentet på nytt." : "Statusendringen ble avvist. Oppdater status før du prøver igjen.");
        if (response.status === 409) await onRefresh?.();
        return;
      }
      const payload = await response.json() as { policyId?: unknown; status?: unknown };
      const expected = action === "PAUSE" ? "PAUSED" : action === "RESUME" ? "ACTIVE" : "STOPPED";
      if (payload.policyId !== card.policyId || payload.status !== expected) {
        setMessage("Statusendringen kunne ikke bekreftes. Hentet status på nytt.");
        await onRefresh?.();
        return;
      }
      await onRefresh?.();
    } catch {
      setMessage("Statusendringen kunne ikke bekreftes. Hentet status på nytt.");
      await onRefresh?.();
    } finally { setPending(false); }
  }

  return <div className="mt-4 flex flex-wrap items-center gap-2" aria-busy={pending}>
    <p className="w-full text-xs text-[var(--muted)]">Pause og stopp hindrer nye runder; en pågående runde får fullføre.</p>
    {actions.map(({ action, label }) => <button key={action} type="button" disabled={pending} onClick={() => void submit(action)} className={`rounded-lg border px-4 py-2 text-sm font-medium disabled:cursor-wait disabled:opacity-60 ${action === "STOP" ? "border-rose-400/50 text-rose-100" : "border-[var(--accent)] text-[var(--accent)]"}`}>{pending ? "Lagrer …" : label}</button>)}
    {message && <p role="status" className="w-full text-sm text-amber-100">{message}</p>}
  </div>;
}

function StatusCard({ card, onRefresh }: { card: StandingPaperPolicyStatusCard; onRefresh?: () => Promise<void> }) {
  if (card.status === "INVALID") return <section className="rounded-2xl border border-rose-400/40 bg-[var(--panel)] p-5" aria-label={`Policy ${card.policyId}`}><h2 className="text-xl font-semibold">Ugyldig lagret materiale</h2><p className="mt-2 text-sm text-[var(--muted)]">Policy-ID: <span className="font-mono">{card.policyId}</span></p><p className="mt-2 text-sm text-rose-200">Kontrollkode: PAPER_MATERIAL_INVALID. Verdier holdes tilbake.</p></section>;
  const risk = card.riskLimits;
  return <section className="min-w-0 space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 sm:p-7" aria-label={`Paper-policy ${card.identity ?? card.policyId}`}>
    <header className="grid min-w-0 grid-cols-1 items-start gap-4 border-b border-[var(--border)] pb-5 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0"><p className="text-xs uppercase tracking-[0.18em] text-[var(--accent)]">{card.mode}</p><h2 className="mt-2 break-words text-xl font-semibold sm:text-2xl">{card.identity ?? card.policyId}</h2><p className="mt-2 break-all font-mono text-xs text-[var(--muted)]">{card.policyId} · {card.version}</p></div>
      <div className="flex max-w-full flex-wrap gap-2 text-xs sm:grid sm:justify-items-end"><span className="rounded-full border border-[var(--border)] px-3 py-1">Policy: {titleCase(card.policyStatus)}</span><span className="rounded-full border border-amber-400/40 px-3 py-1 text-amber-100">Worker: {workerLabel(card.workerStatus)}</span></div>
    </header>
    <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-amber-50">Syntetiske priser · simulerte fills · Ingen børsutførelse. Lagrede runder bekrefter ikke at en worker kjører nå.</p>
    {card.status === "NO_ROUNDS" ? <div role="status" className="rounded-xl border border-[var(--border)] p-5"><h3 className="font-semibold">Ingen fullførte runder</h3><p className="mt-2 text-sm text-[var(--muted)]">Kapital og portefølje har ingen lagret paper-runde ennå.</p></div> : card.status === "INCOMPLETE" ? <div role="status" className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-4"><h3 className="font-semibold">Ufullstendig verdsettelse</h3><p className="mt-1 text-sm text-[var(--muted)]">Noen lagrede beregninger mangler. Porteføljeverdi og tapsmargin vises ikke som ferske eller komplette data.</p></div> : null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Virtuelle innskudd" value={amount(card.netContributionsMinor)} detail="Netto bokført på paper-kontoen" />
      <Metric label="Brukt kapital" value={amount(card.committedCapitalMinor)} detail="Kapital bundet i simulerte kjøp inkl. gebyr" />
      <Metric label="Gjenstående budsjett" value={amount(card.remainingCapitalBudgetMinor)} detail={`Budsjett ${amount(risk.capitalBudgetMinor)}`} />
      <Metric label="Sist lagret porteføljeverdi" value={amount(card.portfolioValueMinor)} detail={`Gjelder ${dateLabel(card.portfolioValueAsOf)}`} />
      <Metric label="Inn­skuddsjustert tap" value={amount(card.currentLossMinor)} detail={`Gjenstående tapsmargin ${amount(card.remainingLossMarginMinor)}`} />
      <Metric label="Siste fullførte runde" value={card.lastRound ? dateLabel(card.lastRound.completedAt) : "Ingen"} detail={card.lastRound ? `Verdier gjelder ${dateLabel(card.lastRound.asOf)}` : "Ingen lagret fullføringstid"} />
    </div>
    <PolicyControls card={card} onRefresh={onRefresh} />
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="min-w-0 rounded-xl border border-[var(--border)] p-4"><h3 className="font-semibold">Risikogrenser</h3><dl className="mt-3 grid min-w-0 grid-cols-1 gap-2 text-sm sm:grid-cols-2"><Limit label="Maks ordre" value={amount(risk.maxOrderMinor)} /><Limit label="Maks posisjon" value={amount(risk.maxPositionMinor)} /><Limit label="Maks samlet eksponering" value={amount(risk.maxGrossExposureMinor)} /><Limit label="Maks tapsgrense" value={amount(risk.maxLossMinor)} /><Limit label="Maks prisalder" value={risk.maxPriceAgeMs === null ? "Ikke tilgjengelig" : `${risk.maxPriceAgeMs} ms`} /></dl><p className="mt-3 break-all text-xs text-[var(--muted)]">Tillatte instrumenter: {card.allowedInstrumentIds.join(", ")}</p></section>
      <section className="rounded-xl border border-[var(--border)] p-4"><h3 className="font-semibold">Policy og worker</h3><dl className="mt-3 grid gap-3 text-sm"><Limit label="Policy-status" value={titleCase(card.policyStatus)} /><Limit label="Worker-status" value={workerLabel(card.workerStatus)} /><Limit label="Modus" value="PAPER_ONLY" /><Limit label="Versjon" value={card.version ?? "Ukjent"} /></dl>{card.workerInstancesTruncated && <p className="mt-3 text-xs text-[var(--muted)]">Viser de 20 siste av {card.workerInstanceCount} worker-instanser.</p>}{card.workerInstances.length > 0 && <ul className="mt-3 space-y-2 border-t border-[var(--border)] pt-3 text-xs">{card.workerInstances.map(worker => <li key={worker.processInstanceId} className="flex flex-wrap justify-between gap-2"><span>{worker.workerId} · {workerLabel(worker.status)}</span><span className="text-[var(--muted)]">Heartbeat {dateLabel(worker.lastHeartbeatAt)}</span></li>)}</ul>}</section>
    </div>
    <HistoryList card={card} />
  </section>;
}

function workerLabel(status: string): string {
  return ({ UNKNOWN: "Ukjent (ingen heartbeat-evidens)", RUNNING: "Kjører", WAITING_PAUSED: "Venter på pauset policy", WAITING_INTERVAL: "Venter på neste runde", ENDED: "Avsluttet", STALE: "Foreldet heartbeat" } as Record<string, string>)[status] ?? "Ukjent";
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="min-w-0 rounded-xl border border-[var(--border)] p-4"><h3 className="text-xs text-[var(--muted)]">{label}</h3><p className="mt-2 break-words text-lg font-semibold tabular-nums sm:text-xl">{value}</p><p className="mt-2 break-words text-xs text-[var(--muted)]">{detail}</p></article>;
}
function Limit({ label, value }: { label: string; value: string }) { return <div className="flex min-w-0 justify-between gap-3"><dt className="min-w-0 break-words text-[var(--muted)]">{label}</dt><dd className="min-w-0 max-w-[55%] break-words text-right font-medium">{value}</dd></div>; }
function HistoryList({ card }: { card: StandingPaperPolicyStatusCard }) {
  return <div className="grid gap-5 lg:grid-cols-2">
    <section className="min-w-0 rounded-xl border border-[var(--border)] p-4"><h3 className="font-semibold">Siste beslutninger</h3>{card.decisions.length ? <ol className="mt-3 space-y-3">{card.decisions.map(item => <li key={item.orderId} className="rounded-lg border border-[var(--border)] p-3 text-sm"><p className="break-all font-mono text-xs">{item.orderId}</p><p className="mt-2">{item.outcome === "SIMULATED_FILLED" ? "Simulert fill godkjent" : "Avvist"}</p><p className="mt-1 text-xs text-[var(--muted)]">Årsak: {item.reasonCode} · {dateLabel(item.recordedAt)}</p></li>)}</ol> : <p className="mt-3 text-sm text-[var(--muted)]">Ingen lagrede beslutninger.</p>}</section>
    <section className="min-w-0 rounded-xl border border-[var(--border)] p-4"><h3 className="font-semibold">Siste simulerte fills</h3>{card.fills.length ? <ol className="mt-3 space-y-3">{card.fills.map(item => <li key={item.fillId} className="rounded-lg border border-[var(--border)] p-3 text-sm"><p className="break-all font-mono text-xs">{item.fillId}</p><p className="mt-2">{item.instrumentId} · {item.quantityAtoms} atomiske enheter (skala {item.quantityScale})</p><p className="mt-1">Brutto {amount(item.grossMinor)} · gebyr {amount(item.feeMinor)}</p><p className="mt-1 text-xs text-[var(--muted)]">Simulert {dateLabel(item.simulatedAt)} · {item.executionPolicyVersion}</p></li>)}</ol> : <p className="mt-3 text-sm text-[var(--muted)]">Ingen simulerte fills.</p>}</section>
  </div>;
}

export function StandingPaperStatusPanelView({ state, onRefresh }: { state: PaperStatusPanelState; onRefresh?: () => Promise<void> }) {
  if (state.kind === "LOADING") return <section role="status" className="rounded-2xl border border-[var(--border)] p-8"><h2 className="text-xl font-semibold">Laster paper-status …</h2><p className="mt-2 text-sm text-[var(--muted)]">Henter lagrede, eieravgrensede paper-data.</p></section>;
  if (state.kind === "FORBIDDEN") return <section role="status" className="rounded-2xl border border-amber-400/40 p-8"><h2 className="text-xl font-semibold">Tilgang avvist</h2><p className="mt-2 text-sm text-[var(--muted)]">Logg inn for å se dine paper-data.</p></section>;
  if (state.kind === "READ_ERROR") return <section role="status" className="rounded-2xl border border-rose-400/40 p-8"><h2 className="text-xl font-semibold">Paper-status utilgjengelig</h2><p className="mt-2 text-sm text-[var(--muted)]">Lagrede data kunne ikke leses eller valideres.</p></section>;
  const model = state.model;
  if (model.status === "NO_POLICY") return <section role="status" className="rounded-2xl border border-[var(--border)] p-8"><h2 className="text-xl font-semibold">Ingen paper-policy</h2><p className="mt-2 text-sm text-[var(--muted)]">Ingen PAPER_ONLY-policy er tilgjengelig for kontoene dine.</p></section>;
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Standing paper-kontoer</h2><span className="rounded-full border border-[var(--accent)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">PAPER_ONLY</span></div>{model.status === "INVALID" && <p role="status" className="rounded-xl border border-rose-400/40 p-4 text-sm">Ugyldig eller ufullstendig lagret materiale er oppdaget. Berørte verdier holdes tilbake.</p>}{model.policies.map(card => <StatusCard key={card.policyId} card={card} onRefresh={onRefresh} />)}</div>;
}

export function StandingPaperStatusPanel() {
  const [state, setState] = useState<PaperStatusPanelState>({ kind: "LOADING" });
  const refresh = async () => setState(await loadStandingPaperStatus());
  useEffect(() => { let mounted = true; void loadStandingPaperStatus().then(value => { if (mounted) setState(value); }); return () => { mounted = false; }; }, []);
  return <StandingPaperStatusPanelView state={state} onRefresh={refresh} />;
}
