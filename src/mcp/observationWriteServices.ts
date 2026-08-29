import type { ObservationMission, ObservationRecord, ObservationResult, ObservationStatus } from "../types/observation";

export interface ObservationResultInput {
  starId: string;
  status: ObservationStatus;
}

function isStatus(value: unknown): value is ObservationStatus {
  return value === "visible" || value === "not_visible" || value === "unsure";
}

export function normalizeObservationResults(
  mission: ObservationMission,
  value: unknown,
): ObservationResult[] {
  if (!Array.isArray(value) || value.length !== mission.targets.length) {
    throw new RangeError("results must contain exactly one item per mission target");
  }
  const targetIds = new Set(mission.targets.map((target) => target.starId));
  const received = new Map<string, ObservationResult>();
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new RangeError("each result must be an object");
    }
    const candidate = item as Record<string, unknown>;
    if (Object.keys(candidate).some((key) => key !== "starId" && key !== "status")) {
      throw new RangeError("result contains an unknown property");
    }
    if (typeof candidate.starId !== "string" || candidate.starId.trim() === "") {
      throw new RangeError("result starId must be a non-empty string");
    }
    if (!targetIds.has(candidate.starId)) throw new RangeError(`star is not in mission: ${candidate.starId}`);
    if (!isStatus(candidate.status)) throw new RangeError(`invalid observation status for ${candidate.starId}`);
    if (received.has(candidate.starId)) throw new RangeError(`duplicate result: ${candidate.starId}`);
    received.set(candidate.starId, { starId: candidate.starId, status: candidate.status });
  }
  return mission.targets.map((target) => {
    const result = received.get(target.starId);
    if (!result) throw new RangeError(`missing result: ${target.starId}`);
    return { ...result };
  });
}

export function buildObservationRecord(
  mission: ObservationMission,
  results: ObservationResult[],
  completedAt = new Date().toISOString(),
): ObservationRecord {
  return {
    missionId: mission.id,
    siteId: mission.siteId,
    siteSnapshot: { ...mission.siteSnapshot },
    dateTime: mission.dateTime,
    targets: mission.targets.map((target) => ({ ...target })),
    results: results.map((result) => ({ ...result })),
    completedAt,
  };
}
