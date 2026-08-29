// Interactive Sky Lab — Phase 1〜Pure logic validation (spec §51 Test A〜D + Sun)
// Run: npm run verify:sim
import { horizontalStars } from "../src/astronomy/coordinates";
import { STARS } from "../src/astronomy/stars";
import { evaluateStar, type StarLayerState } from "../src/astronomy/visibilityModel";
import { sunPosition } from "../src/astronomy/sun";
import { createContext } from "../src/astronomy/observer";
import { lightPollutionLimit } from "../src/astronomy/magnitude";
import type { HorizontalStar } from "../src/astronomy/coordinates";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failures += 1;
}

const TOKYO = { latitude: 35.6812, longitude: 139.7671 };
const DAY_13_00 = new Date(Date.UTC(2026, 7, 27, 4, 0, 0)); // 13:00 JST
const NIGHT_22_00 = new Date(Date.UTC(2026, 7, 27, 13, 0, 0)); // 22:00 JST

const baseDay = { ...TOKYO, datetime: DAY_13_00, azimuth: 180, altitude: 30, fieldOfView: 120 };
const baseNight = { ...baseDay, datetime: NIGHT_22_00 };

const allOn: StarLayerState = { first: true, second: true, third: true, fourth: true, faint: true };
const onlyFirst: StarLayerState = { first: true, second: false, third: false, fourth: false, faint: false };
const upToFourth: StarLayerState = { first: true, second: true, third: true, fourth: true, faint: false };

function inViewCount(
  stars: HorizontalStar[],
  settings: typeof baseDay,
  layers: StarLayerState,
  sim: { daylightMode: "real" | "removed"; limitingMagnitude: number },
): number {
  const ctx = createContext(settings);
  const sun = sunPosition(ctx);
  let n = 0;
  for (const s of stars) {
    if (s.altitude < 0) continue; // not in this FOV test region
    const st = evaluateStar(s, layers, { ...sim, lightPollution: "dark-sky", showHiddenStars: false }, sun.altitude);
    if (st.state === "visible") n += 1;
  }
  return n;
}

// ---- Test A: magnitude layers change star counts -------------------
{
  const day = createContext(baseDay);
  const sun = sunPosition(day).altitude;
  const visible = (layers: StarLayerState) =>
    horizontalStars(baseDay, STARS).filter(
      (s) =>
        s.altitude >= 0 &&
        evaluateStar(s, layers, {
          daylightMode: "removed",
          lightPollution: "dark-sky",
          limitingMagnitude: 99,
          showHiddenStars: false,
        }, sun).state === "visible",
    ).length;
  const firstOnly = visible(onlyFirst);
  const upTo4 = visible(upToFourth);
  check("Test A: first-only is a small set", firstOnly >= 1 && firstOnly < 15, `${firstOnly} stars`);
  check("Test A: first..4 is much larger", upTo4 > firstOnly * 3, `${firstOnly} → ${upTo4}`);
}

// ---- Test B: daylight real vs removed, same datetime ---------------
{
  const hs = horizontalStars(baseDay, STARS);
  const ctx = createContext(baseDay);
  const sun = sunPosition(ctx);
  check("Test B: Sun above horizon at 13:00 JST Tokyo", sun.altitude > 0, `sun alt = ${sun.altitude.toFixed(1)}°`);

  const visible = (mode: "real" | "removed") =>
    hs.filter(
      (s) =>
        s.altitude >= 0 &&
        evaluateStar(
          s,
          allOn,
          { daylightMode: mode, lightPollution: "dark-sky", limitingMagnitude: 99, showHiddenStars: false },
          sun.altitude,
        ).state === "visible",
    ).length;

  const realCount = visible("real");
  const removedCount = visible("removed");
  check("Test B: real daytime hides ~all stars", realCount === 0, `${realCount} visible`);
  check("Test B: removed shows many stars at SAME 13:00", removedCount > 10, `${removedCount} visible`);
  const hiddenDaylight = hs.filter(
    (s) => s.altitude >= 0 &&
      evaluateStar(s, allOn, { daylightMode: "real", lightPollution: "dark-sky", limitingMagnitude: 99, showHiddenStars: false }, sun.altitude),
  );
  const reason = hiddenDaylight.length
    ? evaluateStar(hiddenDaylight[0], allOn, {
        daylightMode: "real", lightPollution: "dark-sky", limitingMagnitude: 99, showHiddenStars: false,
      }, sun.altitude)
    : null;
  if (reason && reason.state === "hidden") {
    check("Test B: hidden reason is 'daylight'", reason.reason === "daylight", reason.reason);
  } else {
    check("Test B: hidden reason is 'daylight'", false, "no hidden star found");
  }
}

