import type { DisplayOptions, ObservationSettings, SimulationSettings } from "../types/astronomy";
import type { ObservationSite } from "../types/observation";
import type { StarLayerState } from "../astronomy/visibilityModel";
import type { MagnitudeLayer } from "../astronomy/magnitude";
import { assertObject, assertOnlyKeys, safeExecute } from "./input";
import type { WebMcpModelContext, WebMcpRegisterOptions, WebMcpTool } from "./webmcp";
import {
  applyObservationSitePatch,
  applySkyDisplaySettingsPatch,
  applySkyViewSettingsPatch,
  normalizeObservationSitePatch,
  normalizeSkyDisplaySettingsPatch,
  normalizeSkyViewSettingsPatch,
} from "./skyControlServices";

export interface SkyControlToolState {
  getObservationSite: () => ObservationSite;
  getObservationSettings: () => ObservationSettings;
  updateObservationSite: (patch: Partial<ObservationSite>) => void;
  updateObservationSettings: (patch: Partial<ObservationSettings>) => void;
  getDisplayOptions: () => DisplayOptions;
  getLayers: () => StarLayerState;
  getSimulationSettings: () => SimulationSettings;
  updateDisplayOptions: (patch: Partial<DisplayOptions>) => void;
  setLayerEnabled: (layer: MagnitudeLayer, enabled: boolean) => void;
  setDaylightMode: (mode: SimulationSettings["daylightMode"]) => void;
  setLightPollution: (level: SimulationSettings["lightPollution"]) => void;
  setLimitingMagnitude: (value: number) => void;
  setObserverSensitivity: (value: number) => void;
  setShowHiddenStars: (value: boolean) => void;
  openSky: () => void;
}

function openSkyViewTool(state: SkyControlToolState): WebMcpTool {
  return {
    name: "open_sky_view",
    title: "Open sky view",
    description: "Opens the human-facing Sky screen without changing sky conditions. Use get_current_sky_state to read structured star positions; this tool does not return a screenshot.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const object = assertObject(input);
      assertOnlyKeys(object, []);
      state.openSky();
      const settings = state.getObservationSettings();
      return {
        view: "sky" as const,
        ...applySkyViewSettingsPatch(settings, {}),
      };
    }),
  };
}

function setObservationSiteTool(state: SkyControlToolState): WebMcpTool {
  return {
    name: "set_observation_site",
    title: "Set observation site",
    description: "Sets the observation site and synchronizes its latitude and longitude with the Sky viewer. Existing Missions keep their creation-time site snapshots.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Optional display name; the existing name is kept when omitted" },
        latitude: { type: "number", minimum: -90, maximum: 90, description: "Latitude in degrees" },
        longitude: { type: "number", minimum: -180, maximum: 180, description: "Longitude in degrees" },
      },
      required: ["latitude", "longitude"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const patch = normalizeObservationSitePatch(input);
      const current = state.getObservationSite();
      const site = applyObservationSitePatch(current, patch);
      state.updateObservationSite({ name: site.name, latitude: site.latitude, longitude: site.longitude });
      state.updateObservationSettings({ latitude: site.latitude, longitude: site.longitude });
      return { site, skyLocationSynchronized: true };
    }),
  };
}

