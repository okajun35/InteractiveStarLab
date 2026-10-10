/**
 * Consult-agent Lambda: a thin, guarded proxy from the browser to Amazon
 * Bedrock Converse. The browser owns tool execution and sends the Converse
 * transcript each round; this function attaches the server-fixed system
 * prompt, enforces the tool allowlist, caps sizes, and returns the model's
 * next step (text or toolUse requests).
 *
 * Runtime: Node.js 22.x (AWS SDK v3 ships in the runtime — no bundling).
 * IAM:   bedrock:InvokeModel on the configured model.
 * Env:   AGENT_MODEL_ID (default amazon.nova-lite-v1:0)
 *
 * CORS:  configured on the Function URL, not in this code — a second
 *        Access-Control-Allow-Origin header here makes browsers reject
 *        the response.
 *
 * Deploy note: a Function URL works for the demo; for anything public add
 * API Gateway throttling or a WAF rule, reserved concurrency, and a Budgets
 * alarm — an unauthenticated endpoint is otherwise a free Bedrock proxy.
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const MODEL_ID = process.env.AGENT_MODEL_ID ?? "amazon.nova-lite-v1:0";
const MAX_BODY_BYTES = 32 * 1024;
const MAX_MESSAGES = 30;
const MAX_OUTPUT_TOKENS = 800;
const ALLOWED_TOOLS = new Set([
  "get_observation_site",
  "configure_sky_view",
  "predict_visible_stars",
  "propose_plan",
  "get_current_sky_state",
  "describe_current_view",
  "get_night_ephemeris",
  "rank_nights",
  "get_sky_conditions",
  "compare_dark_sky_sites",
  "set_sky_view_settings",
  "set_sky_display_settings",
  "open_sky_view",
  "open_plan_view",
  "open_observe_view",
  "open_observation_results",
  "plan_stale",
  "commit_proposal",
  "get_observation_mission",
  "generate_observation_guide",
]);

const client = new BedrockRuntimeClient({});

// CORS is handled by the Function URL CORS configuration, NOT here: if this
// code also emits Access-Control-Allow-Origin the response ends up with two
// ACAO headers and browsers reject it ("Failed to fetch").
const CORS = {
  "Content-Type": "application/json",
};

function reply(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}
const badRequest = (message) => reply(400, { error: { code: "bad_request", message } });

function isTextBlock(b) { return typeof b?.text === "string"; }
function isToolUseBlock(b) {
  return typeof b?.toolUse?.toolUseId === "string" &&
    typeof b?.toolUse?.name === "string" &&
    typeof b?.toolUse?.input === "object";
}
function isToolResultBlock(b) {
  return typeof b?.toolResult?.toolUseId === "string" &&
    Array.isArray(b?.toolResult?.content);
}
function isValidContentBlock(b) {
  return isTextBlock(b) || isToolUseBlock(b) || isToolResultBlock(b);
}

function sanitizeTools(tools) {
  if (!Array.isArray(tools)) return [];
  const out = [];
  for (const entry of tools) {
    const spec = entry?.toolSpec;
    if (typeof spec?.name !== "string" || !ALLOWED_TOOLS.has(spec.name)) continue;
    out.push({
      toolSpec: {
        name: spec.name,
        description: String(spec.description ?? ""),
        inputSchema: { json: spec.inputSchema?.json ?? { type: "object" } },
      },
    });
  }
  return out;
}

function buildSystemPrompt(context) {
  const c = context ?? {};
  const locale = c.locale === "ja" ? "ja" : "en";
  const site = c.site ?? {};
  const lines = [
    "You are the stargazing assistant inside InteractiveStarLab, an observation-planning web app.",
    "Help the user decide what to observe, then set the sky view and stage candidates with the tools.",
    "",
    `Current instant: ${c.nowIso ?? "unknown"}. Site timezone: ${c.timezone ?? "unknown"}.`,
    `Current site: ${site.name ?? "unknown"} (${site.latitude ?? "?"}, ${site.longitude ?? "?"}, ${site.timeZone ?? "?"}).`,
    "",
    "Rules:",
    "- The signature experience: the on-screen sky moves as you discuss it. Whenever the request",
    "  names a place or time, call configure_sky_view or set_sky_view_settings so the visible sky",
    "  matches what you are describing — even when the user only asks for a candidate list.",
    "- Use only the provided tools. configure_sky_view accepts built-in place presets or an explicit site;",
    "  never invent a latitude/longitude for a place name you do not have coordinates for — ask instead.",
    "- Never propose a star below about 15 degrees altitude: it is technically up but effectively",
    "  invisible behind haze and obstacles. If a famous bright star sits lower (for example Canopus",
    "  from Tokyo), skip it, take the next-brightest higher candidate, and note the skip briefly.",
    "- Predictions are geometric only: no weather or cloud guarantees. get_sky_conditions and",
    "  compare_dark_sky_sites return an Open-Meteo forecast — present it as a forecast, never a promise.",
    "- You may drive the app screens for the user: open_sky_view after configuring the sky,",
    "  open_plan_view to show the proposal or Mission, open_observe_view for recording,",
    "  open_observation_results for saved results.",
    "- set_sky_view_settings can aim the view (azimuth/altitude) at a candidate star — use it to",
    "  show the user where to look before or while proposing.",
    "- propose_plan stages a ghost proposal for human review. Call commit_proposal ONLY after the",
    "  user clearly approves in the conversation (for example \"OK\" or \"それでいい\"); when unsure, ask.",
    "  Run plan_stale first if the site or observation time may have changed since the proposal.",
    "- generate_observation_guide builds a printable guide for an existing Mission; offer it after",
    "  a commit or when the user asks for a guide.",
    "- Keep replies short and concrete. When proposing stars, prefer at most 3 with one-line reasons each,",
    "  and only use star IDs returned by predict_visible_stars.",
    "- If the date/time or place is ambiguous, ask one short clarifying question.",
    locale === "ja"
      ? "- Always reply in natural Japanese (polite, concise)."
      : "- Always reply in English.",
  ];
  return lines.join("\n");
}

export async function handler(event) {
  const method = event.requestContext?.http?.method ?? event.httpMethod ?? "POST";
  if (method !== "POST") return reply(405, { error: { code: "method", message: "POST only" } });

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64") : (event.body ?? "");
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return reply(413, { error: { code: "too_large", message: "request body too large" } });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return badRequest("body must be JSON");
  }

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return badRequest(`messages must be a non-empty array of at most ${MAX_MESSAGES}`);
  }
  for (const message of messages) {
    const roleOk = message?.role === "user" || message?.role === "assistant";
    const contentOk = Array.isArray(message?.content) && message.content.every(isValidContentBlock);
    if (!roleOk || !contentOk) return badRequest("malformed message in transcript");
  }

  const tools = sanitizeTools(body?.tools);
  const system = buildSystemPrompt(body?.context);

  try {
    const response = await client.send(new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: system }],
      messages,
      toolConfig: tools.length > 0 ? { tools } : undefined,
      inferenceConfig: { maxTokens: MAX_OUTPUT_TOKENS, temperature: 0.3 },
    }));
    return reply(200, {
      stopReason: response.stopReason ?? "end_turn",
      content: response.output?.message?.content ?? [],
      usage: response.usage ?? undefined,
    });
  } catch (error) {
    const name = error?.name ?? "Error";
    if (name === "ThrottlingException" || name === "ServiceQuotaExceededException") {
      return reply(429, { error: { code: "throttled", message: "model busy, retry shortly" } });
    }
    if (name === "AccessDeniedException") {
      return reply(502, { error: { code: "access_denied", message: "model not enabled for this account" } });
    }
    console.error("converse failed", name, error?.message);
    return reply(500, { error: { code: "upstream", message: "model call failed" } });
  }
}
