import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkySnapshotRecord } from "../snapshots/types";
import { CloudApplicationError, cloudError } from "./errors";
import type { CloudMissionRepository } from "./missionRepository";
import {
  CLOUD_SNAPSHOT_BUCKET,
  SNAPSHOT_SIGNED_URL_TTL_SECONDS,
  cloudSnapshotReferenceFromRecord,
  isCloudMissionSnapshotReference,
  snapshotRecordFromReference,
  type CloudMissionSnapshotReference,
} from "./snapshotReference";

export interface CloudSnapshotStorage {
  saveMissionSnapshot(input: {
    userId: string;
    missionId: string;
    record: SkySnapshotRecord;
  }): Promise<CloudMissionSnapshotReference>;
  getMissionSnapshot(reference: CloudMissionSnapshotReference): Promise<SkySnapshotRecord | null>;
  createAccessUrl(reference: CloudMissionSnapshotReference, expiresInSeconds?: number): Promise<string>;
}

function errorMessage(error: { message?: string } | null): string {
  return error?.message?.trim() || "Supabase Storage request failed";
}

export function createSupabaseSnapshotStorage(
  client: SupabaseClient,
  missionRepository: CloudMissionRepository,
): CloudSnapshotStorage {
  return {
    async saveMissionSnapshot({ userId, missionId, record }) {
      const reference = cloudSnapshotReferenceFromRecord(record, missionId, userId);
      // Check the immutable Mission slot before uploading so a repeated
      // capture does not leave an unreferenced object in private Storage.
      const mission = await missionRepository.getMission(missionId);
      if (mission === null) throw cloudError("MISSION_NOT_FOUND", `Mission not found: ${missionId}`);
      if (mission.skySnapshot !== null) throw cloudError("SNAPSHOT_ALREADY_EXISTS", `Mission already has a Snapshot: ${missionId}`);
      let uploadError: { message?: string } | null = null;
      try {
        const result = await client.storage.from(CLOUD_SNAPSHOT_BUCKET).upload(reference.storagePath, record.blob, {
          contentType: "image/png",
          upsert: false,
        });
        uploadError = result.error;
      } catch (error) {
        throw cloudError("SNAPSHOT_UPLOAD_FAILED", "Mission Snapshot could not be uploaded", error);
      }
      if (uploadError) throw cloudError("SNAPSHOT_UPLOAD_FAILED", errorMessage(uploadError), uploadError);
      try {
        await missionRepository.attachSnapshot(missionId, reference);
      } catch (error) {
        if (error instanceof CloudApplicationError && error.code === "SNAPSHOT_ALREADY_EXISTS") throw error;
        throw cloudError("SNAPSHOT_LINK_FAILED", "Mission Snapshot was uploaded but could not be linked", error);
      }
      return reference;
    },
    async getMissionSnapshot(reference) {
      if (!isCloudMissionSnapshotReference(reference)) return null;
      let result: { data: Blob | null; error: { message?: string } | null };
      try {
        result = await client.storage.from(CLOUD_SNAPSHOT_BUCKET).download(reference.storagePath);
      } catch (error) {
        throw cloudError("SNAPSHOT_ACCESS_FAILED", "Mission Snapshot could not be downloaded", error);
      }
      if (result.error) throw cloudError("SNAPSHOT_ACCESS_FAILED", errorMessage(result.error), result.error);
      return result.data === null ? null : snapshotRecordFromReference(reference, result.data);
    },
    async createAccessUrl(reference, expiresInSeconds = SNAPSHOT_SIGNED_URL_TTL_SECONDS) {
      if (!isCloudMissionSnapshotReference(reference)) throw cloudError("SNAPSHOT_ACCESS_FAILED", "Snapshot reference is invalid");
      const result = await client.storage.from(CLOUD_SNAPSHOT_BUCKET).createSignedUrl(reference.storagePath, expiresInSeconds);
      if (result.error || !result.data?.signedUrl) throw cloudError("SNAPSHOT_ACCESS_FAILED", errorMessage(result.error), result.error);
      return result.data.signedUrl;
    },
  };
}
