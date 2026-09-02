import type { DisplayOptions, ObservationSettings, SimulationSettings } from "../types/astronomy";
import type { ObservationSite } from "../types/observation";
import type { StarLayerState } from "../astronomy/visibilityModel";
import type { MagnitudeLayer } from "../astronomy/magnitude";
import { PLACE_PRESETS } from "../astronomy/directions";
import { isValidTimeZone, localDateTimeToInstant } from "../astronomy/timezones";
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
import { resolveSkyLocation, valuesEqual, type SkyContextField, type SkyFieldChange } from "../sky/contextModel";

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
  openObserve: () => void;
  reportSkyMutation?: (report: { toolName: string; changes: SkyFieldChange[] }) => void;
}

function configureSkyViewTool(state: SkyControlToolState): WebMcpTool {
  const presetNames = PLACE_PRESETS.flatMap((preset) => [preset.id, preset.name]);
  return {
    name: "configure_sky_view",
    title: "Configure and open sky view",
    description: "Configures a location and local wall-clock time, then opens Sky in one operation. Use either a built-in preset id (for example new-york) or a custom site with latitude, longitude, and timeZone. localDateTime has no UTC offset and is interpreted in the selected site's time zone.",
    inputSchema: {
      type: "object",
      properties: {
        preset: { type: "string", enum: presetNames, description: "Built-in place preset id or name" },
        site: {
          type: "object",
          description: "Custom site; required when preset is omitted",
          properties: {
            name: { type: "string" },
            latitude: { type: "number", minimum: -90, maximum: 90 },
            longitude: { type: "number", minimum: -180, maximum: 180 },
            timeZone: { type: "string", description: "IANA time zone, for example America/New_York" },
          },
          required: ["name", "latitude", "longitude", "timeZone"],
          additionalProperties: false,
        },
        localDateTime: { type: "string", description: "Local time as YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss" },
        azimuth: { type: "number", minimum: 0, maximum: 359.999999 },
        altitude: { type: "number", minimum: 0, maximum: 90 },
        fieldOfView: { type: "number", minimum: 20, maximum: 140 },
      },
      required: ["localDateTime"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["preset", "site", "localDateTime", "azimuth", "altitude", "fieldOfView"]);
      const hasPreset = object.preset !== undefined;
      const hasSite = object.site !== undefined;
      if (hasPreset === hasSite) throw new RangeError("provide exactly one of preset or site");
      const currentSite = state.getObservationSite();
      let site: ObservationSite;
      if (hasPreset) {
        if (typeof object.preset !== "string") throw new RangeError("preset must be a string");
        const presetValue = object.preset.trim().toLowerCase();
        const preset = PLACE_PRESETS.find((item) => item.id === presetValue || item.name.toLowerCase() === presetValue);
        if (preset === undefined) throw new RangeError(`unknown preset: ${object.preset}`);
        site = applyObservationSitePatch(currentSite, {
          name: preset.name,
          latitude: preset.latitude,
          longitude: preset.longitude,
          timeZone: preset.timeZone,
        });
      } else {
        const custom = normalizeObservationSitePatch(object.site);
        if (custom.name === undefined || custom.timeZone === undefined) {
          throw new RangeError("custom site requires name and timeZone");
        }
        site = applyObservationSitePatch(currentSite, custom);
      }
      if (typeof object.localDateTime !== "string") throw new RangeError("localDateTime must be a string");
      if (!isValidTimeZone(site.timeZone)) throw new RangeError("selected site must have a valid timeZone");
      const dateTime = localDateTimeToInstant(object.localDateTime, site.timeZone).toISOString();
      const current = state.getObservationSettings();
      const viewPatch = normalizeSkyViewSettingsPatch({
        dateTime,
        ...(object.azimuth === undefined ? {} : { azimuth: object.azimuth as number }),
        ...(object.altitude === undefined ? {} : { altitude: object.altitude as number }),
        ...(object.fieldOfView === undefined ? {} : { fieldOfView: object.fieldOfView as number }),
      });
      const view = applySkyViewSettingsPatch(current, viewPatch);
      state.updateObservationSite({ name: site.name, latitude: site.latitude, longitude: site.longitude, timeZone: site.timeZone });
      state.updateObservationSettings({ latitude: site.latitude, longitude: site.longitude, datetime: new Date(view.dateTime), azimuth: view.azimuth, altitude: view.altitude, fieldOfView: view.fieldOfView });
      state.openSky();
      reportSkyMutation(state, "configure_sky_view", [
        changed("location", resolveSkyLocation(currentSite, currentSite).label, resolveSkyLocation(site, site).label),
        changed("coordinates", [currentSite.latitude, currentSite.longitude], [site.latitude, site.longitude]),
        changed("dateTime", current.datetime.toISOString(), view.dateTime),
        changed("direction", current.azimuth, view.azimuth),
        changed("altitude", current.altitude, view.altitude),
        changed("fieldOfView", current.fieldOfView, view.fieldOfView),
      ].filter((item): item is SkyFieldChange => item !== null));
      return { view: "sky" as const, site, ...view };
    }),
  };
}

