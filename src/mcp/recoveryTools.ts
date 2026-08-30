import type { ObservationMission } from "../types/observation";
import { CloudApplicationError } from "../cloud/errors";
import { assertObject, assertOnlyKeys, requiredString } from "./input";
import type { WebMcpModelContext, WebMcpRegisterOptions, WebMcpTool } from "./webmcp";

export interface RecoveryToolState {
  restoreMission: (recoveryCode: string) => Promise<ObservationMission>;
  openObserve: () => void;
  isCloudEnabled?: () => boolean;
}

function safeExecute<T>(operation: () => Promise<T>): Promise<string> {
  return operation()
    .then((value) => JSON.stringify({ ok: true, data: value }))
    .catch((error: unknown) => {
      const code = error instanceof CloudApplicationError && error.code !== "RESTORE_CODE_INVALID"
        ? error.code
        : "RESTORE_CODE_INVALID";
      const message = code === "RESTORE_CODE_INVALID"
        ? "Recovery code is invalid"
        : error instanceof Error ? error.message : "Mission recovery failed";
      return JSON.stringify({ ok: false, error: { code, message } });
    });
}

function createRecoveryTool(state: RecoveryToolState): WebMcpTool {
  return {
    name: "restore_observation_mission",
    title: "Restore observation Mission",
    description: "Restores one observation Mission using its mission-specific recovery code. The code is a capability for that Mission, is never returned by this tool, and must not be exposed in conversation or logs. Opens the Observe screen after a successful restore.",
    inputSchema: {
      type: "object",
      properties: {
        recoveryCode: { type: "string", minLength: 1, description: "Mission-specific recovery code copied from the Mission creation screen" },
      },
      required: ["recoveryCode"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => safeExecute(async () => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["recoveryCode"]);
      const recoveryCode = requiredString(object, "recoveryCode");
      const mission = await state.restoreMission(recoveryCode);
      state.openObserve();
      return {
        missionId: mission.id,
        persistence: state.isCloudEnabled?.() === true ? "supabase" as const : "local" as const,
        view: "observe" as const,
        targetCount: mission.targets.length,
      };
    }),
  };
}

export async function registerRecoveryTools(
  modelContext: WebMcpModelContext,
  state: RecoveryToolState,
  options: WebMcpRegisterOptions = {},
): Promise<void> {
  await modelContext.registerTool(createRecoveryTool(state), options);
}
