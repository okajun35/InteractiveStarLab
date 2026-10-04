import type { ObservationComparison } from "../../types/observation";
import { useLocale } from "../../i18n";

interface ComparisonSummaryProps {
  comparison: ObservationComparison;
}

export function ComparisonSummary({ comparison }: ComparisonSummaryProps) {
  const { t } = useLocale();
  return (
    <section className="comparison-summary" aria-label={t("results.aria")}>
      <div className="comparison-summary-heading">
        <div>
          <span className="en">{t("results.vsKicker")}</span>
          <h2>{t("results.vsTitle")}</h2>
        </div>
        <span className="comparison-predicted">{t("results.expected", { count: comparison.predicted })}</span>
      </div>
      <div className="comparison-metrics">
        <div className="comparison-metric visible">
          <strong>{comparison.visible}</strong>
          <span>{t("status.visible")}</span>
        </div>
        <div className="comparison-metric not-visible">
          <strong>{comparison.notVisible}</strong>
          <span>{t("status.notVisible")}</span>
        </div>
        <div className="comparison-metric unsure">
          <strong>{comparison.unsure}</strong>
          <span>{t("status.unsure")}</span>
        </div>
      </div>
    </section>
  );
}
