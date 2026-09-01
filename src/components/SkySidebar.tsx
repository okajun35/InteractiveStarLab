import { SkyContextPanel } from "./SkyContextPanel";
import type { SkySceneMetrics } from "../sky/contextModel";

export function SkySidebar({
  metrics,
  onOpenManual,
}: {
  metrics: SkySceneMetrics | null;
  onOpenManual: () => void;
}) {
  return (
    <aside className="sky-sidebar sky-agent-window" aria-label="Agent Activity">
      <div className="sky-agent-window-header">
        <div>
          <span className="sky-agent-eyebrow">Agent</span>
          <h2>Activity</h2>
        </div>
        <button type="button" onClick={onOpenManual}>
          Manual
        </button>
      </div>
      <SkyContextPanel metrics={metrics} compact />
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
