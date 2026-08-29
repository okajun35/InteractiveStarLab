import type {
  ObservationMission,
  ObservationRecord,
  ObservationResult,
  ObservationSite,
  ObservationTarget,
} from "../types/observation";

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function string(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function site(value: unknown): value is ObservationSite {
  const candidate = object(value);
  return candidate !== null
    && string(candidate.id)
    && string(candidate.name)
    && finite(candidate.latitude) && candidate.latitude >= -90 && candidate.latitude <= 90
    && finite(candidate.longitude) && candidate.longitude >= -180 && candidate.longitude <= 180;
}

function target(value: unknown): value is ObservationTarget {
  const candidate = object(value);
  return candidate !== null
    && string(candidate.starId)
    && typeof candidate.predictedVisible === "boolean"
    && finite(candidate.predictedAltitude)
    && finite(candidate.predictedAzimuth)
    && finite(candidate.predictedMagnitude);
}

function result(value: unknown): value is ObservationResult {
  const candidate = object(value);
  return candidate !== null
    && string(candidate.starId)
    && (candidate.status === "visible" || candidate.status === "not_visible" || candidate.status === "unsure");
}

export function isObservationMission(value: unknown): value is ObservationMission {
  const candidate = object(value);
  if (candidate === null) return false;
  if (!string(candidate.id) || !string(candidate.siteId) || !site(candidate.siteSnapshot)) return false;
  if (!string(candidate.dateTime) || Number.isNaN(Date.parse(candidate.dateTime))) return false;
  if (!finite(candidate.maxMagnitude) || !Array.isArray(candidate.targets) || candidate.targets.length < 1 || candidate.targets.length > 5) return false;
  const targets = candidate.targets as unknown[];
  const ids = targets.map((item) => object(item)?.starId);
  return ids.every(string)
    && new Set(ids).size === ids.length
    && targets.every(target)
    && string(candidate.createdAt)
    && !Number.isNaN(Date.parse(candidate.createdAt));
}

export function isObservationRecordForMission(
  value: unknown,
  mission: ObservationMission,
): value is ObservationRecord {
  const candidate = object(value);
  if (candidate === null || !string(candidate.missionId) || candidate.missionId !== mission.id) return false;
  if (!string(candidate.siteId) || !site(candidate.siteSnapshot)) return false;
  if (!string(candidate.dateTime) || Number.isNaN(Date.parse(candidate.dateTime))) return false;
  if (!string(candidate.completedAt) || Number.isNaN(Date.parse(candidate.completedAt))) return false;
  if (!Array.isArray(candidate.targets) || !Array.isArray(candidate.results)) return false;
  const targets = candidate.targets as unknown[];
  const results = candidate.results as unknown[];
  const missionIds = mission.targets.map((item) => item.starId);
  return targets.length === mission.targets.length
    && results.length === mission.targets.length
    && targets.every(target)
    && results.every(result)
    && targets.every((item, index) => (item as ObservationTarget).starId === missionIds[index])
    && results.every((item, index) => (item as ObservationResult).starId === missionIds[index]);
}

export interface CloudMissionRowData {
  id: string;
  user_id: string;
  planned_at: string;
  mission: unknown;
  record: unknown;
  sky_snapshot: unknown;
  guide: unknown;
  created_at: string;
  updated_at: string;
}

export function isCloudMissionRowData(value: unknown): value is CloudMissionRowData {
  const candidate = object(value);
  return candidate !== null
    && string(candidate.id)
    && string(candidate.user_id)
    && string(candidate.planned_at)
    && string(candidate.created_at)
    && string(candidate.updated_at)
    && "mission" in candidate;
}

export function missionInsertPayload(mission: ObservationMission, userId: string): Record<string, unknown> {
  if (!string(userId)) throw new Error("userId is required");
  if (!isObservationMission(mission)) throw new Error("mission is invalid");
  return {
    id: mission.id,
    user_id: userId,
    planned_at: mission.dateTime,
    mission: structuredClone(mission),
    record: null,
    sky_snapshot: null,
    guide: null,
  };
}

export function cloudMissionFromRow(row: unknown): {
  mission: ObservationMission;
  record: ObservationRecord | null;
  skySnapshot: unknown | null;
  guide: unknown | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
} | null {
  if (!isCloudMissionRowData(row) || !isObservationMission(row.mission)) return null;
  const record = row.record === null || row.record === undefined
    ? null
    : isObservationRecordForMission(row.record, row.mission) ? row.record : null;
  return {
    mission: row.mission,
    record,
    skySnapshot: row.sky_snapshot ?? null,
    guide: row.guide ?? null,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
