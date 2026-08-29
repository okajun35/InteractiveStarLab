import { useState } from "react";
import { EXPERIMENTS, type ExperimentDef } from "../state/experiments";
import { useSimulation } from "../state/simulation";
import { useStarViewer } from "../state/context";

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
          <span className="en">Experiment</span> 実験中：{active.ja}
        </legend>

        {experimentGuess && (
          <p
            className={
              experimentGuess.correct ? "exp-guess-result ok" : "exp-guess-result no"
            }
          >
            あなたの予想：{active.guesses[experimentGuess.picked]}
            {experimentGuess.correct ? "（予想通り）" : "（今回は違いました）"}
          </p>
        )}

        <p className="exp-explain">{active.explainJa}</p>

        <button type="button" className="primary" onClick={closeExperiment}>
          実験を閉じてもとの状態へ戻す
        </button>
        <p className="panel-note">
          実験の結果（星の見え方）はこのままだと観察し続けます。
          観測条件（日時・場所・レイヤー・光害）は左のパネルから変えられます。
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset className="panel-group">
      <legend>
        <span className="en">What-If Experiments</span> もしも実験
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
              {def.ja}
              <span className="exp-arrow" aria-hidden="true">
                {open ? "−" : "+"}
              </span>
            </button>
            {open && (
              <div className="exp-detail">
                <p className="exp-guess-q">{def.guessQuestionJa}</p>
                {def.guesses.map((g, i) => (
                  <label key={i} className="exp-guess">
                    <input
                      type="radio"
                      name={`guess-${def.id}`}
                      checked={(guessByExp[def.id] ?? 0) === i}
                      onChange={() =>
                        setGuessByExp((prev) => ({ ...prev, [def.id]: i }))
                      }
                    />
                    {g}
                  </label>
                ))}
                <button
                  type="button"
                  className="primary"
                  onClick={() => applyExperiment(def)}
                >
                  実験する
                </button>
              </div>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
