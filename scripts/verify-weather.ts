/**
 * Verification: Open-Meteo sky conditions and dark-sky site comparison.
 * All checks run against an injected fake fetch — no network.
 *
 * Run with: node scripts/run-verify.cjs verify-weather.ts
 */
import {
  compareSitesSkyConditions,
  fetchSkyConditions,
  scoreSkyConditions,
  type FetchLike,
} from "../src/weather/openMeteo";
import { registerWeatherTools } from "../src/mcp/weatherTools";
import type { WebMcpModelContext, WebMcpTool } from "../src/mcp/webmcp";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL  ${name}  ${detail}`);
}

const site = { id: "tokyo", name: "Tokyo", latitude: 35.6812, longitude: 139.7671 };

function fakeFetch(body: unknown, init?: { status?: number }): FetchLike {
  return async () =>
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { "content-type": "application/json" },
    });
}

const goodResponse = {
  hourly: {
    time: ["2026-08-27T12:00:00Z", "2026-08-27T13:00:00Z"],
    cloud_cover: [12, 30],
    cloud_cover_low: [4, 10],
    cloud_cover_mid: [5, 12],
    cloud_cover_high: [3, 8],
    visibility: [24000, 20000],
  },
};

// ---- scoring -----------------------------------------------------------------------
{
  check("score: clear sky is near 100", scoreSkyConditions({ cloudCoverLow: 0, cloudCoverMid: 0, cloudCoverHigh: 0 }) === 100);
  check("score: overcast is near 0", scoreSkyConditions({ cloudCoverLow: 100, cloudCoverMid: 100, cloudCoverHigh: 100 }) <= 5);
  check(
    "score: low cloud hurts more than high cloud",
    scoreSkyConditions({ cloudCoverLow: 50, cloudCoverMid: 0, cloudCoverHigh: 0 }) <
      scoreSkyConditions({ cloudCoverLow: 0, cloudCoverMid: 0, cloudCoverHigh: 50 }),
  );
  check(
    "score: visibility loss lowers the score",
    scoreSkyConditions({ cloudCoverLow: 0, cloudCoverMid: 0, cloudCoverHigh: 0, visibilityM: 2000 }) <
      scoreSkyConditions({ cloudCoverLow: 0, cloudCoverMid: 0, cloudCoverHigh: 0, visibilityM: 24000 }),
  );
  check("score: clamps into range", scoreSkyConditions({ cloudCoverLow: -10, cloudCoverMid: 0, cloudCoverHigh: 0 }) === 100);
}

// ---- fetch + transform --------------------------------------------------------------
{
  const at = new Date("2026-08-27T12:30:00.000Z");
  const result = await fetchSkyConditions(site, {
    fetchImpl: fakeFetch(goodResponse),
    at,
  });
  check("weather: picks the hour nearest to 'at'", result.cloudCoverPct === 12, `${result.cloudCoverPct}`);
  check("weather: decomposes cloud layers", result.cloudCoverLow === 4 && result.cloudCoverHigh === 3);
  check("weather: carries a 0-100 score", result.score > 70);
  check("weather: carries a readable summary", result.summary.includes("Tokyo"));
  check("weather: marks the source", result.source === "open-meteo");

  let threw = false;
  try {
    await fetchSkyConditions(site, { fetchImpl: fakeFetch({ hourly: {} }), at });
  } catch {
    threw = true;
  }
  check("weather: malformed payload throws a weather error", threw);

  threw = false;
  try {
    await fetchSkyConditions(site, {
      fetchImpl: async () => new Response("nope", { status: 503 }),
      at,
    });
  } catch {
    threw = true;
  }
  check("weather: HTTP failure throws", threw);

  threw = false;
  try {
    await fetchSkyConditions(site, {
      fetchImpl: async () => {
        throw new TypeError("network down");
      },
      at,
    });
  } catch {
    threw = true;
  }
  check("weather: network failure throws", threw);
}

// ---- site comparison ------------------------------------------------------------------
{
  const better = { id: "dark", name: "Dark site", latitude: 36.5, longitude: 138.0 };
  const responses = new Map<string, unknown>([
    ["latitude=35.6812", goodResponse],
    ["latitude=36.5", {
      hourly: {
        time: ["2026-08-27T12:00:00Z"],
        cloud_cover: [2],
        cloud_cover_low: [0],
        cloud_cover_mid: [1],
        cloud_cover_high: [1],
        visibility: [30000],
      },
    }],
  ]);
  const fetchImpl: FetchLike = async (url) => {
    const body = [...responses.entries()].find(([key]) => url.includes(key))?.[1];
    if (body === undefined) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const comparison = await compareSitesSkyConditions([site, better], {
    fetchImpl,
    at: new Date("2026-08-27T12:00:00.000Z"),
  });
  check("compare: one entry per site", comparison.sites.length === 2);
  check(
    "compare: best site is the clearer one",
    comparison.best?.siteId === "dark",
    JSON.stringify(comparison.best),
  );
  check(
    "compare: failed sites are tolerated, not fatal",
    await compareSitesSkyConditions([site, { ...better, latitude: 99, name: "Broken" }], {
      fetchImpl,
      at: new Date("2026-08-27T12:00:00.000Z"),
    }).then((result) => result.sites.some((entry) => entry.conditions === null && entry.error !== null)),
  );
}

// ---- tools ------------------------------------------------------------------------------
{
  const registered: WebMcpTool[] = [];
  const modelContext: WebMcpModelContext = {
    async registerTool(tool) {
      registered.push(tool);
    },
  };
  await registerWeatherTools(modelContext, {
    getObservationSite: () => site,
    fetchImpl: fakeFetch(goodResponse),
    now: () => new Date("2026-08-27T12:30:00.000Z"),
  });
  const conditions = registered.find((tool) => tool.name === "get_sky_conditions")!;
  const compare = registered.find((tool) => tool.name === "compare_dark_sky_sites")!;
  check("tools: weather tools registered", Boolean(conditions && compare));

  const result = JSON.parse(String(await conditions.execute({})));
  check(
    "tools: get_sky_conditions returns conditions plus caveats",
    result.ok === true &&
      result.data.conditions.cloudCoverPct === 12 &&
      Array.isArray(result.data.caveats) &&
      result.data.caveats.length > 0,
  );

  const failedFetch: FetchLike = async () => {
    throw new TypeError("offline");
  };
  const registered2: WebMcpTool[] = [];
  const ctx2: WebMcpModelContext = {
    async registerTool(tool) {
      registered2.push(tool);
    },
  };
  await registerWeatherTools(ctx2, {
    getObservationSite: () => site,
    fetchImpl: failedFetch,
    now: () => new Date("2026-08-27T12:30:00.000Z"),
  });
  const offline = JSON.parse(
    String(await registered2.find((tool) => tool.name === "get_sky_conditions")!.execute({})),
  );
  check(
    "tools: weather outage fails cleanly with a caveat",
    offline.ok === false && offline.error.code === "WEATHER_UNAVAILABLE",
    JSON.stringify(offline),
  );
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll weather checks passed.");
