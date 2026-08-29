import type { DisplayOptions, SimulationSettings } from "../types/astronomy";
import type { ObservationMission, ObservationSite } from "../types/observation";
import type { StarLayerState } from "../astronomy/visibilityModel";
import type { SkySnapshotMetadata, SkySnapshotRecord, SkySnapshotView } from "../snapshots/types";

export const CLOUD_SNAPSHOT_BUCKET = "observation-assets";
export const MAX_SKY_SNAPSHOT_BYTES = 10 * 1024 * 1024;
export const SNAPSHOT_SIGNED_URL_TTL_SECONDS = 300;
const SNAPSHOT_CONTEXT_EPSILON = 1e-6;

export interface CloudMissionSnapshotReference {
  snapshotId: string;
  missionId: string;
  storagePath: string;
  fileName: string;
  mimeType: "image/png";
  width: number;
  height: number;
  createdAt: string;
  heading: string;
  site: ObservationSite;
  dateTime: string;
  view: SkySnapshotView;
  simulation: SimulationSettings;
  layers: StarLayerState;
  displayOptions: DisplayOptions;
}

/**
 * A Mission Snapshot is an archive of the Sky canvas at the time the Mission
 * was created.  Never attach a canvas captured for a different location or
 * observation time: that would make the image misleading evidence.
 */
export function missionSnapshotContextMatches(
  record: Pick<SkySnapshotRecord, "site" | "dateTime">,
  mission: Pick<ObservationMission, "siteSnapshot" | "dateTime">,
): boolean {
  const recordTime = Date.parse(record.dateTime);
  const missionTime = Date.parse(mission.dateTime);
  if (Number.isNaN(recordTime) || Number.isNaN(missionTime) || recordTime !== missionTime) return false;
  return Math.abs(record.site.latitude - mission.siteSnapshot.latitude) <= SNAPSHOT_CONTEXT_EPSILON
    && Math.abs(record.site.longitude - mission.siteSnapshot.longitude) <= SNAPSHOT_CONTEXT_EPSILON;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function validSite(value: unknown): value is ObservationSite {
  const candidate = object(value);
  return candidate !== null
    && nonEmpty(candidate.id) && nonEmpty(candidate.name)
    && finite(candidate.latitude) && candidate.latitude >= -90 && candidate.latitude <= 90
    && finite(candidate.longitude) && candidate.longitude >= -180 && candidate.longitude <= 180;
}

function validView(value: unknown): value is SkySnapshotView {
  const candidate = object(value);
  return candidate !== null && finite(candidate.azimuth) && finite(candidate.altitude) && finite(candidate.fieldOfView);
}

function validSettings(value: unknown): value is SimulationSettings {
  const candidate = object(value);
  return candidate !== null
    && (candidate.daylightMode === "real" || candidate.daylightMode === "removed")
    && (candidate.lightPollution === "dark-sky" || candidate.lightPollution === "suburban" || candidate.lightPollution === "urban" || candidate.lightPollution === "city-center" || candidate.lightPollution === "perfect")
    && finite(candidate.limitingMagnitude)
    && typeof candidate.showHiddenStars === "boolean";
}

function validLayers(value: unknown): value is StarLayerState {
  const candidate = object(value);
  return candidate !== null
    && typeof candidate.first === "boolean"
    && typeof candidate.second === "boolean"
    && typeof candidate.third === "boolean"
    && typeof candidate.fourth === "boolean"
    && typeof candidate.faint === "boolean";
}

function validDisplayOptions(value: unknown): value is DisplayOptions {
  const candidate = object(value);
  return candidate !== null
    && typeof candidate.stars === "boolean"
    && typeof candidate.starNames === "boolean"
    && typeof candidate.constellationLines === "boolean"
    && typeof candidate.constellationNames === "boolean";
}

export function isCloudMissionSnapshotReference(value: unknown): value is CloudMissionSnapshotReference {
  const candidate = object(value);
  return candidate !== null
    && nonEmpty(candidate.snapshotId)
    && nonEmpty(candidate.missionId)
    && nonEmpty(candidate.storagePath)
    && nonEmpty(candidate.fileName)
    && candidate.mimeType === "image/png"
    && Number.isInteger(candidate.width) && (candidate.width as number) > 0
    && Number.isInteger(candidate.height) && (candidate.height as number) > 0
    && nonEmpty(candidate.createdAt) && !Number.isNaN(Date.parse(candidate.createdAt))
    && nonEmpty(candidate.heading)
    && validSite(candidate.site)
    && nonEmpty(candidate.dateTime) && !Number.isNaN(Date.parse(candidate.dateTime))
    && validView(candidate.view)
    && validSettings(candidate.simulation)
    && validLayers(candidate.layers)
    && validDisplayOptions(candidate.displayOptions);
}

export function cloudSnapshotReferenceFromRecord(
  record: SkySnapshotRecord,
  missionId: string,
  userId: string,
): CloudMissionSnapshotReference {
  if (!missionId.trim()) throw new Error("missionId is required");
  if (!userId.trim()) throw new Error("userId is required");
  if (record.mimeType !== "image/png" || record.blob.type !== "image/png") {
    throw new Error("Mission Snapshot must be a PNG");
  }
  if (record.blob.size > MAX_SKY_SNAPSHOT_BYTES) throw new Error("Mission Snapshot is too large");
  return {
    snapshotId: record.snapshotId,
    missionId,
    storagePath: `${userId}/${missionId}/${record.snapshotId}.png`,
    fileName: record.fileName,
    mimeType: "image/png",
    width: record.width,
    height: record.height,
    createdAt: record.createdAt,
    heading: record.heading,
    site: { ...record.site },
    dateTime: record.dateTime,
    view: { ...record.view },
    simulation: { ...record.simulation },
    layers: { ...record.layers },
    displayOptions: { ...record.displayOptions },
  };
}

export function snapshotRecordFromReference(
  reference: CloudMissionSnapshotReference,
  blob: Blob,
): SkySnapshotRecord {
  return {
    ...reference,
    site: { ...reference.site },
    view: { ...reference.view },
    simulation: { ...reference.simulation },
    layers: { ...reference.layers },
    displayOptions: { ...reference.displayOptions },
    blob,
  };
}

export function snapshotMetadataFromReference(reference: CloudMissionSnapshotReference): SkySnapshotMetadata {
  const { storagePath: _storagePath, ...metadata } = reference;
  return {
    ...metadata,
    site: { ...metadata.site },
    view: { ...metadata.view },
    simulation: { ...metadata.simulation },
    layers: { ...metadata.layers },
    displayOptions: { ...metadata.displayOptions },
  };
}
