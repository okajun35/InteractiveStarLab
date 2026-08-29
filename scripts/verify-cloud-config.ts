import { isCloudConfigured, readSupabaseConfig } from "../src/cloud/config";

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

const disabled = readSupabaseConfig({});
check("CLOUD-CONFIG-1: missing environment disables cloud mode", !disabled.enabled);
check("CLOUD-CONFIG-1: missing environment has no URL", disabled.url === null && disabled.anonKey === null);

const partial = readSupabaseConfig({ VITE_SUPABASE_URL: "https://example.supabase.co" });
check("CLOUD-CONFIG-2: partial environment remains disabled", !partial.enabled);

const invalid = readSupabaseConfig({
  VITE_SUPABASE_URL: "not a URL",
  VITE_SUPABASE_ANON_KEY: "public-key",
});
check("CLOUD-CONFIG-3: malformed URL remains disabled", !invalid.enabled);

const enabled = readSupabaseConfig({
  VITE_SUPABASE_URL: "https://example.supabase.co/",
  VITE_SUPABASE_ANON_KEY: " public-key ",
});
check("CLOUD-CONFIG-4: valid public configuration enables cloud mode", enabled.enabled);
check("CLOUD-CONFIG-4: configuration is trimmed", enabled.url === "https://example.supabase.co/" && enabled.anonKey === "public-key");
check("CLOUD-CONFIG-5: helper agrees with parsed configuration", isCloudConfigured({
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_ANON_KEY: "public-key",
}));
const publishable = readSupabaseConfig({
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
});
check("CLOUD-CONFIG-6: current publishable key name is supported", publishable.enabled && publishable.anonKey === "publishable-key");
const serviceRolePayload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
const serviceRoleKey = `eyJhbGciOiJub25lIn0.${serviceRolePayload}.signature`;
check("CLOUD-CONFIG-7: service role JWT is rejected at the browser boundary", !readSupabaseConfig({
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_ANON_KEY: serviceRoleKey,
}).enabled);

if (failures > 0) process.exit(1);
console.log("\nAll cloud configuration checks passed.");
