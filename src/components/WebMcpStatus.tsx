import { useWebMcp } from "../state/webmcp";

export function WebMcpStatus() {
  const { availability, registeredToolNames } = useWebMcp();
  const ready = availability === "ready";
  const error = availability === "error";
  const unavailable = availability === "unavailable";
  const label = ready
    ? `WebMCP Ready · ${registeredToolNames.length} tools`
    : error
      ? "WebMCP registration failed"
      : unavailable
        ? "WebMCP unavailable in this browser"
        : "WebMCP checking…";
  const shortLabel = ready ? `MCP ${registeredToolNames.length}` : error ? "MCP error" : unavailable ? "MCP off" : "MCP …";

  return (
    <span
      className={`webmcp-status${ready ? " ready" : ""}${error ? " error" : ""}${unavailable ? " unavailable" : ""}`}
      role="status"
      aria-label={label}
      title={label}
    >
      <span className="webmcp-status-dot" aria-hidden="true" />
      <span className="webmcp-status-text">{shortLabel}</span>
    </span>
  );
}
