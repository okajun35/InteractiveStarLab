import { CONSTELLATIONS, STARS, STAR_BY_ID } from "../astronomy/stars";
import { buildSkyScene, type SkyScene } from "../astronomy/visibility";
import { horizontalStars } from "../astronomy/coordinates";
import { buildObservationCandidates } from "../observation/candidates";
import { compareObservationRecord } from "../observation/comparison";
import {
  createObservationMission,
  targetFromCandidate,
  type MissionCreationDependencies,
} from "../observation/mission";
import type { ObservationSettings } from "../types/astronomy";
import type {
  ObservationMission,
  ObservationRecord,
  ObservationSite,
} from "../types/observation";
import type {
  ComparisonStarToolResult,
  CreateObservationPlanInput,
  CurrentSkyStateInput,
  CurrentSkyStateResult,
  CurrentSkyStarToolResult,
  DetailedObservationComparison,
  ObservationRecordToolResult,
  PredictVisibleStarsInput,
  PredictVisibleStarsResult,
  PredictedStarToolResult,
} from "./contracts";
import { isValidTimeZone } from "../astronomy/timezones";

const DEFAULT_VIEW = {
  azimuth: 180,
  altitude: 30,
  fieldOfView: 80,
} as const;

function assertSite(site: ObservationSite): void {
  if (
    !site.id ||
    !site.name ||
    !Number.isFinite(site.latitude) ||
    site.latitude < -90 ||
    site.latitude > 90 ||
    !Number.isFinite(site.longitude) ||
    site.longitude < -180 ||
    site.longitude > 180 ||
    (site.timeZone !== undefined && !isValidTimeZone(site.timeZone))
  ) {
    throw new RangeError("site is invalid");
  }
}

function parseDateTime(value: string): Date {
  if (typeof value !== "string" || value.trim() === "") {
    throw new RangeError("dateTime must be an ISO string");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("dateTime is invalid");
  }
  return date;
}

function assertMaxMagnitude(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 4) {
    throw new RangeError("maxMagnitude must be an integer from 1 to 4");
  }
}

function calculateCandidates(input: PredictVisibleStarsInput) {
  assertSite(input.site);
  const date = parseDateTime(input.dateTime);
  assertMaxMagnitude(input.maxMagnitude);
  const observation: ObservationSettings = {
    latitude: input.site.latitude,
    longitude: input.site.longitude,
    datetime: date,
    ...DEFAULT_VIEW,
  };
  return {
    date,
    candidates: buildObservationCandidates({
      horizontalStars: horizontalStars(observation, STARS),
      maxMagnitude: input.maxMagnitude,
    }),
  };
}

export function predictVisibleStars(
  input: PredictVisibleStarsInput,
): PredictVisibleStarsResult {
  const { date, candidates } = calculateCandidates(input);
  const limit = input.limit ?? 5;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new RangeError("limit must be an integer from 1 to 20");
  }
  const stars: PredictedStarToolResult[] = candidates.slice(0, limit).map((star) => ({
    starId: star.starId,
    name: star.name,
    magnitude: star.magnitude,
    altitude: star.altitude,
    azimuth: star.azimuth,
    predictedVisible: star.predictedVisible,
  }));
  return {
    site: { ...input.site },
    dateTime: date.toISOString(),
    maxMagnitude: input.maxMagnitude,
    stars,
  };
}

export function createObservationPlanFromStarIds(
  input: CreateObservationPlanInput,
  dependencies: MissionCreationDependencies = {},
): ObservationMission {
  if (!Array.isArray(input.starIds) || input.starIds.length < 1 || input.starIds.length > 5) {
    throw new RangeError("starIds must contain between 1 and 5 stars");
  }
  const ids = new Set(input.starIds);
  if (ids.size !== input.starIds.length) {
    throw new Error("starIds must be unique");
  }
  const { date, candidates } = calculateCandidates(input);
  const candidatesById = new Map(candidates.map((candidate) => [candidate.starId, candidate]));
  const targets = input.starIds.map((starId) => {
    const candidate = candidatesById.get(starId);
    if (!candidate) {
      if (!STAR_BY_ID.has(starId)) throw new Error(`star not found: ${starId}`);
      throw new Error(`star is not a visible candidate: ${starId}`);
    }
    return targetFromCandidate(candidate);
  });
  return createObservationMission(
    {
      site: { ...input.site },
      dateTime: date.toISOString(),
      maxMagnitude: input.maxMagnitude,
      targets,
    },
    dependencies,
  );
}

