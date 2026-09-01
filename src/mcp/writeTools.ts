import type { ObservationSite } from "../types/observation";
import type { ObservationMission } from "../types/observation";
import type { CreateObservationPlanInput } from "./contracts";
import {
  assertObject,
  assertOnlyKeys,
  requiredNumber,
  requiredString,
  requiredStringArray,
} from "./input";
import type {
  WebMcpModelContext,
  WebMcpRegisterOptions,
  WebMcpTool,
} from "./webmcp";

export interface PlanToolState {
  getObservationSite: () => ObservationSite;
  createObservationPlan: (input: CreateObservationPlanInput) => ObservationMission | Promise<ObservationMission>;
  getActiveMissionId?: () => string | null;
  openPlan?: () => void;
  openObserve: () => void;
  isCloudEnabled?: () => boolean;
  reportPlanMissionCreated?: (activity: { missionId: string; targetCount: number; siteName: string }) => void;
}

function safeExecuteAsync<T>(operation: () => Promise<T>): Promise<string> {
  return operation()
    .then((value) => JSON.stringify({ ok: true, data: value }))
    .catch((error) => JSON.stringify({
      ok: false,
      error: {
        code: error instanceof Error && error.name === "CloudApplicationError" && "code" in error
          ? String((error as { code: unknown }).code)
          : "INVALID_ARGUMENT",
        message: error instanceof Error ? error.message : "Tool execution failed",
      },
    }));
}

function reportPlanActivity(state: PlanToolState, activity: { missionId: string; targetCount: number; siteName: string }): void {
  try {
    state.reportPlanMissionCreated?.(activity);
  } catch {
    // Activity presentation is best effort and must never fail Mission creation.
  }
}

function createObservationPlanTool(state: PlanToolState): WebMcpTool {
  return {
    name: "create_observation_plan",
    title: "Create observation plan",
    description: "Creates an observation Mission for up to five selected star IDs using the current observation site, then opens Plan for human review before Sky or Observe. To archive the actual rendered Sky canvas, open Sky with the same Mission date and site and call capture_sky_snapshot with the returned missionId.",
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
          description: "One to five star IDs returned by predict_visible_stars",
        },
      },
      required: ["dateTime", "maxMagnitude", "starIds"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => safeExecuteAsync(async () => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["dateTime", "maxMagnitude", "starIds"]);
      const starIds = requiredStringArray(object, "starIds");
      if (starIds.length < 1 || starIds.length > 5) {
        throw new Error("starIds must contain between 1 and 5 stars");
      }
      if (new Set(starIds).size !== starIds.length) {
        throw new Error("starIds must be unique");
      }
      const args: CreateObservationPlanInput = {
        site: { ...state.getObservationSite() },
        dateTime: requiredString(object, "dateTime"),
        maxMagnitude: requiredNumber(object, "maxMagnitude"),
        starIds,
      };
      const mission = await state.createObservationPlan(args);
      state.openPlan?.();
      reportPlanActivity(state, {
        missionId: mission.id,
        targetCount: mission.targets.length,
        siteName: mission.siteSnapshot.name,
      });
      return {
        missionId: mission.id,
        persistence: state.isCloudEnabled?.() === true ? "supabase" as const : "local" as const,
        view: "plan",
        targetCount: mission.targets.length,
        snapshotStatus: "required" as const,
        nextAction: "Review the Mission on Plan, then open the target Sky or Observe view" as const,
        targets: mission.targets.map((target) => ({ ...target })),
      };
    }),
  };
}

function openPlanViewTool(state: PlanToolState): WebMcpTool {
  return {
    name: "open_plan_view",
    title: "Open Plan view",
    description: "Opens the human-facing Plan screen without creating or changing a Mission.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => safeExecuteAsync(async () => {
      const object = assertObject(input);
      assertOnlyKeys(object, []);
      state.openPlan?.();
      return { view: "plan" as const, activeMissionId: state.getActiveMissionId?.() ?? null };
    }),
  };
}

export async function registerPlanTools(
  modelContext: WebMcpModelContext,
  state: PlanToolState,
  options: WebMcpRegisterOptions = {},
): Promise<void> {
  await modelContext.registerTool(openPlanViewTool(state), options);
  await modelContext.registerTool(createObservationPlanTool(state), options);
}
