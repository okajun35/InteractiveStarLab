import { useState } from "react";
import { EXPERIMENTS, type ExperimentDef } from "../state/experiments";
import { useSimulation } from "../state/simulation";
import { useStarViewer } from "../state/context";
import { useLocale, type MessageKey } from "../i18n";

type ExperimentId = ExperimentDef["id"];

function experimentKey(id: ExperimentId, part: "title" | "q" | "x"): MessageKey {
  return `exp.${id}.${part}` as MessageKey;
}

function guessKey(id: ExperimentId, index: number): MessageKey {
  return `exp.${id}.g${index}` as MessageKey;
}

/**
 * What-If experiments (spec §28–§31).
 * Each experiment: pick a guess (§29), apply the state change, then read the
 * short explanation (§30) inline.
 */
export function ExperimentPanel() {
  const {
    activeExperiment,
    experimentGuess,
    experimentSnapshot,
    beginExperiment,
    clearExperiment,
    patchSimulation,
    settings: sim,
    setCompareKind,
  } = useSimulation();
  const { settings, updateSettings } = useStarViewer();
  const { t } = useLocale();

  const [guessByExp, setGuessByExp] = useState<Record<string, number>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  // Pre-experiment snapshot, so "close experiment" can restore (§28).
  const active = EXPERIMENTS.find((e) => e.id === activeExperiment?.id) ?? null;

  const applyExperiment = (def: ExperimentDef) => {
    const picked = guessByExp[def.id] ?? 0;
    const { observation, simulation } = def.apply(settings, sim);
    updateSettings({
      ...observation,
      datetime: observation.datetime,
    });
    patchSimulation(simulation);
    setCompareKind(null);
    beginExperiment(def, picked, {
      observation: { ...settings },
      simulation: { ...sim },
    });
  };

  const closeExperiment = () => {
    const snapshot = experimentSnapshot;
    clearExperiment();
    if (snapshot) {
      updateSettings({ ...snapshot.observation });
      patchSimulation({ ...snapshot.simulation });
    }
  };

  if (active) {
    return (
      <fieldset className="panel-group experiment-active">
        <legend>
          {t("exp.activePrefix", { title: t(experimentKey(active.id, "title")) })}
        </legend>

        {experimentGuess && (
          <p
            className={
              experimentGuess.correct ? "exp-guess-result ok" : "exp-guess-result no"
            }
          >
            {t("exp.yourGuess", { guess: t(guessKey(active.id, experimentGuess.picked)) })}
            {experimentGuess.correct ? ` ${t("exp.correct")}` : ` ${t("exp.incorrect")}`}
          </p>
        )}

        <p className="exp-explain">{t(experimentKey(active.id, "x"))}</p>

        <button type="button" className="primary" onClick={closeExperiment}>
          {t("exp.close")}
        </button>
        <p className="panel-note">
          {t("exp.activeNote")}
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset className="panel-group">
      <legend>
        {t("exp.legend")}
      </legend>

      {EXPERIMENTS.map((def) => {
        const open = openId === def.id;
        return (
          <div key={def.id} className="exp-item">
            <button
              type="button"
              className="exp-toggle"
              onClick={() => setOpenId(open ? null : def.id)}
              aria-expanded={open}
            >
              {t(experimentKey(def.id, "title"))}
              <span className="exp-arrow" aria-hidden="true">
                {open ? "−" : "+"}
              </span>
            </button>
            {open && (
              <div className="exp-detail">
                <p className="exp-guess-q">{t(experimentKey(def.id, "q"))}</p>
                {def.guesses.map((_, i) => (
                  <label key={i} className="exp-guess">
                    <input
                      type="radio"
                      name={`guess-${def.id}`}
                      checked={(guessByExp[def.id] ?? 0) === i}
                      onChange={() =>
                        setGuessByExp((prev) => ({ ...prev, [def.id]: i }))
                      }
                    />
                    {t(guessKey(def.id, i))}
                  </label>
                ))}
                <button
                  type="button"
                  className="primary"
                  onClick={() => applyExperiment(def)}
                >
                  {t("exp.run")}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
