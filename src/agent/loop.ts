/**
 * Client-side consultation loop for the in-app agent.
 *
 * The browser owns tool execution: each round sends the accumulated Converse
 * transcript to the Lambda proxy, receives either text or toolUse requests,
 * executes them against the local harness tools, appends toolResults, and
 * repeats until the model ends its turn or the round cap is hit.
 */
import type { WebMcpTool } from "../mcp/webmcp";
import { toToolSpec, type BedrockToolSpec } from "./toolspec";

export type AgentRole = "user" | "assistant";

export interface AgentTextBlock {
  text: string;
}

export interface AgentToolUseBlock {
  toolUse: {
    toolUseId: string;
    name: string;
    input: Record<string, unknown>;
  };
}

export interface AgentToolResultBlock {
  toolResult: {
    toolUseId: string;
    content: { text: string }[];
    status: "success" | "error";
  };
}

export type AgentContentBlock = AgentTextBlock | AgentToolUseBlock | AgentToolResultBlock;

export interface AgentMessage {
  role: AgentRole;
  content: AgentContentBlock[];
}

export interface AgentContext {
  /** Current instant, injected so the model never has to guess "now". */
  nowIso: string;
  timezone: string;
  locale: "en" | "ja";
  site: {
    name: string;
    latitude: number;
    longitude: number;
    timeZone: string;
  };
}

export interface AgentRequest {
  messages: AgentMessage[];
  tools: BedrockToolSpec[];
  context: AgentContext;
}

export interface AgentResponse {
  stopReason: string;
  content: AgentContentBlock[];
  usage?: { inputTokens?: number; outputTokens?: number };
}

export type AgentEvent =
  | { type: "round"; round: number }
  | { type: "tool_call"; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; name: string; ok: boolean }
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

export interface ConsultResult {
  messages: AgentMessage[];
  reply: string | null;
  error: string | null;
}

export interface ConsultOptions {
  tools: readonly WebMcpTool[];
  context: AgentContext;
  callApi: (request: AgentRequest) => Promise<AgentResponse>;
  maxRounds?: number;
  maxToolResultChars?: number;
  onEvent?: (event: AgentEvent) => void;
}

export const DEFAULT_MAX_ROUNDS = 6;
export const DEFAULT_MAX_TOOL_RESULT_CHARS = 8000;
export const MAX_HISTORY_MESSAGES = 10;

/** Display text only: Nova emits <thinking> blocks that users must not see. */
export function extractAssistantText(content: AgentContentBlock[]): string {
  return content
    .filter((block): block is AgentTextBlock => "text" in block)
    .map((block) => block.text.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim())
    .filter((text) => text.length > 0)
    .join("\n\n");
}

function isToolUseBlock(block: AgentContentBlock): block is AgentToolUseBlock {
  return "toolUse" in block;
}

/**
 * The in-app agent turns proposals straight into Missions: once propose_plan
 * stages a proposal, the loop commits it immediately and folds the outcome into
 * the result the model sees, so the user never approves the same plan twice.
 * External WebMCP agents keep the human-review gate — they call the tools
 * directly and never pass through this loop.
 */
async function autoCommitConsultProposal(
  tools: readonly WebMcpTool[],
  proposeResultText: string,
  onEvent: (event: AgentEvent) => void,
): Promise<string> {
  let parsed: { ok?: boolean; data?: Record<string, unknown> };
  try {
    parsed = JSON.parse(proposeResultText);
  } catch {
    return proposeResultText;
  }
  if (parsed?.ok !== true || typeof parsed.data !== "object" || parsed.data === null) {
    return proposeResultText;
  }
  const commit = tools.find((candidate) => candidate.name === "commit_proposal");
  if (commit === undefined) return proposeResultText;

  onEvent({ type: "tool_call", name: "commit_proposal", input: {} });
  let commitData: Record<string, unknown> | null = null;
  let commitError = "commit_proposal failed";
  try {
    const commitParsed = JSON.parse(String(await commit.execute({}))) as {
      ok?: boolean;
      data?: Record<string, unknown>;
      error?: { message?: string };
    };
    if (commitParsed?.ok === true && commitParsed.data !== undefined) {
      commitData = commitParsed.data;
    } else {
      commitError = commitParsed?.error?.message ?? commitError;
    }
  } catch (error) {
    commitError = error instanceof Error ? error.message : String(error);
  }
  onEvent({ type: "tool_result", name: "commit_proposal", ok: commitData !== null });

  // nextAction reads as a command to small models — they open Plan unprompted.
  // The in-app agent only navigates when the user asks, so it is stripped here;
  // the field still exists in the raw tool result for external agents.
  const { nextAction: _nextAction, ...rest } = parsed.data;
  parsed.data = {
    ...rest,
    autoCommitted: commitData !== null,
    ...(commitData !== null
      ? {
        commitSummary: commitData.summary,
        missionId: commitData.missionId,
        targetCount: commitData.targetCount,
        committed: commitData.committed,
        rejected: commitData.rejected,
      }
      : { commitError }),
  };
  return JSON.stringify(parsed);
}

/**
 * Runs one consultation turn: appends the user message, then alternates
 * model calls and local tool executions until the model replies with text.
 * Failures in transport or tools are reported to the model/user rather than
 * thrown, so the conversation can recover.
 */
export async function runConsultation(
  history: readonly AgentMessage[],
  userText: string,
  options: ConsultOptions,
): Promise<ConsultResult> {
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const maxResultChars = options.maxToolResultChars ?? DEFAULT_MAX_TOOL_RESULT_CHARS;
  const onEvent = options.onEvent ?? (() => undefined);
  const specs = options.tools.map(toToolSpec);
  const messages: AgentMessage[] = [
    ...history.slice(-MAX_HISTORY_MESSAGES),
    { role: "user", content: [{ text: userText }] },
  ];

  for (let round = 1; round <= maxRounds; round += 1) {
    onEvent({ type: "round", round });
    let response: AgentResponse;
    try {
      response = await options.callApi({ messages, tools: specs, context: options.context });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onEvent({ type: "error", message });
      return { messages, reply: null, error: message };
    }

    const content = response.content ?? [];
    messages.push({ role: "assistant", content });

    const toolUses = content.filter(isToolUseBlock);
    if (response.stopReason === "tool_use" && toolUses.length > 0) {
      const results: AgentToolResultBlock[] = [];
      for (const use of toolUses) {
        const { toolUseId, name, input } = use.toolUse;
        onEvent({ type: "tool_call", name, input });
        const tool = options.tools.find((candidate) => candidate.name === name);
        let text: string;
        let status: "success" | "error";
        if (tool === undefined) {
          text = JSON.stringify({ error: `tool not available: ${name}` });
          status = "error";
        } else {
          try {
            text = String(await tool.execute(input));
            if (name === "propose_plan") {
              text = await autoCommitConsultProposal(options.tools, text, onEvent);
            }
            if (text.length > maxResultChars) {
              text = `${text.slice(0, Math.max(0, maxResultChars - 12))}…(truncated)`;
            }
            status = "success";
          } catch (error) {
            text = JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
            status = "error";
          }
        }
        onEvent({ type: "tool_result", name, ok: status === "success" });
        results.push({
          toolResult: { toolUseId, content: [{ text }], status },
        });
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    const reply = extractAssistantText(content);
    if (reply.length > 0) onEvent({ type: "text", text: reply });
    onEvent({ type: "done" });
    return { messages, reply: reply.length > 0 ? reply : null, error: null };
  }

  const message = `rounds_exceeded:${maxRounds}`;
  onEvent({ type: "error", message });
  return { messages, reply: null, error: message };
}
