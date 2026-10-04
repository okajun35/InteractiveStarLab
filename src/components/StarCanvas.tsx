import { useEffect, useRef, useState } from "react";
import { useStarViewer } from "../state/context";
import { useSimulation } from "../state/simulation";
import { useObservation } from "../state/observation";
import { useSnapshots } from "../state/snapshots";
import { useScene, type SceneOverride } from "../state/scene";
import {
  drawScene,
  drawSun,
  type StarCanvasOptions,
} from "./starRender";
import {
  FLY_MS,
  hitTestScene,
  interpolateViewAngles,
  panViewAngles,
  reticlePulse,
  viewMoveNeeded,
  zoomFov,
  type SceneHit,
  type ViewAngles,
} from "../astronomy/interaction";
import { STAR_BY_ID } from "../astronomy/stars";
import { TWILIGHT_LABELS } from "../astronomy/twilight";
import type { Star } from "../types/astronomy";

export interface StarCanvasMetrics {
  visibleCount: number;
  inViewCount: number;
}

interface StarCanvasProps {
  width: number;
  height: number;
  /** Side-by-side compare override (spec §21–§22). */
  override?: SceneOverride;
  /** Panel title (left/right label in compare mode). */
  label?: string;
  /** Local wall-clock shown in the HUD (e.g. compare time basis, §27). */
  timeLabel?: string;
  /** Hide the snapshot button (used in compare mode). */
  compact?: boolean;
  onMetricsChange?: (metrics: StarCanvasMetrics) => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startView: ViewAngles;
  moved: boolean;
}

const DRAG_THRESHOLD_PX = 4;

