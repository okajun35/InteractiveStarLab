import type {
  ObservationCandidate,
  ObservationMission,
  ObservationSite,
  ObservationTarget,
} from "../types/observation";

export interface CreateObservationMissionInput {
  site: ObservationSite;
  dateTime: string;
  maxMagnitude: number;
  targets: ObservationTarget[];
}

export interface MissionCreationDependencies {
  id?: () => string;
  now?: Date;
}

export function targetFromCandidate(candidate: ObservationCandidate): ObservationTarget {
  return {
    starId: candidate.starId,
    predictedVisible: candidate.predictedVisible,
    predictedAltitude: candidate.altitude,
    predictedAzimuth: candidate.azimuth,
    predictedMagnitude: candidate.magnitude,
  };
}

/** Creates an immutable-at-creation observation mission. */
export function createObservationMission(
  input: CreateObservationMissionInput,
  dependencies: MissionCreationDependencies = {},
): ObservationMission {
  if (!input.site.id || !input.site.name) {
    throw new Error("mission site must have an id and name");
  }
  if (!Number.isFinite(input.site.latitude) || input.site.latitude < -90 || input.site.latitude > 90) {
    throw new RangeError("mission site latitude is invalid");
  }
  if (!Number.isFinite(input.site.longitude) || input.site.longitude < -180 || input.site.longitude > 180) {
    throw new RangeError("mission site longitude is invalid");
  }
  if (!input.dateTime || Number.isNaN(new Date(input.dateTime).getTime())) {
    throw new RangeError("mission dateTime is invalid");
  }
  if (!Number.isFinite(input.maxMagnitude)) {
    throw new RangeError("mission maxMagnitude is invalid");
  }
  if (input.targets.length < 1 || input.targets.length > 5) {
    throw new RangeError("a mission must contain between 1 and 5 targets");
  }

  const ids = new Set<string>();
  for (const target of input.targets) {
    if (!target.starId || ids.has(target.starId)) {
      throw new Error("mission targets must have unique star ids");
    }
    ids.add(target.starId);
    if (
      !Number.isFinite(target.predictedAltitude) ||
      !Number.isFinite(target.predictedAzimuth) ||
      !Number.isFinite(target.predictedMagnitude)
    ) {
      throw new RangeError("mission target prediction is invalid");
    }
  }

  const now = dependencies.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new RangeError("mission creation time is invalid");

  return {
    id: dependencies.id?.() ?? crypto.randomUUID(),
    siteId: input.site.id,
    siteSnapshot: { ...input.site },
    dateTime: new Date(input.dateTime).toISOString(),
    maxMagnitude: input.maxMagnitude,
    targets: input.targets.map((target) => ({ ...target })),
    createdAt: now.toISOString(),
  };
}
