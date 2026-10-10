/**
 * Translation between the app's WebMCP tools and the Bedrock Converse tool
 * format, plus the allowlist of tools the in-app consultation agent may use.
 * The list stays curated rather than "everything WebMCP exposes": direct
 * Mission creation, raw-coordinate site edits, observation-record writes,
 * restoration, and snapshot bookkeeping are left out so the agent works
 * through the same reviewed proposal path a human uses.
 */
import type { WebMcpTool } from "../mcp/webmcp";

/** Tools the in-app consultation agent is allowed to call. */
export const CONSULT_TOOL_NAMES = [
  // Core consult flow
  "get_observation_site",
  "configure_sky_view",
  "predict_visible_stars",
  "propose_plan",
  // Sky inspection
  "get_current_sky_state",
  "describe_current_view",
  // Night planning
  "get_night_ephemeris",
  "rank_nights",
  // Weather advisory (Open-Meteo, never a guarantee)
  "get_sky_conditions",
  "compare_dark_sky_sites",
  // Sky manipulation (aim the view, toggle layers)
  "set_sky_view_settings",
  "set_sky_display_settings",
  // Screen navigation
  "open_sky_view",
  "open_plan_view",
  "open_observe_view",
  "open_observation_results",
  // Proposal lifecycle: check freshness, then commit on explicit approval
  "plan_stale",
  "commit_proposal",
  // Mission follow-up
  "get_observation_mission",
  "generate_observation_guide",
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
