import { useStarViewer } from "../state/context";
import { useLocale, type MessageKey } from "../i18n";

export function DisplayOptions() {
  const { options, updateOptions } = useStarViewer();
  const { t } = useLocale();

  const items: Array<{
    key: keyof typeof options;
    labelKey: MessageKey;
  }> = [
    { key: "stars", labelKey: "display.stars" },
    { key: "starNames", labelKey: "display.starNames" },
    { key: "constellationLines", labelKey: "display.constellationLines" },
    { key: "constellationNames", labelKey: "display.constellationNames" },
    { key: "milkyWay", labelKey: "display.milkyWay" },
    { key: "denseStars", labelKey: "display.denseStars" },
    { key: "deepSky", labelKey: "display.deepSky" },
    { key: "nightMode", labelKey: "display.nightMode" },
  ];

  return (
    <fieldset className="display-options">
      <legend>
        {t("display.legend")}
      </legend>
      {items.map((item) => (
        <label key={item.key} className="display-option">
          <input
            type="checkbox"
            checked={options[item.key]}
            onChange={(e) => updateOptions({ [item.key]: e.target.checked })}
          />
          <span>{t(item.labelKey)}</span>
        </label>
      ))}
    </fieldset>
  );
}
