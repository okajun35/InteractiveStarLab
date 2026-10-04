/**
 * Collision-aware label placement shared by every label layer. Whatever is
 * placed first wins, so callers place what matters (selected objects, bodies)
 * before context labels such as constellation names. Labels near the border
 * are nudged back inside the frame before the collision test so a clipped
 * word never renders.
 */

export type LabelPlacer = (text: string, x: number, y: number, force: boolean) => boolean;

export interface LabelPlacerDeps {
  measure: (text: string) => number;
  draw: (text: string, x: number, y: number) => void;
  width: number;
  height: number;
}

export const LABEL_LINE_HEIGHT = 11;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function labelPlacer(deps: LabelPlacerDeps): LabelPlacer {
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  return (text, x, y, force) => {
    const textWidth = deps.measure(text);
    if (textWidth + 6 > deps.width) return false;
    const drawX = clamp(x, 2, Math.max(2, deps.width - textWidth - 2));
    const drawY = clamp(
      y,
      LABEL_LINE_HEIGHT + 1,
      Math.max(LABEL_LINE_HEIGHT + 1, deps.height - 3),
    );
    const box = {
      x0: drawX - 1,
      y0: drawY - LABEL_LINE_HEIGHT,
      x1: drawX + textWidth + 1,
      y1: drawY + 3,
    };
    if (!force) {
      for (const other of placed) {
        const overlaps =
          box.x0 < other.x1 && box.x1 > other.x0 && box.y0 < other.y1 && box.y1 > other.y0;
        if (overlaps) return false;
      }
    }
    placed.push(box);
    deps.draw(text, drawX, drawY);
    return true;
  };
}
