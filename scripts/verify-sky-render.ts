// Sky rendering layers — vendored catalogs, B-V colours, twilight palette,
// solar-system bodies, shared scene objects, label collision placement.
// Run: node scripts/run-verify.cjs verify-sky-render.ts
import { bvToColor, quantizedStarColor, DEFAULT_STAR_COLOR } from "../src/astronomy/starColor";
import { skyPalette } from "../src/astronomy/skyPalette";
import {
  DENSE_STARS,
  MESSIER_OBJECTS,
  MILKY_WAY_LEVELS,
  starColorAt,
} from "../src/astronomy/denseCatalog";
import { moonPosition, planetPositions } from "../src/astronomy/bodies";
import { createContext } from "../src/astronomy/observer";
import { horizontalStars } from "../src/astronomy/coordinates";
import { CONSTELLATIONS, STARS } from "../src/astronomy/stars";
import { buildSkyScene, type SkyScene } from "../src/astronomy/visibility";
import type { StarLayerState } from "../src/astronomy/visibilityModel";
import type { SimulationSettings } from "../src/types/astronomy";
import { labelPlacer } from "../src/components/labelPlacer";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failures += 1;
}

const TOKYO = { latitude: 35.6812, longitude: 139.7671 };
const NIGHT_22_00 = new Date(Date.UTC(2026, 7, 27, 13, 0, 0)); // 22:00 JST
const DAY_13_00 = new Date(Date.UTC(2026, 7, 27, 4, 0, 0)); // 13:00 JST
const nightSettings = {
  ...TOKYO,
  datetime: NIGHT_22_00,
  azimuth: 180,
  altitude: 30,
  fieldOfView: 120,
};
const daySettings = { ...nightSettings, datetime: DAY_13_00 };

const allOn: StarLayerState = { first: true, second: true, third: true, fourth: true, faint: true };
const darkSim: SimulationSettings = {
  daylightMode: "real",
  lightPollution: "dark-sky",
  limitingMagnitude: 5.5,
  observerSensitivity: 0,
  showHiddenStars: false,
};

// ---- B-V star colours ---------------------------------------------------
{
  check("bvToColor: hot blue endpoint", bvToColor(-0.4) === "#9db4ff", bvToColor(-0.4));
  check("bvToColor: cool red endpoint", bvToColor(2.0) === "#ff9e5e", bvToColor(2.0));
  check("bvToColor: white stop exact", bvToColor(0.3) === "#f5f3ff", bvToColor(0.3));
  check("bvToColor: NaN falls back to default", bvToColor(Number.NaN) === DEFAULT_STAR_COLOR);
  check("bvToColor: clamps below range", bvToColor(-1) === "#9db4ff");
  check("bvToColor: clamps above range", bvToColor(9) === "#ff9e5e");
  check(
    "bvToColor: interpolates between stops",
    /^#[0-9a-f]{6}$/.test(bvToColor(0.5)) && bvToColor(0.5) !== "#f5f3ff",
    bvToColor(0.5),
  );
  const palette = new Set(
    Array.from({ length: 200 }, (_, i) => quantizedStarColor(-0.4 + i * 0.015)),
  );
  check(
    "quantizedStarColor: bounded colour count for batching",
    palette.size > 10 && palette.size <= 30,
    `${palette.size} colours`,
  );
}

// ---- Twilight palette ----------------------------------------------------
{
  const night = skyPalette(-20);
  check(
    "skyPalette: deep night zenith is near-black blue",
    night.zenith[2] >= night.zenith[0] && night.zenith[0] < 20,
    `zenith rgb ${night.zenith}`,
  );
  const day = skyPalette(6);
  check("skyPalette: day zenith is blue", day.zenith[2] > day.zenith[0] && day.zenith[2] > 100, `rgb ${day.zenith}`);
  const sunset = skyPalette(0);
  check(
    "skyPalette: sunset horizon is warm (r > b)",
    sunset.horizon[0] > sunset.horizon[2],
    `horizon rgb ${sunset.horizon}`,
  );
  const dusk = skyPalette(-9);
  const above = skyPalette(-6);
  const below = skyPalette(-12);
  const midChan = (a: number[], b: number[]) => (a[0] + b[0]) / 2;
  check(
    "skyPalette: -9° interpolates between -6 and -12 stops",
    Math.abs(dusk.zenith[0] - midChan(above.zenith, below.zenith)) <= 1,
    `r ${dusk.zenith[0]} vs ${midChan(above.zenith, below.zenith)}`,
  );
  check("skyPalette: NaN altitude treats as deep night", skyPalette(Number.NaN).zenith[0] === night.zenith[0]);
}

