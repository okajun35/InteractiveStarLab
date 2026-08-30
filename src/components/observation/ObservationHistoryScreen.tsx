import { useMemo } from "react";
import { compareObservationRecord } from "../../observation/comparison";
import { sortObservationRecords } from "../../observation/history";
import { useObservation } from "../../state/observation";
import { RecoveryMissionForm } from "./RecoveryCodePanel";

interface ObservationHistoryScreenProps {
  onOpenResults: () => void;
  onOpenObserve: () => void;
  onOpenPlan: () => void;
}

export function ObservationHistoryScreen({ onOpenResults, onOpenObserve, onOpenPlan }: ObservationHistoryScreenProps) {
  const { records, selectRecord, restoreMission } = useObservation();
  const sortedRecords = useMemo(() => sortObservationRecords(records), [records]);

  return (
    <main className="workflow-page">
      <div className="workflow-container">
        <div className="workflow-hero">
          <div>
            <span className="en">Observation history</span>
            <h1>Observation history</h1>
            <p>Review past Missions and observation results.</p>
          </div>
          <button type="button" className="primary" onClick={onOpenPlan}>
            New Mission
          </button>
        </div>

        <RecoveryMissionForm
          restoreMission={restoreMission}
          onRestored={() => onOpenObserve()}
        />

        {sortedRecords.length === 0 ? (
          <section className="workflow-card workflow-empty-card history-empty" aria-label="No observation history">
            <span className="en">No observation history</span>
            <h2>No observation history yet</h2>
            <p>Select stars in Plan to record your first observation.</p>
            <button type="button" className="primary" onClick={onOpenPlan}>Go to Plan</button>
          </section>
        ) : (
          <section className="history-list" aria-label="Observation history list">
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
                    <span>{formatDateTime(record.dateTime)} · {record.targets.length} stars</span>
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

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
