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
        Before / After
      </legend>
      <div className="seg-group cols-3" role="group" aria-label="Comparison type">
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
            Time basis
          </span>
          <div className="seg-group" role="group" aria-label="Time basis">
            {(Object.keys(TIME_BASIS_LABELS) as TimeBasis[]).map((k) => (
              <button
                key={k}
                type="button"
                className={timeBasis === k ? "seg active" : "seg"}
                // setTimeBasis atomically re-applies the active location compare.
                onClick={() => setTimeBasis(k)}
              >
                {TIME_BASIS_LABELS[k]}
              </button>
            ))}
          </div>
          <p className="panel-note">
            {timeBasis === "same-local-time"
              ? "Compare the sky at the same local time on both sides (§27)."
              : "Compare the sky at the same UTC instant on both sides."}
          </p>
        </div>
      )}
      {compare && (
        <p className="panel-note">
          Comparing {compare.baseLabel} and {compare.changedLabel} side by side.
          Date, direction, and field of view are matched on both sides (§22).
        </p>
      )}
    </fieldset>
  );
}

export { LIGHT_POLLUTION_LABELS };
