import { resolveCloudPersistenceMode } from "../src/cloud/authMode";

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

check("CLOUD-AUTH-1: missing configuration stays local", resolveCloudPersistenceMode(false, null) === "local");
check("CLOUD-AUTH-2: configured but signed out requires sign-in", resolveCloudPersistenceMode(true, null) === "sign-in-required");
check("CLOUD-AUTH-3: restored session enables cloud mode", resolveCloudPersistenceMode(true, "user-1") === "cloud");
check("CLOUD-AUTH-4: empty user id is treated as signed out", resolveCloudPersistenceMode(true, "") === "sign-in-required");

if (failures > 0) process.exit(1);
console.log("\nAll cloud auth mode checks passed.");
