/**
 * Pure sky-interaction helpers: pointer dragging, wheel zoom, scene hit
 * testing, and the eased view moves used when an agent points the sky.
 * Kept free of React and the DOM so every behaviour here is verifiable
 * under scripts/verify-sky-interaction.ts.
 */
import { LIMITS, clamp } from "./validation";
import { starRadius } from "./starSize";
import type { SkyScene } from "./visibility";

const DEG = Math.PI / 180;

/** The three camera angles pointer interaction can move. */
export interface ViewAngles {
  azimuthDeg: number;
  altitudeDeg: number;
  fovDeg: number;
}

/** Wheel-delta scale factor: ~1.14x fov change per 100px of scroll. */
export const ZOOM_STEP = 0.0011;

/** Duration of an agent-directed view move in milliseconds. */
export const FLY_MS = 900;

/** Total reticle ripple lifetime after an agent-directed move. */
export const RETICLE_MS = 1500;

function wrapAzimuth(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Grab-and-drag panning: the sky point under the cursor follows the pointer,
 * so the view centre moves opposite the drag. Horizontal angular speed grows
 * towards the zenith, where alt-az coordinates compress azimuth.
 */
export function panViewAngles(
  view: ViewAngles,
  dxPx: number,
  dyPx: number,
  heightPx: number,
): ViewAngles {
  if (
    !Number.isFinite(dxPx) ||
    !Number.isFinite(dyPx) ||
    !Number.isFinite(heightPx) ||
    heightPx <= 0
  ) {
    return view;
  }
  const degPerPx = view.fovDeg / heightPx;
  const cosAlt = Math.max(Math.cos(view.altitudeDeg * DEG), 0.2);
  return {
    azimuthDeg: wrapAzimuth(view.azimuthDeg - (dxPx * degPerPx) / cosAlt),
    altitudeDeg: clamp(
      view.altitudeDeg + dyPx * degPerPx,
      LIMITS.altitude.min,
      LIMITS.altitude.max,
    ),
    fovDeg: view.fovDeg,
  };
}

/** Exponential wheel zoom inside the specification's fov limits (§28). */
export function zoomFov(fovDeg: number, wheelDeltaY: number): number {
  if (!Number.isFinite(fovDeg) || !Number.isFinite(wheelDeltaY)) return fovDeg;
  return clamp(
    fovDeg * Math.exp(wheelDeltaY * ZOOM_STEP),
    LIMITS.fieldOfView.min,
    LIMITS.fieldOfView.max,
  );
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

export type SceneHit =
  | { kind: "star"; id: string; label: string; magnitude: number; x: number; y: number }
  | { kind: "sun"; label: string; x: number; y: number }
  | { kind: "moon"; label: string; illuminationPct: number; x: number; y: number }
  | { kind: "planet"; id: string; label: string; x: number; y: number }
  | { kind: "messier"; id: string; label: string; x: number; y: number };

export interface HitOptions {
  /** Named-star layer toggle — stars are unhittable when off. */
  starsEnabled: boolean;
  /** Simulation toggle — hidden stars are hittable only when drawn. */
  showHiddenStars: boolean;
}

/**
 * Priority order: the Sun wins its glow, then solar-system bodies, then
 * Messier glyphs, then the nearest named star inside its reach. Returning the
 * first match keeps cursor feedback and click selection consistent.
 */
export function hitTestScene(
  scene: SkyScene,
  x: number,
  y: number,
  options: HitOptions,
): SceneHit | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  if (scene.sunX !== null && scene.sunY !== null) {
    if (Math.hypot(scene.sunX - x, scene.sunY - y) <= 26) {
      return { kind: "sun", label: "Sun", x: scene.sunX, y: scene.sunY };
    }
  }

  for (const body of scene.bodies) {
    const reach = body.kind === "moon" ? Math.max(body.r + 8, 16) : Math.max(body.r + 6, 12);
    if (Math.hypot(body.x - x, body.y - y) > reach) continue;
    if (body.kind === "moon") {
      return {
        kind: "moon",
        label: `Moon ${Math.round(body.illuminationPct ?? 0)}%`,
        illuminationPct: body.illuminationPct ?? 0,
        x: body.x,
        y: body.y,
      };
    }
    return { kind: "planet", id: body.id, label: body.name, x: body.x, y: body.y };
  }

  for (const object of scene.messier) {
    const reach = Math.max(object.r + 6, 12);
    if (Math.hypot(object.x - x, object.y - y) <= reach) {
      return { kind: "messier", id: object.id, label: object.id, x: object.x, y: object.y };
    }
  }

  if (options.starsEnabled) {
    let best: SceneHit | null = null;
    let bestDist = Infinity;
    for (const star of scene.stars) {
      if (star.status.state === "disabled") continue;
      if (star.status.state === "hidden" && !options.showHiddenStars) continue;
      const reach = starRadius(star.star.magnitude) + 6;
      const dist = Math.hypot(star.x - x, star.y - y);
      if (dist <= reach && dist < bestDist) {
        best = {
          kind: "star",
          id: star.star.id,
          label: star.star.name,
          magnitude: star.star.magnitude,
          x: star.x,
          y: star.y,
        };
        bestDist = dist;
      }
    }
    return best;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Agent-directed moves
// ---------------------------------------------------------------------------

export function easeInOutCubic(t: number): number {
  const clamped = clamp(t, 0, 1);
  return clamped < 0.5 ? 4 * clamped * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

/** Whether a fly-to move is worth animating at all. */
export function viewMoveNeeded(from: ViewAngles, to: ViewAngles): boolean {
  const azDelta = Math.abs(shortestAzimuthDelta(from.azimuthDeg, to.azimuthDeg));
  return (
    azDelta > 0.05 ||
    Math.abs(from.altitudeDeg - to.altitudeDeg) > 0.05 ||
    Math.abs(from.fovDeg - to.fovDeg) > 0.05
  );
}

function shortestAzimuthDelta(fromDeg: number, toDeg: number): number {
  return ((((toDeg - fromDeg) % 360) + 540) % 360) - 180;
}

/**
 * Eased interpolation between two view angles. Azimuth takes the short way
 * across the 0°/360° seam; altitude and fov clamp into the spec limits.
 */
export function interpolateViewAngles(
  from: ViewAngles,
  to: ViewAngles,
  t: number,
): ViewAngles {
  const e = easeInOutCubic(Number.isFinite(t) ? t : 0);
  const az = wrapAzimuth(from.azimuthDeg + shortestAzimuthDelta(from.azimuthDeg, to.azimuthDeg) * e);
  return {
    azimuthDeg: az,
    altitudeDeg: clamp(
      from.altitudeDeg + (to.altitudeDeg - from.altitudeDeg) * e,
      LIMITS.altitude.min,
      LIMITS.altitude.max,
    ),
    fovDeg: clamp(
      from.fovDeg + (to.fovDeg - from.fovDeg) * e,
      LIMITS.fieldOfView.min,
      LIMITS.fieldOfView.max,
    ),
  };
}

/**
 * Reticle pulse for a finished agent move: 0 hides, rises to 1 over
 * RETICLE_MS. Drawers skip pulses >= 1.
 */
export function reticlePulse(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(1, elapsedMs / RETICLE_MS);
}
