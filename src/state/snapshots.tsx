import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createSkySnapshotMetadata } from "../snapshots/metadata";
import { canvasToPng, triggerSnapshotDownload } from "../snapshots/renderer";
import { createDefaultSnapshotStorage, type SnapshotStorage } from "../snapshots/storage";
import type { SkySnapshotMetadata, SkySnapshotMetadataInput, SkySnapshotRecord } from "../snapshots/types";
import { useObservation } from "./observation";
import { missionSnapshotContextMatches, snapshotMetadataFromReference, type CloudMissionSnapshotReference } from "../cloud/snapshotReference";
import { cloudError } from "../cloud/errors";

export interface SnapshotState {
  snapshots: readonly SkySnapshotMetadata[];
  selectedSnapshotId: string | null;
  registerCanvas: (canvas: HTMLCanvasElement | null) => void;
  captureSnapshot: (input: SkySnapshotMetadataInput) => Promise<SkySnapshotRecord>;
  getSnapshot: (snapshotId: string) => Promise<SkySnapshotRecord | null>;
  downloadSnapshot: (snapshotId: string) => Promise<string | null>;
  downloadRecord: (record: SkySnapshotRecord) => string | null;
  removeSnapshot: (snapshotId: string) => Promise<void>;
  reloadSnapshots: () => Promise<void>;
  isCloudSnapshot: (snapshotId: string) => boolean;
  getSnapshotStoragePath: (snapshotId: string) => string | null;
  getSnapshotAccessUrl: (snapshotId: string) => Promise<string | null>;
}

const SnapshotContext = createContext<SnapshotState | null>(null);

