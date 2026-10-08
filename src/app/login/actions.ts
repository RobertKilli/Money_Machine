"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { canonicalLoginUrl, getAuthApplicationOrigin, getAuthCallbackUrl, requestMatchesAuthOrigin } from "@/lib/auth/callback-url";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function requestMagicLink(formData: FormData): Promise<void> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email.includes("@")) redirect("/login?error=invalid-email");

  const origin = getAuthApplicationOrigin();
  if (!origin) redirect("/login?error=auth-not-configured");
  if (!requestMatchesAuthOrigin(await headers(), origin)) {
    redirect(canonicalLoginUrl(origin, { error: "auth-not-configured" }));
  }

  const callbackUrl = getAuthCallbackUrl();
  if (!callbackUrl) redirect("/login?error=auth-not-configured");

  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect("/login?error=auth-not-configured");

  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callbackUrl } });
  if (error) redirect("/login?error=sign-in-unavailable");
  redirect("/login?sent=1");
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
