import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseConfig } from "./config";

export type CloudClient = SupabaseClient;

let cachedClient: CloudClient | null | undefined;

/** Returns a singleton client only when safe public browser configuration exists. */
export function getSupabaseClient(): CloudClient | null {
  if (cachedClient !== undefined) return cachedClient;
  const config = readSupabaseConfig();
  cachedClient = config.enabled && config.url !== null && config.anonKey !== null
    ? createClient(config.url, config.anonKey)
    : null;
  return cachedClient;
}

/** Test-only reset; it does not expose secrets or change runtime behaviour. */
export function resetSupabaseClientForTests(): void {
  cachedClient = undefined;
}
