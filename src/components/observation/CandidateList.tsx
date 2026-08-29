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
          <h2 id="candidate-list-title">観測候補</h2>
        </div>
        <span className="selection-count">{selectedIds.length} / 5 選択</span>
      </div>

      {candidates.length === 0 ? (
        <div className="workflow-empty">
          <p>条件に合う星がありません。</p>
          <p className="workflow-note">日時、地点、または最大等級を変更してください。</p>
        </div>
      ) : (
        <div className="candidate-list" role="list" aria-label="観測候補星">
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
                    {candidate.nameJa ?? candidate.name}
                    {candidate.nameJa && <span className="candidate-name-en">{candidate.name}</span>}
                  </span>
                  <span className="candidate-stats">
                    Mag {candidate.magnitude.toFixed(2)} · 高度 {Math.round(candidate.altitude)}° · 方位 {Math.round(candidate.azimuth)}°
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
