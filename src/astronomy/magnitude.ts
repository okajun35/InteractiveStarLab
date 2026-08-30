import type { LightPollution } from "../types/astronomy";

export type MagnitudeLayer = "first" | "second" | "third" | "fourth" | "faint";

export const MAGNITUDE_LAYERS = [
  { id: "first", name: "First magnitude", min: Number.NEGATIVE_INFINITY, max: 1 },
  { id: "second", name: "Second magnitude", min: 1, max: 2 },
  { id: "third", name: "Third magnitude", min: 2, max: 3 },
  { id: "fourth", name: "Fourth magnitude", min: 3, max: 4 },
  { id: "faint", name: "Fifth magnitude and fainter", min: 4, max: 6.5 },
] as const satisfies ReadonlyArray<{ id: MagnitudeLayer; name: string; min: number; max: number }>;

export const LIGHT_POLLUTION_LABELS: Record<LightPollution, string> = {
  "city-center": "City",
  urban: "Urban",
  suburban: "Suburban",
  "dark-sky": "Dark Sky",
  perfect: "Perfect",
};

const LIGHT_POLLUTION_LIMITS: Record<LightPollution, number> = {
  "city-center": 1.5,
  urban: 2.5,
  suburban: 4,
  "dark-sky": 5.5,
  perfect: 6.5,
};

export const LIMITING_MAGNITUDE_RANGE = { min: 1, max: 6.5, step: 0.1 } as const;
export const OBSERVER_SENSITIVITY_RANGE = { min: -0.5, max: 0.5, step: 0.05 } as const;
export const OBSERVER_SENSITIVITY_LABELS = {
  dull: "Dull",
  typical: "Typical",
  sharp: "Sharp",
} as const;

export function layerOf(magnitude: number): MagnitudeLayer {
  if (magnitude <= 1) return "first";
  if (magnitude <= 2) return "second";
  if (magnitude <= 3) return "third";
  if (magnitude <= 4) return "fourth";
  return "faint";
}

export function lightPollutionLimit(level: LightPollution): number {
  return LIGHT_POLLUTION_LIMITS[level];
}

export function effectiveLimitingMagnitude(
  limitingMagnitude: number,
  observerSensitivity?: number,
): number {
  const sensitivity = Math.min(
    OBSERVER_SENSITIVITY_RANGE.max,
    Math.max(OBSERVER_SENSITIVITY_RANGE.min, observerSensitivity ?? 0),
  );
  return Math.min(LIMITING_MAGNITUDE_RANGE.max, limitingMagnitude + sensitivity);
}
