// Agent auto-commit: inside the consult loop, a staged proposal becomes a
// Mission immediately — the in-app user never approves twice. External WebMCP
// agents keep the human-review gate because they call the tools directly and
// never pass through this loop. Covers:
//   C1 the loop runs commit_proposal after a successful propose_plan and merges
//      the outcome into the tool result the model sees
//   C2 a failed proposal is not committed and a missing commit tool degrades
//      gracefully
//   C3 the external path is untouched: the proposal tools themselves stay
//      gated (no auto-commit inside the shared tool layer)
//   C4 the consult prompt describes the new one-step semantics
//   C5 the Plan empty state acknowledges a pending proposal instead of
//      claiming nothing exists (external proposals still wait for review)
// Run: node scripts/run-verify.cjs verify-agent-autocommit.ts
import { readFileSync } from "node:fs";
import { runConsultation, type AgentRequest, type AgentResponse, type AgentContext } from "../src/agent/loop";
import type { WebMcpTool } from "../src/mcp/webmcp";
import { en } from "../src/i18n/en";
import { ja } from "../src/i18n/ja";

const enDict = en as unknown as Record<string, string>;
const jaDict = ja as unknown as Record<string, string>;

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ✓ ${name}`);
  else {
    console.log(`FAIL  ${name} ${detail}`);
    failures += 1;
  }
}

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const loopSrc = read("src/agent/loop.ts");
const proposalSrc = read("src/mcp/proposalTools.ts");
const lambdaSrc = read("lambda/consult-agent.mjs");
const emptyStateSrc = read("src/components/observation/ObservationPlanEmptyState.tsx");

const context: AgentContext = {
  nowIso: "2026-10-10T12:00:00.000Z",
  timezone: "Asia/Tokyo",
  locale: "ja",
  site: { name: "Tokyo", latitude: 35.6812, longitude: 139.7671, timeZone: "Asia/Tokyo" },
};

function fakeTool(name: string, body: unknown, spy?: () => void): WebMcpTool {
  return {
    name,
    title: name,
    description: name,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async () => {
      spy?.();
      return JSON.stringify(body);
    },
  };
}

function scriptedApi(responses: AgentResponse[]): { calls: AgentRequest[]; callApi: (r: AgentRequest) => Promise<AgentResponse> } {
  const calls: AgentRequest[] = [];
  let index = 0;
  return {
    calls,
    callApi: async (request) => {
      calls.push(request);
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return response;
    },
  };
}

function firstToolResultText(result: Awaited<ReturnType<typeof runConsultation>>): string {
  const message = result.messages.find(
    (entry) => entry.role === "user" && entry.content.some((block) => "toolResult" in block),
  );
  const block = message?.content.find((candidate) => "toolResult" in candidate);
  if (block === undefined || !("toolResult" in block)) return "";
  return block.toolResult.content.map((part) => part.text).join("");
}

// ---- C1: propose_plan auto-commits inside the consult loop -----------------
{
  let committed = 0;
  const tools = [
    fakeTool("propose_plan", {
      ok: true,
      data: { summary: "staged", proposal: { id: "p-1" }, nextAction: "open_plan_view" },
    }),
    fakeTool("commit_proposal", {
      ok: true,
      data: {
        summary: "committed",
        missionId: "mission-1",
        targetCount: 3,
        committed: ["vega", "capella", "altair"],
        rejected: [],
      },
    }, () => {
      committed += 1;
    }),
  ];
  const { callApi } = scriptedApi([
    {
      stopReason: "tool_use",
      content: [{ toolUse: { toolUseId: "u1", name: "propose_plan", input: { dateTime: "2026-10-10T12:00:00.000Z", maxMagnitude: 3, starIds: ["vega"] } } }],
    },
    { stopReason: "end_turn", content: [{ text: "ミッションを作成しました" }] },
  ]);
  const outcome = await runConsultation([], "3つ見たい", { tools, context, callApi });
  check("C1: the loop runs commit_proposal after propose_plan", committed === 1, `commits=${committed}`);
  const resultText = firstToolResultText(outcome);
  let merged: { ok?: boolean; data?: Record<string, unknown> } = {};
  try { merged = JSON.parse(resultText); } catch { /* parsed below */ }
  check(
    "C1: the tool result reports the auto-commit",
    merged.ok === true && merged.data?.autoCommitted === true && merged.data?.missionId === "mission-1",
    resultText.slice(0, 200),
  );
  check(
    "C1: the proposal payload survives the merge",
    typeof merged.data?.proposal === "object" && merged.data.proposal !== null,
    resultText.slice(0, 200),
  );
  check(
    "C1: the merged result does not command navigation",
    merged.data?.nextAction === undefined,
    `nextAction=${String(merged.data?.nextAction)}`,
  );
  check(
    "C1: the merged result tells the model to report, not navigate",
    typeof merged.data?.hint === "string" && /Mission/i.test(String(merged.data.hint)),
    String(merged.data?.hint),
  );
  check(
    "C1: static — the loop owns the auto-commit behaviour",
    loopSrc.includes("propose_plan") && loopSrc.includes("commit_proposal") && loopSrc.includes("autoCommitted"),
  );
}

// ---- C2: failure paths ------------------------------------------------------
{
  let committed = 0;
  const tools = [
    fakeTool("propose_plan", { ok: false, error: { code: "INVALID_ARGUMENT", message: "bad input" } }),
    fakeTool("commit_proposal", { ok: true, data: { missionId: "should-not-run" } }, () => {
      committed += 1;
    }),
  ];
  const { callApi } = scriptedApi([
    { stopReason: "tool_use", content: [{ toolUse: { toolUseId: "u1", name: "propose_plan", input: {} } }] },
    { stopReason: "end_turn", content: [{ text: "失敗しました" }] },
  ]);
  const outcome = await runConsultation([], "plan", { tools, context, callApi });
  check("C2: a failed proposal is never committed", committed === 0, `commits=${committed}`);
  check("C2: the original error result passes through",
    firstToolResultText(outcome).includes("bad input"));

  // No commit tool registered: the propose result must pass through untouched.
  const soloTools = [fakeTool("propose_plan", { ok: true, data: { proposal: { id: "p-solo" } } })];
  const solo = scriptedApi([
    { stopReason: "tool_use", content: [{ toolUse: { toolUseId: "u1", name: "propose_plan", input: {} } }] },
    { stopReason: "end_turn", content: [{ text: "ok" }] },
  ]);
  const soloOutcome = await runConsultation([], "plan", { tools: soloTools, context, callApi: solo.callApi });
  check("C2: no commit tool → result passes through",
    firstToolResultText(soloOutcome).includes("p-solo") &&
    !firstToolResultText(soloOutcome).includes("autoCommitted"));

  // Commit itself fails: the model is told, not left guessing.
  const failingTools = [
    fakeTool("propose_plan", { ok: true, data: { proposal: { id: "p-2" } } }),
    fakeTool("commit_proposal", { ok: false, error: { code: "STATE", message: "proposal gone" } }, () => {
      committed += 1;
    }),
  ];
  const failing = scriptedApi([
    { stopReason: "tool_use", content: [{ toolUse: { toolUseId: "u1", name: "propose_plan", input: {} } }] },
    { stopReason: "end_turn", content: [{ text: "確定に失敗" }] },
  ]);
  const failOutcome = await runConsultation([], "plan", { tools: failingTools, context, callApi: failing.callApi });
  const failText = firstToolResultText(failOutcome);
  check("C2: a failed commit is surfaced as autoCommitted:false",
    failText.includes("autoCommitted") && failText.includes("false"),
    failText.slice(0, 200));
}

// ---- C3: the external path keeps the review gate ----------------------------
{
  check(
    "C3: the shared proposal tool does not auto-commit",
    !proposalSrc.includes("autoCommitted") && !proposalSrc.includes("autoCommit"),
  );
  check(
    "C3: propose_plan still describes the human review step",
    proposalSrc.includes("review"),
  );
}

// ---- C4: the consult prompt describes one-step proposals --------------------
{
  check(
    "C4: the prompt says proposals become Missions immediately",
    /propose_plan[^]*?(immediately|auto)/s.test(lambdaSrc) || lambdaSrc.includes("immediately"),
  );
  check(
    "C4: the prompt says the Mission already exists after propose_plan",
    lambdaSrc.includes("autoCommitted"),
  );
  check(
    "C4: the prompt gates guide generation on an explicit ask",
    lambdaSrc.includes("explicitly asks for a guide"),
  );
}

// ---- C6: navigation is user-driven — gated tool descriptions + a chip ------
// A weak model kept calling open_plan_view unprompted despite prompt rules and
// stripped nextAction. Two deterministic guards: the consult toolSpec override
// states the explicit-ask gate in the tool's own description (which the model
// reads at selection time), and the panel surfaces a one-click "open Plan"
// chip after the auto-commit so the human drives the transition.
{
  const { CONSULT_TOOL_NAMES } = await import("../src/agent/toolspec");
  check(
    "C6: open_plan_view stays allowlisted for explicit asks",
    (CONSULT_TOOL_NAMES as readonly string[]).includes("open_plan_view"),
  );
  const { toToolSpec } = await import("../src/agent/toolspec");
  const gated = toToolSpec(fakeTool("open_plan_view", {}));
  check(
    "C6: the consult spec gates open_plan_view on an explicit ask",
    /explicit/i.test(gated.toolSpec.description) || /only when/i.test(gated.toolSpec.description),
    gated.toolSpec.description.slice(0, 140),
  );
  const consultSrc = read("src/components/ConsultPanel.tsx");
  check(
    "C6: the panel shows an open-Plan chip after commit_proposal",
    consultSrc.includes("commit_proposal") && consultSrc.includes("useNavigation"),
  );
  check(
    "C6: chip copy exists in both locales",
    typeof enDict["consult.openPlan"] === "string" &&
      typeof jaDict["consult.openPlan"] === "string",
  );
}

// ---- C5: pending-proposal empty-state copy ----------------------------------
{
  check(
    "C5: the empty state reads the pending proposal",
    emptyStateSrc.includes("useProposals") && emptyStateSrc.includes("pending"),
  );
  check(
    "C5: pending-proposal copy exists in both locales",
    typeof enDict["plan.pendingProposal"] === "string" &&
      typeof jaDict["plan.pendingProposal"] === "string" &&
      typeof enDict["plan.pendingProposalNote"] === "string" &&
      typeof jaDict["plan.pendingProposalNote"] === "string",
  );
}

if (failures > 0) {
  console.error(`\n${failures} agent-autocommit check(s) failed`);
  process.exit(1);
}
console.log("\nAll agent-autocommit checks passed");
