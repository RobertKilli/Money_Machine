import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { canonicalLoginUrl, getAuthApplicationOrigin, getAuthCallbackUrl, requestMatchesAuthOrigin } from "@/lib/auth/callback-url";

import { requestMagicLink } from "./actions";
import { getLoginNotice } from "./notices";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; sent?: string | string[] }> }) {
  const params = await searchParams;
  const origin = getAuthApplicationOrigin();
  if (origin && !requestMatchesAuthOrigin(await headers(), origin)) {
    redirect(canonicalLoginUrl(origin, params));
  }
  const notice = getLoginNotice(params);
  const callbackUrl = getAuthCallbackUrl();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-20">
      <Link className="text-sm text-[var(--muted)]" href="/">← Money Machine</Link>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-7">
        <p className="text-sm font-semibold tracking-[0.15em] text-[var(--accent)]">SIMULATION ONLY</p>
        <h1 className="mt-3 text-3xl font-semibold">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Authentication is provided by Supabase once this deployment has configured its publishable environment values.</p>
        {notice ? <p aria-live="polite" className={`mt-4 rounded-lg border p-3 text-sm ${notice.kind === "error" ? "border-red-500/50 text-red-300" : "border-emerald-500/50 text-emerald-300"}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.message}</p> : null}
        <GoogleSignInButton callbackUrl={callbackUrl} />
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
