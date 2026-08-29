import { createObservationMission } from "../src/observation/mission";
import { buildMissionSkySnapshot } from "../src/guides/missionSkySnapshot";
import { GUIDE_HORIZON_RADIUS, projectGuidePoint } from "../src/guides/skyProjection";

let failures = 0;
function close(a: number, b: number): boolean { return Math.abs(a - b) < 1e-9; }
function check(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
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
}, { id: () => "mission-snapshot-1", now: new Date("2026-08-29T11:01:00.000Z") });

const north = projectGuidePoint(0, 0);
const east = projectGuidePoint(0, 90);
const south = projectGuidePoint(0, 180);
const west = projectGuidePoint(0, 270);
const zenith = projectGuidePoint(90, 10);
check("snapshot projection north is top", close(north.x, 500) && close(north.y, 500 - GUIDE_HORIZON_RADIUS));
check("snapshot projection east is left", close(east.x, 500 - GUIDE_HORIZON_RADIUS) && close(east.y, 500));
check("snapshot projection south is bottom", close(south.x, 500) && close(south.y, 500 + GUIDE_HORIZON_RADIUS));
check("snapshot projection west is right", close(west.x, 500 + GUIDE_HORIZON_RADIUS) && close(west.y, 500));
check("snapshot projection zenith is center", close(zenith.x, 500) && close(zenith.y, 500));

const first = buildMissionSkySnapshot(mission);
check("snapshot uses all-sky projection", first.projection === "all_sky" && first.width === 1000 && first.height === 1000);
check("snapshot includes every target", first.targetStars.length === 3 && first.targetStars.every((star, index) => star.targetIndex === index + 1));
check("snapshot uses fixed target prediction", first.targetStars[0].altitude === 62 && first.targetStars[0].azimuth === 285);
check("snapshot selects bounded reference stars", first.referenceStars.length > 0 && first.referenceStars.length <= 60 && first.referenceStars.every((star) => star.altitude > 0 && star.magnitude <= 3));
check("snapshot has no duplicate target references", !first.referenceStars.some((star) => first.targetStars.some((target) => target.starId === star.starId)));
check("snapshot coordinates are finite", [...first.targetStars, ...first.referenceStars].every((star) => Number.isFinite(star.x) && Number.isFinite(star.y)));
check("snapshot has constellation lines", first.constellationLines.length > 0);

const changed = { ...mission, siteSnapshot: { ...mission.siteSnapshot, latitude: -33.86, longitude: 151.2 }, dateTime: "2026-08-30T11:00:00.000Z" };
const second = buildMissionSkySnapshot(mission);
check("snapshot is deterministic", JSON.stringify(first) === JSON.stringify(second));
const changedSnapshot = buildMissionSkySnapshot(changed);
check("snapshot model records mission identity", changedSnapshot.missionId === mission.id);
check("snapshot model keeps mission site", changedSnapshot.siteSnapshot.latitude === -33.86);
check("snapshot input mission remains unchanged", mission.siteSnapshot.latitude === 35.68 && mission.dateTime === "2026-08-29T11:00:00.000Z");

if (failures > 0) process.exit(1);
