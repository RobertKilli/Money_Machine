import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface CurrentUser {
  readonly id: string;
  readonly email: string | null;
  readonly role: string | null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null, role: typeof data.user.app_metadata?.role === "string" ? data.user.app_metadata.role : null };
}

export async function requireAdminUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("ADMIN_REQUIRED");
  return user;
}
