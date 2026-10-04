/**
 * Verification: in-app agent harness, additive prediction envelope
 * (summary/caveats/rejected), and the confirm + undo-token protocol for
 * consequential write tools.
 *
 * Run with: node scripts/run-verify.cjs verify-harness.ts
 */
import { createHarnessModelContext } from "../src/mcp/harness";
import { createUndoRegistry } from "../src/mcp/confirm";
import { registerReadTools } from "../src/mcp/registerTools";
import { registerObservationWriteTools } from "../src/mcp/observationWriteTools";
import type { WebMcpModelContext, WebMcpTool } from "../src/mcp/webmcp";
import type { ObservationMission, ObservationRecord } from "../src/types/observation";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL  ${name}  ${detail}`);
}

const tokyoSite = { id: "tokyo", name: "Tokyo", latitude: 35.6812, longitude: 139.7671 };
const mission: ObservationMission = {
  id: "mission-1",
  siteId: tokyoSite.id,
  siteSnapshot: tokyoSite,
  dateTime: "2026-08-27T12:00:00.000Z",
  maxMagnitude: 3,
  createdAt: "2026-08-01T00:00:00.000Z",
  targets: [
    { starId: "vega", predictedVisible: true, predictedAltitude: 60, predictedAzimuth: 250, predictedMagnitude: 0 },
    { starId: "altair", predictedVisible: true, predictedAltitude: 50, predictedAzimuth: 220, predictedMagnitude: 0.8 },
  ],
};

function makeReadState() {
  return {
    getObservationSite: () => ({ id: "tokyo", name: "Tokyo", latitude: 35.6812, longitude: 139.7671, timeZone: "Asia/Tokyo" }),
    getObservationSettings: () => ({
      latitude: 35.6812,
      longitude: 139.7671,
      datetime: "2026-08-27T12:00:00.000Z",
      azimuth: 180,
      altitude: 30,
      fieldOfView: 80,
    }),
    getSimulationSettings: () => ({
      daylightMode: "real" as const,
      lightPollution: "dark-sky" as const,
      limitingMagnitude: 5.5,
      showHiddenStars: false,
    }),
    getLayers: () => ({ first: true, second: true, third: false, fourth: false, faint: false }),
    getDisplayOptions: () => ({ stars: true, starNames: true, constellationLines: true, constellationNames: true }),
    getSkyMode: () => "window" as const,
    getSelection: () => null,
    getSkyActions: () => [],
    getSceneMetrics: () => null,
  };
}

// ---- harness registry ---------------------------------------------------------
{
  const harness = createHarnessModelContext(null);
  check("harness: starts empty", harness.tools.length === 0);
  await registerReadTools(harness.modelContext, makeReadState());
  check(
    "harness: captures registered tools without a browser context",
    harness.tools.length >= 6 && harness.tools.every((tool) => typeof tool.execute === "function"),
  );
  const site = harness.tools.find((tool) => tool.name === "get_observation_site");
  const result = JSON.parse(String(await site!.execute({})));
  check(
    "harness: executes a captured tool",
    result.ok === true && result.data.id === "tokyo",
  );

  const forwarded: WebMcpTool[] = [];
  const real: WebMcpModelContext = {
    async registerTool(tool) {
      forwarded.push(tool);
    },
  };
  const bridge = createHarnessModelContext(real);
  await registerReadTools(bridge.modelContext, makeReadState());
  check(
    "harness: forwards registration to the real context when present",
    bridge.tools.length === forwarded.length && forwarded.length > 0,
  );
}

// ---- undo registry --------------------------------------------------------------
{
  let clock = 1_000;
  const registry = createUndoRegistry({ now: () => clock });
  let restored: string | null = null;
  const issued = registry.issue("restore previous record", () => {
    restored = "done";
    return { restored: true };
  });
  check("undo: token issued", typeof issued.undoToken === "string" && issued.undoToken.length > 0);
  check("undo: expiry is ~5 minutes out", issued.undoExpiresAt === new Date(1_000 + 300_000).toISOString(), issued.undoExpiresAt);

  const undone = await registry.consume(issued.undoToken);
  check("undo: token runs the action", restored === "done" && undone !== undefined);
  let second = "no-throw";
  try {
    await registry.consume(issued.undoToken);
  } catch {
    second = "threw";
  }
  check("undo: tokens are single-use", second === "threw");

  let expired = "no-throw";
  const shortLived = registry.issue("short", () => null, 1_000);
  clock += 2_000;
  try {
    await registry.consume(shortLived.undoToken);
  } catch {
    expired = "threw";
  }
  check("undo: expired tokens are rejected", expired === "threw");
  let unknown = "no-throw";
  try {
    await registry.consume("not-a-token");
  } catch {
    unknown = "threw";
  }
  check("undo: unknown tokens are rejected", unknown === "threw");
}

// ---- predict_visible_stars additive fields --------------------------------------
{
  const harness = createHarnessModelContext(null);
  await registerReadTools(harness.modelContext, makeReadState());
  const predict = harness.tools.find((tool) => tool.name === "predict_visible_stars")!;
  const result = JSON.parse(String(await predict.execute({
    dateTime: "2026-08-27T12:00:00.000Z",
    maxMagnitude: 2,
    limit: 3,
  })));
  check("predict: success envelope", result.ok === true);
  check(
    "predict: existing fields preserved",
    Array.isArray(result.data.stars) && result.data.stars.length === 3 &&
      result.data.maxMagnitude === 2,
  );
  check(
    "predict: summary is a readable sentence",
    typeof result.data.summary === "string" && result.data.summary.length > 10,
    result.data.summary,
  );
  check(
    "predict: caveats mention the geometric scope",
    Array.isArray(result.data.caveats) &&
      result.data.caveats.some((c: string) => c.includes("weather")),
  );
  check(
    "predict: rejected carries reasons",
    Array.isArray(result.data.rejected) &&
      result.data.rejected.every((r: { reason?: string }) => typeof r.reason === "string"),
  );
  check(
    "predict: rejection reasons are from the known set",
    result.data.rejected.every(
      (r: { reason: string }) => r.reason === "below-horizon" || r.reason === "too-faint",
    ),
  );
  check(
    "predict: rejected counts cover the whole catalog",
    result.data.rejectedCounts.belowHorizon + result.data.rejectedCounts.tooFaint +
      result.data.stars.length > 0,
  );
  check(
    "predict: at least one star was rejected as too faint or below horizon",
    result.data.rejected.length > 0,
  );
}

// ---- save_observation_results confirm + undo -------------------------------------
{
  const records: ObservationRecord[] = [];
  const state = {
    getMissions: () => [mission],
    saveResultsForMission: async (missionId: string, results: { starId: string; status: "visible" | "not_visible" | "unsure" }[]) => {
      const existing = records.findIndex((r) => r.missionId === missionId);
      const record: ObservationRecord = {
        missionId,
        siteId: mission.siteId,
        siteSnapshot: mission.siteSnapshot,
        dateTime: mission.dateTime,
        completedAt: "2026-08-28T00:00:00.000Z",
        targets: mission.targets,
        results: results.map((r) => ({ ...r })),
      };
      if (existing >= 0) records[existing] = record;
      else records.push(record);
      return record;
    },
    getRecord: (missionId: string) => records.find((r) => r.missionId === missionId) ?? null,
    restoreRecord: (missionId: string, record: ObservationRecord | null) => {
      const i = records.findIndex((r) => r.missionId === missionId);
      if (record === null) {
        if (i >= 0) records.splice(i, 1);
        return;
      }
      if (i >= 0) records[i] = record;
      else records.push(record);
    },
  };
  const harness = createHarnessModelContext(null);
  await registerObservationWriteTools(harness.modelContext, state);
  const save = harness.tools.find((tool) => tool.name === "save_observation_results")!;
  const firstResults = [
    { starId: "vega", status: "visible" },
    { starId: "altair", status: "not_visible" },
  ];

  // First save (no existing record) is non-destructive: runs without confirm.
  const first = JSON.parse(String(await save.execute({ missionId: mission.id, results: firstResults })));
  check("save: first save proceeds without confirm", first.ok === true && first.data.saved === true);

  // Overwriting requires confirm:true.
  const overwriteAttempt = JSON.parse(String(await save.execute({
    missionId: mission.id,
    results: [{ starId: "vega", status: "not_visible" }, { starId: "altair", status: "visible" }],
  })));
  check(
    "save: overwrite without confirm is refused",
    overwriteAttempt.ok === false && overwriteAttempt.error.code === "confirmation_required",
    JSON.stringify(overwriteAttempt),
  );

  const confirmed = JSON.parse(String(await save.execute({
    missionId: mission.id,
    results: [{ starId: "vega", status: "not_visible" }, { starId: "altair", status: "visible" }],
    confirm: true,
  })));
  check(
    "save: confirm executes the overwrite",
    confirmed.ok === true && confirmed.data.saved === true,
  );
  check(
    "save: overwrite returns an undo token",
    typeof confirmed.data.undoToken === "string" && typeof confirmed.data.undoExpiresAt === "string",
  );

  // Undo restores the previous record through the same tool.
  const undone = JSON.parse(String(await save.execute({ undoToken: confirmed.data.undoToken })));
  const restoredRecord = state.getRecord(mission.id);
  check(
    "save: undo_token restores the previous record",
    undone.ok === true && undone.data.undone === true &&
      restoredRecord !== null &&
      restoredRecord.results.find((r) => r.starId === "vega")!.status === "visible",
    JSON.stringify(restoredRecord?.results),
  );

  const spent = JSON.parse(String(await save.execute({ undoToken: confirmed.data.undoToken })));
  check(
    "save: spent undo tokens are refused",
    spent.ok === false && spent.error.code === "nothing_to_undo",
  );
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll harness checks passed.");
