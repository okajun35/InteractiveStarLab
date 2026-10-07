import { starRadius } from "./starSize";
import { shouldShowStarName } from "../astronomy/stars";
import { labelPlacer, LABEL_LINE_HEIGHT } from "./labelPlacer";
import { rgba, mixRgb } from "../astronomy/skyPalette";
import type { SceneBody, SceneMessier, SceneMilkyWay } from "../astronomy/sceneObjects";
import type { SceneLabel, SceneStar, SkyScene } from "../astronomy/visibility";
import type { StarStatus } from "../types/astronomy";

const TAU = Math.PI * 2;
const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

export interface StarCanvasOptions {
  stars: boolean;
  starNames: boolean;
  constellationLines: boolean;
  constellationNames: boolean;
  milkyWay: boolean;
  denseStars: boolean;
  /** Messier objects, planets and the Moon. */
  deepSky: boolean;
  /** Red-light mode: tints instrument marks, never the sky itself. */
  nightMode: boolean;
}

/**
 * Draws a full interactive-sky-lab scene (spec §39 rendering contract):
 *
 *   VISIBLE               → normal star (§10)
 *   HIDDEN_BY_ENVIRONMENT → dim star only when `showHiddenStars` (§11)
 *   LAYER_DISABLED        → not drawn
 *
 * The background follows the sun-altitude palette anchored on the projected
 * zenith; "removed" daylight mode resolves to the night palette upstream.
 */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: SkyScene,
  options: StarCanvasOptions,
  showHiddenStars: boolean,
  selectedStarId?: string | null,
  reticlePulse = 1,
  /** Resolves a constellation label's display text (e.g. localized name). */
  labelNamer?: (label: SceneLabel) => string,
): void {
  const dome = scene.dome ?? null;
  drawSkyBackground(ctx, width, height, scene);
  drawTwilightGlow(ctx, width, height, scene);

  // In dome mode everything sky-side stays inside the dome circle.
  ctx.save();
  if (dome !== null) {
    ctx.beginPath();
    ctx.arc(dome.cx, dome.cy, dome.radiusPx, 0, TAU);
    ctx.clip();
  }

  if (options.milkyWay) drawMilkyWay(ctx, scene.milkyWay);

  if (options.constellationLines) {
    // Keep constellation lines as a stable sky reference. Hidden-star
    // simulation affects stars, but does not make the proven line drawing
    // disappear or fade. Amber marks the annotation layer, distinct from
    // the blue-white of the sky data itself.
    ctx.strokeStyle = "rgba(255, 180, 84, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const line of scene.lines) {
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
    }
    ctx.stroke();
  }

  if (options.denseStars) drawDenseStars(ctx, scene.denseStars);

  if (options.stars) {
    // In dome mode hundreds of per-star glow gradients would turn the field
    // into white noise — draw flat dots like the dense catalog and keep the
    // halo pass only for the brightest stars.
    for (let i = scene.stars.length - 1; i >= 0; i -= 1) {
      if (dome !== null) {
        drawFlatStar(ctx, scene.stars[i], showHiddenStars);
      } else {
        drawStar(ctx, scene.stars[i], showHiddenStars);
      }
    }
    drawBrightStarHalos(ctx, scene.stars, showHiddenStars);
  }

  if (options.deepSky) {
    const fovDeg = scene.fovDeg;
    const glyphAlpha = fovDeg > 120 ? 0.5 : 0.85;
    for (const object of scene.messier) {
      drawMessierGlyph(ctx, object, glyphAlpha);
    }
    for (const body of scene.bodies) {
      if (body.kind === "planet") drawPlanet(ctx, body);
    }
    for (const body of scene.bodies) {
      if (body.kind === "moon") drawMoon(ctx, body, scene.sunScreen);
    }
  }

  // Labels: one collision set per frame, objects before constellation names.
  const place = labelPlacer({
    measure: (text) => ctx.measureText(text).width,
    draw: (text, x, y) => ctx.fillText(text, x, y),
    width,
    height,
  });

  // At the whole-sky scale star names become noise (the reference renderer
  // suppresses them past ~90°) — only constellation names stay.
  if (options.starNames && scene.fovDeg <= 100) {
    ctx.textAlign = "center";
    for (const s of scene.stars) {
      if (s.status.state === "hidden") continue;
      if (!shouldShowStarName(s.star)) continue;
      drawStarLabel(ctx, s);
    }
  }

  ctx.textAlign = "left";
  if (options.deepSky) {
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = "rgba(255, 180, 84, 0.6)";
    for (const object of scene.messier) {
      if (scene.fovDeg > 100) break;
      place(object.id, object.x + object.r + 4, object.y - object.r - 3, false);
    }
    ctx.fillStyle = "rgba(226, 232, 245, 0.8)";
    for (const body of scene.bodies) {
      if (body.kind !== "planet") continue;
      place(body.name, body.x + body.r + 5, body.y - body.r - 4, true);
    }
    for (const body of scene.bodies) {
      if (body.kind !== "moon") continue;
      const pct = Math.round(body.illuminationPct ?? 0);
      ctx.fillStyle = "rgba(244, 239, 230, 0.85)";
      place(`Moon ${pct}%`, body.x + body.r + 6, body.y - body.r - 4, true);
    }
  }

  if (options.constellationNames) {
    ctx.textAlign = "center";
    ctx.font = `10px ${MONO}`;
    for (const label of scene.labels) {
      const f = label.factor ?? 1;
      ctx.fillStyle = `rgba(255, 180, 84, ${0.35 * f})`;
      const text = labelNamer !== undefined ? labelNamer(label) : label.name.toUpperCase();
      place(text, label.x - ctx.measureText(text).width / 2, label.y, false);
    }
  }

  ctx.restore(); // end dome clip

  if (dome !== null) {
    drawDomeHorizon(ctx, dome, scene);
    drawZenithMarker(ctx, dome);
  } else {
    drawWindowHorizon(ctx, scene);
  }
  drawCardinals(ctx, scene, width, height);
  drawVignette(ctx, width, height);

  if (options.stars && selectedStarId) {
    const hit = scene.stars.find((s) => s.star.id === selectedStarId);
    if (hit && hit.status.state !== "disabled") {
      ctx.strokeStyle = "rgba(250, 204, 21, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hit.x, hit.y, starRadius(hit.star.magnitude) + 4, 0, TAU);
      ctx.stroke();
    }
  }

  drawReticle(ctx, width, height, reticlePulse);
  if (options.nightMode) drawNightModeWash(ctx, width, height, scene);
}

