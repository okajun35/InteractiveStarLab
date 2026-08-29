import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { StarViewerProvider } from "./state/context";
import { useStarViewer } from "./state/context";
import { SimulationProvider, useSimulation } from "./state/simulation";
import { ObservationProvider } from "./state/observation";
import { useObservation } from "./state/observation";
import { StarCanvas } from "./components/StarCanvas";
import { ObservationPanel } from "./components/ObservationPanel";
import { MagnitudeLayers } from "./components/MagnitudeLayers";
import { EnvironmentPanel } from "./components/EnvironmentPanel";
import { ObjectInfo } from "./components/ObjectInfo";
import { ExperimentPanel } from "./components/ExperimentPanel";
import { ComparePanel } from "./components/ComparePanel";
import { ObservationPlanScreen } from "./components/observation/ObservationPlanScreen";
import { ObservationRunScreen } from "./components/observation/ObservationRunScreen";
import { ObservationResultsScreen } from "./components/observation/ObservationResultsScreen";
import { ObservationHistoryScreen } from "./components/observation/ObservationHistoryScreen";
import { WebMcpStatus } from "./components/WebMcpStatus";
import { AuthPanel } from "./components/AuthPanel";
import { PLACE_PRESETS } from "./astronomy/directions";
import { localTimeOf } from "./astronomy/timezones";
import type { SceneOverride } from "./state/scene";
import { WebMcpProvider } from "./state/webmcp";
import { NavigationProvider, useNavigation, type AppView } from "./state/navigation";
import { SnapshotProvider } from "./state/snapshots";
import { GuideProvider, useGuides } from "./state/guides";
import { SnapshotScreen } from "./components/snapshots/SnapshotScreen";
import { ObservationGuideScreen } from "./components/guides/ObservationGuideScreen";
import { PRIMARY_NAV_ITEMS, RECORD_NAV_ITEMS, isRecordView } from "./navigation/navigationModel";
import { AuthProvider } from "./state/auth";

function useElementSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size } as const;
}

