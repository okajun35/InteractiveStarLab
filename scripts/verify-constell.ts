// Constellation line/label hidden-following, option B (alpha fade; 要設計判断→B採用、
// progress.md 2026-08-28)。星のvisibility状態に星座線・星座名のalphaを従わせる:
//   星の状態重み  visible=1, hidden=0.5, disabled=0
//   星座線        factor = wA × wB   (1 / 0.5 / 0.25 / 0)
//   星座名        factor = 平均重み、下限 0.2（教育上の位置づけを維持）
// Run: node scripts/run-verify.cjs verify-constell.ts
import { horizontalStars } from "../src/astronomy/coordinates";
import { STARS, CONSTELLATIONS } from "../src/astronomy/stars";
import { buildSkyScene } from "../src/astronomy/visibility";
import type { StarLayerState, StarStatus } from "../src/astronomy/visibilityModel";
import type { StarStatus as SS } from "../src/types/astronomy";
import {
  statusWeight,
  lineStyleFactor,
  labelStyleFactor,
} from "../src/astronomy/constellationStyle";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failures += 1;
}

const visible: SS = { state: "visible" };
const hiddenLP: SS = { state: "hidden", reason: "light-pollution" };
const hiddenDay: SS = { state: "hidden", reason: "daylight" };
const disabled: SS = { state: "disabled" };

// ---- K1: pure weight / factor model --------------------------------
{
  check("K1: statusWeight visible=1", statusWeight(visible) === 1);
  check("K1: statusWeight hidden=0.5", statusWeight(hiddenLP) === 0.5);
  check("K1: statusWeight hidden(daylight)=0.5", statusWeight(hiddenDay) === 0.5);
  check("K1: statusWeight disabled=0", statusWeight(disabled) === 0);
  check("K1: line visible-visible = 1", lineStyleFactor(visible, visible) === 1);
  check("K1: line visible-hidden = 0.5", lineStyleFactor(visible, hiddenLP) === 0.5);
  check("K1: line hidden-hidden = 0.25", lineStyleFactor(hiddenLP, hiddenDay) === 0.25);
  check("K1: line with disabled endpoint = 0", lineStyleFactor(visible, disabled) === 0);
  check("K1: label all-visible = 1", labelStyleFactor([visible, visible]) === 1);
  check("K1: label mix = 0.75", labelStyleFactor([visible, hiddenLP]) === 0.75);
  check("K1: label all-hidden = 0.5", labelStyleFactor([hiddenLP, hiddenDay]) === 0.5);
  check("K1: label all-disabled clamped to 0.2 (educational anchor kept)",
    labelStyleFactor([disabled, disabled]) === 0.2);
  check("K1: empty label clamped to 0.2", labelStyleFactor([]) === 0.2);
}

// ---- K2: scene integration — factors attach to lines/labels --------
const TOKYO = { latitude: 35.6812, longitude: 139.7671 };
const NIGHT_22_00 = new Date(Date.UTC(2026, 7, 27, 13, 0, 0)); // 22:00 JST
const DAY_13_00 = new Date(Date.UTC(2026, 7, 27, 4, 0, 0)); // 13:00 JST
const ALL_ON: StarLayerState = { first: true, second: true, third: true, fourth: true, faint: true };
const ALL_OFF: StarLayerState = { first: false, second: false, third: false, fourth: false, faint: false };

const baseNight = { ...TOKYO, datetime: NIGHT_22_00, azimuth: 180, altitude: 30, fieldOfView: 120 };
const baseDay = { ...TOKYO, datetime: DAY_13_00, azimuth: 180, altitude: 30, fieldOfView: 120 };
const nightStars = horizontalStars(baseNight, STARS);
const dayStars = horizontalStars(baseDay, STARS);

function sceneFactors(
  obs: { datetime: Date },
  s: StarLayerState,
  sim: Parameters<typeof buildSkyScene>[4],
  stars: ReturnType<typeof horizontalStars>,
) {
  return buildSkyScene(stars, CONSTELLATIONS, { ...baseNight, ...obs }, s, sim, 800, 600);
}

const simDark = { daylightMode: "removed" as const, lightPollution: "dark-sky" as const, limitingMagnitude: 5.5, showHiddenStars: false };
const simCityNight = { ...simDark, lightPollution: "city-center" as const, limitingMagnitude: 1.5 };
const simDay = { ...simDark, daylightMode: "real" as const, lightPollution: "dark-sky" as const };

