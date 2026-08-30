import { useStarViewer } from "../state/context";

export function DisplayOptions() {
  const { options, updateOptions } = useStarViewer();

  const items: Array<{
    key: keyof typeof options;
    label: string;
  }> = [
    { key: "stars", label: "Stars" },
    { key: "starNames", label: "Star Names" },
    { key: "constellationLines", label: "Constellation Lines" },
    { key: "constellationNames", label: "Constellation Names" },
  ];

  return (
    <fieldset className="display-options">
      <legend>
        Display
      </legend>
      {items.map((item) => (
        <label key={item.key} className="display-option">
          <input
            type="checkbox"
            checked={options[item.key]}
            onChange={(e) => updateOptions({ [item.key]: e.target.checked })}
          />
          <span>{item.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
