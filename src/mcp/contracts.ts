import type {
  DisplayOptions,
  ObservationSettings,
  SimulationSettings,
} from "../types/astronomy";
import type { StarLayerState } from "../astronomy/visibilityModel";
import type {
  ObservationSite,
  ObservationStatus,
} from "../types/observation";

export interface PredictVisibleStarsInput {
  site: ObservationSite;
  dateTime: string;
  maxMagnitude: number;
  limit?: number;
}

export interface PredictedStarToolResult {
  starId: string;
  name: string;
  nameJa?: string;
  magnitude: number;
  altitude: number;
  azimuth: number;
  predictedVisible: boolean;
}

export interface PredictVisibleStarsResult {
  site: ObservationSite;
  dateTime: string;
  maxMagnitude: number;
  stars: PredictedStarToolResult[];
}

export interface CreateObservationPlanInput {
  site: ObservationSite;
  dateTime: string;
  maxMagnitude: number;
  starIds: string[];
}

export interface ObservationResultToolItem {
  starId: string;
  name: string;
  nameJa?: string;
  prediction: "visible" | "not_visible";
  observation: ObservationStatus;
  predictedAltitude: number;
  predictedAzimuth: number;
  predictedMagnitude: number;
}

export interface ObservationRecordToolResult {
  missionId: string;
  site: ObservationSite;
  dateTime: string;
  completedAt: string;
  results: ObservationResultToolItem[];
}

export interface ComparisonStarToolResult {
  starId: string;
  name: string;
  nameJa?: string;
  prediction: "visible" | "not_visible";
  observation: ObservationStatus;
  match: boolean | null;
  predictedAltitude: number;
  predictedAzimuth: number;
  predictedMagnitude: number;
}

export interface DetailedObservationComparison {
  predicted: number;
  visible: number;
  notVisible: number;
  unsure: number;
  comparable: number;
  matches: number;
  mismatches: number;
  matchRate: number | null;
  stars: ComparisonStarToolResult[];
}

export interface CurrentSkyStateInput {
  site: ObservationSite;
  observation: ObservationSettings;
  simulation: SimulationSettings;
  layers: StarLayerState;
  displayOptions: DisplayOptions;
}

export interface CurrentSkyStarToolResult {
  starId: string;
  name: string;
  nameJa?: string;
  magnitude: number;
  altitude: number;
  azimuth: number;
  status:
    | { state: "visible" }
    | { state: "hidden"; reason: string }
    | { state: "disabled" };
}

export interface CurrentSkyStateResult {
  site: ObservationSite;
  dateTime: string;
  view: {
    azimuth: number;
    altitude: number;
    fieldOfView: number;
  };
  simulation: SimulationSettings;
  layers: StarLayerState;
  displayOptions: DisplayOptions;
  skyPhase: "day" | "twilight" | "night";
  twilightStage: string;
  sunAltitude: number;
  sunAzimuth: number;
  visibleCount: number;
  inViewCount: number;
  stars: CurrentSkyStarToolResult[];
}

export interface ToolSuccess<T> {
  ok: true;
  data: T;
}

export interface ToolFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ToolEnvelope<T> = ToolSuccess<T> | ToolFailure;

export function encodeToolResult<T>(result: ToolEnvelope<T>): string {
  return JSON.stringify(result);
}

export function toolSuccess<T>(data: T): string {
  return encodeToolResult({ ok: true, data });
}

export function toolFailure(
  code: string,
  message: string,
  details?: unknown,
): string {
  return encodeToolResult({
    ok: false,
    error: details === undefined ? { code, message } : { code, message, details },
  });
}
