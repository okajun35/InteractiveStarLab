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
