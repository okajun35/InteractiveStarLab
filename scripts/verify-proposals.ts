/**
 * Verification: ghost plan proposals — propose_plan stages a review that never
 * touches mission state, commit_proposal materializes accepted items into a
 * real Mission (which stays immutable thereafter), and plan_stale reports when
 * the conditions a proposal was computed against have drifted.
 *
 * Run with: node scripts/run-verify.cjs verify-proposals.ts
 */
import {
  acceptedStarIds,
  createPlanProposal,
  detectPlanStale,
  setItemDecision,
  type PlanProposal,
} from "../src/proposals/model";
import { registerProposalTools } from "../src/mcp/proposalTools";
import type { WebMcpModelContext, WebMcpTool } from "../src/mcp/webmcp";
import type { ObservationMission, ObservationSite } from "../src/types/observation";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL  ${name}  ${detail}`);
}

const site: ObservationSite = {
  id: "tokyo",
  name: "Tokyo",
  latitude: 35.6812,
  longitude: 139.7671,
  timeZone: "Asia/Tokyo",
};
const dateTime = "2026-08-27T12:00:00.000Z";

// ---- pure model -----------------------------------------------------------------
{
  const proposal = createPlanProposal(
    {
      site: { ...site },
      dateTime,
      maxMagnitude: 3,
      starIds: ["vega", "altair", "deneb"],
    },
    { id: "prop-1", now: new Date("2026-08-01T00:00:00.000Z") },
  );
  check("model: proposal is not a mission", !("targets" in proposal) && proposal.id === "prop-1");
  check(
    "model: items start accepted for opt-out review",
    proposal.items.length === 3 && proposal.items.every((item) => item.decision === "accepted"),
  );
  check(
    "model: proposal captures its basis for staleness",
    proposal.basis.latitude === site.latitude &&
      proposal.basis.longitude === site.longitude &&
      proposal.basis.dateTime === dateTime,
  );

  const rejected = setItemDecision(proposal, "deneb", "rejected");
  check(
    "model: item-level reject narrows the accepted set",
    acceptedStarIds(rejected).join(",") === "vega,altair",
  );
  const back = setItemDecision(rejected, "deneb", "accepted");
  check("model: decisions can be revisited", acceptedStarIds(back).length === 3);
  const unknown = setItemDecision(proposal, "not-a-star", "rejected");
  check("model: unknown star ids are ignored", unknown === proposal);

  const same = detectPlanStale(proposal, {
    site: { ...site },
    dateTime,
  });
  check("model: unchanged conditions are not stale", same.length === 0);

  const driftedSite = detectPlanStale(proposal, {
    site: { ...site, latitude: site.latitude + 5 },
    dateTime,
  });
  check(
    "model: site drift is stale",
    driftedSite.some((reason) => reason.field === "site"),
  );
  const driftedTime = detectPlanStale(proposal, {
    site: { ...site },
    dateTime: "2026-08-28T12:00:00.000Z",
  });
  check(
    "model: dateTime drift is stale",
    driftedTime.some((reason) => reason.field === "dateTime"),
  );
}

// ---- proposal tools ---------------------------------------------------------------
{
  let proposal: PlanProposal | null = null;
  const missions: ObservationMission[] = [];
  let currentSite = { ...site };
  const registered: WebMcpTool[] = [];
  const modelContext: WebMcpModelContext = {
    async registerTool(tool) {
      registered.push(tool);
    },
  };
  await registerProposalTools(modelContext, {
    getObservationSite: () => currentSite,
    getObservationDateTime: () => new Date(dateTime),
    getProposal: () => proposal,
    propose: (next) => {
      proposal = next;
    },
    commitProposal: async (proposalToCommit, starIds) => {
      const mission: ObservationMission = {
        id: `mission-${missions.length + 1}`,
        siteId: proposalToCommit.siteSnapshot.id,
        siteSnapshot: proposalToCommit.siteSnapshot,
        dateTime: proposalToCommit.dateTime,
        maxMagnitude: proposalToCommit.maxMagnitude,
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
      proposal = { ...proposalToCommit, status: "committed", commitMissionId: mission.id };
      return mission;
    },
  });
  const byName = (name: string) => registered.find((tool) => tool.name === name)!;
  const propose = byName("propose_plan");
  const commit = byName("commit_proposal");
  const stale = byName("plan_stale");
  check("tools: three proposal tools registered", Boolean(propose && commit && stale));

  const bad = JSON.parse(String(await propose.execute({
    dateTime,
    maxMagnitude: 3,
    starIds: ["vega", "not-a-real-star"],
  })));
  check("tools: unknown star ids are refused", bad.ok === false && proposal === null);

  const proposed = JSON.parse(String(await propose.execute({
    dateTime,
    maxMagnitude: 3,
    starIds: ["vega", "altair", "deneb"],
  })));
  check(
    "tools: propose stages a review without creating a mission",
    proposed.ok === true && proposal !== null && missions.length === 0,
  );
  check(
    "tools: proposal echoes its items and basis",
    proposed.data.proposal.items.length === 3 &&
      typeof proposed.data.summary === "string",
  );

  const committed = JSON.parse(String(await commit.execute({
    acceptedStarIds: ["vega", "altair"],
  })));
  check(
    "tools: commit materializes only accepted items",
    committed.ok === true &&
      missions.length === 1 &&
      missions[0].targets.length === 2 &&
      missions[0].targets.every((target) => ["vega", "altair"].includes(target.starId)),
    JSON.stringify(missions[0]?.targets),
  );
  check(
    "tools: committed proposal records the mission id",
    proposal?.status === "committed" && proposal.commitMissionId === missions[0].id,
  );

  const none = JSON.parse(String(await commit.execute({ acceptedStarIds: [] })));
  check(
    "tools: committing nothing is refused after commit",
    none.ok === false,
  );

  // plan_stale reflects live conditions.
  const fresh = JSON.parse(String(await stale.execute({})));
  check("tools: plan_stale reports committed proposal is not stale", fresh.ok === true);

  // Re-propose against current conditions, then drift the site.
  await propose.execute({ dateTime, maxMagnitude: 3, starIds: ["vega"] });
  const inSync = JSON.parse(String(await stale.execute({})));
  check(
    "tools: matching conditions are not stale",
    inSync.ok === true && inSync.data.stale === false,
  );
  currentSite = { ...currentSite, latitude: currentSite.latitude + 10, name: "Far away" };
  const drifted = JSON.parse(String(await stale.execute({})));
  check(
    "tools: site drift makes the proposal stale",
    drifted.ok === true && drifted.data.stale === true &&
      drifted.data.reasons.some((r: { field: string }) => r.field === "site"),
    JSON.stringify(drifted.data),
  );
  check(
    "tools: stale result explains itself",
    typeof drifted.data.summary === "string" && drifted.data.summary.length > 10,
  );

  // A fresh registration with no proposal reports none.
  const registered2: WebMcpTool[] = [];
  const ctx2: WebMcpModelContext = {
    async registerTool(t) {
      registered2.push(t);
    },
  };
  await registerProposalTools(ctx2, {
    getObservationSite: () => currentSite,
    getObservationDateTime: () => new Date(dateTime),
    getProposal: () => null,
    propose: () => undefined,
    commitProposal: async () => {
      throw new Error("unused");
    },
  });
  const noProposal = JSON.parse(
    String(await registered2.find((tool) => tool.name === "plan_stale")!.execute({})),
  );
  check(
    "tools: plan_stale with no proposal reports none",
    noProposal.ok === true && noProposal.data.proposal === null,
  );
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll proposal checks passed.");
