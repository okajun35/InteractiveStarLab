import type { HorizontalStar } from "../types/astronomy";
import type { ObservationCandidate } from "../types/observation";

export interface BuildObservationCandidatesInput {
  horizontalStars: Array<Pick<HorizontalStar, "id" | "name" | "nameJa" | "magnitude" | "altitude" | "azimuth">>;
  maxMagnitude: number;
}

/**
 * Returns the geometrically observable candidates for an observation plan.
 *
 * The MVP rule is intentionally small and deterministic: a star must be
 * strictly above the horizon and no fainter than maxMagnitude. Daylight,
 * light pollution, weather, and horizon obstacles belong to later phases.
 */
export function buildObservationCandidates({
  horizontalStars,
  maxMagnitude,
}: BuildObservationCandidatesInput): ObservationCandidate[] {
  if (!Number.isFinite(maxMagnitude)) {
    throw new RangeError("maxMagnitude must be finite");
  }

  return horizontalStars
    .filter((star) => star.altitude > 0 && star.magnitude <= maxMagnitude)
    .map((star) => ({
      starId: star.id,
      name: star.name,
      nameJa: star.nameJa,
      magnitude: star.magnitude,
      altitude: star.altitude,
      azimuth: star.azimuth,
      predictedVisible: true,
    }))
    .sort((a, b) =>
      a.magnitude - b.magnitude ||
      b.altitude - a.altitude ||
      a.name.localeCompare(b.name),
    );
}
