import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import {
  valuesEqual,
  type SkyFieldChange,
  type SkySceneMetrics,
  type SkyWebMcpActivity,
} from "../sky/contextModel";

export interface PlanWebMcpActivity {
  id: string;
  source: "webmcp";
  kind: "mission-created";
  toolName: "create_observation_plan";
  missionId: string;
  targetCount: number;
  siteName: string;
  createdAt: number;
}

export interface AgentActivityState {
  skyActivity: SkyWebMcpActivity | null;
  planActivity: PlanWebMcpActivity | null;
  reportSkyMutation: (report: { toolName: string; changes: SkyFieldChange[]; at?: number }) => void;
  reportPlanMissionCreated: (activity: { missionId: string; targetCount: number; siteName: string }) => void;
  reportSceneMetrics: (metrics: SkySceneMetrics) => void;
}

const AgentActivityContext = createContext<AgentActivityState | null>(null);

function activityId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function mergeChanges(changes: SkyFieldChange[], next: SkyFieldChange[]): SkyFieldChange[] {
  const merged = changes.map((change) => ({ ...change }));
  for (const change of next) {
    const existing = merged.find((item) => item.field === change.field);
    if (existing === undefined) {
      if (!valuesEqual(change.before, change.after)) merged.push({ ...change });
      continue;
    }
    existing.after = change.after;
    existing.derived = existing.derived || change.derived;
    if (valuesEqual(existing.before, existing.after)) {
      merged.splice(merged.indexOf(existing), 1);
    }
  }
  return merged;
}

export function mergeSkyActivity(
  current: SkyWebMcpActivity | null,
  report: { toolName: string; changes: SkyFieldChange[]; at: number },
): SkyWebMcpActivity {
  const canBatch = current !== null && report.at - current.updatedAt <= 2000;
  if (!canBatch) {
    return {
      id: activityId("sky"),
      source: "webmcp",
      toolNames: [report.toolName],
      startedAt: report.at,
      updatedAt: report.at,
      changes: mergeChanges([], report.changes),
    };
  }
  return {
    ...current,
    toolNames: current.toolNames.includes(report.toolName)
      ? current.toolNames
      : [...current.toolNames, report.toolName],
    updatedAt: report.at,
    changes: mergeChanges(current.changes, report.changes),
  };
}

function metricsEqual(a: SkySceneMetrics | null, b: SkySceneMetrics): boolean {
  return a?.mode === b.mode
    && a?.visibleCount === b.visibleCount
    && a?.baseCount === b.baseCount
    && a?.changedCount === b.changedCount;
}

export function AgentActivityProvider({ children }: { children: React.ReactNode }) {
  const [skyActivity, setSkyActivity] = useState<SkyWebMcpActivity | null>(null);
  const [planActivity, setPlanActivity] = useState<PlanWebMcpActivity | null>(null);
  const latestMetricsRef = useRef<SkySceneMetrics | null>(null);
  const pendingMetricsRef = useRef<SkySceneMetrics | null>(null);

  const reportSkyMutation = useCallback((report: { toolName: string; changes: SkyFieldChange[]; at?: number }) => {
    const at = report.at ?? Date.now();
    pendingMetricsRef.current = latestMetricsRef.current;
    setSkyActivity((current) => mergeSkyActivity(current, { ...report, at }));
  }, []);

  const reportSceneMetrics = useCallback((metrics: SkySceneMetrics) => {
    latestMetricsRef.current = metrics;
    const pending = pendingMetricsRef.current;
    if (pending === null || metricsEqual(pending, metrics)) return;
    pendingMetricsRef.current = null;
    setSkyActivity((current) => {
      if (current === null) return current;
      const before = pending.mode === "compare"
        ? { base: pending.baseCount ?? null, changed: pending.changedCount ?? null }
        : pending.visibleCount ?? null;
      const after = metrics.mode === "compare"
        ? { base: metrics.baseCount ?? null, changed: metrics.changedCount ?? null }
        : metrics.visibleCount ?? null;
      return {
        ...current,
        changes: mergeChanges(current.changes, [{ field: "visibleStars", before, after, derived: true }]),
      };
    });
  }, []);

  const reportPlanMissionCreated = useCallback((activity: { missionId: string; targetCount: number; siteName: string }) => {
    setPlanActivity({
      ...activity,
      id: activityId("plan"),
      source: "webmcp",
      kind: "mission-created",
      toolName: "create_observation_plan",
      createdAt: Date.now(),
    });
  }, []);

  const value = useMemo<AgentActivityState>(
    () => ({ skyActivity, planActivity, reportSkyMutation, reportPlanMissionCreated, reportSceneMetrics }),
    [skyActivity, planActivity, reportSkyMutation, reportPlanMissionCreated, reportSceneMetrics],
  );

  return <AgentActivityContext.Provider value={value}>{children}</AgentActivityContext.Provider>;
}

export function useAgentActivity(): AgentActivityState {
  const context = useContext(AgentActivityContext);
  if (context === null) throw new Error("useAgentActivity must be used inside <AgentActivityProvider>");
  return context;
}
