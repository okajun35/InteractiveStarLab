import { useState } from "react";
import { useWebMcp } from "../state/webmcp";
import { useLocale } from "../i18n";
import { agentApiUrl } from "../agent/client";
import { ConsultPanel } from "./ConsultPanel";
import { AgentHarness } from "./AgentHarness";

type DockTab = "consult" | "external";

/**
 * Floating agent dock, mounted once at App level so the conversation survives
 * view changes. It presents the two agent doors as separate tabs: the in-app
 * "Ask the sky" consult (Bedrock, works everywhere) and the external-agent
 * doorway (WebMCP status + local tool harness). Both doors drive the same
 * shared tools — the small status line shows each door's connectivity.
 */
export function AgentDock() {
  const { availability } = useWebMcp();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DockTab>("consult");
  const consultReady = agentApiUrl() !== null;
  const externalReady = availability === "ready";

  if (!open) {
    return (
      <button
        type="button"
        className="agent-dock-fab"
        aria-label={t("dock.open")}
        onClick={() => setOpen(true)}
      >
        {t("consult.title")}
      </button>
    );
  }

  return (
    <section className="agent-dock" aria-label={t("dock.open")}>
      <div className="agent-dock-header">
        <div className="agent-dock-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "consult"}
            className={tab === "consult" ? "agent-dock-tab active" : "agent-dock-tab"}
            onClick={() => setTab("consult")}
          >
            {t("consult.title")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "external"}
            className={tab === "external" ? "agent-dock-tab active" : "agent-dock-tab"}
            onClick={() => setTab("external")}
          >
            {t("dock.tabExternal")}
          </button>
        </div>
        <button
          type="button"
          className="agent-dock-close"
          aria-label={t("dock.close")}
          onClick={() => setOpen(false)}
        >
          ×
        </button>
      </div>
      <div className="agent-dock-doors">
        <span className={consultReady ? "agent-dock-door ready" : "agent-dock-door"}>
          {t("dock.doorInapp")} · {t(consultReady ? "dock.doorOn" : "dock.doorOff")}
        </span>
        <span className={externalReady ? "agent-dock-door ready" : "agent-dock-door"}>
          {t("dock.doorExternal")} · {t(externalReady ? "dock.doorOn" : "dock.doorOff")}
        </span>
      </div>
      <div className="agent-dock-body" role="tabpanel">
        {tab === "consult" ? (
          <ConsultPanel />
        ) : (
          <div className="agent-dock-external">
            <p className="agent-dock-about">{t("dock.webmcp.about")}</p>
            <WebMcpBadge availability={availability} />
            <AgentHarness />
          </div>
        )}
      </div>
    </section>
  );
}

function WebMcpBadge({ availability }: { availability: ReturnType<typeof useWebMcp>["availability"] }) {
  const { t } = useLocale();
  const label = availability === "unknown"
    ? t("webmcp.checking")
    : availability === "ready"
      ? t("webmcp.ready")
      : t("webmcp.unavailable");
  return (
    <span className={`sky-status-badge sky-status-${availability}`}>
      <span className="sky-status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
