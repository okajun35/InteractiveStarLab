/**
 * Verification: night ephemeris and best-night ranking — one observing night
 * is local noon to local noon, with three twilight boundaries, a moonless
 * dark window, and a usable-hours score.
 *
 * Run with: node scripts/run-verify.cjs verify-night.ts
 */
import {
  computeNightEphemeris,
  faintMoonWeight,
  isoDateRange,
  localNoonUtc,
  phaseName,
  rankNights,
} from "../src/astronomy/night";
import { registerReadTools } from "../src/mcp/registerTools";
import type { WebMcpModelContext, WebMcpTool } from "../src/mcp/webmcp";
import type { ObservationSite } from "../src/types/observation";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL  ${name}  ${detail}`);
}

const tokyo = { latitude: 35.6812, longitude: 139.7671, timeZone: "Asia/Tokyo" };
const longyearbyen = { latitude: 78.22, longitude: 15.63, timeZone: "Europe/Oslo" };
const northPole = { latitude: 89.5, longitude: 0, timeZone: "UTC" };

// ---- calendar helpers --------------------------------------------------------
{
  check(
    "calendar: isoDateRange is inclusive",
    isoDateRange("2026-08-10", "2026-08-14").length === 5,
  );
  check(
    "calendar: range crosses month boundary",
    isoDateRange("2026-08-30", "2026-09-02")[3] === "2026-09-02",
  );
  let threw = false;
  try {
    isoDateRange("not-a-date", "2026-08-14");
  } catch {
    threw = true;
  }
  check("calendar: invalid date rejected", threw);
  threw = false;
  try {
    isoDateRange("2026-08-14", "2026-08-10");
  } catch {
    threw = true;
  }
  check("calendar: reversed range rejected", threw);
  check(
    "calendar: Tokyo noon lands near 03:00 UTC",
    Math.abs(localNoonUtc("2026-08-27", tokyo).getUTCHours() - 3) <= 1,
    localNoonUtc("2026-08-27", tokyo).toISOString(),
  );
}

// ---- units --------------------------------------------------------------------
{
  check("moon weight: new moon is full credit", faintMoonWeight(0) === 1);
  check("moon weight: faint threshold is zero", faintMoonWeight(0.15) === 0);
  check("moon weight: full moon is zero", faintMoonWeight(1) === 0);
  check(
    "moon weight: mid ramp",
    Math.abs(faintMoonWeight(0.075) - 0.5) < 0.01,
  );
  check("phase name: new", phaseName(90, 0.01) === "new moon");
  check("phase name: full", phaseName(270, 0.99) === "full moon");
  check("phase name: waxing", phaseName(90, 0.3).startsWith("waxing"));
  check("phase name: waning", phaseName(270, 0.3).startsWith("waning"));
  check("phase name: quarter", phaseName(90, 0.5) === "first quarter");
}

// ---- Tokyo summer night --------------------------------------------------------
{
  const night = computeNightEphemeris("2026-08-27", tokyo);
  check(
    "tokyo: night window is noon to noon",
    night.windowStartUtc < night.sun.astronomicalDuskUtc! &&
      night.windowEndUtc > night.sun.astronomicalDawnUtc!,
  );
  check(
    "tokyo: darkness status ok",
    night.darkness.status === "ok",
    night.darkness.status,
  );
  check(
    "tokyo: three twilight stages exist in order",
    night.sun.civilDuskUtc! < night.sun.nauticalDuskUtc! &&
      night.sun.nauticalDuskUtc! < night.sun.astronomicalDuskUtc!,
  );
  check(
    "tokyo: dawn stages in reverse order",
    night.sun.astronomicalDawnUtc! < night.sun.nauticalDawnUtc! &&
      night.sun.nauticalDawnUtc! < night.sun.civilDawnUtc!,
  );
  check(
    "tokyo: dark hours plausible for late August (~7-8 h)",
    night.darkness.hours !== null && night.darkness.hours > 6 && night.darkness.hours < 9,
    `${night.darkness.hours}`,
  );
  check(
    "tokyo: moon fields populated",
    Number.isFinite(night.moon.illuminationFraction) &&
      night.moon.illuminationPct >= 0 &&
      night.moon.phaseName.length > 0,
  );
  check(
    "tokyo: usable hours bounded by dark hours",
    night.darkness.usableHours !== null &&
      night.darkness.usableHours <= night.darkness.hours! &&
      night.darkness.usableHours >= 0,
  );
  check(
    "tokyo: moon-free intervals stay inside the dark window",
    night.darkness.moonFreeIntervals.every(
      (i) => i.startUtc >= night.darkness.startUtc! && i.endUtc <= night.darkness.endUtc!,
    ),
  );
  check("tokyo: explanation is a sentence", night.explanation.length > 20, night.explanation);
}

// ---- polar cases ----------------------------------------------------------------
{
  // At 78N in mid-January the Sun still reaches about -9 degrees at local noon, so
  // the astronomical dark window exists but does not cover the whole day.
  const subpolar = computeNightEphemeris("2026-01-15", longyearbyen);
  check(
    "high arctic winter: partial astronomical darkness",
    subpolar.darkness.status === "ok" &&
      subpolar.darkness.hours !== null &&
      subpolar.darkness.hours > 12 &&
      subpolar.darkness.hours < 15,
    `${subpolar.darkness.status} ${subpolar.darkness.hours}`,
  );
  check(
    "high arctic winter: sun never rises",
    subpolar.sun.status === "never_rises",
    subpolar.sun.status,
  );

  // Continuous astronomical darkness needs the Sun below -18 all day: only true
  // near the pole itself.
  const winter = computeNightEphemeris("2026-01-15", northPole);
  check(
    "polar winter: continuous darkness",
    winter.darkness.status === "continuous_darkness",
    winter.darkness.status,
  );
  check(
    "polar winter: sun never rises",
    winter.sun.status === "never_rises",
    winter.sun.status,
  );
  check(
    "polar winter: whole window counts as dark",
    winter.darkness.hours !== null && winter.darkness.hours > 20,
    `${winter.darkness.hours}`,
  );

  const summer = computeNightEphemeris("2026-06-21", northPole);
  check(
    "polar summer: no astronomical darkness",
    summer.darkness.status === "no_astronomical_darkness",
    summer.darkness.status,
  );
  check(
    "polar summer: sun never sets",
    summer.sun.status === "never_sets",
    summer.sun.status,
  );
  check(
    "polar summer: zero usable hours",
    summer.darkness.usableHours === null,
  );
}

// ---- ranking ---------------------------------------------------------------------
{
  const dates = isoDateRange("2026-08-01", "2026-08-14");
  const ranked = rankNights(dates, tokyo);
  check("rank: one score per night", ranked.length === dates.length);
  check(
    "rank: sorted best first",
    ranked.every((r, i) => i === 0 || ranked[i - 1].score >= r.score),
  );
  check(
    "rank: scores in range",
    ranked.every((r) => r.score >= 0 && r.score <= 100),
  );
  check(
    "rank: best night beats worst night",
    ranked[0].score > ranked[ranked.length - 1].score,
    `${ranked[0].score} vs ${ranked[ranked.length - 1].score}`,
  );
  check(
    "rank: best night has the most usable hours",
    ranked[0].usableHours! >= ranked[ranked.length - 1].usableHours!,
  );
  check(
    "rank: explanation mentions usable hours",
    ranked[0].explanation.includes("usable"),
    ranked[0].explanation,
  );

  // A moonless week should outrank a full-moon week at the same site.
  const near = rankNights(isoDateRange("2026-08-10", "2026-08-13"), tokyo);
  const far = rankNights(isoDateRange("2026-08-26", "2026-08-29"), tokyo);
  check(
    "rank: darker moon week outranks bright moon week",
    near[0].moonIlluminationPct < far[0].moonIlluminationPct,
    `${near[0].nightOf} ${near[0].moonIlluminationPct}% vs ${far[0].nightOf} ${far[0].moonIlluminationPct}%`,
  );
}

// ---- WebMCP tools ----------------------------------------------------------------
{
  const site: ObservationSite = {
    id: "tokyo",
    name: "Tokyo",
    latitude: tokyo.latitude,
    longitude: tokyo.longitude,
    timeZone: tokyo.timeZone,
  };
  const registered: WebMcpTool[] = [];
  const modelContext: WebMcpModelContext = {
    async registerTool(tool) {
      registered.push(tool);
    },
  };
  await registerReadTools(modelContext, {
    getObservationSite: () => site,
    getObservationSettings: () => ({
      latitude: site.latitude,
      longitude: site.longitude,
      datetime: "2026-08-27T15:00:00.000Z", // 00:00 JST on Aug 28 local
      azimuth: 180,
      altitude: 30,
      fieldOfView: 80,
    }),
    getSimulationSettings: () => ({
      daylightMode: "real",
      lightPollution: "dark-sky",
      limitingMagnitude: 5.5,
      showHiddenStars: false,
    }),
    getLayers: () => ({ first: true, second: true, third: false, fourth: false, faint: false }),
    getDisplayOptions: () => ({
      stars: true,
      starNames: true,
      constellationLines: true,
      constellationNames: true,
    }),
    getSkyMode: () => "window",
    getSelection: () => null,
    getSkyActions: () => [],
    getSceneMetrics: () => null,
  });

  const ephemeris = registered.find((tool) => tool.name === "get_night_ephemeris");
  const rank = registered.find((tool) => tool.name === "rank_nights");
  check("tools: night tools registered", ephemeris !== undefined && rank !== undefined);

  const explicit = JSON.parse(String(await ephemeris!.execute({ nightOf: "2026-08-27" })));
  check(
    "tools: get_night_ephemeris returns the night",
    explicit.ok === true &&
      explicit.data.night.nightOf === "2026-08-27" &&
      explicit.data.night.darkness.status === "ok",
  );
  check(
    "tools: ephemeris carries summary and caveats",
    typeof explicit.data.summary === "string" &&
      explicit.data.summary.length > 10 &&
      Array.isArray(explicit.data.caveats) &&
      explicit.data.caveats.length > 0,
  );

  const defaulted = JSON.parse(String(await ephemeris!.execute({})));
  check(
    "tools: default nightOf is the local observing night",
    defaulted.ok === true && defaulted.data.night.nightOf === "2026-08-27",
    defaulted.ok ? defaulted.data.night.nightOf : "failed",
  );

  const bad = JSON.parse(String(await ephemeris!.execute({ nightOf: "not-a-date" })));
  check(
    "tools: invalid nightOf fails cleanly",
    bad.ok === false && bad.error.code === "INVALID_ARGUMENT",
  );

  const ranked = JSON.parse(String(await rank!.execute({ from: "2026-08-01", to: "2026-08-14" })));
  check(
    "tools: rank_nights returns best-first scores",
    ranked.ok === true &&
      ranked.data.nights.length === 14 &&
      ranked.data.nights[0].score >= ranked.data.nights[13].score,
  );
  check(
    "tools: rank_nights summary names the best night",
    typeof ranked.data.summary === "string" && ranked.data.summary.includes(ranked.data.nights[0].nightOf),
  );

  const limited = JSON.parse(String(await rank!.execute({ from: "2026-08-01", to: "2026-08-14", limit: 3 })));
  check(
    "tools: limit caps the returned nights",
    limited.ok === true && limited.data.nights.length === 3,
  );

  const hugeRange = JSON.parse(String(await rank!.execute({ from: "2026-01-01", to: "2026-12-31" })));
  check(
    "tools: oversized range fails cleanly",
    hugeRange.ok === false && hugeRange.error.code === "INVALID_ARGUMENT",
  );
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll night ephemeris checks passed.");
