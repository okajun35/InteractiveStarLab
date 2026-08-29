import { registerSnapshotTools } from "../src/mcp/snapshotTools";
import { cloudError } from "../src/cloud/errors";
import { createSkySnapshotMetadata } from "../src/snapshots/metadata";
import type { SkySnapshotMetadata, SkySnapshotRecord } from "../src/snapshots/types";
import type { WebMcpModelContext, WebMcpTool } from "../src/mcp/webmcp";

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

const missionId = "cloud-snapshot-webmcp-mission";
const base: SkySnapshotMetadata = createSkySnapshotMetadata({
  snapshotId: "cloud-snapshot-webmcp-1",
  site: { id: "home", name: "Home", latitude: 35.6812, longitude: 139.7671 },
  dateTime: "2026-08-29T11:00:00.000Z",
  view: { azimuth: 180, altitude: 30, fieldOfView: 80 },
  simulation: { daylightMode: "real", lightPollution: "dark-sky", limitingMagnitude: 5.5, showHiddenStars: false },
  layers: { first: true, second: true, third: false, fourth: false, faint: false },
  displayOptions: { stars: true, starNames: true, constellationLines: true, constellationNames: true },
  width: 800,
  height: 600,
  heading: "south",
});
const record: SkySnapshotRecord = { ...base, missionId, blob: new Blob(["png"], { type: "image/png" }) };
const metadata: SkySnapshotMetadata = { ...base, missionId };

const registered: WebMcpTool[] = [];
const context: WebMcpModelContext = { async registerTool(tool) { registered.push(tool); } };
await registerSnapshotTools(context, {
  getMissions: () => [{ id: missionId } as never],
  getCurrentMetadata: () => base,
  captureSnapshot: async () => record,
  downloadRecord: () => "blob:local-download",
  getSnapshots: () => [metadata],
  getSnapshot: async (snapshotId) => snapshotId === record.snapshotId ? record : null,
  isCloudSnapshot: () => true,
  getSnapshotStoragePath: () => "user-1/cloud-snapshot-webmcp-mission/cloud-snapshot-webmcp-1.png",
  getSnapshotAccessUrl: async () => "https://example.invalid/signed-snapshot",
});
const capture = registered.find((tool) => tool.name === "capture_sky_snapshot")!;
const list = registered.find((tool) => tool.name === "list_sky_snapshots")!;
const get = registered.find((tool) => tool.name === "get_sky_snapshot_metadata")!;
const captured = JSON.parse(String(await capture.execute({ missionId, download: false })));
check("CLOUD-SNAPSHOT-MCP-1: capture reports cloud persistence", captured.ok === true && captured.data.persistence === "supabase" && captured.data.storagePath.endsWith(".png"));
check("CLOUD-SNAPSHOT-MCP-1: capture does not mint a signed URL", captured.data.access === undefined);
check("CLOUD-SNAPSHOT-MCP-1: capture does not return PNG bytes", captured.data.metadata.blob === undefined && captured.data.metadata.mimeType === "image/png");
const listed = JSON.parse(String(await list.execute({}))); 
check("CLOUD-SNAPSHOT-MCP-2: list returns metadata only", listed.ok === true && listed.data.snapshots[0].blob === undefined && listed.data.snapshots[0].access === undefined);
const fetched = JSON.parse(String(await get.execute({ snapshotId: record.snapshotId })));
check("CLOUD-SNAPSHOT-MCP-2: metadata creates a short-lived access URL", fetched.ok === true && fetched.data.access.expiresInSeconds === 300);

const authRegistered: WebMcpTool[] = [];
await registerSnapshotTools({ async registerTool(tool) { authRegistered.push(tool); } }, {
  getMissions: () => [{ id: missionId } as never],
  getCurrentMetadata: () => base,
  captureSnapshot: async () => { throw cloudError("AUTH_REQUIRED", "Sign in before using cloud observation storage"); },
  downloadRecord: () => null,
  getSnapshots: () => [],
  getSnapshot: async () => null,
});
const authFailure = JSON.parse(String(await authRegistered[0]!.execute({ download: false })));
check("CLOUD-SNAPSHOT-MCP-3: unauthenticated capture is structured", authFailure.ok === false && authFailure.error.code === "AUTH_REQUIRED");

const validationRegistered: WebMcpTool[] = [];
await registerSnapshotTools({ async registerTool(tool) { validationRegistered.push(tool); } }, {
  getMissions: () => [{ id: missionId } as never],
  getCurrentMetadata: () => base,
  captureSnapshot: async () => { throw new Error("Mission Snapshot is too large"); },
  downloadRecord: () => null,
  getSnapshots: () => [],
  getSnapshot: async () => null,
});
const sizeFailure = JSON.parse(String(await validationRegistered[0]!.execute({ download: false })));
check("CLOUD-SNAPSHOT-MCP-4: oversized assets have a stable error code", sizeFailure.ok === false && sizeFailure.error.code === "SNAPSHOT_TOO_LARGE");

if (failures > 0) process.exit(1);
console.log("\nAll cloud Snapshot WebMCP checks passed.");
