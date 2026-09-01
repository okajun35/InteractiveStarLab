import {
  buildSkyContextModel,
  buildCurrentSkyRows,
  directionLabel,
  formatDirection,
  formatSkyDateTime,
  observerSensitivityLabel,
  resolveSkyLocation,
} from "../src/sky/contextModel";
import { mergeSkyActivity } from "../src/state/agentActivity";
import { missionToPlanDraft } from "../src/observation/planDraft";
import { missionToSkyView, formatMissionDateTime } from "../src/observation/missionView";
import type { ObservationMission, ObservationSite } from "../src/types/observation";

let failures = 0;
function check(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!condition) failures += 1;
}

const sydney: ObservationSite = {
  id: "sydney",
  name: "Sydney",
  latitude: -33.8688,
  longitude: 151.2093,
  timeZone: "Australia/Sydney",
};
const date = new Date("2026-09-01T10:00:00.000Z");

check("UX-1: preset location resolves by coordinates", resolveSkyLocation(sydney, sydney).label === "Sydney");
check("UX-1: preset time zone formats the Sky context", formatSkyDateTime(date, sydney, sydney).includes("Sep 1, 2026"));
check("UX-2: direction normalizes all compass boundaries", directionLabel(-1) === "North" && directionLabel(44) === "Northeast" && directionLabel(359) === "North");
check("UX-2: direction includes rounded azimuth", formatDirection(224.4) === "Southwest / 224°");
check("UX-3: sensitivity uses the specified labels", observerSensitivityLabel(0) === "Typical / 0.00" && observerSensitivityLabel(0.25) === "More sensitive / +0.25" && observerSensitivityLabel(-0.25) === "Less sensitive / -0.25");

const model = buildSkyContextModel({
  activeSite: sydney,
  observation: { latitude: sydney.latitude, longitude: sydney.longitude, datetime: date, azimuth: 180, altitude: 30, fieldOfView: 80 },
  simulation: { daylightMode: "real", lightPollution: "dark-sky", limitingMagnitude: 5.5, observerSensitivity: 0, showHiddenStars: false },
  layers: { first: true, second: true, third: false, fourth: false, faint: false },
  displayOptions: { stars: true, starNames: false, constellationLines: true, constellationNames: false },
  metrics: { mode: "compare", baseCount: 12, changedCount: 18 },
  compareLabel: "Sydney",
});
check("UX-4: compare context renders both counts", model.observation.find((row) => row.field === "visibleStars")?.value === "Base 12 · Changed 18");
check("UX-4: brightness layers are display labels", model.visibility.find((row) => row.field === "brightnessLayers")?.value === "1st, 2nd");
const defaultCurrentRows = buildCurrentSkyRows(model, null);
check("UX-4: Current sky starts with core observation fields", defaultCurrentRows.slice(0, 4).map((row) => row.field).join(",") === "location,dateTime,direction,visibleStars");

const first = mergeSkyActivity(null, { toolName: "set_sky_view_settings", at: 1000, changes: [{ field: "direction", before: 180, after: 270 }] });
const batched = mergeSkyActivity(first, { toolName: "set_sky_display_settings", at: 3000, changes: [{ field: "brightnessLayers", before: { first: true }, after: { first: false } }] });
const mergedAgain = mergeSkyActivity(batched, { toolName: "set_sky_view_settings", at: 3500, changes: [{ field: "direction", before: 270, after: 90 }] });
const dynamicCurrentRows = buildCurrentSkyRows(model, { changes: [{ field: "brightnessLayers", before: { first: true }, after: { first: false } }] });
check("UX-4: latest changed fields lead Current sky", dynamicCurrentRows[0]?.field === "brightnessLayers" && dynamicCurrentRows.some((row) => row.field === "location"));
check("UX-4: Current sky stays compact", dynamicCurrentRows.length <= 6);
check("UX-5: 2-second activity boundary batches", batched.id === first.id && batched.toolNames.length === 2);
check("UX-5: repeated changes keep first before and final after", mergedAgain.changes.find((change) => change.field === "direction")?.before === 180 && mergedAgain.changes.find((change) => change.field === "direction")?.after === 90);
const separate = mergeSkyActivity(mergedAgain, { toolName: "set_sky_view_settings", at: 5601, changes: [{ field: "altitude", before: 30, after: 45 }] });
check("UX-5: outside the boundary creates a new activity", separate.id !== mergedAgain.id);

const mission: ObservationMission = {
  id: "ux-mission",
  siteId: sydney.id,
  siteSnapshot: sydney,
  dateTime: date.toISOString(),
  maxMagnitude: 2,
  targets: [{ starId: "vega", predictedVisible: true, predictedAltitude: 95, predictedAzimuth: -10, predictedMagnitude: 0.03 }],
  createdAt: date.toISOString(),
};
const draft = missionToPlanDraft(mission);
const targetSky = missionToSkyView(mission, 80);
check("UX-6: Mission draft copies snapshot conditions", draft.site.timeZone === "Australia/Sydney" && draft.dateTime.toISOString() === date.toISOString() && draft.maxMagnitude === 2);
check("UX-6: target Sky normalizes and clamps the primary target", targetSky?.observation.azimuth === 350 && targetSky.observation.altitude === 90);
check("UX-6: Mission uses its stored zone for date formatting", formatMissionDateTime(mission.dateTime, mission).includes("Sep 1, 2026"));

if (failures > 0) {
  console.log(`\n${failures} WebMCP-first UX check(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log("\nAll WebMCP-first UX checks passed.");
}
