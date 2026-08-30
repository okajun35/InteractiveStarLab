import type {
  ObservationSettings,
  SimulationSettings,
} from "../types/astronomy";
import { applyPlace, PLACE_PRESETS } from "../astronomy/directions";
import { lightPollutionLimit } from "../astronomy/magnitude";

/**
 * The four What-If experiments (spec §28). Each is a pure transformation
 * on (observation, simulation) state plus a short explanation (§29-§30).
 *
 * - A: darken the daytime sky        → daylightMode: real → removed
 * - B: switch off all city lights   → lightPollution → perfect
 * - C: 6 hours later                → datetime += 6h
 * - D: from Sydney (South)          → location → Sydney (same local time §27)
 */
export interface ExperimentDef {
  id: "daylight" | "city-lights" | "plus-six-hours" | "sydney";
  title: string;
  /** Guided guess options (spec §29). */
  guessQuestion: string;
  guesses: string[];
  correctGuess: number;
  apply: (
    obs: ObservationSettings,
    sim: SimulationSettings,
  ) => { observation: ObservationSettings; simulation: SimulationSettings };
  explanation: string;
}

export const EXPERIMENTS: ExperimentDef[] = [
  {
    id: "daylight",
    title: "What if the daytime sky were dark?",
    guessQuestion: "What do you think would happen if the daytime sky were dark?",
    guesses: [
      "Many more stars would appear",
      "Nothing would change",
      "The stars would move to their nighttime positions",
    ],
    correctGuess: 0,
    apply: (obs, sim) => ({
      observation: obs,
      simulation: { ...sim, daylightMode: "removed" },
    }),
    explanation: `Stars are still present during the day. They are harder to see because sunlight scatters in the atmosphere and brightens the sky.
The time stays the same; the stars do not move to nighttime positions.`,
  },
  {
    id: "city-lights",
    title: "What if all city lights went out?",
    guessQuestion: "What do you think would happen if all city lights went out?",
    guesses: [
      "The number of visible stars would increase greatly",
      "The number of visible stars would not change",
      "The stars would change position",
    ],
    correctGuess: 0,
    apply: (obs, sim) => ({
      observation: obs,
      simulation: {
        ...sim,
        lightPollution: "perfect",
        limitingMagnitude: lightPollutionLimit("perfect"),
      },
    }),
    explanation: `City lights (light pollution) brighten the entire sky and hide faint stars.
Removing light pollution greatly increases the number of visible stars at the same time and place.
The stars do not move; only the sky becomes darker.`,
  },
  {
    id: "plus-six-hours",
    title: "What will the sky look like 6 hours later?",
    guessQuestion: "What do you think the sky will look like six hours later?",
    guesses: [
      "The stars will have moved slowly",
      "The star pattern will be almost the same",
      "The star brightness will change",
    ],
    correctGuess: 0,
    apply: (obs, sim) => ({
      observation: {
        ...obs,
        datetime: new Date(obs.datetime.getTime() + 6 * 3600 * 1000),
      },
      simulation: sim,
    }),
    explanation: `Earth's rotation makes the stars appear to move slowly.
After six hours, notice how clearly the constellations have shifted.
The stars' magnitudes (brightness) do not change.`,
  },
  {
    id: "sydney",
    title: "What if you looked from Sydney?",
    guessQuestion: "What do you think the sky would look like from Sydney in the Southern Hemisphere?",
    guesses: [
      "The visible constellations would change",
      "The sky would look exactly the same",
      "All the stars would disappear",
    ],
    correctGuess: 0,
    apply: (obs, sim) => ({
      observation: {
        ...obs,
        ...applyPlace(PLACE_PRESETS.find((p) => p.id === "sydney")!),
      },
      simulation: sim,
    }),
    explanation: `Changing location changes the horizon and therefore the visible constellations.
From the Southern Hemisphere, southern constellations become visible.
Even at the same local time, the sky is not limited to constellations shared with the Northern Hemisphere.`,
  },
];
