export type TwilightStage = "day" | "civil" | "nautical" | "astronomical" | "night";

export const TWILIGHT_LABELS: Record<TwilightStage, string> = {
  day: "Day",
  civil: "Civil Twilight",
  nautical: "Nautical Twilight",
  astronomical: "Astronomical Twilight",
  night: "Night",
};

export function twilightStage(sunAltitude: number): TwilightStage {
  if (sunAltitude > 0) return "day";
  if (sunAltitude > -6) return "civil";
  if (sunAltitude > -12) return "nautical";
  if (sunAltitude > -18) return "astronomical";
  return "night";
}

export function twilightCap(sunAltitude: number): number | null {
  switch (twilightStage(sunAltitude)) {
    case "day": return Number.NEGATIVE_INFINITY;
    case "civil": return 2;
    case "nautical": return 4;
    case "astronomical": return 5.5;
    case "night": return null;
  }
}
