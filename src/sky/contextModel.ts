import { PLACE_PRESETS } from "../astronomy/directions";
import {
  formatDateTimeInZone,
  isValidTimeZone,
} from "../astronomy/timezones";
import type {
  DisplayOptions,
  ObservationSettings,
  SimulationSettings,
} from "../types/astronomy";
import type { ObservationSite } from "../types/observation";
import type { StarLayerState } from "../astronomy/visibilityModel";

export type SkyContextField =
  | "location"
  | "coordinates"
  | "dateTime"
  | "direction"
  | "altitude"
  | "fieldOfView"
  | "visibleStars"
  | "brightnessLayers"
  | "daylight"
  | "lightPollution"
  | "limitingMagnitude"
  | "observerSensitivity"
  | "hiddenStars"
  | "stars"
  | "starNames"
  | "constellationLines"
  | "constellationNames";

export interface SkyFieldChange {
  field: SkyContextField;
  before: unknown;
  after: unknown;
  derived?: boolean;
}

export interface SkyWebMcpActivity {
  id: string;
  source: "webmcp";
  toolNames: string[];
  startedAt: number;
  updatedAt: number;
  changes: SkyFieldChange[];
}

export interface SkySceneMetrics {
  mode: "single" | "compare";
  visibleCount?: number;
  baseCount?: number;
  changedCount?: number;
}

export interface SkyContextRow {
  field: SkyContextField;
  label: string;
  value: string;
  raw: unknown;
}

export interface SkyContextModel {
  observation: SkyContextRow[];
  visibility: SkyContextRow[];
  display: SkyContextRow[];
  compareLabel: string | null;
}

const CURRENT_SKY_BASE_FIELDS: readonly SkyContextField[] = [
  "location",
  "dateTime",
  "direction",
  "visibleStars",
];

const EPSILON = 1e-6;
const DIRECTION_LABELS = [
  "North",
  "Northeast",
  "East",
  "Southeast",
  "South",
  "Southwest",
  "West",
  "Northwest",
] as const;

