import type { ObservationStatus, ObservationTarget } from "../../types/observation";
import { useLocale } from "../../i18n";

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
  const { t } = useLocale();
  const isMatch = target.predictedVisible
    ? status === "visible"
    : status === "not_visible";
  const isUnsure = status === "unsure";
  const stateClass = isUnsure ? "result-uncertain" : isMatch ? "result-match" : "result-mismatch";
  const statusLabel =
    status === "visible" ? t("status.visible") : status === "not_visible" ? t("status.notVisible") : t("status.unsure");

  return (
    <article className={`result-star-card ${stateClass}`}>
      <div className="result-star-heading">
        <div>
          <h3>{name}</h3>
          {englishName && <span className="candidate-name-en">{englishName}</span>}
        </div>
        <span className="result-state">
          {isUnsure ? "?" : isMatch ? "✓" : "!"}
          <span>{isUnsure ? t("results.undetermined") : isMatch ? t("results.match") : t("results.mismatch")}</span>
        </span>
      </div>
      <div className="result-star-details">
        <div>
          <span className="en">{t("results.prediction")}</span>
          <strong>{target.predictedVisible ? t("status.visible") : t("status.notVisible")}</strong>
          <small>Alt {Math.round(target.predictedAltitude)}° · Az {Math.round(target.predictedAzimuth)}°</small>
        </div>
        <div>
          <span className="en">{t("results.observation")}</span>
          <strong>{statusLabel}</strong>
        </div>
      </div>
      {target.predictedVisible && status === "not_visible" && (
        <div className="possible-reasons">
          <strong>{t("results.possibleReasons")}</strong>
          <span>{t("results.reasonsDetail")}</span>
        </div>
      )}
    </article>
  );
}
