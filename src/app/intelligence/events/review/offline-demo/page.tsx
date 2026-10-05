import { notFound } from "next/navigation";
import Link from "next/link";
import { EvidenceReviewQueueWorkspace } from "@/components/intelligence/evidence-review-queue-workspace";
import { OfflineReviewDemoDetailSection } from "@/components/intelligence/offline-review-demo-detail-section";

export const metadata = {
  title: "Syntetisk offline-demo | Evidence review queue",
  description: "Lokale syntetiske kandidater for read-only gjennomgang.",
};

const OFFLINE_DEMO_PATH = "/intelligence/events/review/offline-demo";

const SCENARIO_NAVIGATION = [
  { value: "issuer-mapping", scenarioKey: "issuer-mapping" },
  { value: "rights", scenarioKey: "rights-blocked" },
  { value: "correction", scenarioKey: "unresolved-correction" },
] as const;

type ScenarioSelection = (typeof SCENARIO_NAVIGATION)[number];

function parseScenarioSelection(value: string | string[] | undefined): ScenarioSelection | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") notFound();

  const selection = SCENARIO_NAVIGATION.find(scenario => scenario.value === value);
  if (!selection) notFound();
  return selection;
}

export default async function OfflineEvidenceReviewDemoPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
} = {}) {
  if (process.env.NODE_ENV !== "development") notFound();

  const requestedScenario = (await searchParams)?.scenario;
  const selectedScenario = parseScenarioSelection(requestedScenario);

  const { loadEventIntelligenceOfflineReviewDemo } = await import("@/application/intelligence/load-event-intelligence-offline-review-demo");
  const demo = await loadEventIntelligenceOfflineReviewDemo();

  return <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
    <header className="mb-8 rounded-2xl border border-amber-300/70 bg-amber-300/10 p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">SYNTETISK OFFLINE-DEMO</p>
      <h1 className="mt-2 text-2xl font-semibold">Ingen live nyheter eller godkjente events</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">Disse kandidatene er kun til read-only review. De er ikke godkjente events eller handelssignaler. Fast cutoff (UTC): <time dateTime={demo.status === "AVAILABLE" ? demo.evaluatedAsOf : "2026-10-03T12:00:00.000Z"}>{demo.status === "AVAILABLE" ? demo.evaluatedAsOf : "2026-10-03T12:00:00.000Z"}</time>.</p>
      <Link href="/" className="mt-4 inline-block rounded px-1 py-1 text-sm text-[var(--muted)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Home</Link>
    </header>

    {demo.status === "UNAVAILABLE" ? <section role="status" className="rounded-2xl border border-amber-300/60 p-6">Demo-scenarioene kunne ikke settes sammen. Ingen syntetiske rader er laget utenom den eksisterende komposisjonen.</section> : <div className="space-y-8">
      {selectedScenario && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
        <p role="status" className="text-sm font-semibold">Valgt scenario: {demo.scenarios.find(scenario => scenario.key === selectedScenario.scenarioKey)?.label}</p>
        <Link href={OFFLINE_DEMO_PATH} className="rounded px-1 py-1 text-sm font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Vis alle scenarioer</Link>
      </div>}

      <nav aria-label="Scenariooversikt" className="grid gap-3 md:grid-cols-3">
        {demo.scenarios.map(scenario => {
          const item = scenario.item;
          const navigation = SCENARIO_NAVIGATION.find(entry => entry.scenarioKey === scenario.key);
          if (!navigation) return null;
          const isSelected = selectedScenario?.scenarioKey === scenario.key;
          return <Link key={scenario.key} href={`${OFFLINE_DEMO_PATH}?scenario=${navigation.value}`} aria-current={isSelected ? "page" : undefined} className={`min-w-0 rounded-xl border bg-[var(--panel)] p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${isSelected ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : "border-[var(--border)]"}`}>
            <span className="block text-sm font-semibold">{scenario.label}</span>
            <span className="mt-2 block text-xs text-[var(--muted)]">{item ? `${item.statusLabel} · ${item.priorityLabel}` : "Ingen review-rad"}</span>
            {item?.historical && <span className="mt-2 inline-block rounded border border-sky-300/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">Historical snapshot</span>}
            {item && <span className="mt-2 block break-words text-xs leading-5 text-[var(--muted)]">{item.reasonLabels.join(" · ")}</span>}
          </Link>;
        })}
      </nav>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
        <p className="text-sm text-[var(--muted)]">Se kandidatene samlet i én syntetisk kø.</p>
        <Link href={`${OFFLINE_DEMO_PATH}/combined`} className="mt-2 inline-block rounded px-1 py-1 text-sm font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Samlet syntetisk review-kø</Link>
        <Link href={`${OFFLINE_DEMO_PATH}/replay`} className="mt-2 ml-4 inline-block rounded px-1 py-1 text-sm font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Sammenlign to observasjonstidspunkter</Link>
        <Link href={`${OFFLINE_DEMO_PATH}/snapshot`} className="mt-2 ml-4 inline-block rounded px-1 py-1 text-sm font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Demonstrer snapshot roundtrip</Link>
        <Link href={`${OFFLINE_DEMO_PATH}/queue-v2`} className="mt-2 ml-4 inline-block rounded px-1 py-1 text-sm font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Sammenlign opt-in queue V2</Link>
      </div>

      {demo.scenarios.filter(scenario => !selectedScenario || scenario.key === selectedScenario.scenarioKey).map(scenario => {
        return <section key={scenario.key} id={`offline-demo-${scenario.key}`} aria-labelledby={`${scenario.detailId}-heading`} className="overflow-hidden rounded-2xl border border-[var(--border)]">
        <OfflineReviewDemoDetailSection detail={scenario} />
        <EvidenceReviewQueueWorkspace model={scenario.model} presentation="SYNTHETIC_OFFLINE_DEMO" idPrefix={scenario.key} />
        </section>;
      })}
    </div>}

    <footer className="mt-8 border-t border-[var(--border)] pt-5 text-sm text-[var(--muted)]">Veiledningen beskriver kun disse syntetiske, read-only scenarioene. Den utfører ikke review, godkjenning eller trading.</footer>
  </div>;
}
