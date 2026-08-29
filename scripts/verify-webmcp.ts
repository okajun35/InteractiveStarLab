// Core WebMCP domain/service checks.
// Run: node scripts/run-verify.cjs verify-webmcp.ts
import {
  compareObservationRecordDetailed,
  createObservationPlanFromStarIds,
  getCurrentSkyState,
  observationRecordToToolResult,
  predictVisibleStars,
} from "../src/mcp/services";
import { registerReadTools } from "../src/mcp/registerTools";
import { registerPlanTools } from "../src/mcp/writeTools";
import { registerResultTools } from "../src/mcp/resultTools";
import { getModelContext } from "../src/mcp/webmcp";
import { registerSkyControlTools } from "../src/mcp/skyControlTools";
import { registerObservationWriteTools } from "../src/mcp/observationWriteTools";
import { registerResultNavigationTools } from "../src/mcp/resultNavigationTools";
import { registerSnapshotTools } from "../src/mcp/snapshotTools";
import { createSkySnapshotMetadata } from "../src/snapshots/metadata";
import type { SkySnapshotMetadata, SkySnapshotRecord } from "../src/snapshots/types";
import {
  applySkyDisplaySettingsPatch,
  applySkyViewSettingsPatch,
  applyObservationSitePatch,
  normalizeObservationSitePatch,
  normalizeSkyDisplaySettingsPatch,
  normalizeSkyViewSettingsPatch,
} from "../src/mcp/skyControlServices";
import {
  buildObservationRecord,
  normalizeObservationResults,
} from "../src/mcp/observationWriteServices";
import type { WebMcpModelContext, WebMcpTool } from "../src/mcp/webmcp";
import type { ObservationSettings, SimulationSettings } from "../src/types/astronomy";
import type { ObservationRecord, ObservationSite } from "../src/types/observation";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

const site: ObservationSite = {
  id: "home",
  name: "Home",
  latitude: 35.6812,
  longitude: 139.7671,
};
const night = "2026-08-29T11:00:00.000Z";

// MCP-A1: arbitrary-date prediction delegates to the existing astronomy math.
{
  const result = predictVisibleStars({ site, dateTime: night, maxMagnitude: 2 });
  check("MCP-A1: prediction returns ISO datetime", result.dateTime === night, result.dateTime);
  check("MCP-A1: prediction uses the requested site", result.site.id === site.id);
  check(
    "MCP-A1: candidates are above horizon and within magnitude",
    result.stars.length > 0 && result.stars.every((star) => star.altitude > 0 && star.magnitude <= 2),
    `${result.stars.length} stars`,
  );
  check(
    "MCP-A1: candidates are sorted by magnitude",
    result.stars.every((star, i) => i === 0 || star.magnitude >= result.stars[i - 1].magnitude),
  );
}

// MCP-F: the agent can open the human-facing Sky screen without mutating settings.
{
  const registered: WebMcpTool[] = [];
  let openedSky = false;
  const modelContext: WebMcpModelContext = {
    async registerTool(tool) {
      registered.push(tool);
    },
  };
  const observation: ObservationSettings = {
    latitude: site.latitude,
    longitude: site.longitude,
    datetime: new Date(night),
    azimuth: 180,
    altitude: 30,
    fieldOfView: 80,
  };
  await registerSkyControlTools(modelContext, {
    getObservationSettings: () => observation,
    openSky: () => {
      openedSky = true;
    },
  });
  const openTool = registered.find((tool) => tool.name === "open_sky_view");
  check("MCP-F1: registers open_sky_view", openTool !== undefined);
  const opened = JSON.parse(String(await openTool!.execute({})));
  check("MCP-F1: open_sky_view opens Sky and returns current view", opened.ok === true && opened.data.view === "sky" && opened.data.azimuth === 180 && opened.data.fieldOfView === 80 && openedSky);
  const invalid = JSON.parse(String(await openTool!.execute({ unexpected: true })));
  check("MCP-F2: open_sky_view rejects extra input", invalid.ok === false && invalid.error.code === "INVALID_ARGUMENT");
  check("MCP-F2: open_sky_view is a UI write tool", openTool!.annotations?.readOnlyHint === false);
}

