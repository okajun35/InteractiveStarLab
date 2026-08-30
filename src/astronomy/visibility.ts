import type {
  Constellation,
  ObservationSettings,
  SimulationSettings,
  Star,
  StarStatus,
  SkyView,
} from "../types/astronomy";
import {
  angularSeparation,
  cameraFrame,
  directionVector,
  project,
} from "./projection";
import { lineStyleFactor, labelStyleFactor } from "./constellationStyle";
import { stableAzimuth } from "./directions";
import { sunPosition, type SunPosition } from "./sun";
import { twilightStage, type TwilightStage } from "./twilight";
import { evaluateStar, type StarLayerState } from "./visibilityModel";
import { createContext } from "./observer";

/** A star carrying computed horizontal coordinates (degrees). */
export type HorizontalStar = Star & {
  azimuth: number;
  altitude: number;
};

const HORIZON_TOLERANCE_DEG = 2;
const VIEW_MARGIN_DEG = 3;

/**
 * A star is a view candidate when it is at/above the horizon (with a small
 * tolerance) and close enough to the camera direction that it falls within
 * the half-FOV plus a margin. Uses the true spherical angular separation,
 * not a rectangular box in az/alt.
 */
export function isInView(
  star: Pick<HorizontalStar, "azimuth" | "altitude">,
  settings: Pick<
    ObservationSettings,
    "azimuth" | "altitude" | "fieldOfView"
  >,
): boolean {
  if (star.altitude < -HORIZON_TOLERANCE_DEG) return false;
  const separation = angularSeparation(
    settings.azimuth,
    settings.altitude,
    star.azimuth,
    star.altitude,
  );
  return separation <= settings.fieldOfView / 2 + VIEW_MARGIN_DEG;
}

/**
 * Projects every in-view star into screen space. Returns only stars whose
 * projection lands on (or near) the canvas.
 */
export function projectStars(
  stars: HorizontalStar[],
  settings: ObservationSettings,
  width: number,
  height: number,
): Map<string, { star: HorizontalStar; x: number; y: number }> {
  const frame = cameraFrame(settings.azimuth, settings.altitude);
  const margin = Math.min(width, height) * 0.25;
  const projected = new Map<string, { star: HorizontalStar; x: number; y: number }>();

  for (const star of stars) {
    if (!isInView(star, settings)) continue;
    const { x, y } = project(
      frame,
      directionVector(star.azimuth, star.altitude),
      settings.fieldOfView,
      width,
      height,
    );
    if (x < -margin || x > width + margin || y < -margin || y > height + margin) {
      continue;
    }
    projected.set(star.id, { star, x, y });
  }
  return projected;
}

/**
 * Builds the complete screen-space view: stars, constellation lines, and
 * constellation name labels. Pure geometry — no astronomy math inside.
 */
export function buildSkyView(
  stars: HorizontalStar[],
  constellations: Constellation[],
  settings: ObservationSettings,
  width: number,
  height: number,
): SkyView {
  const projected = projectStars(stars, settings, width, height);

  const lines = constellations.flatMap((c) =>
    c.lines.flatMap(([aId, bId]) => {
      const a = projected.get(aId);
      const b = projected.get(bId);
      if (!a || !b) return [];
      if (
        Math.abs(a.x - b.x) > width * 0.9 &&
        Math.abs(a.y - b.y) > height * 0.9
      ) {
        return [];
      }
      return [
        {
          constellationId: c.id,
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          startId: aId,
          endId: bId,
          factor: 1,
        },
      ];
    }),
  );

  const labels = constellations.flatMap((c) => {
    const members = c.lines
      .flat()
      .map((id) => projected.get(id))
      .filter((p): p is { star: HorizontalStar; x: number; y: number } =>
        p !== undefined,
      );
    if (members.length === 0) return [];
    const x = members.reduce((sum, m) => sum + m.x, 0) / members.length;
    const y = members.reduce((sum, m) => sum + m.y, 0) / members.length;
    const best = members
      .sort((a, b) => a.star.magnitude - b.star.magnitude)[0]
      .star;
    return [
      {
        constellationId: c.id,
        name: c.name,
        brightestStarName: best.name,
        x,
        y,
        factor: 1,
      },
    ];
  });

  return {
    stars: [...projected.values()].map((p) => ({
      ...p.star,
      x: p.x,
      y: p.y,
      inView: true,
    })),
    lines,
    labels,
    heading: formatHeading(settings.azimuth),
  };
}

