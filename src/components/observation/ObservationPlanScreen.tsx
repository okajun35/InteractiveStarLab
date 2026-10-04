import { useRef, useState } from "react";
import { useStarViewer } from "../../state/context";
import { useObservation } from "../../state/observation";
import { candidatesForPlanDraft, createInitialPlanDraft, missionToPlanDraft, type PlanDraft } from "../../observation/planDraft";
import { reconcileSelection } from "../../observation/selection";
import { missionToSkyView } from "../../observation/missionView";
import { targetFromCandidate } from "../../observation/mission";
import type { ObservationSite } from "../../types/observation";
import { ObservationPlanEmptyState } from "./ObservationPlanEmptyState";
import { ObservationPlanEditor } from "./ObservationPlanEditor";
import { ObservationPlanSummary } from "./ObservationPlanSummary";
import { ProposalReviewCard } from "./ProposalReviewCard";
import type { SiteEditorErrors } from "./SiteEditor";
import { isValidTimeZone } from "../../astronomy/timezones";
import { useLocale, type LocaleState } from "../../i18n";

interface ObservationPlanScreenProps {
  onOpenSky: () => void;
  onOpenObserve: () => void;
}

export function ObservationPlanScreen({ onOpenSky, onOpenObserve }: ObservationPlanScreenProps) {
  const { settings, updateSettings } = useStarViewer();
  const { t } = useLocale();
  const {
    activeSite,
    activeMissionId,
    missions,
    updateActiveSite,
    createMissionAndPersist,
    recoveryCode,
    clearRecoveryCode,
    cloudConfigured,
    cloudAuthenticated,
    cloudIdentityLoading,
    cloudIdentityError,
    cloudError,
  } = useObservation();
  const activeMission = activeMissionId === null ? null : missions.find((mission) => mission.id === activeMissionId) ?? null;
  const [manualOpen, setManualOpen] = useState(false);
  const [draft, setDraft] = useState<PlanDraft>(() => activeMission
    ? missionToPlanDraft(activeMission)
    : createInitialPlanDraft(activeSite, settings.datetime));
  const [saving, setSaving] = useState(false);
  const initializedEditorRef = useRef(false);

  const openEditor = () => {
    if (!initializedEditorRef.current) {
      setDraft(activeMission ? missionToPlanDraft(activeMission) : createInitialPlanDraft(activeSite, settings.datetime));
      initializedEditorRef.current = true;
    }
    setManualOpen(true);
  };

  const siteErrors = validateSite(draft.site, t);
  const updateDraft = (patch: Partial<PlanDraft>) => {
    setDraft((previous) => {
      const next = { ...previous, ...patch };
      if (patch.site !== undefined || patch.dateTime !== undefined || patch.maxMagnitude !== undefined) {
        next.selectedStarIds = reconcileSelection(
          next.selectedStarIds,
          candidatesForPlanDraft({ ...next, selectedStarIds: [] }).map((candidate) => candidate.starId),
        );
      }
      return next;
    });
  };

  const handleCreateMission = () => {
    if (siteErrors !== null || saving) return;
    const candidates = candidatesForPlanDraft(draft);
    const byId = new Map(candidates.map((candidate) => [candidate.starId, candidate]));
    const targets = draft.selectedStarIds
      .map((starId) => byId.get(starId))
      .filter((candidate): candidate is (typeof candidates)[number] => candidate !== undefined)
      .map(targetFromCandidate);
    if (targets.length === 0) return;
    setSaving(true);
    updateActiveSite(draft.site);
    updateSettings({ latitude: draft.site.latitude, longitude: draft.site.longitude, datetime: draft.dateTime });
    void createMissionAndPersist({
      site: draft.site,
      dateTime: draft.dateTime.toISOString(),
      maxMagnitude: draft.maxMagnitude,
      targets,
    }).then(() => onOpenObserve()).catch(() => undefined).finally(() => setSaving(false));
  };

  const showTargetSky = () => {
    if (activeMission === null) return;
    const targetView = missionToSkyView(activeMission, settings.fieldOfView);
    if (targetView === null) return;
    updateActiveSite(targetView.site);
    updateSettings(targetView.observation);
    onOpenSky();
  };

  return (
    <main className="workflow-page">
      <div className="workflow-container plan-container">
        <ProposalReviewCard onCommitted={onOpenObserve} />
        {activeMission === null ? (
          <ObservationPlanEmptyState onEdit={() => (manualOpen ? setManualOpen(false) : openEditor())} manualOpen={manualOpen} />
        ) : (
          <ObservationPlanSummary
            mission={activeMission}
            recoveryCode={recoveryCode}
            onClearRecoveryCode={clearRecoveryCode}
            onShowTargetSky={showTargetSky}
            onStartObserving={onOpenObserve}
            onEdit={() => (manualOpen ? setManualOpen(false) : openEditor())}
            manualOpen={manualOpen}
          />
        )}
        {manualOpen && (
          <div id="plan-manual-editor" className="plan-manual-editor">
            <ObservationPlanEditor
              draft={draft}
              errors={siteErrors}
              onChange={updateDraft}
              onCreate={handleCreateMission}
              saving={saving}
              cloudIdentityLoading={cloudIdentityLoading}
              cloudConfigured={cloudConfigured}
              cloudAuthenticated={cloudAuthenticated}
              cloudIdentityError={cloudIdentityError}
              cloudError={cloudError}
              submitLabel={activeMission === null ? t("plan.createMission") : t("plan.createRevised")}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function validateSite(site: ObservationSite, t: LocaleState["t"]): SiteEditorErrors | null {
  const errors: SiteEditorErrors = {};
  if (!site.name.trim()) errors.name = t("plan.errorName");
  if (!Number.isFinite(site.latitude)) errors.latitude = t("plan.errorLatitudeNumber");
  else if (site.latitude < -90 || site.latitude > 90) errors.latitude = t("plan.errorLatitudeRange");
  if (!Number.isFinite(site.longitude)) errors.longitude = t("plan.errorLongitudeNumber");
  else if (site.longitude < -180 || site.longitude > 180) errors.longitude = t("plan.errorLongitudeRange");
  if (site.timeZone !== undefined && site.timeZone !== "" && !isValidTimeZone(site.timeZone)) errors.timeZone = t("plan.errorTimeZone");
  return Object.keys(errors).length === 0 ? null : errors;
}
