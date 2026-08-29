import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createObservationMission,
  type CreateObservationMissionInput,
} from "../observation/mission";
import { buildObservationResults } from "../observation/results";
import {
  buildObservationRecord,
  normalizeObservationResults,
} from "../mcp/observationWriteServices";
import {
  DEFAULT_OBSERVATION_STATE,
  loadObservationState,
  saveObservationState,
} from "../observation/storage";
import type {
  ObservationMission,
  ObservationRecord,
  ObservationSite,
  ObservationStatus,
} from "../types/observation";
import { getSupabaseClient } from "../cloud/client";
import { cloudError as createCloudError } from "../cloud/errors";
import { createSupabaseMissionRepository, type CloudMissionRepository, type CloudMissionRow } from "../cloud/missionRepository";
import { createSupabaseSnapshotStorage, type CloudSnapshotStorage } from "../cloud/snapshotStorage";
import { isCloudMissionSnapshotReference, type CloudMissionSnapshotReference } from "../cloud/snapshotReference";
import { useAuth } from "./auth";
import { resolveCloudPersistenceMode } from "../cloud/authMode";

export type CreateMissionInput = Omit<CreateObservationMissionInput, "site">;

export interface ObservationState {
  activeSite: ObservationSite;
  missions: ObservationMission[];
  records: ObservationRecord[];
  activeMissionId: string | null;
  selectedRecordMissionId: string | null;
  draftResults: Record<string, ObservationStatus>;
  cloudConfigured: boolean;
  cloudAuthenticated: boolean;
  cloudLoading: boolean;
  cloudError: string | null;
  cloudSnapshotStorage: CloudSnapshotStorage | null;
  cloudSnapshotReferences: readonly CloudMissionSnapshotReference[];
  updateActiveSite: (patch: Partial<ObservationSite>) => void;
  createMission: (input: CreateMissionInput) => ObservationMission;
  createMissionAndPersist: (input: CreateMissionInput) => Promise<ObservationMission>;
  selectMission: (missionId: string | null) => void;
  setDraftResult: (starId: string, status: ObservationStatus) => void;
  clearDraftResults: () => void;
  saveObservationRecord: () => ObservationRecord | null;
  saveResultsForMission: (
    missionId: string,
    results: ObservationRecord["results"],
  ) => ObservationRecord | null;
  saveObservationRecordAndPersist: () => Promise<ObservationRecord | null>;
  saveResultsForMissionAndPersist: (
    missionId: string,
    results: ObservationRecord["results"],
  ) => Promise<ObservationRecord | null>;
  refreshCloudMissions: () => Promise<void>;
  getCloudRecord: (missionId: string) => Promise<ObservationRecord | null>;
  getCloudLatestRecord: () => Promise<ObservationRecord | null>;
  getCloudMission: (missionId: string) => Promise<CloudMissionRow | null>;
  getCloudSnapshotInfo: (missionId: string) => Promise<CloudMissionSnapshotReference | null>;
  clearCloudError: () => void;
  selectRecord: (missionId: string | null) => void;
}

const ObservationContext = createContext<ObservationState | null>(null);

