/**
 * Verification: Japanese constellation names cover all 88 IAU constellations
 * and the locale-aware resolver is wired into the canvas label renderer and
 * ObjectInfo.
 *
 * Run with: node scripts/run-verify.cjs verify-constellation-names.ts
 */
import { readFileSync } from "node:fs";
import constellations from "../src/data/constellations.json";
import {
  CONSTELLATION_NAMES_JA,
  constellationDisplayName,
} from "../src/data/constellationNamesJa";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL  ${name}  ${detail}`);
}

const ids = constellations.map((c) => c.id);

check(
  "constJa: every constellation id has a Japanese name",
  ids.every((id) => typeof CONSTELLATION_NAMES_JA[id] === "string" && CONSTELLATION_NAMES_JA[id].length > 0),
  `missing: ${ids.filter((id) => CONSTELLATION_NAMES_JA[id] === undefined).join(", ") || "none"}`,
);
check(
  "constJa: no unknown ids in the Japanese table",
  Object.keys(CONSTELLATION_NAMES_JA).every((id) => ids.includes(id)),
);
check(
  "constJa: 88 constellations covered",
  ids.length === 88 && Object.keys(CONSTELLATION_NAMES_JA).length === 88,
  `${Object.keys(CONSTELLATION_NAMES_JA).length} ja names for ${ids.length} constellations`,
);
check(
  "constJa: resolver returns Japanese in ja locale",
  constellationDisplayName("CYG", "Cygnus", "ja") === CONSTELLATION_NAMES_JA.CYG,
);
check(
  "constJa: resolver returns Latin in en locale",
  constellationDisplayName("CYG", "Cygnus", "en") === "Cygnus",
);
check(
  "constJa: resolver falls back to Latin for unknown id",
  constellationDisplayName("XXX", "Fallback", "ja") === "Fallback",
);

const render = readFileSync(new URL("../src/components/starRender.ts", import.meta.url), "utf8");
const starCanvas = readFileSync(new URL("../src/components/StarCanvas.tsx", import.meta.url), "utf8");
const domeCanvas = readFileSync(new URL("../src/components/DomeCanvas.tsx", import.meta.url), "utf8");
const objectInfo = readFileSync(new URL("../src/components/ObjectInfo.tsx", import.meta.url), "utf8");

check(
  "constJa: renderer accepts a label namer",
  render.includes("labelNamer"),
);
check(
  "constJa: window canvas resolves localized names",
  starCanvas.includes("constellationDisplayName") && starCanvas.includes("locale"),
);
check(
  "constJa: dome canvas resolves localized names",
  domeCanvas.includes("constellationDisplayName") && domeCanvas.includes("locale"),
);
check(
  "constJa: ObjectInfo resolves localized names",
  objectInfo.includes("constellationDisplayName") && objectInfo.includes("locale"),
);

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll constellation-name checks passed.");
