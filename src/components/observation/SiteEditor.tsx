import { PLACE_PRESETS } from "../../astronomy/directions";
import type { ObservationSite } from "../../types/observation";

export interface SiteEditorErrors {
  name?: string;
  latitude?: string;
  longitude?: string;
  timeZone?: string;
}

interface SiteEditorProps {
  site: ObservationSite;
  errors: SiteEditorErrors;
  onChange: (patch: Partial<ObservationSite>) => void;
}

export function SiteEditor({ site, errors, onChange }: SiteEditorProps) {
  const currentPreset = PLACE_PRESETS.find(
    (place) =>
      Math.abs(place.latitude - site.latitude) <= 1e-6 && Math.abs(place.longitude - site.longitude) <= 1e-6,
  );

  return (
    <section className="workflow-card" aria-labelledby="site-editor-title">
      <div className="workflow-card-heading">
        <div>
          <span className="en">Observation site</span>
          <h2 id="site-editor-title">Observation site</h2>
        </div>
        <span className="step-badge">1</span>
      </div>

      <label className="workflow-field">
        <span className="workflow-field-label">
          Name
        </span>
        <input
          type="text"
          value={site.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="e.g. Home balcony"
          className={errors.name ? "invalid" : undefined}
        />
        {errors.name && <span className="workflow-error">{errors.name}</span>}
      </label>

      <div className="workflow-field-row">
        <label className="workflow-field">
          <span className="workflow-field-label">
            Latitude
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
            Longitude
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
        <span className="workflow-field-label">Time Zone <span className="workflow-optional">Optional</span></span>
        <input
          type="text"
          value={site.timeZone ?? ""}
          onChange={(event) => onChange({ timeZone: event.target.value.trim() || undefined })}
          placeholder="e.g. Asia/Tokyo"
          className={errors.timeZone ? "invalid" : undefined}
          spellCheck={false}
        />
        {errors.timeZone && <span className="workflow-error">{errors.timeZone}</span>}
      </label>

      <label className="workflow-field">
        <span className="workflow-field-label">
          Presets
        </span>
        <select
          className="place-select"
          value={currentPreset?.id ?? "custom"}
          onChange={(event) => {
            const place = PLACE_PRESETS.find((item) => item.id === event.target.value);
            if (!place) return;
            onChange({
              id: place.id,
              name: place.name,
              latitude: place.latitude,
              longitude: place.longitude,
              timeZone: place.timeZone,
            });
          }}
        >
          <option value="custom">Custom location</option>
          {PLACE_PRESETS.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </select>
      </label>

      <p className="workflow-note">
        Latitude and longitude determine star altitude and azimuth. You can enter them manually if location access fails.
      </p>
    </section>
  );
}

function parseNumberInput(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}
