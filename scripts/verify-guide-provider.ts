import { createObservationMission } from "../src/observation/mission";
import { buildObservationGuideModel, createGuideDescriptor } from "../src/guides/model";

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

const mission = createObservationMission({
  site: { id: "home", name: "Home", latitude: 35.68, longitude: 139.76 },
  dateTime: "2026-08-29T11:00:00.000Z",
  maxMagnitude: 2,
  targets: [
    { starId: "vega", predictedVisible: true, predictedAltitude: 62, predictedAzimuth: 285, predictedMagnitude: 0.03 },
  ],
}, { id: () => "mission-provider-1", now: new Date("2026-08-29T11:01:00.000Z") });
const descriptor = createGuideDescriptor({ mission, timeZone: "Asia/Tokyo", now: new Date("2026-08-29T11:02:00.000Z") });
const guide = buildObservationGuideModel(mission, descriptor);
check("provider model resolves mission and descriptor", guide.descriptor.missionId === mission.id && guide.skySnapshot.missionId === mission.id);
check("provider model includes printable data", guide.targets.length === 1 && guide.locationText === "Home (35.68, 139.76)" && guide.endDateTime === "2026-08-29T11:30:00.000Z");
const changedMission = { ...mission, siteSnapshot: { ...mission.siteSnapshot, latitude: -33.86 }, dateTime: "2026-08-30T11:00:00.000Z" };
const unchangedGuide = buildObservationGuideModel(mission, descriptor);
check("current viewer changes cannot mutate existing mission guide", JSON.stringify(guide) === JSON.stringify(unchangedGuide));
check("descriptor is copied into model", guide.descriptor !== descriptor && guide.descriptor.guideId === descriptor.guideId);
check("unrelated mission change produces another model", buildObservationGuideModel(changedMission, { ...descriptor, missionId: changedMission.id }).site.latitude === -33.86);
if (failures > 0) process.exit(1);

