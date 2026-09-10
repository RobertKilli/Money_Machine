import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { DepositForm } from "@/components/deposit-form";
import { PortfolioView } from "@/components/portfolio-view";
import { GetPortfolioProjection } from "@/application/portfolio/get-portfolio-projection";
import { getPortfolioReadRepository } from "@/infrastructure/postgres/portfolio-read-repository";
import { getCurrentUser } from "@/lib/auth/current-user";
import { signOut } from "../login/actions";
import { evaluateContributionDecision } from "./decision-actions";
import { initializeSimulationAccount } from "./actions";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ asOf?: string; account?: string }> }) {
  const user = await getCurrentUser(); if (!user) redirect("/login");
  const query = await searchParams;
  const now = new Date(); const asOf = query.asOf ? new Date(query.asOf) : now;
  const invalid = !Number.isFinite(asOf.getTime()) || asOf > now || (query.asOf !== undefined && asOf.toISOString() !== query.asOf) || (query.account !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.account));
  const repository = getPortfolioReadRepository();
  let portfolio; let failed = false;
  if (repository && !invalid) {
    try { portfolio = await new GetPortfolioProjection(repository).execute({ actorId: user.id, financialAccountId: query.account, asOf }); }
    catch { failed = true; }
  }
  return <main className="mx-auto min-h-screen max-w-7xl px-5 py-10 sm:px-8">
    <header className="mb-10 flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">MONEY MACHINE</p><h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Portfolio</h1><p className="mt-3 text-sm text-[var(--muted)]"><strong className="text-[var(--accent)]">SIMULATION ONLY</strong> · Virtual capital and synthetic prices. No real funds.</p></div><form action={signOut}><button className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm" type="submit">Sign out</button></form></header>
    <form className="mb-6 flex flex-wrap items-end gap-3" method="get"><div className="flex-1"><label htmlFor="asOf" className="mb-2 block text-xs text-[var(--muted)]">As-of timestamp (UTC)</label><input id="asOf" name="asOf" type="text" defaultValue={invalid ? "" : asOf.toISOString()} placeholder="2026-09-10T12:00:00.000Z" className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 font-mono text-sm sm:max-w-md" /></div>{query.account && !invalid && <input type="hidden" name="account" value={query.account} />}<button className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm" type="submit">View snapshot</button><a className="px-3 py-2 text-sm text-[var(--muted)]" href="/dashboard">Latest</a></form>
    {portfolio ? <PortfolioView portfolio={portfolio} /> : <section role="status" className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-8"><h2 className="text-xl font-semibold">{invalid ? "Invalid snapshot request" : failed || !repository ? "Portfolio unavailable" : "No simulation account available"}</h2><p className="mt-3 text-sm text-[var(--muted)]">{invalid ? "Use an ISO UTC timestamp including milliseconds, no later than now." : failed || !repository ? "We could not load verified portfolio evidence. No financial totals are shown." : "Initialize your simulation account to begin with an empty portfolio."}</p>{!invalid && !failed && repository && !query.account && <form action={initializeSimulationAccount} className="mt-5"><button className="rounded-lg border border-[var(--accent)] px-4 py-2 text-sm text-[var(--accent)]" type="submit">Initialize simulation account</button></form>}</section>}
    {portfolio && <details className="mt-8 rounded-2xl border border-[var(--border)] p-6"><summary className="cursor-pointer font-medium">Simulation actions</summary><p className="mt-3 text-sm text-[var(--muted)]">These commands affect the current simulation account, independently of the snapshot above.</p><div className="mt-6 grid gap-8 md:grid-cols-2"><section><h2 className="mb-4 font-semibold">Add virtual capital</h2><DepositForm currencyCode={portfolio.baseCurrency} financialAccountId={portfolio.financialAccountId} initialIdempotencyKey={randomUUID()} /></section><section><h2 className="font-semibold">Contribution allocation</h2><p className="mt-2 text-sm text-[var(--muted)]">Evaluate a deterministic proposal and its risk checks. Evaluation does not execute a trade.</p><form action={evaluateContributionDecision} className="mt-4"><input name="financialAccountId" type="hidden" value={portfolio.financialAccountId} /><button className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm" type="submit">Evaluate allocation</button></form></section></div></details>}
    <footer className="mt-10 border-t border-[var(--border)] pt-5 text-xs text-[var(--muted)]">Read-only portfolio values reconstructed from ledger, fill and fixture-price evidence. Simulated results are not investment performance or forecasts.</footer>
  </main>;
}
