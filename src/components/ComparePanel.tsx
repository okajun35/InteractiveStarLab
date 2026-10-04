import { useSimulation, LIGHT_POLLUTION_LABELS } from "../state/simulation";
import type { TimeBasis } from "../astronomy/timezones";
import { useLocale, type MessageKey } from "../i18n";

const TIME_BASIS_KEYS: Record<TimeBasis, MessageKey> = {
  "same-local-time": "timeBasis.same-local-time",
  "same-utc-instant": "timeBasis.same-utc-instant",
};

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
  const { t } = useLocale();

  const kinds: Array<{ id: "daylight" | "light-pollution" | "location"; labelKey: MessageKey }> = [
    { id: "daylight", labelKey: "cmp.daylight" },
    { id: "light-pollution", labelKey: "cmp.lightPollution" },
    { id: "location", labelKey: "cmp.location" },
  ];

  return (
    <fieldset className="panel-group">
      <legend>
        {t("cmp.legend")}
      </legend>
      <div className="seg-group cols-3" role="group" aria-label={t("cmp.group")}>
        {kinds.map((k) => (
          <button
            key={k.id}
            type="button"
            className={compare?.kind === k.id ? "seg active" : "seg"}
            onClick={() =>
              setCompareKind(compare?.kind === k.id ? null : k.id)
            }
          >
            {t(k.labelKey)}
          </button>
        ))}
      </div>
      {compare?.kind === "location" && (
        <div className="field">
        <span className="field-label">
            {t("cmp.timeBasis")}
          </span>
          <div className="seg-group" role="group" aria-label={t("cmp.timeBasis")}>
            {(Object.keys(TIME_BASIS_KEYS) as TimeBasis[]).map((k) => (
              <button
                key={k}
                type="button"
                className={timeBasis === k ? "seg active" : "seg"}
                // setTimeBasis atomically re-applies the active location compare.
                onClick={() => setTimeBasis(k)}
              >
                {t(TIME_BASIS_KEYS[k])}
              </button>
            ))}
          </div>
          <p className="panel-note">
            {timeBasis === "same-local-time" ? t("cmp.noteLocal") : t("cmp.noteUtc")}
          </p>
        </div>
      )}
      {compare && (
        <p className="panel-note">
          {t("cmp.active", { base: compare.baseLabel, changed: compare.changedLabel })}
        </p>
      )}
    </fieldset>
  );
}

export { LIGHT_POLLUTION_LABELS };
