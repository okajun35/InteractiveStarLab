import type { ObservationSettings } from "../types/astronomy";

export interface PlacePreset {
  id: string;
  en: string;
  ja: string;
  latitude: number;
  longitude: number;
  timeZone: string;
}

export const PLACE_PRESETS: PlacePreset[] = [
  { id: "tokyo", en: "Tokyo", ja: "東京", latitude: 35.6812, longitude: 139.7671, timeZone: "Asia/Tokyo" },
  { id: "sapporo", en: "Sapporo", ja: "札幌", latitude: 43.0618, longitude: 141.3545, timeZone: "Asia/Tokyo" },
  { id: "naha", en: "Naha", ja: "那覇", latitude: 26.2124, longitude: 127.6809, timeZone: "Asia/Tokyo" },
  { id: "singapore", en: "Singapore", ja: "シンガポール", latitude: 1.3521, longitude: 103.8198, timeZone: "Asia/Singapore" },
  { id: "sydney", en: "Sydney", ja: "シドニー", latitude: -33.8688, longitude: 151.2093, timeZone: "Australia/Sydney" },
  { id: "london", en: "London", ja: "ロンドン", latitude: 51.5074, longitude: -0.1278, timeZone: "Europe/London" },
  { id: "new-york", en: "New York", ja: "ニューヨーク", latitude: 40.7128, longitude: -74.006, timeZone: "America/New_York" },
  { id: "north-pole", en: "North Pole", ja: "北極", latitude: 90, longitude: 0, timeZone: "UTC" },
  { id: "equator", en: "Equator", ja: "赤道", latitude: 0, longitude: 0, timeZone: "UTC" },
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
