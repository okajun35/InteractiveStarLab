/**
 * `describe_current_view` — a read-only payload that tells an agent what the
 * human is currently looking at: the camera angles, projection mode, layer
 * state, what is actually in view, plus the human's recent interactions.
 */
import { buildSkyScene, formatHeading } from "../astronomy/visibility";
import { horizontalStars } from "../astronomy/coordinates";
import { CONSTELLATIONS, STARS } from "../astronomy/stars";
import type { StarLayerState } from "../astronomy/visibilityModel";
import type { SkySceneMetrics } from "../sky/contextModel";
import type { SkyAction } from "../sky/skyActions";
import type {
  DisplayOptions,
  ObservationSettings,
  SimulationSettings,
  SkyMode,
} from "../types/astronomy";
import type { ObservationSite } from "../types/observation";
import { assertSite } from "./services";

export interface SkySelection {
  kind: "star" | "sun";
  id?: string;
  name: string;
}

export interface DescribeViewInput {
  site: ObservationSite;
  observation: ObservationSettings;
  simulation: SimulationSettings;
  layers: StarLayerState;
  displayOptions: DisplayOptions;
  skyMode: SkyMode;
  selection: SkySelection | null;
  actions: readonly SkyAction[];
  metrics: SkySceneMetrics | null;
}

export interface DescribeViewResult {
  /** One-line human-readable summary of the current view. */
  summary: string;
  site: ObservationSite;
  dateTime: string;
  skyMode: SkyMode;
  view: {
    azimuth: number;
    altitude: number;
    fieldOfView: number;
  };
  simulation: SimulationSettings;
  layers: StarLayerState;
  displayOptions: DisplayOptions;
  scene: {
    heading: string;
    skyPhase: string;
    twilightStage: string;
    visibleCount: number;
    inViewCount: number;
    sun: {
      azimuthDeg: number;
      altitudeDeg: number;
      inView: boolean;
    };
    bodies: {
      kind: "moon" | "planet";
      id: string;
      name: string;
      azimuthDeg: number;
      altitudeDeg: number;
    }[];
    messier: {
      id: string;
      name: string;
      altitudeDeg: number;
    }[];
  };
  selection: SkySelection | null;
  recentActions: SkyAction[];
  /** Last scene metrics the canvas reported, if any. */
  metrics: SkySceneMetrics | null;
  caveats: string[];
}

// The scene is built on a fixed reference viewport so counts are stable and
// independent of the agent's timing relative to canvas resizes.
const REFERENCE_VIEWPORT = { width: 1000, height: 700 } as const;

export function describeCurrentView(input: DescribeViewInput): DescribeViewResult {
  assertSite(input.site);
  const scene = buildSkyScene(
    horizontalStars(input.observation, STARS),
    CONSTELLATIONS,
    input.observation,
    input.layers,
    input.simulation,
    REFERENCE_VIEWPORT.width,
    REFERENCE_VIEWPORT.height,
  );

  const caveats = [
    "Geometric view only — weather, atmospheric seeing, and horizon obstructions are not modelled.",
  ];
  if (input.skyMode === "dome") {
    caveats.push(
      "The display is in whole-sky dome mode; the counts below describe the window camera at the reported azimuth/altitude.",
    );
  }

  const heading = formatHeading(input.observation.azimuth);
  const selectionSuffix = input.selection
    ? ` · selected: ${input.selection.name}`
    : "";
  const summary = [
    `Looking ${heading} at ${input.observation.altitude}° altitude`,
    `${input.observation.fieldOfView}° field of view`,
    scene.skyPhase,
    `${scene.inViewCount} of ${scene.visibleCount} visible stars in frame`,
  ].join(" · ") + selectionSuffix;

  return {
    summary,
    site: { ...input.site },
    dateTime: input.observation.datetime.toISOString(),
    skyMode: input.skyMode,
    view: {
      azimuth: input.observation.azimuth,
      altitude: input.observation.altitude,
      fieldOfView: input.observation.fieldOfView,
    },
    simulation: { ...input.simulation },
    layers: { ...input.layers },
    displayOptions: { ...input.displayOptions },
    scene: {
      heading,
      skyPhase: scene.skyPhase,
      twilightStage: scene.twilightStage,
      visibleCount: scene.visibleCount,
      inViewCount: scene.inViewCount,
      sun: {
        azimuthDeg: scene.sunAzimuthDeg,
        altitudeDeg: scene.sunAltitudeDeg,
        inView: scene.sunScreen !== null,
      },
      bodies: scene.bodies.map((body) => ({
        kind: body.kind,
        id: body.id,
        name: body.name,
        azimuthDeg: body.azimuthDeg,
        altitudeDeg: body.altitudeDeg,
      })),
      messier: scene.messier.map((object) => ({
        id: object.id,
        name: object.name,
        altitudeDeg: object.altitudeDeg,
      })),
    },
    selection: input.selection ? { ...input.selection } : null,
    recentActions: [...input.actions],
    metrics: input.metrics ? { ...input.metrics } : null,
    caveats,
  };
}
