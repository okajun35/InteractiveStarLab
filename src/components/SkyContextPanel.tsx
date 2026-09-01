import { useEffect, useMemo, useState } from "react";
import { useStarViewer } from "../state/context";
import { useSimulation } from "../state/simulation";
import { useObservation } from "../state/observation";
import { useWebMcp } from "../state/webmcp";
import { useAgentActivity } from "../state/agentActivity";
import {
  buildSkyContextModel,
  buildCurrentSkyRows,
  valuesEqual,
  type SkyContextModel,
  type SkyContextRow,
  type SkySceneMetrics,
} from "../sky/contextModel";

export function SkyContextPanel({ metrics, compact = false }: { metrics: SkySceneMetrics | null; compact?: boolean }) {
  const { settings: observation, options } = useStarViewer();
  const { settings: simulation, layers, compare } = useSimulation();
  const { activeSite } = useObservation();
  const { availability } = useWebMcp();
  const { skyActivity } = useAgentActivity();
  const [now, setNow] = useState(() => Date.now());
  const model = useMemo<SkyContextModel>(
    () => buildSkyContextModel({
      activeSite,
      observation,
      simulation,
      layers,
      displayOptions: options,
      metrics,
      compareLabel: compare?.changedLabel ?? null,
    }),
    [activeSite, observation, simulation, layers, options, metrics, compare],
  );

  useEffect(() => {
    if (skyActivity === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next - skyActivity.updatedAt >= 5000) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [skyActivity]);

  const effectiveChanges = skyActivity?.changes ?? [];
  const currentSkyRows = buildCurrentSkyRows(model, skyActivity);
  const announcement = skyActivity === null || effectiveChanges.length === 0
    ? ""
    : `WebMCP updated ${effectiveChanges.length} sky setting${effectiveChanges.length === 1 ? "" : "s"}: ${effectiveChanges.map((change) => rowForChange(model, change.field)?.label ?? change.field).join(", ")}.`;

  return (
    <section className={compact ? "sky-context-panel sky-context-panel-compact" : "sky-context-panel"} aria-labelledby="live-context-title">
      <div className="sky-context-status-row">
        <h2 id="live-context-title">{compact ? "Current sky" : "Live Observation Context"}</h2>
        <StatusBadge availability={availability} />
      </div>
      {availability === "unavailable" || availability === "error" ? (
        <p className="sky-fallback-note">Manual controls are still available.</p>
      ) : null}
      {skyActivity !== null && (
        <div className="sky-activity-summary" aria-label="Latest WebMCP activity">
          <strong>Updated via WebMCP · {relativeActivityTime(skyActivity.updatedAt, now)}</strong>
          {effectiveChanges.length > 0 && (
            <span>{effectiveChanges.length} setting{effectiveChanges.length === 1 ? "" : "s"} updated</span>
          )}
        </div>
      )}
      <div className="sky-context-live-region" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {compact ? (
          <ContextSection title="Current sky" rows={currentSkyRows} activity={skyActivity} now={now} />
      ) : (
        <>
          <ContextSection title="Observation Context" rows={model.observation} activity={skyActivity} now={now} />
          <ContextSection title="Visibility" rows={model.visibility} activity={skyActivity} now={now} />
          <ContextSection title="Display" rows={model.display} activity={skyActivity} now={now} />
        </>
      )}
      {model.compareLabel !== null && (
        <div className="sky-context-compare-row">
          <span>View Mode</span>
          <strong>Comparison — {model.compareLabel}</strong>
        </div>
      )}
    </section>
  );
}

function StatusBadge({ availability }: { availability: ReturnType<typeof useWebMcp>["availability"] }) {
  const label = availability === "unknown"
    ? "Checking WebMCP…"
    : availability === "ready"
      ? "WebMCP ready"
      : "WebMCP unavailable";
  return (
    <span className={`sky-status-badge sky-status-${availability}`}>
      <span className="sky-status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

function ContextSection({
  title,
  rows,
  activity,
  now,
}: {
  title: string;
  rows: SkyContextRow[];
  activity: ReturnType<typeof useAgentActivity>["skyActivity"];
  now: number;
}) {
  return (
    <section className="sky-context-section" aria-labelledby={`sky-context-${title.toLowerCase().replace(/ /g, "-")}`}>
      <h3 id={`sky-context-${title.toLowerCase().replace(/ /g, "-")}`}>{title}</h3>
      <dl className="sky-context-list">
        {rows.map((row) => {
          const change = activity?.changes.find((item) => item.field === row.field);
          const elapsed = activity === null ? Infinity : now - activity.updatedAt;
          const currentMatches = change === undefined || valuesEqual(row.raw, change.after);
          const highlighted = change !== undefined && currentMatches && elapsed < 2500;
          const showChange = change !== undefined && currentMatches && elapsed < 5000;
          return (
            <div className={highlighted ? "sky-context-row changed" : "sky-context-row"} key={row.field}>
              <dt>{row.label}</dt>
              <dd>
                <span>{row.value}</span>
                {showChange && <small className="sky-context-diff">Updated via WebMCP</small>}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function rowForChange(model: SkyContextModel, field: Parameters<typeof valuesEqual>[0] & string) {
  return [...model.observation, ...model.visibility, ...model.display].find((row) => row.field === field);
}

function relativeActivityTime(timestamp: number, now: number): string {
  if (now - timestamp < 60_000) return "just now";
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(timestamp);
}
