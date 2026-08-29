import { useMemo } from "react";
import { STAR_BY_ID } from "../../astronomy/stars";
import { compareObservationRecord } from "../../observation/comparison";
import { findObservationRecord, sortObservationRecords } from "../../observation/history";
import { useObservation } from "../../state/observation";
import { ComparisonSummary } from "./ComparisonSummary";
import { ResultStarCard } from "./ResultStarCard";

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
          <section className="workflow-card workflow-empty-card" aria-label="結果なし">
            <span className="en">Observation results</span>
            <h1>観測結果がありません</h1>
            <p>Missionを実行して、観測結果を保存してください。</p>
            <button type="button" className="primary" onClick={onOpenPlan}>
              Planへ移動
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
            <span className="en">Observation results</span>
            <h1>観測結果を振り返る</h1>
            <p>予測と実際の観測を並べて、違いを確認します。</p>
          </div>
          <div className="workflow-hero-actions">
            <button type="button" onClick={onOpenHistory}>履歴</button>
            <button type="button" onClick={onOpenSky}>
              <span className="en">Sky</span> 星空を見る
            </button>
          </div>
        </div>

        <section className="mission-overview results-overview" aria-label="観測記録情報">
          <div>
            <span className="en">Site</span>
            <strong>{record.siteSnapshot.name}</strong>
            <small>{record.siteSnapshot.latitude.toFixed(4)}°, {record.siteSnapshot.longitude.toFixed(4)}°</small>
          </div>
          <div>
            <span className="en">Date / Time</span>
            <strong>{formatDateTime(record.dateTime)}</strong>
          </div>
          <div>
            <span className="en">Targets</span>
            <strong>{record.targets.length} stars</strong>
          </div>
          <div>
            <span className="en">Completed</span>
            <strong>{formatDateTime(record.completedAt)}</strong>
          </div>
        </section>

        <ComparisonSummary comparison={comparison} />

        <section className="workflow-card results-card" aria-labelledby="results-detail-title">
          <div className="workflow-card-heading">
            <div>
              <span className="en">Star by star</span>
              <h2 id="results-detail-title">星ごとの結果</h2>
            </div>
          </div>
          <div className="result-star-list">
            {record.targets.map((target) => {
              const star = STAR_BY_ID.get(target.starId);
              return (
                <ResultStarCard
                  key={target.starId}
                  target={target}
                  name={star?.nameJa ?? star?.name ?? target.starId}
                  englishName={star?.nameJa ? star.name : undefined}
                  status={resultsById.get(target.starId) ?? "unsure"}
                />
              );
            })}
          </div>
        </section>

        <div className="results-actions">
          <button type="button" onClick={onOpenPlan}>新しいMissionを作成</button>
          <button type="button" className="primary" onClick={onOpenHistory}>履歴を見る</button>
        </div>
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