function setSkyViewSettingsTool(state: SkyControlToolState): WebMcpTool {
  return {
    name: "set_sky_view_settings",
    title: "Set sky view settings",
    description: "Changes Sky viewer date/time, direction, elevation, and field of view. Use set_observation_site for latitude and longitude. Existing Mission predictions are not recalculated.",
    inputSchema: {
      type: "object",
      properties: {
        dateTime: { type: "string", description: "ISO 8601 observation date and time" },
        azimuth: { type: "number", minimum: 0, maximum: 359.999999, description: "View azimuth in degrees; 0 is north" },
        altitude: { type: "number", minimum: 0, maximum: 90, description: "View altitude in degrees" },
        fieldOfView: { type: "number", minimum: 20, maximum: 140, description: "Vertical field of view in degrees" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const patch = normalizeSkyViewSettingsPatch(input);
      const current = state.getObservationSettings();
      const view = applySkyViewSettingsPatch(current, patch);
      state.updateObservationSettings({
        ...(patch.dateTime === undefined ? {} : { datetime: new Date(view.dateTime) }),
        ...(patch.azimuth === undefined ? {} : { azimuth: view.azimuth }),
        ...(patch.altitude === undefined ? {} : { altitude: view.altitude }),
        ...(patch.fieldOfView === undefined ? {} : { fieldOfView: view.fieldOfView }),
      });
      return view;
    }),
  };
}

function setSkyDisplaySettingsTool(state: SkyControlToolState): WebMcpTool {
  return {
    name: "set_sky_display_settings",
    title: "Set sky display settings",
    description: "Changes Sky display layers, labels, and local simulation settings. firstMagnitude through faintMagnitude are display layers only; they are not Mission maxMagnitude and never change Mission targets or prediction snapshots.",
    inputSchema: {
      type: "object",
      properties: {
        stars: { type: "boolean", description: "Show stars" },
        starNames: { type: "boolean", description: "Show star names" },
        constellationLines: { type: "boolean", description: "Show constellation lines" },
        constellationNames: { type: "boolean", description: "Show constellation names" },
        firstMagnitude: { type: "boolean", description: "Enable 1st-magnitude display layer only" },
        secondMagnitude: { type: "boolean", description: "Enable 2nd-magnitude display layer only" },
        thirdMagnitude: { type: "boolean", description: "Enable 3rd-magnitude display layer only" },
        fourthMagnitude: { type: "boolean", description: "Enable 4th-magnitude display layer only" },
        faintMagnitude: { type: "boolean", description: "Enable 5th-magnitude-and-fainter display layer" },
        daylightMode: { type: "string", enum: ["real", "removed"], description: "Use real daylight or remove daylight for simulation" },
        lightPollution: { type: "string", enum: ["city-center", "urban", "suburban", "dark-sky", "perfect"], description: "Local light-pollution preset" },
        limitingMagnitude: { type: "number", minimum: 1, maximum: 6.5, description: "Manual faintest simulated magnitude" },
        observerSensitivity: { type: "number", minimum: -0.5, maximum: 0.5, description: "Observer sensitivity correction in magnitudes" },
        showHiddenStars: { type: "boolean", description: "Show stars that are present but hidden" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const patch = normalizeSkyDisplaySettingsPatch(input);
      const current = {
        displayOptions: state.getDisplayOptions(),
        layers: state.getLayers(),
        simulation: state.getSimulationSettings(),
      };
      const next = applySkyDisplaySettingsPatch(current, patch);
      state.updateDisplayOptions(next.displayOptions);
      for (const [layer, enabled] of Object.entries(next.layers) as [MagnitudeLayer, boolean][]) {
        if (enabled !== current.layers[layer]) state.setLayerEnabled(layer, enabled);
      }
      if (patch.daylightMode !== undefined) state.setDaylightMode(next.simulation.daylightMode);
      if (patch.lightPollution !== undefined) state.setLightPollution(next.simulation.lightPollution);
      if (patch.limitingMagnitude !== undefined) state.setLimitingMagnitude(next.simulation.limitingMagnitude);
      if (patch.observerSensitivity !== undefined) state.setObserverSensitivity(next.simulation.observerSensitivity ?? 0);
      if (patch.showHiddenStars !== undefined) state.setShowHiddenStars(next.simulation.showHiddenStars);
      return next;
    }),
  };
}

export async function registerSkyControlTools(
  modelContext: WebMcpModelContext,
  state: SkyControlToolState,
  options: WebMcpRegisterOptions = {},
): Promise<void> {
  await modelContext.registerTool(openSkyViewTool(state), options);
  await modelContext.registerTool(setObservationSiteTool(state), options);
  await modelContext.registerTool(setSkyViewSettingsTool(state), options);
  await modelContext.registerTool(setSkyDisplaySettingsTool(state), options);
}