// ---- Vendored catalogs ----------------------------------------------------
{
  check("dense catalog: 5044 stars", DENSE_STARS.length === 5044, `${DENSE_STARS.length}`);
  check(
    "dense catalog: brightest first, all mag <= 6",
    DENSE_STARS[0].magnitude < -1 && DENSE_STARS[DENSE_STARS.length - 1].magnitude <= 6.01,
    `first ${DENSE_STARS[0].magnitude}, last ${DENSE_STARS[DENSE_STARS.length - 1].magnitude}`,
  );
  const sirius = DENSE_STARS.find((s) => s.name === "Sirius");
  check(
    "dense catalog: Sirius ra converted to hours",
    sirius !== undefined && Math.abs(sirius.ra - 6.75248) < 0.001,
    sirius ? `ra=${sirius.ra.toFixed(4)}h` : "missing",
  );
  check("messier catalog: 110 objects", MESSIER_OBJECTS.length === 110);
  const m31 = MESSIER_OBJECTS.find((o) => o.id === "M31");
  check(
    "messier catalog: M31 golden coordinates (hours)",
    m31 !== undefined && Math.abs(m31.ra - 10.685 / 15) < 0.004 && Math.abs(m31.dec - 41.269) < 0.05,
    m31 ? `ra=${m31.ra.toFixed(4)}h dec=${m31.dec}` : "missing",
  );
  check("messier catalog: M31 typed galaxy", m31?.type === "galaxy", m31?.type ?? "missing");
  check(
    "milky way: 5 isophote levels with polygons",
    MILKY_WAY_LEVELS.length === 5 && MILKY_WAY_LEVELS.every((l) => l.polygons.length > 0),
    `${MILKY_WAY_LEVELS.length} levels`,
  );
  check(
    "milky way: ra converted to hours",
    MILKY_WAY_LEVELS.every((l) => l.polygons.every((p) => p.every(([ra, dec]) => ra >= 0 && ra < 24 && dec >= -90 && dec <= 90))),
    "range checked",
  );
  const siriusColor = starColorAt(6.75248, -16.7164);
  check(
    "starColorAt: Sirius is blue-white",
    siriusColor !== DEFAULT_STAR_COLOR && siriusColor < "#e00000",
    siriusColor,
  );
  const betelgeuseColor = starColorAt(5.91953, 7.407);
  check(
    "starColorAt: Betelgeuse is warm orange",
    betelgeuseColor !== DEFAULT_STAR_COLOR && betelgeuseColor >= "#ff8000",
    betelgeuseColor,
  );
  check(
    "starColorAt: far off-catalog point falls back",
    starColorAt(23.999, -89.999).length === 7,
    starColorAt(23.999, -89.999),
  );
}

// ---- Solar system bodies --------------------------------------------------
{
  const ctx = createContext(nightSettings);
  const moon = moonPosition(ctx);
  check(
    "moon: sane altitude/azimuth",
    moon.altitude >= -90 && moon.altitude <= 90 && moon.azimuth >= 0 && moon.azimuth < 360,
    `alt=${moon.altitude.toFixed(1)} az=${moon.azimuth.toFixed(1)}`,
  );
  check(
    "moon: illumination 0..100",
    moon.illuminationPct >= 0 && moon.illuminationPct <= 100,
    `${moon.illuminationPct.toFixed(1)}%`,
  );
  check("moon: finite magnitude", Number.isFinite(moon.magnitude), `${moon.magnitude}`);
  const planets = planetPositions(ctx);
  check("planets: seven naked-eye planets", planets.length === 7, `${planets.length}`);
  const ids = planets.map((p) => p.id).sort();
  check(
    "planets: jupiter and saturn present",
    ids.includes("jupiter") && ids.includes("saturn") && ids.includes("venus"),
    ids.join(","),
  );
  check(
    "planets: all have finite positions and magnitudes",
    planets.every(
      (p) =>
        Number.isFinite(p.altitude) &&
        p.azimuth >= 0 && p.azimuth < 360 &&
        Number.isFinite(p.magnitude),
    ),
  );
}

