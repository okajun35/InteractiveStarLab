import { existsSync, readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const auth = readFileSync(new URL("../src/state/auth.tsx", import.meta.url), "utf8");
const plan = readFileSync(new URL("../src/components/observation/ObservationPlanScreen.tsx", import.meta.url), "utf8");
const run = readFileSync(new URL("../src/components/observation/ObservationRunScreen.tsx", import.meta.url), "utf8");
const history = readFileSync(new URL("../src/components/observation/ObservationHistoryScreen.tsx", import.meta.url), "utf8");
const recoveryPanelPath = new URL("../src/components/observation/RecoveryCodePanel.tsx", import.meta.url);
const recoveryPanel = existsSync(recoveryPanelPath) ? readFileSync(recoveryPanelPath, "utf8") : "";

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

check("RECOVERY-UI-1: application has no email login panel", !app.includes("AuthPanel") && !existsSync(new URL("../src/components/AuthPanel.tsx", import.meta.url)));
check("RECOVERY-UI-1: MCP diagnostics are not shown in the user header", !app.includes("WebMcpStatus") && !existsSync(new URL("../src/components/WebMcpStatus.tsx", import.meta.url)));
check("RECOVERY-UI-1: auth state has no password login API", !auth.includes("signInWithPassword") && !auth.includes("signOut") && !auth.includes("email:"));
check("RECOVERY-UI-2: planner does not disable Mission creation for anonymous bootstrap", !plan.includes("cloudConfigured && !cloudAuthenticated") && !plan.includes("Cloud login"));
check("RECOVERY-UI-2: observation does not disable result save for anonymous bootstrap", !run.includes("cloudConfigured && !cloudAuthenticated") && !run.includes("Cloud login"));
check("RECOVERY-UI-2: cloud persistence mode is not shown to end users", !plan.includes("Cloud persistence mode") && !run.includes("Cloud persistence mode"));
check("RECOVERY-UI-3: creation panel displays and copies the one-time code", recoveryPanel.includes("recoveryCode") && recoveryPanel.includes("navigator.clipboard.writeText") && recoveryPanel.includes("clearRecoveryCode"));
check("RECOVERY-UI-3: creation panel can be dismissed", recoveryPanel.includes("dismiss") && recoveryPanel.includes("will not be shown again"));
check("RECOVERY-UI-4: history provides a recovery form", history.includes("RecoveryMissionForm") && recoveryPanel.includes("Restore Mission with a Recovery Code"));
check("RECOVERY-UI-4: restore errors do not echo the submitted code", recoveryPanel.includes("RESTORE_CODE_INVALID") && !recoveryPanel.includes("recoveryCodeInput} to"));

if (failures > 0) process.exit(1);
console.log("\nAll cloud recovery UI checks passed.");
