import type { ObservationMission } from "../types/observation";
import { CloudApplicationError } from "../cloud/errors";
import { assertObject, assertOnlyKeys, optionalInteger, requiredString, safeExecute, ToolExecutionError } from "./input";
import type { SkySnapshotMetadata, SkySnapshotMetadataInput, SkySnapshotRecord } from "../snapshots/types";
import type { WebMcpModelContext, WebMcpRegisterOptions, WebMcpTool } from "./webmcp";

export interface SnapshotToolState {
  getMissions: () => readonly ObservationMission[];
  getCurrentMetadata: () => SkySnapshotMetadataInput;
  captureSnapshot: (input: SkySnapshotMetadataInput) => Promise<SkySnapshotRecord>;
  downloadRecord: (record: SkySnapshotRecord) => string | null;
  getSnapshots: () => readonly SkySnapshotMetadata[];
  getSnapshot: (snapshotId: string) => Promise<SkySnapshotRecord | null>;
  isCloudSnapshot?: (snapshotId: string) => boolean;
  getSnapshotStoragePath?: (snapshotId: string) => string | null;
  getSnapshotAccessUrl?: (snapshotId: string) => Promise<string | null>;
}

function metadataResult(metadata: SkySnapshotMetadata | SkySnapshotRecord) {
  const { blob: _blob, ...withoutBlob } = metadata as SkySnapshotRecord;
  return { ...withoutBlob, site: { ...metadata.site }, view: { ...metadata.view }, simulation: { ...metadata.simulation }, layers: { ...metadata.layers }, displayOptions: { ...metadata.displayOptions } };
}

function captureSkySnapshotTool(state: SnapshotToolState): WebMcpTool {
  return {
    name: "capture_sky_snapshot",
    title: "Capture sky snapshot",
    description: "Captures the currently rendered Sky canvas as a PNG, stores it in the app's snapshot storage, and returns its metadata. An optional missionId links the image to an existing Mission. The tool does not return a large base64 image; use the returned browser download URL or the Snapshots screen.",
    inputSchema: {
      type: "object",
      properties: {
        missionId: { type: "string", description: "Optional existing Mission ID to associate" },
        download: { type: "boolean", description: "Trigger a browser download in addition to saving; defaults to true" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async (input) => safeExecuteAsync(async () => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["missionId", "download"]);
      const missionId = object.missionId === undefined ? undefined : requiredString(object, "missionId");
      if (missionId !== undefined && !state.getMissions().some((mission) => mission.id === missionId)) {
        throw new ToolExecutionError("MISSION_NOT_FOUND", `mission not found: ${missionId}`);
      }
      if (object.download !== undefined && typeof object.download !== "boolean") {
        throw new Error("download must be a boolean");
      }
      const record = await state.captureSnapshot({
        ...state.getCurrentMetadata(),
        ...(missionId === undefined ? {} : { missionId }),
      });
      const shouldDownload = object.download === undefined ? true : object.download;
      const downloadUrl = shouldDownload ? state.downloadRecord(record) : null;
      const cloud = state.isCloudSnapshot?.(record.snapshotId) ?? false;
      const storagePath = cloud ? state.getSnapshotStoragePath?.(record.snapshotId) ?? null : null;
      return {
        snapshotId: record.snapshotId,
        missionId: record.missionId,
        persistence: cloud ? "supabase" as const : "indexeddb" as const,
        metadata: metadataResult(record),
        downloadUrl,
        downloaded: shouldDownload && downloadUrl !== null,
        ...(storagePath === null ? {} : { storagePath }),
      };
    }),
  };
}

function listSkySnapshotsTool(state: SnapshotToolState): WebMcpTool {
  return {
    name: "list_sky_snapshots",
    title: "List sky snapshots",
    description: "Lists saved Sky snapshot metadata in newest-first order. PNG blobs are not included.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 50, description: "Maximum metadata records to return" } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => safeExecute(() => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["limit"]);
      const limit = optionalInteger(object, "limit") ?? 50;
      if (limit < 1 || limit > 50) throw new RangeError("limit must be an integer from 1 to 50");
      return { snapshots: state.getSnapshots().slice(0, limit).map(metadataResult) };
    }),
  };
}

function getSkySnapshotMetadataTool(state: SnapshotToolState): WebMcpTool {
  return {
    name: "get_sky_snapshot_metadata",
    title: "Get sky snapshot metadata",
    description: "Returns one saved Sky snapshot's observation conditions and storage metadata without returning the PNG blob.",
    inputSchema: {
      type: "object",
      properties: { snapshotId: { type: "string", description: "Saved snapshot ID" } },
      required: ["snapshotId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input) => safeExecuteAsync(async () => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["snapshotId"]);
      const snapshotId = requiredString(object, "snapshotId");
      const record = await state.getSnapshot(snapshotId);
      if (record === null) throw new ToolExecutionError("SNAPSHOT_NOT_FOUND", `snapshot not found: ${snapshotId}`);
      const cloud = state.isCloudSnapshot?.(snapshotId) ?? false;
      const accessUrl = cloud && state.getSnapshotAccessUrl !== undefined
        ? await state.getSnapshotAccessUrl(snapshotId)
        : null;
      return {
        ...metadataResult(record),
        missionId: record.missionId,
        persistence: cloud ? "supabase" as const : "indexeddb" as const,
        ...(accessUrl === null ? {} : { access: { url: accessUrl, expiresInSeconds: 300 } }),
      };
    }),
  };
}

function safeExecuteAsync<T>(operation: () => Promise<T>): Promise<string> {
  return operation()
    .then((value) => JSON.stringify({ ok: true, data: value }))
    .catch((error) => {
      const message = error instanceof Error ? error.message : "Tool input is invalid";
      const code = error instanceof ToolExecutionError
        ? error.code
        : error instanceof CloudApplicationError
          ? error.code
        : message.includes("Sky canvas is not available")
          ? "SNAPSHOT_UNAVAILABLE"
          : message.includes("canvas PNG conversion")
            ? "SNAPSHOT_RENDER_FAILED"
            : message.includes("Mission Snapshot context")
              ? "SNAPSHOT_CONTEXT_MISMATCH"
              : message.includes("Mission Snapshot must be a PNG")
                ? "SNAPSHOT_INVALID_TYPE"
                : message.includes("Mission Snapshot is too large")
                  ? "SNAPSHOT_TOO_LARGE"
                  : message.includes("IndexedDB") || message.includes("snapshot storage")
                    ? "SNAPSHOT_STORAGE_UNAVAILABLE"
                    : "INVALID_ARGUMENT";
      return JSON.stringify({ ok: false, error: { code, message } });
    });
}

export async function registerSnapshotTools(
  modelContext: WebMcpModelContext,
  state: SnapshotToolState,
  options: WebMcpRegisterOptions = {},
): Promise<void> {
  await modelContext.registerTool(captureSkySnapshotTool(state), options);
  await modelContext.registerTool(listSkySnapshotsTool(state), options);
  await modelContext.registerTool(getSkySnapshotMetadataTool(state), options);
}
