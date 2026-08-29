export interface SupabaseConfig {
  enabled: boolean;
  url: string | null;
  anonKey: string | null;
}

type Environment = Record<string, unknown>;

function defaultEnvironment(): Environment {
  const meta = import.meta as ImportMeta & { env?: Environment };
  return meta.env ?? {};
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function validSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Refuse an accidentally exposed JWT service-role key at the browser boundary. */
function looksLikeServiceRoleKey(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { role?: unknown };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

/**
 * Reads only browser-safe Supabase configuration. Missing or malformed
 * configuration deliberately disables cloud mode instead of failing startup.
 */
export function readSupabaseConfig(environment: Environment = defaultEnvironment()): SupabaseConfig {
  const url = asNonEmptyString(environment.VITE_SUPABASE_URL);
  const anonKey = asNonEmptyString(environment.VITE_SUPABASE_ANON_KEY)
    ?? asNonEmptyString(environment.VITE_SUPABASE_PUBLISHABLE_KEY);
  if (url === null || anonKey === null || !validSupabaseUrl(url) || looksLikeServiceRoleKey(anonKey)) {
    return { enabled: false, url: null, anonKey: null };
  }
  return { enabled: true, url, anonKey };
}

export function isCloudConfigured(environment: Environment = defaultEnvironment()): boolean {
  return readSupabaseConfig(environment).enabled;
}
