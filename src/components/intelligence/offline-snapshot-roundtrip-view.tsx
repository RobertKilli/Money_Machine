import "server-only";

import Link from "next/link";
import { EvidenceReviewQueueWorkspace } from "@/components/intelligence/evidence-review-queue-workspace";
import type { OfflineSnapshotRoundtripResult } from "@/application/intelligence/load-event-intelligence-offline-snapshot-roundtrip";

const DEMO = "/intelligence/events/review/offline-demo";

export function OfflineSnapshotRoundtripView({ result }: { result: OfflineSnapshotRoundtripResult }) {
  return <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
    <header className="mb-8 rounded-2xl border border-amber-300/70 bg-amber-300/10 p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">SYNTETISK OFFLINE / BARE MINNE</p>
      <h1 className="mt-2 text-2xl font-semibold">Snapshot encode og lokal verifikasjon</h1>
      <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--muted)]">En fast syntetisk replay-composition kodes med eksisterende snapshot-codec og verifiseres mot scope-materiale som ble etablert separat. Ingen fil, database eller storage brukes.</p>
      <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--muted)]">Byteintegritet viser at bytes samsvarer med digest fra dette lokale encode-trinnet. Scope-verifikasjon viser syntaktisk samsvar med lokal forventning. Ingen av delene er source authority, policy application eller approval. Dekodingen gjenoppretter ikke composition-/routing-binding eller provenance.</p>
      <nav aria-label="Snapshot demo navigasjon" className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
        <Link href={`${DEMO}/replay`} className="rounded px-1 py-1 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Tilbake til tidsreplay</Link>
        <Link href={DEMO} className="rounded px-1 py-1 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Tilbake til demooversikten</Link>
      </nav>
    </header>

    {result.status === "UNAVAILABLE" ? <section role="status" className="rounded-2xl border border-amber-300/60 p-6">Den lokale snapshotdemonstrasjonen kunne ikke fullføres. Ingen payload vises.</section> : <>
      <section aria-label="Lokal snapshotstatus" className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 sm:grid-cols-2 lg:grid-cols-3">
        <p className="min-w-0 break-all text-sm"><span className="font-semibold">Format:</span> {result.formatVersion}</p>
        <p className="min-w-0 break-all text-sm"><span className="font-semibold">Cutoff (UTC):</span> <time dateTime={result.cutoff}>{result.cutoff}</time></p>
        <p className="min-w-0 break-all text-sm"><span className="font-semibold">Byteantall:</span> {result.byteLength}</p>
        <p className="min-w-0 break-all font-mono text-xs sm:col-span-2"><span className="font-sans font-semibold">Beregnet SHA-256:</span> {result.digest}</p>
        <p role="status" className="min-w-0 break-all text-sm sm:col-span-2 lg:col-span-1"><span className="font-semibold">Lokal status:</span> {result.verificationStatus}</p>
      </section>

      <section aria-labelledby="roundtrip-explanation" className="mt-6 rounded-xl border border-[var(--border)] p-5">
        <h2 id="roundtrip-explanation" className="text-lg font-semibold">Hva roundtripen viser</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Workspace-et under kommer fra verifierens isolerte envelope-payload og bevarer de faktiske kø-radene. Payloaden kan vises etter lokal byte- og scope-verifikasjon, men har ikke gjenvunnet autentisk kandidatbinding, private identiteter eller source-context. Statusen er lokal og non-authoritative.</p>
      </section>

      <section aria-labelledby="controls-heading" className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 id="controls-heading" className="text-lg font-semibold">Kontrolltilfeller</h2>
        <ul className="mt-3 space-y-3 text-sm leading-6 text-[var(--muted)]">
          <li><span className="font-semibold text-[var(--foreground)]">Endrede bytes:</span> En separat bytekopi bruker opprinnelig digest. Codec avviser med <code>{result.changedBytesCode}</code>.</li>
          <li><span className="font-semibold text-[var(--foreground)]">Annet envelope-scope:</span> Artifactet er først gyldig dekodet med sin egen digest; binding mot opprinnelig separat scope avvises med <code>{result.changedScopeCode}</code>.</li>
        </ul>
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Syntetiske policyreferanser og digest-strenger er kun syntaktiske deklarasjoner. Digesten er ikke en autentisert forventning; demoen bruker ikke storage-read, ekstern expected digest, provenance eller producer-readiness.</p>
      </section>

      <section aria-label="Dekodet snapshot workspace" className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)]">
        <EvidenceReviewQueueWorkspace model={result.model} presentation="SYNTHETIC_OFFLINE_DEMO" idPrefix="snapshot-roundtrip-decoded" />
      </section>
    </>}
    <footer className="mt-8 border-t border-[var(--border)] pt-5 text-sm text-[var(--muted)]">Ingen snapshot lagres, lastes opp eller lastes ned. Decoding gjenoppretter ikke module-local kandidatbinding.</footer>
  </main>;
}
