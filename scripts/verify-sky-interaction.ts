/**
 * Verification: pure interaction helpers — drag panning, wheel zoom, hit
 * testing against the shared scene, view interpolation for agent-directed
 * moves, and the reticle pulse timing.
 *
 * Run with: node scripts/run-verify.cjs verify-sky-interaction.ts
 */
import { buildSkyScene } from "../src/astronomy/visibility";
import { createContext } from "../src/astronomy/observer";
import { moonPosition } from "../src/astronomy/bodies";
import { horizontalStars } from "../src/astronomy/coordinates";
import { CONSTELLATIONS, STARS } from "../src/astronomy/stars";
import {
  hitTestScene,
  interpolateViewAngles,
  panViewAngles,
  reticlePulse,
  viewMoveNeeded,
  zoomFov,
  FLY_MS,
  type ViewAngles,
} from "../src/astronomy/interaction";
import type { ObservationSettings, SimulationSettings } from "../src/types/astronomy";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL  ${name}  ${detail}`);
}

const W = 800;
const H = 600;

const settings: ObservationSettings = {
  latitude: 35.6812,
  longitude: 139.7671,
  datetime: new Date("2025-09-15T12:00:00Z"), // 21:00 JST, night
  azimuth: 60,
  altitude: 30,
  fieldOfView: 80,
};
const nightSim: SimulationSettings = {
  daylightMode: "removed",
  lightPollution: "dark-sky",
  limitingMagnitude: 5.5,
  observerSensitivity: 0,
  showHiddenStars: false,
};

const allLayers = { first: true, second: true, third: true, fourth: true, faint: true };

function sceneFor(s: ObservationSettings) {
  return buildSkyScene(horizontalStars(s, STARS), CONSTELLATIONS, s, allLayers, nightSim, W, H);
}

const scene = sceneFor(settings);

// ---- pan --------------------------------------------------------------------
{
  const view: ViewAngles = { azimuthDeg: 60, altitudeDeg: 30, fovDeg: 80 };
  const panned = panViewAngles(view, 100, 0, H);
  check(
    "pan: dragging right pans the view left (azimuth decreases)",
    panned.azimuthDeg < view.azimuthDeg,
    `${view.azimuthDeg} -> ${panned.azimuthDeg}`,
  );
  const expected = (100 * (80 / H)) / Math.cos((30 * Math.PI) / 180);
  check(
    "pan: azimuth change matches fov-per-pixel scale",
    Math.abs(view.azimuthDeg - panned.azimuthDeg - expected) < 1e-9,
    `expected ${expected}, got ${view.azimuthDeg - panned.azimuthDeg}`,
  );
  check("pan: horizontal drag leaves altitude alone", panned.altitudeDeg === 30);

  const down = panViewAngles(view, 0, 50, H);
  check(
    "pan: dragging down looks up (altitude increases)",
    down.altitudeDeg > 30 && Math.abs(down.altitudeDeg - (30 + 50 * (80 / H))) < 1e-9,
    `${down.altitudeDeg}`,
  );

  const wrapped = panViewAngles({ ...view, azimuthDeg: 3 }, 100, 0, H);
  check(
    "pan: azimuth wraps below zero into [0, 360)",
    wrapped.azimuthDeg >= 0 && wrapped.azimuthDeg < 360 && wrapped.azimuthDeg > 340,
    `${wrapped.azimuthDeg}`,
  );

  const clampedUp = panViewAngles(view, 0, -99999, H);
  check("pan: altitude clamps at 0", clampedUp.altitudeDeg === 0, `${clampedUp.altitudeDeg}`);
  const clampedDown = panViewAngles(view, 0, 99999, H);
  check("pan: altitude clamps at 90", clampedDown.altitudeDeg === 90, `${clampedDown.altitudeDeg}`);

  const nearZenith = panViewAngles({ ...view, altitudeDeg: 89.9 }, 100, 0, H);
  check(
    "pan: azimuth response stays finite near the zenith",
    Number.isFinite(nearZenith.azimuthDeg) && nearZenith.azimuthDeg >= 0,
    `${nearZenith.azimuthDeg}`,
  );
  check(
    "pan: degenerate input returns the view unchanged",
    panViewAngles(view, Number.NaN, 0, H) === view && panViewAngles(view, 0, 0, 0) === view,
  );
}

// ---- zoom -------------------------------------------------------------------
{
  check("zoom: scroll up zooms in (fov shrinks)", zoomFov(80, -120) < 80, `${zoomFov(80, -120)}`);
  check("zoom: scroll down zooms out (fov grows)", zoomFov(80, 120) > 80, `${zoomFov(80, 120)}`);
  check("zoom: clamps at the wide limit", zoomFov(140, 500) === 140, `${zoomFov(140, 500)}`);
  check("zoom: clamps at the narrow limit", zoomFov(20, -5000) === 20, `${zoomFov(20, -5000)}`);
}

// ---- hit testing ------------------------------------------------------------
{
  check(
    "hit: empty space returns null",
    hitTestScene(scene, -50, -50, { starsEnabled: true, showHiddenStars: false }) === null,
  );

  const star = scene.stars.find((s) => s.status.state === "visible");
  check("fixture: a visible named star exists", star !== undefined);
  if (star) {
    const hit = hitTestScene(scene, star.x, star.y, {
      starsEnabled: true,
      showHiddenStars: false,
    });
    check("hit: named star picked at its pixel", hit?.kind === "star" && hit.id === star.star.id, JSON.stringify(hit));
    const disabled = hitTestScene(scene, star.x, star.y, {
      starsEnabled: false,
      showHiddenStars: false,
    });
    check("hit: star layer off ignores named stars", disabled === null || disabled.kind !== "star");
  }

  const hidden = scene.stars.find((s) => s.status.state === "hidden");
  if (hidden) {
    const masked = hitTestScene(scene, hidden.x, hidden.y, {
      starsEnabled: true,
      showHiddenStars: false,
    });
    const shown = hitTestScene(scene, hidden.x, hidden.y, {
      starsEnabled: true,
      showHiddenStars: true,
    });
    check(
      "hit: hidden stars respect the show-hidden toggle",
      (masked === null || masked.kind !== "star" || masked.id !== hidden.star.id) &&
        shown?.kind === "star",
    );
  }

  const moon = moonPosition(createContext(settings));
  if (moon.altitude > 2) {
    const moonScene = sceneFor({
      ...settings,
      azimuth: moon.azimuth,
      altitude: Math.min(moon.altitude, 80),
    });
    const moonBody = moonScene.bodies.find((b) => b.kind === "moon");
    check("fixture: the moon projects when the camera points at it", moonBody !== undefined);
    if (moonBody) {
      const hit = hitTestScene(moonScene, moonBody.x, moonBody.y, {
        starsEnabled: true,
        showHiddenStars: false,
      });
      check("hit: the moon is picked over background stars", hit?.kind === "moon", JSON.stringify(hit));
    }
  }

  const messier = scene.messier[0];
  if (messier) {
    const hit = hitTestScene(scene, messier.x, messier.y, {
      starsEnabled: true,
      showHiddenStars: false,
    });
    check("hit: a messier object can be picked", hit?.kind === "messier" && hit.id === messier.id, JSON.stringify(hit));
  }

  if (scene.sunX !== null && scene.sunY !== null) {
    const hit = hitTestScene(scene, scene.sunX, scene.sunY, {
      starsEnabled: true,
      showHiddenStars: false,
    });
    check("hit: the sun wins its neighbourhood", hit?.kind === "sun");
  }
}

// ---- agent-directed view moves ------------------------------------------------
{
  const from: ViewAngles = { azimuthDeg: 350, altitudeDeg: 20, fovDeg: 80 };
  const to: ViewAngles = { azimuthDeg: 10, altitudeDeg: 40, fovDeg: 40 };

  check("fly: identical views need no animation", !viewMoveNeeded(from, from));
  check("fly: differing views animate", viewMoveNeeded(from, to));

  const half = interpolateViewAngles(from, to, 0.5);
  check(
    "fly: azimuth interpolates across zero the short way",
    half.azimuthDeg < 10 || half.azimuthDeg > 350,
    `${half.azimuthDeg}`,
  );
  check("fly: altitude halfway", Math.abs(half.altitudeDeg - 30) < 1e-9, `${half.altitudeDeg}`);
  check("fly: fov halfway", Math.abs(half.fovDeg - 60) < 1e-9, `${half.fovDeg}`);

  const end = interpolateViewAngles(from, to, 1);
  check(
    "fly: t=1 lands exactly on the target",
    Math.abs(end.azimuthDeg - 10) < 1e-9 && end.altitudeDeg === 40 && end.fovDeg === 40,
    JSON.stringify(end),
  );
  const start = interpolateViewAngles(from, to, 0);
  check("fly: t=0 lands on the source", Math.abs(start.azimuthDeg - 350) < 1e-9);
  check("fly: clamps past t=1", interpolateViewAngles(from, to, 5).fovDeg === 40);

  const eased = interpolateViewAngles(from, to, 0.5);
  const linearAlt = 30;
  check(
    "fly: midpoint is eased but still between endpoints",
    Math.abs(eased.altitudeDeg - linearAlt) < 1e-9,
  );

  check("fly: duration constant exported for the rAF driver", FLY_MS >= 400 && FLY_MS <= 3000);
}

// ---- reticle ------------------------------------------------------------------
{
  check("reticle: before the move ends the pulse is zero-ish", reticlePulse(-10) === 0);
  check("reticle: pulse rises with time", reticlePulse(400) > 0 && reticlePulse(400) < 1);
  check("reticle: pulse saturates at 1 (nothing drawn)", reticlePulse(99999) === 1);
  check(
    "reticle: monotonic non-decreasing",
    reticlePulse(0) <= reticlePulse(200) && reticlePulse(200) <= reticlePulse(800),
  );
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll sky-interaction checks passed.");
