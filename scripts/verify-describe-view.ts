/**
 * Verification: describe_current_view — the read tool payload that tells an
 * agent what the human is looking at: full view state plus a ring buffer of
 * the human's recent interactions.
 *
 * Run with: node scripts/run-verify.cjs verify-describe-view.ts
 */
import { describeCurrentView } from "../src/mcp/describeView";
import {
  SKY_ACTION_LIMIT,
  pushSkyAction,
  type SkyAction,
} from "../src/sky/skyActions";
import type {
  DisplayOptions,
  ObservationSettings,
  SimulationSettings,
} from "../src/types/astronomy";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL  ${name}  ${detail}`);
}

const observation: ObservationSettings = {
  latitude: 35.6812,
  longitude: 139.7671,
  datetime: new Date(Date.UTC(2026, 7, 27, 13, 0, 0)),
  azimuth: 180,
  altitude: 30,
  fieldOfView: 80,
};
const simulation: SimulationSettings = {
  daylightMode: "removed",
  lightPollution: "dark-sky",
  limitingMagnitude: 5.5,
  observerSensitivity: 0,
  showHiddenStars: false,
};
const display: DisplayOptions = {
  stars: true,
  starNames: true,
  constellationLines: true,
  constellationNames: true,
  milkyWay: true,
  denseStars: true,
  deepSky: true,
  nightMode: false,
};
const layers = { first: true, second: true, third: true, fourth: true, faint: true };
const site = { id: "tokyo", name: "Tokyo", latitude: 35.6812, longitude: 139.7671 };

// ---- action ring buffer -------------------------------------------------------
{
  let log: SkyAction[] = [];
  for (let i = 0; i < SKY_ACTION_LIMIT + 5; i++) {
    log = pushSkyAction(log, "pan", `Panned ${i}`, 1000 + i);
  }
  check(
    "actions: log caps at the limit",
    log.length === SKY_ACTION_LIMIT,
    `${log.length}`,
  );
  check(
    "actions: keeps the newest entries in order",
    log[0].label === "Panned 5" && log[log.length - 1].label === `Panned ${SKY_ACTION_LIMIT + 4}`,
  );
  check(
    "actions: immutable (does not mutate input)",
    pushSkyAction(log, "select", "x").length === SKY_ACTION_LIMIT && log[0].label === "Panned 5",
  );
}

// ---- describe payload -----------------------------------------------------------
{
  const actions: SkyAction[] = [
    { type: "pan", label: "Panned sky", at: 1000 },
    { type: "select", label: "Selected Vega", at: 2000 },
  ];
  const result = describeCurrentView({
    site,
    observation,
    simulation,
    layers,
    displayOptions: display,
    skyMode: "window",
    selection: { kind: "star", id: "vega", name: "Vega" },
    actions,
    metrics: { mode: "single", visibleCount: 120 },
  });

  check("describe: summary is a non-empty string", typeof result.summary === "string" && result.summary.length > 10, result.summary);
  check("describe: skyMode echoed", result.skyMode === "window");
  check(
    "describe: view echoes camera angles",
    result.view.azimuth === 180 && result.view.altitude === 30 && result.view.fieldOfView === 80,
  );
  check("describe: site echoed", result.site.name === "Tokyo");
  check(
    "describe: scene counts are consistent",
    typeof result.scene.visibleCount === "number" &&
      result.scene.inViewCount >= result.scene.visibleCount &&
      result.scene.inViewCount > 0,
    `${result.scene.visibleCount}/${result.scene.inViewCount}`,
  );
  check(
    "describe: scene carries phase and heading",
    ["day", "twilight", "night"].includes(result.scene.skyPhase) && result.scene.heading.length > 0,
    result.scene.heading,
  );
  check(
    "describe: sun block reports position and in-view flag",
    typeof result.scene.sun.azimuthDeg === "number" && typeof result.scene.sun.inView === "boolean",
  );
  check(
    "describe: bodies list only above-horizon objects",
    result.scene.bodies.every((b) => b.altitudeDeg > -5) && result.scene.bodies.length > 0,
    `${result.scene.bodies.length}`,
  );
  check("describe: messier list present", result.scene.messier.length >= 0);
  check(
    "describe: selection echoed",
    result.selection?.kind === "star" && result.selection.name === "Vega",
  );
  check(
    "describe: actions passed through in order",
    result.recentActions.length === 2 && result.recentActions[1].label === "Selected Vega",
  );
  check(
    "describe: metrics echoed",
    result.metrics?.mode === "single" && result.metrics.visibleCount === 120,
  );
  check(
    "describe: caveats array exists",
    Array.isArray(result.caveats) && result.caveats.length > 0,
  );

  const dome = describeCurrentView({
    site,
    observation,
    simulation,
    layers,
    displayOptions: display,
    skyMode: "dome",
    selection: null,
    actions: [],
    metrics: null,
  });
  check(
    "describe: dome mode is reported with a caveat",
    dome.skyMode === "dome" && dome.caveats.some((c) => /dome/i.test(c)),
    dome.caveats.join(";"),
  );
  check("describe: null selection tolerated", dome.selection === null);
  check("describe: null metrics tolerated", dome.metrics === null);

  let threw = false;
  try {
    describeCurrentView({
      site: { id: "bad", name: "Bad", latitude: 999, longitude: 0 },
      observation,
      simulation,
      layers,
      displayOptions: display,
      skyMode: "window",
      selection: null,
      actions: [],
      metrics: null,
    });
  } catch {
    threw = true;
  }
  check("describe: invalid site still rejected like other services", threw);
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll describe-view checks passed.");
