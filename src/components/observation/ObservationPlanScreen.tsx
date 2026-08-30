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
            <h1>観測計画をつくる</h1>
            <p>今夜見つけられそうな星を選び、観測Missionを準備します。</p>
          </div>
          <button type="button" onClick={onOpenSky}>
            <span className="en">Sky</span> 星空を見る
          </button>
        </div>

        <div className="workflow-grid">
          <div className="workflow-column">
            <SiteEditor site={activeSite} errors={siteErrors ?? {}} onChange={handleSiteChange} />
            <section className="workflow-card" aria-labelledby="date-time-title">
              <div className="workflow-card-heading">
                <div>
                  <span className="en">Observation time</span>
                  <h2 id="date-time-title">観測日時</h2>
                </div>
                <span className="step-badge">2</span>
              </div>
              <TimeControl />
            </section>
            <section className="workflow-card" aria-labelledby="magnitude-title">
              <div className="workflow-card-heading">
                <div>
                  <span className="en">Maximum magnitude</span>
                  <h2 id="magnitude-title">明るさの上限</h2>
                </div>
                <span className="step-badge">3</span>
              </div>
              <div className="magnitude-choice" role="group" aria-label="観測候補の最大等級">
                {MAX_MAGNITUDE_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={maxMagnitude === value ? "magnitude-choice-btn active" : "magnitude-choice-btn"}
                    aria-pressed={maxMagnitude === value}
                    onClick={() => setMaxMagnitude(value)}
                  >
                    {value}等星まで
                  </button>
                ))}
              </div>
              <p className="workflow-note">初期値は1〜2等星相当です。数値が小さいほど明るい星だけを対象にします。</p>
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
            <section className="mission-create-card" aria-label="Mission作成">
              <div>
                <span className="mission-create-count">{selectedCandidates.length} / 5</span>
                <span>件の星をMissionに追加</span>
              </div>
              <button
                type="button"
                className="primary mission-create-btn"
                disabled={Boolean(siteErrors) || selectedCandidates.length === 0 || saving || cloudIdentityLoading}
                onClick={handleCreateMission}
              >
                {saving ? "保存中…" : "Missionを作成"}
              </button>
            </section>
            {cloudAuthenticated && <p className="cloud-save-note">Cloud保存モード：MissionはSupabaseへ保存されます。</p>}
            {cloudConfigured && cloudIdentityLoading && <p className="workflow-note">Cloud接続を準備中です。接続準備が完了するとMissionを作成できます。</p>}
            {cloudConfigured && !cloudIdentityLoading && !cloudAuthenticated && <p className="workflow-note">Cloudへ接続できないため、この端末ではローカル保存を続けます。</p>}
            {cloudIdentityError && <p className="cloud-error" role="alert">{cloudIdentityError} ローカル保存は利用できます。</p>}
            {cloudError && <p className="cloud-error" role="alert">{cloudError}</p>}
            {createdMissionId && (
              <div className="workflow-success" role="status">
                Missionを作成しました（ID: {createdMissionId}）。次のステップで観測結果を入力できます。
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
  if (!site.name.trim()) errors.name = "地点名を入力してください";
  if (!Number.isFinite(site.latitude)) {
    errors.latitude = "緯度は数値を入力してください";
  } else if (site.latitude < -90 || site.latitude > 90) {
    errors.latitude = "緯度は -90〜90 の範囲で入力してください";
  }
  if (!Number.isFinite(site.longitude)) {
    errors.longitude = "経度は数値を入力してください";
  } else if (site.longitude < -180 || site.longitude > 180) {
    errors.longitude = "経度は -180〜180 の範囲で入力してください";
  }
  return Object.keys(errors).length > 0 ? errors : null;
}
