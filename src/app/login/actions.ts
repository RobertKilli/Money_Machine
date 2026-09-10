"use server";

import { redirect } from "next/navigation";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function requestMagicLink(formData: FormData): Promise<void> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email.includes("@")) redirect("/login?error=invalid-email");

  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect("/login?error=auth-not-configured");

  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: undefined } });
  if (error) redirect("/login?error=sign-in-unavailable");
  redirect("/login?sent=1");
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
