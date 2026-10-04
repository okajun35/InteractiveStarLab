/**
 * Shareable sky URLs — the full viewer state travels inside the URL fragment
 * (`#sky=<base64url>`), so a link can be copied and opened without any server
 * round trip (mirrors Roque Nights' plan share URLs).
 *
 * The payload is versioned (`v: 1`). Decoding validates every provided field
 * and returns null on malformed input rather than throwing.
 */
import {
  LIMITING_MAGNITUDE_RANGE,
  OBSERVER_SENSITIVITY_RANGE,
} from "../astronomy/magnitude";
import { LIMITS } from "../astronomy/validation";
import type { StarLayerState } from "../astronomy/visibilityModel";
import type {
  DisplayOptions,
  SimulationSettings,
  SkyMode,
} from "../types/astronomy";

export interface SkyShareObservation {
  latitude?: number;
  longitude?: number;
  /** ISO 8601 instant. */
  datetime?: string;
  azimuth?: number;
  altitude?: number;
  fieldOfView?: number;
}

export interface SkySharePayload {
  v: 1;
  /** Optional human-readable note shown by the sharer. */
  label?: string;
  skyMode?: SkyMode;
  observation?: SkyShareObservation;
  simulation?: Partial<SimulationSettings>;
  layers?: Partial<StarLayerState>;
  display?: Partial<DisplayOptions>;
}

