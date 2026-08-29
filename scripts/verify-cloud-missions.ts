import { createObservationMission } from "../src/observation/mission";
import { cloudMissionFromRow, isObservationMission, missionInsertPayload } from "../src/cloud/missionValidation";

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
    { starId: "altair", predictedVisible: true, predictedAltitude: 48, predictedAzimuth: 160, predictedMagnitude: 0.77 },
  ],
}, { id: () => "mission-cloud-1", now: new Date("2026-08-29T11:01:00.000Z") });

check("CLOUD-MISSION-1: existing Mission is valid", isObservationMission(mission));
const payload = missionInsertPayload(mission, "user-1");
check("CLOUD-MISSION-1: payload keeps Mission ID", payload.id === mission.id);
check("CLOUD-MISSION-1: payload uses authenticated user", payload.user_id === "user-1");
check("CLOUD-MISSION-1: payload plans at Mission datetime", payload.planned_at === mission.dateTime);
check("CLOUD-MISSION-1: payload starts without result or Snapshot", payload.record === null && payload.sky_snapshot === null);
check("CLOUD-MISSION-1: payload preserves fixed target predictions", JSON.stringify(payload.mission) === JSON.stringify(mission));

const row = {
  id: mission.id,
  user_id: "user-1",
  planned_at: mission.dateTime,
  mission,
  record: null,
  sky_snapshot: null,
  guide: null,
  created_at: mission.createdAt,
  updated_at: mission.createdAt,
};
const parsed = cloudMissionFromRow(row);
check("CLOUD-MISSION-2: valid row round-trips", parsed !== null && parsed.mission.id === mission.id);
check("CLOUD-MISSION-2: round-trip keeps altitude", parsed?.mission.targets[0]?.predictedAltitude === 62);
check("CLOUD-MISSION-2: round-trip keeps azimuth", parsed?.mission.targets[0]?.predictedAzimuth === 285);
check("CLOUD-MISSION-2: round-trip keeps predicted visibility", parsed?.mission.targets[0]?.predictedVisible === true);
check("CLOUD-MISSION-2: null record stays null", parsed?.record === null);

const corrupt = cloudMissionFromRow({ ...row, mission: { ...mission, targets: [{ ...mission.targets[0], predictedAltitude: "bad" }] } });
check("CLOUD-MISSION-3: corrupt Mission JSON is rejected", corrupt === null);
const invalidRecord = cloudMissionFromRow({ ...row, record: { missionId: mission.id, results: [] } });
check("CLOUD-MISSION-3: corrupt Result JSON is ignored safely", invalidRecord !== null && invalidRecord.record === null);
check("CLOUD-MISSION-4: Mission clone is independent", payload.mission !== mission && (payload.mission as typeof mission).targets !== mission.targets);

if (failures > 0) process.exit(1);
console.log("\nAll cloud Mission checks passed.");
