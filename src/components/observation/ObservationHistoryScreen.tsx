import { useMemo } from "react";
import { compareObservationRecord } from "../../observation/comparison";
import { sortObservationRecords } from "../../observation/history";
import { useObservation } from "../../state/observation";
import { RecoveryMissionForm } from "./RecoveryCodePanel";
import { useLocale, intlLocale, type Locale } from "../../i18n";

interface ObservationHistoryScreenProps {
  onOpenResults: () => void;
  onOpenObserve: () => void;
  onOpenPlan: () => void;
}

export function ObservationHistoryScreen({ onOpenResults, onOpenObserve, onOpenPlan }: ObservationHistoryScreenProps) {
  const { records, selectRecord, restoreMission } = useObservation();
  const { t, locale } = useLocale();
  const sortedRecords = useMemo(() => sortObservationRecords(records), [records]);

  return (
    <main className="workflow-page">
      <div className="workflow-container">
        <div className="workflow-hero">
          <div>
            <span className="en">{t("history.kicker")}</span>
            <h1>{t("history.title")}</h1>
            <p>{t("history.lead")}</p>
          </div>
          <button type="button" className="primary" onClick={onOpenPlan}>
            {t("history.newMission")}
          </button>
        </div>

        <RecoveryMissionForm
          restoreMission={restoreMission}
          onRestored={() => onOpenObserve()}
        />

        {sortedRecords.length === 0 ? (
          <section className="workflow-card workflow-empty-card history-empty" aria-label={t("history.empty")}>
            <span className="en">{t("history.empty")}</span>
            <h2>{t("history.emptyTitle")}</h2>
            <p>{t("history.emptyHint")}</p>
            <button type="button" className="primary" onClick={onOpenPlan}>{t("history.goToPlan")}</button>
          </section>
        ) : (
          <section className="history-list" aria-label={t("history.listAria")}>
            {sortedRecords.map((record) => {
              const summary = compareObservationRecord(record);
              return (
                <button
                  key={record.missionId}
                  type="button"
                  className="history-row"
                  onClick={() => {
                    selectRecord(record.missionId);
                    onOpenResults();
                  }}
                >
                  <span className="history-row-main">
                    <strong>{record.siteSnapshot.name}</strong>
                    <span>{formatDateTime(record.dateTime, locale)} · {t("history.starsCount", { count: record.targets.length })}</span>
                  </span>
                  <span className="history-row-result">
                    <span className="history-visible">✓ {summary.visible}</span>
                    <span className="history-not-visible">✗ {summary.notVisible}</span>
                    <span className="history-unsure">? {summary.unsure}</span>
                  </span>
                  <span className="history-row-arrow" aria-hidden="true">›</span>
                </button>
              );
            })}
          </section>
        )}
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
