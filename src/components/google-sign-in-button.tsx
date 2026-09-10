"use client";

import { useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function GoogleSignInButton() {
  const [error, setError] = useState(false);

  async function signInWithGoogle() {
    setError(false);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError(true);
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (signInError || !data.url) {
      setError(true);
      return;
    }
    window.location.assign(data.url);
  }

  return (
    <div className="space-y-2">
      <button className="w-full rounded-lg border border-[var(--border)] px-4 py-2 font-semibold" onClick={signInWithGoogle} type="button">
        Continue with Google
      </button>
      {error ? <p className="text-sm text-red-400">Google sign-in is unavailable. Try again or use email login.</p> : null}
    </div>
  );
}
