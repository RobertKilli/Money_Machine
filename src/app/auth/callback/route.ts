import { NextResponse } from "next/server";

import { getAuthApplicationOrigin, safePostAuthPath } from "@/lib/auth/callback-url";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const origin = getAuthApplicationOrigin();
  if (!origin) return new Response("Sign-in is temporarily unavailable.", { status: 503 });
  const safeNext = safePostAuthPath(next);

  if (!code) return NextResponse.redirect(new URL("/login?error=oauth-callback", origin));

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.redirect(new URL("/login?error=auth-not-configured", origin));

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=oauth-callback", origin));

  return NextResponse.redirect(new URL(safeNext, origin));
}
