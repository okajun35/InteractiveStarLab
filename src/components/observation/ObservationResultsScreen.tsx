import { useMemo } from "react";
import { STAR_BY_ID } from "../../astronomy/stars";
import { compareObservationRecord } from "../../observation/comparison";
import { findObservationRecord, sortObservationRecords } from "../../observation/history";
import { useObservation } from "../../state/observation";
import { ComparisonSummary } from "./ComparisonSummary";
import { ResultStarCard } from "./ResultStarCard";
import { useLocale, intlLocale, type Locale } from "../../i18n";

interface ObservationResultsScreenProps {
  onOpenPlan: () => void;
  onOpenHistory: () => void;
  onOpenSky: () => void;
}

export function ObservationResultsScreen({
  onOpenPlan,
  onOpenHistory,
  onOpenSky,
}: ObservationResultsScreenProps) {
  const { records, selectedRecordMissionId } = useObservation();
  const { t, locale } = useLocale();
  const record = useMemo(() => {
    if (records.length === 0) return null;
    if (selectedRecordMissionId !== null) {
      return findObservationRecord(records, selectedRecordMissionId) ?? null;
    }
    return sortObservationRecords(records)[0] ?? null;
  }, [records, selectedRecordMissionId]);

  if (record === null) {
    return (
      <main className="workflow-page">
        <div className="workflow-container workflow-empty-page">
          <section className="workflow-card workflow-empty-card" aria-label={t("results.empty")}>
            <span className="en">{t("results.kicker")}</span>
            <h1>{t("results.empty")}</h1>
            <p>{t("results.emptyHint")}</p>
            <button type="button" className="primary" onClick={onOpenPlan}>
              {t("results.goToPlan")}
            </button>
          </section>
        </div>
      </main>
    );
  }

  const comparison = compareObservationRecord(record);
  const resultsById = new Map(record.results.map((result) => [result.starId, result.status]));

  return (
    <main className="workflow-page">
      <div className="workflow-container">
        <div className="workflow-hero">
          <div>
            <span className="en">{t("results.kicker")}</span>
            <h1>{t("results.title")}</h1>
            <p>{t("results.lead")}</p>
          </div>
          <div className="workflow-hero-actions">
            <button type="button" onClick={onOpenHistory}>{t("results.history")}</button>
            <button type="button" onClick={onOpenSky}>
              {t("results.sky")}
            </button>
          </div>
        </div>

        <section className="mission-overview results-overview" aria-label={t("results.aria")}>
          <div>
            <span className="en">{t("results.site")}</span>
            <strong>{record.siteSnapshot.name}</strong>
            <small>{record.siteSnapshot.latitude.toFixed(4)}°, {record.siteSnapshot.longitude.toFixed(4)}°</small>
          </div>
          <div>
            <span className="en">{t("results.dateTime")}</span>
            <strong>{formatDateTime(record.dateTime, locale)}</strong>
          </div>
          <div>
            <span className="en">{t("results.targets")}</span>
            <strong>{t("results.targetsCount", { count: record.targets.length })}</strong>
          </div>
          <div>
            <span className="en">{t("results.completed")}</span>
            <strong>{formatDateTime(record.completedAt, locale)}</strong>
          </div>
        </section>

        <ComparisonSummary comparison={comparison} />

        <section className="workflow-card results-card" aria-labelledby="results-detail-title">
          <div className="workflow-card-heading">
            <div>
              <span className="en">{t("results.starByStar")}</span>
              <h2 id="results-detail-title">{t("results.byStar")}</h2>
            </div>
          </div>
          <div className="result-star-list">
            {record.targets.map((target) => {
              const star = STAR_BY_ID.get(target.starId);
              return (
                <ResultStarCard
                  key={target.starId}
                  target={target}
                  name={star?.name ?? target.starId}
                  status={resultsById.get(target.starId) ?? "unsure"}
                />
              );
            })}
          </div>
        </section>

        <div className="results-actions">
          <button type="button" onClick={onOpenPlan}>{t("results.newMission")}</button>
          <button type="button" className="primary" onClick={onOpenHistory}>{t("results.viewHistory")}</button>
        </div>
      </div>
    </main>
  );
}

function formatDateTime(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
