import { useMemo } from "react";
import { useStarViewer } from "../state/context";
import { useSimulation } from "../state/simulation";
import { createContext } from "../astronomy/observer";
import { sunPosition } from "../astronomy/sun";
import { evaluateStar, reasonLabel } from "../astronomy/visibilityModel";
import { MAGNITUDE_LAYERS, layerOf } from "../astronomy/magnitude";
import type { LightPollution } from "../types/astronomy";
import { CONSTELLATIONS, STARS } from "../astronomy/stars";
import { useLocale, type MessageKey } from "../i18n";
import { constellationDisplayName } from "../data/constellationNamesJa";

const LP_KEYS: Record<LightPollution, MessageKey> = {
  "city-center": "lp.city-center",
  urban: "lp.urban",
  suburban: "lp.suburban",
  "dark-sky": "lp.dark-sky",
  perfect: "lp.perfect",
};

const LAYER_NAME_KEYS: Record<(typeof MAGNITUDE_LAYERS)[number]["id"], MessageKey> = {
  first: "layer.first",
  second: "layer.second",
  third: "layer.third",
  fourth: "layer.fourth",
  faint: "layer.faint",
};

export function ObjectInfo() {
  const { settings, selectedStar, selectStar, selectedSun, selectSun, horizontal } =
    useStarViewer();
  const { layers, settings: sim } = useSimulation();
  const { t, locale } = useLocale();

  const sun = useMemo(() => {
    try {
      return sunPosition(createContext(settings));
    } catch {
      return null;
    }
  }, [settings]);

  if (selectedSun) {
    return (
      <section className="object-info" aria-label={t("obj.aria")}>
        <div className="object-info-head">
          <div className="object-name">
            <span className="object-name-main">{t("obj.sun")}</span>
            <span className="object-name-sub">{t("obj.sunType")}</span>
          </div>
          <button
            type="button"
            onClick={() => selectSun(false)}
            aria-label={t("obj.close")}
          >
            ×
          </button>
        </div>
        <dl>
          <div>
            <dt>
              {t("obj.altitude")}
            </dt>
            <dd>{sun ? `${sun.altitude.toFixed(1)}°` : "—"}</dd>
          </div>
          <div>
            <dt>
              {t("obj.azimuth")}
            </dt>
            <dd>{sun ? `${sun.azimuth.toFixed(1)}°` : "—"}</dd>
          </div>
        </dl>
        {sun && (
          <p className="object-info-hint">
            {sun.altitude > 0 ? t("obj.sunAboveHint") : t("obj.sunBelowHint")}
          </p>
        )}
      </section>
    );
  }

  if (!selectedStar) {
    return (
      <section className="object-info empty" aria-label={t("obj.aria")}>
        {t("obj.empty")}
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

  const layerId = layerOf(selectedStar.magnitude);

  return (
    <section className="object-info" aria-label={t("obj.aria")}>
      <div className="object-info-head">
        <div className="object-name">
          <span className="object-name-main">{selectedStar.name}</span>
        </div>
        <button type="button" onClick={() => selectStar(null)} aria-label={t("obj.close")}>
          ×
        </button>
      </div>
      <dl>
        <div>
          <dt>
            {t("obj.magnitude")}
          </dt>
          <dd>{selectedStar.magnitude.toFixed(2)}</dd>
        </div>
        <div>
          <dt>
            {t("obj.brightnessGroup")}
          </dt>
          <dd>{t(LAYER_NAME_KEYS[layerId])}</dd>
        </div>
        <div>
          <dt>
            {t("obj.constellation")}
          </dt>
          <dd>
            {constellation
              ? constellationDisplayName(constellation.id, constellation.name, locale)
              : selectedStar.constellation ?? "—"}
          </dd>
        </div>
        {pos && (
          <div>
            <dt>
              {t("obj.aboveHorizon")}
            </dt>
            <dd>{pos.altitude >= 0 ? t("obj.yes") : t("obj.no")}</dd>
          </div>
        )}
        {pos && (
          <div>
            <dt>
              {t("obj.visibleSim")}
            </dt>
            <dd className={status.state === "visible" ? "vis-ok" : "vis-hidden"}>
              {status.state === "visible" ? t("obj.yes") : t("obj.no")}
            </dd>
          </div>
        )}
        {pos && status.state === "hidden" && (
          <div>
            <dt>
              {t("obj.reason")}
            </dt>
            <dd>{reasonText(status.reason, sim.daylightMode, t)}</dd>
          </div>
        )}
        {pos && (
          <>
            <div>
              <dt>
              {t("obj.altitude")}
              </dt>
              <dd>{pos.altitude.toFixed(1)}°</dd>
            </div>
            <div>
              <dt>
              {t("obj.azimuth")}
              </dt>
              <dd>{pos.azimuth.toFixed(1)}°</dd>
            </div>
          </>
        )}
      </dl>

      {constellation && (
        <aside className="constellation-card">
          <h3>
            {constellationDisplayName(constellation.id, constellation.name, locale)}
            {locale === "ja" && ` (${constellation.name})`}
          </h3>
          {brightest && (
            <p>
              {t("obj.brightestStar", { name: brightest.name, mag: brightest.magnitude.toFixed(1) })}
            </p>
          )}
          <p>{constellation.description ?? t("obj.noDescription")}</p>
        </aside>
      )}

      <p className="object-info-hint">
        {t("obj.hint", {
          level: t(LP_KEYS[sim.lightPollution]),
          mag: sim.limitingMagnitude.toFixed(1),
          mode: sim.daylightMode === "real" ? t("obj.real") : t("obj.removed"),
        })}
      </p>
    </section>
  );
}

function reasonText(
  reason: Parameters<typeof reasonLabel>[0],
  daylightMode: Parameters<typeof reasonLabel>[1],
  t: (key: MessageKey) => string,
): string {
  // `reasonLabel` keeps the canonical English text; the UI maps it to the
  // active locale via the same two reasons the helper distinguishes.
  if (reason === "below-horizon") return t("reason.belowHorizon");
  void daylightMode;
  return t("reason.tooFaint");
}
