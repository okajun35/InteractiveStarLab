import type { ObservationStatus, ObservationTarget } from "../../types/observation";

interface ResultStarCardProps {
  target: ObservationTarget;
  name: string;
  englishName?: string;
  status: ObservationStatus;
}

export function ResultStarCard({
  target,
  name,
  englishName,
  status,
}: ResultStarCardProps) {
  const isMatch = target.predictedVisible
    ? status === "visible"
    : status === "not_visible";
  const isUnsure = status === "unsure";
  const stateClass = isUnsure ? "result-uncertain" : isMatch ? "result-match" : "result-mismatch";
  const statusLabel =
    status === "visible" ? "Visible" : status === "not_visible" ? "Not Visible" : "Unsure";

  return (
    <article className={`result-star-card ${stateClass}`}>
      <div className="result-star-heading">
        <div>
          <h3>{name}</h3>
          {englishName && <span className="candidate-name-en">{englishName}</span>}
        </div>
        <span className="result-state">
          {isUnsure ? "?" : isMatch ? "✓" : "!"}
          <span>{isUnsure ? "Undetermined" : isMatch ? "Match" : "Mismatch"}</span>
        </span>
      </div>
      <div className="result-star-details">
        <div>
          <span className="en">Prediction</span>
          <strong>{target.predictedVisible ? "Visible" : "Not Visible"}</strong>
          <small>Alt {Math.round(target.predictedAltitude)}° · Az {Math.round(target.predictedAzimuth)}°</small>
        </div>
        <div>
          <span className="en">Observation</span>
          <strong>{statusLabel}</strong>
        </div>
      </div>
      {target.predictedVisible && status === "not_visible" && (
        <div className="possible-reasons">
          <strong>Possible reasons</strong>
          <span>Clouds, light pollution, obstructions, viewing direction, or eye fatigue may be factors.</span>
        </div>
      )}
    </article>
  );
}
