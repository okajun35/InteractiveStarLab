// Interactive Sky Lab integration tests (spec §15, §21-§28, §41, §42).
// Run: node scripts/run-verify.cjs verify-lab.ts
import { horizontalStars } from "../src/astronomy/coordinates";
import { STARS, CONSTELLATIONS } from "../src/astronomy/stars";
import {
  buildSkyScene,
  skyPhase,
} from "../src/astronomy/visibility";
import { stableAzimuth } from "../src/astronomy/directions";
import { EXPERIMENTS } from "../src/state/experiments";
import { cloneExperimentSnapshot, DEFAULT_LAYERS } from "../src/state/simulation";
import { lightPollutionLimit } from "../src/astronomy/magnitude";
import type { StarLayerState } from "../src/astronomy/visibilityModel";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failures += 1;
}

const TOKYO = { latitude: 35.6812, longitude: 139.7671 };
const SYDNEY = { latitude: -33.8688, longitude: 151.2093 };
const DAY_13_00 = new Date(Date.UTC(2026, 7, 27, 4, 0, 0)); // 13:00 JST
const ALL_ON: StarLayerState = {
  first: true,
  second: true,
  third: true,
  fourth: true,
  faint: true,
};

check(
  "L0: default brightness layers start at 1–2 mag",
  DEFAULT_LAYERS.first && DEFAULT_LAYERS.second && !DEFAULT_LAYERS.third && !DEFAULT_LAYERS.fourth && !DEFAULT_LAYERS.faint,
  JSON.stringify(DEFAULT_LAYERS),
);

// Experiment snapshots must survive ExperimentPanel unmounts.  Keep a deep
// copy of the Date so restoring after a route change cannot reuse mutable
// state from the current viewer.
{
  const original = {
    observation: {
      latitude: 35.6812,
      longitude: 139.7671,
      datetime: new Date("2026-08-29T11:00:00.000Z"),
      azimuth: 180,
      altitude: 30,
      fieldOfView: 80,
    },
    simulation: {
      daylightMode: "real" as const,
      lightPollution: "city-center" as const,
      limitingMagnitude: 3,
      showHiddenStars: false,
    },
  };
  const copy = cloneExperimentSnapshot(original);
  original.observation.datetime.setUTCDate(30);
  check(
    "L0: experiment snapshot keeps an independent observation date",
    copy.observation.datetime.toISOString() === "2026-08-29T11:00:00.000Z" &&
      copy.observation.datetime !== original.observation.datetime,
    copy.observation.datetime.toISOString(),
  );
}

// ---- L1: sun drawn in frame during daytime (§15) --------------
{
  const base = { ...TOKYO, datetime: DAY_13_00, azimuth: 180, altitude: 30, fieldOfView: 100 };
  const sim = { daylightMode: "real" as const, lightPollution: "dark-sky" as const, limitingMagnitude: 5.5, showHiddenStars: true };
  const scene = buildSkyScene(horizontalStars(base, STARS), CONSTELLATIONS, base, ALL_ON, sim, 800, 600);
  check("L1: sun has a screen position (day, Tokyo)", scene.sunX !== null && scene.sunY !== null, `sunX=${scene.sunX}`);
  check("L1: sky phase is day", scene.skyPhase === "day", scene.skyPhase);
  check("L1: all stars hidden by daylight (visible=0)", scene.visibleCount === 0, `${scene.visibleCount} visible / ${scene.inViewCount} in-view`);
  check("L1: in-view stars carry 'hidden' status", scene.stars.every((s) => s.status.state === "hidden"), `${scene.stars.length} hidden`);
  const reason = scene.stars[0]?.status;
  check("L1: hidden reason is daylight", reason?.state === "hidden" && reason.reason === "daylight", String(reason?.reason));
}

