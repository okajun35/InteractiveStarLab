import { Body, Equator, Horizon } from "astronomy-engine";
import type { AstronomyContext } from "./observer";

export interface SunPosition {
  azimuth: number;
  altitude: number;
}

export function sunPosition(context: AstronomyContext): SunPosition {
  const equator = Equator(Body.Sun, context.time, context.observer, true, true);
  const horizontal = Horizon(
    context.time,
    context.observer,
    equator.ra,
    equator.dec,
    "normal",
  );
  return { azimuth: horizontal.azimuth, altitude: horizontal.altitude };
}
