import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  LightPollution,
  ObservationSettings,
  SimulationSettings,
} from "../types/astronomy";
import type { ExperimentDef } from "./experiments";
import {
  LIMITING_MAGNITUDE_RANGE,
  LIGHT_POLLUTION_LABELS,
  lightPollutionLimit,
  OBSERVER_SENSITIVITY_RANGE,
  type MagnitudeLayer,
} from "../astronomy/magnitude";
import { PLACE_PRESETS } from "../astronomy/directions";
import { sameLocalTimeInstant, sameUtcInstant, type TimeBasis } from "../astronomy/timezones";
import type { StarLayerState } from "../astronomy/visibilityModel";
import { useStarViewer } from "./context";

export const DEFAULT_LAYERS: StarLayerState = {
  first: true,
  second: true,
  third: false,
  fourth: false,
  faint: false,
};

/** State captured before a What-If experiment is applied. */
export interface ExperimentSnapshot {
  observation: ObservationSettings;
  simulation: SimulationSettings;
}

/**
 * Clone an experiment snapshot, including its Date value.
 *
 * The snapshot is kept in SimulationProvider rather than ExperimentPanel so
 * it survives route changes that unmount the panel.
 */
export function cloneExperimentSnapshot(
  snapshot: ExperimentSnapshot,
): ExperimentSnapshot {
  return {
    observation: {
      ...snapshot.observation,
      datetime: new Date(snapshot.observation.datetime.getTime()),
    },
    simulation: { ...snapshot.simulation },
  };
}

const DEFAULT_SETTINGS: SimulationSettings = {
  // Keep the existing look: catalog goes to ~4.95, dark-sky limit 5.5.
  daylightMode: "real",
  lightPollution: "dark-sky",
  limitingMagnitude: lightPollutionLimit("dark-sky"),
  showHiddenStars: false,
  // Observer sensitivity baseline = typical sighted observer (§20 model).
  observerSensitivity: 0,
};

/** Compare kinds (spec §21, §22, §27). */
export type CompareKind = "daylight" | "light-pollution" | "location";

export interface ComparePanel {
  enabled: boolean;
  kind: CompareKind;
  /** Which half shows the "base" condition (left) vs. the "changed" one (right). */
  baseLabel: string;
  changedLabel: string;
}

export interface ExperimentState {
  /** Currently-running experiment id, or null. */
  activeId: ExperimentDef["id"] | null;
  /** Guided-guess outcome: which option was picked, and whether correct. */
  guess: { picked: number; correct: boolean } | null;
}

export interface SimulationState {
  layers: StarLayerState;
  setLayerEnabled: (layer: MagnitudeLayer, enabled: boolean) => void;
  enableAll: (enabled: boolean) => void;

  settings: SimulationSettings;
  /** Apply a light-pollution preset (also sets limitingMagnitude, §17). */
  setLightPollution: (level: LightPollution) => void;
  setDaylightMode: (mode: "real" | "removed") => void;
  setShowHiddenStars: (v: boolean) => void;
  /** Advanced (§19): manual limiting magnitude 1.0–6.5. */
  setLimitingMagnitude: (v: number) => void;
  /** True when limitingMagnitude differs from the active preset value. */
  customLimitingMagnitude: boolean;

  /** Observer sensitivity, -0.5..+0.5 mag (spec §20 separate model). 0 = typical. */
  observerSensitivity: number;
  setObserverSensitivity: (v: number) => void;

  /** What-If experiments (spec §28–§30). */
  activeExperiment: ExperimentDef | null;
  experimentGuess: { picked: number; correct: boolean } | null;
  /** Record the active experiment + the user's guided guess (§29). */
  beginExperiment: (
    def: ExperimentDef,
    pickedGuess: number,
    snapshot: ExperimentSnapshot,
  ) => void;
  clearExperiment: () => void;
  /** State captured before the active experiment was applied. */
  experimentSnapshot: ExperimentSnapshot | null;
  /** Generic simulation patch (used by experiments, §35). */
  patchSimulation: (patch: Partial<SimulationSettings>) => void;

