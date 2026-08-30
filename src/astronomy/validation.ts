import type { ObservationSettings } from "../types/astronomy";

export interface FieldErrors {
  latitude?: string;
  longitude?: string;
  azimuth?: string;
  altitude?: string;
  fieldOfView?: string;
}

/** Ranges required by the specification (section 28). */
export const LIMITS = {
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 },
  azimuth: { min: 0, max: 360 },
  altitude: { min: 0, max: 90 },
  fieldOfView: { min: 20, max: 140 },
} as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Validates observation settings, throwing on out-of-range values.
 * The UI layer catches this and shows field-level errors instead.
 */
export function validateSettings(settings: ObservationSettings): void {
  const errors = fieldErrors(settings);
  if (errors) {
    throw new Error(`Invalid observation settings: ${JSON.stringify(errors)}`);
  }
}

export function fieldErrors(settings: ObservationSettings): FieldErrors | null {
  const errors: FieldErrors = {};
  const check = (
    key: keyof typeof LIMITS,
    value: number,
    label: string,
  ): void => {
    const { min, max } = LIMITS[key];
    if (!Number.isFinite(value)) {
      errors[key] = `${label} must be a number`;
      return;
    }
    if (value < min || value > max) {
      errors[key] = `${label} must be between ${min} and ${max}`;
    }
  };
  check("latitude", settings.latitude, "Latitude");
  check("longitude", settings.longitude, "Longitude");
  check("azimuth", settings.azimuth, "Azimuth");
  check("altitude", settings.altitude, "Altitude");
  check("fieldOfView", settings.fieldOfView, "Field of view");
  return Object.keys(errors).length > 0 ? errors : null;
}
