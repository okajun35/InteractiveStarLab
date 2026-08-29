import { useSimulation, LIGHT_POLLUTION_LABELS } from "../state/simulation";
import { TIME_BASIS_LABELS, type TimeBasis } from "../astronomy/timezones";

/**
 * Before/After compare (spec §21, §22, §47).
 * Toggles a left/right split in the main canvas area. The sidebar only holds
 * the comparison kind; the canvases are rendered by the shell.
 */
export function ComparePanel() {
  const {
    compare,
    setCompareKind,
    timeBasis,
    setTimeBasis,
  } = useSimulation();

  const kinds = [
    { id: "daylight" as const, label: "Daylight REAL vs REMOVED" },
    { id: "light-pollution" as const, label: "City vs Dark Sky" },
    { id: "location" as const, label: "Tokyo vs Sydney" },
  ];

  return (
    <fieldset className="panel-group">
      <legend>
        <span className="en">Before / After</span> 比較モード
      </legend>
      <div className="seg-group cols-3" role="group" aria-label="比較の種類">
        {kinds.map((k) => (
          <button
            key={k.id}
            type="button"
            className={compare?.kind === k.id ? "seg active" : "seg"}
            onClick={() =>
              setCompareKind(compare?.kind === k.id ? null : k.id)
            }
          >
            {k.label}
          </button>
        ))}
      </div>
      {compare?.kind === "location" && (
        <div className="field">
          <span className="field-label">
            <span className="en">Time Basis</span> 時刻の揃え方
          </span>
          <div className="seg-group" role="group" aria-label="時刻の揃え方">
            {(Object.keys(TIME_BASIS_LABELS) as TimeBasis[]).map((k) => (
              <button
                key={k}
                type="button"
                className={timeBasis === k ? "seg active" : "seg"}
                // setTimeBasis atomically re-applies the active location compare.
                onClick={() => setTimeBasis(k)}
              >
                {TIME_BASIS_LABELS[k].en}
                <span className="seg-sub">{TIME_BASIS_LABELS[k].ja}</span>
              </button>
            ))}
          </div>
          <p className="panel-note">
            {timeBasis === "same-local-time"
              ? "両側とも同じ「現地時刻」の空を見比べます（§27）。"
              : "両側とも同じ「瞬間（UTC）」の空を見比べます。"}
          </p>
        </div>
      )}
      {compare && (
        <p className="panel-note">
          {compare.baseLabel} と {compare.changedLabel} を左/右で比較中です。
          日時・方角・FOV は両方で揃えています（§22）。
        </p>
      )}
    </fieldset>
  );
}

export { LIGHT_POLLUTION_LABELS };