// ---------------------------------------------------------------------------
// Sky background: palette anchored on the projected zenith
// ---------------------------------------------------------------------------

function drawSkyBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: SkyScene,
): void {
  const palette = scene.palette;
  ctx.fillStyle = rgba(palette.horizon, 1);
  ctx.fillRect(0, 0, width, height);

  const limit = Math.hypot(width, height);
  const zenithX = clamp(scene.zenith?.x ?? width / 2, -limit, width + limit);
  const zenithY = clamp(scene.zenith?.y ?? height / 2, -limit, height + limit);
  const radius = Math.max(
    Math.hypot(zenithX, zenithY),
    Math.hypot(width - zenithX, zenithY),
    Math.hypot(zenithX, height - zenithY),
    Math.hypot(width - zenithX, height - zenithY),
  );
  const gradient = ctx.createRadialGradient(zenithX, zenithY, 0, zenithX, zenithY, radius);
  gradient.addColorStop(0, rgba(palette.zenith, 1));
  gradient.addColorStop(0.55, rgba(mixRgb(palette.zenith, palette.horizon, 0.45), 1));
  gradient.addColorStop(1, rgba(palette.horizon, 1));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/** The Sun's glow spilling over the horizon during twilight. */
function drawTwilightGlow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: SkyScene,
): void {
  if (!scene.sunScreen) return;
  const sunAlt = scene.sunAltitudeDeg;
  if (sunAlt <= -18) return;
  const strength = sunAlt >= 0 ? 1 : (18 + sunAlt) / 18;
  const radius = Math.min(width, height) * (0.35 + 0.25 * strength);
  const gradient = ctx.createRadialGradient(
    scene.sunScreen.x,
    scene.sunScreen.y,
    0,
    scene.sunScreen.x,
    scene.sunScreen.y,
    radius,
  );
  gradient.addColorStop(0, `rgba(255, 176, 96, ${0.42 * strength})`);
  gradient.addColorStop(0.45, `rgba(255, 128, 64, ${0.16 * strength})`);
  gradient.addColorStop(1, "rgba(255, 110, 60, 0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Milky Way: five isophote levels feathered into light
// ---------------------------------------------------------------------------

export function drawMilkyWay(ctx: CanvasRenderingContext2D, levels: SceneMilkyWay[]): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineJoin = "round";
  for (const level of levels) {
    const path = new Path2D();
    let drew = false;
    for (const polygon of level.polygons) {
      let started = false;
      for (const point of polygon) {
        if (!point) {
          started = false;
          continue;
        }
        if (!started) {
          path.moveTo(point.x, point.y);
          started = true;
        } else {
          path.lineTo(point.x, point.y);
        }
        drew = true;
      }
      path.closePath();
    }
    if (!drew) continue;
    const alpha = 0.024 * level.level;
    ctx.fillStyle = `rgba(198, 206, 240, ${alpha})`;
    ctx.fill(path);
    ctx.strokeStyle = `rgba(198, 206, 240, ${alpha * 0.45})`;
    ctx.lineWidth = 6;
    ctx.stroke(path);
    ctx.strokeStyle = `rgba(198, 206, 240, ${alpha * 0.22})`;
    ctx.lineWidth = 16;
    ctx.stroke(path);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Stars
// ---------------------------------------------------------------------------

/** Dense field stars batched by colour: one path and one fill per colour. */
export function drawDenseStars(
  ctx: CanvasRenderingContext2D,
  stars: { x: number; y: number; r: number; color: string }[],
): void {
  const batches = new Map<string, Path2D>();
  for (const star of stars) {
    let path = batches.get(star.color);
    if (!path) {
      path = new Path2D();
      batches.set(star.color, path);
    }
    if (star.r < 0.8) {
      const size = star.r * 2;
      path.rect(star.x - star.r, star.y - star.r, size, size);
    } else {
      path.moveTo(star.x + star.r, star.y);
      path.arc(star.x, star.y, star.r, 0, TAU);
    }
  }
  for (const [color, path] of batches) {
    ctx.fillStyle = color;
    ctx.fill(path);
  }
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
  ctx.arc(star.x, star.y, glow, 0, TAU);
  ctx.fill();

  ctx.fillStyle = isHidden ? `rgba(160, 170, 190, ${alpha})` : star.color;
  ctx.beginPath();
  ctx.arc(star.x, star.y, isHidden ? Math.max(r * 0.7, 0.5) : r, 0, TAU);
  ctx.fill();

  if (isHidden) {
    // Dashed ring: "exists but invisible" affordance (spec §11, §40).
    ctx.strokeStyle = `rgba(148, 163, 184, ${0.4 * alpha + 0.2})`;
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(star.x, star.y, r + 2.5, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * Flat star dot for dome mode: same colour, no radial glow. Hidden stars keep
 * the "exists but invisible" affordance, just dimmer.
 */
function drawFlatStar(
  ctx: CanvasRenderingContext2D,
  star: SceneStar,
  showHiddenStars: boolean,
): void {
  if (star.status.state === "disabled") return;
  const isHidden = star.status.state === "hidden";
  if (isHidden && !showHiddenStars) return;
  const r = starRadius(star.star.magnitude);
  if (isHidden) {
    ctx.fillStyle = "rgba(160, 170, 190, 0.28)";
    ctx.beginPath();
    ctx.arc(star.x, star.y, Math.max(r * 0.7, 0.5), 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(star.x, star.y, r + 2.5, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  ctx.fillStyle = star.color;
  ctx.beginPath();
  ctx.arc(star.x, star.y, Math.max(r * 0.7, 0.6), 0, TAU);
  ctx.fill();
}

/** A soft halo on the brightest named stars: what makes a canvas read as sky. */
function drawBrightStarHalos(
  ctx: CanvasRenderingContext2D,
  stars: SceneStar[],
  showHiddenStars: boolean,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const star of stars) {
    if (star.star.magnitude > 1.5) continue;
    if (star.status.state === "disabled") continue;
    if (star.status.state === "hidden" && !showHiddenStars) continue;
    const r = starRadius(star.star.magnitude);
    const radius = r * 3.2;
    const glow = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, radius);
    const alpha = star.status.state === "hidden" ? 0.1 : 0.28;
    glow.addColorStop(0, withAlpha(star.color, alpha));
    glow.addColorStop(0.4, withAlpha(star.color, alpha * 0.36));
    glow.addColorStop(1, withAlpha(star.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(star.x, star.y, radius, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Deep-sky objects and solar-system bodies
// ---------------------------------------------------------------------------

/** One glyph per Messier class, the way a paper atlas does it. */
export function drawMessierGlyph(
  ctx: CanvasRenderingContext2D,
  object: SceneMessier,
  alpha: number,
): void {
  const { x, y, r } = object;
  ctx.strokeStyle = `rgba(255, 180, 84, ${alpha})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  switch (object.type) {
    case "galaxy":
      ctx.ellipse(x, y, r, r * 0.52, -0.5, 0, TAU);
      ctx.stroke();
      break;
    case "open_cluster":
      ctx.setLineDash([2, 3]);
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case "globular_cluster":
      ctx.arc(x, y, r, 0, TAU);
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.stroke();
      break;
    case "planetary_nebula":
      ctx.arc(x, y, r * 0.7, 0, TAU);
      ctx.moveTo(x - r - 2, y);
      ctx.lineTo(x - r * 0.7, y);
      ctx.moveTo(x + r * 0.7, y);
      ctx.lineTo(x + r + 2, y);
      ctx.moveTo(x, y - r - 2);
      ctx.lineTo(x, y - r * 0.7);
      ctx.moveTo(x, y + r * 0.7);
      ctx.lineTo(x, y + r + 2);
      ctx.stroke();
      break;
    case "diffuse_nebula":
      ctx.rect(x - r, y - r, r * 2, r * 2);
      ctx.stroke();
      break;
    case "supernova_remnant":
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.stroke();
      break;
    default:
      ctx.arc(x, y, r * 0.6, 0, TAU);
      ctx.stroke();
  }
}

const PLANET_COLORS: Record<string, string> = {
  mercury: "#c9c2b8",
  venus: "#fff1c9",
  mars: "#ff8f66",
  jupiter: "#f3d3a5",
  saturn: "#f0e0b5",
  uranus: "#a9e5e8",
  neptune: "#7fa4ff",
};

export function drawPlanet(ctx: CanvasRenderingContext2D, body: SceneBody): void {
  const color = PLANET_COLORS[body.id] ?? "#e6e9f0";
  const rgb = Number.parseInt(color.slice(1), 16);
  const glow = ctx.createRadialGradient(body.x, body.y, 0, body.x, body.y, body.r * 3.4);
  glow.addColorStop(0, `rgba(${(rgb >> 16) & 255}, ${(rgb >> 8) & 255}, ${rgb & 255}, 0.3)`);
  glow.addColorStop(1, `rgba(${(rgb >> 16) & 255}, ${(rgb >> 8) & 255}, ${rgb & 255}, 0)`);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(body.x, body.y, body.r * 3.4, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(body.x, body.y, body.r, 0, TAU);
  ctx.fill();

  if (body.id === "venus" || body.id === "jupiter") {
    const spike = body.r * 3.6;
    ctx.strokeStyle = `rgba(${(rgb >> 16) & 255}, ${(rgb >> 8) & 255}, ${rgb & 255}, 0.55)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(body.x - spike, body.y);
    ctx.lineTo(body.x + spike, body.y);
    ctx.moveTo(body.x, body.y - spike);
    ctx.lineTo(body.x, body.y + spike);
    ctx.stroke();
  }
}

/**
 * The Moon as the shape it actually is tonight: a dark-limb disc, the lit
 * fraction bounded by a terminator ellipse, and a halo that grows with the
 * illumination because a gibbous Moon is what ruins a night of observing.
 */
export function drawMoon(
  ctx: CanvasRenderingContext2D,
  body: SceneBody,
  sunScreen: { x: number; y: number } | null,
): void {
  const r = body.r;
  const illumination = Math.min(1, Math.max(0, (body.illuminationPct ?? 50) / 100));

  const haloRadius = r * (2 + 4 * illumination);
  const halo = ctx.createRadialGradient(body.x, body.y, r * 0.6, body.x, body.y, haloRadius);
  halo.addColorStop(0, `rgba(244, 239, 230, ${0.25 * illumination})`);
  halo.addColorStop(0.5, `rgba(230, 232, 240, ${0.08 * illumination})`);
  halo.addColorStop(1, "rgba(230, 232, 240, 0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(body.x, body.y, haloRadius, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Earthshine: the unlit limb is never truly black.
  ctx.fillStyle = "rgba(74, 78, 92, 0.55)";
  ctx.beginPath();
  ctx.arc(body.x, body.y, r, 0, TAU);
  ctx.fill();

  const toSun = sunScreen
    ? Math.atan2(sunScreen.y - body.y, sunScreen.x - body.x)
    : -Math.PI / 4;
  ctx.save();
  ctx.translate(body.x, body.y);
  ctx.rotate(toSun);
  ctx.fillStyle = "#f4efe6";
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  const terminator = r * (1 - 2 * illumination);
  ctx.ellipse(0, 0, Math.abs(terminator), r, 0, Math.PI / 2, -Math.PI / 2, terminator >= 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgba(244, 239, 230, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(body.x, body.y, r, 0, TAU);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Horizon, cardinals, vignette, reticle, night mode
// ---------------------------------------------------------------------------

/**
 * The ground below the horizon line: the horizon polyline closed along the
 * bottom of the canvas. Points above the horizon are never reached because
 * the projector only returns horizon points that actually landed.
 */
function drawWindowHorizon(ctx: CanvasRenderingContext2D, scene: SkyScene): void {
  if (scene.horizon.length < 2) return;
  const ground = new Path2D();
  ground.moveTo(scene.horizon[0].x, scene.horizon[0].y);
  for (const point of scene.horizon) ground.lineTo(point.x, point.y);
  const last = scene.horizon[scene.horizon.length - 1];
  const first = scene.horizon[0];
  ground.lineTo(last.x, 20000);
  ground.lineTo(first.x, 20000);
  ground.closePath();
  ctx.fillStyle = "rgba(5, 6, 10, 0.78)";
  ctx.fill(ground);

  ctx.strokeStyle = "#2a3140";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const point of scene.horizon) ctx.lineTo(point.x, point.y);
  ctx.stroke();
}

/**
 * Dome ground: everything outside the dome circle is the earth you stand on.
 * Even-odd fill leaves the sky untouched; a rim stroke marks the horizon.
 */
function drawDomeHorizon(
  ctx: CanvasRenderingContext2D,
  dome: { cx: number; cy: number; radiusPx: number },
  scene: SkyScene,
): void {
  ctx.save();
  const ground = new Path2D();
  ground.rect(-100, -100, dome.cx * 2 + 200, dome.cy * 2 + 200);
  ground.arc(dome.cx, dome.cy, dome.radiusPx, 0, TAU);
  ctx.fillStyle = "rgba(5, 6, 10, 0.78)";
  ctx.fill(ground, "evenodd");
  ctx.strokeStyle = "#2a3140";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(dome.cx, dome.cy, dome.radiusPx, 0, TAU);
  ctx.stroke();
  ctx.restore();

  // Below-horizon sky is never drawn, but the horizon polyline (the rim
  // points projected by the scene) can still be stroked for crispness.
  if (scene.horizon.length >= 2) {
    ctx.strokeStyle = "rgba(90, 100, 125, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(scene.horizon[0].x, scene.horizon[0].y);
    for (const point of scene.horizon) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    ctx.stroke();
  }
}

/** The small cross at the zenith — the point the whole dome is wrapped around. */
function drawZenithMarker(
  ctx: CanvasRenderingContext2D,
  dome: { cx: number; cy: number },
): void {
  ctx.save();
  ctx.strokeStyle = "rgba(226, 232, 240, 0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dome.cx - 5, dome.cy);
  ctx.lineTo(dome.cx + 5, dome.cy);
  ctx.moveTo(dome.cx, dome.cy - 5);
  ctx.lineTo(dome.cx, dome.cy + 5);
  ctx.stroke();
  ctx.font = `8px ${MONO}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(138, 147, 166, 0.7)";
  ctx.fillText("Z", dome.cx + 7, dome.cy - 4);
  ctx.restore();
}

export function drawCardinals(
  ctx: CanvasRenderingContext2D,
  scene: Pick<SkyScene, "cardinals">,
  width: number,
  height: number,
): void {
  const cx = width / 2;
  const cy = height / 2;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const cardinal of scene.cardinals) {
    if (!cardinal.visible) continue;
    const main = cardinal.label.length === 1;
    const dx = cardinal.x - cx;
    const dy = cardinal.y - cy;
    const distance = Math.hypot(dx, dy) || 1;
    const x = clamp(cardinal.x + (dx / distance) * 13, 10, width - 10);
    const y = clamp(cardinal.y + (dy / distance) * 13, 10, height - 10);
    ctx.font = `${main ? 11 : 9}px ${MONO}`;
    ctx.fillStyle = main ? "rgba(138, 147, 166, 0.95)" : "rgba(138, 147, 166, 0.5)";
    ctx.fillText(cardinal.label, x, y);
  }
  ctx.restore();
}

export function drawVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.hypot(width, height) / 2;
  const gradient = ctx.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.38)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/** The ripple that says "the agent moved the view". */
export function drawReticle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pulse: number,
): void {
  if (!(pulse >= 0) || pulse >= 1) return;
  const cx = width / 2;
  const cy = height / 2;
  ctx.save();
  ctx.strokeStyle = "#ff5c4d";
  ctx.lineWidth = 1.5;
  for (const offset of [0, 0.25]) {
    const t = pulse - offset;
    if (t < 0 || t >= 1) continue;
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, 20 + 60 * t, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalAlpha = Math.max(0, 1 - pulse) * 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - 14, cy);
  ctx.lineTo(cx - 5, cy);
  ctx.lineTo(cx + 5, cy);
  ctx.lineTo(cx + 14, cy);
  ctx.moveTo(cx, cy - 14);
  ctx.lineTo(cx, cy - 5);
  ctx.moveTo(cx, cy + 5);
  ctx.lineTo(cx, cy + 14);
  ctx.stroke();
  ctx.restore();
}

/** Red light over the instrument: a multiply pass that never changes the data. */
function drawNightModeWash(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: SkyScene,
): void {
  ctx.save();
  if (scene.dome) {
    const ground = new Path2D();
    ground.rect(-100, -100, scene.dome.cx * 2 + 200, scene.dome.cy * 2 + 200);
    ground.arc(scene.dome.cx, scene.dome.cy, scene.dome.radiusPx, 0, TAU);
    ctx.fillStyle = "rgba(150, 40, 20, 0.16)";
    ctx.fill(ground, "evenodd");
  } else if (scene.horizon.length >= 2) {
    const ground = new Path2D();
    ground.moveTo(scene.horizon[0].x, scene.horizon[0].y);
    for (const point of scene.horizon) ground.lineTo(point.x, point.y);
    ground.lineTo(scene.horizon[scene.horizon.length - 1].x, 20000);
    ground.lineTo(scene.horizon[0].x, 20000);
    ground.closePath();
    ctx.fillStyle = "rgba(150, 40, 20, 0.16)";
    ctx.fill(ground);
  }
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgba(255, 214, 190, 0.14)";
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Labels and the Sun glyph kept from the proven renderer
// ---------------------------------------------------------------------------

function drawStarLabel(ctx: CanvasRenderingContext2D, star: SceneStar): void {
  const r = starRadius(star.star.magnitude);
  ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
  ctx.font = "12px sans-serif";
  ctx.fillText(star.star.name, star.x, star.y - r - 8);
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
  ctx.arc(x, y, glow, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#ffd98a";
  ctx.beginPath();
  ctx.arc(x, y, size, 0, TAU);
  ctx.fill();
}

export { LABEL_LINE_HEIGHT };
export type { SkyScene, SceneStar, StarStatus };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
