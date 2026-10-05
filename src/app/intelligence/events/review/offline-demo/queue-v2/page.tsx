import { notFound } from "next/navigation";
import Link from "next/link";
import { EvidenceReviewQueueWorkspace } from "@/components/intelligence/evidence-review-queue-workspace";
import { EvidenceReviewQueueV2Workspace } from "@/components/intelligence/evidence-review-queue-v2-workspace";

export const metadata = {
  title: "Queue V1/V2 comparison | Evidence review queue",
  description: "Side-by-side synthetic offline comparison of the opt-in queue V2 evaluator.",
};

const DEMO = "/intelligence/events/review/offline-demo";
const COMBINED = `${DEMO}/combined`;

function VersionSummary({ label, result }: { label: string; result: Readonly<{ compositionVersion: string; compositionStatus: string; queueStatus: string; presentationVersion: string; totalItems: number; queueVersion?: string }> }) {
  return <section aria-label={`${label} version and status`} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
    <h2 className="text-lg font-semibold">{label}</h2>
    <dl className="mt-3 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
      <div className="min-w-0"><dt className="text-xs text-[var(--muted)]">Composition version</dt><dd className="mt-1 break-all font-mono text-xs">{result.compositionVersion}</dd></div>
      {result.queueVersion && <div className="min-w-0"><dt className="text-xs text-[var(--muted)]">Queue version</dt><dd className="mt-1 break-all font-mono text-xs">{result.queueVersion}</dd></div>}
      <div className="min-w-0"><dt className="text-xs text-[var(--muted)]">Presentation version</dt><dd className="mt-1 break-all font-mono text-xs">{result.presentationVersion}</dd></div>
      <div><dt className="text-xs text-[var(--muted)]">Composition status</dt><dd className="mt-1 break-words">{result.compositionStatus}</dd></div>
      <div><dt className="text-xs text-[var(--muted)]">Queue status</dt><dd className="mt-1 break-words">{result.queueStatus}</dd></div>
      <div><dt className="text-xs text-[var(--muted)]">Total candidates</dt><dd className="mt-1 tabular-nums">{result.totalItems}</dd></div>
    </dl>
  </section>;
}