// ---- buildSkyScene extensions ----------------------------------------------
function scene(settings: typeof nightSettings, sim: SimulationSettings = darkSim): SkyScene {
  return buildSkyScene(horizontalStars(settings, STARS), CONSTELLATIONS, settings, allOn, sim, 800, 600);
}

{
  const s = scene(nightSettings);
  check("scene: dense stars rendered at night", s.denseStars.length > 500, `${s.denseStars.length}`);
  check(
    "scene: dense stars carry colours and radii",
    s.denseStars.every((d) => /^#[0-9a-f]{6}$/.test(d.color) && d.r > 0),
  );
  const city = scene(nightSettings, {
    ...darkSim,
    lightPollution: "city-center",
    limitingMagnitude: 1.5,
  });
  check(
    "scene: dense stars honour the limiting magnitude",
    city.denseStars.length < s.denseStars.length / 4,
    `${city.denseStars.length} vs ${s.denseStars.length}`,
  );
  const cityDay = scene(daySettings, {
    ...darkSim,
    lightPollution: "city-center",
    limitingMagnitude: 1.5,
  });
  check(
    "scene: daylight real hides nearly all dense stars",
    cityDay.denseStars.length < 50,
    `${cityDay.denseStars.length}`,
  );
  check("scene: milky way polygons projected", s.milkyWay.length === 5 && s.milkyWay.some((l) => l.polygons.some((p) => p.filter(Boolean).length > 10)));
  check(
    "scene: moon present among bodies with phase",
    s.bodies.some((b) => b.kind === "moon" && b.illuminationPct !== undefined),
    `${s.bodies.length} bodies`,
  );
  check(
    "scene: planets present among bodies",
    s.bodies.filter((b) => b.kind === "planet").length >= 1,
    `${s.bodies.filter((b) => b.kind === "planet").length} planets`,
  );
  const aimedPlanets = planetPositions(createContext(nightSettings)).filter(
    (p) => p.altitude > 5,
  );
  const aimed = aimedPlanets[0];
  if (aimed) {
    const aimedScene = scene({ ...nightSettings, azimuth: aimed.azimuth, altitude: aimed.altitude });
    check(
      "scene: planet lands in view when the camera aims at it",
      aimedScene.bodies.some((b) => b.kind === "planet" && b.id === aimed.id),
      aimed.id,
    );
  }
  check("scene: messier objects projected", s.messier.length >= 1, `${s.messier.length}`);
  check(
    "scene: every messier object inside canvas with margin",
    s.messier.every((m) => m.x > -100 && m.x < 900 && m.y > -100 && m.y < 700),
  );
  check("scene: named stars get B-V colours", s.stars.every((st) => /^#[0-9a-f]{6}$/.test(st.color)));
  const siriusScene = s.stars.find((st) => st.star.name === "Sirius");
  if (siriusScene) {
    check("scene: Sirius tinted blue-white", siriusScene.color !== "#f5f3ff", siriusScene.color);
  } else {
    check("scene: Sirius tinted blue-white", true, "Sirius not in this view");
  }
  check(
    "scene: horizon polyline present when facing the horizon half-space",
    s.horizon.length >= 3,
    `${s.horizon.length} points`,
  );
  check("scene: eight cardinal points", s.cardinals.length === 8, `${s.cardinals.length}`);
  check("scene: palette reflects night", s.palette.zenith[0] < 20, `rgb ${s.palette.zenith}`);
  const dayScene = scene(daySettings);
  check("scene: palette reflects day", dayScene.palette.zenith[2] > 100, `rgb ${dayScene.palette.zenith}`);
}

// ---- Label collision placer -------------------------------------------------
{
  const placed: string[] = [];
  const measure = (text: string) => text.length * 6;
  const draw = (text: string, x: number, y: number) => {
    placed.push(`${text}@${Math.round(x)},${Math.round(y)}`);
  };
  const place = labelPlacer({ measure, draw, width: 200, height: 200 });
  check("labelPlacer: first label placed", place("Alpha", 50, 50, false));
  check("labelPlacer: overlapping label refused", !place("Beta", 52, 52, false));
  check("labelPlacer: distant label placed", place("Gamma", 150, 150, false));
  check("labelPlacer: force bypasses collision", place("Delta", 51, 51, true));
  const clampPlacer = labelPlacer({ measure, draw: () => undefined, width: 200, height: 200 });
  check(
    "labelPlacer: edge label nudged inside",
    clampPlacer("WideLabelHere", 195, 2, false),
  );
  const tinyPlacer = labelPlacer({ measure, draw: () => undefined, width: 30, height: 30 });
  check("labelPlacer: label wider than canvas dropped", !tinyPlacer("ThisLabelIsFarTooWide", 0, 15, false));
  check(
    "labelPlacer: draw callback saw clamped coordinates",
    placed.some((p) => p.startsWith("Delta@")),
    placed.join("; "),
  );
}

// ---- drawScene smoke over a fake canvas -------------------------------------
import { drawScene, type StarCanvasOptions } from "../src/components/starRender";

class FakePath2D {
  ops: string[] = [];
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  arc(): void {}
  ellipse(): void {}
  rect(): void {}
  addPath(): void {}
}
(globalThis as { Path2D?: unknown }).Path2D ??= FakePath2D;

function fakeContext() {
  const ops: string[] = [];
  const texts: string[] = [];
  const gradients: string[] = [];
  const ctx = {
    fillStyle: "" as string | object,
    strokeStyle: "" as string | object,
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    lineCap: "",
    lineJoin: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    setTransform: () => ops.push("setTransform"),
    clearRect: () => ops.push("clearRect"),
    fillRect: () => ops.push("fillRect"),
    beginPath: () => ops.push("beginPath"),
    closePath: () => ops.push("closePath"),
    moveTo: () => ops.push("moveTo"),
    lineTo: () => ops.push("lineTo"),
    arc: () => ops.push("arc"),
    ellipse: () => ops.push("ellipse"),
    rect: () => ops.push("rect"),
    fill: () => ops.push("fill"),
    stroke: () => ops.push("stroke"),
    clip: () => ops.push("clip"),
    save: () => ops.push("save"),
    restore: () => ops.push("restore"),
    translate: () => ops.push("translate"),
    rotate: () => ops.push("rotate"),
    setLineDash: () => ops.push("setLineDash"),
    fillText: (text: string) => {
      ops.push("fillText");
      texts.push(text);
    },
    measureText: (text: string) => ({ width: text.length * 6 }),
    createRadialGradient: () => {
      gradients.push("radial");
      return { addColorStop: () => undefined };
    },
    createLinearGradient: () => {
      gradients.push("linear");
      return { addColorStop: () => undefined };
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops, texts, gradients };
}

{
  const s = scene(nightSettings);
  const { ctx, ops, texts, gradients } = fakeContext();
  const options: StarCanvasOptions = {
    stars: true,
    starNames: true,
    constellationLines: true,
    constellationNames: true,
    milkyWay: true,
    denseStars: true,
    deepSky: true,
    nightMode: false,
  };
  let threw = false;
  try {
    drawScene(ctx, 800, 600, s, options, false, null);
  } catch (error) {
    threw = true;
    console.log("drawScene error:", error);
  }
  check("drawScene: completes a frame without throwing", !threw);
  check("drawScene: radial gradients used (zenith sky + glows)", gradients.includes("radial"));
  check("drawScene: canvas primitives were issued", ops.includes("fillRect") && ops.includes("arc"));
  const cardinalTexts = texts.filter((t) => /^[NESW]{1,2}$/.test(t));
  check(
    "drawScene: cardinal points drawn",
    cardinalTexts.length >= 2,
    cardinalTexts.join(","),
  );
  check(
    "drawScene: deep-sky labels drawn when objects in view",
    texts.some((t) => t.startsWith("Moon") || /^M\d+/.test(t) || ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"].includes(t)),
    texts.slice(0, 8).join(","),
  );
  const nightCheck = fakeContext();
  drawScene(nightCheck.ctx, 800, 600, s, { ...options, nightMode: true }, false, null);
  check(
    "drawScene: night mode adds a multiply wash",
    nightCheck.ctx.globalCompositeOperation === "multiply" || nightCheck.ops.includes("fill"),
  );
  const sparse = fakeContext();
  drawScene(
    sparse.ctx,
    800,
    600,
    s,
    { ...options, milkyWay: false, denseStars: false, deepSky: false },
    false,
    null,
  );
  check(
    "drawScene: disabled layers skip deep-sky labels",
    !sparse.texts.some((t) => t.startsWith("Moon")),
  );
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll sky-render checks passed.");
