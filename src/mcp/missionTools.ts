import type { ObservationMission } from "../types/observation";
import type { CloudMissionRow } from "../cloud/missionRepository";
import { assertObject, assertOnlyKeys, requiredString, ToolExecutionError } from "./input";
import type { WebMcpModelContext, WebMcpRegisterOptions, WebMcpTool } from "./webmcp";

export interface MissionToolState {
  getMissions: () => readonly ObservationMission[];
  isCloudEnabled?: () => boolean;
  getCloudMission?: (missionId: string) => Promise<CloudMissionRow | null>;
}

function missionResult(mission: ObservationMission, cloudRow: CloudMissionRow | null) {
  const snapshot = cloudRow?.skySnapshot;
  const snapshotRecord = typeof snapshot === "object" && snapshot !== null && "snapshotId" in snapshot
    ? snapshot as { snapshotId?: unknown; createdAt?: unknown }
    : null;
  return {
    missionId: mission.id,
    site: { ...mission.siteSnapshot },
    dateTime: mission.dateTime,
    maxMagnitude: mission.maxMagnitude,
    targets: mission.targets.map((target) => ({ ...target })),
    createdAt: mission.createdAt,
    snapshotArchived: snapshotRecord?.snapshotId !== undefined,
    ...(typeof snapshotRecord?.snapshotId === "string" ? { snapshotId: snapshotRecord.snapshotId } : {}),
    ...(typeof snapshotRecord?.createdAt === "string" ? { snapshotCapturedAt: snapshotRecord.createdAt } : {}),
  };
}

function safeExecute<T>(operation: () => Promise<T>): Promise<string> {
  return operation()
    .then((value) => JSON.stringify({ ok: true, data: value }))
    .catch((error) => JSON.stringify({
      ok: false,
      error: {
        code: error instanceof ToolExecutionError
          ? error.code
          : error instanceof Error && error.name === "CloudApplicationError" && "code" in error
            ? String((error as { code: unknown }).code)
            : "MISSION_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Observation Mission was not available",
      },
    }));
}

function getObservationMissionTool(state: MissionToolState): WebMcpTool {
  return {
    name: "get_observation_mission",
    title: "Get observation Mission",
    description: "Returns one Mission by ID, including its creation-time site, date, fixed target predictions, and cloud Snapshot status.",
    inputSchema: {
      type: "object",
      properties: { missionId: { type: "string", description: "Observation Mission ID" } },
      required: ["missionId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => safeExecute(async () => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["missionId"]);
      const missionId = requiredString(object, "missionId");
      const cloudEnabled = state.isCloudEnabled?.() === true && state.getCloudMission !== undefined;
      const cloudRow = cloudEnabled ? await state.getCloudMission!(missionId) : null;
      const mission = cloudEnabled
        ? cloudRow?.mission ?? null
        : state.getMissions().find((item) => item.id === missionId) ?? null;
      if (mission === null) throw new ToolExecutionError("MISSION_NOT_FOUND", `mission not found: ${missionId}`);
      return missionResult(mission, cloudRow);
    }),
  };
}

export async function registerMissionTools(
  modelContext: WebMcpModelContext,
  state: MissionToolState,
  options: WebMcpRegisterOptions = {},
): Promise<void> {
  await modelContext.registerTool(getObservationMissionTool(state), options);
}
