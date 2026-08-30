import { resolveCloudPersistenceMode } from "../src/cloud/authMode";

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

check("CLOUD-AUTH-1: missing configuration stays local", resolveCloudPersistenceMode(false, null) === "local");
check("CLOUD-AUTH-2: configured without a session stays local during anonymous bootstrap", resolveCloudPersistenceMode(true, null) === "local");
check("CLOUD-AUTH-3: anonymous session enables cloud mode", resolveCloudPersistenceMode(true, "anonymous-user-1") === "cloud");
check("CLOUD-AUTH-4: empty user id stays local", resolveCloudPersistenceMode(true, "") === "local");

if (failures > 0) process.exit(1);
console.log("\nAll cloud auth mode checks passed.");
