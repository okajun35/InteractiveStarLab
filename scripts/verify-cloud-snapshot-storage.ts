import { createObservationMission } from "../src/observation/mission";
import { createSkySnapshotMetadata } from "../src/snapshots/metadata";
import { createSupabaseSnapshotStorage } from "../src/cloud/snapshotStorage";
import type { CloudMissionRepository } from "../src/cloud/missionRepository";
import type { CloudMissionSnapshotReference } from "../src/cloud/snapshotReference";

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
}, { id: () => "mission-storage-1", now: new Date("2026-08-29T11:01:00.000Z") });
const metadata = createSkySnapshotMetadata({
  snapshotId: "snapshot-storage-1",
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
const blob = new Blob(["png-bytes"], { type: "image/png" });
const record = { ...metadata, blob };
let linked: CloudMissionSnapshotReference | null = null;
const missionRepository = {
  async createMission() { throw new Error("unused"); },
  async listMissions() { return []; },
  async getMission() { return { mission, record: null, skySnapshot: null, guide: null, userId: "user-1", createdAt: mission.createdAt, updatedAt: mission.createdAt }; },
  async saveRecord() { throw new Error("unused"); },
  async attachSnapshot(_missionId: string, snapshot: unknown) { linked = snapshot as CloudMissionSnapshotReference; return { mission, record: null, skySnapshot: snapshot, guide: null, userId: "user-1", createdAt: mission.createdAt, updatedAt: mission.createdAt }; },
} satisfies CloudMissionRepository;

let uploadedPath = "";
let uploadedOptions: Record<string, unknown> | null = null;
const fakeStorage = {
  from(_bucket: string) {
    return {
      async upload(path: string, uploadedBlob: Blob, options: Record<string, unknown>) {
        uploadedPath = path;
        uploadedOptions = options;
        check("CLOUD-STORAGE-1: upload receives PNG Blob", uploadedBlob === blob);
        return { data: { path }, error: null };
      },
      async download(path: string) {
        check("CLOUD-STORAGE-2: download uses stored path", path === uploadedPath);
        return { data: blob, error: null };
      },
      async createSignedUrl(path: string, expires: number) {
        check("CLOUD-STORAGE-3: signed URL uses stored path", path === uploadedPath);
        check("CLOUD-STORAGE-3: signed URL uses finite expiry", expires === 300);
        return { data: { signedUrl: "https://example.invalid/snapshot-signed" }, error: null };
      },
    };
  },
};

const storage = createSupabaseSnapshotStorage({ storage: fakeStorage } as any, missionRepository);
const reference = await storage.saveMissionSnapshot({ missionId: mission.id, record });
check("CLOUD-STORAGE-1: upload path is Mission/Snapshot", uploadedPath === "mission-storage-1/snapshot-storage-1.png");
check("CLOUD-STORAGE-1: upload forbids overwrite", uploadedOptions?.upsert === false);
check("CLOUD-STORAGE-1: DB link receives reference", linked?.storagePath === uploadedPath);
check("CLOUD-STORAGE-1: reference excludes Blob", !("blob" in reference));

const downloaded = await storage.getMissionSnapshot(reference);
check("CLOUD-STORAGE-2: download returns a PNG record", downloaded?.blob === blob && downloaded.mimeType === "image/png");
check("CLOUD-STORAGE-2: downloaded record keeps Mission ID", downloaded?.missionId === mission.id);
check("CLOUD-STORAGE-3: access returns signed URL", await storage.createAccessUrl(reference) === "https://example.invalid/snapshot-signed");

if (failures > 0) process.exit(1);
console.log("\nAll cloud Snapshot Storage checks passed.");
