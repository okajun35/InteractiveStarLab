import { useMemo } from "react";
import { useStarViewer } from "../state/context";
import { useSimulation } from "../state/simulation";
import { createContext } from "../astronomy/observer";
import { sunPosition } from "../astronomy/sun";
import { evaluateStar, reasonLabel } from "../astronomy/visibilityModel";
import { MAGNITUDE_LAYERS, LIGHT_POLLUTION_LABELS, layerOf } from "../astronomy/magnitude";
import { CONSTELLATIONS, STARS } from "../astronomy/stars";

export function ObjectInfo() {
  const { settings, selectedStar, selectStar, selectedSun, selectSun, horizontal } =
    useStarViewer();
  const { layers, settings: sim } = useSimulation();

  const sun = useMemo(() => {
    try {
      return sunPosition(createContext(settings));
    } catch {
      return null;
    }
  }, [settings]);

  if (selectedSun) {
    return (
      <section className="object-info" aria-label="Selected object">
        <div className="object-info-head">
          <div className="object-name">
            <span className="object-name-main">Sun</span>
            <span className="object-name-sub">Star (G2V)</span>
          </div>
          <button
            type="button"
            onClick={() => selectSun(false)}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <dl>
          <div>
            <dt>
              Altitude
            </dt>
            <dd>{sun ? `${sun.altitude.toFixed(1)}°` : "—"}</dd>
          </div>
          <div>
            <dt>
              Azimuth
            </dt>
            <dd>{sun ? `${sun.azimuth.toFixed(1)}°` : "—"}</dd>
          </div>
        </dl>
        {sun && (
          <p className="object-info-hint">
            {sun.altitude > 0
              ? "The Sun is above the horizon. Daylight makes stars harder to see."
              : "The Sun is below the horizon, so stars may be visible in the night sky."}
          </p>
        )}
      </section>
    );
  }

  if (!selectedStar) {
    return (
      <section className="object-info empty" aria-label="Selected object">
        Select a star to view its details
      </section>
    );
  }

  const pos = horizontal.find((s) => s.id === selectedStar.id);

  const status = pos
    ? evaluateStar(pos, layers, sim, sun?.altitude ?? -90)
    : { state: "disabled" as const };

  const constellation = selectedStar.constellation
    ? CONSTELLATIONS.find((c) => c.name === selectedStar.constellation)
    : undefined;
  const constellationStars = constellation
    ? constellation.lines
        .flat()
        .map((id) => STARS.find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => s !== undefined)
    : [];
  const brightest = constellationStars.slice().sort((a, b) => a.magnitude - b.magnitude)[0];

  return (
    <section className="object-info" aria-label="Selected object">
      <div className="object-info-head">
        <div className="object-name">
          <span className="object-name-main">{selectedStar.name}</span>
        </div>
        <button type="button" onClick={() => selectStar(null)} aria-label="Close">
          ×
        </button>
      </div>
      <dl>
        <div>
          <dt>
            Magnitude
          </dt>
          <dd>{selectedStar.magnitude.toFixed(2)}</dd>
        </div>
        <div>
          <dt>
            Brightness group
          </dt>
          <dd>{MAGNITUDE_LAYERS.find((layer) => layer.id === layerOf(selectedStar.magnitude))?.name}</dd>
        </div>
        <div>
          <dt>
            Constellation
          </dt>
          <dd>
            {constellation
              ? constellation.name
              : selectedStar.constellation ?? "—"}
          </dd>
        </div>
        {pos && (
          <div>
            <dt>
              Exists above horizon
            </dt>
            <dd>{pos.altitude >= 0 ? "Yes" : "No"}</dd>
          </div>
        )}
        {pos && (
          <div>
            <dt>
              Visible in simulation
            </dt>
            <dd className={status.state === "visible" ? "vis-ok" : "vis-hidden"}>
              {status.state === "visible" ? "Yes" : "No"}
            </dd>
          </div>
        )}
        {pos && status.state === "hidden" && (
          <div>
            <dt>
              Reason
            </dt>
            <dd>{reasonLabel(status.reason, sim.daylightMode)}</dd>
          </div>
        )}
        {pos && (
          <>
            <div>
              <dt>
              Altitude
              </dt>
              <dd>{pos.altitude.toFixed(1)}°</dd>
            </div>
            <div>
              <dt>
              Azimuth
              </dt>
              <dd>{pos.azimuth.toFixed(1)}°</dd>
            </div>
          </>
        )}
      </dl>

      {constellation && (
        <aside className="constellation-card">
          <h3>
            {constellation.name}
          </h3>
          {brightest && (
            <p>
              Brightest star: {brightest.name} (mag {brightest.magnitude.toFixed(1)})
            </p>
          )}
          <p>{constellation.description ?? "No description available."}</p>
        </aside>
      )}

      <p className="object-info-hint">
        Light pollution: {LIGHT_POLLUTION_LABELS[sim.lightPollution]} (limit ≈{" "}
        {sim.limitingMagnitude.toFixed(1)}) / Daylight mode: {sim.daylightMode === "real" ? "REAL" : "REMOVED"}
      </p>
    </section>
  );
}
