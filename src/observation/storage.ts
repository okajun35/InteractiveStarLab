import type {
  ObservationMission,
  ObservationRecord,
  ObservationSite,
  ObservationTarget,
  ObservationStatus,
} from "../types/observation";
import { isValidTimeZone } from "../astronomy/timezones";

export const OBSERVATION_STORAGE_KEY = "star-view.observation.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistedObservationState {
  version: 1;
  activeSite: ObservationSite;
  missions: ObservationMission[];
  records: ObservationRecord[];
}

export const DEFAULT_OBSERVATION_STATE: PersistedObservationState = {
  version: 1,
  activeSite: {
    id: "home",
    name: "Home",
    latitude: 35.6812,
    longitude: 139.7671,
  },
  missions: [],
  records: [],
};

function emptyState(): PersistedObservationState {
  return {
    version: 1,
    activeSite: { ...DEFAULT_OBSERVATION_STATE.activeSite },
    missions: [],
    records: [],
  };
}

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validSite(value: unknown): value is ObservationSite {
  if (typeof value !== "object" || value === null) return false;
  const site = value as Partial<ObservationSite>;
  return (
    typeof site.id === "string" &&
    site.id.length > 0 &&
    typeof site.name === "string" &&
    site.name.length > 0 &&
    finite(site.latitude) &&
    site.latitude >= -90 &&
    site.latitude <= 90 &&
    finite(site.longitude) &&
    site.longitude >= -180 &&
    site.longitude <= 180 &&
    (site.timeZone === undefined || isValidTimeZone(site.timeZone))
  );
}

function validStatus(value: unknown): value is ObservationStatus {
  return value === "visible" || value === "not_visible" || value === "unsure";
}

function validTarget(value: unknown): value is ObservationTarget {
  if (typeof value !== "object" || value === null) return false;
  const target = value as Partial<ObservationTarget>;
  return (
    typeof target.starId === "string" &&
    target.starId.length > 0 &&
    typeof target.predictedVisible === "boolean" &&
    finite(target.predictedAltitude) &&
    finite(target.predictedAzimuth) &&
    finite(target.predictedMagnitude)
  );
}

function validMission(value: unknown): value is ObservationMission {
  if (typeof value !== "object" || value === null) return false;
  const mission = value as Partial<ObservationMission>;
  return (
    typeof mission.id === "string" &&
    mission.id.length > 0 &&
    typeof mission.siteId === "string" &&
    validSite(mission.siteSnapshot) &&
    typeof mission.dateTime === "string" &&
    !Number.isNaN(new Date(mission.dateTime).getTime()) &&
    finite(mission.maxMagnitude) &&
    Array.isArray(mission.targets) &&
    mission.targets.length >= 1 &&
    mission.targets.length <= 5 &&
    mission.targets.every(validTarget) &&
    typeof mission.createdAt === "string" &&
    !Number.isNaN(new Date(mission.createdAt).getTime())
  );
}

function validRecord(value: unknown): value is ObservationRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<ObservationRecord>;
  return (
    typeof record.missionId === "string" &&
    record.missionId.length > 0 &&
    typeof record.siteId === "string" &&
    validSite(record.siteSnapshot) &&
    typeof record.dateTime === "string" &&
    !Number.isNaN(new Date(record.dateTime).getTime()) &&
    Array.isArray(record.targets) &&
    record.targets.length >= 1 &&
    record.targets.length <= 5 &&
    record.targets.every(validTarget) &&
    Array.isArray(record.results) &&
    record.results.length === record.targets.length &&
    record.results.every((result) => {
      if (typeof result !== "object" || result === null) return false;
      const item = result as { starId?: unknown; status?: unknown };
      return typeof item.starId === "string" && item.starId.length > 0 && validStatus(item.status);
    }) &&
    typeof record.completedAt === "string" &&
    !Number.isNaN(new Date(record.completedAt).getTime())
  );
}

function validState(value: unknown): value is PersistedObservationState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<PersistedObservationState>;
  return (
    state.version === 1 &&
    validSite(state.activeSite) &&
    Array.isArray(state.missions) &&
    state.missions.every(validMission) &&
    Array.isArray(state.records) &&
    state.records.every(validRecord)
  );
}

export function loadObservationState(storage: StorageLike | null = browserStorage()): PersistedObservationState {
  if (storage === null) return emptyState();
  try {
    const raw = storage.getItem(OBSERVATION_STORAGE_KEY);
    if (raw === null) return emptyState();
    const parsed: unknown = JSON.parse(raw);
    if (!validState(parsed)) return emptyState();
    return {
      version: 1,
      activeSite: { ...parsed.activeSite },
      missions: parsed.missions.map((mission) => ({
        ...mission,
        siteSnapshot: { ...mission.siteSnapshot },
        targets: mission.targets.map((target) => ({ ...target })),
      })),
      records: parsed.records.map((record) => ({
        ...record,
        siteSnapshot: { ...record.siteSnapshot },
        targets: record.targets.map((target) => ({ ...target })),
        results: record.results.map((result) => ({ ...result })),
      })),
    };
  } catch {
    return emptyState();
  }
}

export function saveObservationState(
  state: PersistedObservationState,
  storage: StorageLike | null = browserStorage(),
): boolean {
  if (storage === null || !validState(state)) return false;
  try {
    storage.setItem(OBSERVATION_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearObservationState(storage: StorageLike | null = browserStorage()): boolean {
  if (storage === null) return false;
  try {
    storage.removeItem(OBSERVATION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