export function formatHeading(azimuthDeg: number): string {
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(((azimuthDeg % 360) / 45)) % 8;
  return `${names[idx]} ${Math.round(azimuthDeg)}°`;
}

export type SkyPhase = "day" | "twilight" | "night";

export interface SceneStar {
  star: HorizontalStar;
  x: number;
  y: number;
  status: StarStatus;
}

export interface SceneLine {
  constellationId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  factor: number;
}

export interface SceneLabel {
  constellationId: string;
  name: string;
  brightestStarName?: string;
  x: number;
  y: number;
  factor: number;
}

export interface SkyScene {
  stars: SceneStar[];
  lines: SceneLine[];
  labels: SceneLabel[];
  heading: string;
  visibleCount: number;
  inViewCount: number;
  skyPhase: SkyPhase;
  twilightStage: TwilightStage;
  sunX: number | null;
  sunY: number | null;
  sunAzimuthDeg: number;
  sunAltitudeDeg: number;
}

export function skyPhase(sunAltitude: number): SkyPhase {
  if (sunAltitude > 0) return "day";
  if (sunAltitude > -18) return "twilight";
  return "night";
}

function projectSun(
  sun: SunPosition,
  settings: ObservationSettings,
  width: number,
  height: number,
): { x: number; y: number } | null {
  if (width <= 0 || height <= 0 || !isInView(sun, settings)) return null;
  const frame = cameraFrame(settings.azimuth, settings.altitude);
  const point = project(
    frame,
    directionVector(sun.azimuth, sun.altitude),
    settings.fieldOfView,
    width,
    height,
  );
  const margin = Math.min(width, height) * 0.25;
  if (
    point.depth <= 0 ||
    point.x < -margin ||
    point.x > width + margin ||
    point.y < -margin ||
    point.y > height + margin
  ) {
    return null;
  }
  return { x: point.x, y: point.y };
}

const DISABLED_STATUS: StarStatus = { state: "disabled" };

/** Builds a simulated scene while retaining the existing line geometry. */
export function buildSkyScene(
  stars: HorizontalStar[],
  constellations: Constellation[],
  settings: ObservationSettings,
  layers: StarLayerState,
  simulation: SimulationSettings,
  width: number,
  height: number,
): SkyScene {
  let sun: SunPosition = { azimuth: 0, altitude: -90 };
  try {
    sun = sunPosition(createContext(settings));
  } catch {
    // Invalid input is handled by the observation panel; keep a safe scene.
  }

  const viewSettings = {
    ...settings,
    azimuth: stableAzimuth(settings, sun.azimuth),
  };
  const view = buildSkyView(stars, constellations, viewSettings, width, height);
  const sceneStars = view.stars.map((star) => ({
    star,
    x: star.x,
    y: star.y,
    status: evaluateStar(star, layers, simulation, sun.altitude),
  }));
  const statusById = new Map(sceneStars.map((sceneStar) => [sceneStar.star.id, sceneStar.status]));

  // Keep every line visible at the current repository's proven opacity and
  // geometry. `factor` is retained for analysis/tests, but rendering does not
  // fade the line based on hidden stars.
  const lines = view.lines.map((line) => ({
    constellationId: line.constellationId,
    x1: line.x1,
    y1: line.y1,
    x2: line.x2,
    y2: line.y2,
    factor: lineStyleFactor(
      statusById.get(line.startId ?? "") ?? DISABLED_STATUS,
      statusById.get(line.endId ?? "") ?? DISABLED_STATUS,
    ),
  }));
  const labels = view.labels.map((label) => {
    const constellation = constellations.find((item) => item.id === label.constellationId);
    const statuses = constellation
      ? constellation.lines
          .flat()
          .map((id) => statusById.get(id))
          .filter((status): status is StarStatus => status !== undefined)
      : [];
    return { ...label, factor: labelStyleFactor(statuses) };
  });
  const projectedSun = projectSun(sun, viewSettings, width, height);
  return {
    stars: sceneStars,
    lines,
    labels,
    heading: view.heading,
    visibleCount: sceneStars.filter((star) => star.status.state === "visible").length,
    inViewCount: sceneStars.length,
    // REMOVED means the same astronomical positions under an intentionally
    // dark background, so it should render as night even during daytime.
    skyPhase: simulation.daylightMode === "removed" ? "night" : skyPhase(sun.altitude),
    twilightStage: twilightStage(sun.altitude),
    sunX: projectedSun?.x ?? null,
    sunY: projectedSun?.y ?? null,
    sunAzimuthDeg: sun.azimuth,
    sunAltitudeDeg: sun.altitude,
  };
}