const PREFIX = "#sky=";

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): string | null {
  try {
    const padded = token.replace(/-/g, "+").replace(/_/g, "/")
      + "=".repeat((4 - (token.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Encode a payload as a `#sky=...` URL fragment. */
export function encodeSkyShare(payload: SkySharePayload): string {
  return `${PREFIX}${toBase64Url(JSON.stringify(payload))}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numberInRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && value >= min && value <= max;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const DAYLIGHT_MODES = ["real", "removed"];
const LIGHT_POLLUTIONS = ["city-center", "urban", "suburban", "dark-sky", "perfect"];
const SKY_MODES: SkyMode[] = ["window", "dome"];

const OBSERVATION_RULES: Record<
  keyof SkyShareObservation,
  { min: number; max: number } | "iso"
> = {
  latitude: LIMITS.latitude,
  longitude: LIMITS.longitude,
  datetime: "iso",
  azimuth: LIMITS.azimuth,
  altitude: LIMITS.altitude,
  fieldOfView: LIMITS.fieldOfView,
};

const DISPLAY_KEYS: (keyof DisplayOptions)[] = [
  "stars",
  "starNames",
  "constellationLines",
  "constellationNames",
  "milkyWay",
  "denseStars",
  "deepSky",
  "nightMode",
];

const LAYER_KEYS: (keyof StarLayerState)[] = [
  "first",
  "second",
  "third",
  "fourth",
  "faint",
];

function decodeObservation(raw: unknown): SkyShareObservation | null {
  if (!isRecord(raw)) return null;
  const out: SkyShareObservation = {};
  for (const [key, rule] of Object.entries(OBSERVATION_RULES)) {
    const value = raw[key];
    if (value === undefined) continue;
    if (rule === "iso") {
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
        return null;
      }
      out.datetime = value;
    } else {
      if (!numberInRange(value, rule.min, rule.max)) return null;
      out[key as Exclude<keyof SkyShareObservation, "datetime">] = value;
    }
  }
  return out;
}

function decodeSimulation(raw: unknown): Partial<SimulationSettings> | null {
  if (!isRecord(raw)) return null;
  const out: Partial<SimulationSettings> = {};
  if (raw.daylightMode !== undefined) {
    if (typeof raw.daylightMode !== "string" || !DAYLIGHT_MODES.includes(raw.daylightMode)) {
      return null;
    }
    out.daylightMode = raw.daylightMode as SimulationSettings["daylightMode"];
  }
  if (raw.lightPollution !== undefined) {
    if (typeof raw.lightPollution !== "string" || !LIGHT_POLLUTIONS.includes(raw.lightPollution)) {
      return null;
    }
    out.lightPollution = raw.lightPollution as SimulationSettings["lightPollution"];
  }
  if (raw.limitingMagnitude !== undefined) {
    if (!numberInRange(raw.limitingMagnitude, LIMITING_MAGNITUDE_RANGE.min, LIMITING_MAGNITUDE_RANGE.max)) {
      return null;
    }
    out.limitingMagnitude = raw.limitingMagnitude;
  }
  if (raw.observerSensitivity !== undefined) {
    if (!numberInRange(raw.observerSensitivity, OBSERVER_SENSITIVITY_RANGE.min, OBSERVER_SENSITIVITY_RANGE.max)) {
      return null;
    }
    out.observerSensitivity = raw.observerSensitivity;
  }
  if (raw.showHiddenStars !== undefined) {
    if (!isBoolean(raw.showHiddenStars)) return null;
    out.showHiddenStars = raw.showHiddenStars;
  }
  return out;
}

function decodeBooleans<K extends string>(
  raw: unknown,
  keys: readonly K[],
): Partial<Record<K, boolean>> | null {
  if (!isRecord(raw)) return null;
  const out: Partial<Record<K, boolean>> = {};
  for (const key of keys) {
    const value = raw[key];
    if (value === undefined) continue;
    if (!isBoolean(value)) return null;
    out[key] = value;
  }
  return out;
}

/**
 * Decode a `#sky=` fragment, a bare base64url token, or a full URL containing
 * the fragment. Returns null for any malformed or out-of-range payload.
 */
export function decodeSkyShare(input: string): SkySharePayload | null {
  if (input.length === 0) return null;
  const hashStart = input.indexOf("#");
  const fragment = hashStart >= 0 ? input.slice(hashStart) : input;
  const token = fragment.startsWith(PREFIX)
    ? fragment.slice(PREFIX.length)
    : fragment.startsWith("#")
      ? null
      : fragment;
  if (token === null || !/^[A-Za-z0-9_-]+$/.test(token)) return null;

  const text = fromBase64Url(token);
  if (text === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || raw.v !== 1) return null;

  const payload: SkySharePayload = { v: 1 };
  if (raw.label !== undefined) {
    if (typeof raw.label !== "string") return null;
    payload.label = raw.label;
  }
  if (raw.skyMode !== undefined) {
    if (typeof raw.skyMode !== "string" || !SKY_MODES.includes(raw.skyMode as SkyMode)) {
      return null;
    }
    payload.skyMode = raw.skyMode as SkyMode;
  }
  if (raw.observation !== undefined) {
    const observation = decodeObservation(raw.observation);
    if (observation === null) return null;
    payload.observation = observation;
  }
  if (raw.simulation !== undefined) {
    const simulation = decodeSimulation(raw.simulation);
    if (simulation === null) return null;
    payload.simulation = simulation;
  }
  if (raw.layers !== undefined) {
    const layers = decodeBooleans(raw.layers, LAYER_KEYS);
    if (layers === null) return null;
    payload.layers = layers;
  }
  if (raw.display !== undefined) {
    const display = decodeBooleans(raw.display, DISPLAY_KEYS);
    if (display === null) return null;
    payload.display = display;
  }
  return payload;
}

/**
 * Decode the share fragment from the current `location.hash`, if present.
 * Safe to call in non-browser contexts — returns null when `location` is
 * unavailable or the hash does not contain a valid payload.
 */
export function readSkyShareFromLocation(): SkySharePayload | null {
  try {
    if (typeof location === "undefined") return null;
    return decodeSkyShare(location.hash);
  } catch {
    return null;
  }
}

/**
 * Convert a decoded payload's observation patch into updateable settings —
 * the only transformation needed is ISO string → Date.
 */
export function sharedObservationPatch(
  observation: SkyShareObservation | undefined,
): {
  latitude?: number;
  longitude?: number;
  datetime?: Date;
  azimuth?: number;
  altitude?: number;
  fieldOfView?: number;
} {
  if (!observation) return {};
  const { datetime, ...rest } = observation;
  return {
    ...rest,
    ...(datetime !== undefined ? { datetime: new Date(datetime) } : {}),
  };
}
