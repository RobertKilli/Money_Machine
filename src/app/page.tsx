import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-8 px-6 py-20">
      <p className="text-sm font-semibold tracking-[0.18em] text-[var(--accent)]">MONEY MACHINE</p>
      <div className="max-w-2xl space-y-5">
        <h1 className="text-5xl font-semibold tracking-tight">A simulation-first financial workflow.</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">Virtual capital, deterministic rules, and auditable state transitions. No real money, brokers, or investment execution.</p>
      </div>
      <div className="flex gap-3">
        <Link className="rounded-lg bg-[var(--accent)] px-5 py-3 font-semibold text-[#07120f]" href="/login">Sign in</Link>
        <Link className="rounded-lg border border-[var(--border)] px-5 py-3 text-[var(--muted)]" href="/dashboard">Dashboard</Link>
      </div>
    </main>
  );
}
