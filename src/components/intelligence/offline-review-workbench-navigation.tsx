import Link from "next/link";

export type OfflineReviewWorkbenchPage =
  | "overview"
  | "combined"
  | "replay"
  | "snapshot"
  | "queue-v2"
  | "review-session"
  | "review-readiness"
  | "input-lab";

const DEMO = "/intelligence/events/review/offline-demo";

const PRIMARY_LINKS: ReadonlyArray<{ page: OfflineReviewWorkbenchPage; href: string; label: string }> = [
  { page: "overview", href: DEMO, label: "Demooversikt" },
  { page: "combined", href: `${DEMO}/combined`, label: "Samlet review-kø" },
  { page: "replay", href: `${DEMO}/replay`, label: "Tidsreplay" },
];

const TECHNICAL_LINKS: ReadonlyArray<{ page: OfflineReviewWorkbenchPage; href: string; label: string }> = [
  { page: "snapshot", href: `${DEMO}/snapshot`, label: "Snapshot roundtrip" },
  { page: "queue-v2", href: `${DEMO}/queue-v2`, label: "V1/V2-sammenligning" },
  { page: "review-session", href: `${DEMO}/review-session`, label: "Review-session" },
  { page: "review-readiness", href: `${DEMO}/review-readiness`, label: "Review readiness" },
];

const INPUT_LAB_LINK = { page: "input-lab" as const, href: `${DEMO}/input-lab`, label: "Syntetiske input-laboratorium" };

function NavigationLinks({ links, activePage }: {
  links: ReadonlyArray<{ page: OfflineReviewWorkbenchPage; href: string; label: string }>;
  activePage: OfflineReviewWorkbenchPage;
}) {
  return <ul className="flex flex-wrap gap-x-4 gap-y-2">
    {links.map(link => <li key={link.page}>
      <Link
        href={link.href}
        prefetch={false}
        aria-current={activePage === link.page ? "page" : undefined}
        className="inline-block rounded px-1 py-1 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] aria-[current=page]:font-bold aria-[current=page]:text-[var(--foreground)]"
      >{link.label}</Link>
    </li>)}
  </ul>;
}

export function OfflineReviewWorkbenchNavigation({ activePage }: { activePage: OfflineReviewWorkbenchPage }) {
  return <nav aria-label="Offline review-arbeidsflate" className="my-6 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
    <div className="grid min-w-0 gap-4 md:grid-cols-[1.1fr_1fr] md:items-start">
      <section aria-labelledby="offline-review-main-links">
        <h2 id="offline-review-main-links" className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Hovedflyt</h2>
        <NavigationLinks links={PRIMARY_LINKS} activePage={activePage} />
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <h3 className="mb-1 text-xs font-semibold text-[var(--muted)]">Avgrenset simulering</h3>
          <NavigationLinks links={[INPUT_LAB_LINK]} activePage={activePage} />
        </div>
      </section>
      <details open={TECHNICAL_LINKS.some(link => link.page === activePage)} className="min-w-0">
        <summary className="w-fit cursor-pointer rounded px-1 py-1 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Teknisk innsikt</summary>
        <div className="pt-2"><NavigationLinks links={TECHNICAL_LINKS} activePage={activePage} /></div>
      </details>
    </div>
  </nav>;
}
