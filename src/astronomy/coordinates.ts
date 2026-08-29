import { Horizon } from "astronomy-engine";
import type { HorizontalStar, Star } from "../types/astronomy";
import { createContext, type AstronomyContext } from "./observer";
import { validateSettings } from "./validation";
import type { ObservationSettings } from "../types/astronomy";

export type { HorizontalStar };

/**
 * RA/Dec (sidereal hours / degrees, J2000) → Azimuth/Altitude (degrees)
 * for a given observer and instant. Thin wrapper over astronomy-engine so
 * the astronomy math never lives inside React components.
 */
export function toHorizontal(
  ctx: AstronomyContext,
  star: Star,
): Pick<HorizontalStar, "azimuth" | "altitude"> {
  const result = Horizon(
    ctx.time,
    ctx.observer,
    star.ra,
    star.dec,
    "normal",
  );
  return { azimuth: result.azimuth, altitude: result.altitude };
}

/** Converts a whole catalog into horizontal coordinates. */
export function horizontalStars(
  settings: ObservationSettings,
  stars: Star[],
): HorizontalStar[] {
  validateSettings(settings);
  const ctx = createContext(settings);
  return stars.map((star) => ({
    ...star,
    ...toHorizontal(ctx, star),
  }));
}
