export function starRadius(magnitude: number): number {
  return Math.min(5, Math.max(0.7, 4.5 - magnitude * 0.6));
}
