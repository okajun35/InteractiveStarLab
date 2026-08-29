/**
 * Observation workflow domain types.
 *
 * These types intentionally live outside astronomy/ so that Mission and
 * Result persistence can later be used by WebMCP without importing React.
 */

export interface ObservationSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export type ObservationStatus = "visible" | "not_visible" | "unsure";

export interface ObservationCandidate {
  starId: string;
  name: string;
  nameJa?: string;
  magnitude: number;
  altitude: number;
  azimuth: number;
  predictedVisible: boolean;
}

export interface ObservationTarget {
  starId: string;
  predictedVisible: boolean;
  /** Mission-creation snapshot; do not recompute after saving. */
  predictedAltitude: number;
  predictedAzimuth: number;
  predictedMagnitude: number;
}

export interface ObservationMission {
  id: string;
  siteId: string;
  siteSnapshot: ObservationSite;
  dateTime: string;
  maxMagnitude: number;
  targets: ObservationTarget[];
  createdAt: string;
}

export interface ObservationResult {
  starId: string;
  status: ObservationStatus;
}

export interface ObservationRecord {
  missionId: string;
  siteId: string;
  siteSnapshot: ObservationSite;
  dateTime: string;
  targets: ObservationTarget[];
  results: ObservationResult[];
  completedAt: string;
}

export interface ObservationComparison {
  predicted: number;
  visible: number;
  notVisible: number;
  unsure: number;
}
