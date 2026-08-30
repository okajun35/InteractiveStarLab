import { guideDifficultyLabel } from "../../guides/difficulty";
import type { ObservationGuideTarget } from "../../guides/types";

export function GuideTargetTable({ targets }: { targets: readonly ObservationGuideTarget[] }) {
  return (
    <section className="guide-target-section" aria-labelledby="guide-target-title">
      <div className="guide-section-heading">
        <span className="en">Observation targets</span>
        <h2 id="guide-target-title">Observation targets</h2>
      </div>
      <div className="guide-target-table">
        {targets.map((target) => (
          <article className="guide-target-row" key={target.starId}>
            <div className="guide-target-details">
              <span className="guide-target-number">{target.index}</span>
              <strong>{target.name}</strong>
              <span>Mag {target.magnitude.toFixed(2)}</span>
              <span>Alt {Math.round(target.altitude)}°</span>
              <span>{target.direction}</span>
              <span>{guideDifficultyLabel(target.difficulty)}</span>
            </div>
            <div className="guide-check-options" aria-label={`${target.name} observation result`}>
              <span><i aria-hidden="true" /> Visible</span>
              <span><i aria-hidden="true" /> Not Visible</span>
              <span><i aria-hidden="true" /> Unsure</span>
            </div>
          </article>
        ))}
      </div>
      <p className="guide-disclaimer">Difficulty is a simple estimate based on brightness and altitude. Weather and local obstacles are not included.</p>
    </section>
  );
}
