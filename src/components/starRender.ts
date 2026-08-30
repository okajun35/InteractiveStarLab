import { starRadius } from "./starSize";
import { shouldShowStarName } from "../astronomy/stars";
import type { SceneStar, SkyScene } from "../astronomy/visibility";
import type { StarStatus } from "../types/astronomy";

export interface StarCanvasOptions {
  stars: boolean;
  starNames: boolean;
  constellationLines: boolean;
  constellationNames: boolean;
}

/**
 * Draws a full interactive-sky-lab scene (spec §39 rendering contract):
 *
 *   VISIBLE               → normal star (§10)
 *   HIDDEN_BY_ENVIRONMENT → dim star only when `showHiddenStars` (§11)
 *   LAYER_DISABLED        → not drawn
 *
 * Background follows the sky phase (§42): day / twilight / night, and
 * "removed" daylight mode always renders a dark sky (§13).
 */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: SkyScene,
  options: StarCanvasOptions,
  showHiddenStars: boolean,
  selectedStarId?: string | null,
): void {
  drawBackground(ctx, width, height, scene);

  if (options.constellationLines) {
    // Keep constellation lines as a stable sky reference. Hidden-star
    // simulation affects stars, but does not make the proven line drawing
    // disappear or fade.
    ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const line of scene.lines) {
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
    }
    ctx.stroke();
  }

  if (options.starNames) {
    ctx.textAlign = "center";
    for (const s of scene.stars) {
      if (s.status.state === "hidden") continue;
      if (!shouldShowStarName(s.star)) continue;
      drawStarLabel(ctx, s);
    }
  }

  if (options.constellationNames) {
    ctx.textAlign = "center";
    for (const label of scene.labels) {
      drawConstellationLabel(ctx, label);
    }
  }

  if (options.stars) {
    for (let i = scene.stars.length - 1; i >= 0; i -= 1) {
      drawStar(ctx, scene.stars[i], showHiddenStars);
    }
  }

  if (options.stars && selectedStarId) {
    const hit = scene.stars.find((s) => s.star.id === selectedStarId);
    if (hit && hit.status.state !== "disabled") {
      ctx.strokeStyle = "rgba(250, 204, 21, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hit.x, hit.y, starRadius(hit.star.magnitude) + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: SkyScene,
): void {
  let top: string;
  let bottom: string;
  switch (scene.skyPhase) {
    case "day":
      top = "#7fb2e5";
      bottom = "#bcd6ee";
      break;
    case "twilight":
      top = "#2b3a55";
      bottom = "#5d4a63";
      break;
    case "night":
    default:
      top = "#04070d";
      bottom = "#0b1220";
      break;
  }
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

export function drawStar(
  ctx: CanvasRenderingContext2D,
  star: SceneStar,
  showHiddenStars: boolean,
): void {
  if (star.status.state === "disabled") return;
  const isHidden = star.status.state === "hidden";
  if (isHidden && !showHiddenStars) return;

  const r = starRadius(star.star.magnitude);
  const alpha = isHidden ? 0.18 : 1;
  const glow = Math.max(r * 2.4, 6);
  const grad = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, glow);
  grad.addColorStop(0, `rgba(255, 255, 255, ${0.95 * alpha})`);
  grad.addColorStop(r / glow, `rgba(255, 255, 255, ${0.55 * alpha})`);
  grad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(star.x, star.y, glow, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = isHidden ? `rgba(160, 170, 190, ${alpha})` : "#ffffff";
  ctx.beginPath();
  ctx.arc(star.x, star.y, isHidden ? Math.max(r * 0.7, 0.5) : r, 0, Math.PI * 2);
  ctx.fill();

  if (isHidden) {
    // Dashed ring: "exists but invisible" affordance (spec §11, §40).
    ctx.strokeStyle = `rgba(148, 163, 184, ${0.4 * alpha + 0.2})`;
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(star.x, star.y, r + 2.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawStarLabel(ctx: CanvasRenderingContext2D, star: SceneStar): void {
  const r = starRadius(star.star.magnitude);
  ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
  ctx.font = "12px sans-serif";
  ctx.fillText(star.star.name, star.x, star.y - r - 8);
}

function drawConstellationLabel(
  ctx: CanvasRenderingContext2D,
  label: { name: string; x: number; y: number; factor?: number },
): void {
  // Option B: label alpha follows member visibility (floor 0.2 keeps the
  // name as an educational anchor even when all members are disabled).
  const f = label.factor ?? 1;
  ctx.fillStyle = `rgba(148, 163, 184, ${0.8 * f})`;
  ctx.font = "600 11px sans-serif";
  ctx.fillText(label.name, label.x, label.y);
}

export function drawSun(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 14,
): void {
  const glow = size * 3;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, glow);
  grad.addColorStop(0, "rgba(255, 214, 120, 0.95)");
  grad.addColorStop(0.35, "rgba(255, 190, 90, 0.35)");
  grad.addColorStop(1, "rgba(255, 190, 90, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, glow, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd98a";
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
}

export type { SkyScene, SceneStar, StarStatus };
