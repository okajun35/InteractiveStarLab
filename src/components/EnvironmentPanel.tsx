import type { LightPollution } from "../types/astronomy";
import {
  useSimulation,
  LIGHT_POLLUTION_LABELS,
} from "../state/simulation";
import {
  LIMITING_MAGNITUDE_RANGE,
  lightPollutionLimit,
  OBSERVER_SENSITIVITY_RANGE,
  OBSERVER_SENSITIVITY_LABELS,
} from "../astronomy/magnitude";

const LEVEL_ORDER: LightPollution[] = [
  "city-center",
  "urban",
  "suburban",
  "dark-sky",
  "perfect",
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

  const SENS_PRESETS = [
    { value: OBSERVER_SENSITIVITY_RANGE.min, label: OBSERVER_SENSITIVITY_LABELS.dull },
    { value: 0, label: OBSERVER_SENSITIVITY_LABELS.typical },
    { value: OBSERVER_SENSITIVITY_RANGE.max, label: OBSERVER_SENSITIVITY_LABELS.sharp },
  ] as const;

  return (
    <fieldset className="panel-group">
      <legend>
        Environment simulation
      </legend>

      {/* Daylight (spec §13-§14) */}
      <div className="field">
        <span className="field-label">
          Daylight
        </span>
        <div className="seg-group" role="group" aria-label="Daylight mode">
          <button
            type="button"
            className={settings.daylightMode === "real" ? "seg active" : "seg"}
            onClick={() => setDaylightMode("real")}
          >
            ☀ REAL daylight
          </button>
          <button
            type="button"
            className={settings.daylightMode === "removed" ? "seg active" : "seg"}
            onClick={() => setDaylightMode("removed")}
            title="Virtual view with sky brightness removed while keeping the date and star positions unchanged (§14)"
          >
            🌌 What-if: dark sky
          </button>
        </div>
        {settings.daylightMode === "removed" && (
          <p className="panel-note">
            The time, Sun, and star positions stay the same; only sky brightness is ignored.
          </p>
        )}
      </div>

      {/* Light pollution presets (spec §16-§17) */}
      <div className="field">
        <span className="field-label">
          Light pollution
          <span className="field-value">
            limit ≈ {settings.limitingMagnitude.toFixed(1)}
          </span>
        </span>
        <div className="seg-group cols-5" role="group" aria-label="Light pollution level">
          {LEVEL_ORDER.map((lv) => (
            <button
              key={lv}
              type="button"
              className={settings.lightPollution === lv ? "seg active" : "seg"}
              onClick={() => setLightPollution(lv)}
              title={LIGHT_POLLUTION_LABELS[lv]}
            >
              {LIGHT_POLLUTION_LABELS[lv]}
              <span className="seg-sub">{lightPollutionLimit(lv).toFixed(1)}</span>
            </button>
          ))}
        </div>
        <p className="panel-note">
          Educational approximation (§17): faint stars become harder to see as the sky gets brighter.
        </p>
      </div>

      {/* Observer sensitivity (spec §20 — distinct from visual acuity). */}
      <div className="field">
        <span className="field-label">
        Observer sensitivity
          <span className="field-value">
            {observerSensitivity > 0 ? "+" : ""}
            {observerSensitivity.toFixed(2)}
          </span>
        </span>
        <div className="seg-group cols-3" role="group" aria-label="Observer sensitivity">
          {SENS_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={observerSensitivity === p.value ? "seg active" : "seg"}
              onClick={() => setObserverSensitivity(p.value)}
              title={p.label}
            >
              {p.label}
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
          <span>Less sensitive</span>
          <span>Typical</span>
          <span>More sensitive</span>
        </span>
        <p className="panel-note">
          This separate educational model adjusts the limiting magnitude by ±0.5; it is not a visual-acuity value (§20).
        </p>
      </div>

      {/* Advanced: limiting magnitude (spec §19) */}
      <details className="advanced">
        <summary>
          Advanced: set limiting magnitude directly
        </summary>
        <div className="field">
          <span className="field-label">
            Limiting magnitude
            <span className="field-value">
              {settings.limitingMagnitude.toFixed(1)}
              {customLimitingMagnitude ? " (custom)" : ""}
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
            <span>1.0 brightest stars only</span>
            <span>6.5 nearly all stars</span>
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
        <span className="en">Show hidden stars</span>
        <span>Show existing but invisible stars faintly</span>
      </label>
    </fieldset>
  );
}