// MCP-G: site and view settings are strict, synchronized, and do not mutate Missions.
{
  const registered: WebMcpTool[] = [];
  const modelContext: WebMcpModelContext = {
    async registerTool(tool) {
      registered.push(tool);
    },
  };
  let currentSite = { ...site };
  let currentObservation: ObservationSettings = {
    latitude: site.latitude,
    longitude: site.longitude,
    datetime: new Date(night),
    azimuth: 180,
    altitude: 30,
    fieldOfView: 80,
  };
  await registerSkyControlTools(modelContext, {
    getObservationSite: () => currentSite,
    getObservationSettings: () => currentObservation,
    updateObservationSite: (patch) => {
      currentSite = { ...currentSite, ...patch };
    },
    updateObservationSettings: (patch) => {
      currentObservation = { ...currentObservation, ...patch };
    },
    openSky: () => undefined,
  });
  const siteTool = registered.find((tool) => tool.name === "set_observation_site")!;
  const viewTool = registered.find((tool) => tool.name === "set_sky_view_settings")!;
  const siteResult = JSON.parse(String(await siteTool.execute({ name: " Tokyo ", latitude: 35.7, longitude: 139.8 })));
  check("MCP-G1: site tool updates site and Sky location", siteResult.ok === true && siteResult.data.site.name === "Tokyo" && currentSite.latitude === 35.7 && currentObservation.longitude === 139.8);
  const viewResult = JSON.parse(String(await viewTool.execute({ dateTime: "2026-08-29T12:00:00.000Z", azimuth: 90 })));
  check("MCP-G1: view tool applies partial settings", viewResult.ok === true && viewResult.data.dateTime === "2026-08-29T12:00:00.000Z" && viewResult.data.azimuth === 90 && viewResult.data.altitude === 30);
  const invalidSite = JSON.parse(String(await siteTool.execute({ latitude: 91, longitude: 0 })));
  check("MCP-G2: invalid site input returns failure", invalidSite.ok === false && invalidSite.error.code === "INVALID_ARGUMENT");
  const emptyView = JSON.parse(String(await viewTool.execute({})));
  check("MCP-G2: empty view patch returns failure", emptyView.ok === false && emptyView.error.code === "INVALID_ARGUMENT");
  const normalized = normalizeObservationSitePatch({ name: " Home ", latitude: 0, longitude: 0 });
  check("MCP-G3: site normalization trims only the display name", applyObservationSitePatch(site, normalized).name === "Home");
}

// MCP-I: result saving validates every target and calls one atomic persistence action.
{
  const mission = createObservationPlanFromStarIds(
    { site, dateTime: night, maxMagnitude: 2, starIds: ["vega", "altair"] },
    { id: () => "mission-mcp-i", now: new Date("2026-08-29T11:01:00.000Z") },
  );
  const registered: WebMcpTool[] = [];
  let saves = 0;
  let savedRecord: ObservationRecord | null = null;
  const modelContext: WebMcpModelContext = {
    async registerTool(tool) {
      registered.push(tool);
    },
  };
  await registerObservationWriteTools(modelContext, {
    getMissions: () => [mission],
    saveResultsForMission: (missionId, results) => {
      saves += 1;
      savedRecord = buildObservationRecord(mission, results, "2026-08-29T12:00:00.000Z");
      return savedRecord;
    },
  });
  const saveTool = registered[0]!;
  const saved = JSON.parse(String(await saveTool.execute({
    missionId: mission.id,
    results: [
      { starId: "altair", status: "not_visible" },
      { starId: "vega", status: "visible" },
    ],
  })));
  check("MCP-I1: save tool registers and saves complete user results", saved.ok === true && saved.data.saved === true && saved.data.summary.visible === 1 && saves === 1 && savedRecord?.results[0].starId === "vega");
  check("MCP-I1: save tool preserves prediction snapshot", savedRecord?.targets[0].predictedAltitude === mission.targets[0].predictedAltitude && savedRecord?.dateTime === mission.dateTime);
  const invalid = JSON.parse(String(await saveTool.execute({ missionId: mission.id, results: [{ starId: "vega", status: "visible" }] })));
  check("MCP-I2: incomplete results are rejected before save", invalid.ok === false && invalid.error.code === "INVALID_ARGUMENT" && saves === 1);
  const missing = JSON.parse(String(await saveTool.execute({ missionId: "missing", results: [] })));
  check("MCP-I2: missing Mission returns a not-found error", missing.ok === false && missing.error.code === "MISSION_NOT_FOUND" && saves === 1);
  check("MCP-I3: save description requires explicit user observations", saveTool.description.includes("explicitly reported by the user"));
}

