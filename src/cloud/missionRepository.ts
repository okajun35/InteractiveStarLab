import type { SupabaseClient } from "@supabase/supabase-js";
import type { ObservationMission, ObservationRecord } from "../types/observation";
import { cloudError, CloudApplicationError } from "./errors";
import {
  cloudMissionFromRow,
  isCloudMissionRowData,
  missionInsertPayload,
} from "./missionValidation";
import { normalizeRecoveryCode } from "./recoveryCode";

export interface CloudMissionRow {
  mission: ObservationMission;
  record: ObservationRecord | null;
  skySnapshot: unknown | null;
  guide: unknown | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CloudMissionRepository {
  createMission(mission: ObservationMission): Promise<CreatedCloudMission>;
  restoreMission(recoveryCode: string): Promise<CloudMissionRow>;
  listMissions(): Promise<CloudMissionRow[]>;
  getMission(missionId: string): Promise<CloudMissionRow | null>;
  saveRecord(missionId: string, record: ObservationRecord): Promise<CloudMissionRow>;
  attachSnapshot(missionId: string, snapshot: unknown): Promise<CloudMissionRow>;
}

export interface CreatedCloudMission extends CloudMissionRow {
  recoveryCode: string;
}

type QueryResult = { data: unknown; error: { message?: string; code?: string } | null };

function rowOrThrow(data: unknown, code: "CLOUD_MISSION_SAVE_FAILED" | "CLOUD_MISSION_LOAD_FAILED" | "CLOUD_RESULT_SAVE_FAILED" | "SNAPSHOT_LINK_FAILED"): CloudMissionRow {
  if (!isCloudMissionRowData(data)) throw cloudError(code, "Supabase returned an invalid Mission row");
  const parsed = cloudMissionFromRow(data);
  if (parsed === null) throw cloudError(code, "Supabase returned invalid Mission JSON");
  return parsed;
}

function message(error: { message?: string } | null): string {
  return error?.message?.trim() || "Supabase request failed";
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function createdMissionOrThrow(data: unknown): CreatedCloudMission {
  const candidate = object(data);
  const recoveryCode = candidate?.recovery_code;
  if (typeof recoveryCode !== "string" || normalizeRecoveryCode(recoveryCode) === null) {
    throw cloudError("CLOUD_MISSION_SAVE_FAILED", "Supabase did not return a valid Mission recovery code");
  }
  const row = rowOrThrow(data, "CLOUD_MISSION_SAVE_FAILED");
  return { ...row, recoveryCode };
}

function requiredUserId(getUserId: () => string | null): string {
  const userId = getUserId();
  if (!userId) throw cloudError("AUTH_REQUIRED", "Cloud identity is unavailable for cloud observation storage");
  return userId;
}

export function createSupabaseMissionRepository(
  client: SupabaseClient,
  getUserId: () => string | null,
): CloudMissionRepository {
  const columns = "id,user_id,planned_at,mission,record,sky_snapshot,guide,created_at,updated_at";
  return {
    async createMission(mission) {
      const userId = requiredUserId(getUserId);
      const payload = missionInsertPayload(mission, userId);
      let result: QueryResult;
      try {
        result = await client.rpc("create_observation_mission_with_recovery", {
          p_id: payload.id,
          p_planned_at: payload.planned_at,
          p_mission: payload.mission,
        });
      } catch (error) {
        throw cloudError("CLOUD_MISSION_SAVE_FAILED", "Mission could not be saved to Supabase", error);
      }
      if (result.error) throw cloudError("CLOUD_MISSION_SAVE_FAILED", message(result.error), result.error);
      return createdMissionOrThrow(result.data);
    },
    async restoreMission(recoveryCode) {
      requiredUserId(getUserId);
      if (normalizeRecoveryCode(recoveryCode) === null) {
        throw cloudError("RESTORE_CODE_INVALID", "Recovery code is invalid");
      }
      let result: QueryResult;
      try {
        result = await client.rpc("restore_observation_mission", { p_recovery_code: recoveryCode });
      } catch (error) {
        throw cloudError("RESTORE_CODE_INVALID", "Recovery code is invalid", error);
      }
      if (result.error || typeof result.data !== "string" || result.data.trim() === "") {
        throw cloudError("RESTORE_CODE_INVALID", "Recovery code is invalid", result.error);
      }
      const restored = await this.getMission(result.data);
      if (restored === null) throw cloudError("RESTORE_CODE_INVALID", "Recovery code is invalid");
      return restored;
    },
    async listMissions() {
      requiredUserId(getUserId);
      let result: QueryResult;
      try {
        result = await client.from("observation_missions").select(columns).order("planned_at", { ascending: false });
      } catch (error) {
        throw cloudError("CLOUD_MISSION_LOAD_FAILED", "Missions could not be loaded from Supabase", error);
      }
      if (result.error) throw cloudError("CLOUD_MISSION_LOAD_FAILED", message(result.error), result.error);
      if (!Array.isArray(result.data)) throw cloudError("CLOUD_MISSION_LOAD_FAILED", "Supabase returned an invalid Mission list");
      return result.data.flatMap((row) => {
        try {
          return [rowOrThrow(row, "CLOUD_MISSION_LOAD_FAILED")];
        } catch {
          return [];
        }
      });
    },
    async getMission(missionId) {
      requiredUserId(getUserId);
      if (!missionId.trim()) return null;
      let result: QueryResult;
      try {
        result = await client.from("observation_missions").select(columns).eq("id", missionId).maybeSingle();
      } catch (error) {
        throw cloudError("CLOUD_MISSION_LOAD_FAILED", "Mission could not be loaded from Supabase", error);
      }
      if (result.error) throw cloudError("CLOUD_MISSION_LOAD_FAILED", message(result.error), result.error);
      if (result.data === null) return null;
      return rowOrThrow(result.data, "CLOUD_MISSION_LOAD_FAILED");
    },
    async saveRecord(missionId, record) {
      requiredUserId(getUserId);
      if (!missionId.trim()) throw cloudError("MISSION_NOT_FOUND", "Mission ID is required");
      const mission = await this.getMission(missionId);
      if (mission === null) throw cloudError("MISSION_NOT_FOUND", `Mission not found: ${missionId}`);
      let result: QueryResult;
      try {
        result = await client.from("observation_missions")
          .update({ record, updated_at: new Date().toISOString() })
          .eq("id", missionId)
          .select(columns)
          .single();
      } catch (error) {
        throw cloudError("CLOUD_RESULT_SAVE_FAILED", "Observation result could not be saved to Supabase", error);
      }
      if (result.error) throw cloudError("CLOUD_RESULT_SAVE_FAILED", message(result.error), result.error);
      return rowOrThrow(result.data, "CLOUD_RESULT_SAVE_FAILED");
    },
    async attachSnapshot(missionId, snapshot) {
      requiredUserId(getUserId);
      if (!missionId.trim()) throw cloudError("MISSION_NOT_FOUND", "Mission ID is required");
      const mission = await this.getMission(missionId);
      if (mission === null) throw cloudError("MISSION_NOT_FOUND", `Mission not found: ${missionId}`);
      if (mission.skySnapshot !== null) throw cloudError("SNAPSHOT_ALREADY_EXISTS", `Mission already has a Snapshot: ${missionId}`);
      let result: QueryResult;
      try {
        result = await client.from("observation_missions")
          .update({ sky_snapshot: snapshot, updated_at: new Date().toISOString() })
          .eq("id", missionId)
          .is("sky_snapshot", null)
          .select(columns)
          .single();
      } catch (error) {
        throw cloudError("SNAPSHOT_LINK_FAILED", "Snapshot reference could not be linked to Mission", error);
      }
      if (result.error) throw cloudError("SNAPSHOT_LINK_FAILED", message(result.error), result.error);
      return rowOrThrow(result.data, "SNAPSHOT_LINK_FAILED");
    },
  };
}

export function isCloudApplicationError(error: unknown): error is CloudApplicationError {
  return error instanceof CloudApplicationError;
}
