// In-app Bedrock consultation agent (phase 2 of the roadmap's agent work).
// Verifies the offline half of the loop: toolSpec translation, allowlisting,
// the tool-use round loop, error paths, and truncation — with a mocked
// transport so no AWS calls are needed.
// Run: node scripts/run-verify.cjs verify-agent.ts
import {
  CONSULT_TOOL_NAMES,
  selectConsultTools,
  toToolSpec,
} from "../src/agent/toolspec";
import {
  extractAssistantText,
  runConsultation,
  DEFAULT_MAX_ROUNDS,
  DEFAULT_MAX_TOOL_RESULT_CHARS,
  type AgentMessage,
  type AgentResponse,
} from "../src/agent/loop";
import type { WebMcpTool } from "../src/mcp/webmcp";

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ✓ ${name}`);
  else {
    console.log(`FAIL  ${name} ${detail}`);
    failures += 1;
  }
}

function fakeTool(name: string, output: string = "{}"): WebMcpTool {
  return {
    name,
    description: `${name} description`,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: () => output,
  };
}

const CONTEXT = {
  nowIso: "2025-03-01T21:00:00.000Z",
  timezone: "Asia/Tokyo",
  locale: "ja" as const,
  site: { name: "Tokyo", latitude: 35.6812, longitude: 139.7671, timeZone: "Asia/Tokyo" },
};

// ---- A1: allowlist is exactly the expanded consult tool set ---------------
const EXPECTED_TOOLS = [
  "get_observation_site", "configure_sky_view", "predict_visible_stars", "propose_plan",
  "get_current_sky_state", "describe_current_view",
  "get_night_ephemeris", "rank_nights",
  "get_sky_conditions", "compare_dark_sky_sites",
  "set_sky_view_settings", "set_sky_display_settings",
  "open_sky_view", "open_plan_view", "open_observe_view", "open_observation_results",
  "plan_stale", "commit_proposal",
  "get_observation_mission", "generate_observation_guide",
];
{
  check("A1: allowlist has the expanded consult tools",
    JSON.stringify(CONSULT_TOOL_NAMES) === JSON.stringify(EXPECTED_TOOLS));
  const harness = [
    ...EXPECTED_TOOLS.map(fakeTool),
    fakeTool("save_observation_results"),       // must be excluded
    fakeTool("create_observation_plan"),        // must be excluded (bypasses review)
    fakeTool("set_observation_site"),           // must be excluded (raw lat/lon)
    fakeTool("capture_sky_snapshot"),           // must be excluded
    fakeTool("restore_observation_mission"),    // must be excluded
  ];
  const selected = selectConsultTools(harness);
  check("A1: selection keeps only allowlisted tools",
    selected.length === EXPECTED_TOOLS.length &&
    selected.every((tool) => (CONSULT_TOOL_NAMES as readonly string[]).includes(tool.name)),
    JSON.stringify(selected.map((tool) => tool.name)));
  check("A1: selection follows allowlist order",
    JSON.stringify(selected.map((tool) => tool.name)) === JSON.stringify(CONSULT_TOOL_NAMES));
  check("A1: missing allowlisted tools are skipped, not fatal",
    selectConsultTools([fakeTool("propose_plan")]).map((tool) => tool.name).join(",") === "propose_plan");
}

// ---- A2: WebMcpTool → Bedrock toolSpec -----------------------------------
{
  const spec = toToolSpec(fakeTool("predict_visible_stars"));
  check("A2: toolSpec wraps name/description",
    spec.toolSpec.name === "predict_visible_stars" &&
    spec.toolSpec.description === "predict_visible_stars description");
  check("A2: inputSchema lands under { json }",
    typeof spec.toolSpec.inputSchema === "object" &&
    spec.toolSpec.inputSchema.json.type === "object");
  const enumTool: WebMcpTool = {
    name: "configure_sky_view",
    description: "d",
    inputSchema: {
      type: "object",
      properties: { preset: { type: "string", enum: ["tokyo", "new-york"] } },
      additionalProperties: false,
    },
    execute: () => "{}",
  };
  const enumSpec = toToolSpec(enumTool);
  const preset = (enumSpec.toolSpec.inputSchema.json.properties as Record<string, { enum?: unknown[] }>).preset;
  check("A2: enum values survive translation",
    Array.isArray(preset.enum) && preset.enum.join(",") === "tokyo,new-york");
}

// ---- A3: assistant text extraction strips Nova <thinking> -----------------
{
  const text = extractAssistantText([
    { text: "<thinking>reasoning here</thinking>\n\nこちらがおすすめです" },
    { text: "続きの文章" },
  ]);
  check("A3: thinking blocks removed, reply text kept",
    text === "こちらがおすすめです\n\n続きの文章", JSON.stringify(text));
  check("A3: all-thinking response yields empty text",
    extractAssistantText([{ text: "<thinking>only</thinking>" }]) === "");
  check("A3: <response> wrapper tags are stripped, inner text kept",
    extractAssistantText([{ text: "<thinking>plan</thinking> <response>ミッションを作成しました</response>" }])
      === "ミッションを作成しました",
    extractAssistantText([{ text: "<response>ミッションを作成しました</response>" }]));
}

// ---- A4: happy path — tool_use round then end_turn -----------------------
{
  const calls: { toolUsesSeen: number; toolResultsSeen: number } = { toolUsesSeen: 0, toolResultsSeen: 0 };
  const executed: Record<string, unknown>[] = [];
  const tool: WebMcpTool = {
    ...fakeTool("predict_visible_stars"),
    execute: (input) => {
      executed.push(input as Record<string, unknown>);
      return JSON.stringify({ stars: [{ id: "vega" }] });
    },
  };
  const responses: AgentResponse[] = [
    {
      stopReason: "tool_use",
      content: [{ toolUse: { toolUseId: "t1", name: "predict_visible_stars", input: { dateTime: "2025-03-01T21:00:00Z", maxMagnitude: 2 } } }],
    },
    {
      stopReason: "end_turn",
      content: [{ text: "<thinking>pick brightest</thinking>3つおすすめします" }],
    },
  ];
  let apiCalls = 0;
  const callApi = async (req: { messages: AgentMessage[] }): Promise<AgentResponse> => {
    apiCalls += 1;
    calls.toolUsesSeen = req.messages.filter((m) => m.content.some((b) => "toolUse" in b)).length;
    calls.toolResultsSeen = req.messages.filter((m) => m.content.some((b) => "toolResult" in b)).length;
    return responses.shift()!;
  };
  const events: string[] = [];
  const outcome = await runConsultation([], "今夜のおすすめは？", {
    tools: [tool],
    context: CONTEXT,
    callApi,
    onEvent: (event) => events.push(event.type),
  });
  check("A4: reply text extracted", outcome.reply === "3つおすすめします", JSON.stringify(outcome.reply));
  check("A4: no error", outcome.error === null);
  check("A4: tool executed with model input",
    executed.length === 1 && (executed[0] as { maxMagnitude?: number }).maxMagnitude === 2);
  check("A4: second call carried assistant toolUse + user toolResult",
    apiCalls === 2 && calls.toolUsesSeen === 1 && calls.toolResultsSeen === 1);
  check("A4: transcript = user, assistant(toolUse), user(toolResult), assistant(text)",
    outcome.messages.length === 4 &&
    outcome.messages[0].role === "user" &&
    outcome.messages[1].role === "assistant" &&
    outcome.messages[2].role === "user" &&
    outcome.messages[3].role === "assistant");
  check("A4: events include tool_call and text",
    events.includes("tool_call") && events.includes("text"));
}

// ---- A5: unknown tool name → error toolResult, loop continues ------------
{
  const responses: AgentResponse[] = [
    {
      stopReason: "tool_use",
      content: [{ toolUse: { toolUseId: "t1", name: "delete_everything", input: {} } }],
    },
    { stopReason: "end_turn", content: [{ text: "その操作はできません" }] },
  ];
  let secondRequestResults: AgentMessage[] = [];
  const callApi = async (req: { messages: AgentMessage[] }): Promise<AgentResponse> => {
    if (responses.length === 1) secondRequestResults = [...req.messages];
    return responses.shift()!;
  };
  const outcome = await runConsultation([], "全部消して", {
    tools: [fakeTool("predict_visible_stars")],
    context: CONTEXT,
    callApi,
  });
  const toolResultMsg = secondRequestResults.at(-1);
  const block = toolResultMsg?.content.find((b) => "toolResult" in b);
  const status = block && "toolResult" in block ? block.toolResult.status : "?";
  check("A5: unknown tool answered with error toolResult, not a crash",
    status === "error" && outcome.reply === "その操作はできません");
}

// ---- A6: tool execute throwing → error toolResult, loop continues --------
{
  const throwing: WebMcpTool = {
    ...fakeTool("configure_sky_view"),
    execute: () => { throw new Error("unknown preset: mars"); },
  };
  const responses: AgentResponse[] = [
    {
      stopReason: "tool_use",
      content: [{ toolUse: { toolUseId: "t1", name: "configure_sky_view", input: { preset: "mars", localDateTime: "2025-03-01T21:00" } } }],
    },
    { stopReason: "end_turn", content: [{ text: "その場所は対応していません" }] },
  ];
  const toolResults: string[] = [];
  const callApi = async (req: { messages: AgentMessage[] }): Promise<AgentResponse> => {
    for (const message of req.messages) {
      for (const block of message.content) {
        if ("toolResult" in block) toolResults.push(block.toolResult.status);
      }
    }
    return responses.shift()!;
  };
  const outcome = await runConsultation([], "火星から見たい", {
    tools: [throwing],
    context: CONTEXT,
    callApi,
  });
  check("A6: execute error became an error toolResult and the loop recovered",
    toolResults.includes("error") && outcome.reply === "その場所は対応していません");
}

// ---- A7: round cap stops a model stuck in tool_use ------------------------
{
  const callApi = async (): Promise<AgentResponse> => ({
    stopReason: "tool_use",
    content: [{ toolUse: { toolUseId: "t", name: "predict_visible_stars", input: {} } }],
  });
  const events: string[] = [];
  const outcome = await runConsultation([], "loop forever", {
    tools: [fakeTool("predict_visible_stars")],
    context: CONTEXT,
    callApi,
    onEvent: (event) => events.push(event.type),
  });
  check(`A7: stops after ${DEFAULT_MAX_ROUNDS} rounds with an error`,
    outcome.error !== null && outcome.messages.filter((m) => m.role === "assistant").length === DEFAULT_MAX_ROUNDS);
}

// ---- A8: transport failure → error result, not a throw --------------------
{
  const outcome = await runConsultation([], "hello", {
    tools: [fakeTool("predict_visible_stars")],
    context: CONTEXT,
    callApi: async () => { throw new Error("503 upstream"); },
  });
  check("A8: api failure surfaces as error result",
    outcome.error === "503 upstream" && outcome.reply === null);
  check("A8: user message still recorded in transcript",
    outcome.messages.length === 1 && outcome.messages[0].role === "user");
}

// ---- A9: oversized tool results are truncated -----------------------------
{
  const big: WebMcpTool = {
    ...fakeTool("predict_visible_stars"),
    execute: () => "x".repeat(DEFAULT_MAX_TOOL_RESULT_CHARS + 500),
  };
  const responses: AgentResponse[] = [
    {
      stopReason: "tool_use",
      content: [{ toolUse: { toolUseId: "t1", name: "predict_visible_stars", input: {} } }],
    },
    { stopReason: "end_turn", content: [{ text: "done" }] },
  ];
  let observedResult = 0;
  const callApi = async (req: { messages: AgentMessage[] }): Promise<AgentResponse> => {
    for (const message of req.messages) {
      for (const block of message.content) {
        if ("toolResult" in block) observedResult = block.toolResult.content[0].text.length;
      }
    }
    return responses.shift()!;
  };
  await runConsultation([], "go", {
    tools: [big],
    context: CONTEXT,
    callApi,
  });
  check("A9: toolResult truncated to the configured cap",
    observedResult <= DEFAULT_MAX_TOOL_RESULT_CHARS, `got ${observedResult}`);
}

// ---- A10: history trimming keeps the transcript bounded -------------------
{
  const long: AgentMessage[] = Array.from({ length: 40 }, (_, i) => ({
    role: i % 2 === 0 ? "user" as const : "assistant" as const,
    content: [{ text: `msg ${i}` }],
  }));
  const callApi = async (req: { messages: AgentMessage[] }): Promise<AgentResponse> => {
    check("A10: history is trimmed before sending",
      req.messages.length <= 11, `got ${req.messages.length}`);
    return { stopReason: "end_turn", content: [{ text: "ok" }] };
  };
  await runConsultation(long, "next", {
    tools: [],
    context: CONTEXT,
    callApi,
  });
}

// ---- A11b: an empty assistant turn is retried, not shown as "no reply" ----
// Small models sometimes end a turn with zero visible text (a bare end_turn
// after tool results, or stopReason tool_use with no toolUse blocks). The loop
// drops the empty turn — it would otherwise persist into the transcript and
// poison the next request — and gives the model one more shot.
{
  const responses: AgentResponse[] = [
    {
      stopReason: "tool_use",
      content: [{ toolUse: { toolUseId: "t1", name: "predict_visible_stars", input: {} } }],
    },
    { stopReason: "end_turn", content: [] },
    { stopReason: "end_turn", content: [{ text: "3つに絞りました" }] },
  ];
  let apiCalls = 0;
  const callApi = async (): Promise<AgentResponse> => {
    apiCalls += 1;
    return responses.shift()!;
  };
  const outcome = await runConsultation([], "3つ見たい", {
    tools: [fakeTool("predict_visible_stars")],
    context: CONTEXT,
    callApi,
  });
  check("A11b: an empty turn is retried and the retry's reply is returned",
    apiCalls === 3 && outcome.reply === "3つに絞りました",
    `calls=${apiCalls} reply=${String(outcome.reply)}`);
  check("A11b: the empty assistant turn is not kept in the transcript",
    outcome.messages.every((m) => !(m.role === "assistant" && m.content.length === 0)),
    `messages=${outcome.messages.length}`);

  // Still-empty retry: give up cleanly, again without keeping the empty turn.
  const silentApi = async (): Promise<AgentResponse> => ({ stopReason: "end_turn", content: [] });
  const silent = await runConsultation([], "hi", {
    tools: [],
    context: CONTEXT,
    callApi: silentApi,
  });
  check("A11b: persistent silence reports no reply and keeps no empty turn",
    silent.reply === null && silent.messages.every((m) => m.content.length > 0));

  // Degenerate tool_use: stopReason says tool_use but no blocks arrived.
  const phantomApi = async (): Promise<AgentResponse> => ({ stopReason: "tool_use", content: [] });
  const phantom = await runConsultation([], "hi", {
    tools: [],
    context: CONTEXT,
    callApi: phantomApi,
  });
  check("A11b: phantom tool_use is treated as an empty turn, not a hang",
    phantom.reply === null && phantom.error === null);
}

// ---- A11: Lambda handler source guards ------------------------------------
{
  const fs = await import("node:fs");
  const handler = fs.readFileSync(new URL("../lambda/consult-agent.mjs", import.meta.url), "utf8");
  check("A11: lambda enforces the consult allowlist",
    CONSULT_TOOL_NAMES.every((name) => handler.includes(`"${name}"`)));
  check("A11: lambda defaults to the cheap Nova Lite model",
    handler.includes("amazon.nova-lite-v1:0") && handler.includes("AGENT_MODEL_ID"));
  check("A11: lambda caps request size and message count",
    /MAX_(BODY|REQUEST|MESSAGES)/.test(handler));
  check("A11: lambda builds a server-side system prompt with context",
    handler.includes("system") && handler.includes("locale"));
  check("A11: lambda limits output tokens",
    handler.includes("maxTokens"));
}

if (failures > 0) {
  console.log(`\n${failures} agent check(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log("\nAll agent checks passed");
}
