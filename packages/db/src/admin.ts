import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types.js";

/**
 * Service-role client — bypasses RLS. Use only in server workers (poller, Kairo).
 * Never import from browser or expose SUPABASE_SERVICE_KEY via NEXT_PUBLIC_*.
 */
export function createServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
