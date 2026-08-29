import type { ObservationSettings } from "../types/astronomy";
import type { HorizontalStar } from "./coordinates";
import { isInView } from "./visibility";
import { layerOf, type MagnitudeLayer } from "./magnitude";

export type LayerCounts = Record<MagnitudeLayer, number>;

export function countByLayer(
  stars: HorizontalStar[],
  settings: Pick<ObservationSettings, "azimuth" | "altitude" | "fieldOfView">,
): LayerCounts {
  const counts: LayerCounts = { first: 0, second: 0, third: 0, fourth: 0, faint: 0 };
  for (const star of stars) {
    if (isInView(star, settings)) counts[layerOf(star.magnitude)] += 1;
  }
  return counts;
}
