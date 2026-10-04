import { useMemo, useState } from "react";
import { useWebMcp } from "../state/webmcp";
import { useLocale } from "../i18n";

/**
 * In-app harness for the page's WebMCP tools. The tools are captured locally at
 * registration, so the panel works in browsers without `document.modelContext` —
 * the same executes the agent would call, run by hand.
 */
export function AgentHarness() {
  const { harnessTools, availability } = useWebMcp();
  const { t } = useLocale();
  const [toolName, setToolName] = useState("");
  const [inputText, setInputText] = useState("{}");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const tools = useMemo(
    () => [...harnessTools].sort((a, b) => a.name.localeCompare(b.name)),
    [harnessTools],
  );
  const selected = tools.find((tool) => tool.name === toolName) ?? tools[0];

  if (tools.length === 0) return null;

  const run = async () => {
    if (selected === undefined) return;
    let input: unknown;
    try {
      input = inputText.trim() === "" ? {} : JSON.parse(inputText);
    } catch {
      setOutput("Invalid JSON input");
      return;
    }
    setRunning(true);
    try {
      const raw = await selected.execute(input);
      const parsed = JSON.parse(raw) as { ok?: boolean };
      setOutput(JSON.stringify(parsed, null, 2));
    } catch (error) {
      setOutput(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="agent-harness" aria-label={t("harness.toggle")}>
      <button
        type="button"
        className="agent-harness-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {t("harness.toggle")} {availability !== "ready" ? "· local" : ""}
      </button>
      {expanded && (
        <div className="agent-harness-body">
          <label className="agent-harness-field">
            <span>{t("harness.tool")}</span>
            <select
              value={selected?.name ?? ""}
              onChange={(event) => setToolName(event.target.value)}
            >
              {tools.map((tool) => (
                <option key={tool.name} value={tool.name}>
                  {tool.name}
                </option>
              ))}
            </select>
          </label>
          {selected !== undefined && (
            <p className="agent-harness-description">{selected.description}</p>
          )}
          <label className="agent-harness-field">
            <span>{t("harness.input")}</span>
            <textarea
              rows={3}
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              spellCheck={false}
            />
          </label>
          <button type="button" onClick={run} disabled={running || selected === undefined}>
            {running ? t("harness.running") : t("harness.run")}
          </button>
          {output !== null && (
            <pre className="agent-harness-output" aria-live="polite">
              {output}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
