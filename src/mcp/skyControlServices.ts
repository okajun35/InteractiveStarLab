import { LIMITS } from "../astronomy/validation";
import {
  LIMITING_MAGNITUDE_RANGE,
  OBSERVER_SENSITIVITY_RANGE,
  lightPollutionLimit,
  type MagnitudeLayer,
} from "../astronomy/magnitude";
import type {
  DisplayOptions,
  LightPollution,
  ObservationSettings,
  SimulationSettings,
} from "../types/astronomy";
import type { StarLayerState } from "../astronomy/visibilityModel";
import type { ObservationSite } from "../types/observation";

export interface ObservationSitePatch {
  name?: string;
  latitude: number;
  longitude: number;
}

export interface SkyViewSettingsPatch {
  dateTime?: string;
  azimuth?: number;
  altitude?: number;
  fieldOfView?: number;
}

export interface SkyViewSettingsResult {
  dateTime: string;
  azimuth: number;
  altitude: number;
  fieldOfView: number;
}

export interface SkyDisplaySettingsPatch {
  stars?: boolean;
  starNames?: boolean;
  constellationLines?: boolean;
  constellationNames?: boolean;
  firstMagnitude?: boolean;
  secondMagnitude?: boolean;
  thirdMagnitude?: boolean;
  fourthMagnitude?: boolean;
  faintMagnitude?: boolean;
  daylightMode?: SimulationSettings["daylightMode"];
  lightPollution?: SimulationSettings["lightPollution"];
  limitingMagnitude?: number;
  observerSensitivity?: number;
  showHiddenStars?: boolean;
}

export interface SkyDisplaySettingsResult {
  displayOptions: DisplayOptions;
  layers: StarLayerState;
  simulation: SimulationSettings;
}

const VIEW_KEYS = ["dateTime", "azimuth", "altitude", "fieldOfView"] as const;
const DISPLAY_KEYS = [
  "stars", "starNames", "constellationLines", "constellationNames",
  "firstMagnitude", "secondMagnitude", "thirdMagnitude", "fourthMagnitude", "faintMagnitude",
  "daylightMode", "lightPollution", "limitingMagnitude", "observerSensitivity", "showHiddenStars",
] as const;
const LIGHT_POLLUTION_VALUES: readonly LightPollution[] = [
  "city-center", "urban", "suburban", "dark-sky", "perfect",
];

export function normalizeObservationSitePatch(value: unknown): ObservationSitePatch {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RangeError("site must be an object");
  }
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !["name", "latitude", "longitude"].includes(key))) {
    throw new RangeError("site contains an unknown property");
  }
  if (typeof object.latitude !== "number" || !Number.isFinite(object.latitude) || object.latitude < LIMITS.latitude.min || object.latitude > LIMITS.latitude.max) {
    throw new RangeError("latitude is outside the supported range");
  }
  if (typeof object.longitude !== "number" || !Number.isFinite(object.longitude) || object.longitude < LIMITS.longitude.min || object.longitude > LIMITS.longitude.max) {
    throw new RangeError("longitude is outside the supported range");
  }
  if (object.name !== undefined && (typeof object.name !== "string" || object.name.trim() === "")) {
    throw new RangeError("name must be a non-empty string when provided");
  }
  return {
    ...(object.name === undefined ? {} : { name: (object.name as string).trim() }),
    latitude: object.latitude,
    longitude: object.longitude,
  };
}

export function applyObservationSitePatch(
  current: ObservationSite,
  patch: ObservationSitePatch,
): ObservationSite {
  return {
    ...current,
    ...(patch.name === undefined ? {} : { name: patch.name }),
    latitude: patch.latitude,
    longitude: patch.longitude,
  };
}

function assertPatchObject(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RangeError(`${name} must be an object`);
  }
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length === 0) throw new RangeError(`${name} must not be empty`);
  if (Object.keys(object).some((key) => !keys.includes(key))) {
    throw new RangeError(`${name} contains an unknown property`);
  }
  return object;
}

function optionalFiniteNumber(object: Record<string, unknown>, key: string): number | undefined {
  if (object[key] === undefined) return undefined;
  if (typeof object[key] !== "number" || !Number.isFinite(object[key])) {
    throw new RangeError(`${key} must be a finite number`);
  }
  return object[key] as number;
}

function optionalBoolean(object: Record<string, unknown>, key: string): boolean | undefined {
  if (object[key] === undefined) return undefined;
  if (typeof object[key] !== "boolean") throw new RangeError(`${key} must be a boolean`);
  return object[key] as boolean;
}

function optionalEnum<T extends string>(object: Record<string, unknown>, key: string, values: readonly T[]): T | undefined {
  if (object[key] === undefined) return undefined;
  if (typeof object[key] !== "string" || !values.includes(object[key] as T)) {
    throw new RangeError(`${key} has an unsupported value`);
  }
  return object[key] as T;
}

