import type { GuideMapStar } from "./types";

export const GUIDE_SNAPSHOT_WIDTH = 1000;
export const GUIDE_SNAPSHOT_HEIGHT = 1000;
export const GUIDE_HORIZON_RADIUS = 440;
const CENTER = 500;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Projects altitude/azimuth into an all-sky polar chart (north up, east left). */
export function projectGuidePoint(altitude: number, azimuth: number): { x: number; y: number } {
  const normalizedRadius = (90 - clamp(altitude, 0, 90)) / 90;
  const angle = (((azimuth % 360) + 360) % 360) * Math.PI / 180;
  return {
    x: CENTER - GUIDE_HORIZON_RADIUS * normalizedRadius * Math.sin(angle),
    y: CENTER - GUIDE_HORIZON_RADIUS * normalizedRadius * Math.cos(angle),
  };
}

export function guideStarRadius(magnitude: number): number {
  return clamp(4.5 - magnitude, 1.2, 4.5);
}

export function finiteGuidePoint(point: { x: number; y: number }): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function withGuidePoint<T extends Omit<GuideMapStar, "x" | "y">>(star: T): T & Pick<GuideMapStar, "x" | "y"> {
  const point = projectGuidePoint(star.altitude, star.azimuth);
  return { ...star, x: point.x, y: point.y };
}
