import type {
  DisplayOptions,
  ObservationSettings,
  SimulationSettings,
  SkyMode,
} from "../types/astronomy";
import type { StarLayerState } from "../astronomy/visibilityModel";
import type { SkySceneMetrics } from "../sky/contextModel";
import type { SkyAction } from "../sky/skyActions";
import {
  describeCurrentView,
  type SkySelection,
} from "./describeView";
import {
  getCurrentSkyState,
  predictVisibleStars,
} from "./services";
import {
  computeNightEphemeris,
  isoDateRange,
  rankNights,
  type NightSite,
} from "../astronomy/night";
import { isValidTimeZone } from "../astronomy/timezones";
import {
  assertObject,
  assertOnlyKeys,
  optionalInteger,
  requiredNumber,
  requiredString,
  safeExecute,
} from "./input";
import type {
  WebMcpTool,
  WebMcpModelContext,
  WebMcpRegisterOptions,
} from "./webmcp";

export interface ReadToolState {
  getObservationSite: () => Readonly<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    timeZone?: string;
  }>;
  getObservationSettings: () => ObservationSettings;
  getSimulationSettings: () => SimulationSettings;
  getLayers: () => StarLayerState;
  getDisplayOptions: () => DisplayOptions;
  getSkyMode: () => SkyMode;
  getSelection: () => SkySelection | null;
  getSkyActions: () => readonly SkyAction[];
  getSceneMetrics: () => SkySceneMetrics | null;
}

const EMPTY_SCHEMA = {
  type: "object" as const,
  properties: {},
  additionalProperties: false,
};

function getObservationSiteTool(state: ReadToolState): WebMcpTool {
  return {
    name: "get_observation_site",
    title: "Get observation site",
    description: "Returns the observation site currently selected in InteractiveStarLab, including its latitude and longitude.",
    inputSchema: EMPTY_SCHEMA,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const object = assertObject(input);
      assertOnlyKeys(object, []);
      return { ...state.getObservationSite() };
    }),
  };
}

function predictVisibleStarsTool(state: ReadToolState): WebMcpTool {
  return {
    name: "predict_visible_stars",
    title: "Predict visible stars",
    description: "Finds stars above the astronomical horizon for the selected observation site, date, and maximum magnitude. This geometric prediction does not include weather, horizon obstacles, or light-pollution APIs.",
    inputSchema: {
      type: "object",
      properties: {
        dateTime: { type: "string", description: "ISO 8601 observation date and time; a value without an offset is interpreted in the site's timeZone. Omit to predict for the currently configured view — preferred right after configure_sky_view." },
        maxMagnitude: { type: "integer", minimum: 1, maximum: 4, description: "Faintest magnitude to include" },
        limit: { type: "integer", minimum: 1, maximum: 20, description: "Maximum number of stars to return" },
      },
      required: ["maxMagnitude"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["dateTime", "maxMagnitude", "limit"]);
      const limit = optionalInteger(object, "limit");
      const dateTime = typeof object.dateTime === "string" && object.dateTime.trim() !== ""
        ? object.dateTime
        : state.getObservationSettings().datetime.toISOString();
      return predictVisibleStars({
        site: { ...state.getObservationSite() },
        dateTime,
        maxMagnitude: requiredNumber(object, "maxMagnitude"),
        ...(limit === undefined ? {} : { limit }),
      });
    }),
  };
}

function getCurrentSkyStateTool(state: ReadToolState): WebMcpTool {
  return {
    name: "get_current_sky_state",
    title: "Get current sky state",
    description: "Returns the current sky viewer conditions and a structured list of stars in the current view.",
    inputSchema: EMPTY_SCHEMA,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const object = assertObject(input);
      assertOnlyKeys(object, []);
      return getCurrentSkyState({
        site: { ...state.getObservationSite() },
        observation: state.getObservationSettings(),
        simulation: state.getSimulationSettings(),
        layers: state.getLayers(),
        displayOptions: state.getDisplayOptions(),
      });
    }),
  };
}

function describeCurrentViewTool(state: ReadToolState): WebMcpTool {
  return {
    name: "describe_current_view",
    title: "Describe current view",
    description: "Describes what the human is currently looking at: site, date/time, camera direction and field of view, sky projection mode, display layers, scene counts and objects in frame, the current selection, and a log of the human's recent interactions. Read-only.",
    inputSchema: EMPTY_SCHEMA,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const object = assertObject(input);
      assertOnlyKeys(object, []);
      return describeCurrentView({
        site: { ...state.getObservationSite() },
        observation: state.getObservationSettings(),
        simulation: state.getSimulationSettings(),
        layers: state.getLayers(),
        displayOptions: state.getDisplayOptions(),
        skyMode: state.getSkyMode(),
        selection: state.getSelection(),
        actions: state.getSkyActions(),
        metrics: state.getSceneMetrics(),
      });
    }),
  };
}

