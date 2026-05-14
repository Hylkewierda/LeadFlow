import { createClient } from "@supabase/supabase-js";

let cached = null;

export function browserSupabase() {
  if (cached) return cached;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. See README.",
    );
  }
  cached = createClient(url, anon);
  return cached;
}
