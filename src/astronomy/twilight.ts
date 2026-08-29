export type TwilightStage = "day" | "civil" | "nautical" | "astronomical" | "night";

export const TWILIGHT_LABELS: Record<TwilightStage, { en: string; ja: string }> = {
  day: { en: "Day", ja: "昼" },
  civil: { en: "Civil Twilight", ja: "民用薄暮" },
  nautical: { en: "Nautical Twilight", ja: "航海薄暮" },
  astronomical: { en: "Astronomical Twilight", ja: "天文薄暮" },
  night: { en: "Night", ja: "夜" },
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
