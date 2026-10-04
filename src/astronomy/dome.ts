/**
 * Full-sky dome mode: a stereographic projection centred on the zenith that
 * shows the whole visible hemisphere at once. It is an additional view mode —
 * it never feeds back into mission predictions, stored view settings or the
 * windowed camera (azimuth/altitude/fieldOfView keep their meanings).
 */
import type {
  Constellation,
  HorizontalStar,
  ObservationSettings,
  SimulationSettings,
  StarStatus,
} from "../types/astronomy";
import { clamp } from "./validation";
import { directionVector, type Vec3 } from "./projection";
import { createContext } from "./observer";
import { sunPosition, type SunPosition } from "./sun";
import { twilightStage } from "./twilight";
import { evaluateStar, type StarLayerState } from "./visibilityModel";
import { lineStyleFactor, labelStyleFactor } from "./constellationStyle";
import {
  buildSharedSceneObjects,
  type SceneProjector,
  type SharedSceneObjects,
} from "./sceneObjects";
import { starColorAt } from "./denseCatalog";
import { skyPalette } from "./skyPalette";
import { ZOOM_STEP } from "./interaction";
import {
  formatHeading,
  skyPhase,
  type SceneLabel,
  type SceneLine,
  type SceneStar,
  type SkyScene,
} from "./visibility";

const DEG = Math.PI / 180;

const DISABLED_STATUS: StarStatus = { state: "disabled" };

function emptySharedObjects(sunAltitudeDeg: number): SharedSceneObjects {
  return {
    sunAltitudeDeg,
    bodies: [],
    messier: [],
    milkyWay: [],
    denseStars: [],
    horizon: [],
    cardinals: [],
    zenith: null,
    sunScreen: null,
  };
}

/** Dome camera: which compass direction sits at the top, and how far in we are. */
export interface DomeView {
  /** Azimuth placed at the top of the canvas, degrees clockwise from north. */
  rotationDeg: number;
  /** 1 shows the whole hemisphere; larger values zoom into the dome. */
  zoom: number;
}

export const DOME_MIN_ZOOM = 1;
export const DOME_MAX_ZOOM = 6;
const DOME_MARGIN = 0.94;

/** Pixel radius of the dome circle for a canvas and view. */
export function domeRadiusPx(width: number, height: number, view: DomeView): number {
  return (Math.min(width, height) / 2) * DOME_MARGIN * view.zoom;
}

/**
 * Stereographic projector: zenith at the canvas centre, the horizon on a
 * circle of `domeRadiusPx`, azimuth measured clockwise from the view rotation.
 * Directions below the horizon do not project.
 */
export function domeProjector(
  width: number,
  height: number,
  view: DomeView,
): SceneProjector {
  const cx = width / 2;
  const cy = height / 2;
  const radius = domeRadiusPx(width, height, view);
  const rotation = view.rotationDeg * DEG;
  return {
    fovDeg: 180 / Math.max(DOME_MIN_ZOOM, view.zoom),
    project(dir: Vec3) {
      const up = Math.min(1, Math.max(-1, dir[1]));
      const alt = Math.asin(up);
      if (alt < -0.01 * DEG) return null; // strictly on-sky: the rim is alt 0
      // Zenith distance -> stereographic radius (1 at the horizon).
      const r = Math.tan((Math.PI / 2 - alt) / 2);
      const az = Math.atan2(dir[0], dir[2]);
      const rel = az - rotation;
      return {
        x: cx + radius * r * Math.sin(rel),
        y: cy - radius * r * Math.cos(rel),
      };
    },
  };
}

/** Horizontal drag spins the dome; vertical motion is unused on a dome. */
export function panDomeView(view: DomeView, dxPx: number, heightPx: number): DomeView {
  if (!Number.isFinite(dxPx) || !Number.isFinite(heightPx) || heightPx <= 0) {
    return view;
  }
  const degPerPx = 180 / Math.max(200, heightPx);
  return { ...view, rotationDeg: ((view.rotationDeg + dxPx * degPerPx) % 360 + 360) % 360 };
}

/** Wheel zoom centred on the dome; never zooms out past the whole sky. */
export function zoomDomeView(view: DomeView, wheelDeltaY: number): DomeView {
  if (!Number.isFinite(wheelDeltaY)) return view;
  const zoom = clamp(
    view.zoom * Math.exp(-wheelDeltaY * ZOOM_STEP),
    DOME_MIN_ZOOM,
    DOME_MAX_ZOOM,
  );
  return { ...view, zoom };
}