export function observationRecordToToolResult(
  record: ObservationRecord,
): ObservationRecordToolResult {
  const statusById = new Map(record.results.map((result) => [result.starId, result.status]));
  return {
    missionId: record.missionId,
    site: { ...record.siteSnapshot },
    dateTime: record.dateTime,
    completedAt: record.completedAt,
    results: record.targets.map((target) => {
      const star = STAR_BY_ID.get(target.starId);
      return {
        starId: target.starId,
        name: star?.name ?? target.starId,
        prediction: target.predictedVisible ? "visible" : "not_visible",
        observation: statusById.get(target.starId) ?? "unsure",
        predictedAltitude: target.predictedAltitude,
        predictedAzimuth: target.predictedAzimuth,
        predictedMagnitude: target.predictedMagnitude,
      };
    }),
  };
}

export function compareObservationRecordDetailed(
  record: ObservationRecord,
): DetailedObservationComparison {
  const summary = compareObservationRecord(record);
  const resultById = new Map(record.results.map((result) => [result.starId, result.status]));
  const stars: ComparisonStarToolResult[] = record.targets.map((target) => {
    const star = STAR_BY_ID.get(target.starId);
    const observation = resultById.get(target.starId) ?? "unsure";
    const match =
      observation === "unsure"
        ? null
        : target.predictedVisible === (observation === "visible");
    return {
      starId: target.starId,
      name: star?.name ?? target.starId,
      prediction: target.predictedVisible ? "visible" : "not_visible",
      observation,
      match,
      predictedAltitude: target.predictedAltitude,
      predictedAzimuth: target.predictedAzimuth,
      predictedMagnitude: target.predictedMagnitude,
    };
  });
  const comparable = stars.filter((star) => star.match !== null).length;
  const matches = stars.filter((star) => star.match === true).length;
  return {
    ...summary,
    comparable,
    matches,
    mismatches: comparable - matches,
    matchRate: comparable === 0 ? null : matches / comparable,
    stars,
  };
}

function sceneStarToToolResult(sceneStar: SkyScene["stars"][number]): CurrentSkyStarToolResult {
  const status = sceneStar.status;
  return {
    starId: sceneStar.star.id,
    name: sceneStar.star.name,
    magnitude: sceneStar.star.magnitude,
    altitude: sceneStar.star.altitude,
    azimuth: sceneStar.star.azimuth,
    status:
      status.state === "hidden"
        ? { state: "hidden", reason: status.reason }
        : status.state === "visible"
          ? { state: "visible" }
          : { state: "disabled" },
  };
}

export function getCurrentSkyState(
  input: CurrentSkyStateInput,
): CurrentSkyStateResult {
  assertSite(input.site);
  const scene = buildSkyScene(
    horizontalStars(input.observation, STARS),
    CONSTELLATIONS,
    input.observation,
    input.layers,
    input.simulation,
    1000,
    700,
  );
  return {
    site: { ...input.site },
    dateTime: input.observation.datetime.toISOString(),
    view: {
      azimuth: input.observation.azimuth,
      altitude: input.observation.altitude,
      fieldOfView: input.observation.fieldOfView,
    },
    simulation: { ...input.simulation },
    layers: { ...input.layers },
    displayOptions: { ...input.displayOptions },
    skyPhase: scene.skyPhase,
    twilightStage: scene.twilightStage,
    sunAltitude: scene.sunAltitudeDeg,
    sunAzimuth: scene.sunAzimuthDeg,
    visibleCount: scene.visibleCount,
    inViewCount: scene.inViewCount,
    stars: scene.stars.map(sceneStarToToolResult),
  };
}
