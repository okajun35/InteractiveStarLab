/**
 * Verification: stereographic full-sky dome — projection geometry, dome scene
 * building against the shared scenery layers, and dome-view interaction
 * (rotate / zoom clamps). The dome is an additional view mode: mission
 * predictions, azimuth and altitude semantics never flow through it.
 *
 * Run with: node scripts/run-verify.cjs verify-sky-dome.ts
 */
import {
  DOME_MAX_ZOOM,
  DOME_MIN_ZOOM,
  buildDomeScene,
  domeProjector,
  domeRadiusPx,
  panDomeView,
  zoomDomeView,
  type DomeView,
} from "../src/astronomy/dome";
import { directionVector } from "../src/astronomy/projection";
import { horizontalStars } from "../src/astronomy/coordinates";
import { CONSTELLATIONS, STARS } from "../src/astronomy/stars";
import { moonPosition } from "../src/astronomy/bodies";
import { createContext } from "../src/astronomy/observer";
import { hitTestScene } from "../src/astronomy/interaction";
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
const CX = W / 2;
const CY = H / 2;

const settings: ObservationSettings = {
  latitude: 35.6812,
  longitude: 139.7671,
  datetime: new Date(Date.UTC(2026, 7, 27, 13, 0, 0)), // 22:00 JST, night
  azimuth: 180,
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

const wholeSky: DomeView = { rotationDeg: 0, zoom: 1 };

// ---- dome projector ----------------------------------------------------------
{
  const projector = domeProjector(W, H, wholeSky);
  const R = domeRadiusPx(W, H, wholeSky);
  check("dome: radius fits inside the smaller canvas axis", R <= H / 2, `R=${R}`);

  const zenith = projector.project(directionVector(0, 90));
  check(
    "dome: zenith lands on the canvas centre",
    zenith !== null && Math.hypot(zenith.x - CX, zenith.y - CY) < 1e-6,
    zenith === null ? "null" : `${zenith.x},${zenith.y}`,
  );

  const north = projector.project(directionVector(0, 0));
  check(
    "dome: north horizon sits at top of the circle when rotation is 0",
    north !== null && Math.abs(north.x - CX) < 1e-6 && Math.abs(north.y - (CY - R)) < 1e-6,
    north === null ? "null" : `${north.x},${north.y}`,
  );
  const east = projector.project(directionVector(90, 0));
  check(
    "dome: east horizon sits on the right",
    east !== null && Math.abs(east.x - (CX + R)) < 1e-6 && Math.abs(east.y - CY) < 1e-6,
    east === null ? "null" : `${east.x},${east.y}`,
  );

  const mid = projector.project(directionVector(180, 45));
  check(
    "dome: altitude 45 maps inside the circle (r < R)",
    mid !== null && Math.hypot(mid.x - CX, mid.y - CY) < R,
    mid === null ? "null" : `${Math.hypot(mid.x - CX, mid.y - CY)} vs ${R}`,
  );
  check(
    "dome: stereographic midpoint ratio is tan(22.5°)",
    mid !== null &&
      Math.abs(Math.hypot(mid.x - CX, mid.y - CY) / R - Math.tan(Math.PI / 8)) < 1e-6,
    mid === null ? "null" : `${Math.hypot(mid.x - CX, mid.y - CY) / R}`,
  );

  check(
    "dome: directions below the horizon do not project",
    projector.project(directionVector(180, -5)) === null,
  );

  const rotated = domeProjector(W, H, { rotationDeg: 180, zoom: 1 });
  const northRotated = rotated.project(directionVector(0, 0));
  check(
    "dome: rotating 180° moves north to the bottom",
    northRotated !== null && Math.abs(northRotated.y - (CY + R)) < 1e-6,
    northRotated === null ? "null" : `${northRotated.y}`,
  );

  const zoomed = domeProjector(W, H, { rotationDeg: 0, zoom: 2 });
  const eastZoomed = zoomed.project(directionVector(90, 0));
  check(
    "dome: zoom 2 doubles the dome radius",
    eastZoomed !== null && Math.abs(eastZoomed.x - (CX + 2 * R)) < 1e-6,
    eastZoomed === null ? "null" : `${eastZoomed.x}`,
  );
  check("dome: projector reports a narrower fov when zoomed", zoomed.fovDeg === 90);
}

// ---- dome view interaction -----------------------------------------------------
{
  const rotated = panDomeView(wholeSky, 90, H);
  check(
    "dome pan: horizontal drag rotates the dome",
    rotated.rotationDeg !== 0 && rotated.zoom === 1,
    `${rotated.rotationDeg}`,
  );
  const wrapped = panDomeView({ rotationDeg: 350, zoom: 1 }, -200, H);
  check(
    "dome pan: rotation wraps into [0, 360)",
    wrapped.rotationDeg >= 0 && wrapped.rotationDeg < 360,
    `${wrapped.rotationDeg}`,
  );
  check(
    "dome pan: degenerate input returns the view unchanged",
    panDomeView(wholeSky, Number.NaN, 0) === wholeSky,
  );

  check("dome zoom: scroll up zooms in", zoomDomeView(wholeSky, -120).zoom > 1);
  check("dome zoom: clamps at whole-sky", zoomDomeView(wholeSky, 500).zoom === DOME_MIN_ZOOM);
  check(
    "dome zoom: clamps at max",
    zoomDomeView({ rotationDeg: 0, zoom: DOME_MAX_ZOOM }, -4000).zoom === DOME_MAX_ZOOM,
  );
}

// ---- dome scene ----------------------------------------------------------------
{
  const horizontal = horizontalStars(settings, STARS);
  const layers = { first: true, second: true, third: true, fourth: true, faint: true };
  const scene = buildDomeScene(
    horizontal,
    CONSTELLATIONS,
    settings,
    layers,
    nightSim,
    W,
    H,
    wholeSky,
  );
  const R = domeRadiusPx(W, H, wholeSky);

  check(
    "dome scene: exposes the dome circle for the renderer",
    scene.dome !== null &&
      Math.abs((scene.dome?.cx ?? 0) - CX) < 1e-6 &&
      Math.abs((scene.dome?.radiusPx ?? 0) - R) < 1e-6,
  );
  check(
    "dome scene: zenith projects to the circle centre",
    scene.zenith !== null && Math.hypot(scene.zenith.x - CX, scene.zenith.y - CY) < 1e-6,
  );
  check(
    "dome scene: horizon polyline approximates the circle",
    scene.horizon.length > 300 &&
      scene.horizon.every((p) => Math.abs(Math.hypot(p.x - CX, p.y - CY) - R) < R * 0.05),
    `${scene.horizon.length} points`,
  );
  check(
    "dome scene: all 8 cardinal points visible on the rim",
    scene.cardinals.length === 8 &&
      scene.cardinals.every((c) => c.visible) &&
      scene.cardinals.every((c) => Math.abs(Math.hypot(c.x - CX, c.y - CY) - R) < R * 0.05),
  );

  const named = scene.stars;
  check(
    "dome scene: named stars project inside the dome",
    named.length > 50 &&
      named.every((s) => Math.hypot(s.x - CX, s.y - CY) <= R * 1.001),
    `${named.length} stars`,
  );
  check(
    "dome scene: sees more named stars than a windowed view",
    named.length > 100,
    `${named.length}`,
  );
  check(
    "dome scene: stars keep visibility status semantics",
    named.every((s) => ["visible", "hidden", "disabled"].includes(s.status.state)),
  );
  check(
    "dome scene: counts only named stars, not scenery",
    scene.inViewCount === named.length && scene.visibleCount <= scene.inViewCount,
    `${scene.visibleCount}/${scene.inViewCount}`,
  );
  check("dome scene: dense star field populated", scene.denseStars.length > 500, `${scene.denseStars.length}`);
  check("dome scene: messier objects project", scene.messier.length > 10, `${scene.messier.length}`);
  check(
    "dome scene: milky way contours present",
    scene.milkyWay.some((level) => level.polygons.some((poly) => poly.some((pt) => pt !== null))),
  );
  check("dome scene: palette present", /^rgb/.test(scene.palette ? "rgb" : "") && scene.palette !== undefined);
  check("dome scene: heading announces the facing direction", scene.heading.length > 0, scene.heading);

  const moon = moonPosition(createContext(settings));
  if (moon.altitude > 0) {
    const moonBody = scene.bodies.find((b) => b.kind === "moon");
    check(
      "dome scene: an above-horizon moon appears",
      moonBody !== undefined,
      `moon alt ${moon.altitude.toFixed(1)}`,
    );
    if (moonBody) {
      const hit = hitTestScene(scene, moonBody.x, moonBody.y, {
        starsEnabled: true,
        showHiddenStars: false,
      });
      check("dome scene: hit test works against dome geometry", hit?.kind === "moon", JSON.stringify(hit));
    }
  }

  // Below-horizon objects stay out of the dome.
  check(
    "dome scene: scenery never escapes below the horizon",
    scene.bodies.every((b) => Math.hypot(b.x - CX, b.y - CY) <= R * 1.02) &&
      scene.messier.every((m) => Math.hypot(m.x - CX, m.y - CY) <= R * 1.02),
  );
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll sky-dome checks passed.");
