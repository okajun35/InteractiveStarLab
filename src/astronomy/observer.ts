import { MakeTime, Observer } from "astronomy-engine";
import type { ObservationSettings } from "../types/astronomy";
import { validateSettings } from "./validation";

export interface AstronomyContext {
  time: ReturnType<typeof MakeTime>;
  observer: InstanceType<typeof Observer>;
}

/**
 * Builds the astronomy-engine time/observer pair from UI settings.
 *
 * The UI datetime is a wall-clock instant held by a JS Date (UTC internally —
 * JS Dates are absolute), so no extra timezone conversion is required before
 * handing it to astronomy-engine.
 */
export function createContext(settings: ObservationSettings): AstronomyContext {
  validateSettings(settings);
  return {
    time: MakeTime(settings.datetime),
    observer: new Observer(settings.latitude, settings.longitude, 0),
  };
}
