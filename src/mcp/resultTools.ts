import { findObservationRecord, sortObservationRecords } from "../observation/history";
import type { ObservationRecord } from "../types/observation";
import type { CloudMissionSnapshotReference } from "../cloud/snapshotReference";
import { compareObservationRecordDetailed, observationRecordToToolResult } from "./services";
import {
  assertObject,
  assertOnlyKeys,
  requiredString,
  ToolExecutionError,
} from "./input";
import type {
  WebMcpModelContext,
  WebMcpRegisterOptions,
  WebMcpTool,
} from "./webmcp";

export interface ResultToolState {
  getRecords: () => readonly ObservationRecord[];
  getSelectedRecordMissionId: () => string | null;
  /** True only while a signed-in cloud repository is the source of truth. */
  isCloudEnabled?: () => boolean;
  getCloudRecord?: (missionId: string) => Promise<ObservationRecord | null>;
  getCloudLatestRecord?: () => Promise<ObservationRecord | null>;
  getCloudSnapshotInfo?: (missionId: string) => Promise<CloudMissionSnapshotReference | null>;
}

async function selectedOrLatestRecord(state: ResultToolState, missionId: string | null): Promise<ObservationRecord> {
  if (state.isCloudEnabled?.() === true && state.getCloudRecord !== undefined) {
    const cloudRecord = missionId === null && state.getCloudLatestRecord !== undefined
      ? await state.getCloudLatestRecord()
      : missionId === null
        ? null
        : await state.getCloudRecord(missionId);
    if (cloudRecord !== null) return cloudRecord;
    if (missionId !== null || state.getCloudLatestRecord !== undefined) {
      throw new ToolExecutionError("RESULT_NOT_FOUND", "observation result was not found");
    }
  }
  const records = state.getRecords();
  const selectedId = missionId ?? state.getSelectedRecordMissionId();
  const record = selectedId === null
    ? sortObservationRecords(records)[0] ?? null
    : findObservationRecord(records, selectedId);
  if (record === null) {
    throw new ToolExecutionError("RESULT_NOT_FOUND", "observation result was not found");
  }
  return record;
}

function safeExecuteAsync<T>(operation: () => Promise<T>): Promise<string> {
  return operation()
    .then((value) => JSON.stringify({ ok: true, data: value }))
    .catch((error) => JSON.stringify({
      ok: false,
      error: {
        code: error instanceof ToolExecutionError ? error.code : "RESULT_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Observation result was not available",
      },
    }));
}

function parseMissionId(input: unknown): string | null {
  const object = assertObject(input);
  assertOnlyKeys(object, ["missionId"]);
  if (object.missionId === undefined) return null;
  return requiredString(object, "missionId");
}

function getObservationResultsTool(state: ResultToolState): WebMcpTool {
  return {
    name: "get_observation_results",
    title: "Get observation results",
    description: "Returns a completed observation record with star names, prediction snapshots, and human observation statuses. Without a missionId, returns the selected record or the newest completed record.",
    inputSchema: {
      type: "object",
      properties: {
        missionId: { type: "string", description: "Optional observation Mission ID" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => safeExecuteAsync(async () => {
      const missionId = parseMissionId(input);
      const record = await selectedOrLatestRecord(state, missionId);
      const result = observationRecordToToolResult(record);
      const snapshot = state.isCloudEnabled?.() === true && state.getCloudSnapshotInfo !== undefined
        ? await state.getCloudSnapshotInfo(record.missionId)
        : null;
      return {
        ...result,
        ...(snapshot === null ? { snapshotArchived: false as const } : {
          snapshotArchived: true as const,
          snapshotId: snapshot.snapshotId,
          snapshotCapturedAt: snapshot.createdAt,
        }),
      };
    }),
  };
}

function comparePredictionTool(state: ResultToolState): WebMcpTool {
  return {
    name: "compare_prediction_and_observation",
    title: "Compare prediction and observation",
    description: "Compares the fixed Mission prediction with human observation results. Unsure observations are excluded from the match-rate denominator.",
    inputSchema: {
      type: "object",
      properties: {
        missionId: { type: "string", description: "Observation Mission ID" },
      },
      required: ["missionId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => safeExecuteAsync(async () => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["missionId"]);
      const missionId = requiredString(object, "missionId");
      return {
        missionId,
        ...compareObservationRecordDetailed(await selectedOrLatestRecord(state, missionId)),
      };
    }),
  };
}

export async function registerResultTools(
  modelContext: WebMcpModelContext,
  state: ResultToolState,
  options: WebMcpRegisterOptions = {},
): Promise<void> {
  await modelContext.registerTool(getObservationResultsTool(state), options);
  await modelContext.registerTool(comparePredictionTool(state), options);
}
