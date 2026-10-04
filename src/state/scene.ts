import { useMemo } from "react";
import type {
  ObservationSettings,
  SimulationSettings,
} from "../types/astronomy";
import { useSimulation } from "./simulation";
import { useStarViewer } from "./context";
import { CONSTELLATIONS, STARS } from "../astronomy/stars";
import { horizontalStars } from "../astronomy/coordinates";
import { fieldErrors } from "../astronomy/validation";
import { buildSkyScene, type SkyScene } from "../astronomy/visibility";
import { buildDomeScene, type DomeView } from "../astronomy/dome";

export interface SceneOverride {
  observation?: Partial<ObservationSettings>;
  simulation?: Partial<SimulationSettings>;
}

/**
 * Combines observation (camera) + simulation (environment) into one scene
 * (spec §37 pipeline). Used by StarCanvas for both single view and
 * side-by-side compare (spec §21–§22).
 */
export function useScene(
  width: number,
  height: number,
  override?: SceneOverride,
): SkyScene {
  const { settings, errors, horizontal } = useStarViewer();
  const { layers, settings: sim } = useSimulation();

  return useMemo(() => {
    const observation = { ...settings, ...override?.observation };
    const simulation = { ...sim, ...override?.simulation };
    const observationErrors = fieldErrors(observation);
    const sceneHorizontal = override?.observation
      ? observationErrors
        ? []
        : horizontalStars(observation, STARS)
      : horizontal;
    if (errors || width <= 0 || height <= 0) {
      return buildSkyScene(sceneHorizontal, CONSTELLATIONS, observation, layers, simulation, 0, 0);
    }
    return buildSkyScene(
      sceneHorizontal,
      CONSTELLATIONS,
      observation,
      layers,
      simulation,
      width,
      height,
    );
  }, [
    settings,
    horizontal,
    layers,
    sim,
    width,
    height,
    errors,
    override,
    // Object identity of the override (stable per-compare render)
  ]);
}

/**
 * The whole-sky dome variant of useScene. Dome view state (rotation/zoom)
 * stays local to the dome canvas — mission data and view settings are
 * untouched by it.
 */
export function useDomeScene(
  width: number,
  height: number,
  view: DomeView,
): SkyScene {
  const { settings, errors, horizontal } = useStarViewer();
  const { layers, settings: sim } = useSimulation();

  return useMemo(() => {
    const w = errors || width <= 0 || height <= 0 ? 0 : width;
    const h = errors || width <= 0 || height <= 0 ? 0 : height;
    return buildDomeScene(horizontal, CONSTELLATIONS, settings, layers, sim, w, h, view);
  }, [settings, horizontal, layers, sim, width, height, errors, view]);
}