// ---- L2: removed mode — dark sky, stars appear, sun stays (§13-§15)
{
  const base = { ...TOKYO, datetime: DAY_13_00, azimuth: 180, altitude: 30, fieldOfView: 100 };
  const realScene = buildSkyScene(
    horizontalStars(base, STARS), CONSTELLATIONS, base, ALL_ON,
    { daylightMode: "real", lightPollution: "dark-sky", limitingMagnitude: 5.5, showHiddenStars: false }, 800, 600,
  );
  const removedScene = buildSkyScene(
    horizontalStars(base, STARS), CONSTELLATIONS, base, ALL_ON,
    { daylightMode: "removed", lightPollution: "dark-sky", limitingMagnitude: 5.5, showHiddenStars: false }, 800, 600,
  );
  check("L2: removed → visible stars in view", removedScene.visibleCount > 5, `${removedScene.visibleCount}`);
  check("L2: real → none visible", realScene.visibleCount === 0, `${realScene.visibleCount}`);
  check("L2: removed renders a night background", removedScene.skyPhase === "night", removedScene.skyPhase);
  check("L2: sun position unchanged by mode", Math.abs((realScene.sunX ?? 0) - (removedScene.sunX ?? 0)) < 0.01 && removedScene.sunX !== null, `sunX=${removedScene.sunX}`);
  check("L2: star positions identical between modes",
    realScene.stars.length === removedScene.stars.length &&
    realScene.stars.every((s, i) => s.x === removedScene.stars[i].x && s.y === removedScene.stars[i].y),
    `${realScene.stars.length} stars`);
}

// ---- L3: hidden stars only shown when toggled (§11, §39) ------
{
  const base = { ...TOKYO, datetime: DAY_13_00, azimuth: 180, altitude: 30, fieldOfView: 100 };
  const hs = horizontalStars(base, STARS);
  const on = buildSkyScene(hs, CONSTELLATIONS, base, ALL_ON,
    { daylightMode: "removed", lightPollution: "city-center", limitingMagnitude: lightPollutionLimit("city-center"), showHiddenStars: true }, 800, 600);
  check("L3: city hides most stars", on.visibleCount < on.inViewCount, `visible=${on.visibleCount} inView=${on.inViewCount}`);
  const hidden = on.stars.filter((s) => s.status.state === "hidden" && s.status.reason === "light-pollution");
  check("L3: some stars hidden by light-pollution", hidden.length > 5, `${hidden.length} hidden-by-lp`);
  check("L3: hidden stars still projected (for showHiddenStars)", hidden.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y)));
}

// ---- L4: North Pole determinism (§26) -------------------------
{
  const pole = { latitude: 90, longitude: 0, datetime: DAY_13_00, azimuth: 180, altitude: 30, fieldOfView: 100 };
  const hs = horizontalStars(pole, STARS);
  const sim = { daylightMode: "removed" as const, lightPollution: "dark-sky" as const, limitingMagnitude: 5.5, showHiddenStars: false };
  const s1 = buildSkyScene(hs, CONSTELLATIONS, { ...pole, azimuth: 0 }, ALL_ON, sim, 800, 600);
  const s2 = buildSkyScene(hs, CONSTELLATIONS, { ...pole, azimuth: 180 }, ALL_ON, sim, 800, 600);
  check("L4: pole is a dark-sky night here? (phase from sun)", s1.skyPhase === "day" || s1.skyPhase === "twilight" || s1.skyPhase === "night");
  check("L4: pole view is deterministic in azimuth", s1.stars.every((st, i) => st.x === s2.stars[i].x && st.y === s2.stars[i].y) && s1.stars.length === s2.stars.length, `${s1.stars.length} stars`);
  const sunAz = s1.sunAzimuthDeg;
  check("L4: stableAzimuth pins to sun at pole", stableAzimuth(pole, sunAz) === sunAz, `pin=${sunAz.toFixed(2)}°`);
  check("L4: stableAzimuth keeps request away from pole", stableAzimuth({ latitude: 35.6812, azimuth: 90 }, 200) === 90);
}

// ---- L5: compare overrides produce different skies (§21-§22) --
{
  const night = { ...TOKYO, datetime: new Date(Date.UTC(2026, 7, 27, 13, 0, 0)), azimuth: 180, altitude: 30, fieldOfView: 100 };
  const hsT = horizontalStars(night, STARS);
  const hsS = horizontalStars({ ...night, ...SYDNEY }, STARS);
  const sim = { daylightMode: "real" as const, lightPollution: "dark-sky" as const, limitingMagnitude: 5.5, showHiddenStars: false };
  const city = buildSkyScene(hsT, CONSTELLATIONS, night, ALL_ON, { ...sim, lightPollution: "city-center", limitingMagnitude: lightPollutionLimit("city-center") }, 800, 600);
  const dark = buildSkyScene(hsT, CONSTELLATIONS, night, ALL_ON, sim, 800, 600);
  check("L5: City fewer stars than Dark Sky", city.visibleCount < dark.visibleCount, `${city.visibleCount} vs ${dark.visibleCount}`);
  const sydney = buildSkyScene(hsS, CONSTELLATIONS, { ...night, ...SYDNEY }, ALL_ON, sim, 800, 600);
  check("L5: Sydney shows Crux in compare", sydney.stars.some((s) => s.star.constellation === "Crux"));

  // Daylight compare
  const dayTokyo = { ...night, datetime: DAY_13_00 };
  const hsD = horizontalStars(dayTokyo, STARS);
  const real = buildSkyScene(hsD, CONSTELLATIONS, dayTokyo, ALL_ON, { ...sim, daylightMode: "real" }, 800, 600);
  const removed = buildSkyScene(hsD, CONSTELLATIONS, dayTokyo, ALL_ON, { ...sim, daylightMode: "removed" }, 800, 600);
  check("L5 daylight: real 0 vs removed many", real.visibleCount === 0 && removed.visibleCount > 5, `${real.visibleCount} vs ${removed.visibleCount}`);
}

