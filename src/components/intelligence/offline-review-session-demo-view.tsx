import type { OfflineReviewSessionDemoResult } from "@/application/intelligence/load-offline-review-session-demo";
import { OfflineReviewWorkbenchNavigation } from "@/components/intelligence/offline-review-workbench-navigation";

export function OfflineReviewSessionDemoView({ result }: { result: OfflineReviewSessionDemoResult }) {
  return <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
    <header className="mb-8 rounded-2xl border border-amber-300/70 bg-amber-300/10 p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">Syntetisk offline-demo · read-only</p>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Review-session og milepælevidens</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">Hver session eier et avgrenset, append-only minneinventar. Attestasjoner og tidspunkter er syntetiske; sessionen gir ingen faktisk reviewer-autorisasjon. COMPLETED_PROCEED fullfører bare den lokale review-milepælen. Routing, køblockers og approvals endres ikke.</p>
    </header>
    <OfflineReviewWorkbenchNavigation activePage="review-session" />

    {result.status === "UNAVAILABLE" ? <section role="status" className="rounded-xl border border-amber-300/60 bg-[var(--panel)] p-5">Den syntetiske session-demoen kunne ikke settes sammen. Ingen evidens ble persistet.</section> : <>
      <section aria-label="Sessiongaranti og begrensninger" className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 className="text-lg font-semibold">Hva sessionen kan og ikke kan bevise</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--muted)]">
          <li>Evalueringen bruker hele inventaret av vellykkede operasjoner i den eksakte sessionen, filtrert på issuedAt ved cutoff. Den beviser ikke at ekstern evidens ikke finnes.</li>
          <li>Parent-verifieren binder evaluationCutoff til routing-resultatets evaluationAsOf. Tidligere og senere visninger bruker derfor separate, eksakt bundne sessions; dette er ikke generell historisk retrieval.</li>
          <li>Correction-kjeden er append-only. En senere utstedt korreksjon inngår først når dens cutoff-bundne session evalueres med et kompatibelt tidspunkt.</li>
          <li>RevokedAt er caller-levert syntetisk tid. Dette viser lokal cutoff-håndtering, ikke en betrodd revoker eller historisk authorization.</li>
          <li>Cutoff er ikke forseglet: senere session-operasjoner kan oppgi tilbakedaterte syntetiske tider. Tidligere returnerte resultater endres ikke, men en ny evaluering kan gi et annet resultat.</li>
        </ul>
      </section>

      <div className="grid min-w-0 gap-4">
        {result.scenarios.map(scenario => <section key={scenario.key} aria-labelledby={`session-${scenario.key}-heading`} className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)]">
          <div className="border-b border-[var(--border)] p-5">
            <h2 id={`session-${scenario.key}-heading`} className="text-lg font-semibold">{scenario.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{scenario.description}</p>
          </div>
          <div className="grid min-w-0 gap-3 p-4 sm:grid-cols-2">
            {scenario.evaluations.map((evaluation, index) => <article key={`${scenario.key}-${index}`} className="min-w-0 rounded-xl border border-[var(--border)] p-4">
              <h3 className="text-sm font-semibold">{evaluation.label}</h3>
              <dl className="mt-3 grid min-w-0 gap-3 text-sm">
                <div><dt className="text-xs text-[var(--muted)]">Cutoff (UTC)</dt><dd><time dateTime={evaluation.cutoff}>{evaluation.cutoff}</time></dd></div>
                <div><dt className="text-xs text-[var(--muted)]">Faktisk sessionstatus</dt><dd className="break-words font-semibold">{evaluation.statusLabel}</dd></div>
                <div><dt className="text-xs text-[var(--muted)]">Utfall</dt><dd className="break-words">{evaluation.outcome ?? "Ingen evidens ved cutoff"}</dd></div>
                {evaluation.reason && <div><dt className="text-xs text-[var(--muted)]">Begrenset årsak</dt><dd className="break-words">{evaluation.reason}</dd></div>}
                {evaluation.includedAttestations !== null && <div><dt className="text-xs text-[var(--muted)]">Attestasjoner inkludert</dt><dd className="tabular-nums">{evaluation.includedAttestations}</dd></div>}
                {evaluation.inventoryGuarantee && <div><dt className="text-xs text-[var(--muted)]">Inventargrense</dt><dd className="break-all font-mono text-xs">{evaluation.inventoryGuarantee}</dd></div>}
              </dl>
            </article>)}
          </div>
        </section>)}
      </div>
    </>}
  </main>;
}
