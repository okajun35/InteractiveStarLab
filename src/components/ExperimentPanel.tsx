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
          Experiment: {active.title}
        </legend>

        {experimentGuess && (
          <p
            className={
              experimentGuess.correct ? "exp-guess-result ok" : "exp-guess-result no"
            }
          >
            Your guess: {active.guesses[experimentGuess.picked]}
            {experimentGuess.correct ? " (correct)" : " (not this time)"}
          </p>
        )}

        <p className="exp-explain">{active.explanation}</p>

        <button type="button" className="primary" onClick={closeExperiment}>
          Close experiment and restore previous state
        </button>
        <p className="panel-note">
          The experiment result remains active until you close it. You can change
          the date, location, layers, and light pollution in the panels to the left.
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset className="panel-group">
      <legend>
        What-if experiments
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
              {def.title}
              <span className="exp-arrow" aria-hidden="true">
                {open ? "−" : "+"}
              </span>
            </button>
            {open && (
              <div className="exp-detail">
                <p className="exp-guess-q">{def.guessQuestion}</p>
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
                  Run experiment
                </button>
              </div>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
