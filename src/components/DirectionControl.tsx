import { useStarViewer } from "../state/context";
import { useLocale, type MessageKey } from "../i18n";

const CARDINALS: Array<{ key: string; azimuth: number; labelKey: MessageKey }> = [
  { key: "N", azimuth: 0, labelKey: "dir.north" },
  { key: "E", azimuth: 90, labelKey: "dir.east" },
  { key: "S", azimuth: 180, labelKey: "dir.south" },
  { key: "W", azimuth: 270, labelKey: "dir.west" },
];

export function DirectionControl() {
  const { settings, updateSettings, errors } = useStarViewer();
  const { t } = useLocale();

  return (
    <div className="field">
      <span className="field-label">
        {t("panel.direction")}
        <span className="field-value">
          {Math.round(settings.azimuth)}° {cardinalName(settings.azimuth)}
        </span>
      </span>

      <div className="compass" role="group" aria-label={t("panel.directions")}>
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
            <span className="compass-btn-label">{t(c.labelKey)}</span>
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
