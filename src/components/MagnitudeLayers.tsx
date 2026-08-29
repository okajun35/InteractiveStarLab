import { useMemo } from "react";
import { useSimulation } from "../state/simulation";
import { useStarViewer } from "../state/context";
import { MAGNITUDE_LAYERS } from "../astronomy/magnitude";
import { countByLayer } from "../astronomy/layerCounts";

/**
 * "Stars by Brightness" panel (spec §6–§8).
 * Each magnitude layer is independently toggleable, with the live count of
 * stars currently in the view.
 */
export function MagnitudeLayers() {
  const { layers, setLayerEnabled, enableAll } = useSimulation();
  const { horizontal, settings } = useStarViewer();

  const counts = useMemo(
    () => countByLayer(horizontal, settings),
    [horizontal, settings],
  );

  return (
    <fieldset className="panel-group">
      <legend>
        <span className="en">Stars by Brightness</span> 等級レイヤー
        <span className="panel-group-actions">
          <button type="button" onClick={() => enableAll(true)}>
            全体ON
          </button>
          <button type="button" onClick={() => enableAll(false)}>
            全体OFF
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
          <span className="layer-name">{l.name}</span>
          <span className="layer-range en">
            {Number.isFinite(l.min)
              ? `mag ${l.min.toFixed(1)}–${l.max.toFixed(1)}`
              : `mag < ${l.max.toFixed(1)}`}
          </span>
          <span className="layer-count">{counts[l.id]}</span>
        </label>
      ))}
      <p className="panel-note">
        数字は現在の視野内の星の数です。暗い星をONにすると一気に増えます。
      </p>
    </fieldset>
  );
}
