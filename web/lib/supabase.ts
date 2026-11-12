// One Supabase client per page, shared by the marketplace and the moodboards so they see the same session.
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/** The shared client, or null when this build has no Supabase keys. */
export function supabase(url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY): SupabaseClient | null {
  if (client === undefined) client = url && key ? createClient(url, key) : null;
  return client;
}
