import { useStarViewer } from "../state/context";

export function DisplayOptions() {
  const { options, updateOptions } = useStarViewer();

  const items: Array<{
    key: keyof typeof options;
    en: string;
    ja: string;
  }> = [
    { key: "stars", en: "Stars", ja: "星" },
    { key: "starNames", en: "Star Names", ja: "星名" },
    { key: "constellationLines", en: "Constellation Lines", ja: "星座線" },
    { key: "constellationNames", en: "Constellation Names", ja: "星座名" },
  ];

  return (
    <fieldset className="display-options">
      <legend>
        <span className="en">Display</span> 表示切替
      </legend>
      {items.map((item) => (
        <label key={item.key} className="display-option">
          <input
            type="checkbox"
            checked={options[item.key]}
            onChange={(e) => updateOptions({ [item.key]: e.target.checked })}
          />
          <span className="en">{item.en}</span>
          <span>{item.ja}</span>
        </label>
      ))}
    </fieldset>
  );
}
