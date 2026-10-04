import { useEffect, useState } from "react";
import { STAR_BY_ID } from "../../astronomy/stars";
import { formatDirection } from "../../sky/contextModel";
import { formatMissionDateTime } from "../../observation/missionView";
import { missionTargetsToCsv, missionToIcs } from "../../export/missionExport";
import type { ObservationMission } from "../../types/observation";
import { RecoveryCodePanel } from "./RecoveryCodePanel";
import { useAgentActivity } from "../../state/agentActivity";
import { useWebMcp } from "../../state/webmcp";
import { useLocale, intlLocale, type Locale, type LocaleState } from "../../i18n";

export function ObservationPlanSummary({
  mission,
  recoveryCode,
  onClearRecoveryCode,
  onShowTargetSky,
  onStartObserving,
  onEdit,
  manualOpen,
}: {
  mission: ObservationMission;
  recoveryCode: string | null;
  onClearRecoveryCode: () => void;
  onShowTargetSky: () => void;
  onStartObserving: () => void;
  onEdit: () => void;
  manualOpen: boolean;
}) {
  const { planActivity } = useAgentActivity();
  const { availability } = useWebMcp();
  const { t, locale } = useLocale();
  const [now, setNow] = useState(() => Date.now());
  const attributed = planActivity?.missionId === mission.id ? planActivity : null;
  useEffect(() => {
    if (attributed === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next - attributed.createdAt >= 5000) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [attributed]);
  const highlighted = attributed !== null && now - attributed.createdAt < 2500;
  const primaryTarget = mission.targets[0];
  const hasCatalogTarget = primaryTarget !== undefined && STAR_BY_ID.has(primaryTarget.starId);

  return (
    <>
      <section className={highlighted ? "plan-summary plan-summary-highlighted" : "plan-summary"} aria-labelledby="observation-plan-title">
        <div className="workflow-hero plan-summary-hero">
          <div>
            <span className="en">{t("plan.activeMission")}</span>
            <h1 id="observation-plan-title">{t("plan.title")}</h1>
            {attributed !== null && (
              <p className="plan-activity">
                {t("plan.createdVia", { time: relativeTime(attributed.createdAt, now, t, locale) })}
                <br />
                {t("plan.createdDetail", { count: attributed.targetCount, site: attributed.siteName })}
              </p>
            )}
            {attributed !== null && (
              <span className="plan-live-announcement" aria-live="polite" aria-atomic="true">
                {t("plan.createdAnnouncement", { count: attributed.targetCount })}
              </span>
            )}
          </div>
          <span className={`sky-status-badge sky-status-${availability}`}>
            <span className="sky-status-dot" aria-hidden="true" />
            {availability === "unknown" ? t("webmcp.checking") : availability === "ready" ? t("webmcp.ready") : t("webmcp.unavailable")}
          </span>
        </div>

        <section className="plan-context-card" aria-labelledby="mission-context-title">
          <h2 id="mission-context-title">{t("plan.missionContext")}</h2>
          <dl className="mission-context-list">
            <ContextRow label={t("plan.mission")} value={mission.id} selectable />
            <ContextRow label={t("plan.site")} value={mission.siteSnapshot.name} />
            <ContextRow label={t("plan.coordinates")} value={`${mission.siteSnapshot.latitude.toFixed(4)}, ${mission.siteSnapshot.longitude.toFixed(4)}`} />
            <ContextRow label={t("plan.dateTime")} value={formatMissionDateTime(mission.dateTime, mission)} />
            <ContextRow label={t("plan.magnitudeLimit")} value={t("plan.upToMagnitude", { mag: mission.maxMagnitude })} />
            <ContextRow label={t("plan.targets")} value={t("plan.targetsCount", { count: mission.targets.length })} />
            <ContextRow label={t("plan.created")} value={formatCreatedAt(mission.createdAt, locale)} />
          </dl>
        </section>

        <section className="plan-targets-section" aria-labelledby="plan-targets-title">
          <h2 id="plan-targets-title">{t("plan.targets")}</h2>
          <ul className="plan-target-list">
            {mission.targets.map((target, index) => {
              const star = STAR_BY_ID.get(target.starId);
              return (
                <li key={`${target.starId}-${index}`} className={highlighted ? "plan-target-card plan-target-highlighted" : "plan-target-card"}>
                  <div className="plan-target-card-heading">
                    <div>
                      <h3>{star?.name ?? target.starId}</h3>
                      {index === 0 && <span className="primary-target-label">{t("plan.primaryTarget")}</span>}
                    </div>
                    <strong>{target.predictedVisible ? t("status.visible") : t("status.notVisible")}</strong>
                  </div>
                  <dl className="plan-target-facts">
                    <ContextRow label={t("plan.magnitude")} value={target.predictedMagnitude.toFixed(2)} />
                    <ContextRow label={t("panel.altitude")} value={`${Math.round(target.predictedAltitude)}°`} />
                    <ContextRow label={t("panel.direction")} value={formatDirection(target.predictedAzimuth)} />
                    <ContextRow label={t("plan.prediction")} value={target.predictedVisible ? t("status.visible") : t("status.notVisible")} />
                  </dl>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="plan-actions">
          <button type="button" className="primary" disabled={!hasCatalogTarget} onClick={onShowTargetSky}>{t("plan.showTargetSky")}</button>
          <button type="button" onClick={onStartObserving}>{t("plan.startObserving")}</button>
          <button type="button" aria-expanded={manualOpen} aria-controls="plan-manual-editor" onClick={onEdit}>{manualOpen ? t("plan.doneEditing") : t("plan.editManually")}</button>
          <button type="button" onClick={() => downloadFile(`${mission.id}.ics`, missionToIcs(mission), "text/calendar")}>{t("plan.exportIcs")}</button>
          <button type="button" onClick={() => downloadFile(`${mission.id}-targets.csv`, missionTargetsToCsv(mission), "text/csv")}>{t("plan.exportCsv")}</button>
        </div>
        {!hasCatalogTarget && <p className="workflow-note">{t("plan.noCatalogTarget")}</p>}
      </section>
      {recoveryCode !== null && <RecoveryCodePanel recoveryCode={recoveryCode} clearRecoveryCode={onClearRecoveryCode} />}
    </>
  );
}

function downloadFile(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ContextRow({ label, value, selectable = false }: { label: string; value: string; selectable?: boolean }) {
  return <div className="mission-context-row"><dt>{label}</dt><dd className={selectable ? "selectable-value" : undefined}>{value}</dd></div>;
}

function formatCreatedAt(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function relativeTime(timestamp: number, now: number, t: LocaleState["t"], locale: Locale): string {
  return now - timestamp < 60_000 ? t("ctx.justNow") : formatCreatedAt(new Date(timestamp).toISOString(), locale);
}
