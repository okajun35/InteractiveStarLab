/**
 * Shared scene objects: solar-system bodies, Messier objects, Milky Way
 * isophotes, the dense star field, the horizon and the cardinal points,
 * projected through an abstract projector. Both the window (gnomonic) view
 * and the dome (stereographic) view build their scenes through this module
 * so the two never disagree about geometry.
 */
import { Rotation_EQJ_HOR } from "astronomy-engine";
import type { RotationMatrix } from "astronomy-engine";
import type { ObservationSettings } from "../types/astronomy";
import type { Vec3 } from "./projection";
import { cameraFrame, directionVector, project } from "./projection";
import { createContext } from "./observer";
import { moonPosition, planetPositions } from "./bodies";
import { DENSE_STARS, MESSIER_OBJECTS, MILKY_WAY_LEVELS } from "./denseCatalog";
import { quantizedStarColor } from "./starColor";
import { effectiveLimitingMagnitude } from "./magnitude";
import { twilightCap } from "./twilight";
import type { SimulationSettings } from "../types/astronomy";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// ---------------------------------------------------------------------------
// Projector abstraction
// ---------------------------------------------------------------------------

export interface SceneProjector {
  /** Vertical field of view the projector was built for, in degrees. */
  fovDeg: number;
  /** Project a horizontal-frame unit direction (East, Up, North) to pixels. */
  project(dir: Vec3): { x: number; y: number } | null;
}

/** Gnomonic projector matching the existing directional window view. */
export function windowProjector(
  settings: ObservationSettings,
  width: number,
  height: number,
): SceneProjector {
  const frame = cameraFrame(settings.azimuth, settings.altitude);
  return {
    fovDeg: settings.fieldOfView,
    project(dir) {
      const point = project(frame, dir, settings.fieldOfView, width, height);
      if (point.depth <= 0) return null;
      return { x: point.x, y: point.y };
    },
  };
}

// ---------------------------------------------------------------------------
// EQJ -> horizontal rotation (one matrix per instant, reused for all catalogs)
// ---------------------------------------------------------------------------

let lastMatrix: { key: string; rot: Float64Array } | null = null;

/**
 * J2000 equatorial unit vector to horizontal unit vector in the app's
 * (East, Up, North) convention. astronomy-engine's HOR frame is
 * (North, West, Up), hence the reordered flat matrix below.
 */
function horizonMatrix(ctx: ReturnType<typeof createContext>): Float64Array {
  const key = `${ctx.time.date.getTime()}|${ctx.observer.latitude}|${ctx.observer.longitude}`;
  if (lastMatrix && lastMatrix.key === key) return lastMatrix.rot;
  const rot: RotationMatrix = Rotation_EQJ_HOR(ctx.time, ctx.observer);
  const m = rot.rot;
  const flat = new Float64Array([
    -m[0][1], -m[1][1], -m[2][1], // East = -West
    m[0][2], m[1][2], m[2][2], // Up = Zenith
    m[0][0], m[1][0], m[2][0], // North
  ]);
  lastMatrix = { key, rot: flat };
  return flat;
}

/** J2000 (raHours, decDeg) to a horizontal unit direction (East, Up, North). */
function catalogDirection(rot: Float64Array, raHours: number, decDeg: number, out: Vec3): Vec3 {
  const ra = raHours * 15 * DEG;
  const dec = decDeg * DEG;
  const cosDec = Math.cos(dec);
  const ex = cosDec * Math.cos(ra);
  const ey = cosDec * Math.sin(ra);
  const ez = Math.sin(dec);
  out[0] = rot[0] * ex + rot[1] * ey + rot[2] * ez;
  out[1] = rot[3] * ex + rot[4] * ey + rot[5] * ez;
  out[2] = rot[6] * ex + rot[7] * ey + rot[8] * ez;
  return out;
}

/** Altitude of a horizontal unit direction, in degrees. */
export function altitudeOf(dir: Vec3): number {
  return Math.asin(Math.min(1, Math.max(-1, dir[1]))) * RAD;
}

// ---------------------------------------------------------------------------
// Scene object types
// ---------------------------------------------------------------------------

export interface SceneBody {
  kind: "moon" | "planet";
  id: string;
  name: string;
  x: number;
  y: number;
  r: number;
  altitudeDeg: number;
  azimuthDeg: number;
  magnitude: number | null;
  illuminationPct?: number;
}

