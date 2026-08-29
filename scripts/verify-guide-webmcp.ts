import { createObservationMission } from "../src/observation/mission";
import { buildObservationGuideModel, createGuideDescriptor } from "../src/guides/model";
import { registerGuideTools } from "../src/mcp/guideTools";
import type { WebMcpModelContext, WebMcpTool } from "../src/mcp/webmcp";

let failures = 0;
function check(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}
const mission = createObservationMission({
  site: { id: "home", name: "Home", latitude: 35.68, longitude: 139.76 },
  dateTime: "2026-08-29T11:00:00.000Z", maxMagnitude: 2,
  targets: [{ starId: "vega", predictedVisible: true, predictedAltitude: 62, predictedAzimuth: 285, predictedMagnitude: 0.03 }],
}, { id: () => "mission-mcp-guide", now: new Date("2026-08-29T11:01:00.000Z") });
let opened = false;
let prepared = buildObservationGuideModel(mission, createGuideDescriptor({ mission, timeZone: "Asia/Tokyo", now: new Date("2026-08-29T11:02:00.000Z") }));
const registered: WebMcpTool[] = [];
const context: WebMcpModelContext = { async registerTool(tool) { registered.push(tool); } };
await registerGuideTools(context, {
  getMissions: () => [mission],
  getSelectedGuide: () => prepared,
  prepareGuide: (missionId, options) => {
    if (missionId !== mission.id) return null;
    prepared = buildObservationGuideModel(mission, createGuideDescriptor({ mission, ...options, now: new Date("2026-08-29T11:02:00.000Z") }));
    return prepared;
  },
  generatePdfForGuide: async (_guide) => ({
    fileName: "observation-guide-20260829.pdf",
    downloadUrl: "blob:https://example.test/guide-pdf",
  }),
  openGuide: () => { opened = true; },
});
check("guide tool registers", registered.length === 1 && registered[0]?.name === "generate_observation_guide");
const tool = registered[0]!;
const result = JSON.parse(String(await tool.execute({ missionId: mission.id, title: "Tonight", durationMinutes: 45, timeZone: "Asia/Tokyo" })));
check("guide tool prepares PDF-ready guide", result.ok && result.data.status === "ready" && result.data.view === "guide" && result.data.pdfGenerated === true && opened);
check("guide tool returns PDF download URL and snapshot metadata", result.data.snapshotIncluded === true && result.data.snapshotSource === "mission" && result.data.snapshotDateTime === mission.dateTime && typeof result.data.downloadUrl === "string" && !JSON.stringify(result).includes("<svg"));
check("guide tool returns filename hint", result.data.fileNameHint === "observation-guide-20260829.pdf");
check("guide options are applied", prepared.descriptor.title === "Tonight" && prepared.descriptor.durationMinutes === 45 && prepared.descriptor.timeZone === "Asia/Tokyo");
const defaults = JSON.parse(String(await tool.execute({ missionId: mission.id })));
check("guide tool supports defaults", defaults.ok && defaults.data.targetCount === 1);
const missing = JSON.parse(String(await tool.execute({ missionId: "missing" })));
check("missing mission is rejected", missing.ok === false && missing.error.code === "MISSION_NOT_FOUND");
const extra = JSON.parse(String(await tool.execute({ missionId: mission.id, unexpected: true })));
check("extra input is rejected", extra.ok === false && extra.error.code === "INVALID_ARGUMENT");
const invalidDuration = JSON.parse(String(await tool.execute({ missionId: mission.id, durationMinutes: 4 })));
check("invalid duration is rejected", invalidDuration.ok === false && invalidDuration.error.code === "INVALID_ARGUMENT");
const invalidTimezone = JSON.parse(String(await tool.execute({ missionId: mission.id, timeZone: "No/SuchZone" })));
check("invalid timezone is rejected", invalidTimezone.ok === false && invalidTimezone.error.code === "INVALID_ARGUMENT");
check("guide tool is a write tool", tool.annotations?.readOnlyHint === false);
check("guide description explains direct PDF action", tool.description.includes("PDF binary") && tool.description.includes("Print / Save as PDF"));
if (failures > 0) process.exit(1);
