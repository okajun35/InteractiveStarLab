/**
 * WebMCP tools for external sky conditions. These are advisory only: the data
 * comes from Open-Meteo (no API key), is clearly marked as weather rather than
 * astronomical prediction, and every failure mode returns a clean envelope.
 */
import {
  compareSitesSkyConditions,
  fetchSkyConditions,
  WeatherError,
  type FetchLike,
  type WeatherSite,
} from "../weather/openMeteo";
import {
  assertObject,
  assertOnlyKeys,
  ToolExecutionError,
  safeExecuteAsync,
} from "./input";
import type { ObservationSite } from "../types/observation";
import type { WebMcpModelContext, WebMcpRegisterOptions, WebMcpTool } from "./webmcp";

export interface WeatherToolState {
  getObservationSite: () => ObservationSite;
  /** Injectable for verification; defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Injectable clock for picking the forecast hour; defaults to now. */
  now?: () => Date;
}

const WEATHER_CAVEATS = [
  "External weather from Open-Meteo, fetched live: it is not part of the geometric visibility prediction.",
  "Cloud cover and visibility are hourly estimates; local microclimates and horizon haze may differ.",
];

/** Reference dark-sky sites used when the caller does not provide a list. */
const DARK_SKY_PRESETS: readonly WeatherSite[] = [
  { id: "mauna-kea", name: "Mauna Kea, Hawaii", latitude: 19.8207, longitude: -155.4681 },
  { id: "atacama", name: "Atacama Desert, Chile", latitude: -23.5, longitude: -68.25 },
  { id: "namibrand", name: "NamibRand, Namibia", latitude: -24.98, longitude: 16.0 },
];

function parseSites(value: unknown): WeatherSite[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) {
    throw new Error("sites must be an array of 2 to 8 entries");
  }
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`sites[${index}] must be an object`);
    }
    const object = item as Record<string, unknown>;
    if (typeof object.name !== "string" || object.name.trim() === "") {
      throw new Error(`sites[${index}].name must be a non-empty string`);
    }
    if (typeof object.latitude !== "number" || !Number.isFinite(object.latitude) ||
        Math.abs(object.latitude) > 90) {
      throw new Error(`sites[${index}].latitude must be between -90 and 90`);
    }
    if (typeof object.longitude !== "number" || !Number.isFinite(object.longitude) ||
        Math.abs(object.longitude) > 180) {
      throw new Error(`sites[${index}].longitude must be between -180 and 180`);
    }
    if (object.id !== undefined && typeof object.id !== "string") {
      throw new Error(`sites[${index}].id must be a string when present`);
    }
    return {
      id: object.id as string | undefined,
      name: object.name,
      latitude: object.latitude,
      longitude: object.longitude,
    };
  });
}

function toUnavailable(error: unknown): ToolExecutionError {
  if (error instanceof WeatherError) {
    return new ToolExecutionError("WEATHER_UNAVAILABLE", error.message);
  }
  return error instanceof ToolExecutionError
    ? error
    : new ToolExecutionError("WEATHER_UNAVAILABLE", "Sky conditions are unavailable");
}

function getSkyConditionsTool(state: WeatherToolState): WebMcpTool {
  return {
    name: "get_sky_conditions",
    title: "Get sky conditions",
    description:
      "Fetches live cloud cover (total and per layer) and visibility for the current observation site from Open-Meteo, plus a 0-100 stargazing score. Advisory only: weather is not part of the geometric visibility prediction and the tool fails cleanly when the service is unreachable.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => safeExecuteAsync(async () => {
      const object = assertObject(input);
      assertOnlyKeys(object, []);
      const site = state.getObservationSite();
      let conditions;
      try {
        conditions = await fetchSkyConditions(site, {
          fetchImpl: state.fetchImpl,
          at: state.now?.() ?? new Date(),
        });
      } catch (error) {
        throw toUnavailable(error);
      }
      return {
        summary: conditions.summary,
        conditions,
        caveats: [...WEATHER_CAVEATS],
      };
    }),
  };
}

function compareDarkSkySitesTool(state: WeatherToolState): WebMcpTool {
  return {
    name: "compare_dark_sky_sites",
    title: "Compare dark-sky sites",
    description:
      "Fetches Open-Meteo cloud cover and visibility for the current site plus reference dark-sky sites (or a caller-provided list of 2-8 sites), scores each for stargazing, and reports the clearest one. Sites that fail are reported individually instead of failing the whole comparison.",
    inputSchema: {
      type: "object",
      properties: {
        sites: {
          type: "array",
          minItems: 2,
          maxItems: 8,
          description: "Optional site list; defaults to the current site plus reference dark-sky locations",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              latitude: { type: "number", minimum: -90, maximum: 90 },
              longitude: { type: "number", minimum: -180, maximum: 180 },
            },
            required: ["name", "latitude", "longitude"],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => safeExecuteAsync(async () => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["sites"]);
      const current = state.getObservationSite();
      const sites: WeatherSite[] = object.sites === undefined
        ? [current, ...DARK_SKY_PRESETS]
        : parseSites(object.sites);
      const comparison = await compareSitesSkyConditions(sites, {
        fetchImpl: state.fetchImpl,
        at: state.now?.() ?? new Date(),
      });
      const failures = comparison.sites.filter((entry) => entry.error !== null);
      return {
        summary: comparison.best === null
          ? "Sky conditions are unavailable for every site."
          : `Clearest sky now: ${comparison.best.siteName} (score ${comparison.best.score}/100).`,
        comparison,
        caveats: [
          ...WEATHER_CAVEATS,
          ...(failures.length > 0
            ? [`${failures.length} site(s) had no weather data: ${failures.map((entry) => entry.siteName).join(", ")}.`]
            : []),
        ],
      };
    }),
  };
}

export async function registerWeatherTools(
  modelContext: WebMcpModelContext,
  state: WeatherToolState,
  options: WebMcpRegisterOptions = {},
): Promise<void> {
  await modelContext.registerTool(getSkyConditionsTool(state), options);
  await modelContext.registerTool(compareDarkSkySitesTool(state), options);
}
