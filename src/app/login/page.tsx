import Link from "next/link";

import { GoogleSignInButton } from "@/components/google-sign-in-button";

import { requestMagicLink } from "./actions";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-20">
      <Link className="text-sm text-[var(--muted)]" href="/">← Money Machine</Link>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-7">
        <p className="text-sm font-semibold tracking-[0.15em] text-[var(--accent)]">SIMULATION ONLY</p>
        <h1 className="mt-3 text-3xl font-semibold">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Authentication is provided by Supabase once this deployment has configured its publishable environment values.</p>
        <GoogleSignInButton />
        <div className="my-5 flex items-center gap-3 text-xs text-[var(--muted)]"><span className="h-px flex-1 bg-[var(--border)]" /><span>OR EMAIL</span><span className="h-px flex-1 bg-[var(--border)]" /></div>
        <form action={requestMagicLink} className="mt-6 space-y-3">
          <label className="block text-sm" htmlFor="email">Email</label>
          <input className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2" id="email" name="email" required type="email" />
          <button className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-[#07120f]" type="submit">Email a sign-in link</button>
        </form>
      </div>
    </main>
  );
}
