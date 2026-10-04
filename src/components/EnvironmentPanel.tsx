import type { LightPollution } from "../types/astronomy";
import { useSimulation } from "../state/simulation";
import {
  LIMITING_MAGNITUDE_RANGE,
  lightPollutionLimit,
  OBSERVER_SENSITIVITY_RANGE,
} from "../astronomy/magnitude";
import { useLocale, type MessageKey } from "../i18n";

const LEVEL_ORDER: Array<{ level: LightPollution; labelKey: MessageKey }> = [
  { level: "city-center", labelKey: "lp.city-center" },
  { level: "urban", labelKey: "lp.urban" },
  { level: "suburban", labelKey: "lp.suburban" },
  { level: "dark-sky", labelKey: "lp.dark-sky" },
  { level: "perfect", labelKey: "lp.perfect" },
];

/**
 * Environment panel: daylight mode, light pollution preset, advanced
 * limiting magnitude, hidden-stars toggle (spec §11, §13, §16-§19).
 */
export function EnvironmentPanel() {
  const {
    settings,
    setDaylightMode,
    setLightPollution,
    setLimitingMagnitude,
    setShowHiddenStars,
    customLimitingMagnitude,
    observerSensitivity,
    setObserverSensitivity,
  } = useSimulation();
  const { t } = useLocale();

  const SENS_PRESETS = [
    { value: OBSERVER_SENSITIVITY_RANGE.min, labelKey: "sens.dull" as const },
    { value: 0, labelKey: "sens.typical" as const },
    { value: OBSERVER_SENSITIVITY_RANGE.max, labelKey: "sens.sharp" as const },
  ];

  return (
    <fieldset className="panel-group">
      <legend>
        {t("env.legend")}
      </legend>

      {/* Daylight (spec §13-§14) */}
      <div className="field">
        <span className="field-label">
          {t("env.daylight")}
        </span>
        <div className="seg-group" role="group" aria-label={t("env.daylightGroup")}>
          <button
            type="button"
            className={settings.daylightMode === "real" ? "seg active" : "seg"}
            onClick={() => setDaylightMode("real")}
          >
            {t("env.daylightReal")}
          </button>
          <button
            type="button"
            className={settings.daylightMode === "removed" ? "seg active" : "seg"}
            onClick={() => setDaylightMode("removed")}
            title={t("env.daylightRemovedTitle")}
          >
            {t("env.daylightRemoved")}
          </button>
        </div>
        {settings.daylightMode === "removed" && (
          <p className="panel-note">
            {t("env.daylightRemovedNote")}
          </p>
        )}
      </div>

      {/* Light pollution presets (spec §16-§17) */}
      <div className="field">
        <span className="field-label">
          {t("env.lightPollution")}
          <span className="field-value">
            {t("env.limit", { mag: settings.limitingMagnitude.toFixed(1) })}
          </span>
        </span>
        <div className="seg-group cols-5" role="group" aria-label={t("env.lightPollutionGroup")}>
          {LEVEL_ORDER.map((lv) => (
            <button
              key={lv.level}
              type="button"
              className={settings.lightPollution === lv.level ? "seg active" : "seg"}
              onClick={() => setLightPollution(lv.level)}
              title={t(lv.labelKey)}
            >
              {t(lv.labelKey)}
              <span className="seg-sub">{lightPollutionLimit(lv.level).toFixed(1)}</span>
            </button>
          ))}
        </div>
        <p className="panel-note">
          {t("env.lightPollutionNote")}
        </p>
      </div>

      {/* Observer sensitivity (spec §20 — distinct from visual acuity). */}
      <div className="field">
        <span className="field-label">
          {t("env.sensitivity")}
          <span className="field-value">
            {observerSensitivity > 0 ? "+" : ""}
            {observerSensitivity.toFixed(2)}
          </span>
        </span>
        <div className="seg-group cols-3" role="group" aria-label={t("env.sensitivityGroup")}>
          {SENS_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={observerSensitivity === p.value ? "seg active" : "seg"}
              onClick={() => setObserverSensitivity(p.value)}
              title={t(p.labelKey)}
            >
              {t(p.labelKey)}
              <span className="seg-sub">{p.value > 0 ? "+" : ""}{p.value.toFixed(1)}</span>
            </button>
          ))}
        </div>
        <input
          type="range"
          min={OBSERVER_SENSITIVITY_RANGE.min}
          max={OBSERVER_SENSITIVITY_RANGE.max}
          step={OBSERVER_SENSITIVITY_RANGE.step}
          value={observerSensitivity}
          onChange={(e) => setObserverSensitivity(Number(e.target.value))}
        />
        <span className="range-ends">
          <span>{t("env.sensLess")}</span>
          <span>{t("env.sensTypical")}</span>
          <span>{t("env.sensMore")}</span>
        </span>
        <p className="panel-note">
          {t("env.sensitivityNote")}
        </p>
      </div>

      {/* Advanced: limiting magnitude (spec §19) */}
      <details className="advanced">
        <summary>
          {t("env.advanced")}
        </summary>
        <div className="field">
          <span className="field-label">
            {t("env.limitingMagnitude")}
            <span className="field-value">
              {settings.limitingMagnitude.toFixed(1)}
              {customLimitingMagnitude ? ` ${t("env.custom")}` : ""}
            </span>
          </span>
          <input
            type="range"
            min={LIMITING_MAGNITUDE_RANGE.min}
            max={LIMITING_MAGNITUDE_RANGE.max}
            step={0.1}
            value={settings.limitingMagnitude}
            onChange={(e) => setLimitingMagnitude(Number(e.target.value))}
          />
          <span className="range-ends">
            <span>{t("env.rangeBright")}</span>
            <span>{t("env.rangeAll")}</span>
          </span>
        </div>
      </details>

      {/* Show hidden stars (spec §11) */}
      <label className="display-option">
        <input
          type="checkbox"
          checked={settings.showHiddenStars}
          onChange={(e) => setShowHiddenStars(e.target.checked)}
        />
        <span className="en">{t("env.showHidden")}</span>
        <span>{t("env.showHiddenHint")}</span>
      </label>
    </fieldset>
  );
}
