import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260831130748_fix_mission_id_ambiguity.sql");
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8").toLowerCase().replace(/\s+/g, " ")
  : "";

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

check(
  "RECOVERY-AMBIGUITY-1: adds a replacement for the private create implementation",
  migration.includes("create or replace function private.create_observation_mission_with_recovery"),
);
check(
  "RECOVERY-AMBIGUITY-1: uses a variable name distinct from the access-table column",
  migration.includes("mission_key text := trim(p_id)"),
);
check(
  "RECOVERY-AMBIGUITY-1: does not redeclare the ambiguous mission_id variable",
  !migration.includes("mission_id text := trim(p_id)"),
);
check(
  "RECOVERY-AMBIGUITY-2: inserts the renamed variable into the mission row",
  migration.includes("values ( mission_key,"),
);
check(
  "RECOVERY-AMBIGUITY-2: keeps the access primary-key conflict target",
  migration.includes("on conflict (mission_id, user_id) do nothing"),
);

if (failures > 0) process.exit(1);
console.log("\nAll recovery ambiguity checks passed.");
