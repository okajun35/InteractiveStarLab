import type { ObservationCandidate } from "../../types/observation";

interface CandidateListProps {
  candidates: ObservationCandidate[];
  selectedIds: readonly string[];
  onToggle: (starId: string) => void;
}

export function CandidateList({ candidates, selectedIds, onToggle }: CandidateListProps) {
  const selected = new Set(selectedIds);
  const atCapacity = selectedIds.length >= 5;

  return (
    <section className="workflow-card candidate-card" aria-labelledby="candidate-list-title">
      <div className="workflow-card-heading">
        <div>
          <span className="en">Visible candidates</span>
          <h2 id="candidate-list-title">Observation candidates</h2>
        </div>
        <span className="selection-count">{selectedIds.length} / 5 selected</span>
      </div>

      {candidates.length === 0 ? (
        <div className="workflow-empty">
          <p>No stars match these conditions.</p>
          <p className="workflow-note">Try changing the date, site, or magnitude limit.</p>
        </div>
      ) : (
        <div className="candidate-list" role="list" aria-label="Observation candidates">
          {candidates.map((candidate) => {
            const isSelected = selected.has(candidate.starId);
            return (
              <label key={candidate.starId} className={isSelected ? "candidate-row selected" : "candidate-row"}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={!isSelected && atCapacity}
                  onChange={() => onToggle(candidate.starId)}
                />
                <span className="candidate-main">
                  <span className="candidate-name">
                    {candidate.name}
                  </span>
                  <span className="candidate-stats">
                    Mag {candidate.magnitude.toFixed(2)} · Alt {Math.round(candidate.altitude)}° · Az {Math.round(candidate.azimuth)}°
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
