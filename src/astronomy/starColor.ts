/** Star colour from the B-V colour index, used by the dense catalog layer. */

export const DEFAULT_STAR_COLOR = "#f5f3ff";

const BV_STOPS: { bv: number; rgb: [number, number, number] }[] = [
  { bv: -0.4, rgb: [0x9d, 0xb4, 0xff] },
  { bv: 0, rgb: [0xca, 0xd8, 0xff] },
  { bv: 0.3, rgb: [0xf5, 0xf3, 0xff] },
  { bv: 0.6, rgb: [0xff, 0xf4, 0xe8] },
  { bv: 1, rgb: [0xff, 0xd9, 0xa8] },
  { bv: 1.5, rgb: [0xff, 0xbf, 0x78] },
  { bv: 2, rgb: [0xff, 0x9e, 0x5e] },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rgbToHex(rgb: [number, number, number]): string {
  const part = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

/** Maps a B-V index to a display colour, interpolated between fixed stops. */
export function bvToColor(bv: number): string {
  if (!Number.isFinite(bv)) return DEFAULT_STAR_COLOR;
  if (bv <= BV_STOPS[0].bv) return rgbToHex(BV_STOPS[0].rgb);
  const last = BV_STOPS[BV_STOPS.length - 1];
  if (bv >= last.bv) return rgbToHex(last.rgb);
  for (let i = 1; i < BV_STOPS.length; i++) {
    const b = BV_STOPS[i];
    if (bv <= b.bv) {
      const a = BV_STOPS[i - 1];
      const t = (bv - a.bv) / (b.bv - a.bv);
      return rgbToHex([
        a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t,
        a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t,
        a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t,
      ]);
    }
  }
  return rgbToHex(last.rgb);
}

/**
 * B-V is quantised in steps of 0.1 so the renderer can batch thousands of
 * stars into a couple of dozen fills; neighbouring stops are indistinguishable.
 */
const BV_STEP = 0.1;
const colorCache = new Map<number, string>();

export function quantizedStarColor(bv: number): string {
  const key = Math.round(clamp(Number.isFinite(bv) ? bv : 0.65, -0.4, 2) / BV_STEP);
  let color = colorCache.get(key);
  if (color === undefined) {
    color = bvToColor(key * BV_STEP);
    colorCache.set(key, color);
  }
  return color;
}
