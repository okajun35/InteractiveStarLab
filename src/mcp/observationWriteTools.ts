import { compareObservationRecordDetailed } from "./services";
import { normalizeObservationResults, type ObservationResultInput } from "./observationWriteServices";
import { assertObject, assertOnlyKeys, requiredString } from "./input";
import { createUndoRegistry } from "./confirm";
import type { ObservationMission, ObservationRecord, ObservationResult } from "../types/observation";
import type { WebMcpModelContext, WebMcpRegisterOptions, WebMcpTool } from "./webmcp";

export interface ObservationWriteToolState {
  getMissions: () => readonly ObservationMission[];
  /** Record currently stored for a Mission, or null when none exists. */
  getRecord: (missionId: string) => ObservationRecord | null;
  /**
   * Puts a record back: replaces the stored record for `missionId`, or removes
   * it when `record` is null. Used only to spend undo tokens.
   */
  restoreRecord: (missionId: string, record: ObservationRecord | null) => void;
  saveResultsForMission: (missionId: string, results: ObservationResult[]) => ObservationRecord | null | Promise<ObservationRecord | null>;
}

function safeExecuteAsync<T>(operation: () => Promise<T>): Promise<string> {
  return operation()
    .then((value) => JSON.stringify({ ok: true, data: value }))
    .catch((error) => JSON.stringify({
      ok: false,
      error: {
        code: error instanceof Error && error.name === "ConfirmationRequiredError"
          ? "confirmation_required"
          : error instanceof Error && error.name === "NothingToUndoError"
            ? "nothing_to_undo"
            : error instanceof Error && error.name === "CloudApplicationError" && "code" in error
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

function saveObservationResultsTool(
  state: ObservationWriteToolState,
  undo: ReturnType<typeof createUndoRegistry>,
): WebMcpTool {
  return {
    name: "save_observation_results",
    title: "Save observation results",
    description:
      "Saves only observation statuses explicitly reported by the user for every target in a Mission. It does not invent or infer observations, and it preserves the Mission creation-time prediction snapshot. " +
      "Overwriting a Mission that already has saved results requires confirm:true. " +
      "A successful save returns an undoToken valid for 5 minutes; pass it back as { \"undoToken\": \"...\" } to restore the previous record (or remove a newly created one).",
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
        confirm: {
          type: "boolean",
          description: "Required as true when the Mission already has saved results and this call would overwrite them",
        },
        undoToken: {
          type: "string",
          description: "Token returned by an earlier save: restores the previous record instead of saving new results",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => safeExecuteAsync(async () => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["missionId", "results", "confirm", "undoToken"]);

      // --- undo branch -------------------------------------------------------
      if (object.undoToken !== undefined) {
        if (typeof object.undoToken !== "string" || object.undoToken.trim() === "") {
          throw new Error("undoToken must be the string a previous save returned");
        }
        const restored = (await undo.consume(object.undoToken)) as { restored: boolean };
        return {
          undone: true,
          restoredRecord: restored.restored,
          summary: restored.restored
            ? "The previous observation record was restored."
            : "The saved record was removed; the Mission has no results again.",
        };
      }

      // --- save branch -------------------------------------------------------
      const missionId = requiredString(object, "missionId");
      const mission = state.getMissions().find((item) => item.id === missionId);
      if (!mission) {
        const error = new Error(`mission not found: ${missionId}`);
        error.name = "MissionNotFoundError";
        throw error;
      }
      const normalized = normalizeObservationResults(mission, parseResults(object.results));
      const prior = state.getRecord(missionId);
      if (prior !== null && object.confirm !== true) {
        const error = new Error(
          "This Mission already has saved results. Re-run with confirm:true to overwrite them; the save returns an undoToken to restore the previous record.",
        );
        error.name = "ConfirmationRequiredError";
        throw error;
      }
      const record = await state.saveResultsForMission(missionId, normalized);
      if (!record) {
        const error = new Error(`mission not found: ${missionId}`);
        error.name = "MissionNotFoundError";
        throw error;
      }
      const issued = undo.issue(
        prior === null
          ? `remove the new results for ${missionId}`
          : `restore the previous results for ${missionId}`,
        () => {
          state.restoreRecord(missionId, prior === null ? null : { ...prior, results: prior.results.map((r) => ({ ...r })) });
          return { restored: prior !== null };
        },
      );
      const comparison = compareObservationRecordDetailed(record);
      return {
        missionId: record.missionId,
        saved: true,
        completedAt: record.completedAt,
        overwrote: prior !== null,
        summary: {
          predicted: comparison.predicted,
          visible: comparison.visible,
          notVisible: comparison.notVisible,
          unsure: comparison.unsure,
          matches: comparison.matches,
          mismatches: comparison.mismatches,
        },
        undoToken: issued.undoToken,
        undoExpiresAt: issued.undoExpiresAt,
      };
    }),
  };
}

export async function registerObservationWriteTools(
  modelContext: WebMcpModelContext,
  state: ObservationWriteToolState,
  options: WebMcpRegisterOptions = {},
): Promise<void> {
  await modelContext.registerTool(saveObservationResultsTool(state, createUndoRegistry()), options);
}
