import { useMemo, useState } from "react";
import { useStarViewer } from "../../state/context";
import { useObservation } from "../../state/observation";
import { useProposals } from "../../state/proposals";
import {
  acceptedStarIds,
  detectPlanStale,
} from "../../proposals/model";

/**
 * Ghost proposal review: shows the agent's staged plan with per-item accept /
 * reject toggles and a staleness badge before it becomes a real Mission.
 */
export function ProposalReviewCard({ onCommitted }: { onCommitted: () => void }) {
  const { settings } = useStarViewer();
  const { activeSite } = useObservation();
  const { proposal, decideItem, commit } = useProposals();
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const staleReasons = useMemo(
    () => proposal === null || proposal.status !== "pending"
      ? []
      : detectPlanStale(proposal, {
        site: activeSite,
        dateTime: settings.datetime.toISOString(),
      }),
    [proposal, activeSite, settings.datetime],
  );

  if (proposal === null || proposal.status !== "pending") return null;

  const accepted = acceptedStarIds(proposal);
  const handleCommit = async () => {
    if (accepted.length === 0 || committing) return;
    setCommitting(true);
    setError(null);
    try {
      await commit(proposal, accepted);
      onCommitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not commit the proposal.");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <section className="proposal-card" aria-label="Proposed plan">
      <div className="proposal-card-header">
        <h3>Proposed plan</h3>
        {staleReasons.length > 0 && (
          <span className="proposal-stale-badge" role="status">
            Stale: {staleReasons.map((reason) => reason.field).join(", ")} changed
          </span>
        )}
      </div>
      <p className="proposal-meta">
        {proposal.siteSnapshot.name} · {new Date(proposal.dateTime).toLocaleString()} ·
        magnitude ≤ {proposal.maxMagnitude}
      </p>
      <ul className="proposal-items">
        {proposal.items.map((item) => (
          <li key={item.starId} className="proposal-item">
            <label>
              <input
                type="checkbox"
                checked={item.decision === "accepted"}
                onChange={(event) =>
                  decideItem(item.starId, event.target.checked ? "accepted" : "rejected")
                }
              />
              <span>{item.name}</span>
            </label>
          </li>
        ))}
      </ul>
      {error !== null && <p className="proposal-error" role="alert">{error}</p>}
      <div className="proposal-actions">
        <button
          type="button"
          onClick={handleCommit}
          disabled={committing || accepted.length === 0}
        >
          {committing ? "Creating Mission…" : `Commit ${accepted.length} item(s) as Mission`}
        </button>
      </div>
    </section>
  );
}
