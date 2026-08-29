import { PLACE_PRESETS } from "../../astronomy/directions";
import type { ObservationSite } from "../../types/observation";

export interface SiteEditorErrors {
  name?: string;
  latitude?: string;
  longitude?: string;
}

interface SiteEditorProps {
  site: ObservationSite;
  errors: SiteEditorErrors;
  onChange: (patch: Partial<ObservationSite>) => void;
}

export function SiteEditor({ site, errors, onChange }: SiteEditorProps) {
  const currentPreset = PLACE_PRESETS.find(
    (place) =>
      place.latitude === site.latitude && place.longitude === site.longitude,
  );

  return (
    <section className="workflow-card" aria-labelledby="site-editor-title">
      <div className="workflow-card-heading">
        <div>
          <span className="en">Observation site</span>
          <h2 id="site-editor-title">観測地点</h2>
        </div>
        <span className="step-badge">1</span>
      </div>

      <label className="workflow-field">
        <span className="workflow-field-label">
          <span className="en">Name</span> 地点名
        </span>
        <input
          type="text"
          value={site.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="例：自宅ベランダ"
          className={errors.name ? "invalid" : undefined}
        />
        {errors.name && <span className="workflow-error">{errors.name}</span>}
      </label>

      <div className="workflow-field-row">
        <label className="workflow-field">
          <span className="workflow-field-label">
            <span className="en">Latitude</span> 緯度
          </span>
          <input
            type="number"
            min={-90}
            max={90}
            step={0.0001}
            value={Number.isFinite(site.latitude) ? site.latitude : ""}
            onChange={(event) =>
              onChange({ latitude: parseNumberInput(event.target.value) })
            }
            className={errors.latitude ? "invalid" : undefined}
          />
          {errors.latitude && <span className="workflow-error">{errors.latitude}</span>}
        </label>
        <label className="workflow-field">
          <span className="workflow-field-label">
            <span className="en">Longitude</span> 経度
          </span>
          <input
            type="number"
            min={-180}
            max={180}
            step={0.0001}
            value={Number.isFinite(site.longitude) ? site.longitude : ""}
            onChange={(event) =>
              onChange({ longitude: parseNumberInput(event.target.value) })
            }
            className={errors.longitude ? "invalid" : undefined}
          />
          {errors.longitude && <span className="workflow-error">{errors.longitude}</span>}
        </label>
      </div>

      <label className="workflow-field">
        <span className="workflow-field-label">
          <span className="en">Presets</span> 場所プリセット
        </span>
        <select
          className="place-select"
          value={currentPreset?.id ?? "custom"}
          onChange={(event) => {
            const place = PLACE_PRESETS.find((item) => item.id === event.target.value);
            if (!place) return;
            onChange({
              id: place.id,
              name: `${place.en} ${place.ja}`,
              latitude: place.latitude,
              longitude: place.longitude,
            });
          }}
        >
          <option value="custom">カスタム（手入力）</option>
          {PLACE_PRESETS.map((place) => (
            <option key={place.id} value={place.id}>
              {place.en} {place.ja}
            </option>
          ))}
        </select>
      </label>

      <p className="workflow-note">
        緯度・経度は星の高度と方位の計算に使います。現在地の取得に失敗しても、ここへ手入力できます。
      </p>
    </section>
  );
}

function parseNumberInput(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}
