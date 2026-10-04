import { useEffect, useMemo, useRef, useState } from "react";
import { CandidateList } from "./CandidateList";
import { SiteEditor, type SiteEditorErrors } from "./SiteEditor";
import { toggleTargetSelection } from "../../observation/selection";
import { candidatesForPlanDraft, type PlanDraft } from "../../observation/planDraft";
import type { ObservationSite } from "../../types/observation";
import { useLocale } from "../../i18n";

const MAX_MAGNITUDE_OPTIONS = [1, 2, 3, 4] as const;

export function ObservationPlanEditor({
  draft,
  errors,
  onChange,
  onCreate,
  saving,
  cloudIdentityLoading,
  cloudConfigured,
  cloudAuthenticated,
  cloudIdentityError,
  cloudError,
  submitLabel,
}: {
  draft: PlanDraft;
  errors: SiteEditorErrors | null;
  onChange: (patch: Partial<PlanDraft>) => void;
  onCreate: () => void;
  saving: boolean;
  cloudIdentityLoading: boolean;
  cloudConfigured: boolean;
  cloudAuthenticated: boolean;
  cloudIdentityError: string | null;
  cloudError: string | null;
  submitLabel?: string;
}) {
  const { t } = useLocale();
  const resolvedSubmitLabel = submitLabel ?? t("plan.createMission");
  const candidates = useMemo(() => candidatesForPlanDraft(draft), [draft]);
  const selectedCandidates = useMemo(() => {
    const byId = new Map(candidates.map((candidate) => [candidate.starId, candidate]));
    return draft.selectedStarIds
      .map((starId) => byId.get(starId))
      .filter((candidate): candidate is (typeof candidates)[number] => candidate !== undefined);
  }, [candidates, draft.selectedStarIds]);

  const handleSiteChange = (patch: Partial<ObservationSite>) => {
    const coordinatesChanged = patch.latitude !== undefined || patch.longitude !== undefined;
    onChange({
      site: {
        ...draft.site,
        ...patch,
        ...(coordinatesChanged && patch.timeZone === undefined ? { timeZone: undefined } : {}),
      },
    });
  };

  return (
    <div className="workflow-grid plan-editor-grid">
      <div className="workflow-column">
        <SiteEditor site={draft.site} errors={errors ?? {}} onChange={handleSiteChange} />
        <section className="workflow-card" aria-labelledby="plan-date-time-title">
          <div className="workflow-card-heading">
            <div>
              <span className="en">{t("plan.observationTime")}</span>
              <h2 id="plan-date-time-title">{t("plan.observationTimeTitle")}</h2>
            </div>
            <span className="step-badge">2</span>
          </div>
          <PlanTimeControl value={draft.dateTime} onChange={(dateTime) => onChange({ dateTime })} />
        </section>
        <section className="workflow-card" aria-labelledby="plan-magnitude-title">
          <div className="workflow-card-heading">
            <div>
              <span className="en">{t("plan.maxMagnitude")}</span>
              <h2 id="plan-magnitude-title">{t("plan.magnitudeLimitTitle")}</h2>
            </div>
            <span className="step-badge">3</span>
          </div>
          <div className="magnitude-choice" role="group" aria-label={t("plan.magnitudeGroup")}>
            {MAX_MAGNITUDE_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                className={draft.maxMagnitude === value ? "magnitude-choice-btn active" : "magnitude-choice-btn"}
                aria-pressed={draft.maxMagnitude === value}
                onClick={() => onChange({ maxMagnitude: value, selectedStarIds: [] })}
              >
                {t("plan.upToMagnitude", { mag: value })}
              </button>
            ))}
          </div>
          <p className="workflow-note">{t("plan.magnitudeNote")}</p>
        </section>
      </div>

      <div className="workflow-column workflow-column-wide">
        <CandidateList
          candidates={candidates}
          selectedIds={draft.selectedStarIds}
          onToggle={(starId) => onChange({ selectedStarIds: toggleTargetSelection(draft.selectedStarIds, starId) })}
        />
        <section className="mission-create-card" aria-label={t("plan.createAria")}>
          <div>
            <span className="mission-create-count">{selectedCandidates.length} / 5</span>
            <span>{t("plan.starsAdded")}</span>
          </div>
          <button
            type="button"
            className="primary mission-create-btn"
            disabled={Boolean(errors) || selectedCandidates.length === 0 || saving || cloudIdentityLoading}
            onClick={onCreate}
          >
            {saving ? t("plan.saving") : resolvedSubmitLabel}
          </button>
        </section>
        {cloudConfigured && cloudIdentityLoading && <p className="workflow-note">{t("plan.cloudPreparing")}</p>}
        {cloudConfigured && !cloudIdentityLoading && !cloudAuthenticated && <p className="workflow-note">{t("plan.cloudUnavailable")}</p>}
        {cloudIdentityError && <p className="cloud-error" role="alert">{cloudIdentityError} {t("plan.localStorageNote")}</p>}
        {cloudError && <p className="cloud-error" role="alert">{cloudError}</p>}
      </div>
    </div>
  );
}

function PlanTimeControl({ value, onChange }: { value: Date; onChange: (value: Date) => void }) {
  const { t } = useLocale();
  const [playing, setPlaying] = useState(false);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => onChangeRef.current(new Date(valueRef.current.getTime() + 6 * 60 * 1000)), 100);
    return () => window.clearInterval(timer);
  }, [playing]);
  const shift = (hours: number) => onChange(new Date(value.getTime() + hours * 3600 * 1000));
  const hour = value.getHours();
  const minute = value.getMinutes();
  return (
    <div className="field time-control">
      <span className="field-label">{t("time.label")}</span>
      <input
        type="datetime-local"
        value={toLocalInputValue(value)}
        onChange={(event) => {
          const date = new Date(event.target.value);
          if (!Number.isNaN(date.getTime())) onChange(date);
        }}
      />
      <div className="btn-row">
        {[-6, -3, -1].map((hours) => <button type="button" key={hours} onClick={() => { setPlaying(false); shift(hours); }}>{hours}h</button>)}
        <button type="button" className="primary" onClick={() => { setPlaying(false); onChange(new Date()); }}>{t("time.now")} {hour}:{String(minute).padStart(2, "0")}</button>
        {[1, 3, 6].map((hours) => <button type="button" key={hours} onClick={() => { setPlaying(false); shift(hours); }}>+{hours}h</button>)}
      </div>
      <div className="btn-row">
        <button type="button" className={playing ? "primary" : undefined} onClick={() => setPlaying((current) => !current)}>
          {playing ? t("time.pause") : t("time.play")}
        </button>
        {playing && <span className="panel-note play-note">{t("time.playing")}</span>}
      </div>
    </div>
  );
}

function toLocalInputValue(value: Date): string {
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
