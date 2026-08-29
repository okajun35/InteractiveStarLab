import type { ObservationRecord } from "../types/observation";

/** Returns a new array ordered by completion time, newest first. */
export function sortObservationRecords(
  records: readonly ObservationRecord[],
): ObservationRecord[] {
  return [...records].sort((a, b) => {
    const aTime = Date.parse(a.completedAt);
    const bTime = Date.parse(b.completedAt);
    return bTime - aTime;
  });
}

export function findObservationRecord(
  records: readonly ObservationRecord[],
  missionId: string,
): ObservationRecord | null {
  return records.find((record) => record.missionId === missionId) ?? null;
}
