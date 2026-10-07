import { useEffect, useRef, useState } from "react";
import { useStarViewer } from "../state/context";
import { useSimulation } from "../state/simulation";
import { useObservation } from "../state/observation";
import { useSnapshots } from "../state/snapshots";
import { useDomeScene } from "../state/scene";
import {
  drawScene,
  drawSun,
  type StarCanvasOptions,
} from "./starRender";
import { hitTestScene, type SceneHit } from "../astronomy/interaction";
import {
  panDomeView,
  zoomDomeView,
  type DomeView,
} from "../astronomy/dome";
import { STAR_BY_ID } from "../astronomy/stars";
import type { Star } from "../types/astronomy";
import { useLocale, type MessageKey } from "../i18n";
import { constellationDisplayName } from "../data/constellationNamesJa";
import type { StarCanvasMetrics } from "./StarCanvas";

interface DomeCanvasProps {
  width: number;
  height: number;
  onMetricsChange?: (metrics: StarCanvasMetrics) => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  moved: boolean;
}

const DRAG_THRESHOLD_PX = 4;

/**
 * The whole-sky stereographic dome. Drag spins the dome, the wheel zooms in,
 * double-click resets the view. All dome view state is local — the windowed
 * camera angles (azimuth/altitude/fov) are never touched here.
 */
