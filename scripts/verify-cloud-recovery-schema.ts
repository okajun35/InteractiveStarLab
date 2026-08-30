import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260830040000_anonymous_mission_recovery.sql");
const hardeningPath = resolve(process.cwd(), "supabase/migrations/20260830041000_harden_anonymous_mission_recovery.sql");
const migration = `${readFileSync(migrationPath, "utf8")}\n${readFileSync(hardeningPath, "utf8")}`;
const normalized = migration.toLowerCase();

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

check("RECOVERY-SCHEMA-1: stores only a recovery-code hash", normalized.includes("recovery_code_hash bytea"));
check("RECOVERY-SCHEMA-1: adds mission access grants", normalized.includes("create table if not exists public.observation_mission_access"));
check("RECOVERY-SCHEMA-1: access grants are unique per mission and user", normalized.includes("primary key (mission_id, user_id)"));
check("RECOVERY-SCHEMA-2: access table has RLS and no direct client grants", normalized.includes("alter table public.observation_mission_access enable row level security") && normalized.includes("revoke all on table public.observation_mission_access from anon, authenticated"));
check("RECOVERY-SCHEMA-2: mission table direct anonymous access is revoked", normalized.includes("revoke all on table public.observation_missions from anon, authenticated"));
check("RECOVERY-SCHEMA-3: access helper is security definer with a fixed search path", normalized.includes("private.has_observation_mission_access") && normalized.includes("security definer") && normalized.includes("set search_path = public"));
check("RECOVERY-SCHEMA-3: create RPC is available only to authenticated sessions", normalized.includes("create_observation_mission_with_recovery") && normalized.includes("grant execute on function public.create_observation_mission_with_recovery") && normalized.includes("to authenticated"));
check("RECOVERY-SCHEMA-3: restore RPC is available only to authenticated sessions", normalized.includes("restore_observation_mission") && normalized.includes("grant execute on function public.restore_observation_mission") && normalized.includes("to authenticated"));
check("RECOVERY-SCHEMA-4: create RPC generates cryptographic random bytes", normalized.includes("gen_random_bytes(16)"));
check("RECOVERY-SCHEMA-4: create RPC hashes the recovery code", normalized.includes("digest(") && normalized.includes("sha256"));
check("RECOVERY-SCHEMA-4: restore RPC adds access idempotently", normalized.includes("on conflict (mission_id, user_id) do nothing"));
check("RECOVERY-SCHEMA-5: existing owner and restored members can read", normalized.includes("for select") && normalized.includes("has_observation_mission_access"));
check("RECOVERY-SCHEMA-5: mission creation is RPC-only", normalized.includes("revoke insert on table public.observation_missions from authenticated"));
check("RECOVERY-SCHEMA-6: recovery errors do not echo the submitted code", normalized.includes("restore_code_invalid") && !normalized.includes("p_recovery_code ||"));
check("RECOVERY-SCHEMA-7: private snapshot policies use mission access", normalized.includes("storage.foldername(name))[1]") && normalized.includes("observation-assets"));
check("RECOVERY-SCHEMA-8: access table has an explicit deny policy", normalized.includes("no direct mission access grants") && normalized.includes("using (false)") && normalized.includes("with check (false)"));
check("RECOVERY-SCHEMA-8: public create RPC is an invoker wrapper", normalized.includes("function public.create_observation_mission_with_recovery") && normalized.includes("security invoker"));
check("RECOVERY-SCHEMA-8: public restore RPC is an invoker wrapper", normalized.includes("function public.restore_observation_mission") && normalized.includes("security invoker"));
check("RECOVERY-SCHEMA-8: definer implementations stay in private schema", normalized.includes("function private.create_observation_mission_with_recovery") && normalized.includes("function private.restore_observation_mission"));

if (failures > 0) process.exit(1);
console.log("\nAll recovery schema checks passed.");