export interface SceneMessier {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  r: number;
  magnitude: number | null;
  altitudeDeg: number;
}

export interface SceneMilkyWay {
  level: number;
  polygons: ({ x: number; y: number } | null)[][];
}

export interface SceneDenseStar {
  x: number;
  y: number;
  r: number;
  color: string;
  magnitude: number;
}

export interface SceneCardinal {
  label: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
  x: number;
  y: number;
  visible: boolean;
}

const CARDINALS: { label: SceneCardinal["label"]; azDeg: number }[] = [
  { label: "N", azDeg: 0 },
  { label: "NE", azDeg: 45 },
  { label: "E", azDeg: 90 },
  { label: "SE", azDeg: 135 },
  { label: "S", azDeg: 180 },
  { label: "SW", azDeg: 225 },
  { label: "W", azDeg: 270 },
  { label: "NW", azDeg: 315 },
];

const BODY_MIN_ALT_DEG = -5;
const DENSE_MIN_ALT_DEG = -2;
const CANVAS_MARGIN = 60;

function inBounds(x: number, y: number, width: number, height: number, margin: number): boolean {
  return x >= -margin && x <= width + margin && y >= -margin && y <= height + margin;
}

export interface SharedSceneObjects {
  sunAltitudeDeg: number;
  bodies: SceneBody[];
  messier: SceneMessier[];
  milkyWay: SceneMilkyWay[];
  denseStars: SceneDenseStar[];
  /** Projected horizon points in azimuth order; only points that projected. */
  horizon: { x: number; y: number }[];
  cardinals: SceneCardinal[];
  /** Where the zenith lands on screen, for the dome-style sky gradient. */
  zenith: { x: number; y: number } | null;
  /** Projected Sun direction, for the twilight glow and Moon terminator. */
  sunScreen: { x: number; y: number } | null;
}

/** How much glyphs grow as the view narrows; capped so narrow fields stay usable. */
export function glyphZoom(fovDeg: number): number {
  return Math.min(3, Math.max(1, Math.sqrt(120 / Math.max(4, fovDeg))));
}

function messierRadius(sizeArcmin: number | null, zoom: number): number {
  return Math.min(9, Math.max(3, 3 + (sizeArcmin ?? 0) / 40)) * zoom;
}

function planetRadius(mag: number | null, zoom: number): number {
  const base = Math.min(6, Math.max(3.5, 5.2 - 0.55 * (mag ?? 3)));
  return base * Math.min(2, Math.max(1, zoom));
}

function lunarRadius(zoom: number): number {
  return Math.max(9 * zoom, 6);
}

/**
 * Projects every shared layer for one instant, one site and one projector.
 * `settings.datetime`/`latitude`/`longitude` drive the astronomy; the
 * projector decides where each direction lands on screen.
 */
