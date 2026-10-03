export default function Loading() {
  return <main className="mx-auto min-h-screen max-w-7xl px-4 py-10 sm:px-8" aria-busy="true"><p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Event Intelligence</p><div className="mt-6 h-8 w-64 animate-pulse rounded bg-[var(--panel)] motion-reduce:animate-none" /><p className="mt-4 text-sm text-[var(--muted)]">Loading read-only discovery workspace…</p></main>;
}
