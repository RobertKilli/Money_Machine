import { NextResponse } from "next/server";

import { getAuthApplicationOrigin, safePostAuthPath } from "@/lib/auth/callback-url";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const origin = getAuthApplicationOrigin();
  if (!origin) return new Response("Sign-in is temporarily unavailable.", { status: 503 });
  if (requestUrl.origin !== origin) {
    return new Response("Sign-in callback origin is invalid.", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const safeNext = safePostAuthPath(next);

  if (!code) return NextResponse.redirect(new URL("/login?error=oauth-callback", origin));

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.redirect(new URL("/login?error=auth-not-configured", origin));

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=oauth-callback", origin));

  const destination = new URL(safeNext, origin);
  if (destination.origin !== origin) return new Response("Sign-in destination is invalid.", { status: 400 });
  return NextResponse.redirect(destination);
}
