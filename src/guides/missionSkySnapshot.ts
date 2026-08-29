import { horizontalStars } from "../astronomy/coordinates";
import { CONSTELLATIONS, STAR_BY_ID, STARS } from "../astronomy/stars";
import type { ObservationMission } from "../types/observation";
import type { ObservationSettings } from "../types/astronomy";
import type { GuideMapLine, GuideMapStar, MissionSkySnapshotModel } from "./types";
import { GUIDE_REFERENCE_MAX_MAGNITUDE, GUIDE_REFERENCE_STAR_LIMIT } from "./referenceStars";
import { withGuidePoint } from "./skyProjection";

export const GUIDE_REFERENCE_LABEL_MAX_MAGNITUDE = 1.5;

const GUIDE_VIEW: Omit<ObservationSettings, "latitude" | "longitude" | "datetime"> = {
  azimuth: 180,
  altitude: 30,
  fieldOfView: 80,
};

function targetMapStar(
  target: ObservationMission["targets"][number],
  targetIndex: number,
): GuideMapStar {
  const star = STAR_BY_ID.get(target.starId);
  return withGuidePoint({
    starId: target.starId,
    name: star?.name ?? target.starId,
    nameJa: star?.nameJa,
    magnitude: target.predictedMagnitude,
    altitude: target.predictedAltitude,
    azimuth: target.predictedAzimuth,
    targetIndex,
  });
}

function referenceMapStar(star: ReturnType<typeof horizontalStars>[number]): GuideMapStar {
  return withGuidePoint({
    starId: star.id,
    name: star.name,
    nameJa: star.nameJa,
    magnitude: star.magnitude,
    altitude: star.altitude,
    azimuth: star.azimuth,
  });
}

export function buildMissionSkySnapshot(mission: ObservationMission): MissionSkySnapshotModel {
  if (mission.targets.length < 1 || mission.targets.length > 5) {
    throw new RangeError("mission target count is invalid");
  }
  const targetIds = new Set(mission.targets.map((target) => target.starId));
  const targetStars = mission.targets.map((target, index) => targetMapStar(target, index + 1));
  const observation: ObservationSettings = {
    latitude: mission.siteSnapshot.latitude,
    longitude: mission.siteSnapshot.longitude,
    datetime: new Date(mission.dateTime),
    ...GUIDE_VIEW,
  };
  const calculated = horizontalStars(observation, STARS)
    .filter((star) => star.altitude > 0 && star.magnitude <= GUIDE_REFERENCE_MAX_MAGNITUDE && !targetIds.has(star.id))
    .sort((a, b) => a.magnitude - b.magnitude || b.altitude - a.altitude || a.id.localeCompare(b.id))
    .slice(0, GUIDE_REFERENCE_STAR_LIMIT);
  const referenceStars = calculated.map(referenceMapStar);
  const displayedIds = new Set([...targetStars, ...referenceStars].map((star) => star.starId));
  const positionsById = new Map([...targetStars, ...referenceStars].map((star) => [star.starId, star]));
  const constellationLines: GuideMapLine[] = [];
  for (const constellation of CONSTELLATIONS) {
    for (const [startId, endId] of constellation.lines) {
      if (!displayedIds.has(startId) || !displayedIds.has(endId)) continue;
      const start = positionsById.get(startId);
      const end = positionsById.get(endId);
      if (!start || !end) continue;
      constellationLines.push({
        constellationId: constellation.id,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
      });
    }
  }
  return {
    missionId: mission.id,
    siteSnapshot: { ...mission.siteSnapshot },
    dateTime: mission.dateTime,
    projection: "all_sky",
    width: 1000,
    height: 1000,
    targetStars,
    referenceStars,
    constellationLines,
  };
}
