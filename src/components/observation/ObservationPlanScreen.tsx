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
import type { SiteEditorErrors } from "./SiteEditor";
import { isValidTimeZone } from "../../astronomy/timezones";

interface ObservationPlanScreenProps {
  onOpenSky: () => void;
  onOpenObserve: () => void;
}

export function ObservationPlanScreen({ onOpenSky, onOpenObserve }: ObservationPlanScreenProps) {
  const { settings, updateSettings } = useStarViewer();
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

  const siteErrors = validateSite(draft.site);
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
              submitLabel={activeMission === null ? "Create Mission" : "Create revised Mission"}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function validateSite(site: ObservationSite): SiteEditorErrors | null {
  const errors: SiteEditorErrors = {};
  if (!site.name.trim()) errors.name = "Enter a site name";
  if (!Number.isFinite(site.latitude)) errors.latitude = "Latitude must be a number";
  else if (site.latitude < -90 || site.latitude > 90) errors.latitude = "Latitude must be between -90 and 90";
  if (!Number.isFinite(site.longitude)) errors.longitude = "Longitude must be a number";
  else if (site.longitude < -180 || site.longitude > 180) errors.longitude = "Longitude must be between -180 and 180";
  if (site.timeZone !== undefined && site.timeZone !== "" && !isValidTimeZone(site.timeZone)) errors.timeZone = "Time Zone must be a valid IANA identifier";
  return Object.keys(errors).length === 0 ? null : errors;
}