export function StarCanvas({
  width,
  height,
  override,
  label,
  timeLabel,
  compact,
  onMetricsChange,
}: StarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const {
    settings,
    options,
    selectStar,
    selectedStar,
    selectedSun,
    selectSun,
    updateSettings,
    flyRequest,
    completeFly,
  } = useStarViewer();
  const { settings: sim, layers } = useSimulation();
  const { activeSite, activeMissionId } = useObservation();
  const { registerCanvas, captureSnapshot, downloadRecord } = useSnapshots();

  const scene = useScene(width, height, override);
  const [hover, setHover] = useState<{ x: number; y: number; hit: SceneHit } | null>(null);
  const [pulse, setPulse] = useState(1);

  useEffect(() => {
    if (compact) return;
    registerCanvas(canvasRef.current);
    return () => registerCanvas(null);
  }, [compact, registerCanvas]);

  // Keep latest data in refs so pointer handlers always read current values.
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const simRef = useRef(sim);
  simRef.current = sim;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const updateSettingsRef = useRef(updateSettings);
  updateSettingsRef.current = updateSettings;
  const completeFlyRef = useRef(completeFly);
  completeFlyRef.current = completeFly;
  const flyRequestRef = useRef(flyRequest);
  flyRequestRef.current = flyRequest;
  const dragRef = useRef<DragState | null>(null);
  const metricsKeyRef = useRef<string | null>(null);

  // Agent-directed fly-to: consume flyRequest, ease the camera to the target,
  // then ripple the reticle so the human sees where the agent pointed.
  useEffect(() => {
    const request = flyRequest;
    if (request === null) return;

    const patch = request.patch;
    const current = settingsRef.current;
    const from: ViewAngles = {
      azimuthDeg: current.azimuth,
      altitudeDeg: current.altitude,
      fovDeg: current.fieldOfView,
    };
    const to: ViewAngles = {
      azimuthDeg: patch.azimuth ?? from.azimuthDeg,
      altitudeDeg: patch.altitude ?? from.altitudeDeg,
      fovDeg: patch.fieldOfView ?? from.fovDeg,
    };

    if (!viewMoveNeeded(from, to)) {
      updateSettingsRef.current({
        azimuth: to.azimuthDeg,
        altitude: to.altitudeDeg,
        fieldOfView: to.fovDeg,
      });
      completeFlyRef.current(request.id);
      return;
    }

    let raf = 0;
    let arrived = false;
    const start = performance.now();
    const tick = (now: number) => {
      // A newer request or a human drag takes over: stop silently.
      if (flyRequestRef.current === null || flyRequestRef.current.id !== request.id) return;
      const elapsed = now - start;
      if (elapsed < FLY_MS) {
        const view = interpolateViewAngles(from, to, elapsed / FLY_MS);
        updateSettingsRef.current({
          azimuth: view.azimuthDeg,
          altitude: view.altitudeDeg,
          fieldOfView: view.fovDeg,
        });
      } else {
        if (!arrived) {
          arrived = true;
          updateSettingsRef.current({
            azimuth: to.azimuthDeg,
            altitude: to.altitudeDeg,
            fieldOfView: to.fovDeg,
          });
          completeFlyRef.current(request.id);
        }
        const next = reticlePulse(elapsed - FLY_MS);
        setPulse(next);
        if (next >= 1) return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [flyRequest]);

  // Wheel zoom needs a non-passive listener to suppress page scroll.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = settingsRef.current;
      const fov = zoomFov(current.fieldOfView, event.deltaY);
      if (fov !== current.fieldOfView) {
        updateSettingsRef.current({ fieldOfView: fov });
      }
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
      pulse,
    );

    const metricsKey = `${scene.visibleCount}:${scene.inViewCount}`;
    if (onMetricsChange !== undefined && metricsKeyRef.current !== metricsKey) {
      metricsKeyRef.current = metricsKey;
      onMetricsChange({ visibleCount: scene.visibleCount, inViewCount: scene.inViewCount });
    }

    // Sun (§15): always drawn when in view, even in "removed" mode.
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
    pulse,
  ]);

  const findHit = (px: number, py: number): SceneHit | null =>
    hitTestScene(sceneRef.current, px, py, {
      starsEnabled: optionsRef.current.stars,
      showHiddenStars: simRef.current.showHiddenStars,
    });

  const cancelFly = () => {
    const active = flyRequestRef.current;
    if (active !== null) completeFlyRef.current(active.id);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      startView: {
        azimuthDeg: settingsRef.current.azimuth,
        altitudeDeg: settingsRef.current.altitude,
        fovDeg: settingsRef.current.fieldOfView,
      },
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const drag = dragRef.current;
    if (drag !== null && drag.pointerId === e.pointerId) {
      const dx = px - drag.startX;
      const dy = py - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        drag.moved = true;
        cancelFly();
        setHover(null);
      }
      if (drag.moved) {
        const view = panViewAngles(drag.startView, dx, dy, height);
        updateSettingsRef.current({
          azimuth: view.azimuthDeg,
          altitude: view.altitudeDeg,
        });
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
    if (dragRef.current !== null) {
      dragRef.current = null;
    }
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
      // The existing viewer remains usable if PNG/IndexedDB is unavailable.
    }
  };

  return (
    <div className="star-canvas-wrap">
      {label && <div className="star-canvas-label">{label}</div>}
      <canvas
        ref={canvasRef}
        className="star-canvas"
        style={{ width, height, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
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
      {!compact && (
        <button
          type="button"
          className="snapshot-btn"
          onClick={takeSnapshot}
          title="Save a sky snapshot as PNG"
          aria-label="Save sky snapshot as PNG"
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
          Snapshot
        </button>
      )}
      <div className="canvas-hud" aria-hidden="true">
        <span className="canvas-hud-heading">
          {scene.heading}
          {label && timeLabel ? <span className="canvas-hud-time"> Local {timeLabel}</span> : ""}
          {!label && sim.daylightMode === "real" ? (
            <span className="canvas-hud-stage">
              {" "}
              <span>{TWILIGHT_LABELS[scene.twilightStage]}</span>
            </span>
          ) : ""}
        </span>
        <span className="canvas-hud-count">
          {label ? "" : `Visible ${scene.visibleCount} / In view ${scene.inViewCount}`}
        </span>
      </div>
    </div>
  );
}

function starById(id: string | null): Star | null {
  if (id === null) return null;
  return STAR_BY_ID.get(id) ?? null;
}
