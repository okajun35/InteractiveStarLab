import type { ObservationComparison } from "../../types/observation";

interface ComparisonSummaryProps {
  comparison: ObservationComparison;
}

export function ComparisonSummary({ comparison }: ComparisonSummaryProps) {
  return (
    <section className="comparison-summary" aria-label="Prediction and observation summary">
      <div className="comparison-summary-heading">
        <div>
          <span className="en">Prediction vs observation</span>
          <h2>Prediction vs observation</h2>
        </div>
        <span className="comparison-predicted">{comparison.predicted} stars expected</span>
      </div>
      <div className="comparison-metrics">
        <div className="comparison-metric visible">
          <strong>{comparison.visible}</strong>
          <span>Visible</span>
        </div>
        <div className="comparison-metric not-visible">
          <strong>{comparison.notVisible}</strong>
          <span>Not Visible</span>
        </div>
        <div className="comparison-metric unsure">
          <strong>{comparison.unsure}</strong>
          <span>Unsure</span>
        </div>
      </div>
    </section>
  );
}