/** Main canvas area — single or side-by-side compare (§22). */
function SkyArea() {
  const { ref, width, height } = useElementSize();
  const { compare } = useSimulation();
  const { settings: observation } = useStarViewer();
  const observationDatetime = observation.datetime;

  const baseOverride: SceneOverride = useMemo(
    () => ({
      observation: compare?.baseObservationOverride,
      simulation: compare?.baseSimulation,
    }),
    [compare],
  );
  const changedOverride: SceneOverride = useMemo(
    () => ({
      observation: compare?.changedObservationOverride,
      simulation: compare?.changedSimulation,
    }),
    [compare],
  );

  if (width <= 0 || height <= 0) {
    return (
      <div className="app-canvas" ref={ref}>
        <div className="app-canvas-placeholder">読み込み中…</div>
      </div>
    );
  }

  if (compare) {
    const half = Math.floor(width / 2);
    // Local wall-clock per side (spec §27 time basis: same-local-time makes
    // both labels identical; same-utc-instant shows the real wall-clock gap).
    const tokyo = PLACE_PRESETS.find((p) => p.id === "tokyo")!;
    const sydney = PLACE_PRESETS.find((p) => p.id === "sydney")!;
    const baseDatetime = compare.baseObservationOverride?.datetime ?? observationDatetime;
    const changedDatetime =
      compare.changedObservationOverride?.datetime ?? observationDatetime;
    return (
      <div className="app-canvas" ref={ref}>
        <div className="compare-split">
          <div className="compare-half">
            <StarCanvas
              width={half}
              height={height}
              override={baseOverride}
              label={compare.baseLabel}
              timeLabel={
                compare.kind === "location" ? localTimeOf(baseDatetime, tokyo) : undefined
              }
              compact
            />
          </div>
          <div className="compare-divider" aria-hidden="true" />
          <div className="compare-half">
            <StarCanvas
              width={half}
              height={height}
              override={changedOverride}
              label={compare.changedLabel}
              timeLabel={
                compare.kind === "location"
                  ? localTimeOf(changedDatetime, sydney)
                  : undefined
              }
              compact
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-canvas" ref={ref}>
      <StarCanvas width={width} height={height} />
    </div>
  );
}

function SkyWorkspace() {
  return (
    <>
      <div className="app-main">
        <aside className="app-side">
          <ObservationPanel />
          <MagnitudeLayers />
          <EnvironmentPanel />
          <ExperimentPanel />
          <ComparePanel />
        </aside>

        <main className="app-main-content">
          <SkyArea />
        </main>
      </div>

      <footer className="app-footer">
        <ObjectInfo />
      </footer>
    </>
  );
}

function AppShell() {
  const { view, setView } = useNavigation();
  const { activeMissionId, missions } = useObservation();
  const { selectedGuide, getGuideForMission, prepareGuide, selectGuide, generatePdf } = useGuides();
  const [recordsOpen, setRecordsOpen] = useState(false);
  const recordsMenuRef = useRef<HTMLDivElement | null>(null);
  const navigate = (nextView: AppView) => {
    setView(nextView);
    setRecordsOpen(false);
  };

  useEffect(() => {
    if (!recordsOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !recordsMenuRef.current?.contains(target)) {
        setRecordsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRecordsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [recordsOpen]);

  const recordsActive = isRecordView(view);
  const activeMission = activeMissionId === null ? null : missions.find((mission) => mission.id === activeMissionId) ?? null;
  const activeGuide = activeMission ? getGuideForMission(activeMission.id) : selectedGuide;
  const openGuide = () => {
    if (activeMission) {
      const existing = getGuideForMission(activeMission.id);
      if (existing) selectGuide(existing.descriptor.guideId);
      else prepareGuide(activeMission.id);
    }
    setView("guide");
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-topline">
          <h1>
            <span className="en">Interactive star Lab</span> インタラクティブ星空ラボ
            <span className="app-header-sub">
              <span className="en">Explore the sky</span> — 空の条件を変えて観察する
            </span>
          </h1>
          <WebMcpStatus />
          <AuthPanel />
          <nav className="app-nav" aria-label="アプリケーション">
            <div className="app-nav-primary">
              {PRIMARY_NAV_ITEMS.map((item) => (
                <button
                  type="button"
                  className={view === item.view ? "app-nav-btn active" : "app-nav-btn"}
                  aria-current={view === item.view ? "page" : undefined}
                  onClick={() => navigate(item.view)}
                  key={item.view}
                >
                  <span className="en">{item.english}</span> {item.japanese}
                </button>
              ))}
            </div>
            <div className="app-nav-records" ref={recordsMenuRef}>
              <button
                type="button"
                className={recordsActive ? "app-nav-btn app-nav-records-toggle active" : "app-nav-btn app-nav-records-toggle"}
                aria-current={recordsActive ? "page" : undefined}
                aria-haspopup="menu"
                aria-expanded={recordsOpen}
                onClick={() => setRecordsOpen((open) => !open)}
              >
                <span className="en">Records</span> 記録 <span className="app-nav-chevron" aria-hidden="true">⌄</span>
              </button>
              {recordsOpen && (
                <div className="app-nav-menu" role="menu" aria-label="記録">
                  {RECORD_NAV_ITEMS.map((item) => (
                    <button
                      type="button"
                      role="menuitem"
                      className={view === item.view ? "app-nav-menu-item active" : "app-nav-menu-item"}
                      aria-current={view === item.view ? "page" : undefined}
                      onClick={() => navigate(item.view)}
                      key={item.view}
                    >
                      <span className="en">{item.english}</span> {item.japanese}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </nav>
        </div>
      </header>

      {view === "plan" ? (
        <ObservationPlanScreen
          onOpenSky={() => setView("sky")}
          onOpenObserve={() => setView("observe")}
        />
      ) : view === "observe" ? (
        <ObservationRunScreen
          onOpenPlan={() => setView("plan")}
          onOpenResults={() => setView("results")}
          onOpenGuide={openGuide}
          hasGuide={activeMission !== null && getGuideForMission(activeMission.id) !== null}
        />
      ) : view === "results" ? (
        <ObservationResultsScreen
          onOpenPlan={() => setView("plan")}
          onOpenHistory={() => setView("history")}
          onOpenSky={() => setView("sky")}
        />
      ) : view === "history" ? (
        <ObservationHistoryScreen
          onOpenResults={() => setView("results")}
          onOpenPlan={() => setView("plan")}
        />
      ) : view === "snapshots" ? (
        <SnapshotScreen />
      ) : view === "guide" ? (
        <ObservationGuideScreen guide={activeGuide} onOpenObserve={() => setView("observe")} onGeneratePdf={generatePdf} />
      ) : (
        <SkyWorkspace />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StarViewerProvider>
        <SimulationProvider>
          <ObservationProvider>
            <NavigationProvider>
              <GuideProvider>
                <SnapshotProvider>
                  <WebMcpProvider>
                    <AppShell />
                  </WebMcpProvider>
                </SnapshotProvider>
              </GuideProvider>
            </NavigationProvider>
          </ObservationProvider>
        </SimulationProvider>
      </StarViewerProvider>
    </AuthProvider>
  );
}
