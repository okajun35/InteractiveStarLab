import { buildObservationGuideModel, createGuideDescriptor } from "../src/guides/model";
import { registerGuideTools } from "../src/mcp/guideTools";
import { createObservationMission } from "../src/observation/mission";
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
}, { id: () => "cloud-guide-mission", now: new Date("2026-08-29T11:01:00.000Z") });
let prepared = buildObservationGuideModel(mission, createGuideDescriptor({ mission, timeZone: "Asia/Tokyo" }));
let opened = false;
const registered: WebMcpTool[] = [];
const context: WebMcpModelContext = { async registerTool(tool) { registered.push(tool); } };
await registerGuideTools(context, {
  getMissions: () => [mission],
  getSelectedGuide: () => prepared,
  prepareGuide: (missionId, options) => {
    if (missionId !== mission.id) return null;
    prepared = buildObservationGuideModel(mission, createGuideDescriptor({ mission, ...options }));
    return prepared;
  },
  generatePdfForGuide: async (guide) => ({ guideId: guide.descriptor.guideId, missionId: guide.descriptor.missionId, fileName: "observation-guide.pdf", downloadUrl: "blob:guide" }),
  openGuide: () => { opened = true; },
  getSnapshotInfo: async () => ({
    snapshotId: "snapshot-cloud-guide",
    missionId: mission.id,
    storagePath: "user/mission/snapshot.png",
    fileName: "snapshot.png",
    mimeType: "image/png",
    width: 800,
    height: 600,
    createdAt: "2026-08-29T11:01:00.000Z",
    heading: "south",
    site: mission.siteSnapshot,
    dateTime: mission.dateTime,
    view: { azimuth: 180, altitude: 30, fieldOfView: 80 },
    simulation: { daylightMode: "real", lightPollution: "dark-sky", limitingMagnitude: 5.5, showHiddenStars: false },
    layers: { first: true, second: true, third: false, fourth: false, faint: false },
    displayOptions: { stars: true, starNames: true, constellationLines: true, constellationNames: true },
  }),
});
const result = JSON.parse(String(await registered[0]!.execute({ missionId: mission.id })));
check("CLOUD-GUIDE-1: persisted Mission can generate a guide", result.ok === true && result.data.pdfGenerated === true && opened);
check("CLOUD-GUIDE-1: guide keeps the Mission prediction snapshot", prepared.targets[0].altitude === 62 && prepared.targets[0].azimuth === 285 && prepared.dateTime === mission.dateTime);
check("CLOUD-GUIDE-2: PDF download is direct and no binary is returned", result.data.downloadAvailable === true && result.data.pdfBinary === undefined && typeof result.data.downloadUrl === "string");
check("CLOUD-GUIDE-2: guide reports the archived actual Canvas Snapshot", result.data.snapshotArchived === true && result.data.snapshotId === "snapshot-cloud-guide" && result.data.snapshotSource.includes("stored_actual_canvas"));

if (failures > 0) process.exit(1);
console.log("\nAll cloud Guide flow checks passed.");