export function buildSharedSceneObjects(
  settings: ObservationSettings,
  simulation: SimulationSettings,
  projector: SceneProjector,
  width: number,
  height: number,
  sun: { azimuth: number; altitude: number },
): SharedSceneObjects {
  const ctx = createContext(settings);
  const rot = horizonMatrix(ctx);
  const zoom = glyphZoom(projector.fovDeg);
  const tmp: Vec3 = [0, 0, 0];

  // --- horizon ring and cardinal points -----------------------------------
  const horizon: { x: number; y: number }[] = [];
  const horizonDir: Vec3 = [0, 0, 0];
  for (let az = 0; az < 360; az++) {
    const v = directionVector(az, 0);
    horizonDir[0] = v[0];
    horizonDir[1] = v[1];
    horizonDir[2] = v[2];
    const point = projector.project(horizonDir);
    if (point && inBounds(point.x, point.y, width, height, CANVAS_MARGIN * 4)) {
      horizon.push(point);
    }
  }

  const cardinals: SceneCardinal[] = CARDINALS.map(({ label, azDeg }) => {
    const point = projector.project(directionVector(azDeg, 0));
    return {
      label,
      x: point?.x ?? 0,
      y: point?.y ?? 0,
      visible: point !== null && inBounds(point.x, point.y, width, height, 0),
    };
  });

  const zenith = projector.project([0, 1, 0]);
  const sunScreen = projector.project(directionVector(sun.azimuth, sun.altitude));

  // --- solar-system bodies ---------------------------------------------------
  const bodies: SceneBody[] = [];
  const moon = moonPosition(ctx);
  if (moon.altitude > BODY_MIN_ALT_DEG) {
    const point = projector.project(directionVector(moon.azimuth, moon.altitude));
    if (point && inBounds(point.x, point.y, width, height, CANVAS_MARGIN)) {
      bodies.push({
        kind: "moon",
        id: "moon",
        name: "Moon",
        x: point.x,
        y: point.y,
        r: lunarRadius(zoom),
        altitudeDeg: moon.altitude,
        azimuthDeg: moon.azimuth,
        magnitude: moon.magnitude,
        illuminationPct: moon.illuminationPct,
      });
    }
  }
  for (const planet of planetPositions(ctx)) {
    if (planet.altitude <= BODY_MIN_ALT_DEG) continue;
    const point = projector.project(directionVector(planet.azimuth, planet.altitude));
    if (!point || !inBounds(point.x, point.y, width, height, CANVAS_MARGIN)) continue;
    bodies.push({
      kind: "planet",
      id: planet.id,
      name: planet.name,
      x: point.x,
      y: point.y,
      r: planetRadius(planet.magnitude, zoom),
      altitudeDeg: planet.altitude,
      azimuthDeg: planet.azimuth,
      magnitude: planet.magnitude,
    });
  }

  // --- deep-sky objects -------------------------------------------------------
  const messier: SceneMessier[] = [];
  for (const object of MESSIER_OBJECTS) {
    catalogDirection(rot, object.ra, object.dec, tmp);
    if (tmp[1] < 0) continue;
    const point = projector.project(tmp);
    if (!point || !inBounds(point.x, point.y, width, height, CANVAS_MARGIN)) continue;
    messier.push({
      id: object.id,
      name: object.name,
      type: object.type,
      x: point.x,
      y: point.y,
      r: messierRadius(object.sizeArcmin, zoom),
      magnitude: object.magnitude,
      altitudeDeg: altitudeOf(tmp),
    });
  }

  // --- Milky Way --------------------------------------------------------------
  const milkyWay: SceneMilkyWay[] = MILKY_WAY_LEVELS.map((level) => ({
    level: level.level,
    polygons: level.polygons.map((ring) => {
      const points: ({ x: number; y: number } | null)[] = [];
      for (const [ra, dec] of ring) {
        catalogDirection(rot, ra, dec, tmp);
        if (tmp[1] < -0.05) {
          points.push(null);
          continue;
        }
        const point = projector.project(tmp);
        points.push(point ? { x: point.x, y: point.y } : null);
      }
      return points;
    }),
  }));

  // --- dense star field --------------------------------------------------------
  const denseStars: SceneDenseStar[] = [];
  const cap = simulation.daylightMode === "real" ? twilightCap(sun.altitude) : null;
  const limit = effectiveLimitingMagnitude(
    simulation.limitingMagnitude,
    simulation.observerSensitivity,
  );
  const minZ = Math.sin(DENSE_MIN_ALT_DEG * DEG);
  // Same scaling as the reference renderer: stars stay full-sized at the
  // whole-sky scale and grow as the field narrows (sqrt(180/fov), capped).
  const radiusFactor = Math.min(2.5, Math.max(1, Math.sqrt(180 / Math.min(180, Math.max(20, projector.fovDeg)))));
  for (const star of DENSE_STARS) {
    if (star.magnitude > limit) break; // catalog is brightest-first
    if (cap !== null && star.magnitude > cap) break;
    catalogDirection(rot, star.ra, star.dec, tmp);
    if (tmp[1] < minZ) continue;
    const point = projector.project(tmp);
    if (!point || !inBounds(point.x, point.y, width, height, 20)) continue;
    denseStars.push({
      x: point.x,
      y: point.y,
      r: Math.min(5, Math.max(0.35, (3.4 - 0.6 * star.magnitude) * radiusFactor)),
      color: quantizedStarColor(star.bv),
      magnitude: star.magnitude,
    });
  }

  return {
    sunAltitudeDeg: sun.altitude,
    bodies,
    messier,
    milkyWay,
    denseStars,
    horizon,
    cardinals,
    zenith,
    sunScreen,
  };
}
