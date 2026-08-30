import { createObservationMission } from "../src/observation/mission";
import { createSkySnapshotMetadata } from "../src/snapshots/metadata";
import type { SkySnapshotRecord } from "../src/snapshots/types";
import { MAX_SKY_SNAPSHOT_BYTES, cloudSnapshotReferenceFromRecord, isCloudMissionSnapshotReference, missionSnapshotContextMatches, snapshotRecordFromReference } from "../src/cloud/snapshotReference";

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
}, { id: () => "mission-cloud-snapshot", now: new Date("2026-08-29T11:01:00.000Z") });
const metadata = createSkySnapshotMetadata({
  snapshotId: "snapshot-cloud-1",
  site: mission.siteSnapshot,
  dateTime: mission.dateTime,
  view: { azimuth: 180, altitude: 30, fieldOfView: 80 },
  simulation: { daylightMode: "real", lightPollution: "dark-sky", limitingMagnitude: 5.5, showHiddenStars: false },
  layers: { first: true, second: true, third: false, fourth: false, faint: false },
  displayOptions: { stars: true, starNames: true, constellationLines: true, constellationNames: true },
  width: 800,
  height: 600,
  heading: "south",
});
const record = { ...metadata, blob: new Blob(["png"], { type: "image/png" }) };
const reference = cloudSnapshotReferenceFromRecord(record, mission.id);
check("CLOUD-SNAPSHOT-1: reference is valid", isCloudMissionSnapshotReference(reference));
check("CLOUD-SNAPSHOT-1: path is scoped by Mission and Snapshot", reference.storagePath === "mission-cloud-snapshot/snapshot-cloud-1.png");
check("CLOUD-SNAPSHOT-1: metadata keeps Mission date", reference.dateTime === mission.dateTime);
check("CLOUD-SNAPSHOT-1: metadata keeps current view", reference.view.azimuth === 180 && reference.view.fieldOfView === 80);
check("CLOUD-SNAPSHOT-1: reference has no Blob", !("blob" in reference));
check("CLOUD-SNAPSHOT-2: record can be restored after download", snapshotRecordFromReference(reference, record.blob).blob.type === "image/png");
check("CLOUD-SNAPSHOT-2: restored record keeps Mission link", snapshotRecordFromReference(reference, record.blob).missionId === mission.id);
check("CLOUD-SNAPSHOT-3: invalid reference is rejected", !isCloudMissionSnapshotReference({ ...reference, mimeType: "image/jpeg" }));
check("CLOUD-SNAPSHOT-3: malformed reference is rejected", !isCloudMissionSnapshotReference({ ...reference, view: { azimuth: "bad" } }));
check("CLOUD-SNAPSHOT-4: Mission context matches creation-time date and location", missionSnapshotContextMatches(record, mission));
check("CLOUD-SNAPSHOT-4: different location cannot be linked", !missionSnapshotContextMatches({ ...record, site: { ...record.site, latitude: 35.7 } }, mission));
check("CLOUD-SNAPSHOT-4: different date cannot be linked", !missionSnapshotContextMatches({ ...record, dateTime: "2026-08-29T12:00:00.000Z" }, mission));
let rejectedType = false;
try { cloudSnapshotReferenceFromRecord({ ...record, mimeType: "image/jpeg", blob: new Blob(["jpg"], { type: "image/jpeg" }) } as unknown as SkySnapshotRecord, mission.id); } catch { rejectedType = true; }
check("CLOUD-SNAPSHOT-5: non-PNG assets are rejected", rejectedType);
let rejectedSize = false;
try { cloudSnapshotReferenceFromRecord({ ...record, blob: new Blob([new Uint8Array(MAX_SKY_SNAPSHOT_BYTES + 1)], { type: "image/png" }) }, mission.id); } catch { rejectedSize = true; }
check("CLOUD-SNAPSHOT-5: oversized PNG assets are rejected", rejectedSize);

if (failures > 0) process.exit(1);
console.log("\nAll cloud Snapshot checks passed.");