// MCP-A2: invalid Tool arguments fail before astronomy calculation.
// MCP-J: saved results can be selected and opened in the human-facing Results screen.
{
  const record: ObservationRecord = {
    missionId: "mission-mcp-j",
    siteId: site.id,
    siteSnapshot: site,
    dateTime: night,
    targets: [
      { starId: "vega", predictedVisible: true, predictedAltitude: 62, predictedAzimuth: 285, predictedMagnitude: 0.03 },
      { starId: "altair", predictedVisible: true, predictedAltitude: 48, predictedAzimuth: 85, predictedMagnitude: 0.77 },
    ],
    results: [
      { starId: "vega", status: "visible" },
      { starId: "altair", status: "not_visible" },
    ],
    completedAt: "2026-08-29T12:00:00.000Z",
  };
  const registered: WebMcpTool[] = [];
  let selectedMissionId: string | null = null;
  let openedResults = false;
  const modelContext: WebMcpModelContext = { async registerTool(tool) { registered.push(tool); } };
  await registerResultNavigationTools(modelContext, {
    getRecords: () => [record],
    getSelectedRecordMissionId: () => selectedMissionId,
    selectRecord: (missionId) => { selectedMissionId = missionId; },
    openResults: () => { openedResults = true; },
  });
  const openTool = registered[0]!;
  const opened = JSON.parse(String(await openTool.execute({ missionId: record.missionId })));
  check("MCP-J1: open results selects the requested record", opened.ok === true && opened.data.view === "results" && opened.data.missionId === record.missionId && selectedMissionId === record.missionId && openedResults);
  selectedMissionId = null;
  const latest = JSON.parse(String(await openTool.execute({})));
  check("MCP-J1: open results falls back to the newest record", latest.ok === true && latest.data.missionId === record.missionId);
  const missing = JSON.parse(String(await openTool.execute({ missionId: "missing" })));
  check("MCP-J2: unknown record returns a failure envelope", missing.ok === false && missing.error.code === "RESULT_NOT_FOUND");
  const invalid = JSON.parse(String(await openTool.execute({ missionId: " " })));
  check("MCP-J2: blank mission ID returns a failure envelope", invalid.ok === false && invalid.error.code === "INVALID_ARGUMENT");
}

// MCP-A2: invalid Tool arguments fail before astronomy calculation.
// MCP-H: display settings apply to the Sky viewer while remaining separate from Mission selection.
{
  const registered: WebMcpTool[] = [];
  const modelContext: WebMcpModelContext = {
    async registerTool(tool) {
      registered.push(tool);
    },
  };
  let displayOptions = { stars: true, starNames: true, constellationLines: true, constellationNames: true };
  let layers = { first: true, second: true, third: false, fourth: false, faint: false };
  let simulation: SimulationSettings = { daylightMode: "real", lightPollution: "dark-sky", limitingMagnitude: 5.5, showHiddenStars: false };
  await registerSkyControlTools(modelContext, {
    getObservationSite: () => site,
    getObservationSettings: () => ({ latitude: site.latitude, longitude: site.longitude, datetime: new Date(night), azimuth: 180, altitude: 30, fieldOfView: 80 }),
    updateObservationSite: () => undefined,
    updateObservationSettings: () => undefined,
    getDisplayOptions: () => displayOptions,
    getLayers: () => layers,
    getSimulationSettings: () => simulation,
    updateDisplayOptions: (patch) => { displayOptions = { ...displayOptions, ...patch }; },
    setLayerEnabled: (layer, enabled) => { layers = { ...layers, [layer]: enabled }; },
    setDaylightMode: (mode) => { simulation = { ...simulation, daylightMode: mode }; },
    setLightPollution: (level) => { simulation = { ...simulation, lightPollution: level, limitingMagnitude: level === "city-center" ? 1.5 : level === "urban" ? 2.5 : level === "suburban" ? 4 : level === "dark-sky" ? 5.5 : 6.5 }; },
    setLimitingMagnitude: (value) => { simulation = { ...simulation, limitingMagnitude: value }; },
    setObserverSensitivity: (value) => { simulation = { ...simulation, observerSensitivity: value }; },
    setShowHiddenStars: (value) => { simulation = { ...simulation, showHiddenStars: value }; },
    openSky: () => undefined,
  });
  const displayTool = registered.find((tool) => tool.name === "set_sky_display_settings")!;
  const result = JSON.parse(String(await displayTool.execute({ firstMagnitude: true, secondMagnitude: false, lightPollution: "urban", limitingMagnitude: 3.2, showHiddenStars: true })));
  check("MCP-H1: display tool updates layers and simulation", result.ok === true && result.data.layers.first === true && result.data.layers.second === false && simulation.lightPollution === "urban" && simulation.limitingMagnitude === 3.2 && simulation.showHiddenStars);
  check("MCP-H1: display tool does not expose Mission maxMagnitude", !Object.prototype.hasOwnProperty.call(result.data, "maxMagnitude"));
  const presetResult = JSON.parse(String(await displayTool.execute({ lightPollution: "city-center" })));
  check("MCP-H1: light-pollution preset updates its limiting magnitude", presetResult.ok === true && simulation.lightPollution === "city-center" && simulation.limitingMagnitude === 1.5 && presetResult.data.simulation.limitingMagnitude === 1.5);
  const invalid = JSON.parse(String(await displayTool.execute({ limitingMagnitude: 9 })));
  check("MCP-H2: display tool rejects unsupported magnitude", invalid.ok === false && invalid.error.code === "INVALID_ARGUMENT");
  const empty = JSON.parse(String(await displayTool.execute({})));
  check("MCP-H2: display tool rejects empty patch", empty.ok === false && empty.error.code === "INVALID_ARGUMENT");
}

