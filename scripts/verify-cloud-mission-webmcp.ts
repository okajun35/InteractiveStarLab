import { createObservationMission } from "../src/observation/mission";
import { registerMissionTools } from "../src/mcp/missionTools";
import type { WebMcpModelContext, WebMcpTool } from "../src/mcp/webmcp";

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

const mission = createObservationMission({
  site: { id: "home", name: "Home", latitude: 35.6812, longitude: 139.7671 },
  dateTime: "2026-08-29T11:00:00.000Z",
  maxMagnitude: 2,
  targets: [{ starId: "vega", predictedVisible: true, predictedAltitude: 62, predictedAzimuth: 285, predictedMagnitude: 0.03 }],
}, { id: () => "cloud-mission-webmcp", now: new Date("2026-08-29T11:01:00.000Z") });
let remote = mission;
const registered: WebMcpTool[] = [];
const context: WebMcpModelContext = { async registerTool(tool) { registered.push(tool); } };
await registerMissionTools(context, {
  getMissions: () => [],
  isCloudEnabled: () => true,
  getCloudMission: async (missionId) => missionId === remote.id ? {
    mission: remote,
    record: null,
    skySnapshot: { snapshotId: "snapshot-1", createdAt: "2026-08-29T11:02:00.000Z" },
    guide: null,
    userId: "user-1",
    createdAt: mission.createdAt,
    updatedAt: mission.createdAt,
  } : null,
});
const tool = registered[0]!;
const result = JSON.parse(String(await tool.execute({ missionId: mission.id })));
check("CLOUD-MISSION-MCP-1: cloud Mission can be retrieved by ID", result.ok === true && result.data.missionId === mission.id && result.data.targets[0].predictedAltitude === 62);
check("CLOUD-MISSION-MCP-1: Snapshot status is included", result.data.snapshotArchived === true && result.data.snapshotId === "snapshot-1");
remote = { ...remote, maxMagnitude: 3 };
const updated = JSON.parse(String(await tool.execute({ missionId: mission.id })));
check("CLOUD-MISSION-MCP-2: reads resolve the latest cloud Mission", updated.ok === true && updated.data.maxMagnitude === 3);
const missing = JSON.parse(String(await tool.execute({ missionId: "missing" })));
check("CLOUD-MISSION-MCP-2: unknown Mission is structured", missing.ok === false && missing.error.code === "MISSION_NOT_FOUND");

if (failures > 0) process.exit(1);
console.log("\nAll cloud Mission WebMCP checks passed.");
