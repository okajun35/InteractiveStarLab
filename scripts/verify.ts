// Spec test cases (section 32) — run with: npm run verify
import { horizontalStars } from "../src/astronomy/coordinates";
import { buildSkyView } from "../src/astronomy/visibility";
import { STARS, CONSTELLATIONS } from "../src/astronomy/stars";

function close(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

function find(hs, id) {
  return hs.find((s) => s.id === id);
}

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failures += 1;
}

const base = {
  latitude: 35.6812,
  longitude: 139.7671,
  datetime: new Date(Date.UTC(2026, 7, 27, 13, 0, 0)), // 22:00 JST
  azimuth: 180,
  altitude: 30,
  fieldOfView: 80,
};

// ---- Test 1: positions move with time ---------------------------------
{
  const t1 = { ...base, datetime: new Date(Date.UTC(2026, 7, 27, 9, 0, 0)) }; // 18:00 JST
  const t2 = { ...base, datetime: new Date(Date.UTC(2026, 7, 27, 13, 0, 0)) }; // 22:00 JST
  const s1 = horizontalStars(t1, STARS);
  const s2 = horizontalStars(t2, STARS);
  const vega1 = find(s1, "vega");
  const vega2 = find(s2, "vega");
  const dAz = Math.abs(vega1.azimuth - vega2.azimuth);
  const dAlt = Math.abs(vega1.altitude - vega2.altitude);
  check(
    "Test 1: Vega moves over 4 hours",
    dAz > 15 || dAlt > 5,
    `Δaz=${dAz.toFixed(1)}° Δalt=${dAlt.toFixed(1)}° (vega @${vega1.azimuth.toFixed(0)}°/${vega1.altitude.toFixed(0)}° → ${vega2.azimuth.toFixed(0)}°/${vega2.altitude.toFixed(0)}°)`,
  );
}

// ---- Test 2: different directions show different skies ----------------
{
  const north = buildSkyView(horizontalStars(base, STARS), CONSTELLATIONS, { ...base, azimuth: 0 }, 800, 600);
  const east = buildSkyView(horizontalStars(base, STARS), CONSTELLATIONS, { ...base, azimuth: 90 }, 800, 600);
  const south = buildSkyView(horizontalStars(base, STARS), CONSTELLATIONS, { ...base, azimuth: 180 }, 800, 600);
  const west = buildSkyView(horizontalStars(base, STARS), CONSTELLATIONS, { ...base, azimuth: 270 }, 800, 600);
  const names = (v) => v.stars.map((s) => s.id).sort().join(",");
  check("Test 2: N ≠ E", names(north) !== names(east), `${north.stars.length} vs ${east.stars.length} stars`);
  check("Test 2: E ≠ S", names(east) !== names(south), `${east.stars.length} vs ${south.stars.length} stars`);
  check("Test 2: S ≠ W", names(south) !== names(west), `${south.stars.length} vs ${west.stars.length} stars`);
  // Polaris must be near north, alt ≈ latitude
  const polo = find(horizontalStars(base, STARS), "polaris");
  check(
    "Test 2: Polaris near north at alt≈lat",
    close(polo.azimuth % 360, 0, 8) || close(polo.azimuth % 360, 360, 8),
    `Polaris az=${polo.azimuth.toFixed(1)}° alt=${polo.altitude.toFixed(1)}° (lat=${base.latitude})`,
  );
  check(
    "Test 2: Polaris altitude ≈ latitude",
    close(polo.altitude, base.latitude, 3),
    `alt=${polo.altitude.toFixed(1)}° vs lat=${base.latitude}°`,
  );
}

// ---- Test 3: FOV changes the visible range ----------------------------
{
  const hs = horizontalStars(base, STARS);
  const fov40 = buildSkyView(hs, CONSTELLATIONS, { ...base, fieldOfView: 40 }, 800, 600);
  const fov80 = buildSkyView(hs, CONSTELLATIONS, { ...base, fieldOfView: 80 }, 800, 600);
  const fov120 = buildSkyView(hs, CONSTELLATIONS, { ...base, fieldOfView: 120 }, 800, 600);
  check(
    "Test 3: star count grows with FOV",
    fov40.stars.length <= fov80.stars.length && fov80.stars.length <= fov120.stars.length,
    `40°=${fov40.stars.length} 80°=${fov80.stars.length} 120°=${fov120.stars.length}`,
  );
  check("Test 3: 40° ≠ 80° ≠ 120°", fov40.stars.length !== fov120.stars.length || fov80.stars.length !== fov40.stars.length);
}

// ---- Test 4: Tokyo → Sydney changes the sky ---------------------------
{
  const tokyo = buildSkyView(horizontalStars(base, STARS), CONSTELLATIONS, { ...base }, 800, 600);
  const sydneySettings = { ...base, latitude: -33.8688, longitude: 151.2093 };
  const sydney = buildSkyView(horizontalStars(sydneySettings, STARS), CONSTELLATIONS, sydneySettings, 800, 600);
  check(
    "Test 4: Sydney sky differs from Tokyo",
    new Set(tokyo.stars.map((s) => s.id)).size !== new Set(sydney.stars.map((s) => s.id)).size ||
      tokyo.stars.length !== sydney.stars.length,
    `Tokyo=${tokyo.stars.length} Sydney=${sydney.stars.length} stars`,
  );
  const crux = sydney.stars.some((s) => s.constellation === "Crux");
  check("Test 4: Crux visible from Sydney", crux, "");
}

// ---- Sanity: catalog integrity ----------------------------------------
{
  const starIdSet = new Set(STARS.map((s) => s.id));
  const lineIds = new Set();
  for (const c of CONSTELLATIONS) for (const [a, b] of c.lines) { lineIds.add(a); lineIds.add(b); }
  const missing = [...lineIds].filter((id) => !starIdSet.has(id));
  check("Data: every constellation-line star exists", missing.length === 0, missing.length ? missing.join(",") : `${lineIds.size} ids ok`);
  const names = STARS.filter((s) => s.name);
  check("Data: all stars have names", names.length === STARS.length, `${names.length}/${STARS.length}`);
  const named = ["sirius", "vega", "altair", "deneb", "betelgeuse", "rigel", "polaris", "antares", "arcturus"];
  const missingStars = named.filter((id) => !starIdSet.has(id));
  check("Data: notable stars present", missingStars.length === 0, missingStars.length ? missingStars.join(",") : `${named.length} ok`);
}

// ---- Edge cases: no NaN at extreme camera angles --------------------
{
  const hs = horizontalStars(base, STARS);
  let allFinite = true;
  for (const [az, alt, fov] of [
    [0, 90, 140],
    [90, 89, 140],
    [270, 90, 20],
    [359, 1, 140],
    [180, 0, 20],
  ] as const) {
    const v = buildSkyView(hs, CONSTELLATIONS, { ...base, azimuth: az, altitude: alt, fieldOfView: fov }, 800, 600);
    const finite = [
      ...v.stars.flatMap((s) => [s.x, s.y]),
      ...v.lines.flatMap((l) => [l.x1, l.y1, l.x2, l.y2]),
      ...v.labels.flatMap((l) => [l.x, l.y]),
    ].every((n) => Number.isFinite(n));
    if (!finite) allFinite = false;
  }
  check("Edge: no NaN at extreme az/alt/FOV", allFinite, "");
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll checks passed.");