// MCP-A2: invalid Tool arguments fail before astronomy calculation.
for (const [name, input] of [
  ["invalid datetime", { site, dateTime: "not-a-date", maxMagnitude: 2 }],
  ["invalid magnitude", { site, dateTime: night, maxMagnitude: 9 }],
] as const) {
  try {
    predictVisibleStars(input);
    check(`MCP-A2: ${name} is rejected`, false);
  } catch {
    check(`MCP-A2: ${name} is rejected`, true);
  }
}

// MCP-A3: Mission creation recalculates predictions and stores a creation snapshot.
{
  const mission = createObservationPlanFromStarIds(
    { site, dateTime: night, maxMagnitude: 2, starIds: ["vega", "altair"] },
    { id: () => "mission-mcp-a", now: new Date("2026-08-29T11:01:00.000Z") },
  );
  check("MCP-A3: plan creates a stable mission", mission.id === "mission-mcp-a");
  check("MCP-A3: plan stores requested date", mission.dateTime === night);
  check("MCP-A3: plan stores fixed altitude and azimuth", mission.targets.every((target) => Number.isFinite(target.predictedAltitude) && Number.isFinite(target.predictedAzimuth)));
  check("MCP-A3: plan stores predicted visibility", mission.targets.every((target) => target.predictedVisible));
  try {
    createObservationPlanFromStarIds({ site, dateTime: night, maxMagnitude: 2, starIds: ["vega", "unknown-star"] });
    check("MCP-A3: unknown star is rejected", false);
  } catch {
    check("MCP-A3: unknown star is rejected", true);
  }
}

// MCP-A4: result DTO contains names and fixed prediction values.
{
  const record: ObservationRecord = {
    missionId: "mission-mcp-a",
    siteId: site.id,
    siteSnapshot: site,
    dateTime: night,
    targets: [
      { starId: "vega", predictedVisible: true, predictedAltitude: 62, predictedAzimuth: 285, predictedMagnitude: 0.03 },
      { starId: "altair", predictedVisible: true, predictedAltitude: 48, predictedAzimuth: 85, predictedMagnitude: 0.77 },
    ],
    results: [
      { starId: "vega", status: "visible" },
      { starId: "altair", status: "not_visible" },
    ],
    completedAt: "2026-08-29T12:00:00.000Z",
  };
  const dto = observationRecordToToolResult(record);
  check("MCP-A4: result DTO contains star names", dto.results.every((result) => result.name.length > 0));
  check("MCP-A4: result DTO contains prediction snapshot", dto.results[0].predictedAltitude === 62 && dto.results[0].predictedAzimuth === 285);
}

