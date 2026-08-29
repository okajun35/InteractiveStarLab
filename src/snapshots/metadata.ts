import type { SkySnapshotMetadata, SkySnapshotMetadataInput } from "./types";

export interface SnapshotMetadataDependencies {
  id?: () => string;
  now?: () => Date;
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function fileSafe(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "sky";
}

export function createSkySnapshotMetadata(
  input: SkySnapshotMetadataInput,
  dependencies: SnapshotMetadataDependencies = {},
): SkySnapshotMetadata {
  const createdAt = dependencies.now?.() ?? new Date();
  const date = new Date(input.dateTime);
  if (Number.isNaN(date.getTime())) throw new RangeError("dateTime must be a valid ISO datetime");
  const width = input.width;
  const height = input.height;
  if (width === undefined || height === undefined || !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new RangeError("snapshot dimensions must be positive integers");
  }
  if (!Number.isFinite(input.view.azimuth) || !Number.isFinite(input.view.altitude) || !Number.isFinite(input.view.fieldOfView)) {
    throw new RangeError("snapshot view is invalid");
  }
  const snapshotId = input.snapshotId ?? (dependencies.id?.() ?? createId());
  const timestamp = createdAt.toISOString();
  const dateStamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const heading = fileSafe(input.heading);
  return {
    ...input,
    width,
    height,
    snapshotId,
    createdAt: input.createdAt ?? timestamp,
    fileName: `starview_${dateStamp}_${fileSafe(input.site.name)}_${heading || "sky"}.png`,
    mimeType: "image/png",
    site: { ...input.site },
    view: { ...input.view },
    simulation: { ...input.simulation },
    layers: { ...input.layers },
    displayOptions: { ...input.displayOptions },
  };
}
