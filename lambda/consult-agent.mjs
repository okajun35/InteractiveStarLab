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
 *        ALLOWED_ORIGIN (default "*"; set the app origin for production)
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
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";
const MAX_BODY_BYTES = 32 * 1024;
const MAX_MESSAGES = 30;
const MAX_OUTPUT_TOKENS = 800;
const ALLOWED_TOOLS = new Set([
  "get_observation_site",
  "configure_sky_view",
  "predict_visible_stars",
  "propose_plan",
]);

const client = new BedrockRuntimeClient({});

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    "- Use only the provided tools. configure_sky_view accepts built-in place presets or an explicit site;",
    "  never invent a latitude/longitude for a place name you do not have coordinates for — ask instead.",
    "- Predictions are geometric only: no weather or cloud guarantees. Say so when it matters.",
    "- Keep replies short and concrete. When proposing stars, prefer at most 3 with one-line reasons each,",
    "  and only use star IDs returned by predict_visible_stars.",
    "- If the date/time or place is ambiguous, ask one short clarifying question.",
    "- propose_plan only stages a suggestion; the human reviews and commits it on the Plan screen.",
    locale === "ja"
      ? "- Always reply in natural Japanese (polite, concise)."
      : "- Always reply in English.",
  ];
  return lines.join("\n");
}

export async function handler(event) {
  const method = event.requestContext?.http?.method ?? event.httpMethod ?? "POST";
  if (method === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
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
