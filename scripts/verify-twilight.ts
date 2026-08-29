// Twilight tiers (spec §41 将来: Civil/Nautical/Astronomical + §42 background).
// Real-mode daylight suppression becomes gradual: each twilight tier allows
// only brighter stars (educational approximation).
//   sun alt > 0      day          → no stars
//   0 ≥ alt > -6     civil       → up to mag 2.0
//   -6 ≥ alt > -12   nautical    → up to mag 4.0
//   -12 ≥ alt > -18  astronomical → up to mag 5.5
//   alt ≤ -18        night       → no extra suppression
// Run: node scripts/run-verify.cjs verify-twilight.ts
import { evaluateStar, type StarLayerState } from "../src/astronomy/visibilityModel";
import {
  twilightStage,
  twilightCap,
  TWILIGHT_LABELS,
  type TwilightStage,
} from "../src/astronomy/twilight";
import { skyPhase } from "../src/astronomy/visibility";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failures += 1;
}

const allOn: StarLayerState = { first: true, second: true, third: true, fourth: true, faint: true };

function visibleAt(sunAlt: number, starMag: number, mode: "real" | "removed" = "real"): boolean {
  const st = evaluateStar(
    { magnitude: starMag, altitude: 10 },
    allOn,
    { daylightMode: mode, lightPollution: "dark-sky", limitingMagnitude: 6.5, showHiddenStars: false },
    sunAlt,
  );
  return st.state === "visible";
}

// ---- T1: stage boundaries from sun altitude -------------------------
{
  const s: Array<[number, TwilightStage]> = [
    [10, "day"],
    [0, "civil"],
    [-3, "civil"],
    [-6.01, "nautical"],
    [-8, "nautical"],
    [-12.01, "astronomical"],
    [-15, "astronomical"],
    [-18.01, "night"],
    [-30, "night"],
  ];
  let okAll = true;
  for (const [alt, want] of s) {
    const got = twilightStage(alt);
    if (got !== want) {
      okAll = false;
      console.log(`  alt=${alt} → ${got} (want ${want})`);
    }
  }
  check("T1: stage boundaries (+0/-6/-12/-18)", okAll);
}

// ---- T2: per-tier caps (monotonic, day hides everything) -----------
{
  check("T2: day cap hides all stars", twilightCap(5) === -Infinity, String(twilightCap(5)));
  const civil = twilightCap(-3)!;
  const naut = twilightCap(-8)!;
  const astro = twilightCap(-15)!;
  check("T2: civil cap ≈ 2.0", Math.abs(civil - 2.0) < 1e-9, String(civil));
  check("T2: nautical cap ≈ 4.0", Math.abs(naut - 4.0) < 1e-9, String(naut));
  check("T2: astronomical cap ≈ 5.5", Math.abs(astro - 5.5) < 1e-9, String(astro));
  check("T2: caps strictly increase day→astro", civil < naut && naut < astro);
  check("T2: night has no cap (null/undefined)", twilightCap(-30) === null, String(twilightCap(-30)));
}

// ---- T3: gradual visibility in real mode ----------------------------
{
  // 1st-mag (-1.46, Sirius-like) and 5th-mag (4.9, catalog tail) probe stars.
  check("T3: bright star visible in civil twilight", visibleAt(-3, -1.46));
  check("T3: bright star hidden in day", !visibleAt(5, -1.46));
  check("T3: 3rd-mag hidden in civil (cap 2.0)", !visibleAt(-3, 2.9));
  check("T3: 3rd-mag visible in nautical (cap 4.0)", visibleAt(-8, 2.9));
  check("T3: 4th-mag hidden in nautical (boundary)", !visibleAt(-8, 4.5));
  check("T3: 4.5-mag visible in astronomical (cap 5.5)", visibleAt(-15, 4.5));
  check("T3: tail 4.95-mag: nautical hidden → astro visible",
    !visibleAt(-8, 4.95) && visibleAt(-15, 4.95));
  check("T3: night shows the tail star (no cap)", visibleAt(-30, 4.95));
}

// ---- T4: hidden reason + removed mode unchanged ---------------------
{
  const st = evaluateStar(
    { magnitude: -1.46, altitude: 10 },
    allOn,
    { daylightMode: "real", lightPollution: "dark-sky", limitingMagnitude: 6.5, showHiddenStars: false },
    5,
  );
  check("T4: daytime star hidden with reason 'daylight'",
    st.state === "hidden" && st.reason === "daylight",
    JSON.stringify(st));
  check("T4: 'removed' mode ignores daylight/twilight (star visible in day)",
    visibleAt(5, -1.46, "removed"));
  check("T4: removed mode shows even tail star at day", visibleAt(5, 4.95, "removed"));
  const civ = evaluateStar(
    { magnitude: 4.9, altitude: 10 },
    allOn,
    { daylightMode: "real", lightPollution: "dark-sky", limitingMagnitude: 6.5, showHiddenStars: false },
    -3,
  );
  check("T4: twilight-suppressed star keeps reason 'daylight' (sky brightness)",
    civ.state === "hidden" && civ.reason === "daylight",
    JSON.stringify(civ));
}

// ---- T5: labels + background phase mapping (regression, §41-§42) ------
{
  const stages = ["day", "civil", "nautical", "astronomical", "night"] as const;
  check("T5: every stage has en+ja labels",
    stages.every((k) => Boolean(TWILIGHT_LABELS[k].en && TWILIGHT_LABELS[k].ja)),
    stages.map((k) => TWILIGHT_LABELS[k].ja).join("/"));
  // skyPhase (background, §42) must still collapse to day/twilight/night.
  check("T5: skyPhase mapping unchanged: day/day/twilight/twilight/night",
    skyPhase(5) === "day" &&
    skyPhase(-3) === "twilight" &&
    skyPhase(-8) === "twilight" &&
    skyPhase(-15) === "twilight" &&
    skyPhase(-30) === "night");
}

if (failures > 0) {
  console.log(`\n${failures} twilight check(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log("\nAll twilight checks passed");
}
