import type { ObservationComparison } from "../../types/observation";

interface ComparisonSummaryProps {
  comparison: ObservationComparison;
}

export function ComparisonSummary({ comparison }: ComparisonSummaryProps) {
  return (
    <section className="comparison-summary" aria-label="予測と観測結果の集計">
      <div className="comparison-summary-heading">
        <div>
          <span className="en">Prediction vs observation</span>
          <h2>予測と観測結果</h2>
        </div>
        <span className="comparison-predicted">{comparison.predicted} stars expected</span>
      </div>
      <div className="comparison-metrics">
        <div className="comparison-metric visible">
          <strong>{comparison.visible}</strong>
          <span><span className="en">Visible</span>見えた</span>
        </div>
        <div className="comparison-metric not-visible">
          <strong>{comparison.notVisible}</strong>
          <span><span className="en">Not Visible</span>見えなかった</span>
        </div>
        <div className="comparison-metric unsure">
          <strong>{comparison.unsure}</strong>
          <span><span className="en">Unsure</span>わからない</span>
        </div>
      </div>
    </section>
  );
}
