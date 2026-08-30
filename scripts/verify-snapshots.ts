import { createSkySnapshotMetadata } from "../src/snapshots/metadata";
import { canvasToPng } from "../src/snapshots/renderer";
import { createMemorySnapshotStorage } from "../src/snapshots/storage";
import type { SkySnapshotMetadataInput } from "../src/snapshots/types";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

const input: SkySnapshotMetadataInput = {
  site: { id: "home", name: "Home", latitude: 35.68, longitude: 139.76 },
  dateTime: "2026-08-29T11:00:00.000Z",
  view: { azimuth: 180, altitude: 30, fieldOfView: 80 },
  simulation: { daylightMode: "real", lightPollution: "dark-sky", limitingMagnitude: 5.5, showHiddenStars: false },
  layers: { first: true, second: true, third: false, fourth: false, faint: false },
  displayOptions: { stars: true, starNames: true, constellationLines: true, constellationNames: true },
  width: 800,
  height: 600,
  heading: "S 180°",
};

const metadata = createSkySnapshotMetadata(input, {
  id: () => "snapshot-test-1",
  now: () => new Date("2026-08-29T12:00:00.000Z"),
});
check("SNAP-A1: metadata has stable id and PNG filename", metadata.snapshotId === "snapshot-test-1" && metadata.mimeType === "image/png" && metadata.fileName.endsWith(".png"));
check("SNAP-A1: metadata preserves observation conditions", metadata.site.latitude === 35.68 && metadata.dateTime === input.dateTime && metadata.view.azimuth === 180 && metadata.layers.second);

const blob = await canvasToPng({
  width: 800,
  height: 600,
  toBlob(callback) {
    callback(new Blob(["png"], { type: "image/png" }));
  },
});
check("SNAP-A2: canvas is converted to PNG Blob", blob.type === "image/png" && blob.size > 0);
try {
  await canvasToPng({ width: 1, height: 1, toBlob(callback) { callback(null); } });
  check("SNAP-A2: null canvas blob is rejected", false);
} catch {
  check("SNAP-A2: null canvas blob is rejected", true);
}

const storage = createMemorySnapshotStorage();
await storage.save({ ...metadata, blob });
check("SNAP-A3: in-memory storage returns metadata list", (await storage.list())[0]?.snapshotId === metadata.snapshotId);
check("SNAP-A3: in-memory storage returns PNG record", (await storage.get(metadata.snapshotId))?.blob.type === "image/png");
check("SNAP-A3: missing snapshot is null", (await storage.get("missing")) === null);
await storage.remove(metadata.snapshotId);
check("SNAP-A3: remove deletes snapshot", (await storage.list()).length === 0);

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll snapshot domain checks passed.");
