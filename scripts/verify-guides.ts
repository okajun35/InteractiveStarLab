import { createObservationMission } from "../src/observation/mission";
import { buildGuideLocationText, buildGuidePrimaryDirection, buildGuideTargets, createGuideDescriptor } from "../src/guides/model";
import { directionFromAzimuth, primaryDirection } from "../src/guides/direction";
import { guideDifficulty } from "../src/guides/difficulty";
import { formatGuideDate, formatGuideTimeRange } from "../src/guides/time";
import { GUIDE_STORAGE_KEY, loadGuideState, saveGuideState, upsertGuideDescriptor, type GuideStorageLike } from "../src/guides/storage";

let failures = 0;
function check(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}
function expectThrow(name: string, action: () => void): void {
  try { action(); check(name, false, "expected exception"); } catch { check(name, true); }
}
class MemoryStorage implements GuideStorageLike {
  private value: string | null = null;
  getItem(): string | null { return this.value; }
  setItem(_key: string, value: string): void { this.value = value; }
  removeItem(): void { this.value = null; }
}

const mission = createObservationMission({
  site: { id: "home", name: "Home", latitude: 35.68, longitude: 139.76 },
  dateTime: "2026-08-29T11:00:00.000Z",
  maxMagnitude: 2,
  targets: [
    { starId: "vega", predictedVisible: true, predictedAltitude: 62, predictedAzimuth: 285, predictedMagnitude: 0.03 },
    { starId: "altair", predictedVisible: true, predictedAltitude: 48, predictedAzimuth: 160, predictedMagnitude: 0.77 },
    { starId: "deneb", predictedVisible: true, predictedAltitude: 41, predictedAzimuth: 320, predictedMagnitude: 1.25 },
  ],
}, { id: () => "mission-guide-1", now: new Date("2026-08-29T10:00:00.000Z") });
const descriptor = createGuideDescriptor({ mission, timeZone: "Asia/Tokyo", now: new Date("2026-08-29T10:01:00.000Z") });
const targets = buildGuideTargets(mission);
check("guide descriptor uses mission ID", descriptor.guideId === "guide-mission-guide-1");
check("guide descriptor defaults and timezone", descriptor.title === "Star Observation Guide" && descriptor.durationMinutes === 30 && descriptor.timeZone === "Asia/Tokyo");
check("guide targets keep mission prediction", targets[0].altitude === 62 && targets[0].azimuth === 285 && targets[0].magnitude === 0.03);
check("guide target numbering starts at one", targets[0].index === 1 && targets[2].index === 3);
check("guide direction boundary", directionFromAzimuth(22.4) === "N" && directionFromAzimuth(22.5) === "NE" && directionFromAzimuth(-45) === "NW");
check("guide difficulty boundaries", guideDifficulty(1.5, 25) === "easy" && guideDifficulty(3.01, 25) === "hard" && guideDifficulty(2, 20) === "medium");
check("primary direction handles compact targets", primaryDirection([280, 285, 290]) === "W");
check("primary direction detects spread", primaryDirection([0, 180]) === "Multiple directions");
check("guide location is rounded", buildGuideLocationText(mission) === "Home (35.68, 139.76)");
check("guide date formatting uses timezone", formatGuideDate(mission.dateTime, "Asia/Tokyo") === "August 29, 2026");
check("guide time range adds duration", formatGuideTimeRange(mission.dateTime, 30, "Asia/Tokyo") === "20:00–20:30");
expectThrow("invalid timezone rejected", () => createGuideDescriptor({ mission, timeZone: "No/SuchZone" }));
expectThrow("invalid duration rejected", () => createGuideDescriptor({ mission, durationMinutes: 4 }));
expectThrow("invalid title rejected", () => createGuideDescriptor({ mission, title: " " }));

const storage = new MemoryStorage();
let state = loadGuideState(storage);
check("empty guide storage loads safely", state.descriptors.length === 0 && state.selectedGuideId === null);
state = upsertGuideDescriptor(state, descriptor);
check("guide descriptor upsert selects guide", state.descriptors.length === 1 && state.selectedGuideId === descriptor.guideId);
check("guide storage round trip", saveGuideState(state, storage) && loadGuideState(storage).descriptors[0]?.missionId === mission.id);
storage.setItem(GUIDE_STORAGE_KEY, "{broken");
check("corrupt guide storage falls back safely", loadGuideState(storage).descriptors.length === 0);
storage.setItem(GUIDE_STORAGE_KEY, JSON.stringify({ version: 1, selectedGuideId: descriptor.guideId, descriptors: [{ ...descriptor, timeZone: "No/SuchZone" }] }));
check("invalid timezone in guide storage falls back safely", loadGuideState(storage).descriptors.length === 0);
storage.setItem(GUIDE_STORAGE_KEY, JSON.stringify({ version: 1, selectedGuideId: "bad", descriptors: [{ ...descriptor }, { ...descriptor, guideId: "bad-guide" }] }));
check("invalid descriptor is ignored while valid guide remains", loadGuideState(storage).descriptors.length === 1 && loadGuideState(storage).descriptors[0]?.guideId === descriptor.guideId);

if (failures > 0) process.exit(1);
