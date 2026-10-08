import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { logAuthCallbackDiagnostic } from "@/lib/auth/callback-diagnostics";
import { getAuthApplicationOrigin, safePostAuthPath } from "@/lib/auth/callback-url";
import { hasExpectedPkceVerifierCookie } from "@/lib/auth/pkce-verifier-cookie";
import { supabasePublicConfig } from "@/lib/supabase/config";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const origin = getAuthApplicationOrigin();
  if (!origin) return new Response("Sign-in is temporarily unavailable.", { status: 503 });
  if (requestUrl.origin !== origin) {
    logAuthCallbackDiagnostic("AUTH_CALLBACK_WRONG_ORIGIN");
    return new Response("Sign-in callback origin is invalid.", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const safeNext = safePostAuthPath(next);

  if (!code) {
    logAuthCallbackDiagnostic("AUTH_CALLBACK_MISSING_CODE");
    return NextResponse.redirect(new URL("/login?error=oauth-callback", origin));
  }

  const config = supabasePublicConfig();
  if (!config) return NextResponse.redirect(new URL("/login?error=auth-not-configured", origin));
  const cookieStore = await cookies();
  if (!hasExpectedPkceVerifierCookie(cookieStore.getAll(), config.url)) {
    logAuthCallbackDiagnostic("AUTH_CALLBACK_PKCE_VERIFIER_MISSING");
    return NextResponse.redirect(new URL("/login?error=oauth-callback", origin));
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.redirect(new URL("/login?error=auth-not-configured", origin));

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    logAuthCallbackDiagnostic("AUTH_CALLBACK_EXCHANGE_REJECTED", error);
    return NextResponse.redirect(new URL("/login?error=oauth-callback", origin));
  }
  logAuthCallbackDiagnostic("AUTH_CALLBACK_EXCHANGE_SUCCEEDED");

  const destination = new URL(safeNext, origin);
  if (destination.origin !== origin) return new Response("Sign-in destination is invalid.", { status: 400 });
  return NextResponse.redirect(destination);
}
