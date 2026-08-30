import { useStarViewer } from "../state/context";

const CARDINALS: Array<{ key: string; azimuth: number; label: string }> = [
  { key: "N", azimuth: 0, label: "North" },
  { key: "E", azimuth: 90, label: "East" },
  { key: "S", azimuth: 180, label: "South" },
  { key: "W", azimuth: 270, label: "West" },
];

export function DirectionControl() {
  const { settings, updateSettings, errors } = useStarViewer();

  return (
    <div className="field">
      <span className="field-label">
        Direction
        <span className="field-value">
          {Math.round(settings.azimuth)}° {cardinalName(settings.azimuth)}
        </span>
      </span>

      <div className="compass" role="group" aria-label="Cardinal directions">
        {CARDINALS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={
              Math.round(settings.azimuth) === c.azimuth ? "compass-btn active" : "compass-btn"
            }
            onClick={() => updateSettings({ azimuth: c.azimuth })}
          >
            {c.key}
            <span className="compass-btn-label">{c.label}</span>
          </button>
        ))}
      </div>

      <input
        type="range"
        min={0}
        max={360}
        step={1}
        value={settings.azimuth}
        onChange={(e) => updateSettings({ azimuth: Number(e.target.value) })}
        className={errors?.azimuth ? "invalid" : undefined}
      />
      <ErrorLine message={errors?.azimuth} />
    </div>
  );
}

function cardinalName(azimuth: number): string {
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(((azimuth % 360) / 45)) % 8;
  return names[idx] ?? "";
}

function ErrorLine({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="field-error">{message}</p>;
}
