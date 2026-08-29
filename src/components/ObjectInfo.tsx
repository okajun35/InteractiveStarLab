import { useMemo } from "react";
import { useStarViewer } from "../state/context";
import { useSimulation, LIGHT_POLLUTION_LABELS } from "../state/simulation";
import { createContext } from "../astronomy/observer";
import { sunPosition } from "../astronomy/sun";
import { evaluateStar, reasonLabelJa } from "../astronomy/visibilityModel";
import { LAYER_LABEL_JA, layerOf } from "../astronomy/magnitude";
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
      <section className="object-info" aria-label="選択天体">
        <div className="object-info-head">
          <div className="object-name">
            <span className="object-name-main">太陽 Sun</span>
            <span className="object-name-sub">恒星（G2V）</span>
          </div>
          <button
            type="button"
            onClick={() => selectSun(false)}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
        <dl>
          <div>
            <dt>
              <span className="en">Altitude</span> 高度
            </dt>
            <dd>{sun ? `${sun.altitude.toFixed(1)}°` : "—"}</dd>
          </div>
          <div>
            <dt>
              <span className="en">Azimuth</span> 方位
            </dt>
            <dd>{sun ? `${sun.azimuth.toFixed(1)}°` : "—"}</dd>
          </div>
        </dl>
        {sun && (
          <p className="object-info-hint">
            {sun.altitude > 0
              ? "太陽は地平線の上です。昼間で、星は明るさに負けて見えにくくなります。"
              : "太陽は地平線の下です。夜空なら恒星が見える時間帯です。"}
          </p>
        )}
      </section>
    );
  }

  if (!selectedStar) {
    return (
      <section className="object-info empty" aria-label="選択天体">
        <span className="en">Selected object</span> — 星をクリックすると詳細を表示します
      </section>
    );
  }

  const pos = horizontal.find((s) => s.id === selectedStar.id);
  const starJa = selectedStar.nameJa;
  const starEn = selectedStar.name;

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
    <section className="object-info" aria-label="選択天体">
      <div className="object-info-head">
        <div className="object-name">
          <span className="object-name-main">{starJa ?? starEn}</span>
          <span className="object-name-sub">{starJa ? starEn : undefined}</span>
        </div>
        <button type="button" onClick={() => selectStar(null)} aria-label="閉じる">
          ×
        </button>
      </div>
      <dl>
        <div>
          <dt>
            <span className="en">Magnitude</span> 等級
          </dt>
          <dd>{selectedStar.magnitude.toFixed(2)}</dd>
        </div>
        <div>
          <dt>
            <span className="en">Brightness Group</span> 等級グループ
          </dt>
          <dd>{LAYER_LABEL_JA[layerOf(selectedStar.magnitude)]}</dd>
        </div>
        <div>
          <dt>
            <span className="en">Constellation</span> 星座
          </dt>
          <dd>
            {constellation
              ? `${constellation.name} ${constellation.nameJa ?? ""}`
              : selectedStar.constellation ?? "—"}
          </dd>
        </div>
        {pos && (
          <div>
            <dt>
              <span className="en">Exists</span> 存在（地平線上）
            </dt>
            <dd>{pos.altitude >= 0 ? "Yes" : "No"}</dd>
          </div>
        )}
        {pos && (
          <div>
            <dt>
              <span className="en">Visible</span> シミュレーションで
            </dt>
            <dd className={status.state === "visible" ? "vis-ok" : "vis-hidden"}>
              {status.state === "visible" ? "Yes" : "No"}
            </dd>
          </div>
        )}
        {pos && status.state === "hidden" && (
          <div>
            <dt>
              <span className="en">Reason</span> 理由
            </dt>
            <dd>{reasonLabelJa(status.reason, sim.daylightMode)}</dd>
          </div>
        )}
        {pos && (
          <>
            <div>
              <dt>
                <span className="en">Altitude</span> 高度
              </dt>
              <dd>{pos.altitude.toFixed(1)}°</dd>
            </div>
            <div>
              <dt>
                <span className="en">Azimuth</span> 方位
              </dt>
              <dd>{pos.azimuth.toFixed(1)}°</dd>
            </div>
          </>
        )}
      </dl>

      {constellation && (
        <aside className="constellation-card">
          <h3>
            {constellation.name} {constellation.nameJa}
          </h3>
          {brightest && (
            <p>
              <span className="en">Brightest Star</span> 最明星：
              {brightest.nameJa ?? brightest.name}（{brightest.magnitude.toFixed(1)}等）
            </p>
          )}
          <p>{constellation.descriptionJa ?? "（解説なし）"}</p>
        </aside>
      )}

      <p className="object-info-hint">
        光害：{LIGHT_POLLUTION_LABELS[sim.lightPollution].ja}（limit ≈{" "}
        {sim.limitingMagnitude.toFixed(1)}）／昼間モード：
        {sim.daylightMode === "real" ? "REAL（昼空）" : "REMOVED（空だけ暗く）"}
      </p>
    </section>
  );
}
