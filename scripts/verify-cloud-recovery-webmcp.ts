import { createObservationMission } from "../src/observation/mission";
import { registerRecoveryTools } from "../src/mcp/recoveryTools";
import type { WebMcpModelContext, WebMcpTool } from "../src/mcp/webmcp";

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

const mission = createObservationMission({
  site: { id: "home", name: "Home", latitude: 35.68, longitude: 139.76 },
  dateTime: "2026-08-29T11:00:00.000Z",
  maxMagnitude: 2,
  targets: [{ starId: "vega", predictedVisible: true, predictedAltitude: 62, predictedAzimuth: 285, predictedMagnitude: 0.03 }],
}, { id: () => "recovered-mission-1", now: new Date("2026-08-29T11:01:00.000Z") });

const registered: WebMcpTool[] = [];
let openedObserve = false;
const context: WebMcpModelContext = { async registerTool(tool) { registered.push(tool); } };
await registerRecoveryTools(context, {
  restoreMission: async (code) => {
    if (code !== "ISL-ABCD-1234-EF56-7890-ABCD-1234-EF56-7890") throw new Error("Recovery code is invalid");
    return mission;
  },
  openObserve: () => { openedObserve = true; },
  isCloudEnabled: () => true,
});

const tool = registered[0];
check("CLOUD-RECOVERY-MCP-1: restore tool is registered", tool?.name === "restore_observation_mission");
check("CLOUD-RECOVERY-MCP-1: recovery code is required", tool?.inputSchema.required?.includes("recoveryCode") === true);
const restored = JSON.parse(String(await tool?.execute({ recoveryCode: "ISL-ABCD-1234-EF56-7890-ABCD-1234-EF56-7890" })));
check("CLOUD-RECOVERY-MCP-1: restore returns the Mission id", restored.ok === true && restored.data.missionId === mission.id);
check("CLOUD-RECOVERY-MCP-1: restore opens Observe", openedObserve);
check("CLOUD-RECOVERY-MCP-1: restore does not return the recovery code", restored.ok === true && restored.data.recoveryCode === undefined);
const invalid = JSON.parse(String(await tool?.execute({ recoveryCode: "ISL-INVALID" })));
check("CLOUD-RECOVERY-MCP-2: invalid code is structured", invalid.ok === false && invalid.error.code === "RESTORE_CODE_INVALID");
check("CLOUD-RECOVERY-MCP-2: invalid error does not echo code", invalid.error.message.includes("ISL-INVALID") === false);

if (failures > 0) process.exit(1);
console.log("\nAll cloud recovery WebMCP checks passed.");
