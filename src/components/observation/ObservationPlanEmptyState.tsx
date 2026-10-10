import { useWebMcp } from "../../state/webmcp";
import { useProposals } from "../../state/proposals";
import { agentApiUrl } from "../../agent/client";
import { useLocale, type LocaleState } from "../../i18n";

export function ObservationPlanEmptyState({ onEdit, manualOpen }: { onEdit: () => void; manualOpen: boolean }) {
  const { availability } = useWebMcp();
  const { proposal } = useProposals();
  const { t } = useLocale();
  const pending = proposal !== null && proposal.status === "pending";
  const unavailable = availability === "unavailable" || availability === "error";
  const consultAvailable = agentApiUrl() !== null;
  const emptyMessage = pending
    ? t("plan.pendingProposalNote")
    : !unavailable
      ? t("plan.noMissionAgent")
      : consultAvailable
        ? t("plan.noMissionConsult")
        : t("plan.noMissionManual");
  return (
    <section className="workflow-card plan-empty-state" aria-label={t("plan.noMission")}>
      <div className="plan-empty-heading">
        <div>
          <span className="en">{t("plan.kicker")}</span>
          <h1>{t("plan.title")}</h1>
        </div>
        <StatusBadge availability={availability} t={t} />
      </div>
      <h2>{pending ? t("plan.pendingProposal") : t("plan.noMission")}</h2>
      <p>{emptyMessage}</p>
      <div className="plan-example">
        <span className="en">{t("plan.example")}</span>
        <q>{t("plan.exampleText")}</q>
      </div>
      <button type="button" className="primary" aria-expanded={manualOpen} aria-controls="plan-manual-editor" onClick={onEdit}>
        {manualOpen ? t("plan.doneEditing") : t("plan.editManually")}
      </button>
    </section>
  );
}

function StatusBadge({ availability, t }: { availability: "unknown" | "ready" | "unavailable" | "error"; t: LocaleState["t"] }) {
  const label = availability === "unknown" ? t("webmcp.checking") : availability === "ready" ? t("webmcp.ready") : t("webmcp.unavailable");
  return <span className={`sky-status-badge sky-status-${availability}`}><span className="sky-status-dot" aria-hidden="true" />{label}</span>;
}
