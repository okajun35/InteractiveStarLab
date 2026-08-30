import type { ObservationSite } from "../types/observation";

export type GuideDifficulty = "easy" | "medium" | "hard";

export interface ObservationGuideDescriptor {
  guideId: string;
  missionId: string;
  title: string;
  durationMinutes: number;
  timeZone: string;
  createdAt: string;
}

export interface ObservationGuideTarget {
  index: number;
  starId: string;
  name: string;
  magnitude: number;
  altitude: number;
  azimuth: number;
  direction: string;
  difficulty: GuideDifficulty;
  predictedVisible: boolean;
}

export interface GuideMapStar {
  starId: string;
  name: string;
  magnitude: number;
  altitude: number;
  azimuth: number;
  x: number;
  y: number;
  targetIndex?: number;
}

export interface GuideMapLine {
  constellationId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MissionSkySnapshotModel {
  missionId: string;
  siteSnapshot: ObservationSite;
  dateTime: string;
  projection: "all_sky";
  width: number;
  height: number;
  targetStars: GuideMapStar[];
  referenceStars: GuideMapStar[];
  constellationLines: GuideMapLine[];
}

export interface ObservationGuideModel {
  descriptor: ObservationGuideDescriptor;
  site: ObservationSite;
  dateTime: string;
  endDateTime: string;
  locationText: string;
  timeZoneLabel: string;
  primaryDirection: string;
  targets: ObservationGuideTarget[];
  skySnapshot: MissionSkySnapshotModel;
}

export interface ObservationGuidePdfResult {
  guideId: string;
  missionId: string;
  fileName: string;
  downloadUrl: string;
}
