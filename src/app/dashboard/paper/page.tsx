import { redirect } from "next/navigation";
import { StandingPaperStatusPanel } from "@/components/standing-paper-status-panel";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function StandingPaperStatusPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <main className="mx-auto min-h-screen max-w-7xl px-5 py-10 sm:px-8">
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">MONEY MACHINE</p><h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Standing paper-status</h1><p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">Les visning av lagret policy-, runde- og simuleringsmateriale for dine egne PAPER-kontoer.</p></div>
      <a className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm" href="/dashboard">Portfolio</a>
    </header>
    <StandingPaperStatusPanel />
    <footer className="mt-8 border-t border-[var(--border)] pt-5 text-xs text-[var(--muted)]">Historikk viser høyst 20 beslutninger og 20 fills per policy. Verdier er fra lagrede runder på oppgitt tidspunkt, ikke ferske markedsverdier. Simulering er ikke faktisk børsutførelse, investeringsresultat eller prognose.</footer>
  </main>;
}
