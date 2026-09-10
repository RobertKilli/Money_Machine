import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface CurrentUser {
  readonly id: string;
  readonly email: string | null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
