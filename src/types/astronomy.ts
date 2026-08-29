/**
 * 星空ビューアMVPの型定義。
 *
 * `ra` は sidereal **hours**(J2000)を、`dec` は degrees で保持する。
 * これは astronomy-engine `Horizon()` API と同じ约定。
 */
export interface Star {
  id: string;
  name: string;
  nameJa?: string;
  ra: number;
  dec: number;
  magnitude: number;
  constellation?: string;
}

export interface Constellation {
  id: string;
  name: string;
  nameJa?: string;
  /** 簡易解説(数行以内、spec §33-§34) */
  descriptionJa?: string;
  lines: Array<[string, string]>;
}

export interface ObservationSettings {
  latitude: number;
  longitude: number;
  /** 絶対時刻(UTC)を持つ Date 値。JS Date は絶対時刻なのでTZ換算不要。 */
  datetime: Date;
  /** 0=北 90=東 180=南 270=西 */
  azimuth: number;
  /** 0=水平線 90=天頂 */
  altitude: number;
  /** 鉛直方向視野角(deg) */
  fieldOfView: number;
}

export interface DisplayOptions {
  stars: boolean;
  starNames: boolean;
  constellationLines: boolean;
  constellationNames: boolean;
}

/** 水平座標(度)を持つ星。 */
export interface HorizontalStar extends Star {
  azimuth: number;
  altitude: number;
}

/** 画面に投影済みの星。 */
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
  nameJa?: string;
  brightestStarName?: string;
  x: number;
  y: number;
  factor?: number;
}

/** Canvas一描画に必要な全データ。 */
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
  /** 見える最大の等級(教育用近似, §17) */
  limitingMagnitude: number;
  /** 観察者の感受性:等級の補正(-0.5..+0.5, §20の別モデル。省略/0で無補正) */
  observerSensitivity?: number;
  /** 存在するが見えない星を薄く表示 (§11) */
  showHiddenStars: boolean;
}

export type HideReason = "below-horizon" | "daylight" | "light-pollution";

export type StarStatus =
  | { state: "visible" }
  | { state: "hidden"; reason: HideReason }
  | { state: "disabled" };
