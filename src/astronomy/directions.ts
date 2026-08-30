import type { ObservationSettings } from "../types/astronomy";

export interface PlacePreset {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  timeZone: string;
}

export const PLACE_PRESETS: PlacePreset[] = [
  { id: "tokyo", name: "Tokyo", latitude: 35.6812, longitude: 139.7671, timeZone: "Asia/Tokyo" },
  { id: "sapporo", name: "Sapporo", latitude: 43.0618, longitude: 141.3545, timeZone: "Asia/Tokyo" },
  { id: "naha", name: "Naha", latitude: 26.2124, longitude: 127.6809, timeZone: "Asia/Tokyo" },
  { id: "singapore", name: "Singapore", latitude: 1.3521, longitude: 103.8198, timeZone: "Asia/Singapore" },
  { id: "sydney", name: "Sydney", latitude: -33.8688, longitude: 151.2093, timeZone: "Australia/Sydney" },
  { id: "london", name: "London", latitude: 51.5074, longitude: -0.1278, timeZone: "Europe/London" },
  { id: "new-york", name: "New York", latitude: 40.7128, longitude: -74.006, timeZone: "America/New_York" },
  { id: "north-pole", name: "North Pole", latitude: 90, longitude: 0, timeZone: "UTC" },
  { id: "equator", name: "Equator", latitude: 0, longitude: 0, timeZone: "UTC" },
];

export function applyPlace(
  place: Pick<PlacePreset, "latitude" | "longitude">,
): Pick<ObservationSettings, "latitude" | "longitude"> {
  return { latitude: place.latitude, longitude: place.longitude };
}

/** At either pole, azimuth is undefined; keep the requested direction stable. */
export function stableAzimuth(
  settings: Pick<ObservationSettings, "latitude" | "azimuth">,
  fallbackAzimuth: number,
): number {
  if (Math.abs(Math.abs(settings.latitude) - 90) < 1e-9) return fallbackAzimuth;
  return settings.azimuth;
}
