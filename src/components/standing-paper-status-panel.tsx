"use client";

import { useEffect, useState } from "react";
import { formatMoney, money } from "@/domain/financial/money";
import type { StandingPaperStatus, StandingPaperStatusReadModel, StandingPaperPolicyStatusCard } from "@/application/paper-trading/standing-paper-status";

export type PaperStatusPanelState = { readonly kind: "LOADING" } | { readonly kind: "FORBIDDEN" } | { readonly kind: "READ_ERROR" } | { readonly kind: "DATA"; readonly model: StandingPaperStatusReadModel };
type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isAmount = (value: unknown): value is string => typeof value === "string" && /^-?\d+$/.test(value);
const isDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const policyStatuses = ["DRAFT", "ACTIVE", "PAUSED", "STOPPED", "UNKNOWN"];
const cardStatuses = ["NO_ROUNDS", "AVAILABLE", "INCOMPLETE", "INVALID"];
const topStatuses: StandingPaperStatus[] = ["NO_POLICY", "NO_ROUNDS", "AVAILABLE", "INCOMPLETE", "INVALID"];

function validCard(value: unknown): value is StandingPaperPolicyStatusCard {
  if (!isRecord(value) || !cardStatuses.includes(String(value.status)) || !isText(value.policyId) || !policyStatuses.includes(String(value.policyStatus)) ||
    !["PAPER_ONLY", "UNKNOWN"].includes(String(value.mode)) || value.workerStatus !== "UNKNOWN" || !Array.isArray(value.allowedInstrumentIds) || value.allowedInstrumentIds.some(item => !isText(item)) ||
    !isRecord(value.riskLimits) || !Array.isArray(value.decisions) || value.decisions.length > 20 || !Array.isArray(value.fills) || value.fills.length > 20) return false;
  const limits = value.riskLimits;
  if (![limits.capitalBudgetMinor, limits.maxOrderMinor, limits.maxPositionMinor, limits.maxGrossExposureMinor, limits.maxLossMinor].every(item => item === null || isAmount(item)) ||
    !(limits.maxPriceAgeMs === null || Number.isSafeInteger(limits.maxPriceAgeMs))) return false;
  if (value.status === "INVALID") return value.issueCode === "PAPER_MATERIAL_INVALID" && value.lastRound === null;
  if (![value.netContributionsMinor, value.committedCapitalMinor, value.remainingCapitalBudgetMinor].every(isAmount) ||
    !(value.portfolioValueMinor === null || isAmount(value.portfolioValueMinor)) || !(value.portfolioValueAsOf === null || isDate(value.portfolioValueAsOf)) ||
    !(value.currentLossMinor === null || isAmount(value.currentLossMinor)) || !(value.remainingLossMarginMinor === null || isAmount(value.remainingLossMarginMinor))) return false;
  if (value.lastRound !== null && (!isRecord(value.lastRound) || !isText(value.lastRound.id) || !isDate(value.lastRound.completedAt) || !isDate(value.lastRound.asOf))) return false;
  if (value.status === "NO_ROUNDS" && value.lastRound !== null) return false;
  if (value.status === "AVAILABLE" && (value.lastRound === null || value.portfolioValueMinor === null || value.issueCode !== null)) return false;
  if (value.status === "INCOMPLETE" && value.issueCode !== "PAPER_VALUATION_INCOMPLETE") return false;
  return value.decisions.every(item => isRecord(item) && isText(item.orderId) && isText(item.decisionId) && ["SIMULATED_FILLED", "REJECTED"].includes(String(item.outcome)) && isText(item.reasonCode) && ["APPROVE", "REJECT"].includes(String(item.disposition)) && isDate(item.recordedAt)) &&
    value.fills.every(item => isRecord(item) && isText(item.fillId) && isText(item.orderId) && isText(item.instrumentId) && isAmount(item.quantityAtoms) && Number.isSafeInteger(item.quantityScale) && isAmount(item.grossMinor) && isAmount(item.feeMinor) && item.currency === "NOK" && isDate(item.simulatedAt) && isText(item.executionPolicyVersion));
}

