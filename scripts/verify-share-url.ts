/**
 * Verification: shareable sky URLs — compact base64url fragments that round
 * trip the full view state and reject malformed input without throwing.
 *
 * Run with: node scripts/run-verify.cjs verify-share-url.ts
 */
import {
  decodeSkyShare,
  encodeSkyShare,
  type SkySharePayload,
} from "../src/sky/shareUrl";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL  ${name}  ${detail}`);
}

const full: SkySharePayload = {
  v: 1,
  label: "秋の星空 @ Tokyo",
  skyMode: "dome",
  observation: {
    latitude: 35.6812,
    longitude: 139.7671,
    datetime: "2026-08-27T13:00:00.000Z",
    azimuth: 245.5,
    altitude: 61,
    fieldOfView: 100,
  },
  simulation: {
    daylightMode: "removed",
    lightPollution: "urban",
    limitingMagnitude: 4.25,
    observerSensitivity: -0.25,
    showHiddenStars: true,
  },
  layers: { first: true, second: false, third: true, fourth: false, faint: true },
  display: {
    stars: true,
    starNames: false,
    constellationLines: true,
    constellationNames: false,
    milkyWay: true,
    denseStars: false,
    deepSky: true,
    nightMode: true,
  },
};

// ---- round trip ---------------------------------------------------------------
{
  const fragment = encodeSkyShare(full);
  check("share: encodes to a #sky= fragment", fragment.startsWith("#sky="), fragment.slice(0, 12));
  check(
    "share: fragment is URL-safe base64url",
    /^#sky=[A-Za-z0-9_-]+$/.test(fragment),
    fragment.slice(0, 40),
  );
  const decoded = decodeSkyShare(fragment);
  check("share: decodes a fragment", decoded !== null);
  if (decoded) {
    check("share: version survives", decoded.v === 1);
    check("share: unicode label survives", decoded.label === full.label, decoded.label);
    check("share: skyMode survives", decoded.skyMode === "dome");
    check(
      "share: observation fields survive exactly",
      decoded.observation?.latitude === 35.6812 &&
        decoded.observation.longitude === 139.7671 &&
        decoded.observation.datetime === "2026-08-27T13:00:00.000Z" &&
        decoded.observation.azimuth === 245.5 &&
        decoded.observation.altitude === 61 &&
        decoded.observation.fieldOfView === 100,
    );
    check(
      "share: simulation survives",
      decoded.simulation?.daylightMode === "removed" &&
        decoded.simulation.lightPollution === "urban" &&
        decoded.simulation.limitingMagnitude === 4.25 &&
        decoded.simulation.observerSensitivity === -0.25 &&
        decoded.simulation.showHiddenStars === true,
    );
    check(
      "share: layers survive",
      decoded.layers?.second === false && decoded.layers.faint === true,
    );
    check(
      "share: display survives",
      decoded.display?.nightMode === true &&
        decoded.display.starNames === false &&
        decoded.display.deepSky === true,
    );
  }

  // Decoding also accepts a full URL or bare hash.
  const url = `https://example.com/app${fragment}`;
  check("share: decodes a full URL", decodeSkyShare(url)?.skyMode === "dome");
  check(
    "share: decodes a bare token",
    decodeSkyShare(fragment.slice(5))?.skyMode === "dome",
  );
}

// ---- partial payloads -----------------------------------------------------------
{
  const minimal = decodeSkyShare(encodeSkyShare({ v: 1 }));
  check("share: version-only payload decodes", minimal !== null && minimal.v === 1);
  const obsOnly = decodeSkyShare(
    encodeSkyShare({
      v: 1,
      observation: { latitude: -33.8688, longitude: 151.2093 },
    }),
  );
  check(
    "share: partial observation keeps provided keys only",
    obsOnly?.observation?.latitude === -33.8688 &&
      obsOnly.observation.fieldOfView === undefined,
  );
}

// ---- malformed input --------------------------------------------------------------
{
  check("share: empty input is null", decodeSkyShare("") === null);
  check("share: garbage is null", decodeSkyShare("#sky=!!!not-base64!!!") === null);
  check("share: non-JSON is null", decodeSkyShare(`#sky=${btoa("hello world")}`) === null);
  check(
    "share: wrong version is null",
    decodeSkyShare(encodeSkyShare({ v: 2 } as unknown as SkySharePayload)) === null,
  );
  check(
    "share: out-of-range latitude is null",
    decodeSkyShare(encodeSkyShare({ v: 1, observation: { latitude: 200 } })) === null,
  );
  check(
    "share: out-of-range fov is null",
    decodeSkyShare(encodeSkyShare({ v: 1, observation: { fieldOfView: 999 } })) === null,
  );
  check(
    "share: invalid datetime is null",
    decodeSkyShare(encodeSkyShare({ v: 1, observation: { datetime: "not a date" } })) === null,
  );
  check(
    "share: invalid enum is null",
    decodeSkyShare(encodeSkyShare({ v: 1, skyMode: "panorama" as never })) === null,
  );
  check(
    "share: wrong scalar type is null",
    decodeSkyShare(encodeSkyShare({ v: 1, observation: { altitude: "high" as never } })) === null,
  );
  check(
    "share: unknown extra keys are ignored",
    decodeSkyShare(
      encodeSkyShare({ v: 1, skyMode: "window", future: true } as unknown as SkySharePayload),
    )?.skyMode === "window",
  );
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll share-url checks passed.");
