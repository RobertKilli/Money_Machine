import type { StandingPaperDecisionDetail } from "@/application/paper-trading/standing-paper-decision-detail";
import { formatMoney, money } from "@/domain/financial/money";
import { paperDecisionReasonLabel } from "./standing-paper-decision-labels";

const unavailable = "Utilgjengelig";
const amount = (value: string | null | undefined) => typeof value === "string" && /^-?\d+$/.test(value) ? formatMoney(money("NOK", BigInt(value))) : unavailable;
const time = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString("nb-NO", { timeZone: "UTC", dateStyle: "medium", timeStyle: "medium" }) + " UTC"
  : unavailable;

function Evidence({ title, fields }: { title: string; fields: readonly (readonly [string, string | number | null | undefined])[] }) {
  return <section className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
    <h2 className="font-semibold">{title}</h2>
    <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      {fields.map(([label, value]) => <div key={label} className="min-w-0">
        <dt className="text-[var(--muted)]">{label}</dt><dd className="break-words font-medium [overflow-wrap:anywhere]">{value ?? unavailable}</dd>
      </div>)}
    </dl>
  </section>;
}

export function StandingPaperDecisionDetailView({ detail }: { detail: StandingPaperDecisionDetail }) {
  const { decision, price, risk, versions, fill, settlement, fifo } = detail;
  const action = { BUY: "Kjøp", SELL: "Salg", HOLD: "Behold" }[decision.action ?? "BUY"];
  const outcome = { SIMULATED_FILLED: "Simulert fill", REJECTED: "Avvist", HOLD: "Behold" }[decision.outcome];
  return <article className="space-y-5">
    <header>
      <p className="text-sm text-[var(--accent)]">PAPER_ONLY · syntetiske priser · simulerte fills</p>
      <h1 className="mt-2 text-3xl font-semibold">{action} · {outcome}</h1>
      <p className="mt-2 text-lg">{paperDecisionReasonLabel(decision.reasonCode)}</p>
    </header>
    <div className="grid gap-4 lg:grid-cols-2">
      <Evidence title="Beslutning og prisgrunnlag" fields={[
        ["Instrument", detail.instrumentId], ["Ordre-ID", decision.orderId], ["Policy-ID", detail.policyId],
        ["Beslutningstidspunkt", time(detail.decisionAt)], ["Beslutning registrert", time(decision.recordedAt)], ["Runde registrert", time(detail.roundRecordedAt)],
        ["Syntetisk pris (atomisk verdi)", price.atoms], ["Prisskala", price.scale], ["Pris tilgjengelig fra", time(price.availableAt)],
        ["Prispost", price.recordId], ["Datasett", price.datasetVersion],
      ]} />
      <Evidence title="Lagrede versjoner" fields={[
        ["Strategi", versions.strategy], ["Standing policy", versions.standingPolicy], ["Risikoversjon i runden", versions.risk],
        ["Utførelse", versions.execution], ["Gebyr", versions.fee], ["Spread og glidning", versions.spread], ["Avrunding", versions.rounding],
        ["Cycle", versions.cycle], ["Exit", versions.exit], ["FIFO", versions.fifo],
      ]} />
    </div>
    <Evidence title="Lagret risikoevidens og grenser" fields={[
      ["Risikokoder", risk.riskCodes === null ? null : risk.riskCodes.join(", ") || "Ingen registrerte brudd"],
      ["Reservert for åpne ordre", amount(risk.reservedMinor)], ["Beregnet eksponering", amount(risk.resultingExposureMinor)],
      ["Beregnet tap", amount(risk.currentLossMinor)], ["Forventet tap etter ordre", amount(risk.projectedLossMinor)],
      ["Maksimalt tap", amount(risk.maxLossMinor)], ["Maksordre", amount(risk.maxOrderMinor)], ["Maksposisjon", amount(risk.maxPositionMinor)],
      ["Maksimal samlet eksponering", amount(risk.maxExposureMinor)], ["Kapitalbudsjett", amount(risk.capitalBudgetMinor)],
      ["Maksimal prisalder (ms)", risk.maxPriceAgeMs], ["Stop-loss (basispunkter)", risk.stopLossBps],
      ["Take-profit (basispunkter)", risk.takeProfitBps], ["Maksimal holdetid (ms)", risk.maxHoldingMs],
      ["Lagret exit-utløser", risk.triggerReason], ["Hash av beslutningsgrunnlaget", risk.inputHash],
    ]} />
    <Evidence title="Simulert fill" fields={fill ? [
      ["Fill-ID", fill.fillId], ["Mengde (atomiske enheter)", fill.quantityAtoms], ["Mengdeskala", fill.quantityScale],
      ["Brutto", amount(fill.grossMinor)], ["Gebyr", amount(fill.feeMinor)], ["Kontantendring", amount(fill.cashChangeMinor)],
      ["Simulert fillpris (atomisk verdi)", fill.executionPriceAtoms], ["Fillprisskala", fill.executionPriceScale],
      ["Simulert tidspunkt", time(fill.simulatedAt)], ...(fill.side === "SELL" ? [["Realisert resultat", amount(fill.realizedPnlMinor)] as const] : []),
    ] : [["Simulert fill", decision.outcome === "SIMULATED_FILLED" ? null : "Ingen fill for denne beslutningen"]]} />
    {decision.action === "SELL" && <Evidence title="Forbrukte FIFO-lotter" fields={fifo?.length ? fifo.flatMap(lot => [
      [`Kjøpsfill ${lot.fillId}`, `${lot.quantityAtoms} atomiske enheter · kostbasis ${amount(lot.costBasisMinor)}`] as const,
    ]) : [["FIFO-forbruk", null]]} />}
    <Evidence title="Ledgeroppgjør" fields={settlement ? [
      ["Oppgjørs-ID", settlement.id], ["Posteringstype", settlement.type], ["Effektivt tidspunkt", time(settlement.occurredAt)],
      ...(settlement.entries.length ? settlement.entries.map(entry => [
        `${entry.code} · ${entry.direction === "DEBIT" ? "Debet" : "Kredit"}`,
        `${entry.commodity === "NOK" ? amount(entry.amountAtoms) : `${entry.amountAtoms} atomiske enheter (${entry.commodity})`} · registrert ${time(entry.recordedAt)}`,
      ] as const) : [["Posteringer", null] as const]),
    ] : [["Ledgeroppgjør", decision.outcome === "SIMULATED_FILLED" ? null : "Ingen oppgjør for denne beslutningen"]]} />
  </article>;
}
