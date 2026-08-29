import type {
  DisplayOptions,
  ObservationSettings,
  SimulationSettings,
} from "../types/astronomy";
import type { StarLayerState } from "../astronomy/visibilityModel";
import {
  getCurrentSkyState,
  predictVisibleStars,
} from "./services";
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
  }>;
  getObservationSettings: () => ObservationSettings;
  getSimulationSettings: () => SimulationSettings;
  getLayers: () => StarLayerState;
  getDisplayOptions: () => DisplayOptions;
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
        dateTime: { type: "string", description: "ISO 8601 observation date and time" },
        maxMagnitude: { type: "integer", minimum: 1, maximum: 4, description: "Faintest magnitude to include" },
        limit: { type: "integer", minimum: 1, maximum: 20, description: "Maximum number of stars to return" },
      },
      required: ["dateTime", "maxMagnitude"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["dateTime", "maxMagnitude", "limit"]);
      const limit = optionalInteger(object, "limit");
      return predictVisibleStars({
        site: { ...state.getObservationSite() },
        dateTime: requiredString(object, "dateTime"),
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

export async function registerReadTools(
  modelContext: WebMcpModelContext,
  state: ReadToolState,
  options: WebMcpRegisterOptions = {},
): Promise<void> {
  await modelContext.registerTool(getObservationSiteTool(state), options);
  await modelContext.registerTool(predictVisibleStarsTool(state), options);
  await modelContext.registerTool(getCurrentSkyStateTool(state), options);
}
