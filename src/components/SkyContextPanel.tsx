import { useEffect, useMemo, useState } from "react";
import { useStarViewer } from "../state/context";
import { useSimulation } from "../state/simulation";
import { useObservation } from "../state/observation";
import { useAgentActivity } from "../state/agentActivity";
import {
  buildSkyContextModel,
  buildCurrentSkyRows,
  valuesEqual,
  type SkyContextField,
  type SkyContextModel,
  type SkyContextRow,
  type SkySceneMetrics,
} from "../sky/contextModel";
import { useLocale, intlLocale, type Locale, type LocaleState, type MessageKey } from "../i18n";

function fieldLabelKey(field: SkyContextField): MessageKey {
  return `ctx.${field}` as MessageKey;
}

export function SkyContextPanel({ metrics, compact = false }: { metrics: SkySceneMetrics | null; compact?: boolean }) {
  const { settings: observation, options, skyMode } = useStarViewer();
  const { settings: simulation, layers, compare } = useSimulation();
  const { activeSite } = useObservation();
  const { skyActivity } = useAgentActivity();
  const { t, locale } = useLocale();
  const [now, setNow] = useState(() => Date.now());
  const model = useMemo<SkyContextModel>(
    () => buildSkyContextModel({
      activeSite,
      observation,
      simulation,
      layers,
      displayOptions: options,
      skyMode,
      metrics,
      compareLabel: compare?.changedLabel ?? null,
    }),
    [activeSite, observation, simulation, layers, options, skyMode, metrics, compare],
  );

  useEffect(() => {
    if (skyActivity === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next - skyActivity.updatedAt >= 5000) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [skyActivity]);

  const effectiveChanges = skyActivity?.changes ?? [];
  const currentSkyRows = buildCurrentSkyRows(model, skyActivity);
  const announcement = skyActivity === null || effectiveChanges.length === 0
    ? ""
    : effectiveChanges.length === 1
      ? t("ctx.announcementOne", { fields: labelForChange(model, effectiveChanges[0].field, t) })
      : t("ctx.announcement", {
        count: effectiveChanges.length,
        fields: effectiveChanges.map((change) => labelForChange(model, change.field, t)).join(", "),
      });

  return (
    <section className={compact ? "sky-context-panel sky-context-panel-compact" : "sky-context-panel"} aria-labelledby="live-context-title">
      <div className="sky-context-status-row">
        <h2 id="live-context-title">{compact ? t("ctx.titleCompact") : t("ctx.title")}</h2>
      </div>
      {skyActivity !== null && (
        <div className="sky-activity-summary" aria-label={t("ctx.activityAria")}>
          <strong>{t("ctx.updatedVia")} · {relativeActivityTime(skyActivity.updatedAt, now, t, locale)}</strong>
          {effectiveChanges.length > 0 && (
            <span>
              {effectiveChanges.length === 1
                ? t("ctx.settingsUpdatedOne")
                : t("ctx.settingsUpdated", { count: effectiveChanges.length })}
            </span>
          )}
        </div>
      )}
      <div className="sky-context-live-region" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {compact ? (
          <ContextSection title={t("ctx.titleCompact")} rows={currentSkyRows} activity={skyActivity} now={now} t={t} />
      ) : (
        <>
          <ContextSection title={t("ctx.observation")} rows={model.observation} activity={skyActivity} now={now} t={t} />
          <ContextSection title={t("ctx.visibility")} rows={model.visibility} activity={skyActivity} now={now} t={t} />
          <ContextSection title={t("ctx.display")} rows={model.display} activity={skyActivity} now={now} t={t} />
        </>
      )}
      {model.compareLabel !== null && (
        <div className="sky-context-compare-row">
          <span>{t("ctx.viewMode")}</span>
          <strong>{t("ctx.comparing", { label: model.compareLabel })}</strong>
        </div>
      )}
    </section>
  );
}

function ContextSection({
  title,
  rows,
  activity,
  now,
  t,
}: {
  title: string;
  rows: SkyContextRow[];
  activity: ReturnType<typeof useAgentActivity>["skyActivity"];
  now: number;
  t: LocaleState["t"];
}) {
  return (
    <section className="sky-context-section" aria-labelledby={`sky-context-${title.toLowerCase().replace(/ /g, "-")}`}>
      <h3 id={`sky-context-${title.toLowerCase().replace(/ /g, "-")}`}>{title}</h3>
      <dl className="sky-context-list">
        {rows.map((row) => {
          const change = activity?.changes.find((item) => item.field === row.field);
          const elapsed = activity === null ? Infinity : now - activity.updatedAt;
          const currentMatches = change === undefined || valuesEqual(row.raw, change.after);
          const highlighted = change !== undefined && currentMatches && elapsed < 2500;
          const showChange = change !== undefined && currentMatches && elapsed < 5000;
          return (
            <div className={highlighted ? "sky-context-row changed" : "sky-context-row"} key={row.field}>
              <dt>{t(fieldLabelKey(row.field))}</dt>
              <dd>
                <span>{row.value}</span>
                {showChange && <small className="sky-context-diff">{t("ctx.updatedVia")}</small>}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function labelForChange(
  model: SkyContextModel,
  field: SkyContextField,
  t: LocaleState["t"],
): string {
  const row = [...model.observation, ...model.visibility, ...model.display].find(
    (item) => item.field === field,
  );
  return row === undefined ? field : t(fieldLabelKey(row.field));
}

function relativeActivityTime(timestamp: number, now: number, t: LocaleState["t"], locale: Locale): string {
  if (now - timestamp < 60_000) return t("ctx.justNow");
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(timestamp);
}
