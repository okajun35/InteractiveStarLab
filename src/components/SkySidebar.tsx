import { useState } from "react";
import { SkyContextPanel } from "./SkyContextPanel";
import { AgentHarness } from "./AgentHarness";
import type { SkySceneMetrics } from "../sky/contextModel";

export function SkySidebar({
  metrics,
  onOpenManual,
}: {
  metrics: SkySceneMetrics | null;
  onOpenManual: () => void;
}) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        className="sky-agent-reopen"
        aria-label="Show agent activity panel"
        onClick={() => setOpen(true)}
      >
        Agent
      </button>
    );
  }

  return (
    <aside className="sky-sidebar sky-agent-window" aria-label="Agent Activity">
      <div className="sky-agent-window-header">
        <div>
          <span className="sky-agent-eyebrow">Agent</span>
          <h2>Activity</h2>
        </div>
        <div className="sky-agent-window-actions">
          <button type="button" onClick={onOpenManual}>
            Manual
          </button>
          <button
            type="button"
            className="sky-agent-close"
            aria-label="Close agent activity panel"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
      </div>
      <SkyContextPanel metrics={metrics} compact />
      <AgentHarness />
      <button
        type="button"
        className="sky-agent-manual-link"
        onClick={onOpenManual}
      >
        Open manual controls
      </button>
    </aside>
  );
}
