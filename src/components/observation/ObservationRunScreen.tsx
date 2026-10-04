import { useState } from "react";
import { STAR_BY_ID } from "../../astronomy/stars";
import { buildObservationResults, countCompletedResults } from "../../observation/results";
import { useObservation } from "../../state/observation";
import type { ObservationStatus } from "../../types/observation";
import { ObservationStatusInput } from "./ObservationStatusInput";
import { RecoveryCodePanel } from "./RecoveryCodePanel";
import { useLocale, intlLocale, type Locale } from "../../i18n";

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
  const { t, locale } = useLocale();
  const [saving, setSaving] = useState(false);
  const mission = missions.find((item) => item.id === activeMissionId);
  if (!mission) {
    return (
      <main className="workflow-page">
        <div className="workflow-container workflow-empty-page">
          <section className="workflow-card workflow-empty-card" aria-label={t("run.noMission")}>
            <span className="en">{t("run.kicker")}</span>
            <h1>{t("run.noMission")}</h1>
            <p>{t("run.noMissionHint")}</p>
            <button type="button" className="primary" onClick={onOpenPlan}>
              {t("run.goToPlan")}
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
            <span className="en">{t("run.eyebrow")}</span>
            <h1>{t("run.title")}</h1>
            <p>{t("run.lead")}</p>
          </div>
          <button type="button" onClick={onOpenPlan}>
            {t("run.backToPlan")}
          </button>
          <button type="button" className="primary" onClick={onOpenGuide}>
            {hasGuide ? t("run.viewGuide") : t("run.createGuide")}
          </button>
        </div>

        <section className="mission-overview" aria-label={t("run.mission")}>
          <div>
            <span className="en">{t("run.mission")}</span>
            <strong>{mission.id}</strong>
          </div>
          <div>
            <span className="en">{t("run.site")}</span>
            <strong>{mission.siteSnapshot.name}</strong>
            <small>{mission.siteSnapshot.latitude.toFixed(4)}°, {mission.siteSnapshot.longitude.toFixed(4)}°</small>
          </div>
          <div>
            <span className="en">{t("run.dateTime")}</span>
            <strong>{formatDateTime(mission.dateTime, locale)}</strong>
          </div>
          <div className="mission-progress">
            <span className="en">{t("run.progress")}</span>
            <strong>{completed} / {mission.targets.length}</strong>
          </div>
        </section>

        <section className="workflow-card observe-card" aria-labelledby="observe-targets-title">
          <div className="workflow-card-heading">
            <div>
              <span className="en">{t("run.targetsKicker")}</span>
              <h2 id="observe-targets-title">{t("run.targetsTitle")}</h2>
            </div>
            <span className="selection-count">{t("run.entered", { done: completed, total: mission.targets.length })}</span>
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
                    <span className="target-prediction">{t("run.predictionVisible")}</span>
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
            {t("run.saveNote")}
          </p>
          <button type="button" className="primary observe-save-btn" disabled={!isComplete || saving || cloudIdentityLoading} onClick={handleSave}>
            {saving ? t("run.saving") : t("run.save")}
          </button>
          {cloudIdentityLoading && <p className="workflow-note">{t("run.cloudPreparing")}</p>}
          {!cloudAuthenticated && !cloudIdentityLoading && <p className="workflow-note">{t("run.localOnly")}</p>}
          {cloudError && <p className="cloud-error" role="alert">{cloudError}</p>}
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
