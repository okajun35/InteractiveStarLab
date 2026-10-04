import type { ObservationCandidate } from "../../types/observation";
import { useLocale } from "../../i18n";

interface CandidateListProps {
  candidates: ObservationCandidate[];
  selectedIds: readonly string[];
  onToggle: (starId: string) => void;
}

export function CandidateList({ candidates, selectedIds, onToggle }: CandidateListProps) {
  const { t } = useLocale();
  const selected = new Set(selectedIds);
  const atCapacity = selectedIds.length >= 5;

  return (
    <section className="workflow-card candidate-card" aria-labelledby="candidate-list-title">
      <div className="workflow-card-heading">
        <div>
          <span className="en">{t("plan.candidatesKicker")}</span>
          <h2 id="candidate-list-title">{t("plan.candidates")}</h2>
        </div>
        <span className="selection-count">{t("plan.candidatesSelected", { count: selectedIds.length })}</span>
      </div>

      {candidates.length === 0 ? (
        <div className="workflow-empty">
          <p>{t("plan.noCandidates")}</p>
          <p className="workflow-note">{t("plan.noCandidatesHint")}</p>
        </div>
      ) : (
        <div className="candidate-list" role="list" aria-label={t("plan.candidates")}>
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
