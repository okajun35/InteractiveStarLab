import { useEffect, useRef } from "react";
import { useStarViewer } from "../state/context";
import { useSimulation } from "../state/simulation";
import { useObservation } from "../state/observation";
import { useSnapshots } from "../state/snapshots";
import { useScene, type SceneOverride } from "../state/scene";
import { starRadius } from "./starSize";
import {
  drawScene,
  drawSun,
  type StarCanvasOptions,
} from "./starRender";
import { STAR_BY_ID } from "../astronomy/stars";
import { TWILIGHT_LABELS } from "../astronomy/twilight";
import type { Star } from "../types/astronomy";

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
}

export function StarCanvas({
  width,
  height,
  override,
  label,
  timeLabel,
  compact,
}: StarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const {
    settings,
    options,
    selectStar,
    selectedStar,
    selectedSun,
    selectSun,
  } = useStarViewer();
  const { settings: sim, layers } = useSimulation();
  const { activeSite, activeMissionId } = useObservation();
  const { registerCanvas, captureSnapshot, downloadRecord } = useSnapshots();

  const scene = useScene(width, height, override);

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
    );

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
  ]);

  const findHit = (px: number, py: number): { kind: "star" | "sun"; id?: string } | null => {
    const s = sceneRef.current;
    const simState = simRef.current;
    const opts = optionsRef.current;

    // Sun first (bigger target, spec §15).
    if (s.sunX !== null && s.sunY !== null && Math.hypot(s.sunX - px, s.sunY - py) <= 26) {
      return { kind: "sun" };
    }
    if (!opts.stars) return null;

    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const star of s.stars) {
      if (star.status.state === "disabled") continue;
      if (star.status.state === "hidden" && !simState.showHiddenStars) continue;
      const dist = Math.hypot(star.x - px, star.y - py);
      const reach = starRadius(star.star.magnitude) + 6;
      if (dist <= reach && dist < bestDist) {
        bestId = star.star.id;
        bestDist = dist;
      }
    }
    return bestId ? { kind: "star", id: bestId } : null;
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
        style={{ width, height }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const hit = findHit(e.clientX - rect.left, e.clientY - rect.top);
          e.currentTarget.style.cursor = hit ? "pointer" : "default";
        }}
        onPointerLeave={(e) => {
          e.currentTarget.style.cursor = "default";
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const hit = findHit(e.clientX - rect.left, e.clientY - rect.top);
          if (hit === null) return;
          if (hit.kind === "sun") {
            selectSun(true);
            return;
          }
          selectStar(starById(hit.id ?? null));
        }}
      />
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
