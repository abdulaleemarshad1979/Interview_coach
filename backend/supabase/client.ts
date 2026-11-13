import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;
let clientKey = '';

/** Supabase is used for interview data only when a project URL and service-role key are configured. */
export const supabaseConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export function supabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured.');
  if (!client || clientKey !== `${url}|${key}`) {
    // Server-side client: no session persistence or token refresh timers to leak.
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    clientKey = `${url}|${key}`;
  }
  return client;
}