/**
 * Builds the same SkyScene shape the windowed renderer consumes, but through
 * the dome projector and with `dome` circle metadata for the renderer.
 */
export function buildDomeScene(
  stars: HorizontalStar[],
  constellations: Constellation[],
  settings: ObservationSettings,
  layers: StarLayerState,
  simulation: SimulationSettings,
  width: number,
  height: number,
  view: DomeView,
): SkyScene {
  const projector = domeProjector(width, height, view);
  let sun: SunPosition = { azimuth: 0, altitude: -90 };
  try {
    sun = sunPosition(createContext(settings));
  } catch {
    // Invalid input is handled by the observation panel; keep a safe scene.
  }

  const starById = new Map(stars.map((star) => [star.id, star]));
  const sceneStars: SceneStar[] = [];
  const projected = new Map<string, { x: number; y: number }>();
  for (const star of stars) {
    const point = projector.project(directionVector(star.azimuth, star.altitude));
    if (!point) continue;
    projected.set(star.id, point);
    sceneStars.push({
      star,
      x: point.x,
      y: point.y,
      status: evaluateStar(star, layers, simulation, sun.altitude),
      color: starColorAt(star.ra, star.dec),
    });
  }
  const statusById = new Map(sceneStars.map((s) => [s.star.id, s.status]));

  const lines: SceneLine[] = constellations.flatMap((c) =>
    c.lines.flatMap(([aId, bId]) => {
      const a = projected.get(aId);
      const b = projected.get(bId);
      if (!a || !b) return [];
      return [
        {
          constellationId: c.id,
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          factor: lineStyleFactor(
            statusById.get(aId) ?? DISABLED_STATUS,
            statusById.get(bId) ?? DISABLED_STATUS,
          ),
        },
      ];
    }),
  );

  const labels: SceneLabel[] = constellations.flatMap((c) => {
    const memberIds = c.lines.flat();
    const members = memberIds
      .map((id) => {
        const point = projected.get(id);
        const star = starById.get(id);
        return point && star ? { star, x: point.x, y: point.y } : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
    if (members.length === 0) return [];
    const x = members.reduce((sum, m) => sum + m.x, 0) / members.length;
    const y = members.reduce((sum, m) => sum + m.y, 0) / members.length;
    const best = members.sort((a, b) => a.star.magnitude - b.star.magnitude)[0].star;
    const statuses = memberIds
      .map((id) => statusById.get(id))
      .filter((s): s is NonNullable<typeof s> => s !== undefined);
    return [
      {
        constellationId: c.id,
        name: c.name,
        brightestStarName: best.name,
        x,
        y,
        factor: labelStyleFactor(statuses),
      },
    ];
  });

  let shared = emptySharedObjects(sun.altitude);
  try {
    shared = buildSharedSceneObjects(settings, simulation, projector, width, height, sun, { mapMode: true });
  } catch {
    // Keep a safe scene on invalid input.
  }

  const sunScreen = shared.sunScreen;
  const radius = domeRadiusPx(width, height, view);

  return {
    stars: sceneStars,
    lines,
    labels,
    heading: `All sky · facing ${formatHeading(view.rotationDeg)}`,
    visibleCount: sceneStars.filter((star) => star.status.state === "visible").length,
    inViewCount: sceneStars.length,
    skyPhase: simulation.daylightMode === "removed" ? "night" : skyPhase(sun.altitude),
    twilightStage: twilightStage(sun.altitude),
    sunX: sunScreen?.x ?? null,
    sunY: sunScreen?.y ?? null,
    sunAzimuthDeg: sun.azimuth,
    sunAltitudeDeg: sun.altitude,
    fovDeg: projector.fovDeg,
    denseStars: shared.denseStars,
    bodies: shared.bodies,
    messier: shared.messier,
    milkyWay: shared.milkyWay,
    horizon: shared.horizon,
    cardinals: shared.cardinals,
    zenith: shared.zenith,
    sunScreen: shared.sunScreen,
    palette: skyPalette(simulation.daylightMode === "removed" ? -90 : shared.sunAltitudeDeg),
    dome: { cx: width / 2, cy: height / 2, radiusPx: radius },
  };
}


