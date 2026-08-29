import { useMemo } from "react";
import { compareObservationRecord } from "../../observation/comparison";
import { sortObservationRecords } from "../../observation/history";
import { useObservation } from "../../state/observation";

interface ObservationHistoryScreenProps {
  onOpenResults: () => void;
  onOpenPlan: () => void;
}

export function ObservationHistoryScreen({ onOpenResults, onOpenPlan }: ObservationHistoryScreenProps) {
  const { records, selectRecord } = useObservation();
  const sortedRecords = useMemo(() => sortObservationRecords(records), [records]);

  return (
    <main className="workflow-page">
      <div className="workflow-container">
        <div className="workflow-hero">
          <div>
            <span className="en">Observation history</span>
            <h1>観測履歴</h1>
            <p>過去のMissionと観測結果を確認できます。</p>
          </div>
          <button type="button" className="primary" onClick={onOpenPlan}>
            新しいMission
          </button>
        </div>

        {sortedRecords.length === 0 ? (
          <section className="workflow-card workflow-empty-card history-empty" aria-label="履歴なし">
            <span className="en">No observation history</span>
            <h2>まだ観測履歴がありません</h2>
            <p>Planから星を選んで、最初の観測を記録しましょう。</p>
            <button type="button" className="primary" onClick={onOpenPlan}>Planへ移動</button>
          </section>
        ) : (
          <section className="history-list" aria-label="観測履歴一覧">
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
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
