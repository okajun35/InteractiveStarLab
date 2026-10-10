/**
 * WebMCP tools for ghost plan proposals. propose_plan stages a review without
 * touching Mission state, commit_proposal turns the accepted subset into a real
 * Mission through the same creation path create_observation_plan uses, and
 * plan_stale reports when the conditions a proposal was computed against have
 * drifted (site moved, observation time changed).
 */
import { STAR_BY_ID } from "../astronomy/stars";
import {
  acceptedStarIds,
  createPlanProposal,
  detectPlanStale,
  type PlanProposal,
} from "../proposals/model";
import {
  assertObject,
  assertOnlyKeys,
  requiredNumber,
  requiredString,
  requiredStringArray,
  safeExecute,
  safeExecuteAsync,
} from "./input";
import type { ObservationMission, ObservationSite } from "../types/observation";
import type { WebMcpModelContext, WebMcpRegisterOptions, WebMcpTool } from "./webmcp";

export interface ProposalToolState {
  getObservationSite: () => ObservationSite;
  getObservationDateTime: () => Date;
  getProposal: () => PlanProposal | null;
  /** Stores the proposal; a new proposal replaces the pending one. */
  propose: (proposal: PlanProposal) => void;
  /** Materializes the accepted subset into a real, immutable Mission. */
  commitProposal: (proposal: PlanProposal, starIds: string[]) => Promise<ObservationMission>;
}

let proposalCounter = 0;

function parseIsoDateTime(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("dateTime is invalid");
  return date;
}

function assertProposalInputs(object: Record<string, unknown>): {
  dateTime: string;
  maxMagnitude: number;
  starIds: string[];
} {
  const dateTime = requiredString(object, "dateTime");
  parseIsoDateTime(dateTime);
  const maxMagnitude = requiredNumber(object, "maxMagnitude");
  if (!Number.isInteger(maxMagnitude) || maxMagnitude < 1 || maxMagnitude > 4) {
    throw new RangeError("maxMagnitude must be an integer from 1 to 4");
  }
  const starIds = requiredStringArray(object, "starIds");
  if (starIds.length < 1 || starIds.length > 5) {
    throw new Error("starIds must contain between 1 and 5 stars");
  }
  if (new Set(starIds).size !== starIds.length) {
    throw new Error("starIds must be unique");
  }
  for (const starId of starIds) {
    if (!STAR_BY_ID.has(starId)) throw new Error(`star not found: ${starId}`);
  }
  return { dateTime: parseIsoDateTime(dateTime).toISOString(), maxMagnitude, starIds };
}

function proposePlanTool(state: ProposalToolState): WebMcpTool {
  return {
    name: "propose_plan",
    title: "Propose plan",
    description:
      "Stages a ghost plan proposal for human review without creating a Mission. The proposal lists one item per star; the human accepts or rejects items on the Plan screen, and commit_proposal materializes the accepted subset into a real Mission. Proposing again replaces the pending proposal.",
    inputSchema: {
      type: "object",
      properties: {
        dateTime: { type: "string", description: "ISO 8601 observation date and time" },
        maxMagnitude: { type: "integer", minimum: 1, maximum: 4, description: "Faintest magnitude allowed for targets" },
        starIds: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: { type: "string" },
          description: "One to five star IDs, e.g. returned by predict_visible_stars",
        },
      },
      required: ["dateTime", "maxMagnitude", "starIds"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["dateTime", "maxMagnitude", "starIds"]);
      const args = assertProposalInputs(object);
      proposalCounter += 1;
      const proposal = createPlanProposal(
        {
          site: { ...state.getObservationSite() },
          ...args,
        },
        { id: `proposal-${proposalCounter}`, now: new Date() },
      );
      state.propose(proposal);
      return {
        summary:
          `Staged a proposal with ${proposal.items.length} item(s) for ${proposal.siteSnapshot.name}. ` +
          `It is not a Mission: review it on the Plan screen, then commit_proposal to materialize it.`,
        proposal,
        nextAction: "open_plan_view" as const,
      };
    }),
  };
}

function commitProposalTool(state: ProposalToolState): WebMcpTool {
  return {
    name: "commit_proposal",
    title: "Commit proposal",
    description:
      "Materializes the pending proposal's accepted items into a real Mission via the normal creation path (immutable from then on). Pass acceptedStarIds to commit a subset, or omit to commit the items currently marked accepted.",
    inputSchema: {
      type: "object",
      properties: {
        acceptedStarIds: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: { type: "string" },
          description: "Subset of the proposal's star IDs to commit (defaults to the accepted items)",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => safeExecuteAsync(async () => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["acceptedStarIds"]);
      const proposal = state.getProposal();
      if (proposal === null) throw new Error("there is no pending proposal");
      if (proposal.status === "committed") {
        throw new Error(`proposal ${proposal.id} was already committed as ${proposal.commitMissionId}`);
      }
      let starIds = acceptedStarIds(proposal);
      if (object.acceptedStarIds !== undefined) {
        const requested = requiredStringArray(object, "acceptedStarIds");
        const known = new Set(proposal.items.map((item) => item.starId));
        for (const starId of requested) {
          if (!known.has(starId)) {
            throw new Error(`star is not part of the proposal: ${starId}`);
          }
        }
        starIds = requested;
      }
      if (starIds.length < 1) {
        throw new Error("nothing to commit: every proposal item was rejected");
      }
      const mission = await state.commitProposal(proposal, starIds);
      return {
        summary:
          `Committed ${starIds.length} item(s) of proposal ${proposal.id} as Mission ${mission.id}.`,
        missionId: mission.id,
        nextAction: "open_plan_view" as const,
        targetCount: mission.targets.length,
        committed: starIds,
        rejected: proposal.items
          .filter((item) => !starIds.includes(item.starId))
          .map((item) => item.starId),
      };
    }),
  };
}

function planStaleTool(state: ProposalToolState): WebMcpTool {
  return {
    name: "plan_stale",
    title: "Plan staleness",
    description:
      "Reports whether the pending proposal's assumptions still hold: it compares the site and observation dateTime the proposal was computed against with the current ones. A stale proposal's per-star predictions may no longer be accurate.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const object = assertObject(input);
      assertOnlyKeys(object, []);
      const proposal = state.getProposal();
      if (proposal === null) {
        return {
          proposal: null,
          stale: false,
          reasons: [],
          summary: "There is no pending proposal.",
        };
      }
      const reasons = detectPlanStale(proposal, {
        site: state.getObservationSite(),
        dateTime: state.getObservationDateTime().toISOString(),
      });
      return {
        proposal: {
          id: proposal.id,
          status: proposal.status,
          basis: { ...proposal.basis },
          itemCount: proposal.items.length,
          acceptedCount: acceptedStarIds(proposal).length,
        },
        stale: reasons.length > 0,
        reasons,
        summary:
          reasons.length === 0
            ? `Proposal ${proposal.id} still matches the current site and observation time.`
            : `Proposal ${proposal.id} is stale: ${reasons.map((reason) => `${reason.field} changed from ${reason.expected} to ${reason.actual}`).join("; ")}.`,
      };
    }),
  };
}

export async function registerProposalTools(
  modelContext: WebMcpModelContext,
  state: ProposalToolState,
  options: WebMcpRegisterOptions = {},
): Promise<void> {
  await modelContext.registerTool(proposePlanTool(state), options);
  await modelContext.registerTool(commitProposalTool(state), options);
  await modelContext.registerTool(planStaleTool(state), options);
}