export function normalizeSkyViewSettingsPatch(value: unknown): SkyViewSettingsPatch {
  const object = assertPatchObject(value, VIEW_KEYS, "settings");
  const dateTime = object.dateTime;
  if (dateTime !== undefined && (typeof dateTime !== "string" || Number.isNaN(new Date(dateTime).getTime()))) {
    throw new RangeError("dateTime must be a valid ISO datetime");
  }
  const azimuth = optionalFiniteNumber(object, "azimuth");
  const altitude = optionalFiniteNumber(object, "altitude");
  const fieldOfView = optionalFiniteNumber(object, "fieldOfView");
  if (azimuth !== undefined && (azimuth < LIMITS.azimuth.min || azimuth >= LIMITS.azimuth.max)) {
    throw new RangeError("azimuth must be from 0 up to (but not including) 360");
  }
  if (altitude !== undefined && (altitude < LIMITS.altitude.min || altitude > LIMITS.altitude.max)) {
    throw new RangeError("altitude must be from 0 to 90");
  }
  if (fieldOfView !== undefined && (fieldOfView < LIMITS.fieldOfView.min || fieldOfView > LIMITS.fieldOfView.max)) {
    throw new RangeError("fieldOfView is outside the supported range");
  }
  return {
    ...(dateTime === undefined ? {} : { dateTime }),
    ...(azimuth === undefined ? {} : { azimuth }),
    ...(altitude === undefined ? {} : { altitude }),
    ...(fieldOfView === undefined ? {} : { fieldOfView }),
  };
}

export function applySkyViewSettingsPatch(
  current: ObservationSettings,
  patch: SkyViewSettingsPatch,
): SkyViewSettingsResult {
  return {
    dateTime: patch.dateTime === undefined ? current.datetime.toISOString() : new Date(patch.dateTime).toISOString(),
    azimuth: patch.azimuth ?? current.azimuth,
    altitude: patch.altitude ?? current.altitude,
    fieldOfView: patch.fieldOfView ?? current.fieldOfView,
  };
}

export function normalizeSkyDisplaySettingsPatch(value: unknown): SkyDisplaySettingsPatch {
  const object = assertPatchObject(value, DISPLAY_KEYS, "settings");
  const result: SkyDisplaySettingsPatch = {};
  for (const key of ["stars", "starNames", "constellationLines", "constellationNames", "firstMagnitude", "secondMagnitude", "thirdMagnitude", "fourthMagnitude", "faintMagnitude", "showHiddenStars"] as const) {
    const valueForKey = optionalBoolean(object, key);
    if (valueForKey !== undefined) result[key] = valueForKey;
  }
  const daylightMode = optionalEnum(object, "daylightMode", ["real", "removed"] as const);
  if (daylightMode !== undefined) result.daylightMode = daylightMode;
  const lightPollution = optionalEnum(object, "lightPollution", LIGHT_POLLUTION_VALUES);
  if (lightPollution !== undefined) result.lightPollution = lightPollution;
  const limitingMagnitude = optionalFiniteNumber(object, "limitingMagnitude");
  if (limitingMagnitude !== undefined) {
    if (limitingMagnitude < LIMITING_MAGNITUDE_RANGE.min || limitingMagnitude > LIMITING_MAGNITUDE_RANGE.max) {
      throw new RangeError("limitingMagnitude is outside the supported range");
    }
    result.limitingMagnitude = limitingMagnitude;
  }
  const observerSensitivity = optionalFiniteNumber(object, "observerSensitivity");
  if (observerSensitivity !== undefined) {
    if (observerSensitivity < OBSERVER_SENSITIVITY_RANGE.min || observerSensitivity > OBSERVER_SENSITIVITY_RANGE.max) {
      throw new RangeError("observerSensitivity is outside the supported range");
    }
    result.observerSensitivity = observerSensitivity;
  }
  return result;
}

export function applySkyDisplaySettingsPatch(
  current: SkyDisplaySettingsResult,
  patch: SkyDisplaySettingsPatch,
): SkyDisplaySettingsResult {
  const layerPatch: Partial<Record<MagnitudeLayer, boolean>> = {};
  for (const [inputKey, layer] of [["firstMagnitude", "first"], ["secondMagnitude", "second"], ["thirdMagnitude", "third"], ["fourthMagnitude", "fourth"], ["faintMagnitude", "faint"]] as const) {
    if (patch[inputKey] !== undefined) layerPatch[layer] = patch[inputKey];
  }
  const simulation = {
    ...current.simulation,
    ...(patch.daylightMode === undefined ? {} : { daylightMode: patch.daylightMode }),
    ...(patch.showHiddenStars === undefined ? {} : { showHiddenStars: patch.showHiddenStars }),
    ...(patch.observerSensitivity === undefined ? {} : { observerSensitivity: patch.observerSensitivity }),
    ...(patch.lightPollution === undefined ? {} : { lightPollution: patch.lightPollution }),
    ...(patch.lightPollution === undefined || patch.limitingMagnitude !== undefined
      ? {}
      : { limitingMagnitude: lightPollutionLimit(patch.lightPollution) }),
    ...(patch.limitingMagnitude === undefined ? {} : { limitingMagnitude: patch.limitingMagnitude }),
  };
  return {
    displayOptions: {
      ...current.displayOptions,
      ...(patch.stars === undefined ? {} : { stars: patch.stars }),
      ...(patch.starNames === undefined ? {} : { starNames: patch.starNames }),
      ...(patch.constellationLines === undefined ? {} : { constellationLines: patch.constellationLines }),
      ...(patch.constellationNames === undefined ? {} : { constellationNames: patch.constellationNames }),
    },
    layers: { ...current.layers, ...layerPatch },
    simulation,
  };
}