export function DomeCanvas({ width, height, onMetricsChange }: DomeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const {
    settings,
    options,
    selectStar,
    selectedStar,
    selectedSun,
    selectSun,
    recordSkyAction,
  } = useStarViewer();
  const { settings: sim, layers } = useSimulation();
  const { activeSite, activeMissionId } = useObservation();
  const { registerCanvas, captureSnapshot, downloadRecord } = useSnapshots();
  const { t, locale } = useLocale();

  const [domeView, setDomeView] = useState<DomeView>(() => ({
    rotationDeg: settings.azimuth,
    zoom: 1,
  }));
  const scene = useDomeScene(width, height, domeView);
  const [hover, setHover] = useState<{ x: number; y: number; hit: SceneHit } | null>(null);

  useEffect(() => {
    registerCanvas(canvasRef.current);
    return () => registerCanvas(null);
  }, [registerCanvas]);

  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const simRef = useRef(sim);
  simRef.current = sim;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const dragRef = useRef<DragState | null>(null);
  const metricsKeyRef = useRef<string | null>(null);
  const domeViewRef = useRef(domeView);
  domeViewRef.current = domeView;
  const recordRef = useRef(recordSkyAction);
  recordRef.current = recordSkyAction;
  const zoomLogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setDomeView((prev) => zoomDomeView(prev, event.deltaY));
      if (zoomLogTimerRef.current !== null) clearTimeout(zoomLogTimerRef.current);
      zoomLogTimerRef.current = setTimeout(() => {
        zoomLogTimerRef.current = null;
        recordRef.current("zoom", `Zoomed dome to ×${domeViewRef.current.zoom.toFixed(1)}`);
      }, 600);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawScene(
      ctx,
      width,
      height,
      scene,
      options as StarCanvasOptions,
      sim.showHiddenStars,
      selectedStar?.id,
      undefined,
      (label) => constellationDisplayName(label.constellationId, label.name, locale),
    );

    const metricsKey = `${scene.visibleCount}:${scene.inViewCount}`;
    if (onMetricsChange !== undefined && metricsKeyRef.current !== metricsKey) {
      metricsKeyRef.current = metricsKey;
      onMetricsChange({ visibleCount: scene.visibleCount, inViewCount: scene.inViewCount });
    }

    if (scene.sunX !== null && scene.sunY !== null) {
      drawSun(ctx, scene.sunX, scene.sunY, selectedSun ? 18 : 14);
      if (selectedSun) {
        ctx.strokeStyle = "rgba(250, 204, 21, 0.9)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(scene.sunX, scene.sunY, 22, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }, [
    scene,
    options,
    sim.showHiddenStars,
    selectedStar,
    selectedSun,
    width,
    height,
    onMetricsChange,
    locale,
  ]);

  const findHit = (px: number, py: number): SceneHit | null =>
    hitTestScene(sceneRef.current, px, py, {
      starsEnabled: optionsRef.current.stars,
      showHiddenStars: simRef.current.showHiddenStars,
    });

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const drag = dragRef.current;
    if (drag !== null && drag.pointerId === e.pointerId) {
      const dx = e.clientX - drag.startX;
      if (!drag.moved && Math.abs(dx) >= DRAG_THRESHOLD_PX) {
        drag.moved = true;
        setHover(null);
      }
      if (drag.moved) {
        // Rotation accumulates from this event's horizontal delta.
        setDomeView((prev) => panDomeView(prev, e.movementX, height));
        e.currentTarget.style.cursor = "grabbing";
        return;
      }
    }

    const hit = findHit(px, py);
    e.currentTarget.style.cursor = hit ? "pointer" : "grab";
    setHover(hit === null ? null : { x: px, y: py, hit });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag === null || drag.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (drag.moved) {
      e.currentTarget.style.cursor = "grab";
      recordRef.current(
        "pan",
        `Rotated dome to ${Math.round(domeViewRef.current.rotationDeg)}°`,
      );
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const hit = findHit(e.clientX - rect.left, e.clientY - rect.top);
    if (hit === null) return;
    if (hit.kind === "sun") {
      selectSun(true);
      return;
    }
    if (hit.kind === "star") {
      selectStar(starById(hit.id));
    }
  };

  const onPointerLeave = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.style.cursor = "default";
    setHover(null);
    dragRef.current = null;
  };

  const takeSnapshot = async () => {
    try {
      const record = await captureSnapshot({
        site: activeSite,
        dateTime: settings.datetime.toISOString(),
        ...(activeMissionId === null ? {} : { missionId: activeMissionId }),
        view: {
          azimuth: settings.azimuth,
          altitude: settings.altitude,
          fieldOfView: settings.fieldOfView,
        },
        simulation: sim,
        layers,
        displayOptions: options,
        heading: scene.heading,
      });
      downloadRecord(record);
    } catch {
      // The viewer remains usable if PNG/IndexedDB is unavailable.
    }
  };

  return (
    <div className="star-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="star-canvas"
        style={{ width, height, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={() => {
          setDomeView({ rotationDeg: settings.azimuth, zoom: 1 });
          recordRef.current("reset", "Reset dome view");
        }}
      />
      {hover !== null && (
        <div
          className="star-canvas-tooltip"
          style={{
            left: Math.min(hover.x + 12, width - 140),
            top: Math.max(hover.y - 30, 4),
          }}
        >
          {hover.hit.label}
          {hover.hit.kind === "star" ? ` · mag ${hover.hit.magnitude.toFixed(1)}` : ""}
        </div>
      )}
      <button
        type="button"
        className="snapshot-btn"
        onClick={takeSnapshot}
        title={t("canvas.snapshotTitle")}
        aria-label={t("canvas.snapshotTitle")}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        {t("canvas.snapshot")}
      </button>
      <div className="canvas-hud" aria-hidden="true">
        <span className="canvas-hud-heading">
          {scene.heading}
          {sim.daylightMode === "real" ? (
            <span className="canvas-hud-stage">
              {" "}
              <span>{t(`twilight.${scene.twilightStage}` as MessageKey)}</span>
            </span>
          ) : ""}
        </span>
        <span className="canvas-hud-count">
          {t("canvas.visibleInDome", { visible: scene.visibleCount, total: scene.inViewCount })}
        </span>
      </div>
    </div>
  );
}

function starById(id: string | null): Star | null {
  if (id === null) return null;
  return STAR_BY_ID.get(id) ?? null;
}
