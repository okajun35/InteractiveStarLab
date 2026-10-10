// Agent in-band guidance: tool results carry machine-readable hints so the
// consult model (and external WebMCP agents) learn the workflow from tool
// results, not only from the system prompt. Covers:
//   H1 open_plan_view reports pendingProposal and hints when the view is empty
//   H2 propose_plan / commit_proposal return a nextAction tool name
//   H3 open_observe_view reports the active Mission and hints when absent
//   H4 predict_visible_stars reports sun altitude and flags daylight honestly
//   H5 the consult prompt teaches the model to follow hint/nextAction fields
//   H6 the WebMCP provider wires the new state accessors
// Run: node scripts/run-verify.cjs verify-agent-hints.ts
import { readFileSync } from "node:fs";
import { predictVisibleStars } from "../src/mcp/services";
import { registerPlanTools } from "../src/mcp/writeTools";
import { registerSkyControlTools } from "../src/mcp/skyControlTools";
import { registerProposalTools } from "../src/mcp/proposalTools";
import type { PlanProposal } from "../src/proposals/model";
import type { ObservationMission, ObservationSite } from "../src/types/observation";
import type { WebMcpModelContext, WebMcpTool } from "../src/mcp/webmcp";

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ✓ ${name}`);
  else {
    console.log(`FAIL  ${name} ${detail}`);
    failures += 1;
  }
}

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const writeToolsSrc = read("src/mcp/writeTools.ts");
const skyControlSrc = read("src/mcp/skyControlTools.ts");
const servicesSrc = read("src/mcp/services.ts");
const contractsSrc = read("src/mcp/contracts.ts");
const webmcpStateSrc = read("src/state/webmcp.tsx");
const lambdaSrc = read("lambda/consult-agent.mjs");

const site: ObservationSite = {
  id: "tokyo",
  name: "Tokyo",
  latitude: 35.6812,
  longitude: 139.7671,
  timeZone: "Asia/Tokyo",
};

function capture() {
  const tools: WebMcpTool[] = [];
  const modelContext: WebMcpModelContext = {
    async registerTool(tool) {
      tools.push(tool);
    },
  };
  return { tools, modelContext };
}

// ---- H1: open_plan_view reports what will render -------------------------
{
  const { tools, modelContext } = capture();
  await registerPlanTools(modelContext, {
    getObservationSite: () => site,
    createObservationPlan: () => {
      throw new Error("not used by open_plan_view");
    },
    openObserve: () => undefined,
    openPlan: () => undefined,
    getActiveMissionId: () => null,
    getPendingProposal: () => false,
  });
  const open = tools.find((tool) => tool.name === "open_plan_view")!;
  const empty = JSON.parse(String(await open.execute({})));
  check(
    "H1: open_plan_view exposes a pendingProposal flag",
    empty.ok === true && empty.data.pendingProposal === false,
    JSON.stringify(empty.data),
  );
  check(
    "H1: opening an empty Plan returns a hint",
    typeof empty.data.hint === "string" && empty.data.hint.length > 10,
    JSON.stringify(empty.data),
  );

  const { tools: pendingTools, modelContext: pendingCtx } = capture();
  await registerPlanTools(pendingCtx, {
    getObservationSite: () => site,
    createObservationPlan: () => {
      throw new Error("not used by open_plan_view");
    },
    openObserve: () => undefined,
    openPlan: () => undefined,
    getActiveMissionId: () => null,
    getPendingProposal: () => true,
  });
  const pendingOpen = pendingTools.find((tool) => tool.name === "open_plan_view")!;
  const pending = JSON.parse(String(await pendingOpen.execute({})));
  check(
    "H1: a pending proposal is reported and is not an empty view",
    pending.ok === true && pending.data.pendingProposal === true &&
      pending.data.hint === undefined,
    JSON.stringify(pending.data),
  );
  check(
    "H1: PlanToolState declares getPendingProposal",
    /getPendingProposal\?:/.test(writeToolsSrc),
  );
}

// ---- H2: proposal tools point at the next step ----------------------------
{
  let proposal: PlanProposal | null = null;
  const missions: ObservationMission[] = [];
  const { tools, modelContext } = capture();
  await registerProposalTools(modelContext, {
    getObservationSite: () => site,
    getObservationDateTime: () => new Date("2026-10-10T12:00:00.000Z"),
    getProposal: () => proposal,
    propose: (next) => {
      proposal = next;
    },
    commitProposal: async (toCommit, starIds) => {
      const mission: ObservationMission = {
        id: `mission-${missions.length + 1}`,
        siteId: toCommit.siteSnapshot.id,
        siteSnapshot: toCommit.siteSnapshot,
        dateTime: toCommit.dateTime,
        maxMagnitude: toCommit.maxMagnitude,
        targets: starIds.map((starId) => ({
          starId,
          predictedVisible: true,
          predictedAltitude: 50,
          predictedAzimuth: 200,
          predictedMagnitude: 1,
        })),
        createdAt: new Date().toISOString(),
      };
      missions.push(mission);
      proposal = { ...toCommit, status: "committed", commitMissionId: mission.id };
      return mission;
    },
  });
  const propose = tools.find((tool) => tool.name === "propose_plan")!;
  const commit = tools.find((tool) => tool.name === "commit_proposal")!;
  const proposed = JSON.parse(String(await propose.execute({
    dateTime: "2026-10-10T12:00:00.000Z",
    maxMagnitude: 3,
    starIds: ["vega", "altair"],
  })));
  check(
    "H2: propose_plan result carries nextAction",
    proposed.ok === true && proposed.data.nextAction === "open_plan_view",
    JSON.stringify(proposed.data),
  );
  const committed = JSON.parse(String(await commit.execute({})));
  check(
    "H2: commit_proposal result carries nextAction",
    committed.ok === true && committed.data.nextAction === "open_plan_view",
    JSON.stringify(committed.data),
  );
}

// ---- H3: open_observe_view warns when there is no Mission -----------------
{
  const { tools, modelContext } = capture();
  await registerSkyControlTools(modelContext, {
    getObservationSite: () => site,
    getObservationSettings: () => ({
      latitude: site.latitude,
      longitude: site.longitude,
      datetime: new Date("2026-10-10T12:00:00.000Z"),
      azimuth: 180,
      altitude: 30,
      fieldOfView: 80,
    }),
    updateObservationSite: () => undefined,
    updateObservationSettings: () => undefined,
    openSky: () => undefined,
    openObserve: () => undefined,
    getActiveMissionId: () => null,
  });
  const observe = tools.find((tool) => tool.name === "open_observe_view")!;
  const noMission = JSON.parse(String(await observe.execute({})));
  check(
    "H3: open_observe_view exposes activeMissionId",
    noMission.ok === true && noMission.data.activeMissionId === null,
    JSON.stringify(noMission.data),
  );
  check(
    "H3: Observe without a Mission returns a hint",
    typeof noMission.data.hint === "string" && noMission.data.hint.length > 10,
    JSON.stringify(noMission.data),
  );

  const { tools: missionTools, modelContext: missionCtx } = capture();
  await registerSkyControlTools(missionCtx, {
    getObservationSite: () => site,
    getObservationSettings: () => ({
      latitude: site.latitude,
      longitude: site.longitude,
      datetime: new Date("2026-10-10T12:00:00.000Z"),
      azimuth: 180,
      altitude: 30,
      fieldOfView: 80,
    }),
    updateObservationSite: () => undefined,
    updateObservationSettings: () => undefined,
    openSky: () => undefined,
    openObserve: () => undefined,
    getActiveMissionId: () => "mission-1",
  });
  const withMission = missionTools.find((tool) => tool.name === "open_observe_view")!;
  const ready = JSON.parse(String(await withMission.execute({})));
  check(
    "H3: Observe with a Mission reports it and stays quiet",
    ready.ok === true && ready.data.activeMissionId === "mission-1" &&
      ready.data.hint === undefined,
    JSON.stringify(ready.data),
  );
  check(
    "H3: SkyControlToolState declares getActiveMissionId",
    /getActiveMissionId\?:/.test(skyControlSrc),
  );
}

// ---- H4: predict_visible_stars is honest about daylight -------------------
{
  // 16:00 JST on 2026-10-10: the Sun is still up in Tokyo.
  const day = predictVisibleStars({
    site,
    dateTime: "2026-10-10T07:00:00.000Z",
    maxMagnitude: 3,
  });
  check(
    "H4: daytime prediction flags daylight",
    day.daylight === true && day.sunAltitudeDeg > -12,
    `sunAltitudeDeg=${day.sunAltitudeDeg}`,
  );
  check(
    "H4: daylight prediction explains itself in caveats",
    day.caveats.some((caveat) => /sun|daylight|twilight/i.test(caveat)),
    JSON.stringify(day.caveats),
  );

  // 21:00 JST on 2026-10-10: nautical twilight has long ended.
  const night = predictVisibleStars({
    site,
    dateTime: "2026-10-10T12:00:00.000Z",
    maxMagnitude: 3,
  });
  check(
    "H4: night prediction is not flagged daylight",
    night.daylight === false && night.sunAltitudeDeg < -12,
    `sunAltitudeDeg=${night.sunAltitudeDeg}`,
  );
  check(
    "H4: the result contract declares sunAltitudeDeg and daylight",
    /sunAltitudeDeg:/.test(contractsSrc) && /daylight:/.test(contractsSrc),
  );
  check(
    "H4: the service uses the shared sun-altitude math",
    servicesSrc.includes("sunAltitudeDeg"),
  );
}

// ---- H5: the consult prompt follows in-band guidance ----------------------
{
  check(
    "H5: the Lambda prompt mentions nextAction",
    lambdaSrc.includes("nextAction"),
  );
  check(
    "H5: the Lambda prompt mentions hint fields",
    /\bhint\b/.test(lambdaSrc),
  );
}

// ---- H6: provider wiring ---------------------------------------------------
{
  const planBlock = webmcpStateSrc.slice(
    webmcpStateSrc.indexOf("registerPlanTools("),
    webmcpStateSrc.indexOf("registerRecoveryTools("),
  );
  check(
    "H6: the provider wires getPendingProposal into plan tools",
    planBlock.includes("getPendingProposal"),
  );
  const skyBlock = webmcpStateSrc.slice(
    webmcpStateSrc.indexOf("registerSkyControlTools("),
    webmcpStateSrc.indexOf("registerObservationWriteTools("),
  );
  check(
    "H6: the provider wires getActiveMissionId into sky-control tools",
    skyBlock.includes("getActiveMissionId"),
  );
}

if (failures > 0) {
  console.error(`\n${failures} agent-hint check(s) failed`);
  process.exit(1);
}
console.log("\nAll agent-hint checks passed");
