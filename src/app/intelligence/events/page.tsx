import type { Metadata } from "next";
import Link from "next/link";
import { loadDiscoveryInbox } from "../../../application/intelligence/load-discovery-inbox";
import { DiscoveryInbox } from "../../../components/intelligence/discovery-inbox";

export const metadata: Metadata = { title: "Event Intelligence · Money Machine", description: "Read-only, non-authoritative event discovery workspace." };

export default async function EventIntelligencePage() {
  const model = await loadDiscoveryInbox();
  return <main className="mx-auto min-h-screen w-full max-w-[1440px] px-4 py-7 sm:px-7 sm:py-10 lg:px-10">
    <nav aria-label="Breadcrumb" className="mb-8 flex items-center justify-between gap-4 text-sm"><Link href="/" className="text-[var(--muted)] underline-offset-4 hover:underline focus-visible:outline-2">Money Machine</Link><Link href="/dashboard" className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">Portfolio dashboard</Link></nav>
    <header className="mb-9 border-b border-[var(--border)] pb-7"><div className="flex flex-wrap items-start justify-between gap-5"><div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Market intelligence · read only</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Event Intelligence</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">A structured path from discovery to verification to authority. Discovery is a research lead; it does not establish a verified event or suggest an investment action.</p></div><div className="grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-amber-300/50 px-4 py-3"><p className="text-[0.65rem] font-semibold uppercase tracking-widest text-[var(--muted)]">Global status</p><p className="mt-1 text-sm font-semibold">DISCOVERY ONLY</p></div><div className="rounded-xl border border-[var(--border)] px-4 py-3"><p className="text-[0.65rem] font-semibold uppercase tracking-widest text-[var(--muted)]">Production status</p><p className="mt-1 text-sm font-semibold">ACQUISITION BLOCKED</p></div></div></div><p className="mt-5 max-w-4xl border-l-2 border-amber-300/60 pl-3 text-xs leading-5 text-[var(--muted)]">No discovery candidate can become issuer disclosure authority, externally verified fact, event authority, persistence authority, signal, recommendation, order or trade in this workspace.</p></header>
    <DiscoveryInbox model={model} />
    <footer className="mt-10 border-t border-[var(--border)] pt-5 text-xs leading-5 text-[var(--muted)]">This is not a signal or trading dashboard. Production has no selected provider, acquisition path or discovery persistence.</footer>
  </main>;
}
