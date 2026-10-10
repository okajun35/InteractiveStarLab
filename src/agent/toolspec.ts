/**
 * Translation between the app's WebMCP tools and the Bedrock Converse tool
 * format, plus the allowlist of tools the in-app consultation agent may use.
 * The allowlist is intentionally small: the agent can look up conditions and
 * stage proposals, while plan creation itself stays with the human on the
 * existing screens.
 */
import type { WebMcpTool } from "../mcp/webmcp";

/** Tools the in-app consultation agent is allowed to call. */
export const CONSULT_TOOL_NAMES = [
  "get_observation_site",
  "configure_sky_view",
  "predict_visible_stars",
  "propose_plan",
] as const;

export interface BedrockToolSpec {
  toolSpec: {
    name: string;
    description: string;
    inputSchema: { json: Record<string, unknown> };
  };
}

/** Keep only the allowlisted tools, in allowlist order. */
export function selectConsultTools(tools: readonly WebMcpTool[]): WebMcpTool[] {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return CONSULT_TOOL_NAMES.flatMap((name) => {
    const tool = byName.get(name);
    return tool === undefined ? [] : [tool];
  });
}

/** Convert one WebMCP tool into a Bedrock Converse toolSpec entry. */
export function toToolSpec(tool: WebMcpTool): BedrockToolSpec {
  return {
    toolSpec: {
      name: tool.name,
      description: tool.description,
      inputSchema: { json: tool.inputSchema as unknown as Record<string, unknown> },
    },
  };
}