export function ObservationProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const cloudClient = useMemo(() => getSupabaseClient(), []);
  const cloudMode = resolveCloudPersistenceMode(cloudClient !== null, userId);
  const cloudRepository = useMemo<CloudMissionRepository | null>(
    () => cloudClient !== null && userId !== null
      ? createSupabaseMissionRepository(cloudClient, () => userId)
      : null,
    [cloudClient, userId],
  );
  const cloudSnapshotStorage = useMemo<CloudSnapshotStorage | null>(
    () => cloudClient !== null && cloudRepository !== null
      ? createSupabaseSnapshotStorage(cloudClient, cloudRepository)
      : null,
    [cloudClient, cloudRepository],
  );
  const [persisted, setPersisted] = useState(() => loadObservationState());
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  const [selectedRecordMissionId, setSelectedRecordMissionId] = useState<string | null>(null);
  const [draftResults, setDraftResults] = useState<Record<string, ObservationStatus>>({});
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudSnapshotReferences, setCloudSnapshotReferences] = useState<CloudMissionSnapshotReference[]>([]);

  useEffect(() => {
    if (cloudClient === null) saveObservationState(persisted);
  }, [cloudClient, persisted]);

  const refreshCloudMissions = useCallback(async () => {
    if (cloudRepository === null) {
      setPersisted(loadObservationState());
      setCloudError(null);
      setCloudLoading(false);
      setCloudSnapshotReferences([]);
      return;
    }
    setCloudLoading(true);
    try {
      const rows = await cloudRepository.listMissions();
      setPersisted((previous) => ({
        ...previous,
        missions: rows.map((row) => row.mission),
        records: rows.flatMap((row) => row.record === null ? [] : [row.record]),
      }));
      setCloudSnapshotReferences(rows.flatMap((row) => isCloudMissionSnapshotReference(row.skySnapshot) ? [row.skySnapshot] : []));
      setCloudError(null);
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "クラウド履歴を読み込めませんでした。");
    } finally {
      setCloudLoading(false);
    }
  }, [cloudRepository]);

  useEffect(() => {
    void refreshCloudMissions();
  }, [refreshCloudMissions]);

  const updateActiveSite = useCallback((patch: Partial<ObservationSite>) => {
    setPersisted((previous) => ({
      ...previous,
      activeSite: { ...previous.activeSite, ...patch },
    }));
  }, []);

  const createMission = useCallback(
    (input: CreateMissionInput) => {
      const mission = createObservationMission({
        ...input,
        site: persisted.activeSite,
      });
      setPersisted((previous) => ({
        ...previous,
        missions: [...previous.missions, mission],
      }));
      setActiveMissionId(mission.id);
      setSelectedRecordMissionId(null);
      setDraftResults({});
      return mission;
    },
    [persisted.activeSite],
  );

  const createMissionAndPersist = useCallback(async (input: CreateMissionInput): Promise<ObservationMission> => {
    if (cloudClient !== null && userId === null) {
      const error = createCloudError("AUTH_REQUIRED", "Sign in before creating a cloud Mission");
      setCloudError(error.message);
      throw error;
    }
    const mission = createMission(input);
    if (cloudRepository === null) return mission;
    try {
      await cloudRepository.createMission(mission);
      setCloudError(null);
      return mission;
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Missionをクラウドへ保存できませんでした。");
      throw error;
    }
  }, [cloudClient, cloudRepository, createMission, userId]);

  const selectMission = useCallback(
    (missionId: string | null) => {
      if (missionId === null) {
        setActiveMissionId(null);
        setDraftResults({});
        return;
      }
      const mission = persisted.missions.find((item) => item.id === missionId);
      if (!mission) return;
      setActiveMissionId(mission.id);
      const record = persisted.records.find((item) => item.missionId === mission.id);
      setDraftResults(
        Object.fromEntries(record?.results.map((result) => [result.starId, result.status]) ?? []),
      );
    },
    [persisted.missions, persisted.records],
  );

  const setDraftResult = useCallback((starId: string, status: ObservationStatus) => {
    setDraftResults((previous) => ({ ...previous, [starId]: status }));
  }, []);

  const clearDraftResults = useCallback(() => setDraftResults({}), []);

  const saveObservationRecord = useCallback((): ObservationRecord | null => {
    if (activeMissionId === null) return null;
    const mission = persisted.missions.find((item) => item.id === activeMissionId);
    if (!mission) return null;

    const results = buildObservationResults(mission.targets, draftResults);
    if (results === null) return null;

    const record: ObservationRecord = {
      missionId: mission.id,
      siteId: mission.siteId,
      siteSnapshot: { ...mission.siteSnapshot },
      dateTime: mission.dateTime,
      targets: mission.targets.map((target) => ({ ...target })),
      results,
      completedAt: new Date().toISOString(),
    };

    setPersisted((previous) => ({
      ...previous,
      records: [
        ...previous.records.filter((item) => item.missionId !== record.missionId),
        record,
      ],
    }));
    setSelectedRecordMissionId(record.missionId);
    return record;
  }, [activeMissionId, draftResults, persisted.missions]);

  const saveResultsForMission = useCallback(
    (missionId: string, results: ObservationRecord["results"]): ObservationRecord | null => {
      const mission = persisted.missions.find((item) => item.id === missionId);
      if (!mission) return null;
      const normalized = normalizeObservationResults(mission, results);
      const record = buildObservationRecord(mission, normalized);
      setPersisted((previous) => ({
        ...previous,
        records: [
          ...previous.records.filter((item) => item.missionId !== record.missionId),
          record,
        ],
      }));
      setActiveMissionId(record.missionId);
      setDraftResults(Object.fromEntries(record.results.map((result) => [result.starId, result.status])));
      setSelectedRecordMissionId(record.missionId);
      return record;
    },
    [persisted.missions],
  );

  const saveObservationRecordAndPersist = useCallback(async (): Promise<ObservationRecord | null> => {
    const record = saveObservationRecord();
    if (record === null) return record;
    if (cloudClient !== null && userId === null) {
      const error = createCloudError("AUTH_REQUIRED", "Sign in before saving cloud observation results");
      setCloudError(error.message);
      throw error;
    }
    if (cloudRepository === null) return record;
    try {
      await cloudRepository.saveRecord(record.missionId, record);
      setCloudError(null);
      return record;
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "観測結果をクラウドへ保存できませんでした。");
      throw error;
    }
  }, [cloudClient, cloudRepository, saveObservationRecord, userId]);

  const saveResultsForMissionAndPersist = useCallback(async (
    missionId: string,
    results: ObservationRecord["results"],
  ): Promise<ObservationRecord | null> => {
    const record = saveResultsForMission(missionId, results);
    if (record === null) return record;
    if (cloudClient !== null && userId === null) {
      const error = createCloudError("AUTH_REQUIRED", "Sign in before saving cloud observation results");
      setCloudError(error.message);
      throw error;
    }
    if (cloudRepository === null) return record;
    try {
      await cloudRepository.saveRecord(record.missionId, record);
      setCloudError(null);
      return record;
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "観測結果をクラウドへ保存できませんでした。");
      throw error;
    }
  }, [cloudClient, cloudRepository, saveResultsForMission, userId]);

  const getCloudMission = useCallback(async (missionId: string): Promise<CloudMissionRow | null> => {
    if (cloudRepository === null) return null;
    return cloudRepository.getMission(missionId);
  }, [cloudRepository]);

  const getCloudRecord = useCallback(async (missionId: string): Promise<ObservationRecord | null> => {
    const row = await getCloudMission(missionId);
    return row?.record ?? null;
  }, [getCloudMission]);

  const getCloudLatestRecord = useCallback(async (): Promise<ObservationRecord | null> => {
    if (cloudRepository === null) return null;
    const rows = await cloudRepository.listMissions();
    return rows.find((row) => row.record !== null)?.record ?? null;
  }, [cloudRepository]);

  const getCloudSnapshotInfo = useCallback(async (missionId: string): Promise<CloudMissionSnapshotReference | null> => {
    const row = await getCloudMission(missionId);
    return row !== null && isCloudMissionSnapshotReference(row.skySnapshot) ? row.skySnapshot : null;
  }, [getCloudMission]);

  const selectRecord = useCallback((missionId: string | null) => {
    setSelectedRecordMissionId(missionId);
  }, []);

  const value = useMemo<ObservationState>(
    () => ({
      activeSite: persisted.activeSite,
      missions: persisted.missions,
      records: persisted.records,
      activeMissionId,
      selectedRecordMissionId,
      draftResults,
      cloudConfigured: cloudClient !== null,
      cloudAuthenticated: cloudMode === "cloud",
      cloudLoading,
      cloudError,
      cloudSnapshotStorage,
      cloudSnapshotReferences,
      updateActiveSite,
      createMission,
      createMissionAndPersist,
      selectMission,
      setDraftResult,
      clearDraftResults,
      saveObservationRecord,
      saveResultsForMission,
      saveObservationRecordAndPersist,
      saveResultsForMissionAndPersist,
      refreshCloudMissions,
      getCloudRecord,
      getCloudLatestRecord,
      getCloudMission,
      getCloudSnapshotInfo,
      clearCloudError: () => setCloudError(null),
      selectRecord,
    }),
    [
      persisted,
      activeMissionId,
      selectedRecordMissionId,
      draftResults,
      updateActiveSite,
      createMission,
      createMissionAndPersist,
      selectMission,
      setDraftResult,
      clearDraftResults,
      saveObservationRecord,
      saveResultsForMission,
      saveObservationRecordAndPersist,
      saveResultsForMissionAndPersist,
      refreshCloudMissions,
      getCloudRecord,
      getCloudLatestRecord,
      getCloudMission,
      getCloudSnapshotInfo,
      cloudClient,
      cloudRepository,
      cloudMode,
      cloudSnapshotStorage,
      cloudSnapshotReferences,
      cloudLoading,
      cloudError,
      selectRecord,
    ],
  );

  return <ObservationContext.Provider value={value}>{children}</ObservationContext.Provider>;
}

export function useObservation(): ObservationState {
  const context = useContext(ObservationContext);
  if (context === null) {
    throw new Error("useObservation must be used inside <ObservationProvider>");
  }
  return context;
}

export { DEFAULT_OBSERVATION_STATE };
