/**
 * On-screen radius of a named star in CSS pixels, purely a function of
 * magnitude so hit-testing and rendering always agree on star sizes.
 */
export function starRadius(magnitude: number): number {
  return Math.min(5, Math.max(0.7, 4.5 - magnitude * 0.6));
}
