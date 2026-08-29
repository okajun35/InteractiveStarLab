import { sortObservationRecords } from "../observation/history";
import type { ObservationRecord } from "../types/observation";
import { compareObservationRecordDetailed } from "./services";
import { assertObject, assertOnlyKeys, requiredString, safeExecute, ToolExecutionError } from "./input";
import type { WebMcpModelContext, WebMcpRegisterOptions, WebMcpTool } from "./webmcp";

export interface ResultNavigationToolState {
  getRecords: () => readonly ObservationRecord[];
  getSelectedRecordMissionId: () => string | null;
  selectRecord: (missionId: string) => void;
  openResults: () => void;
}

function selectRecordOrLatest(state: ResultNavigationToolState, requestedMissionId: string | null): ObservationRecord {
  const records = state.getRecords();
  const missionId = requestedMissionId ?? state.getSelectedRecordMissionId();
  const record = missionId === null
    ? sortObservationRecords(records)[0] ?? null
    : records.find((item) => item.missionId === missionId) ?? null;
  if (record === null) throw new ToolExecutionError("RESULT_NOT_FOUND", "observation result was not found");
  return record;
}

function openObservationResultsTool(state: ResultNavigationToolState): WebMcpTool {
  return {
    name: "open_observation_results",
    title: "Open observation results",
    description: "Selects a saved observation result and opens the human-facing Results screen. Without a missionId, uses the selected record or newest completed record. This tool does not recompute or modify results.",
    inputSchema: {
      type: "object",
      properties: {
        missionId: { type: "string", description: "Optional saved Mission ID" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["missionId"]);
      const requestedMissionId = object.missionId === undefined ? null : requiredString(object, "missionId");
      const record = selectRecordOrLatest(state, requestedMissionId);
      state.selectRecord(record.missionId);
      state.openResults();
      const comparison = compareObservationRecordDetailed(record);
      return {
        view: "results" as const,
        missionId: record.missionId,
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

export async function registerResultNavigationTools(
  modelContext: WebMcpModelContext,
  state: ResultNavigationToolState,
  options: WebMcpRegisterOptions = {},
): Promise<void> {
  await modelContext.registerTool(openObservationResultsTool(state), options);
}