// MCP-A5: comparison semantics exclude unsure from the denominator.
{
  const record: ObservationRecord = {
    missionId: "compare-mcp-a",
    siteId: site.id,
    siteSnapshot: site,
    dateTime: night,
    targets: [
      { starId: "vega", predictedVisible: true, predictedAltitude: 62, predictedAzimuth: 285, predictedMagnitude: 0.03 },
      { starId: "altair", predictedVisible: true, predictedAltitude: 48, predictedAzimuth: 85, predictedMagnitude: 0.77 },
      { starId: "deneb", predictedVisible: true, predictedAltitude: 41, predictedAzimuth: 300, predictedMagnitude: 1.25 },
    ],
    results: [
      { starId: "vega", status: "visible" },
      { starId: "altair", status: "not_visible" },
      { starId: "deneb", status: "unsure" },
    ],
    completedAt: "2026-08-29T12:00:00.000Z",
  };
  const comparison = compareObservationRecordDetailed(record);
  check("MCP-A5: comparison counts predicted/visible/not-visible/unsure", comparison.predicted === 3 && comparison.visible === 1 && comparison.notVisible === 1 && comparison.unsure === 1);
  check("MCP-A5: comparison counts one match and one mismatch", comparison.matches === 1 && comparison.mismatches === 1);
  check("MCP-A5: comparison excludes unsure from match rate", comparison.comparable === 2 && comparison.matchRate === 0.5);
}

