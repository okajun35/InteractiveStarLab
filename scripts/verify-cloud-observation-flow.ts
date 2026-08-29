import { registerObservationWriteTools } from "../src/mcp/observationWriteTools";
import { registerResultTools } from "../src/mcp/resultTools";
import { createObservationPlanFromStarIds } from "../src/mcp/services";
import { buildObservationRecord } from "../src/mcp/observationWriteServices";
import type { WebMcpModelContext, WebMcpTool } from "../src/mcp/webmcp";
import type { ObservationRecord, ObservationSite } from "../src/types/observation";

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

const site: ObservationSite = { id: "home", name: "Home", latitude: 35.6812, longitude: 139.7671 };
const mission = createObservationPlanFromStarIds({
  site,
  dateTime: "2026-08-29T11:00:00.000Z",
  maxMagnitude: 2,
  starIds: ["vega", "altair"],
}, { id: () => "cloud-flow-mission", now: new Date("2026-08-29T11:01:00.000Z") });

let remoteRecord: ObservationRecord | null = null;
const registeredWrite: WebMcpTool[] = [];
const context: WebMcpModelContext = { async registerTool(tool) { registeredWrite.push(tool); } };
await registerObservationWriteTools(context, {
  getMissions: () => [mission],
  saveResultsForMission: async (missionId, results) => {
    check("CLOUD-FLOW-1: cloud save receives the Mission ID", missionId === mission.id);
    remoteRecord = buildObservationRecord(mission, results, "2026-08-29T12:00:00.000Z");
    return remoteRecord;
  },
});
const save = JSON.parse(String(await registeredWrite[0]!.execute({
  missionId: mission.id,
  results: [
    { starId: "vega", status: "visible" },
    { starId: "altair", status: "not_visible" },
  ],
})));
check("CLOUD-FLOW-1: result tool waits for cloud save", save.ok === true && save.data.saved === true && remoteRecord !== null);
check("CLOUD-FLOW-1: cloud save preserves fixed prediction", remoteRecord?.targets[0].predictedAltitude === mission.targets[0].predictedAltitude);

const registeredRead: WebMcpTool[] = [];
await registerResultTools({ async registerTool(tool) { registeredRead.push(tool); } }, {
  // Deliberately stale local state: a cloud read must win over it.
  getRecords: () => [],
  getSelectedRecordMissionId: () => null,
  isCloudEnabled: () => true,
  getCloudRecord: async (missionId) => missionId === mission.id ? remoteRecord : null,
  getCloudLatestRecord: async () => remoteRecord,
});
const result = JSON.parse(String(await registeredRead.find((tool) => tool.name === "get_observation_results")!.execute({ missionId: mission.id })));
check("CLOUD-FLOW-2: result read uses the cloud record at execution time", result.ok === true && result.data.results[1].observation === "not_visible");

remoteRecord = {
  ...remoteRecord!,
  results: remoteRecord!.results.map((item) => item.starId === "altair" ? { ...item, status: "visible" as const } : item),
};
const latest = JSON.parse(String(await registeredRead.find((tool) => tool.name === "get_observation_results")!.execute({ missionId: mission.id })));
check("CLOUD-FLOW-2: a later read observes remote updates", latest.ok === true && latest.data.results[1].observation === "visible");
check("CLOUD-FLOW-3: result DTO contains no raw persistence object", !JSON.stringify(latest).includes("supabase"));

if (failures > 0) process.exit(1);
console.log("\nAll cloud observation flow checks passed.");