export function SnapshotProvider({
  children,
  storage,
}: {
  children: React.ReactNode;
  storage?: SnapshotStorage;
}) {
  const { missions, cloudSnapshotStorage, cloudSnapshotReferences, refreshCloudMissions } = useObservation();
  const storageRef = useRef<SnapshotStorage>(storage ?? createDefaultSnapshotStorage());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // React state updates are asynchronous. Keep a ref so the capture WebMCP
  // response can immediately report the newly linked cloud Snapshot and
  // create its signed URL in the same call.
  const cloudReferencesRef = useRef<readonly CloudMissionSnapshotReference[]>(cloudSnapshotReferences);
  cloudReferencesRef.current = cloudSnapshotReferences;
  const [snapshots, setSnapshots] = useState<SkySnapshotMetadata[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  const reloadSnapshots = useCallback(async () => {
    const items = await storageRef.current.list();
    const cloudItems = cloudSnapshotReferences.map(snapshotMetadataFromReference);
    const merged = [...cloudItems, ...items.filter((item) => !cloudSnapshotReferences.some((cloud) => cloud.snapshotId === item.snapshotId))]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    setSnapshots(merged);
    setSelectedSnapshotId((current) => current && merged.some((item) => item.snapshotId === current) ? current : merged[0]?.snapshotId ?? null);
  }, [cloudSnapshotReferences]);

  useEffect(() => {
    void reloadSnapshots().catch(() => {
      // An unavailable/corrupt IndexedDB must not crash the star viewer.
      setSnapshots([]);
      setSelectedSnapshotId(null);
    });
  }, [reloadSnapshots]);

  const registerCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
  }, []);

  const captureSnapshot = useCallback(async (input: SkySnapshotMetadataInput): Promise<SkySnapshotRecord> => {
    const canvas = canvasRef.current;
    if (canvas === null) throw new Error("Sky canvas is not available; open the Sky view first");
    const metadata = createSkySnapshotMetadata({
      ...input,
      width: canvas.width,
      height: canvas.height,
    });
    const blob = await canvasToPng(canvas);
    const record: SkySnapshotRecord = { ...metadata, blob };
    let displayedMetadata = metadata;
    if (input.missionId !== undefined && cloudSnapshotStorage !== null) {
      const mission = missions.find((item) => item.id === input.missionId);
      if (mission === undefined) {
        throw new Error(`Mission not found: ${input.missionId}`);
      }
      if (cloudReferencesRef.current.some((item) => item.missionId === input.missionId)) {
        throw cloudError("SNAPSHOT_ALREADY_EXISTS", `Mission already has a Snapshot: ${input.missionId}`);
      }
      if (!missionSnapshotContextMatches(record, mission)) {
        throw new Error("Mission Snapshot context mismatch: current Sky date or location differs from the Mission");
      }
    }
    // Context validation must complete before any local or cloud persistence;
    // a mismatched image must not appear in Snapshot history at all.
    await storageRef.current.save(record);
    if (input.missionId !== undefined && cloudSnapshotStorage !== null) {
      const reference = await cloudSnapshotStorage.saveMissionSnapshot({ missionId: input.missionId, record });
      cloudReferencesRef.current = [
        ...cloudReferencesRef.current.filter((item) => item.snapshotId !== reference.snapshotId),
        reference,
      ];
      displayedMetadata = snapshotMetadataFromReference(reference);
      await refreshCloudMissions();
    }
    setSnapshots((previous) => [displayedMetadata, ...previous.filter((item) => item.snapshotId !== displayedMetadata.snapshotId)]);
    setSelectedSnapshotId(metadata.snapshotId);
    return record;
  }, [cloudSnapshotStorage, missions, refreshCloudMissions]);

  const getSnapshot = useCallback(async (snapshotId: string) => {
    const local = await storageRef.current.get(snapshotId);
    if (local !== null) return local;
    const reference = cloudReferencesRef.current.find((item) => item.snapshotId === snapshotId);
    if (reference === undefined || cloudSnapshotStorage === null) return null;
    return cloudSnapshotStorage.getMissionSnapshot(reference);
  }, [cloudSnapshotReferences, cloudSnapshotStorage]);

  const downloadRecord = useCallback((record: SkySnapshotRecord) => {
    return triggerSnapshotDownload(record.blob, record.fileName);
  }, []);

  const downloadSnapshot = useCallback(async (snapshotId: string) => {
    const record = await getSnapshot(snapshotId);
    return record === null ? null : downloadRecord(record);
  }, [downloadRecord, getSnapshot]);

  const removeSnapshot = useCallback(async (snapshotId: string) => {
    if (cloudReferencesRef.current.some((item) => item.snapshotId === snapshotId)) {
      throw new Error("Mission Snapshot is immutable and cannot be deleted");
    }
    await storageRef.current.remove(snapshotId);
    setSnapshots((previous) => previous.filter((item) => item.snapshotId !== snapshotId));
    setSelectedSnapshotId((current) => current === snapshotId ? null : current);
  }, []);

  const isCloudSnapshot = useCallback((snapshotId: string) => cloudReferencesRef.current.some((item) => item.snapshotId === snapshotId), []);

  const getSnapshotAccessUrl = useCallback(async (snapshotId: string): Promise<string | null> => {
    const reference = cloudReferencesRef.current.find((item) => item.snapshotId === snapshotId);
    if (reference === undefined || cloudSnapshotStorage === null) return null;
    return cloudSnapshotStorage.createAccessUrl(reference);
  }, [cloudSnapshotReferences, cloudSnapshotStorage]);

  const getSnapshotStoragePath = useCallback((snapshotId: string): string | null => {
    return cloudReferencesRef.current.find((item) => item.snapshotId === snapshotId)?.storagePath ?? null;
  }, []);

  const value = useMemo<SnapshotState>(() => ({
    snapshots,
    selectedSnapshotId,
    registerCanvas,
    captureSnapshot,
    getSnapshot,
    downloadSnapshot,
    downloadRecord,
    removeSnapshot,
    reloadSnapshots,
    isCloudSnapshot,
    getSnapshotStoragePath,
    getSnapshotAccessUrl,
  }), [snapshots, selectedSnapshotId, registerCanvas, captureSnapshot, getSnapshot, downloadSnapshot, downloadRecord, removeSnapshot, reloadSnapshots, isCloudSnapshot, getSnapshotStoragePath, getSnapshotAccessUrl]);

  return <SnapshotContext.Provider value={value}>{children}</SnapshotContext.Provider>;
}

export function useSnapshots(): SnapshotState {
  const context = useContext(SnapshotContext);
  if (context === null) throw new Error("useSnapshots must be used inside <SnapshotProvider>");
  return context;
}
