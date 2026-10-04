/**
 * Sky background palette driven by the Sun's geometric altitude:
 * astronomical night, the three twilights, and full day. The renderer anchors
 * the resulting zenith/horizon colours on the projected zenith point so the
 * gradient reads as a dome however the view is turned.
 */

export interface SkyPalette {
  zenith: [number, number, number];
  horizon: [number, number, number];
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function rgba(rgb: [number, number, number], alpha: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

const SKY_STOPS: { alt: number; zenith: string; horizon: string }[] = [
  { alt: -18, zenith: "#05060a", horizon: "#0a0d16" },
  { alt: -12, zenith: "#0b1020", horizon: "#1b2440" },
  { alt: -6, zenith: "#16203c", horizon: "#3a3f5c" },
  { alt: 0, zenith: "#2b4a7a", horizon: "#a8683c" },
  { alt: 6, zenith: "#6e8bb8", horizon: "#a8bcd8" },
];

export function skyPalette(sunAltitudeDeg: number): SkyPalette {
  const alt = Number.isFinite(sunAltitudeDeg) ? sunAltitudeDeg : -90;
  const first = SKY_STOPS[0];
  const last = SKY_STOPS[SKY_STOPS.length - 1];
  if (alt <= first.alt) {
    return { zenith: hexToRgb(first.zenith), horizon: hexToRgb(first.horizon) };
  }
  if (alt >= last.alt) {
    return { zenith: hexToRgb(last.zenith), horizon: hexToRgb(last.horizon) };
  }
  for (let i = 1; i < SKY_STOPS.length; i++) {
    const b = SKY_STOPS[i];
    if (alt <= b.alt) {
      const a = SKY_STOPS[i - 1];
      const t = (alt - a.alt) / (b.alt - a.alt);
      return {
        zenith: mixRgb(hexToRgb(a.zenith), hexToRgb(b.zenith), t),
        horizon: mixRgb(hexToRgb(a.horizon), hexToRgb(b.horizon), t),
      };
    }
  }
  return { zenith: hexToRgb(last.zenith), horizon: hexToRgb(last.horizon) };
}