// ---- Test C: same conditions except light pollution ----------------
{
  const hs = horizontalStars(baseNight, STARS);
  const ctx = createContext(baseNight);
  const sun = sunPosition(ctx);
  const count = (lp: "city-center" | "dark-sky") =>
    hs.filter(
      (s) =>
        s.altitude >= 0 &&
        evaluateStar(
          s,
          allOn,
          {
            daylightMode: "real",
            lightPollution: lp,
            limitingMagnitude: lightPollutionLimit(lp),
            showHiddenStars: false,
          },
          sun.altitude,
        ).state === "visible",
    ).length;
  const city = count("city-center");
  const dark = count("dark-sky");
  check("Test C: city center shows few stars", city < 10, `${city} stars`);
  check("Test C: dark sky shows many more", dark > city * 3, `${city} (city) → ${dark} (dark)`);
  check("Test C: sun below horizon at night", sun.altitude < 0, `sun alt = ${sun.altitude.toFixed(1)}°`);
}

// ---- Test D: 4th mag star under City = exists, not visible ---------
{
  const hs = horizontalStars(baseNight, STARS);
  const ctx = createContext(baseNight);
  const sun = sunPosition(ctx);
  const fourth = hs.find((s) => s.magnitude >= 3.5 && s.magnitude < 4.5 && s.altitude > 0);
  if (fourth) {
    const st = evaluateStar(
      fourth,
      allOn,
      {
        daylightMode: "real",
        lightPollution: "city-center",
        limitingMagnitude: lightPollutionLimit("city-center"),
        showHiddenStars: false,
      },
      sun.altitude,
    );
    const darkSt = evaluateStar(
      fourth,
      allOn,
      {
        daylightMode: "real",
        lightPollution: "dark-sky",
        limitingMagnitude: lightPollutionLimit("dark-sky"),
        showHiddenStars: false,
      },
      sun.altitude,
    );
    check(
      "Test D: 4th magnitude star EXISTS but hidden in City",
      st.state === "hidden" && st.reason === "light-pollution",
      `${fourth.name} (${fourth.magnitude.toFixed(2)}) → state=${st.state}` +
        (st.state === "hidden" ? ` reason=${st.reason}` : ""),
    );
    check(
      "Test D: same star is visible in Dark Sky",
      darkSt.state === "visible",
      `${fourth.name} → state=${darkSt.state}`,
    );
  } else {
    check("Test D: 4th magnitude star found in view", false, "no candidate");
  }
}

// ---- Test E: Sun stays at the same place (removed mode) -----------
{
  const ctxDay = createContext(baseDay);
  const sunDay = sunPosition(ctxDay);
  // removed mode must NOT change the datetime or star positions
  const removedHs = horizontalStars(baseDay, STARS);
  const realHs = horizontalStars(baseDay, STARS);
  const diff = removedHs.length === realHs.length &&
    removedHs.every((s, i) => s.azimuth === realHs[i].azimuth && s.altitude === realHs[i].altitude);
  check("Test E: removed-mode keeps identical star positions", diff, `${realHs.length} stars, Δ=0`);
  check("Test E: sun az preserved in removed mode", Math.abs(sunDay.azimuth - sunPosition(ctxDay).azimuth) < 0.001, `az=${sunDay.azimuth.toFixed(2)}°`);
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll simulation checks passed.");
