const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export function normalizeAzimuth(azimuth: number): number {
  return ((azimuth % 360) + 360) % 360;
}

export function directionFromAzimuth(azimuth: number): string {
  return DIRECTIONS[Math.round(normalizeAzimuth(azimuth) / 45) % DIRECTIONS.length];
}

/** Returns a circular mean unless the targets span more than 120 degrees. */
export function primaryDirection(azimuths: readonly number[]): string {
  if (azimuths.length === 0) return "Multiple directions";
  const normalized = azimuths.map(normalizeAzimuth).sort((a, b) => a - b);
  let largestGap = -1;
  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    const next = normalized[(index + 1) % normalized.length] + (index === normalized.length - 1 ? 360 : 0);
    largestGap = Math.max(largestGap, next - current);
  }
  const span = 360 - largestGap;
  if (span > 120) return "Multiple directions";
  const radians = normalized.map((value) => value * Math.PI / 180);
  const x = radians.reduce((sum, value) => sum + Math.cos(value), 0);
  const y = radians.reduce((sum, value) => sum + Math.sin(value), 0);
  return directionFromAzimuth(Math.atan2(y, x) * 180 / Math.PI);
}