// MCP-A6: current Sky state is structured and includes simulation conditions.
{
  const observation: ObservationSettings = {
    latitude: site.latitude,
    longitude: site.longitude,
    datetime: new Date(night),
    azimuth: 180,
    altitude: 30,
    fieldOfView: 80,
  };
  const simulation: SimulationSettings = {
    daylightMode: "real",
    lightPollution: "dark-sky",
    limitingMagnitude: 5.5,
    showHiddenStars: false,
  };
  const state = getCurrentSkyState({
    site,
    observation,
    simulation,
    layers: { first: true, second: true, third: false, fourth: false, faint: false },
    displayOptions: { stars: true, starNames: true, constellationLines: true, constellationNames: true },
  });
  check("MCP-A6: sky state returns site and datetime", state.site.id === site.id && state.dateTime === night);
  check("MCP-A6: sky state returns scene summary", Number.isFinite(state.visibleCount) && Number.isFinite(state.inViewCount));
  check("MCP-A6: sky state returns structured stars", Array.isArray(state.stars));
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll WebMCP domain checks passed.");

// SNAP-C: MCP can capture, list, and inspect persisted Sky snapshot metadata.
{
  const mission = createObservationPlanFromStarIds(
    { site, dateTime: night, maxMagnitude: 2, starIds: ["vega"] },
    { id: () => "mission-snapshot", now: new Date("2026-08-29T11:01:00.000Z") },
  );
  const baseMetadata = createSkySnapshotMetadata({
    site,
    dateTime: night,
    view: { azimuth: 180, altitude: 30, fieldOfView: 80 },
    simulation: { daylightMode: "real", lightPollution: "dark-sky", limitingMagnitude: 5.5, showHiddenStars: false },
    layers: { first: true, second: true, third: false, fourth: false, faint: false },
    displayOptions: { stars: true, starNames: true, constellationLines: true, constellationNames: true },
    width: 800,
    height: 600,
    heading: "azimuth_180deg",
  }, { id: () => "snapshot-mcp-c", now: () => new Date("2026-08-29T12:00:00.000Z") });
  const record: SkySnapshotRecord = { ...baseMetadata, missionId: mission.id, blob: new Blob(["png"], { type: "image/png" }) };
  const metadata: SkySnapshotMetadata = { ...baseMetadata, missionId: mission.id };
  let records: SkySnapshotRecord[] = [];
  let listed: SkySnapshotMetadata[] = [];
  const registered: WebMcpTool[] = [];
  const modelContext: WebMcpModelContext = { async registerTool(tool) { registered.push(tool); } };
  await registerSnapshotTools(modelContext, {
    getMissions: () => [mission],
    getCurrentMetadata: () => ({ ...baseMetadata, snapshotId: undefined, createdAt: undefined }),
    captureSnapshot: async () => {
      records = [record];
      listed = [metadata];
      return record;
    },
    downloadRecord: () => "blob:test-download-url",
    getSnapshots: () => listed,
    getSnapshot: async (snapshotId) => snapshotId === record.snapshotId ? record : null,
  });
  const capture = registered.find((tool) => tool.name === "capture_sky_snapshot")!;
  const list = registered.find((tool) => tool.name === "list_sky_snapshots")!;
  const get = registered.find((tool) => tool.name === "get_sky_snapshot_metadata")!;
  const captured = JSON.parse(String(await capture.execute({ missionId: mission.id, download: true })));
  check("SNAP-C1: capture tool saves metadata and returns download URL", captured.ok === true && captured.data.snapshotId === record.snapshotId && captured.data.downloadUrl === "blob:test-download-url" && captured.data.downloaded === true && records.length === 1);
  const listedResult = JSON.parse(String(await list.execute({ limit: 10 })));
  check("SNAP-C1: list tool returns metadata without PNG blob", listedResult.ok === true && listedResult.data.snapshots.length === 1 && listedResult.data.snapshots[0].blob === undefined);
  const metadataResult = JSON.parse(String(await get.execute({ snapshotId: record.snapshotId })));
  check("SNAP-C1: metadata tool returns observation conditions", metadataResult.ok === true && metadataResult.data.site.latitude === site.latitude && metadataResult.data.view.azimuth === 180 && metadataResult.data.missionId === mission.id && metadataResult.data.blob === undefined);
  const notFound = JSON.parse(String(await get.execute({ snapshotId: "missing" })));
  check("SNAP-C2: missing snapshot returns a not-found envelope", notFound.ok === false && notFound.error.code === "SNAPSHOT_NOT_FOUND");
  const badMission = JSON.parse(String(await capture.execute({ missionId: "missing", download: false })));
  check("SNAP-C2: unknown mission is rejected", badMission.ok === false && badMission.error.code === "MISSION_NOT_FOUND");
  const noDownload = JSON.parse(String(await capture.execute({ download: false })));
  check("SNAP-C3: download can be disabled while saving", noDownload.ok === true && noDownload.data.downloadUrl === null && noDownload.data.downloaded === false);

  const unavailableRegistered: WebMcpTool[] = [];
  await registerSnapshotTools({ async registerTool(tool) { unavailableRegistered.push(tool); } }, {
    getMissions: () => [mission],
    getCurrentMetadata: () => ({ ...baseMetadata, snapshotId: undefined, createdAt: undefined }),
    captureSnapshot: async () => { throw new Error("Sky canvas is not available; open the Sky view first"); },
    downloadRecord: () => null,
    getSnapshots: () => [],
    getSnapshot: async () => null,
  });
  const unavailable = JSON.parse(String(await unavailableRegistered[0]!.execute({ download: false })));
  check("SNAP-C3: capture reports an unavailable Sky canvas", unavailable.ok === false && unavailable.error.code === "SNAPSHOT_UNAVAILABLE");
}

// MCP-B: Read tools are registered with a browser-like modelContext and read
// state at execution time rather than capturing a stale render.
{
  check("MCP-B0: feature detection is safe outside a browser", getModelContext() === null);
  const registered: WebMcpTool[] = [];
  let currentSite = { ...site };
  let receivedSignal: AbortSignal | undefined;
  const modelContext: WebMcpModelContext = {
    async registerTool(tool, options) {
      registered.push(tool);
      receivedSignal = options?.signal;
    },
  };
  const observation: ObservationSettings = {
    latitude: site.latitude,
    longitude: site.longitude,
    datetime: new Date(night),
    azimuth: 180,
    altitude: 30,
    fieldOfView: 80,
  };
  const simulation: SimulationSettings = {
    daylightMode: "real",
    lightPollution: "dark-sky",
    limitingMagnitude: 5.5,
    showHiddenStars: false,
  };
  const controller = new AbortController();
  await registerReadTools(modelContext, {
    getObservationSite: () => currentSite,
    getObservationSettings: () => observation,
    getSimulationSettings: () => simulation,
    getLayers: () => ({ first: true, second: true, third: false, fourth: false, faint: false }),
    getDisplayOptions: () => ({ stars: true, starNames: true, constellationLines: true, constellationNames: true }),
  }, { signal: controller.signal });

  const names = registered.map((tool) => tool.name).sort();
  check("MCP-B1: registers the three read tools", JSON.stringify(names) === JSON.stringify([
    "get_current_sky_state",
    "get_observation_site",
    "predict_visible_stars",
  ]));
  check("MCP-B1: passes an AbortSignal to registration", receivedSignal === controller.signal);
  check("MCP-B1: read tools are annotated read-only", registered.every((tool) => tool.annotations?.readOnlyHint === true));
  check("MCP-B1: predict schema requires dateTime and maxMagnitude", (() => {
    const predict = registered.find((tool) => tool.name === "predict_visible_stars")!;
    return predict.inputSchema.required?.includes("dateTime") === true && predict.inputSchema.required?.includes("maxMagnitude") === true;
  })());

  const siteTool = registered.find((tool) => tool.name === "get_observation_site")!;
  const siteResult = JSON.parse(String(await siteTool.execute({})));
  check("MCP-B2: get_observation_site returns the current site", siteResult.ok === true && siteResult.data.id === "home");
  currentSite = { ...site, id: "changed", name: "Changed" };
  const changedSiteResult = JSON.parse(String(await siteTool.execute({})));
  check("MCP-B2: read tool sees state changes after registration", changedSiteResult.data.id === "changed");

  const predictTool = registered.find((tool) => tool.name === "predict_visible_stars")!;
  const predictionResult = JSON.parse(String(await predictTool.execute({ dateTime: night, maxMagnitude: 2 })));
  check("MCP-B2: predict tool returns structured success", predictionResult.ok === true && predictionResult.data.stars.length > 0);
  const invalidResult = JSON.parse(String(await predictTool.execute({ dateTime: "bad", maxMagnitude: 2 })));
  check("MCP-B2: invalid read input returns a failure envelope", invalidResult.ok === false && invalidResult.error.code === "INVALID_ARGUMENT");
}

// MCP-C: Agent-created plans are persisted through the app callback and move
// the application to the Observe view.
{
  const created: ObservationRecord[] = [];
  let openedObserve = false;
  const registered: WebMcpTool[] = [];
  const modelContext: WebMcpModelContext = {
    async registerTool(tool) {
      registered.push(tool);
    },
  };
  const mission = createObservationPlanFromStarIds(
    { site, dateTime: night, maxMagnitude: 2, starIds: ["vega", "altair"] },
    { id: () => "mission-mcp-c", now: new Date("2026-08-29T11:01:00.000Z") },
  );
  await registerPlanTools(modelContext, {
    getObservationSite: () => site,
    createObservationPlan: () => mission,
    openObserve: () => {
      openedObserve = true;
    },
  });
  check("MCP-C1: registers the create plan tool", registered.map((tool) => tool.name).join(",") === "create_observation_plan");
  const planTool = registered[0]!;
  const result = JSON.parse(String(await planTool.execute({ dateTime: night, maxMagnitude: 2, starIds: ["vega", "altair"] })));
  check("MCP-C1: plan tool returns mission id and target count", result.ok === true && result.data.missionId === "mission-mcp-c" && result.data.targetCount === 2);
  check("MCP-C1: plan tool opens Observe", openedObserve);
  const tooMany = JSON.parse(String(await planTool.execute({ dateTime: night, maxMagnitude: 2, starIds: ["vega", "altair", "deneb", "sirius", "polaris", "rigel"] })));
  check("MCP-C2: plan tool rejects more than five stars", tooMany.ok === false && tooMany.error.code === "INVALID_ARGUMENT");
  void created;
}

// MCP-D: Result tools resolve a selected/latest record and expose the same
// comparison semantics as the Results screen.
{
  const record: ObservationRecord = {
    missionId: "mission-mcp-d",
    siteId: site.id,
    siteSnapshot: site,
    dateTime: night,
    targets: [
      { starId: "vega", predictedVisible: true, predictedAltitude: 62, predictedAzimuth: 285, predictedMagnitude: 0.03 },
      { starId: "altair", predictedVisible: true, predictedAltitude: 48, predictedAzimuth: 85, predictedMagnitude: 0.77 },
    ],
    results: [
      { starId: "vega", status: "visible" },
      { starId: "altair", status: "not_visible" },
    ],
    completedAt: "2026-08-29T12:00:00.000Z",
  };
  const registered: WebMcpTool[] = [];
  let selectedMissionId: string | null = null;
  const modelContext: WebMcpModelContext = {
    async registerTool(tool) {
      registered.push(tool);
    },
  };
  await registerResultTools(modelContext, {
    getRecords: () => [record],
    getSelectedRecordMissionId: () => selectedMissionId,
  });
  check("MCP-D1: registers result and comparison tools", JSON.stringify(registered.map((tool) => tool.name).sort()) === JSON.stringify([
    "compare_prediction_and_observation",
    "get_observation_results",
  ]));
  const resultTool = registered.find((tool) => tool.name === "get_observation_results")!;
  const compareTool = registered.find((tool) => tool.name === "compare_prediction_and_observation")!;
  const latest = JSON.parse(String(await resultTool.execute({})));
  check("MCP-D1: result tool resolves the latest record", latest.ok === true && latest.data.missionId === record.missionId);
  check("MCP-D1: result tool includes prediction and observation", latest.data.results[0].prediction === "visible" && latest.data.results[0].observation === "visible");
  selectedMissionId = record.missionId;
  const comparison = JSON.parse(String(await compareTool.execute({ missionId: record.missionId })));
  check("MCP-D1: comparison tool returns matches and mismatches", comparison.ok === true && comparison.data.matches === 1 && comparison.data.mismatches === 1);
  const missing = JSON.parse(String(await resultTool.execute({ missionId: "missing" })));
  check("MCP-D2: missing record returns a not-found envelope", missing.ok === false && missing.error.code === "RESULT_NOT_FOUND");
}

// MCP-E: sky/result write contracts are pure, strict, and preserve Mission snapshots.
{
  const currentObservation: ObservationSettings = {
    latitude: site.latitude,
    longitude: site.longitude,
    datetime: new Date(night),
    azimuth: 180,
    altitude: 30,
    fieldOfView: 80,
  };
  const viewPatch = normalizeSkyViewSettingsPatch({ dateTime: night, azimuth: 359, fieldOfView: 90 });
  const view = applySkyViewSettingsPatch(currentObservation, viewPatch);
  check("MCP-E1: view patch normalizes ISO datetime and preserves omitted values", view.dateTime === night && view.azimuth === 359 && view.altitude === 30 && view.fieldOfView === 90);
  for (const invalid of [{}, { azimuth: 360 }, { altitude: -1 }, { unknown: true }, { dateTime: "bad" }]) {
    try {
      normalizeSkyViewSettingsPatch(invalid);
      check("MCP-E1: invalid view patch is rejected", false);
    } catch {
      check("MCP-E1: invalid view patch is rejected", true);
    }
  }
  const displayPatch = normalizeSkyDisplaySettingsPatch({ firstMagnitude: true, secondMagnitude: false, limitingMagnitude: 4.5, lightPollution: "urban" });
  const display = applySkyDisplaySettingsPatch({
    displayOptions: { stars: true, starNames: true, constellationLines: true, constellationNames: true },
    layers: { first: false, second: true, third: false, fourth: false, faint: false },
    simulation: { daylightMode: "real", lightPollution: "dark-sky", limitingMagnitude: 5.5, showHiddenStars: false },
  }, displayPatch);
  check("MCP-E2: display layer patch is independent from Mission maxMagnitude", display.layers.first === true && display.layers.second === false && display.simulation.limitingMagnitude === 4.5);
  const mission = createObservationPlanFromStarIds(
    { site, dateTime: night, maxMagnitude: 2, starIds: ["vega", "altair"] },
    { id: () => "mission-mcp-e", now: new Date("2026-08-29T11:01:00.000Z") },
  );
  const normalizedResults = normalizeObservationResults(mission, [
    { starId: "altair", status: "not_visible" },
    { starId: "vega", status: "visible" },
  ]);
  check("MCP-E3: results normalize to Mission target order", normalizedResults[0].starId === "vega" && normalizedResults[1].status === "not_visible");
  const record = buildObservationRecord(mission, normalizedResults, "2026-08-29T12:00:00.000Z");
  check("MCP-E3: record preserves fixed Mission prediction snapshot", record.targets[0].predictedAltitude === mission.targets[0].predictedAltitude && record.dateTime === mission.dateTime);
  for (const invalid of [
    [{ starId: "vega", status: "visible" }],
    [{ starId: "vega", status: "visible" }, { starId: "vega", status: "unsure" }],
    [{ starId: "vega", status: "visible" }, { starId: "unknown", status: "unsure" }],
  ]) {
    try {
      normalizeObservationResults(mission, invalid);
      check("MCP-E3: incomplete/duplicate/foreign results are rejected", false);
    } catch {
      check("MCP-E3: incomplete/duplicate/foreign results are rejected", true);
    }
  }
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll WebMCP and snapshot checks passed.");
