import { useState } from "react";
import { SkyContextPanel } from "./SkyContextPanel";
import { AgentHarness } from "./AgentHarness";
import { useLocale } from "../i18n";
import type { SkySceneMetrics } from "../sky/contextModel";

export function SkySidebar({
  metrics,
  onOpenManual,
}: {
  metrics: SkySceneMetrics | null;
  onOpenManual: () => void;
}) {
  const [open, setOpen] = useState(true);
  const { t } = useLocale();

  if (!open) {
    return (
      <button
        type="button"
        className="sky-agent-reopen"
        aria-label={t("agent.reopen")}
        onClick={() => setOpen(true)}
      >
        {t("agent.panel.eyebrow")}
      </button>
    );
  }

  return (
    <aside className="sky-sidebar sky-agent-window" aria-label={t("agent.panel.title")}>
      <div className="sky-agent-window-header">
        <div>
          <span className="sky-agent-eyebrow">{t("agent.panel.eyebrow")}</span>
          <h2>{t("agent.panel.title")}</h2>
        </div>
        <div className="sky-agent-window-actions">
          <button type="button" onClick={onOpenManual}>
            {t("agent.manual")}
          </button>
          <button
            type="button"
            className="sky-agent-close"
            aria-label={t("agent.close")}
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
        {t("agent.openManual")}
      </button>
    </aside>
  );
}
