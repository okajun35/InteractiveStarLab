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
    { value: OBSERVER_SENSITIVITY_RANGE.min, ...OBSERVER_SENSITIVITY_LABELS.dull },
    { value: 0, ...OBSERVER_SENSITIVITY_LABELS.typical },
    { value: OBSERVER_SENSITIVITY_RANGE.max, ...OBSERVER_SENSITIVITY_LABELS.sharp },
  ] as const;

  return (
    <fieldset className="panel-group">
      <legend>
        <span className="en">Environment</span> 環境シミュレーション
      </legend>

      {/* Daylight (spec §13-§14) */}
      <div className="field">
        <span className="field-label">
          <span className="en">Daylight</span> 昼間の空
        </span>
        <div className="seg-group" role="group" aria-label="昼間モード">
          <button
            type="button"
            className={settings.daylightMode === "real" ? "seg active" : "seg"}
            onClick={() => setDaylightMode("real")}
          >
            ☀ REAL 昼空
          </button>
          <button
            type="button"
            className={settings.daylightMode === "removed" ? "seg active" : "seg"}
            onClick={() => setDaylightMode("removed")}
            title="日時・星の位置を変えず、空の明るさを除いた仮想表示（§14）"
          >
            🌌 What-if 空だけ暗く
          </button>
        </div>
        {settings.daylightMode === "removed" && (
          <p className="panel-note">
            時刻・太陽・星の位置はそのままです。空の明るさを無視した見せ方です。
          </p>
        )}
      </div>

      {/* Light pollution presets (spec §16-§17) */}
      <div className="field">
        <span className="field-label">
          <span className="en">Light Pollution</span> 光害
          <span className="field-value">
            limit ≈ {settings.limitingMagnitude.toFixed(1)}
          </span>
        </span>
        <div className="seg-group cols-5" role="group" aria-label="光害レベル">
          {LEVEL_ORDER.map((lv) => (
            <button
              key={lv}
              type="button"
              className={settings.lightPollution === lv ? "seg active" : "seg"}
              onClick={() => setLightPollution(lv)}
              title={LIGHT_POLLUTION_LABELS[lv].ja}
            >
              {LIGHT_POLLUTION_LABELS[lv].en}
              <span className="seg-sub">{lightPollutionLimit(lv).toFixed(1)}</span>
            </button>
          ))}
        </div>
        <p className="panel-note">
          教育用近似です（Educational Approximation、§17）。暗い星ほど空が明るいと見えにくくなります。
        </p>
      </div>

      {/* Observer sensitivity (spec §20 — distinct model, NOT a視力 value) */}
      <div className="field">
        <span className="field-label">
          <span className="en">Observer Sensitivity</span> 観察者の感受性
          <span className="field-value">
            {observerSensitivity > 0 ? "+" : ""}
            {observerSensitivity.toFixed(2)}
          </span>
        </span>
        <div className="seg-group cols-3" role="group" aria-label="観察者の感受性">
          {SENS_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={observerSensitivity === p.value ? "seg active" : "seg"}
              onClick={() => setObserverSensitivity(p.value)}
              title={p.ja}
            >
              {p.en}
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
          <span>感受性が低い</span>
          <span>標準</span>
          <span>感受性が高い</span>
        </span>
        <p className="panel-note">
          視力そのものではなく、見える限界等級に ±0.5 等級の補正をかける別モデルです（教育用近似・§20）。
        </p>
      </div>

      {/* Advanced: limiting magnitude (spec §19) */}
      <details className="advanced">
        <summary>
          <span className="en">Advanced</span> 限界等級（直接指定）
        </summary>
        <div className="field">
          <span className="field-label">
            <span className="en">Limiting Magnitude</span> 見える最大等級
            <span className="field-value">
              {settings.limitingMagnitude.toFixed(1)}
              {customLimitingMagnitude ? "（カスタム）" : ""}
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
            <span>1.0 明るい星のみ</span>
            <span>6.5 ほぼ全天</span>
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
        <span>存在するが見えない星を薄く表示</span>
      </label>
    </fieldset>
  );
}
