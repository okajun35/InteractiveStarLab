import type { StarLayerState } from "../astronomy/visibilityModel";
import type { DisplayOptions, SimulationSettings } from "../types/astronomy";
import type { ObservationSite } from "../types/observation";

export interface SkySnapshotView {
  azimuth: number;
  altitude: number;
  fieldOfView: number;
}

export interface SkySnapshotMetadata {
  snapshotId: string;
  createdAt: string;
  fileName: string;
  mimeType: "image/png";
  width: number;
  height: number;
  heading: string;
  site: ObservationSite;
  dateTime: string;
  view: SkySnapshotView;
  simulation: SimulationSettings;
  layers: StarLayerState;
  displayOptions: DisplayOptions;
  missionId?: string;
}

export interface SkySnapshotRecord extends SkySnapshotMetadata {
  blob: Blob;
}

export type SkySnapshotMetadataInput = Omit<
  SkySnapshotMetadata,
  "snapshotId" | "createdAt" | "fileName" | "mimeType" | "width" | "height"
> & {
  snapshotId?: string;
  createdAt?: string;
  width?: number;
  height?: number;
};
