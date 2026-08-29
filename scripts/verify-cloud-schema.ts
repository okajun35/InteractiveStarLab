import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260829000000_cloud_observation_missions.sql"), "utf8");
const normalized = migration.toLowerCase();

check("CLOUD-SCHEMA-1: defines the single MVP mission table", normalized.includes("create table if not exists public.observation_missions"));
check("CLOUD-SCHEMA-1: mission row keeps domain payload", normalized.includes("mission jsonb not null") && normalized.includes("record jsonb") && normalized.includes("sky_snapshot jsonb"));
check("CLOUD-SCHEMA-1: mission is owned by auth user", normalized.includes("user_id uuid not null default auth.uid()") && normalized.includes("references auth.users(id)"));
check("CLOUD-SCHEMA-2: planned-at index is present", normalized.includes("observation_missions_user_planned_at_idx"));
check("CLOUD-SCHEMA-2: mission RLS is enabled", normalized.includes("alter table public.observation_missions enable row level security"));
check("CLOUD-SCHEMA-2: anon mission grants are revoked", normalized.includes("revoke all on table public.observation_missions from anon"));
check("CLOUD-SCHEMA-3: select policy checks auth.uid", normalized.includes("users select own observation missions") && normalized.includes("auth.uid() = user_id"));
check("CLOUD-SCHEMA-3: insert policy checks auth.uid", normalized.includes("users insert own observation missions") && normalized.includes("with check (auth.uid() is not null and auth.uid() = user_id)"));
check("CLOUD-SCHEMA-3: update policy keeps user ownership", normalized.includes("users update own observation missions") && normalized.includes("for update"));
check("CLOUD-SCHEMA-4: creates a private asset bucket", normalized.includes("observation-assets', 'observation-assets', false"));
check("CLOUD-SCHEMA-4: asset insert policy scopes the first path segment", normalized.includes("users insert own observation assets") && normalized.includes("storage.foldername(name))[1] = auth.uid()::text"));
check("CLOUD-SCHEMA-4: asset read policy scopes the first path segment", normalized.includes("users select own observation assets"));
check("CLOUD-SCHEMA-5: asset policies do not grant update or delete", !normalized.includes("on storage.objects\nfor update") && !normalized.includes("on storage.objects\nfor delete"));
check("CLOUD-SCHEMA-6: no separate deadline-MVP tables are required", !normalized.includes("create table if not exists public.observation_targets") && !normalized.includes("create table if not exists public.observation_results"));

if (failures > 0) process.exit(1);
console.log("\nAll cloud schema checks passed.");
