import { createContext, useContext, useMemo, useState } from "react";
import type {
  DisplayOptions,
  HorizontalStar,
  ObservationSettings,
  SkyView,
  Star,
} from "../types/astronomy";
import { CONSTELLATIONS, STARS } from "../astronomy/stars";
import { horizontalStars } from "../astronomy/coordinates";
import { buildSkyView } from "../astronomy/visibility";
import { fieldErrors, LIMITS, type FieldErrors } from "../astronomy/validation";

const DEFAULT_SETTINGS: ObservationSettings = {
  latitude: 35.6812,
  longitude: 139.7671,
  datetime: new Date(),
  azimuth: 180,
  altitude: 30,
  fieldOfView: 80,
};

const DEFAULT_OPTIONS: DisplayOptions = {
  stars: true,
  starNames: true,
  constellationLines: true,
  constellationNames: true,
};

const EMPTY_VIEW: SkyView = { stars: [], lines: [], labels: [], heading: "" };

export interface StarViewerState {
  settings: ObservationSettings;
  updateSettings: (patch: Partial<ObservationSettings>) => void;
  options: DisplayOptions;
  updateOptions: (patch: Partial<DisplayOptions>) => void;
  selectedStar: Star | null;
  selectStar: (star: Star | null) => void;
  selectedSun: boolean;
  selectSun: (selected: boolean) => void;
  errors: FieldErrors | null;
  horizontal: HorizontalStar[];
  version: number;
}

const StarViewerContext = createContext<StarViewerState | null>(null);

export function StarViewerProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<ObservationSettings>(
    () => ({ ...DEFAULT_SETTINGS }),
  );
  const [options, setOptions] = useState<DisplayOptions>(
    () => ({ ...DEFAULT_OPTIONS }),
  );
  const [selectedStar, setSelectedStar] = useState<Star | null>(null);
  const [selectedSun, setSelectedSun] = useState(false);
  const [version, setVersion] = useState(0);

  const errors = useMemo(() => fieldErrors(settings), [settings]);

  // Recomputed only when location/time/direction/FOV change (spec §27).
  const horizontal = useMemo(() => {
    if (errors) return [];
    try {
      return horizontalStars(settings, STARS);
    } catch {
      return [];
    }
  }, [settings, errors]);

  const value = useMemo<StarViewerState>(
    () => ({
      settings,
      updateSettings: (patch) => {
        setSettings((prev) => ({ ...prev, ...patch }));
        setVersion((v) => v + 1);
      },
      options,
      updateOptions: (patch) => setOptions((prev) => ({ ...prev, ...patch })),
      selectedStar,
      selectStar: (star) => {
        setSelectedStar(star);
        setSelectedSun(false);
      },
      selectedSun,
      selectSun: (selected) => {
        setSelectedSun(selected);
        setSelectedStar(null);
      },
      errors,
      horizontal,
      version,
    }),
    [settings, options, selectedStar, selectedSun, errors, horizontal, version],
  );

  return (
    <StarViewerContext.Provider value={value}>
      {children}
    </StarViewerContext.Provider>
  );
}

export function useStarViewer(): StarViewerState {
  const ctx = useContext(StarViewerContext);
  if (ctx === null) {
    throw new Error("useStarViewer must be used inside <StarViewerProvider>");
  }
  return ctx;
}

/** Projects the horizontal catalog to screen space for a given canvas size. */
export function useSkyView(width: number, height: number): SkyView {
  const { settings, horizontal } = useStarViewer();
  return useMemo(() => {
    if (width <= 0 || height <= 0) return EMPTY_VIEW;
    return buildSkyView(horizontal, CONSTELLATIONS, settings, width, height);
  }, [horizontal, settings, width, height]);
}

export { LIMITS };