// ---- L6: experiments are pure, applicable, and distinct (§28) -
{
  const obs = { ...TOKYO, datetime: DAY_13_00, azimuth: 180, altitude: 30, fieldOfView: 100 };
  const baseSim = { daylightMode: "real" as const, lightPollution: "city-center" as const, limitingMagnitude: 1.5, showHiddenStars: false };

  const ids = new Set(EXPERIMENTS.map((e) => e.id));
  check("L6: exactly 4 experiments", EXPERIMENTS.length === 4 && ids.size === 4, [...ids].join(","));
  check("L6: every experiment defines guess+correct+explanation", EXPERIMENTS.every((e) =>
    e.guesses.length >= 2 && e.correctGuess >= 0 && e.correctGuess < e.guesses.length && e.explanation.length > 10));

  const day = EXPERIMENTS.find((e) => e.id === "daylight")!;
  const r = day.apply(obs, baseSim);
  check("L6: daylight experiment toggles mode only", r.simulation.daylightMode === "removed" && r.observation.datetime.getTime() === obs.datetime.getTime());

  const lights = EXPERIMENTS.find((e) => e.id === "city-lights")!;
  const r2 = lights.apply(obs, { ...baseSim });
  check("L6: city-lights experiment → perfect", r2.simulation.lightPollution === "perfect" && r2.simulation.limitingMagnitude === lightPollutionLimit("perfect"));

  const six = EXPERIMENTS.find((e) => e.id === "plus-six-hours")!;
  const r3 = six.apply(obs, baseSim);
  check("L6: +6h shifts time by exactly 6h", r3.observation.datetime.getTime() === obs.datetime.getTime() + 6 * 3600 * 1000);

  const syd = EXPERIMENTS.find((e) => e.id === "sydney")!;
  const r4 = syd.apply(obs, baseSim);
  check("L6: sydney experiment changes location", r4.observation.latitude === SYDNEY.latitude && r4.observation.longitude === SYDNEY.longitude);

  // Each experiment actually changes the scene (§51 spirit)
  const hs = horizontalStars(obs, STARS);
  const before = buildSkyScene(hs, CONSTELLATIONS, obs, ALL_ON, baseSim, 800, 600);
  const afterSix = buildSkyScene(horizontalStars(r3.observation, STARS), CONSTELLATIONS, r3.observation, ALL_ON, r3.simulation, 800, 600);
  const moved =
    before.stars.length !== afterSix.stars.length ||
    before.stars.some((s, i) => {
      const o = afterSix.stars[i];
      return o === undefined || Math.abs(s.x - o.x) > 1 || Math.abs(s.y - o.y) > 1;
    });
  check("L6: +6h moves the sky", moved, "positions differ");

  const afterLights = buildSkyScene(hs, CONSTELLATIONS, obs, ALL_ON, { ...r2.simulation, daylightMode: "removed" }, 800, 600);
  const beforeLights = buildSkyScene(hs, CONSTELLATIONS, obs, ALL_ON, { ...baseSim, daylightMode: "removed" }, 800, 600);
  check("L6: light-off increases visible stars (same time/place)", afterLights.visibleCount > beforeLights.visibleCount, `${beforeLights.visibleCount} → ${afterLights.visibleCount}`);
}

// ---- L7: sky phase tiers (§41) --------------------------------
{
  check("L7: phase > 0 = day", skyPhase(10) === "day");
  check("L7: phase 0..-18 = twilight (0 is borderline → twilight)", skyPhase(-8) === "twilight" && skyPhase(0) === "twilight");
  check("L7: phase < -18 = night", skyPhase(-30) === "night");
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll lab integration checks passed.");