  /** Before/After compare (spec §21–§22). */
  compare: {
    kind: CompareKind;
    baseSimulation: SimulationSettings;
    changedSimulation: SimulationSettings;
    baseLabel: string;
    changedLabel: string;
    baseObservationOverride?: Partial<ObservationSettings>;
    changedObservationOverride?: Partial<ObservationSettings>;
  } | null;
  setCompareKind: (kind: CompareKind | null) => void;

  /**
   * Time basis for the location compare (spec §27 Advanced).
   * - "same-local-time" (default per §27): both sides show the same wall clock.
   * - "same-utc-instant": both sides observe the same absolute moment.
   * Affects only the `location` compare; other compares ignore it.
   * Changing the basis atomically re-applies the active location compare.
   */
  timeBasis: TimeBasis;
  setTimeBasis: (basis: TimeBasis) => void;
}

const SimulationContext = createContext<SimulationState | null>(null);

export function SimulationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [layers, setLayers] = useState<StarLayerState>(() => ({
    ...DEFAULT_LAYERS,
  }));
  const [settings, setSettings] =
    useState<SimulationSettings>(() => ({ ...DEFAULT_SETTINGS }));
  // Observation datetime (for the location compare's time basis, §27).
  const observation = useStarViewer().settings;
  // Track the last applied preset to detect "custom" limiting magnitude (§19).
  const lastPresetRef = useRef<number>(DEFAULT_SETTINGS.limitingMagnitude);

  const setLayerEnabled = useCallback(
    (layer: MagnitudeLayer, enabled: boolean) =>
      setLayers((prev) => ({ ...prev, [layer]: enabled })),
    [],
  );

  const enableAll = useCallback(
    (enabled: boolean) =>
      setLayers({
        first: enabled,
        second: enabled,
        third: enabled,
        fourth: enabled,
        faint: enabled,
      }),
    [],
  );

  const setLightPollution = useCallback((level: LightPollution) => {
    const limit = lightPollutionLimit(level);
    lastPresetRef.current = limit;
    setSettings((prev) => ({
      ...prev,
      lightPollution: level,
      limitingMagnitude: limit,
    }));
  }, []);

  const setDaylightMode = useCallback(
    (mode: "real" | "removed") =>
      setSettings((prev) => ({ ...prev, daylightMode: mode })),
    [],
  );

  const setShowHiddenStars = useCallback(
    (v: boolean) => setSettings((prev) => ({ ...prev, showHiddenStars: v })),
    [],
  );

  const setLimitingMagnitude = useCallback(
    (v: number) => {
      const clamped = Math.min(
        LIMITING_MAGNITUDE_RANGE.max,
        Math.max(LIMITING_MAGNITUDE_RANGE.min, v),
      );
      setSettings((prev) => ({ ...prev, limitingMagnitude: clamped }));
      lastPresetRef.current = clamped;
    },
    [],
  );

  const customLimitingMagnitude =
    Math.abs(settings.limitingMagnitude - lastPresetRef.current) > 1e-6;

  const setObserverSensitivity = useCallback((v: number) => {
    const clamped = Math.min(
      OBSERVER_SENSITIVITY_RANGE.max,
      Math.max(OBSERVER_SENSITIVITY_RANGE.min, v),
    );
    setSettings((prev) => ({ ...prev, observerSensitivity: clamped }));
  }, []);

  const observerSensitivity = settings.observerSensitivity ?? 0;

  // ── What-If experiments (§28–§30) ─────────────────────────────
  const [activeExperiment, setActiveExperiment] = useState<ExperimentDef | null>(
    null,
  );
  const [experimentGuess, setExperimentGuess] = useState<{
    picked: number;
    correct: boolean;
  } | null>(null);
  const [experimentSnapshot, setExperimentSnapshot] =
    useState<ExperimentSnapshot | null>(null);

  const beginExperiment = useCallback(
    (
      def: ExperimentDef,
      pickedGuess: number,
      snapshot: ExperimentSnapshot,
    ) => {
      setActiveExperiment(def);
      setExperimentGuess({
        picked: pickedGuess,
        correct: pickedGuess === def.correctGuess,
      });
      setExperimentSnapshot(cloneExperimentSnapshot(snapshot));
    },
    [],
  );

  const clearExperiment = useCallback(() => {
    setActiveExperiment(null);
    setExperimentGuess(null);
    setExperimentSnapshot(null);
  }, []);

  const patchSimulation = useCallback(
    (patch: Partial<SimulationSettings>) =>
      setSettings((prev) => ({ ...prev, ...patch })),
    [],
  );

  // ── Before/After compare (§21–§22) ───────────────────────────
  const [compare, setCompare] = useState<SimulationState["compare"]>(null);

  // Time basis for the location compare (§27 Advanced).
  // Default: same local wall-clock time (§27).
  const [timeBasis, setTimeBasisState] = useState<TimeBasis>("same-local-time");

  /** Build the location compare panel for the given basis (spec §27). */
  const buildLocationCompare = (basis: TimeBasis) => {
    const tokyo = PLACE_PRESETS.find((p) => p.id === "tokyo")!;
    const sydney = PLACE_PRESETS.find((p) => p.id === "sydney")!;
    const changedDatetime =
      basis === "same-local-time"
        ? sameLocalTimeInstant(observation.datetime, tokyo, sydney)
        : sameUtcInstant(observation.datetime, sydney);
    return {
      kind: "location" as const,
      baseSimulation: { ...settings },
      changedSimulation: { ...settings },
      baseLabel: "Tokyo",
      changedLabel: "Sydney",
      baseObservationOverride: {
        latitude: tokyo.latitude,
        longitude: tokyo.longitude,
      },
      changedObservationOverride: {
        latitude: sydney.latitude,
        longitude: sydney.longitude,
        datetime: changedDatetime,
      },
    };
  };

  /** Change the time basis; atomically re-applies an active location compare. */
  const setTimeBasis = useCallback(
    (basis: TimeBasis) => {
      setTimeBasisState(basis);
      setCompare((prev) =>
        prev && prev.kind === "location" ? buildLocationCompare(basis) : prev,
      );
    },
    // settings is read through buildLocationCompare (stable per render).
    [settings, timeBasis],
  );

  const setCompareKind = useCallback(
    (kind: CompareKind | null) => {
      if (kind === null) {
        setCompare(null);
        return;
      }
      switch (kind) {
        case "daylight":
          setCompare({
            kind,
            baseSimulation: { ...settings, daylightMode: "real" },
            changedSimulation: { ...settings, daylightMode: "removed" },
            baseLabel: "REAL daylight",
            changedLabel: "REMOVED daylight",
          });
          break;
        case "light-pollution":
          setCompare({
            kind,
            baseSimulation: {
              ...settings,
              lightPollution: "city-center",
              limitingMagnitude: lightPollutionLimit("city-center"),
            },
            changedSimulation: {
              ...settings,
              lightPollution: "dark-sky",
              limitingMagnitude: lightPollutionLimit("dark-sky"),
            },
            baseLabel: "City",
            changedLabel: "Dark Sky",
          });
          break;
        case "location":
          setCompare(buildLocationCompare(timeBasis));
          break;
      }
    },
    [settings, timeBasis, buildLocationCompare],
  );

  const value = useMemo<SimulationState>(
    () => ({
      layers,
      setLayerEnabled,
      enableAll,
      settings,
      setLightPollution,
      setDaylightMode,
      setShowHiddenStars,
      setLimitingMagnitude,
      customLimitingMagnitude,
      observerSensitivity,
      setObserverSensitivity,
      activeExperiment,
      experimentGuess,
      experimentSnapshot,
      beginExperiment,
      clearExperiment,
      patchSimulation,
      compare,
      setCompareKind,
      timeBasis,
      setTimeBasis,
    }),
    [
      layers,
      settings,
      setLayerEnabled,
      enableAll,
      setLightPollution,
      setDaylightMode,
      setShowHiddenStars,
      setLimitingMagnitude,
      customLimitingMagnitude,
      observerSensitivity,
      setObserverSensitivity,
      activeExperiment,
      experimentGuess,
      experimentSnapshot,
      beginExperiment,
      clearExperiment,
      patchSimulation,
      compare,
      setCompareKind,
      timeBasis,
      setTimeBasis,
    ],
  );

  return (
    <SimulationContext.Provider value={value}>
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation(): SimulationState {
  const ctx = useContext(SimulationContext);
  if (ctx === null) {
    throw new Error("useSimulation must be used inside <SimulationProvider>");
  }
  return ctx;
}

export { LIGHT_POLLUTION_LABELS };
