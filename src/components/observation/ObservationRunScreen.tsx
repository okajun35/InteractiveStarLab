import { useState } from "react";
import { STAR_BY_ID } from "../../astronomy/stars";
import { buildObservationResults, countCompletedResults } from "../../observation/results";
import { useObservation } from "../../state/observation";
import type { ObservationStatus } from "../../types/observation";
import { ObservationStatusInput } from "./ObservationStatusInput";
import { RecoveryCodePanel } from "./RecoveryCodePanel";

interface ObservationRunScreenProps {
  onOpenPlan: () => void;
  onOpenResults: () => void;
  onOpenGuide: () => void;
  hasGuide: boolean;
}

export function ObservationRunScreen({ onOpenPlan, onOpenResults, onOpenGuide, hasGuide }: ObservationRunScreenProps) {
  const {
    missions,
    activeMissionId,
    draftResults,
    setDraftResult,
    saveObservationRecordAndPersist,
    cloudAuthenticated,
    cloudIdentityLoading,
    recoveryCode,
    clearRecoveryCode,
    cloudError,
  } = useObservation();
  const [saving, setSaving] = useState(false);
  const mission = missions.find((item) => item.id === activeMissionId);
  if (!mission) {
    return (
      <main className="workflow-page">
        <div className="workflow-container workflow-empty-page">
          <section className="workflow-card workflow-empty-card" aria-label="Missionなし">
            <span className="en">Observation mission</span>
            <h1>観測ミッションがありません</h1>
            <p>先に観測候補を選んでMissionを作成してください。</p>
            <button type="button" className="primary" onClick={onOpenPlan}>
              Planへ移動
            </button>
          </section>
        </div>
      </main>
    );
  }

  const completed = countCompletedResults(mission.targets, draftResults);
  const isComplete = buildObservationResults(mission.targets, draftResults) !== null;
  const updateStatus = (starId: string, status: ObservationStatus) => {
    setDraftResult(starId, status);
  };

  const handleSave = () => {
    if (!isComplete) return;
    setSaving(true);
    void saveObservationRecordAndPersist().then((record) => {
      if (record !== null) onOpenResults();
    }).catch(() => {
      // ObservationProvider exposes a safe, user-facing cloudError.
    }).finally(() => setSaving(false));
  };

  return (
    <main className="workflow-page">
      <div className="workflow-container">
        <div className="workflow-hero">
          <div>
            <span className="en">Observation run</span>
            <h1>観測結果を記録する</h1>
            <p>空を見上げて、星ごとに実際の見え方を選択してください。</p>
          </div>
          <button type="button" onClick={onOpenPlan}>
            <span className="en">Plan</span> 計画へ戻る
          </button>
          <button type="button" className="primary" onClick={onOpenGuide}>
            {hasGuide ? "観測ガイドを表示" : "観測ガイドを作る"}
          </button>
        </div>

        <section className="mission-overview" aria-label="Mission情報">
          <div>
            <span className="en">Mission</span>
            <strong>{mission.id}</strong>
          </div>
          <div>
            <span className="en">Site</span>
            <strong>{mission.siteSnapshot.name}</strong>
            <small>{mission.siteSnapshot.latitude.toFixed(4)}°, {mission.siteSnapshot.longitude.toFixed(4)}°</small>
          </div>
          <div>
            <span className="en">Date / Time</span>
            <strong>{formatDateTime(mission.dateTime)}</strong>
          </div>
          <div className="mission-progress">
            <span className="en">Progress</span>
            <strong>{completed} / {mission.targets.length}</strong>
          </div>
        </section>

        <section className="workflow-card observe-card" aria-labelledby="observe-targets-title">
          <div className="workflow-card-heading">
            <div>
              <span className="en">Mission targets</span>
              <h2 id="observe-targets-title">観測対象</h2>
            </div>
            <span className="selection-count">{completed} / {mission.targets.length} 入力済み</span>
          </div>

          <div className="observation-target-list">
            {mission.targets.map((target) => {
              const star = STAR_BY_ID.get(target.starId);
              const name = star?.nameJa ?? star?.name ?? target.starId;
              return (
                <article key={target.starId} className="observation-target-card">
                  <div className="observation-target-header">
                    <div>
                      <h3>{name}</h3>
                      {star?.nameJa && <span className="candidate-name-en">{star.name}</span>}
                    </div>
                    <span className="target-prediction">予測：見える</span>
                  </div>
                  <p className="candidate-stats">
                    等級 {target.predictedMagnitude.toFixed(2)} · 高度 {Math.round(target.predictedAltitude)}° · 方位 {Math.round(target.predictedAzimuth)}°
                  </p>
                  <ObservationStatusInput
                    starId={name}
                    status={draftResults[target.starId]}
                    onChange={(status) => updateStatus(target.starId, status)}
                  />
                </article>
              );
            })}
          </div>
        </section>

        {recoveryCode && <RecoveryCodePanel recoveryCode={recoveryCode} clearRecoveryCode={clearRecoveryCode} />}

        <div className="observe-actions">
          <p className="workflow-note">
            すべての対象を入力すると観測結果を保存できます。「わからない」も観測結果として記録されます。
          </p>
          <button type="button" className="primary observe-save-btn" disabled={!isComplete || saving || cloudIdentityLoading} onClick={handleSave}>
            {saving ? "保存中…" : "観測結果を保存"}
          </button>
          {cloudIdentityLoading && <p className="workflow-note">Cloud接続を準備中です。接続準備が完了すると保存できます。</p>}
          {!cloudAuthenticated && !cloudIdentityLoading && <p className="workflow-note">Cloud未接続時は、この端末のローカルへ保存されます。</p>}
          {cloudError && <p className="cloud-error" role="alert">{cloudError}</p>}
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