{
  // Night (removed, dark sky): nearly all members are visible; the only
  // hidden stars are below-horizon members (e.g. π Sco), so line factors
  // are 1 (both ends visible) or 0.5 (one hidden endpoint).
  const sNight = sceneFactors({ datetime: NIGHT_22_00 }, ALL_ON, simDark, nightStars);
  const nightLineF = [...new Set(sNight.lines.map((l) => l.factor))].sort((a, b) => a - b);
  check("K2: night scene has constellation lines + labels in view",
    sNight.lines.length >= 1 && sNight.labels.length >= 1,
    `${sNight.lines.length} lines / ${sNight.labels.length} labels`);
  check("K2: night — line factors only from {1, 0.5} (hidden = below-horizon members)",
    nightLineF.length > 0 && nightLineF.every((f) => [1, 0.5].includes(f)), JSON.stringify(nightLineF));
  check("K2: night — most lines full alpha (majority factor 1)",
    sNight.lines.filter((l) => l.factor === 1).length > sNight.lines.length / 2,
    `${sNight.lines.filter((l) => l.factor === 1).length}/${sNight.lines.length}`);
  check("K2: night — label factors all in (0.2, 1]",
    sNight.labels.every((l) => l.factor > 0.2 && l.factor <= 1),
    JSON.stringify([...new Set(sNight.labels.map((l) => l.factor))]));

  // City at night: faint members become light-pollution hidden → mix of
  // visible + hidden endpoints.
  const sCity = sceneFactors({ datetime: NIGHT_22_00 }, ALL_ON, simCityNight, nightStars);
  const cityLineF = [...new Set(sCity.lines.map((l) => l.factor))].sort((a, b) => a - b);
  check("K2: city — line factors only from {1, 0.5, 0.25}",
    sCity.lines.length >= 1 && cityLineF.every((f) => [1, 0.5, 0.25].includes(f)), JSON.stringify(cityLineF));
  check("K2: city — at least one faded line (light-pollution hides faint members)",
    cityLineF.includes(0.5) || cityLineF.includes(0.25), JSON.stringify(cityLineF));
  check("K2: city — label factors all in (0.2, 1)",
    sCity.labels.length >= 1 && sCity.labels.every((l) => l.factor > 0.2 && l.factor < 1),
    JSON.stringify([...new Set(sCity.labels.map((l) => l.factor))]));

  // Day (real, Tokyo noon): every star hidden by daylight → every line
  // 0.5×0.5=0.25, every label average 0.5 (above the 0.2 floor).
  const sDay = sceneFactors({ datetime: DAY_13_00 }, ALL_ON, simDay, dayStars);
  const dayLineF = [...new Set(sDay.lines.map((l) => l.factor))];
  check("K2: day — every line fades to 0.25 (both ends hidden by daylight)",
    sDay.lines.length >= 1 && dayLineF.every((f) => Math.abs(f - 0.25) < 1e-9),
    JSON.stringify(dayLineF));
  const dayLabelF = [...new Set(sDay.labels.map((l) => l.factor))];
  check("K2: day — every label fades to 0.5 (avg of hidden, above 0.2 floor)",
    sDay.labels.length >= 1 && dayLabelF.every((f) => Math.abs(f - 0.5) < 1e-9),
    JSON.stringify(dayLabelF));

  // Layers all off: every member disabled (weight 0) → lines vanish,
  // labels hold the 0.2 educational anchor.
  const sOff = sceneFactors({ datetime: NIGHT_22_00 }, ALL_OFF, simDark, nightStars);
  check("K2: layers off — lines vanish (factor 0)",
    sOff.lines.length >= 1 && sOff.lines.every((l) => l.factor === 0),
    JSON.stringify([...new Set(sOff.lines.map((l) => l.factor))]));
  check("K2: layers off — labels keep the 0.2 educational anchor",
    sOff.labels.length >= 1 && sOff.labels.every((l) => l.factor === 0.2),
    JSON.stringify([...new Set(sOff.labels.map((l) => l.factor))]));
}

if (failures > 0) {
  console.log(`\n${failures} constellation check(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log("\nAll constellation checks passed");
}
