import { useMemo } from "react";
import { useSimulation } from "../state/simulation";
import { useStarViewer } from "../state/context";
import { MAGNITUDE_LAYERS } from "../astronomy/magnitude";
import { countByLayer } from "../astronomy/layerCounts";
import { useLocale, type MessageKey } from "../i18n";

const LAYER_LABELS: Record<(typeof MAGNITUDE_LAYERS)[number]["id"], MessageKey> = {
  first: "layer.first",
  second: "layer.second",
  third: "layer.third",
  fourth: "layer.fourth",
  faint: "layer.faint",
};

/**
 * "Stars by Brightness" panel (spec §6–§8).
 * Each magnitude layer is independently toggleable, with the live count of
 * stars currently in the view.
 */
export function MagnitudeLayers() {
  const { layers, setLayerEnabled, enableAll } = useSimulation();
  const { horizontal, settings } = useStarViewer();
  const { t } = useLocale();

  const counts = useMemo(
    () => countByLayer(horizontal, settings),
    [horizontal, settings],
  );

  return (
    <fieldset className="panel-group">
      <legend>
        {t("layers.legend")}
        <span className="panel-group-actions">
          <button type="button" onClick={() => enableAll(true)}>
            {t("layers.enableAll")}
          </button>
          <button type="button" onClick={() => enableAll(false)}>
            {t("layers.disableAll")}
          </button>
        </span>
      </legend>
      {MAGNITUDE_LAYERS.map((l) => (
        <label key={l.id} className="layer-row">
          <input
            type="checkbox"
            checked={layers[l.id]}
            onChange={(e) => setLayerEnabled(l.id, e.target.checked)}
          />
          <span className="layer-dot" data-mag={l.id} aria-hidden="true" />
          <span className="layer-name">{t(LAYER_LABELS[l.id])}</span>
          <span className="layer-range en">
            {Number.isFinite(l.min)
              ? `mag ${l.min.toFixed(1)}–${l.max.toFixed(1)}`
              : `mag < ${l.max.toFixed(1)}`}
          </span>
          <span className="layer-count">{counts[l.id]}</span>
        </label>
      ))}
      <p className="panel-note">
        {t("layers.note")}
      </p>
    </fieldset>
  );
}