export function normalizeAzimuth(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function directionLabel(azimuth: number): string {
  const normalized = normalizeAzimuth(azimuth);
  return DIRECTION_LABELS[Math.round(normalized / 45) % 8];
}

export function formatDirection(azimuth: number): string {
  const normalized = normalizeAzimuth(azimuth);
  return `${directionLabel(normalized)} / ${Math.round(normalized)}°`;
}

export function coordinatesKey(site: Pick<ObservationSite, "latitude" | "longitude">): [number, number] {
  return [site.latitude, site.longitude];
}

export function matchingPreset(
  coordinates: Pick<ObservationSite, "latitude" | "longitude">,
) {
  return PLACE_PRESETS.find(
    (place) =>
      Math.abs(place.latitude - coordinates.latitude) <= EPSILON &&
      Math.abs(place.longitude - coordinates.longitude) <= EPSILON,
  ) ?? null;
}

export interface ResolvedSkyLocation {
  label: string;
  timeZone: string;
  usesBrowserTime: boolean;
  presetId: string | null;
}

export function resolveSkyLocation(
  coordinates: Pick<ObservationSite, "latitude" | "longitude">,
  activeSite: ObservationSite,
): ResolvedSkyLocation {
  const preset = matchingPreset(coordinates);
  if (preset !== null) {
    return { label: preset.name, timeZone: preset.timeZone, usesBrowserTime: false, presetId: preset.id };
  }
  if (
    Math.abs(activeSite.latitude - coordinates.latitude) <= EPSILON &&
    Math.abs(activeSite.longitude - coordinates.longitude) <= EPSILON
  ) {
    if (isValidTimeZone(activeSite.timeZone)) {
      return { label: activeSite.name, timeZone: activeSite.timeZone, usesBrowserTime: false, presetId: null };
    }
    return {
      label: activeSite.name,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      usesBrowserTime: true,
      presetId: null,
    };
  }
  return {
    label: "Custom location",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    usesBrowserTime: true,
    presetId: null,
  };
}

export function formatSkyDateTime(
  date: Date,
  coordinates: Pick<ObservationSite, "latitude" | "longitude">,
  activeSite: ObservationSite,
): string {
  const location = resolveSkyLocation(coordinates, activeSite);
  const formatted = formatDateTimeInZone(date, location.timeZone);
  return location.usesBrowserTime ? `${formatted} (Browser time)` : formatted;
}

export function brightnessLayerLabel(layers: StarLayerState): string {
  const labels = [
    [layers.first, "1st"],
    [layers.second, "2nd"],
    [layers.third, "3rd"],
    [layers.fourth, "4th"],
    [layers.faint, "5th+"],
  ] as const;
  const enabled = labels.filter(([active]) => active).map(([, label]) => label);
  return enabled.length === 0 ? "None" : enabled.join(", ");
}

export function observerSensitivityLabel(value: number | undefined): string {
  const sensitivity = value ?? 0;
  if (sensitivity > 0) return `More sensitive / +${sensitivity.toFixed(2)}`;
  if (sensitivity < 0) return `Less sensitive / ${sensitivity.toFixed(2)}`;
  return "Typical / 0.00";
}

export function contextValueForField(model: SkyContextModel, field: SkyContextField): unknown {
  return [...model.observation, ...model.visibility, ...model.display].find((row) => row.field === field)?.raw;
}

function row(field: SkyContextField, label: string, value: string, raw: unknown): SkyContextRow {
  return { field, label, value, raw };
}

export function buildSkyContextModel(input: {
  activeSite: ObservationSite;
  observation: ObservationSettings;
  simulation: SimulationSettings;
  layers: StarLayerState;
  displayOptions: DisplayOptions;
  metrics: SkySceneMetrics | null;
  compareLabel?: string | null;
}): SkyContextModel {
  const location = resolveSkyLocation(input.observation, input.activeSite);
  const visibleValue = input.metrics === null
    ? "—"
    : input.metrics.mode === "compare"
      ? `Base ${input.metrics.baseCount ?? "—"} · Changed ${input.metrics.changedCount ?? "—"}`
      : String(input.metrics.visibleCount ?? "—");
  const visibleRaw = input.metrics === null
    ? null
    : input.metrics.mode === "compare"
      ? { base: input.metrics.baseCount ?? null, changed: input.metrics.changedCount ?? null }
      : input.metrics.visibleCount ?? null;
  return {
    observation: [
      row("location", "Location", location.label, location.label),
      row("coordinates", "Coordinates", `${input.observation.latitude.toFixed(4)}, ${input.observation.longitude.toFixed(4)}`, coordinatesKey(input.observation)),
      row("dateTime", "Date & Time", formatSkyDateTime(input.observation.datetime, input.observation, input.activeSite), input.observation.datetime.toISOString()),
      row("direction", "Direction", formatDirection(input.observation.azimuth), normalizeAzimuth(input.observation.azimuth)),
      row("altitude", "Altitude", `${Math.round(input.observation.altitude)}°`, input.observation.altitude),
      row("fieldOfView", "Field of View", `${Math.round(input.observation.fieldOfView)}°`, input.observation.fieldOfView),
      row("visibleStars", "Visible Stars", visibleValue, visibleRaw),
    ],
    visibility: [
      row("brightnessLayers", "Brightness Layers", brightnessLayerLabel(input.layers), { ...input.layers }),
      row("daylight", "Daylight", input.simulation.daylightMode === "real" ? "Real" : "Removed", input.simulation.daylightMode),
      row("lightPollution", "Light Pollution", lightPollutionLabel(input.simulation.lightPollution), input.simulation.lightPollution),
      row("limitingMagnitude", "Limiting Magnitude", input.simulation.limitingMagnitude.toFixed(1), input.simulation.limitingMagnitude),
      row("observerSensitivity", "Observer Sensitivity", observerSensitivityLabel(input.simulation.observerSensitivity), input.simulation.observerSensitivity ?? 0),
      row("hiddenStars", "Hidden Stars", input.simulation.showHiddenStars ? "Shown faintly" : "Not shown", input.simulation.showHiddenStars),
    ],
    display: [
      row("stars", "Stars", onOff(input.displayOptions.stars), input.displayOptions.stars),
      row("starNames", "Star Names", onOff(input.displayOptions.starNames), input.displayOptions.starNames),
      row("constellationLines", "Constellation Lines", onOff(input.displayOptions.constellationLines), input.displayOptions.constellationLines),
      row("constellationNames", "Constellation Names", onOff(input.displayOptions.constellationNames), input.displayOptions.constellationNames),
    ],
    compareLabel: input.metrics?.mode === "compare" ? input.compareLabel ?? null : null,
  };
}

/**
 * Select the compact set of rows shown in Agent Activity. The most recently
 * changed fields lead the list so the panel explains the agent's last action;
 * stable observation fields fill the remaining slots.
 */
export function buildCurrentSkyRows(
  model: SkyContextModel,
  activity: Pick<SkyWebMcpActivity, "changes"> | null,
  maxRows = 6,
): SkyContextRow[] {
  if (maxRows <= 0) return [];
  const allRows = [...model.observation, ...model.visibility, ...model.display];
  const byField = new Map(allRows.map((row) => [row.field, row]));
  const requestedFields = activity?.changes.map((change) => change.field) ?? [];
  const orderedFields = [...requestedFields, ...CURRENT_SKY_BASE_FIELDS];
  const selected = new Set<SkyContextField>();
  const rows: SkyContextRow[] = [];

  for (const field of orderedFields) {
    if (selected.has(field)) continue;
    const row = byField.get(field);
    if (row === undefined) continue;
    selected.add(field);
    rows.push(row);
    if (rows.length >= maxRows) break;
  }

  return rows;
}

function onOff(value: boolean): string {
  return value ? "On" : "Off";
}

function lightPollutionLabel(value: SimulationSettings["lightPollution"]): string {
  return {
    "city-center": "City",
    urban: "Urban",
    suburban: "Suburban",
    "dark-sky": "Dark Sky",
    perfect: "Perfect",
  }[value];
}

export function valuesEqual(before: unknown, after: unknown): boolean {
  if (Object.is(before, after)) return true;
  try {
    return JSON.stringify(before) === JSON.stringify(after);
  } catch {
    return false;
  }
}