function changed(field: SkyContextField, before: unknown, after: unknown, derived = false): SkyFieldChange | null {
  return valuesEqual(before, after) ? null : { field, before, after, ...(derived ? { derived: true } : {}) };
}

function reportSkyMutation(state: SkyControlToolState, toolName: string, changes: SkyFieldChange[]): void {
  try {
    state.reportSkyMutation?.({ toolName, changes });
  } catch {
    // Activity presentation is best effort and must never fail a tool call.
  }
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

function openObserveViewTool(state: SkyControlToolState): WebMcpTool {
  return {
    name: "open_observe_view",
    title: "Open Observe view",
    description: "Opens the human-facing Observe screen so the user can record observations for the active Mission.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const object = assertObject(input);
      assertOnlyKeys(object, []);
      state.openObserve();
      return { view: "observe" as const };
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
        timeZone: { type: "string", description: "Optional IANA time zone, for example Asia/Tokyo" },
      },
      required: ["latitude", "longitude"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const patch = normalizeObservationSitePatch(input);
      const current = state.getObservationSite();
      const site = applyObservationSitePatch(current, patch);
      state.updateObservationSite({ name: site.name, latitude: site.latitude, longitude: site.longitude, timeZone: site.timeZone });
      state.updateObservationSettings({ latitude: site.latitude, longitude: site.longitude });
      const beforeLocation = resolveSkyLocation(current, current).label;
      const afterLocation = resolveSkyLocation(site, site).label;
      const changes = [
        changed("location", beforeLocation, afterLocation),
        changed("coordinates", [current.latitude, current.longitude], [site.latitude, site.longitude]),
      ].filter((item): item is SkyFieldChange => item !== null);
      reportSkyMutation(state, "set_observation_site", changes);
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
      const changes = [
        patch.dateTime === undefined ? null : changed("dateTime", current.datetime.toISOString(), view.dateTime),
        patch.azimuth === undefined ? null : changed("direction", current.azimuth, view.azimuth),
        patch.altitude === undefined ? null : changed("altitude", current.altitude, view.altitude),
        patch.fieldOfView === undefined ? null : changed("fieldOfView", current.fieldOfView, view.fieldOfView),
      ].filter((item): item is SkyFieldChange => item !== null);
      reportSkyMutation(state, "set_sky_view_settings", changes);
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
      const changes = [
        changed("stars", current.displayOptions.stars, next.displayOptions.stars),
        changed("starNames", current.displayOptions.starNames, next.displayOptions.starNames),
        changed("constellationLines", current.displayOptions.constellationLines, next.displayOptions.constellationLines),
        changed("constellationNames", current.displayOptions.constellationNames, next.displayOptions.constellationNames),
        changed("brightnessLayers", current.layers, next.layers),
        changed("daylight", current.simulation.daylightMode, next.simulation.daylightMode),
        changed("lightPollution", current.simulation.lightPollution, next.simulation.lightPollution),
        changed("limitingMagnitude", current.simulation.limitingMagnitude, next.simulation.limitingMagnitude),
        changed("observerSensitivity", current.simulation.observerSensitivity ?? 0, next.simulation.observerSensitivity ?? 0),
        changed("hiddenStars", current.simulation.showHiddenStars, next.simulation.showHiddenStars),
      ].filter((item): item is SkyFieldChange => item !== null);
      reportSkyMutation(state, "set_sky_display_settings", changes);
      return next;
    }),
  };
}

export async function registerSkyControlTools(
  modelContext: WebMcpModelContext,
  state: SkyControlToolState,
  options: WebMcpRegisterOptions = {},
): Promise<void> {
  await modelContext.registerTool(configureSkyViewTool(state), options);
  await modelContext.registerTool(openSkyViewTool(state), options);
  await modelContext.registerTool(openObserveViewTool(state), options);
  await modelContext.registerTool(setObservationSiteTool(state), options);
  await modelContext.registerTool(setSkyViewSettingsTool(state), options);
  await modelContext.registerTool(setSkyDisplaySettingsTool(state), options);
}
