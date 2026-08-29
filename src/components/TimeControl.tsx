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
        <span className="en">Date / Time</span> 日時
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
        <button type="button" onClick={() => shift(-6)} title="6時間前">
          −6h
        </button>
        <button type="button" onClick={() => shift(-3)} title="3時間前">
          −3h
        </button>
        <button type="button" onClick={() => shift(-1)} title="1時間前">
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
        <button type="button" onClick={() => shift(1)} title="1時間後">
          +1h
        </button>
        <button type="button" onClick={() => shift(3)} title="3時間後">
          +3h
        </button>
        <button type="button" onClick={() => shift(6)} title="6時間後">
          +6h
        </button>
      </div>
      <div className="btn-row">
        <button
          type="button"
          className={playing ? "primary" : undefined}
          onClick={() => setPlaying((p) => !p)}
          title="1秒間に1時間を進めて星の移動を観察（§24）"
        >
          {playing ? "❚❚ Pause 停止" : "▶ Play 再生 (1h/s)"}
        </button>
        {playing && <span className="panel-note play-note">時間を再生中…</span>}
      </div>
    </div>
  );
}
