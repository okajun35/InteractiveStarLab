// Observer Sensitivity (spec §20: a separate visibility model).
// This educational approximation adds a -0.5..+0.5 magnitude adjustment
// to limitingMagnitude, rather than using visual-acuity values.
// Run: node scripts/run-verify.cjs verify-obs.ts
import { horizontalStars } from "../src/astronomy/coordinates";
import { STARS } from "../src/astronomy/stars";
import { evaluateStar, type StarLayerState } from "../src/astronomy/visibilityModel";
import { sunPosition } from "../src/astronomy/sun";
import { createContext } from "../src/astronomy/observer";
import {
  effectiveLimitingMagnitude,
  OBSERVER_SENSITIVITY_RANGE,
} from "../src/astronomy/magnitude";
import type { HorizontalStar } from "../src/astronomy/coordinates";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failures += 1;
}

const TOKYO = { latitude: 35.6812, longitude: 139.7671 };
const NIGHT_22_00 = new Date(Date.UTC(2026, 7, 27, 13, 0, 0)); // 22:00 JST
const baseNight = { ...TOKYO, datetime: NIGHT_22_00, azimuth: 180, altitude: 30, fieldOfView: 120 };

const allOn: StarLayerState = { first: true, second: true, third: true, fourth: true, faint: true };
// The catalog reaches magnitude 4.95 (170 stars). Use limit=4.5 to cross the boundary band.
const BASE_LIMIT = 4.5;

function evalStar(s: HorizontalStar, sensitivity?: number, limit = BASE_LIMIT) {
  return evaluateStar(
    s, allOn,
    {
      daylightMode: "removed",
      lightPollution: "dark-sky",
      limitingMagnitude: limit,
      showHiddenStars: false,
      observerSensitivity: sensitivity,
    },
    -30,
  );
}

const ctx = createContext(baseNight);
void sunPosition(ctx); // sun is below horizon at 22:00 (daylight check N/A)
const stars = horizontalStars(baseNight, STARS).filter((s) => s.altitude >= 0);

const aboveBand = stars.filter((s) => s.magnitude > BASE_LIMIT && s.magnitude <= BASE_LIMIT + 0.6);
const nearLimitBand = stars.filter((s) => s.magnitude > BASE_LIMIT - 0.6 && s.magnitude <= BASE_LIMIT);

function count(sensitivity?: number): number {
  return stars.filter((s) => evalStar(s, sensitivity).state === "visible").length;
}

// ---- O1: sensitivity UP (+0.5) reveals the 4.5–5.1 band hidden at baseline ----
{
  const base = count(0);
  const sharp = count(OBSERVER_SENSITIVITY_RANGE.max);
  check("O1: band stars exist in catalog (4.5<mag<=5.1)", aboveBand.length > 0, `${aboveBand.length} stars`);
  check("O1: sensitivity +0.5 raises visible count", sharp > base, `base=${base} sharp=${sharp}`);
  const sharpBand = aboveBand.filter((s) => evalStar(s, OBSERVER_SENSITIVITY_RANGE.max).state === "visible").length;
  check("O1: >50% of the above-limit band appears at +0.5",
    aboveBand.length > 0 && sharpBand >= Math.ceil(aboveBand.length / 2),
    `${sharpBand}/${aboveBand.length}`);
}

// ---- O2: sensitivity DOWN (-0.5) hides the 4.0–4.5 band visible at baseline ----
{
  const base = count(0);
  const dull = count(OBSERVER_SENSITIVITY_RANGE.min);
  check("O2: near-limit band stars exist (3.9<mag<=4.5)", nearLimitBand.length > 0, `${nearLimitBand.length} stars`);
  check("O2: sensitivity -0.5 lowers visible count", dull < base, `base=${base} dull=${dull}`);
  const dullStillVisible = nearLimitBand.filter((s) => evalStar(s, OBSERVER_SENSITIVITY_RANGE.min).state === "visible").length;
  check("O2: >50% of the near-limit band disappears at -0.5",
    nearLimitBand.length > 0 && dullStillVisible < Math.ceil(nearLimitBand.length / 2),
    `${dullStillVisible}/${nearLimitBand.length} still visible`);
}

// ---- O3: sensitivity 0/unset matches current behavior (regression guard) ----
{
  const zero = count(0);
  const unset = count(undefined);
  const baseline = stars.filter((s) =>
    evaluateStar(
      s, allOn,
      {
        daylightMode: "removed",
        lightPollution: "dark-sky",
        limitingMagnitude: BASE_LIMIT,
        showHiddenStars: false,
      } as Parameters<typeof evaluateStar>[2],
      -30,
    ).state === "visible",
  ).length;
  check("O3: sensitivity 0 equals legacy baseline", zero === baseline, `zero=${zero} baseline=${baseline}`);
  check("O3: unset (legacy settings) equals baseline", unset === baseline, `unset=${unset}`);
  check("O3: effective limit unchanged at 0", effectiveLimitingMagnitude(BASE_LIMIT, 0) === BASE_LIMIT, String(effectiveLimitingMagnitude(BASE_LIMIT, 0)));
  check("O3: effective limit unchanged when unset", effectiveLimitingMagnitude(BASE_LIMIT, undefined) === BASE_LIMIT, String(effectiveLimitingMagnitude(BASE_LIMIT, undefined)));
}

// ---- O4: reason consistency, range, and clamping ----
{
  check("O4: hidden reason stays light-pollution (threshold-shift model)",
    aboveBand.length > 0 && evalStar(aboveBand[0], OBSERVER_SENSITIVITY_RANGE.min).state === "hidden"
      && (evalStar(aboveBand[0], OBSERVER_SENSITIVITY_RANGE.min) as { reason?: string }).reason === "light-pollution",
    JSON.stringify(aboveBand[0] && evalStar(aboveBand[0], OBSERVER_SENSITIVITY_RANGE.min)));
  const rangeOk = OBSERVER_SENSITIVITY_RANGE.min === -0.5
    && OBSERVER_SENSITIVITY_RANGE.max === 0.5
    && OBSERVER_SENSITIVITY_RANGE.step === 0.05;
  check("O4: sensitivity range is [-0.5, +0.5], step 0.05", rangeOk,
    `${OBSERVER_SENSITIVITY_RANGE.min}..${OBSERVER_SENSITIVITY_RANGE.max} step=${OBSERVER_SENSITIVITY_RANGE.step}`);
  check("O4: out-of-range input is clamped (+2 → +0.5)",
    effectiveLimitingMagnitude(5.5, 2) === effectiveLimitingMagnitude(5.5, OBSERVER_SENSITIVITY_RANGE.max),
    `${effectiveLimitingMagnitude(5.5, 2)} === ${effectiveLimitingMagnitude(5.5, OBSERVER_SENSITIVITY_RANGE.max)}`);
  check("O4: effective limit never exceeds catalog ceiling",
    effectiveLimitingMagnitude(6.4, OBSERVER_SENSITIVITY_RANGE.max) <= 6.5,
    String(effectiveLimitingMagnitude(6.4, OBSERVER_SENSITIVITY_RANGE.max)));
}

if (failures > 0) {
  console.log(`\n${failures} observer-sensitivity check(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log("\nAll observer-sensitivity checks passed");
}
