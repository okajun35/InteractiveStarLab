import { useWebMcp } from "../../state/webmcp";

export function ObservationPlanEmptyState({ onEdit, manualOpen }: { onEdit: () => void; manualOpen: boolean }) {
  const { availability } = useWebMcp();
  const unavailable = availability === "unavailable" || availability === "error";
  return (
    <section className="workflow-card plan-empty-state" aria-label="No active Mission">
      <div className="plan-empty-heading">
        <div>
          <span className="en">Observation Plan</span>
          <h1>Observation Plan</h1>
        </div>
        <StatusBadge availability={availability} />
      </div>
      <h2>No active Mission</h2>
      <p>{unavailable
        ? "WebMCP unavailable. Manual planning is still available."
        : "Ask your AI agent to create a plan for a place and time, or create one manually."}</p>
      <div className="plan-example">
        <span className="en">Example</span>
        <q>Create a three-star observation plan for Sydney tonight.</q>
      </div>
      <button type="button" className="primary" aria-expanded={manualOpen} aria-controls="plan-manual-editor" onClick={onEdit}>
        {manualOpen ? "Done editing" : "Edit manually"}
      </button>
    </section>
  );
}

function StatusBadge({ availability }: { availability: "unknown" | "ready" | "unavailable" | "error" }) {
  const label = availability === "unknown" ? "Checking WebMCP…" : availability === "ready" ? "WebMCP ready" : "WebMCP unavailable";
  return <span className={`sky-status-badge sky-status-${availability}`}><span className="sky-status-dot" aria-hidden="true" />{label}</span>;
}