export function parseStandingPaperStatus(value: unknown): StandingPaperStatusReadModel | null {
  if (!isRecord(value) || !topStatuses.includes(value.status as StandingPaperStatus) || value.classification !== "PAPER_ONLY_SYNTHETIC_SIMULATION" || value.workerStatus !== "UNKNOWN" || !Array.isArray(value.policies) || value.policies.length > 20 || !value.policies.every(validCard)) return null;
  if (value.status === "NO_POLICY" && value.policies.length !== 0) return null;
  if (value.status !== "NO_POLICY" && value.policies.length === 0) return null;
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

function StatusCard({ card }: { card: StandingPaperPolicyStatusCard }) {
  if (card.status === "INVALID") return <section className="rounded-2xl border border-rose-400/40 bg-[var(--panel)] p-5" aria-label={`Policy ${card.policyId}`}><h2 className="text-xl font-semibold">Ugyldig lagret materiale</h2><p className="mt-2 text-sm text-[var(--muted)]">Policy-ID: <span className="font-mono">{card.policyId}</span></p><p className="mt-2 text-sm text-rose-200">Kontrollkode: PAPER_MATERIAL_INVALID. Verdier holdes tilbake.</p></section>;
  const risk = card.riskLimits;
  return <section className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 sm:p-7" aria-label={`Paper-policy ${card.identity ?? card.policyId}`}>
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
      <div><p className="text-xs uppercase tracking-[0.18em] text-[var(--accent)]">{card.mode}</p><h2 className="mt-2 break-words text-xl font-semibold sm:text-2xl">{card.identity ?? card.policyId}</h2><p className="mt-2 break-all font-mono text-xs text-[var(--muted)]">{card.policyId} · {card.version}</p></div>
      <div className="grid gap-2 text-xs sm:text-right"><span className="rounded-full border border-[var(--border)] px-3 py-1">Policy: {titleCase(card.policyStatus)}</span><span className="rounded-full border border-amber-400/40 px-3 py-1 text-amber-100">Worker: ukjent</span></div>
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
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-xl border border-[var(--border)] p-4"><h3 className="font-semibold">Risikogrenser</h3><dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2"><Limit label="Maks ordre" value={amount(risk.maxOrderMinor)} /><Limit label="Maks posisjon" value={amount(risk.maxPositionMinor)} /><Limit label="Maks samlet eksponering" value={amount(risk.maxGrossExposureMinor)} /><Limit label="Maks tapsgrense" value={amount(risk.maxLossMinor)} /><Limit label="Maks prisalder" value={risk.maxPriceAgeMs === null ? "Ikke tilgjengelig" : `${risk.maxPriceAgeMs} ms`} /></dl><p className="mt-3 text-xs text-[var(--muted)]">Tillatte instrumenter: {card.allowedInstrumentIds.join(", ")}</p></section>
      <section className="rounded-xl border border-[var(--border)] p-4"><h3 className="font-semibold">Policy og worker</h3><dl className="mt-3 grid gap-3 text-sm"><Limit label="Policy-status" value={titleCase(card.policyStatus)} /><Limit label="Worker-status" value="Ukjent (heartbeat ikke lagret)" /><Limit label="Modus" value="PAPER_ONLY" /><Limit label="Versjon" value={card.version ?? "Ukjent"} /></dl></section>
    </div>
    <HistoryList card={card} />
  </section>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="min-w-0 rounded-xl border border-[var(--border)] p-4"><h3 className="text-xs text-[var(--muted)]">{label}</h3><p className="mt-2 break-words text-lg font-semibold tabular-nums sm:text-xl">{value}</p><p className="mt-2 break-words text-xs text-[var(--muted)]">{detail}</p></article>;
}
function Limit({ label, value }: { label: string; value: string }) { return <div className="flex min-w-0 justify-between gap-3"><dt className="text-[var(--muted)]">{label}</dt><dd className="break-all text-right font-medium">{value}</dd></div>; }
function HistoryList({ card }: { card: StandingPaperPolicyStatusCard }) {
  return <div className="grid gap-5 lg:grid-cols-2">
    <section className="min-w-0 rounded-xl border border-[var(--border)] p-4"><h3 className="font-semibold">Siste beslutninger</h3>{card.decisions.length ? <ol className="mt-3 space-y-3">{card.decisions.map(item => <li key={item.orderId} className="rounded-lg border border-[var(--border)] p-3 text-sm"><p className="break-all font-mono text-xs">{item.orderId}</p><p className="mt-2">{item.outcome === "SIMULATED_FILLED" ? "Simulert fill godkjent" : "Avvist"}</p><p className="mt-1 text-xs text-[var(--muted)]">Årsak: {item.reasonCode} · {dateLabel(item.recordedAt)}</p></li>)}</ol> : <p className="mt-3 text-sm text-[var(--muted)]">Ingen lagrede beslutninger.</p>}</section>
    <section className="min-w-0 rounded-xl border border-[var(--border)] p-4"><h3 className="font-semibold">Siste simulerte fills</h3>{card.fills.length ? <ol className="mt-3 space-y-3">{card.fills.map(item => <li key={item.fillId} className="rounded-lg border border-[var(--border)] p-3 text-sm"><p className="break-all font-mono text-xs">{item.fillId}</p><p className="mt-2">{item.instrumentId} · {item.quantityAtoms} atomiske enheter (skala {item.quantityScale})</p><p className="mt-1">Brutto {amount(item.grossMinor)} · gebyr {amount(item.feeMinor)}</p><p className="mt-1 text-xs text-[var(--muted)]">Simulert {dateLabel(item.simulatedAt)} · {item.executionPolicyVersion}</p></li>)}</ol> : <p className="mt-3 text-sm text-[var(--muted)]">Ingen simulerte fills.</p>}</section>
  </div>;
}

export function StandingPaperStatusPanelView({ state }: { state: PaperStatusPanelState }) {
  if (state.kind === "LOADING") return <section role="status" className="rounded-2xl border border-[var(--border)] p-8"><h2 className="text-xl font-semibold">Laster paper-status …</h2><p className="mt-2 text-sm text-[var(--muted)]">Henter lagrede, eieravgrensede paper-data.</p></section>;
  if (state.kind === "FORBIDDEN") return <section role="status" className="rounded-2xl border border-amber-400/40 p-8"><h2 className="text-xl font-semibold">Tilgang avvist</h2><p className="mt-2 text-sm text-[var(--muted)]">Logg inn for å se dine paper-data.</p></section>;
  if (state.kind === "READ_ERROR") return <section role="status" className="rounded-2xl border border-rose-400/40 p-8"><h2 className="text-xl font-semibold">Paper-status utilgjengelig</h2><p className="mt-2 text-sm text-[var(--muted)]">Lagrede data kunne ikke leses eller valideres.</p></section>;
  const model = state.model;
  if (model.status === "NO_POLICY") return <section role="status" className="rounded-2xl border border-[var(--border)] p-8"><h2 className="text-xl font-semibold">Ingen paper-policy</h2><p className="mt-2 text-sm text-[var(--muted)]">Ingen PAPER_ONLY-policy er tilgjengelig for kontoene dine.</p></section>;
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Standing paper-kontoer</h2><span className="rounded-full border border-[var(--accent)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">PAPER_ONLY</span></div>{model.status === "INVALID" && <p role="status" className="rounded-xl border border-rose-400/40 p-4 text-sm">Ugyldig eller ufullstendig lagret materiale er oppdaget. Berørte verdier holdes tilbake.</p>}{model.policies.map(card => <StatusCard key={card.policyId} card={card} />)}</div>;
}

export function StandingPaperStatusPanel() {
  const [state, setState] = useState<PaperStatusPanelState>({ kind: "LOADING" });
  useEffect(() => { let mounted = true; void loadStandingPaperStatus().then(value => { if (mounted) setState(value); }); return () => { mounted = false; }; }, []);
  return <StandingPaperStatusPanelView state={state} />;
}
