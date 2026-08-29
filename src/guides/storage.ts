import type { ObservationGuideDescriptor } from "./types";
import { validateGuideTimeZone } from "./time";

export const GUIDE_STORAGE_KEY = "star-view.observation-guides.v1";

export interface GuideStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistedGuideState {
  version: 1;
  descriptors: ObservationGuideDescriptor[];
  selectedGuideId: string | null;
}

const EMPTY_STATE: PersistedGuideState = { version: 1, descriptors: [], selectedGuideId: null };

function emptyState(): PersistedGuideState {
  return { version: 1, descriptors: [], selectedGuideId: null };
}

function browserStorage(): GuideStorageLike | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

function validDescriptor(value: unknown): value is ObservationGuideDescriptor {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<ObservationGuideDescriptor>;
  const durationMinutes = item.durationMinutes;
  let validTimeZone = false;
  if (typeof item.timeZone === "string") {
    try { validateGuideTimeZone(item.timeZone); validTimeZone = true; } catch { validTimeZone = false; }
  }
  return (
    typeof item.guideId === "string" && item.guideId.length > 0 &&
    typeof item.missionId === "string" && item.missionId.length > 0 &&
    item.guideId === `guide-${item.missionId}` &&
    typeof item.title === "string" && item.title.trim().length >= 1 && item.title.length <= 80 &&
    typeof durationMinutes === "number" && Number.isInteger(durationMinutes) && durationMinutes >= 5 && durationMinutes <= 180 &&
    validTimeZone &&
    typeof item.createdAt === "string" &&
    !Number.isNaN(new Date(item.createdAt).getTime())
  );
}

function validState(value: unknown): value is PersistedGuideState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<PersistedGuideState>;
  return state.version === 1 && Array.isArray(state.descriptors) &&
    state.descriptors.every(validDescriptor) &&
    (state.selectedGuideId === null || typeof state.selectedGuideId === "string");
}

export function loadGuideState(storage: GuideStorageLike | null = browserStorage()): PersistedGuideState {
  if (storage === null) return emptyState();
  try {
    const raw = storage.getItem(GUIDE_STORAGE_KEY);
    if (raw === null) return emptyState();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return emptyState();
    const candidate = parsed as Partial<PersistedGuideState>;
    if (candidate.version !== 1 || !Array.isArray(candidate.descriptors)) return emptyState();
    const descriptors = candidate.descriptors
      .filter(validDescriptor)
      .map((descriptor) => ({ ...descriptor }));
    const selectedGuideId = descriptors.some((item) => item.guideId === candidate.selectedGuideId)
      ? candidate.selectedGuideId ?? null
      : descriptors[0]?.guideId ?? null;
    return { version: 1, descriptors, selectedGuideId };
  } catch { return emptyState(); }
}

export function saveGuideState(
  state: PersistedGuideState,
  storage: GuideStorageLike | null = browserStorage(),
): boolean {
  if (storage === null || !validState(state)) return false;
  try { storage.setItem(GUIDE_STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export function upsertGuideDescriptor(
  state: PersistedGuideState,
  descriptor: ObservationGuideDescriptor,
): PersistedGuideState {
  const descriptors = [descriptor, ...state.descriptors.filter((item) => item.guideId !== descriptor.guideId)];
  return { version: 1, descriptors: descriptors.map((item) => ({ ...item })), selectedGuideId: descriptor.guideId };
}

export { EMPTY_STATE };