function toNightSite(state: ReadToolState): NightSite {
  const site = state.getObservationSite();
  return {
    latitude: site.latitude,
    longitude: site.longitude,
    ...(site.timeZone !== undefined ? { timeZone: site.timeZone } : {}),
  };
}

/**
 * The observing night an input date belongs to. A night is dated by the calendar
 * day it starts on (local noon to local noon), so the default is the site's local
 * date at the current observation datetime, or yesterday after midnight local.
 */
function defaultNightOf(state: ReadToolState): string {
  const site = toNightSite(state);
  const datetime = new Date(state.getObservationSettings().datetime);
  const timeZone = site.timeZone && isValidTimeZone(site.timeZone) ? site.timeZone : "UTC";
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(datetime);
  const parts = Object.fromEntries(
    local.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  const base = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  // Before local noon the observing night started on the previous calendar day.
  if (hour < 12) base.setUTCDate(base.getUTCDate() - 1);
  const y = base.getUTCFullYear();
  const m = `${base.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${base.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getNightEphemerisTool(state: ReadToolState): WebMcpTool {
  return {
    name: "get_night_ephemeris",
    title: "Get night ephemeris",
    description:
      "Returns the darkness ephemeris for one observing night at the selected site: sunset/sunrise, the three twilight boundaries, the astronomical darkness window, Moon illumination and moon-free intervals. A night runs local noon to local noon; omit nightOf for the night containing the current observation time. Geometric prediction only: no weather or horizon obstacles.",
    inputSchema: {
      type: "object",
      properties: {
        nightOf: {
          type: "string",
          description: "Calendar date the night starts on, YYYY-MM-DD (defaults to the current night)",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["nightOf"]);
      const raw = object["nightOf"];
      const nightOf = raw === undefined
        ? defaultNightOf(state)
        : requiredString(object, "nightOf");
      const site = toNightSite(state);
      const night = computeNightEphemeris(nightOf, site);
      return {
        summary: night.explanation,
        site: { ...state.getObservationSite() },
        night,
        caveats: [
          "Geometric prediction: weather, horizon obstacles, and real sky brightness are not included.",
        ],
      };
    }),
  };
}

function rankNightsTool(state: ReadToolState): WebMcpTool {
  return {
    name: "rank_nights",
    title: "Rank nights",
    description:
      "Scores every observing night in a date range at the selected site and returns them best first. The score is 10 points per usable dark hour (astronomical darkness with the Moon down or faint), capped at 100. Use it to answer 'when should I observe'. Geometric prediction only: no weather.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "First night to score, YYYY-MM-DD" },
        to: { type: "string", description: "Last night to score, YYYY-MM-DD (max range 62 days)" },
        limit: { type: "integer", minimum: 1, maximum: 62, description: "Maximum nights to return (default all)" },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["from", "to", "limit"]);
      const from = requiredString(object, "from");
      const to = requiredString(object, "to");
      const limit = optionalInteger(object, "limit");
      const site = toNightSite(state);
      const dates = isoDateRange(from, to);
      const ranked = rankNights(dates, site);
      const nights = limit === undefined ? ranked : ranked.slice(0, limit);
      const best = nights[0];
      return {
        summary:
          best === undefined
            ? `No nights scored between ${from} and ${to}.`
            : `Best of ${nights.length} night(s): ${best.nightOf} scores ${best.score}/100 — ${best.explanation}`,
        site: { ...state.getObservationSite() },
        nights,
        caveats: [
          "Geometric prediction: weather, horizon obstacles, and real sky brightness are not included.",
          "Scores compare nights at this site only; they are not comparable across sites.",
        ],
      };
    }),
  };
}

export async function registerReadTools(
  modelContext: WebMcpModelContext,
  state: ReadToolState,
  options: WebMcpRegisterOptions = {},
): Promise<void> {
  await modelContext.registerTool(getObservationSiteTool(state), options);
  await modelContext.registerTool(predictVisibleStarsTool(state), options);
  await modelContext.registerTool(getCurrentSkyStateTool(state), options);
  await modelContext.registerTool(describeCurrentViewTool(state), options);
  await modelContext.registerTool(getNightEphemerisTool(state), options);
  await modelContext.registerTool(rankNightsTool(state), options);
}
