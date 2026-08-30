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
          <section className="workflow-card workflow-empty-card" aria-label="No active Mission">
            <span className="en">Observation mission</span>
            <h1>No active Mission</h1>
            <p>Select observation candidates and create a Mission first.</p>
            <button type="button" className="primary" onClick={onOpenPlan}>
              Go to Plan
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
            <h1>Record observations</h1>
            <p>Look up at the sky and choose how each star actually appears.</p>
          </div>
          <button type="button" onClick={onOpenPlan}>
            Back to Plan
          </button>
          <button type="button" className="primary" onClick={onOpenGuide}>
            {hasGuide ? "View observation guide" : "Create observation guide"}
          </button>
        </div>

        <section className="mission-overview" aria-label="Mission information">
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
              <h2 id="observe-targets-title">Mission targets</h2>
            </div>
            <span className="selection-count">{completed} / {mission.targets.length} entered</span>
          </div>

          <div className="observation-target-list">
            {mission.targets.map((target) => {
              const star = STAR_BY_ID.get(target.starId);
              const name = star?.name ?? target.starId;
              return (
                <article key={target.starId} className="observation-target-card">
                  <div className="observation-target-header">
                    <div>
                      <h3>{name}</h3>
                    </div>
                    <span className="target-prediction">Prediction: Visible</span>
                  </div>
                  <p className="candidate-stats">
                    Mag {target.predictedMagnitude.toFixed(2)} · Alt {Math.round(target.predictedAltitude)}° · Az {Math.round(target.predictedAzimuth)}°
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
            Enter a status for every target to save the observation. Unsure is also recorded as an observation result.
          </p>
          <button type="button" className="primary observe-save-btn" disabled={!isComplete || saving || cloudIdentityLoading} onClick={handleSave}>
            {saving ? "Saving…" : "Save observation results"}
          </button>
          {cloudIdentityLoading && <p className="workflow-note">Preparing the cloud connection. You can save when it is ready.</p>}
          {!cloudAuthenticated && !cloudIdentityLoading && <p className="workflow-note">Without a cloud connection, results are saved locally on this device.</p>}
          {cloudError && <p className="cloud-error" role="alert">{cloudError}</p>}
        </div>
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
