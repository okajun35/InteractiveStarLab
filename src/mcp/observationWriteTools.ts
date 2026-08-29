import { compareObservationRecordDetailed } from "./services";
import { normalizeObservationResults, type ObservationResultInput } from "./observationWriteServices";
import { assertObject, assertOnlyKeys, requiredString } from "./input";
import type { ObservationMission, ObservationRecord, ObservationResult } from "../types/observation";
import type { WebMcpModelContext, WebMcpRegisterOptions, WebMcpTool } from "./webmcp";

export interface ObservationWriteToolState {
  getMissions: () => readonly ObservationMission[];
  saveResultsForMission: (missionId: string, results: ObservationResult[]) => ObservationRecord | null | Promise<ObservationRecord | null>;
}

function safeExecuteAsync<T>(operation: () => Promise<T>): Promise<string> {
  return operation()
    .then((value) => JSON.stringify({ ok: true, data: value }))
    .catch((error) => JSON.stringify({
      ok: false,
      error: {
        code: error instanceof Error && error.name === "CloudApplicationError" && "code" in error
          ? String((error as { code: unknown }).code)
          : error instanceof Error && error.name === "MissionNotFoundError"
            ? "MISSION_NOT_FOUND"
            : "INVALID_ARGUMENT",
        message: error instanceof Error ? error.message : "Tool execution failed",
      },
    }));
}

function parseResults(value: unknown): ObservationResultInput[] {
  if (!Array.isArray(value)) throw new Error("results must be an array");
  return value.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error("each result must be an object");
    }
    const object = item as Record<string, unknown>;
    if (Object.keys(object).some((key) => key !== "starId" && key !== "status")) {
      throw new Error("result contains an unknown property");
    }
    if (typeof object.starId !== "string" || object.starId.trim() === "") {
      throw new Error("result starId must be a non-empty string");
    }
    if (object.status !== "visible" && object.status !== "not_visible" && object.status !== "unsure") {
      throw new Error(`invalid observation status for ${object.starId}`);
    }
    return { starId: object.starId, status: object.status };
  });
}

function saveObservationResultsTool(state: ObservationWriteToolState): WebMcpTool {
  return {
    name: "save_observation_results",
    title: "Save observation results",
    description: "Saves only observation statuses explicitly reported by the user for every target in a Mission. It does not invent or infer observations, and it preserves the Mission creation-time prediction snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        missionId: { type: "string", description: "Mission ID to complete" },
        results: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          description: "Exactly one user-reported result per Mission target",
          items: {
            type: "object",
            properties: {
              starId: { type: "string", description: "Star ID from the Mission" },
              status: { type: "string", enum: ["visible", "not_visible", "unsure"], description: "The user's observation status" },
            },
            required: ["starId", "status"],
            additionalProperties: false,
          },
        },
      },
      required: ["missionId", "results"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => safeExecuteAsync(async () => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["missionId", "results"]);
      const missionId = requiredString(object, "missionId");
      const mission = state.getMissions().find((item) => item.id === missionId);
      if (!mission) {
        const error = new Error(`mission not found: ${missionId}`);
        error.name = "MissionNotFoundError";
        throw error;
      }
      const normalized = normalizeObservationResults(mission, parseResults(object.results));
      const record = await state.saveResultsForMission(missionId, normalized);
      if (!record) {
        const error = new Error(`mission not found: ${missionId}`);
        error.name = "MissionNotFoundError";
        throw error;
      }
      const comparison = compareObservationRecordDetailed(record);
      return {
        missionId: record.missionId,
        saved: true,
        completedAt: record.completedAt,
        summary: {
          predicted: comparison.predicted,
          visible: comparison.visible,
          notVisible: comparison.notVisible,
          unsure: comparison.unsure,
          matches: comparison.matches,
          mismatches: comparison.mismatches,
        },
      };
    }),
  };
}

export async function registerObservationWriteTools(
  modelContext: WebMcpModelContext,
  state: ObservationWriteToolState,
  options: WebMcpRegisterOptions = {},
): Promise<void> {
  await modelContext.registerTool(saveObservationResultsTool(state), options);
}
