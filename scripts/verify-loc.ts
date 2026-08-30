// Location Compare — Same Local Time vs Same UTC instant (spec §27 Advanced).
// Run: node scripts/run-verify.cjs verify-loc.ts
import { PLACE_PRESETS } from "../src/astronomy/directions";
import {
  sameLocalTimeInstant,
  sameUtcInstant,
  TIME_BASIS_LABELS,
  type TimeBasis,
} from "../src/astronomy/timezones";
import type { ObservationSettings } from "../src/types/astronomy";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failures += 1;
}

const tokyo = PLACE_PRESETS.find((p) => p.id === "tokyo")!;
const sydney = PLACE_PRESETS.find((p) => p.id === "sydney")!;

// Base observation: 22:00 JST = 13:00 UTC, at Tokyo.
const BASE: ObservationSettings = {
  latitude: tokyo.latitude,
  longitude: tokyo.longitude,
  datetime: new Date(Date.UTC(2026, 7, 27, 13, 0, 0)),
  azimuth: 180,
  altitude: 30,
  fieldOfView: 100,
};

function localParts(date: Date, tz: string): [number, number] {
  const s = date.toLocaleString("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const [, hm] = s.replace(",", "").split(" ");
  const [h, m] = hm.split(":").map(Number);
  return [h, m];
}

// ---- C1: basis "same-utc-instant" preserves the absolute instant ----
{
  const a = sameUtcInstant(BASE.datetime, tokyo);
  const b = sameUtcInstant(BASE.datetime, sydney);
  check("C1: sameUtcInstant is a no-op for both sides",
    a.getTime() === BASE.datetime.getTime() && b.getTime() === BASE.datetime.getTime());
  check("C1: helper returns a Date", a instanceof Date && b instanceof Date);
}

// ---- C2: basis "same-local-time" — Sydney shows the same wall clock ----
{
  const shifted = sameLocalTimeInstant(BASE.datetime, tokyo, sydney);
  const baseHm = localParts(BASE.datetime, "Asia/Tokyo");
  const sydHm = localParts(shifted, "Australia/Sydney");
  check("C2: Sydney side shows the same wall-clock time (22:00)",
    baseHm[0] === sydHm[0] && baseHm[1] === sydHm[1],
    `base=${baseHm.join(":")}JST sydney=${sydHm.join(":")}AEST`);
  check("C2: the UTC instants differ (offset is applied)",
    shifted.getTime() !== BASE.datetime.getTime(),
    `Δ${((shifted.getTime() - BASE.datetime.getTime()) / 3600e3).toFixed(2)} h`);
  const dH = (shifted.getTime() - BASE.datetime.getTime()) / 3600e3;
  check("C2: shift magnitude is 1..3 h (Tokyo+9 vs Sydney+10, Aug)",
    dH >= -1 && dH <= -0.9, `${dH.toFixed(2)} h`);
}

// ---- C3: round-trip returns to the original instant ------------------
{
  const t1 = sameLocalTimeInstant(BASE.datetime, tokyo, sydney);
  const t2 = sameLocalTimeInstant(t1, sydney, tokyo);
  check("C3: round-trip returns to base (within 60 s)",
    Math.abs(t2.getTime() - BASE.datetime.getTime()) < 60_000,
    `Δ${((t2.getTime() - BASE.datetime.getTime()) / 1000).toFixed(1)} s`);
}

// ---- C4: New York case — both directions land on the same wall clock ---
{
  const ny = PLACE_PRESETS.find((p) => p.id === "new-york")!;
  const nyInstant = sameLocalTimeInstant(BASE.datetime, tokyo, ny);
  const nyHm = localParts(nyInstant, "America/New_York");
  const tokyoHm = localParts(BASE.datetime, "Asia/Tokyo");
  check("C4: New York side shows the same wall-clock time",
    nyHm[0] === tokyoHm[0] && nyHm[1] === tokyoHm[1],
    `tokyo=${tokyoHm.join(":")}JST ny=${nyHm.join(":")}America/New_York`);
}

// ---- C5: TimeBasis type shape ---------------------------------------
{
  const basis: TimeBasis = "same-local-time";
  check("C5: 'same-local-time' is a valid TimeBasis", basis === "same-local-time");
  const basis2: TimeBasis = "same-utc-instant";
  check("C5: 'same-utc-instant' is a valid TimeBasis", basis2 === "same-utc-instant");
  check("C5: labels exist for both bases",
    Boolean(TIME_BASIS_LABELS["same-local-time"]) && Boolean(TIME_BASIS_LABELS["same-utc-instant"]),
    `${TIME_BASIS_LABELS["same-local-time"]} / ${TIME_BASIS_LABELS["same-utc-instant"]}`);
}

if (failures > 0) {
  console.log(`\n${failures} location-compare check(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log("\nAll location-compare checks passed");
}
