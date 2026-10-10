import { useMemo, useRef, useState } from "react";
import { useWebMcp } from "../state/webmcp";
import { useObservation } from "../state/observation";
import { useLocale } from "../i18n";
import { selectConsultTools } from "../agent/toolspec";
import { runConsultation, type AgentMessage } from "../agent/loop";
import { agentApiUrl, createAgentCaller } from "../agent/client";

interface LogEntry {
  kind: "user" | "assistant" | "status";
  text: string;
}

/**
 * In-app consultation panel: the user describes what they want to observe,
 * the Bedrock-backed agent drives the shared tools (configure_sky_view,
 * predict_visible_stars, propose_plan, …) locally, and the sky updates in
 * front of them. The transcript is kept so follow-up turns keep context.
 * Rendered inside AgentDock, which owns the collapse chrome.
 */
export function ConsultPanel() {
  const { harnessTools } = useWebMcp();
  const { activeSite } = useObservation();
  const { t, locale } = useLocale();
  const [input, setInput] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const historyRef = useRef<AgentMessage[]>([]);

  const tools = useMemo(() => selectConsultTools(harnessTools), [harnessTools]);
  const apiUrl = agentApiUrl();
  const logRef = useRef<HTMLDivElement | null>(null);

  const scrollLog = () => {
    requestAnimationFrame(() => {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    });
  };

  const submit = async () => {
    const text = input.trim();
    if (text === "" || busy || apiUrl === null) return;
    setInput("");
    setBusy(true);
    setLog((entries) => [...entries, { kind: "user", text }]);
    scrollLog();

    const push = (entry: LogEntry) => {
      setLog((entries) => [...entries, entry]);
      scrollLog();
    };

    const outcome = await runConsultation(historyRef.current, text, {
      tools,
      context: {
        nowIso: new Date().toISOString(),
        timezone: activeSite.timeZone ?? "UTC",
        locale,
        site: {
          name: activeSite.name,
          latitude: activeSite.latitude,
          longitude: activeSite.longitude,
          timeZone: activeSite.timeZone ?? "UTC",
        },
      },
      callApi: createAgentCaller(apiUrl),
      onEvent: (event) => {
        if (event.type === "tool_call") {
          push({ kind: "status", text: t("consult.runningTool", { name: event.name }) });
        }
      },
    });
    historyRef.current = outcome.messages;

    if (outcome.reply !== null) {
      push({ kind: "assistant", text: outcome.reply });
    } else if (outcome.error !== null) {
      push({ kind: "status", text: `${t("consult.error")} (${outcome.error})` });
    } else {
      push({ kind: "status", text: t("consult.empty") });
    }
    setBusy(false);
  };

  return (
    <section className="consult-panel" aria-label={t("consult.title")}>
      <div className="consult-body">
        {apiUrl === null ? (
          <p className="consult-note">{t("consult.notConfigured")}</p>
        ) : (
          <>
            <div className="consult-log" ref={logRef} aria-live="polite">
              {log.length === 0 && (
                <p className="consult-note">{t("consult.hint")}</p>
              )}
              {log.map((entry, index) => (
                <p key={index} className={`consult-entry consult-entry-${entry.kind}`}>
                  {entry.text}
                </p>
              ))}
              {busy && <p className="consult-entry consult-entry-status">{t("consult.working")}</p>}
            </div>
            <form
              className="consult-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <input
                type="text"
                value={input}
                placeholder={t("consult.placeholder")}
                disabled={busy}
                onChange={(event) => setInput(event.target.value)}
              />
              <button type="submit" disabled={busy || input.trim() === ""}>
                {t("consult.send")}
              </button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
