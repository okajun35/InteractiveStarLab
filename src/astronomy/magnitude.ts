import type { LightPollution } from "../types/astronomy";

export type MagnitudeLayer = "first" | "second" | "third" | "fourth" | "faint";

export const MAGNITUDE_LAYERS = [
  { id: "first", name: "1等星", min: Number.NEGATIVE_INFINITY, max: 1 },
  { id: "second", name: "2等星", min: 1, max: 2 },
  { id: "third", name: "3等星", min: 2, max: 3 },
  { id: "fourth", name: "4等星", min: 3, max: 4 },
  { id: "faint", name: "5等星以上", min: 4, max: 6.5 },
] as const satisfies ReadonlyArray<{ id: MagnitudeLayer; name: string; min: number; max: number }>;

export const LAYER_LABEL_JA: Record<MagnitudeLayer, string> = {
  first: "1等星",
  second: "2等星",
  third: "3等星",
  fourth: "4等星",
  faint: "5等星以上",
};

export const LIGHT_POLLUTION_LABELS: Record<LightPollution, { en: string; ja: string }> = {
  "city-center": { en: "City", ja: "市中心" },
  urban: { en: "Urban", ja: "市街地" },
  suburban: { en: "Suburban", ja: "郊外" },
  "dark-sky": { en: "Dark Sky", ja: "星空観測地" },
  perfect: { en: "Perfect", ja: "完全な暗夜" },
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
  dull: { en: "Dull", ja: "低い" },
  typical: { en: "Typical", ja: "標準" },
  sharp: { en: "Sharp", ja: "高い" },
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
