import { useEffect, useState } from "react";
import { STAR_BY_ID } from "../../astronomy/stars";
import { formatDirection } from "../../sky/contextModel";
import { formatMissionDateTime } from "../../observation/missionView";
import type { ObservationMission } from "../../types/observation";
import { RecoveryCodePanel } from "./RecoveryCodePanel";
import { useAgentActivity } from "../../state/agentActivity";
import { useWebMcp } from "../../state/webmcp";

export function ObservationPlanSummary({
  mission,
  recoveryCode,
  onClearRecoveryCode,
  onShowTargetSky,
  onStartObserving,
  onEdit,
  manualOpen,
}: {
  mission: ObservationMission;
  recoveryCode: string | null;
  onClearRecoveryCode: () => void;
  onShowTargetSky: () => void;
  onStartObserving: () => void;
  onEdit: () => void;
  manualOpen: boolean;
}) {
  const { planActivity } = useAgentActivity();
  const { availability } = useWebMcp();
  const [now, setNow] = useState(() => Date.now());
  const attributed = planActivity?.missionId === mission.id ? planActivity : null;
  useEffect(() => {
    if (attributed === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next - attributed.createdAt >= 5000) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [attributed]);
  const highlighted = attributed !== null && now - attributed.createdAt < 2500;
  const primaryTarget = mission.targets[0];
  const hasCatalogTarget = primaryTarget !== undefined && STAR_BY_ID.has(primaryTarget.starId);

  return (
    <>
      <section className={highlighted ? "plan-summary plan-summary-highlighted" : "plan-summary"} aria-labelledby="observation-plan-title">
        <div className="workflow-hero plan-summary-hero">
          <div>
            <span className="en">Active Mission</span>
            <h1 id="observation-plan-title">Observation Plan</h1>
            {attributed !== null && <p className="plan-activity">Created via WebMCP · {relativeTime(attributed.createdAt, now)}<br />{attributed.targetCount} targets selected for {attributed.siteName}</p>}
            {attributed !== null && <span className="plan-live-announcement" aria-live="polite" aria-atomic="true">WebMCP created an observation Mission with {attributed.targetCount} targets.</span>}
          </div>
          <span className={`sky-status-badge sky-status-${availability}`}><span className="sky-status-dot" aria-hidden="true" />{availability === "unknown" ? "Checking WebMCP…" : availability === "ready" ? "WebMCP ready" : "WebMCP unavailable"}</span>
        </div>

        <section className="plan-context-card" aria-labelledby="mission-context-title">
          <h2 id="mission-context-title">Mission context</h2>
          <dl className="mission-context-list">
            <ContextRow label="Mission" value={mission.id} selectable />
            <ContextRow label="Site" value={mission.siteSnapshot.name} />
            <ContextRow label="Coordinates" value={`${mission.siteSnapshot.latitude.toFixed(4)}, ${mission.siteSnapshot.longitude.toFixed(4)}`} />
            <ContextRow label="Date & Time" value={formatMissionDateTime(mission.dateTime, mission)} />
            <ContextRow label="Magnitude Limit" value={`Up to magnitude ${mission.maxMagnitude}`} />
            <ContextRow label="Targets" value={`${mission.targets.length} stars`} />
            <ContextRow label="Created" value={formatCreatedAt(mission.createdAt)} />
          </dl>
        </section>

        <section className="plan-targets-section" aria-labelledby="plan-targets-title">
          <h2 id="plan-targets-title">Targets</h2>
          <ul className="plan-target-list">
            {mission.targets.map((target, index) => {
              const star = STAR_BY_ID.get(target.starId);
              return (
                <li key={`${target.starId}-${index}`} className={highlighted ? "plan-target-card plan-target-highlighted" : "plan-target-card"}>
                  <div className="plan-target-card-heading">
                    <div>
                      <h3>{star?.name ?? target.starId}</h3>
                      {index === 0 && <span className="primary-target-label">Primary target</span>}
                    </div>
                    <strong>{target.predictedVisible ? "Visible" : "Not visible"}</strong>
                  </div>
                  <dl className="plan-target-facts">
                    <ContextRow label="Magnitude" value={target.predictedMagnitude.toFixed(2)} />
                    <ContextRow label="Altitude" value={`${Math.round(target.predictedAltitude)}°`} />
                    <ContextRow label="Direction" value={formatDirection(target.predictedAzimuth)} />
                    <ContextRow label="Prediction" value={target.predictedVisible ? "Visible" : "Not visible"} />
                  </dl>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="plan-actions">
          <button type="button" className="primary" disabled={!hasCatalogTarget} onClick={onShowTargetSky}>Show target sky</button>
          <button type="button" onClick={onStartObserving}>Start observing</button>
          <button type="button" aria-expanded={manualOpen} aria-controls="plan-manual-editor" onClick={onEdit}>{manualOpen ? "Done editing" : "Edit manually"}</button>
        </div>
        {!hasCatalogTarget && <p className="workflow-note">The target Sky is unavailable because this Mission has no matching catalog star.</p>}
      </section>
      {recoveryCode !== null && <RecoveryCodePanel recoveryCode={recoveryCode} clearRecoveryCode={onClearRecoveryCode} />}
    </>
  );
}

function ContextRow({ label, value, selectable = false }: { label: string; value: string; selectable?: boolean }) {
  return <div className="mission-context-row"><dt>{label}</dt><dd className={selectable ? "selectable-value" : undefined}>{value}</dd></div>;
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function relativeTime(timestamp: number, now: number): string {
  return now - timestamp < 60_000 ? "just now" : formatCreatedAt(new Date(timestamp).toISOString());
}