export default async function OfflineQueueV2ComparisonPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const { loadEventIntelligenceOfflineQueueV2Comparison } = await import("@/application/intelligence/load-event-intelligence-offline-queue-v2-comparison");
  const result = await loadEventIntelligenceOfflineQueueV2Comparison();

  return <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
    <header className="mb-8 rounded-2xl border border-amber-300/70 bg-amber-300/10 p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">READ-ONLY / SYNTETISK OFFLINE-DEMO</p>
      <h1 className="mt-2 text-2xl font-semibold">V1- og V2-kø side om side</h1>
      <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--muted)]">Begge separate compositioner bruker de samme tre autentiske syntetiske discovery-/routing-fixturene og cutoff. V2 er opt-in; eksisterende V1-flyter fortsetter uendret. Køprioritet beskriver review-behov, ikke investeringsrangering; OPEN er ikke godkjenning.</p>
      <nav aria-label="Queue comparison navigation" className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
        <Link href={DEMO} className="rounded px-1 py-1 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Tilbake til demooversikten</Link>
        <Link href={COMBINED} className="rounded px-1 py-1 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Tilbake til samlet V1-kø</Link>
        <Link href={`${DEMO}/review-session`} className="rounded px-1 py-1 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Demonstrer isolerte review-sessions</Link>
        <Link href={`${DEMO}/review-readiness`} className="rounded px-1 py-1 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Vurder lokal review readiness</Link>
      </nav>
    </header>

    {result.status === "UNAVAILABLE" ? <section role="status" className="rounded-2xl border border-amber-300/60 p-6">Sammenligningen kunne ikke fullføres gjennom de autentiske discovery-, routing- og kø-API-ene ({result.reason}).</section> : <>
      <section aria-label="Shared evaluation cutoff" className="mb-6 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 sm:grid-cols-2">
        <p className="text-sm"><span className="font-semibold">Felles cutoff (UTC):</span> <time dateTime={result.cutoff}>{result.cutoff}</time></p>
        <p className="text-sm">Begge presentasjoner er historical snapshots fra samme syntetiske inputgrunnlag.</p>
      </section>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <VersionSummary label="V1 composition" result={{ ...result.v1, totalItems: result.v1.model.items.length }} />
        <VersionSummary label="V2 composition" result={{ ...result.v2, totalItems: result.v2.model.items.length }} />
      </div>
      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
        <section aria-label="V1 synthetic queue" className="min-w-0 rounded-2xl border border-[var(--border)]"><EvidenceReviewQueueWorkspace model={result.v1.model} presentation="SYNTHETIC_OFFLINE_DEMO" idPrefix="queue-v2-compare-v1" /></section>
        <section aria-label="V2 synthetic queue" className="min-w-0 rounded-2xl border border-[var(--border)]"><EvidenceReviewQueueV2Workspace model={result.v2.model} idPrefix="queue-v2-compare-v2" /></section>
      </div>
      <section aria-labelledby="queue-v2-conflict-heading" className="mt-8 min-w-0 rounded-2xl border border-amber-300/50 bg-amber-300/5 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Separate authenticated routing collision fixture</p>
        <h2 id="queue-v2-conflict-heading" className="mt-2 text-xl font-semibold">{result.conflict.label}</h2>
        <p className="mt-3 break-words text-sm leading-6 text-[var(--muted)]">Begge syntetiske routing-conflicts er til stede. V1- og V2-evaluatorene klassifiserer det samme autentiske routing-resultatet separat. Lifecycle velges først; begge relevante blockers beholdes. Denne isolerte kollisjonen inngår ikke som en fjerde rad i de to sammenlignede standard-compositionene fordi den eksisterende V1-compositionen avviser caller-deklarerte conflicts.</p>
        <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
          {[['V1 classifier', result.conflict.v1], ['V2 classifier', result.conflict.v2]].map(([label, outcome]) => <article key={label as string} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
            <h3 className="font-semibold">{label as string}</h3>
            <dl className="mt-3 grid min-w-0 gap-2 text-sm"><div><dt className="text-xs text-[var(--muted)]">Review type / status</dt><dd className="mt-1 break-words">{(outcome as typeof result.conflict.v1).reviewType} / {(outcome as typeof result.conflict.v1).status}</dd></div><div><dt className="text-xs text-[var(--muted)]">Priority / next action</dt><dd className="mt-1 break-words">{(outcome as typeof result.conflict.v1).priority} / {(outcome as typeof result.conflict.v1).nextAction}</dd></div><div><dt className="text-xs text-[var(--muted)]">Blockers</dt><dd className="mt-1 break-words">{(outcome as typeof result.conflict.v1).blockers.join(", ")}</dd></div></dl>
          </article>)}
        </div>
        <p role="status" className="mt-4 text-sm font-semibold">{result.conflict.sameClassification ? "The actual V1 and V2 classifications are equal for this fixture; V2 aligns contract material with existing runtime behavior." : "The actual classifications differ for this fixture; inspect the displayed runtime outputs."}</p>
      </section>
      <section aria-label="Semantic boundaries" className="mt-6 rounded-xl border border-[var(--border)] p-4 text-sm leading-6 text-[var(--muted)]">
        <h2 className="font-semibold text-[var(--foreground)]">Known limits remain open</h2>
        <p className="mt-2">The evaluator fallback has no isolated conformance proof. Routing semantics, retraction hint versus flag, claim retraction, revision supersession, eventRoutes.required, completed review milestones and issuer authorization remain open. These fixtures do not establish full code equivalence, policy application, lifecycle authority or producer readiness.</p>
      </section>
    </>}
    <footer className="mt-8 border-t border-[var(--border)] pt-5 text-sm text-[var(--muted)]">V2 er en lokal, syntetisk og non-authoritative opt-in. Ingen persistence, policy application eller authority-endring skjer.</footer>
  </main>;
}
