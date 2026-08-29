import type {
  HideReason,
  HorizontalStar,
  SimulationSettings,
  StarStatus,
} from "../types/astronomy";
import { effectiveLimitingMagnitude, layerOf, type MagnitudeLayer } from "./magnitude";
import { twilightCap } from "./twilight";

export interface StarLayerState {
  first: boolean;
  second: boolean;
  third: boolean;
  fourth: boolean;
  faint: boolean;
}

type SunAltitude = number | { altitude: number };

export function evaluateStar(
  star: Pick<HorizontalStar, "magnitude" | "altitude">,
  layers: StarLayerState,
  simulation: Pick<SimulationSettings, "daylightMode" | "limitingMagnitude" | "observerSensitivity"> & {
    lightPollution?: SimulationSettings["lightPollution"];
  },
  sunAltitude: SunAltitude,
): StarStatus {
  const layer: MagnitudeLayer = layerOf(star.magnitude);
  if (!layers[layer]) return { state: "disabled" };
  if (star.altitude < 0) return { state: "hidden", reason: "below-horizon" };

  const sunAlt = typeof sunAltitude === "number" ? sunAltitude : sunAltitude.altitude;
  if (simulation.daylightMode === "real") {
    const cap = twilightCap(sunAlt);
    if (cap !== null && star.magnitude > cap) return { state: "hidden", reason: "daylight" };
  }

  const limit = effectiveLimitingMagnitude(
    simulation.limitingMagnitude,
    simulation.observerSensitivity,
  );
  if (star.magnitude > limit) return { state: "hidden", reason: "light-pollution" };
  return { state: "visible" };
}

export function reasonLabelJa(
  reason: HideReason,
  daylightMode: SimulationSettings["daylightMode"],
): string {
  if (reason === "below-horizon") return "地平線の下";
  if (reason === "daylight") return daylightMode === "removed" ? "空の明るさ" : "昼・薄暮の明るさ";
  return "光害・限界等級";
}
