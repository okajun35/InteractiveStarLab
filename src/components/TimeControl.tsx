import { useEffect, useRef, useState } from "react";
import { useStarViewer } from "../state/context";

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function TimeControl() {
  const { settings, updateSettings } = useStarViewer();
  const [playing, setPlaying] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const shift = (hours: number) => {
    setPlaying(false);
    updateSettings({
      datetime: new Date(settingsRef.current.datetime.getTime() + hours * 3600 * 1000),
    });
  };

  // Time lapse (§24): 1 simulated hour per real second. 100ms tick → 6min.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      updateSettings({
        datetime: new Date(
          settingsRef.current.datetime.getTime() + 6 * 60 * 1000,
        ),
      });
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const h = settings.datetime.getHours();
  const m = settings.datetime.getMinutes();

  return (
    <div className="field time-control">
      <span className="field-label">
        Date and time
      </span>
      <input
        type="datetime-local"
        value={toLocalInputValue(settings.datetime)}
        onChange={(e) => {
          const next = new Date(e.target.value);
          if (!Number.isNaN(next.getTime())) {
            setPlaying(false);
            updateSettings({ datetime: next });
          }
        }}
      />
      <div className="btn-row">
        <button type="button" onClick={() => shift(-6)} title="6 hours earlier">
          −6h
        </button>
        <button type="button" onClick={() => shift(-3)} title="3 hours earlier">
          −3h
        </button>
        <button type="button" onClick={() => shift(-1)} title="1 hour earlier">
          −1h
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            setPlaying(false);
            updateSettings({ datetime: new Date() });
          }}
        >
          NOW {h}:{String(m).padStart(2, "0")}
        </button>
        <button type="button" onClick={() => shift(1)} title="1 hour later">
          +1h
        </button>
        <button type="button" onClick={() => shift(3)} title="3 hours later">
          +3h
        </button>
        <button type="button" onClick={() => shift(6)} title="6 hours later">
          +6h
        </button>
      </div>
      <div className="btn-row">
        <button
          type="button"
          className={playing ? "primary" : undefined}
          onClick={() => setPlaying((p) => !p)}
          title="Advance one simulated hour per second to observe star motion (§24)"
        >
          {playing ? "❚❚ Pause" : "▶ Play (1h/s)"}
        </button>
        {playing && <span className="panel-note play-note">Playing time…</span>}
      </div>
    </div>
  );
}
