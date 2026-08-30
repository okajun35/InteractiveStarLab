import { STAR_BY_ID } from "../astronomy/stars";
import type { ObservationMission } from "../types/observation";
import type { ObservationGuideDescriptor, ObservationGuideTarget } from "./types";
import { guideDifficulty } from "./difficulty";
import { directionFromAzimuth, primaryDirection } from "./direction";
import { guideEndDateTime, validateGuideTimeZone } from "./time";
import { buildMissionSkySnapshot } from "./missionSkySnapshot";
import type { ObservationGuideModel } from "./types";

export const DEFAULT_GUIDE_TITLE = "Star Observation Guide";
export const DEFAULT_GUIDE_DURATION_MINUTES = 30;

export function validateGuideTitle(title: string): string {
  if (typeof title !== "string" || title.trim().length < 1 || title.length > 80) {
    throw new RangeError("title must contain 1 to 80 characters");
  }
  return title.trim();
}

export function validateGuideDuration(durationMinutes: number): number {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 180) {
    throw new RangeError("durationMinutes must be an integer from 5 to 180");
  }
  return durationMinutes;
}

export interface CreateGuideDescriptorInput {
  mission: ObservationMission;
  title?: string;
  durationMinutes?: number;
  timeZone?: string;
  now?: Date;
}

export function createGuideDescriptor(input: CreateGuideDescriptorInput): ObservationGuideDescriptor {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new RangeError("createdAt is invalid");
  const title = validateGuideTitle(input.title ?? DEFAULT_GUIDE_TITLE);
  const durationMinutes = validateGuideDuration(input.durationMinutes ?? DEFAULT_GUIDE_DURATION_MINUTES);
  const timeZone = validateGuideTimeZone(input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  return {
    guideId: `guide-${input.mission.id}`,
    missionId: input.mission.id,
    title,
    durationMinutes,
    timeZone,
    createdAt: now.toISOString(),
  };
}

export function buildGuideTargets(mission: ObservationMission): ObservationGuideTarget[] {
  if (mission.targets.length < 1 || mission.targets.length > 5) throw new RangeError("mission target count is invalid");
  return mission.targets.map((target, index) => {
    const star = STAR_BY_ID.get(target.starId);
    return {
      index: index + 1,
      starId: target.starId,
      name: star?.name ?? target.starId,
      magnitude: target.predictedMagnitude,
      altitude: target.predictedAltitude,
      azimuth: target.predictedAzimuth,
      direction: directionFromAzimuth(target.predictedAzimuth),
      difficulty: guideDifficulty(target.predictedMagnitude, target.predictedAltitude),
      predictedVisible: target.predictedVisible,
    };
  });
}

export function buildGuideLocationText(mission: ObservationMission): string {
  return `${mission.siteSnapshot.name} (${mission.siteSnapshot.latitude.toFixed(2)}, ${mission.siteSnapshot.longitude.toFixed(2)})`;
}

export function buildGuidePrimaryDirection(targets: readonly ObservationGuideTarget[]): string {
  return primaryDirection(targets.map((target) => target.azimuth));
}

export function buildGuideEndDateTime(mission: ObservationMission, descriptor: ObservationGuideDescriptor): string {
  return guideEndDateTime(mission.dateTime, descriptor.durationMinutes);
}

export function buildObservationGuideModel(
  mission: ObservationMission,
  descriptor: ObservationGuideDescriptor,
): ObservationGuideModel {
  if (descriptor.missionId !== mission.id) throw new Error("guide descriptor does not match mission");
  const targets = buildGuideTargets(mission);
  return {
    descriptor: { ...descriptor },
    site: { ...mission.siteSnapshot },
    dateTime: mission.dateTime,
    endDateTime: buildGuideEndDateTime(mission, descriptor),
    locationText: buildGuideLocationText(mission),
    timeZoneLabel: descriptor.timeZone,
    primaryDirection: buildGuidePrimaryDirection(targets),
    targets,
    skySnapshot: buildMissionSkySnapshot(mission),
  };
}
