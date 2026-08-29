import { useStarViewer } from "../state/context";
import { DirectionControl } from "./DirectionControl";
import { TimeControl } from "./TimeControl";
import { DisplayOptions } from "./DisplayOptions";
import { applyPlace, PLACE_PRESETS } from "../astronomy/directions";

export function ObservationPanel() {
  const { settings, updateSettings, errors } = useStarViewer();

  const currentPlace = PLACE_PRESETS.find(
    (p) =>
      Math.abs(p.latitude - settings.latitude) < 1e-6 &&
      Math.abs(p.longitude - settings.longitude) < 1e-6,
  );

  return (
    <section className="panel" aria-label="観察条件">
      <h2 className="panel-title">
        <span className="en">Location</span> 観測地点
      </h2>

      <div className="field-row">
        <label className="field">
          <span className="field-label">
            <span className="en">Latitude</span> 緯度
          </span>
          <input
            type="number"
            min={-90}
            max={90}
            step={0.0001}
            value={Number.isFinite(settings.latitude) ? settings.latitude : ""}
            onChange={(e) =>
              updateSettings({ latitude: Number(e.target.value) })
            }
            className={errors?.latitude ? "invalid" : undefined}
          />
        </label>
        <label className="field">
          <span className="field-label">
            <span className="en">Longitude</span> 経度
          </span>
          <input
            type="number"
            min={-180}
            max={180}
            step={0.0001}
            value={
              Number.isFinite(settings.longitude) ? settings.longitude : ""
            }
            onChange={(e) =>
              updateSettings({ longitude: Number(e.target.value) })
            }
            className={errors?.longitude ? "invalid" : undefined}
          />
        </label>
      </div>
      <ErrorLine message={errors?.latitude} />
      <ErrorLine message={errors?.longitude} />

      <div className="field">
        <span className="field-label">
          <span className="en">Place presets</span> 場所プリセット
        </span>
        <select
          className="place-select"
          value={currentPlace ? currentPlace.id : "custom"}
          onChange={(e) => {
            const place = PLACE_PRESETS.find((p) => p.id === e.target.value);
            if (place) updateSettings(applyPlace(place));
          }}
        >
          <option value="custom" disabled>
            カスタム（手入力）
          </option>
          {PLACE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.en} {p.ja}
            </option>
          ))}
        </select>
      </div>

      <TimeControl />

      <DirectionControl />

      <div className="field">
        <span className="field-label">
          <span className="en">Altitude</span> 仰角
          <span className="field-value">{Math.round(settings.altitude)}°</span>
        </span>
        <input
          type="range"
          min={0}
          max={90}
          step={1}
          value={settings.altitude}
          onChange={(e) => updateSettings({ altitude: Number(e.target.value) })}
          className={errors?.altitude ? "invalid" : undefined}
        />
      </div>

      <div className="field">
        <span className="field-label">
          <span className="en">Field of view</span> 視野角
          <span className="field-value">{Math.round(settings.fieldOfView)}°</span>
        </span>
        <input
          type="range"
          min={20}
          max={140}
          step={5}
          value={settings.fieldOfView}
          onChange={(e) =>
            updateSettings({ fieldOfView: Number(e.target.value) })
          }
          className={errors?.fieldOfView ? "invalid" : undefined}
        />
      </div>
      <ErrorLine message={errors?.altitude} />
      <ErrorLine message={errors?.fieldOfView} />

      <DisplayOptions />
    </section>
  );
}

function ErrorLine({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="field-error">{message}</p>;
}
