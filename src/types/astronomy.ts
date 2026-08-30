/** Core types for the Interactive Star Lab MVP.
 *
 * `ra` is stored in sidereal hours (J2000), while `dec` is stored in degrees.
 * This follows the convention used by astronomy-engine's `Horizon()` API.
 */
export interface Star {
  id: string;
  name: string;
  ra: number;
  dec: number;
  magnitude: number;
  constellation?: string;
}

export interface Constellation {
  id: string;
  name: string;
  /** Short explanation (a few lines, spec §33–§34). */
  description?: string;
  lines: Array<[string, string]>;
}

export interface ObservationSettings {
  latitude: number;
  longitude: number;
  /** An absolute UTC time. JavaScript Date values are already absolute. */
  datetime: Date;
  /** 0=north, 90=east, 180=south, 270=west. */
  azimuth: number;
  /** 0=horizon, 90=zenith. */
  altitude: number;
  /** Vertical field of view in degrees. */
  fieldOfView: number;
}

export interface DisplayOptions {
  stars: boolean;
  starNames: boolean;
  constellationLines: boolean;
  constellationNames: boolean;
}

/** A star with horizontal coordinates in degrees. */
export interface HorizontalStar extends Star {
  azimuth: number;
  altitude: number;
}

/** A star projected onto the canvas. */
export interface ProjectedStar extends HorizontalStar {
  x: number;
  y: number;
}

export interface ViewLine {
  constellationId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Source endpoints are retained for visibility/simulation overlays. */
  startId?: string;
  endId?: string;
  factor?: number;
}

export interface ViewLabel {
  constellationId: string;
  name: string;
  brightestStarName?: string;
  x: number;
  y: number;
  factor?: number;
}

/** All data required to render one canvas frame. */
export interface SkyView {
  stars: ProjectedStar[];
  lines: ViewLine[];
  labels: ViewLabel[];
  heading: string;
}

/* ── Interactive Sky Lab (Phase 1〜3) ───── */

export type DaylightMode = "real" | "removed";

export type LightPollution =
  | "city-center"
  | "urban"
  | "suburban"
  | "dark-sky"
  | "perfect";

export interface SimulationSettings {
  daylightMode: DaylightMode;
  lightPollution: LightPollution;
  /** Faintest visible magnitude (educational approximation, §17). */
  limitingMagnitude: number;
  /** Observer sensitivity as a magnitude adjustment (−0.5..+0.5, §20). */
  observerSensitivity?: number;
  /** Render stars that exist but are not visible with reduced opacity (§11). */
  showHiddenStars: boolean;
}

export type HideReason = "below-horizon" | "daylight" | "light-pollution";

export type StarStatus =
  | { state: "visible" }
  | { state: "hidden"; reason: HideReason }
  | { state: "disabled" };
