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
      errors[key] = `${label}は数値を入力してください`;
      return;
    }
    if (value < min || value > max) {
      errors[key] = `${label}は ${min}〜${max} の範囲で入力してください`;
    }
  };
  check("latitude", settings.latitude, "緯度");
  check("longitude", settings.longitude, "経度");
  check("azimuth", settings.azimuth, "方位角");
  check("altitude", settings.altitude, "仰角");
  check("fieldOfView", settings.fieldOfView, "視野角");
  return Object.keys(errors).length > 0 ? errors : null;
}
