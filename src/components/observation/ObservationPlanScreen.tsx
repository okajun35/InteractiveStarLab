import { useEffect, useMemo, useState } from "react";
import { useStarViewer } from "../../state/context";
import { useObservation } from "../../state/observation";
import { buildObservationCandidates } from "../../observation/candidates";
import { targetFromCandidate } from "../../observation/mission";
import { reconcileSelection, toggleTargetSelection } from "../../observation/selection";
import type { ObservationSite } from "../../types/observation";
import { TimeControl } from "../TimeControl";
import { CandidateList } from "./CandidateList";
import { SiteEditor, type SiteEditorErrors } from "./SiteEditor";

interface ObservationPlanScreenProps {
  onOpenSky: () => void;
  onOpenObserve: () => void;
}

const MAX_MAGNITUDE_OPTIONS = [1, 2, 3, 4] as const;

export function ObservationPlanScreen({ onOpenSky, onOpenObserve }: ObservationPlanScreenProps) {
  const { settings, updateSettings, horizontal } = useStarViewer();
  const {
    activeSite,
    updateActiveSite,
    createMissionAndPersist,
    cloudConfigured,
    cloudAuthenticated,
    cloudIdentityLoading,
    cloudIdentityError,
    cloudError,
  } = useObservation();
  const [maxMagnitude, setMaxMagnitude] = useState<number>(2);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [createdMissionId, setCreatedMissionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const candidates = useMemo(
    () => buildObservationCandidates({ horizontalStars: horizontal, maxMagnitude }),
    [horizontal, maxMagnitude],
  );
  const candidateIds = useMemo(
    () => candidates.map((candidate) => candidate.starId),
    [candidates],
  );
  const selectedCandidates = useMemo(() => {
    const byId = new Map(candidates.map((candidate) => [candidate.starId, candidate]));
    return selectedIds
      .map((starId) => byId.get(starId))
      .filter((candidate): candidate is (typeof candidates)[number] => candidate !== undefined);
  }, [candidates, selectedIds]);
  const siteErrors = validateSite(activeSite);

  // Keep the saved site and the existing viewer's astronomy context in sync.
  useEffect(() => {
    if (
      settings.latitude === activeSite.latitude &&
      settings.longitude === activeSite.longitude
    ) {
      return;
    }
    updateSettings({
      latitude: activeSite.latitude,
      longitude: activeSite.longitude,
    });
  }, [activeSite.latitude, activeSite.longitude, settings.latitude, settings.longitude, updateSettings]);

  // Changing date, location, or magnitude must not leave stale selected stars.
  useEffect(() => {
    setSelectedIds((previous) => reconcileSelection(previous, candidateIds));
  }, [candidateIds]);

  const handleSiteChange = (patch: Partial<ObservationSite>) => {
    updateActiveSite(patch);
    if (patch.latitude !== undefined || patch.longitude !== undefined) {
      updateSettings({
        ...(patch.latitude !== undefined ? { latitude: patch.latitude } : {}),
        ...(patch.longitude !== undefined ? { longitude: patch.longitude } : {}),
      });
    }
  };

  const handleCreateMission = () => {
    if (siteErrors || selectedCandidates.length === 0) return;
    setSaving(true);
    void createMissionAndPersist({
      dateTime: settings.datetime.toISOString(),
      maxMagnitude,
      targets: selectedCandidates.map(targetFromCandidate),
    }).then((mission) => {
      setCreatedMissionId(mission.id);
      onOpenObserve();
    }).catch(() => {
      // ObservationProvider exposes a safe, user-facing cloudError.
    }).finally(() => setSaving(false));
  };

  return (
    <main className="workflow-page">
      <div className="workflow-container">
        <div className="workflow-hero">
          <div>
            <span className="en">Observation planner</span>
            <h1>Create an observation plan</h1>
            <p>Choose stars you may find tonight and prepare an Observation Mission.</p>
          </div>
          <button type="button" onClick={onOpenSky}>
            Sky
          </button>
        </div>

        <div className="workflow-grid">
          <div className="workflow-column">
            <SiteEditor site={activeSite} errors={siteErrors ?? {}} onChange={handleSiteChange} />
            <section className="workflow-card" aria-labelledby="date-time-title">
              <div className="workflow-card-heading">
                <div>
                  <span className="en">Observation time</span>
                  <h2 id="date-time-title">Observation date and time</h2>
                </div>
                <span className="step-badge">2</span>
              </div>
              <TimeControl />
            </section>
            <section className="workflow-card" aria-labelledby="magnitude-title">
              <div className="workflow-card-heading">
                <div>
                  <span className="en">Maximum magnitude</span>
                  <h2 id="magnitude-title">Magnitude limit</h2>
                </div>
                <span className="step-badge">3</span>
              </div>
              <div className="magnitude-choice" role="group" aria-label="Maximum magnitude for candidates">
                {MAX_MAGNITUDE_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={maxMagnitude === value ? "magnitude-choice-btn active" : "magnitude-choice-btn"}
                    aria-pressed={maxMagnitude === value}
                    onClick={() => setMaxMagnitude(value)}
                  >
                    Up to magnitude {value}
                  </button>
                ))}
              </div>
              <p className="workflow-note">The default is magnitude 1–2. Lower values select only brighter stars.</p>
            </section>
          </div>

          <div className="workflow-column workflow-column-wide">
            <CandidateList
              candidates={candidates}
              selectedIds={selectedIds}
              onToggle={(starId) =>
                setSelectedIds((previous) => toggleTargetSelection(previous, starId))
              }
            />
            <section className="mission-create-card" aria-label="Create Mission">
              <div>
                <span className="mission-create-count">{selectedCandidates.length} / 5</span>
                <span>stars added to Mission</span>
              </div>
              <button
                type="button"
                className="primary mission-create-btn"
                disabled={Boolean(siteErrors) || selectedCandidates.length === 0 || saving || cloudIdentityLoading}
                onClick={handleCreateMission}
              >
                {saving ? "Saving…" : "Create Mission"}
              </button>
            </section>
            {cloudConfigured && cloudIdentityLoading && <p className="workflow-note">Preparing the cloud connection. You can create the Mission when it is ready.</p>}
            {cloudConfigured && !cloudIdentityLoading && !cloudAuthenticated && <p className="workflow-note">Cloud is unavailable, so this device will continue using local storage.</p>}
            {cloudIdentityError && <p className="cloud-error" role="alert">{cloudIdentityError} Local storage remains available.</p>}
            {cloudError && <p className="cloud-error" role="alert">{cloudError}</p>}
            {createdMissionId && (
              <div className="workflow-success" role="status">
                Mission created (ID: {createdMissionId}). You can enter observations in the next step.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function validateSite(site: ObservationSite): SiteEditorErrors | null {
  const errors: SiteEditorErrors = {};
  if (!site.name.trim()) errors.name = "Enter a site name";
  if (!Number.isFinite(site.latitude)) {
    errors.latitude = "Latitude must be a number";
  } else if (site.latitude < -90 || site.latitude > 90) {
    errors.latitude = "Latitude must be between -90 and 90";
  }
  if (!Number.isFinite(site.longitude)) {
    errors.longitude = "Longitude must be a number";
  } else if (site.longitude < -180 || site.longitude > 180) {
    errors.longitude = "Longitude must be between -180 and 180";
  }
  return Object.keys(errors).length > 0 ? errors : null;
}
