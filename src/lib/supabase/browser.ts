"use client";

import { createBrowserClient } from "@supabase/ssr";

import { supabasePublicConfig } from "./config";

export function getSupabaseBrowserClient() {
  const config = supabasePublicConfig();
  return config ? createBrowserClient(config.url, config.publishableKey, { auth: { flowType: "pkce" } }) : null;
}
