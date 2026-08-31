import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStarViewer } from "./context";
import { useObservation } from "./observation";
import { useSimulation } from "./simulation";
import { registerReadTools } from "../mcp/registerTools";
import { registerMissionTools } from "../mcp/missionTools";
import { registerPlanTools } from "../mcp/writeTools";
import { registerResultTools } from "../mcp/resultTools";
import { registerResultNavigationTools } from "../mcp/resultNavigationTools";
import { registerObservationWriteTools } from "../mcp/observationWriteTools";
import { registerSkyControlTools } from "../mcp/skyControlTools";
import { registerSnapshotTools } from "../mcp/snapshotTools";
import { createObservationPlanFromStarIds } from "../mcp/services";
import { getModelContext, type WebMcpAvailability } from "../mcp/webmcp";
import { useNavigation } from "./navigation";
import { useSnapshots } from "./snapshots";
import { useGuides } from "./guides";
import { registerGuideTools } from "../mcp/guideTools";
import { registerRecoveryTools } from "../mcp/recoveryTools";

export interface WebMcpState {
  availability: WebMcpAvailability;
  registeredToolNames: readonly string[];
}

const WebMcpContext = createContext<WebMcpState | null>(null);

/**
 * Registers page tools once for the lifetime of the application.  The
 * provider is above AppShell's view switch, so changing Plan/Sky/Results does
 * not remove the tools.  State is read through refs at execute time to avoid
 * stale values captured by the registration effect.
 */
export function WebMcpProvider({ children }: { children: React.ReactNode }) {
  const {
    activeSite,
    missions,
    records,
    selectedRecordMissionId,
    updateActiveSite,
    createMissionAndPersist,
    restoreMission,
    saveResultsForMissionAndPersist,
    getCloudRecord,
    getCloudLatestRecord,
    getCloudMission,
    getCloudSnapshotInfo,
    cloudAuthenticated,
    selectRecord,
  } = useObservation();
  const { settings: observation, options, updateSettings, updateOptions } = useStarViewer();
  const {
    settings: simulation,
    layers,
    setLayerEnabled,
    setDaylightMode,
    setLightPollution,
    setLimitingMagnitude,
    setObserverSensitivity,
    setShowHiddenStars,
  } = useSimulation();
  const { setView } = useNavigation();
  const { captureSnapshot, downloadRecord, snapshots, getSnapshot, isCloudSnapshot, getSnapshotStoragePath, getSnapshotAccessUrl } = useSnapshots();
  const { prepareGuide, selectedGuide, generatePdfForGuide } = useGuides();
  const siteRef = useRef(activeSite);
  const observationRef = useRef(observation);
  const simulationRef = useRef(simulation);
  const layersRef = useRef(layers);
  const optionsRef = useRef(options);
  const createMissionAndPersistRef = useRef(createMissionAndPersist);
  const restoreMissionRef = useRef(restoreMission);
  const missionsRef = useRef(missions);
  const updateActiveSiteRef = useRef(updateActiveSite);
  const updateSettingsRef = useRef(updateSettings);
  const updateOptionsRef = useRef(updateOptions);
  const setLayerEnabledRef = useRef(setLayerEnabled);
  const setDaylightModeRef = useRef(setDaylightMode);
  const setLightPollutionRef = useRef(setLightPollution);
  const setLimitingMagnitudeRef = useRef(setLimitingMagnitude);
  const setObserverSensitivityRef = useRef(setObserverSensitivity);
  const setShowHiddenStarsRef = useRef(setShowHiddenStars);
  const saveResultsForMissionAndPersistRef = useRef(saveResultsForMissionAndPersist);
  const getCloudRecordRef = useRef(getCloudRecord);
  const getCloudLatestRecordRef = useRef(getCloudLatestRecord);
  const getCloudMissionRef = useRef(getCloudMission);
  const getCloudSnapshotInfoRef = useRef(getCloudSnapshotInfo);
  const cloudAuthenticatedRef = useRef(cloudAuthenticated);
  const selectRecordRef = useRef(selectRecord);
  const captureSnapshotRef = useRef(captureSnapshot);
  const downloadRecordRef = useRef(downloadRecord);
  const snapshotsRef = useRef(snapshots);
  const getSnapshotRef = useRef(getSnapshot);
  const isCloudSnapshotRef = useRef(isCloudSnapshot);
  const getSnapshotStoragePathRef = useRef(getSnapshotStoragePath);
  const getSnapshotAccessUrlRef = useRef(getSnapshotAccessUrl);
  const prepareGuideRef = useRef(prepareGuide);
  const selectedGuideRef = useRef(selectedGuide);
  const generatePdfForGuideRef = useRef(generatePdfForGuide);
  const setViewRef = useRef(setView);
  const recordsRef = useRef(records);
  const selectedRecordMissionIdRef = useRef(selectedRecordMissionId);
  siteRef.current = activeSite;
  observationRef.current = observation;
  simulationRef.current = simulation;
  layersRef.current = layers;
  optionsRef.current = options;
  createMissionAndPersistRef.current = createMissionAndPersist;
  restoreMissionRef.current = restoreMission;
  missionsRef.current = missions;
  updateActiveSiteRef.current = updateActiveSite;
  updateSettingsRef.current = updateSettings;
  updateOptionsRef.current = updateOptions;
  setLayerEnabledRef.current = setLayerEnabled;
  setDaylightModeRef.current = setDaylightMode;
  setLightPollutionRef.current = setLightPollution;
  setLimitingMagnitudeRef.current = setLimitingMagnitude;
  setObserverSensitivityRef.current = setObserverSensitivity;
  setShowHiddenStarsRef.current = setShowHiddenStars;
  saveResultsForMissionAndPersistRef.current = saveResultsForMissionAndPersist;
  getCloudRecordRef.current = getCloudRecord;
  getCloudLatestRecordRef.current = getCloudLatestRecord;
  getCloudMissionRef.current = getCloudMission;
  getCloudSnapshotInfoRef.current = getCloudSnapshotInfo;
  cloudAuthenticatedRef.current = cloudAuthenticated;
  selectRecordRef.current = selectRecord;
  captureSnapshotRef.current = captureSnapshot;
  downloadRecordRef.current = downloadRecord;
  snapshotsRef.current = snapshots;
  getSnapshotRef.current = getSnapshot;
  isCloudSnapshotRef.current = isCloudSnapshot;
  getSnapshotStoragePathRef.current = getSnapshotStoragePath;
  getSnapshotAccessUrlRef.current = getSnapshotAccessUrl;
  prepareGuideRef.current = prepareGuide;
  selectedGuideRef.current = selectedGuide;
  generatePdfForGuideRef.current = generatePdfForGuide;
  setViewRef.current = setView;
  recordsRef.current = records;
  selectedRecordMissionIdRef.current = selectedRecordMissionId;

  const [availability, setAvailability] = useState<WebMcpAvailability>("unknown");
  const registeredToolNames = useMemo(
    () => [
      "get_observation_site",
      "predict_visible_stars",
      "get_current_sky_state",
      "create_observation_plan",
      "restore_observation_mission",
      "get_observation_mission",
      "get_observation_results",
      "compare_prediction_and_observation",
      "open_sky_view",
      "open_observe_view",
      "set_observation_site",
      "set_sky_view_settings",
      "set_sky_display_settings",
      "save_observation_results",
      "open_observation_results",
      "capture_sky_snapshot",
      "list_sky_snapshots",
      "get_sky_snapshot_metadata",
      "generate_observation_guide",
    ],
    [],
  );

  useEffect(() => {
    const modelContext = getModelContext();
    if (modelContext === null) {
      setAvailability("unavailable");
      return;
    }

    const controller = new AbortController();
    let disposed = false;
    registerReadTools(
      modelContext,
      {
        getObservationSite: () => siteRef.current,
        getObservationSettings: () => observationRef.current,
        getSimulationSettings: () => simulationRef.current,
        getLayers: () => layersRef.current,
        getDisplayOptions: () => optionsRef.current,
      },
      { signal: controller.signal },
    )
      .then(() => registerPlanTools(
        modelContext,
        {
          getObservationSite: () => siteRef.current,
          createObservationPlan: (input) => {
            const planned = createObservationPlanFromStarIds(input);
            return createMissionAndPersistRef.current({
              dateTime: planned.dateTime,
              maxMagnitude: planned.maxMagnitude,
              targets: planned.targets,
            });
          },
          openObserve: () => setViewRef.current("observe"),
          isCloudEnabled: () => cloudAuthenticatedRef.current,
        },
        { signal: controller.signal },
      ))
      .then(() => registerRecoveryTools(
        modelContext,
        {
          restoreMission: (recoveryCode) => restoreMissionRef.current(recoveryCode),
          openObserve: () => setViewRef.current("observe"),
          isCloudEnabled: () => cloudAuthenticatedRef.current,
        },
        { signal: controller.signal },
      ))
      .then(() => registerMissionTools(
        modelContext,
        {
          getMissions: () => missionsRef.current,
          isCloudEnabled: () => cloudAuthenticatedRef.current,
          getCloudMission: (missionId) => getCloudMissionRef.current(missionId),
        },
        { signal: controller.signal },
      ))
      .then(() => registerResultTools(
        modelContext,
        {
          getRecords: () => recordsRef.current,
          getSelectedRecordMissionId: () => selectedRecordMissionIdRef.current,
          isCloudEnabled: () => cloudAuthenticatedRef.current,
          getCloudRecord: (missionId) => getCloudRecordRef.current(missionId),
          getCloudLatestRecord: () => getCloudLatestRecordRef.current(),
          getCloudSnapshotInfo: (missionId) => getCloudSnapshotInfoRef.current(missionId),
        },
        { signal: controller.signal },
      ))
      .then(() => registerSkyControlTools(
        modelContext,
        {
          getObservationSite: () => siteRef.current,
          getObservationSettings: () => observationRef.current,
          updateObservationSite: (patch) => updateActiveSiteRef.current(patch),
          updateObservationSettings: (patch) => updateSettingsRef.current(patch),
          getDisplayOptions: () => optionsRef.current,
          getLayers: () => layersRef.current,
          getSimulationSettings: () => simulationRef.current,
          updateDisplayOptions: (patch) => updateOptionsRef.current(patch),
          setLayerEnabled: (layer, enabled) => setLayerEnabledRef.current(layer, enabled),
          setDaylightMode: (mode) => setDaylightModeRef.current(mode),
          setLightPollution: (level) => setLightPollutionRef.current(level),
          setLimitingMagnitude: (value) => setLimitingMagnitudeRef.current(value),
          setObserverSensitivity: (value) => setObserverSensitivityRef.current(value),
          setShowHiddenStars: (value) => setShowHiddenStarsRef.current(value),
          openSky: () => setViewRef.current("sky"),
          openObserve: () => setViewRef.current("observe"),
        },
        { signal: controller.signal },
      ))
      .then(() => registerObservationWriteTools(
        modelContext,
        {
          getMissions: () => missionsRef.current,
          saveResultsForMission: (missionId, results) => saveResultsForMissionAndPersistRef.current(missionId, results),
        },
        { signal: controller.signal },
      ))
      .then(() => registerResultNavigationTools(
        modelContext,
        {
          getRecords: () => recordsRef.current,
          getSelectedRecordMissionId: () => selectedRecordMissionIdRef.current,
          selectRecord: (missionId) => selectRecordRef.current(missionId),
          openResults: () => setViewRef.current("results"),
        },
        { signal: controller.signal },
      ))
      .then(() => registerSnapshotTools(
        modelContext,
        {
          getMissions: () => missionsRef.current,
          getCurrentMetadata: () => ({
            site: { ...siteRef.current },
            dateTime: observationRef.current.datetime.toISOString(),
            view: {
              azimuth: observationRef.current.azimuth,
              altitude: observationRef.current.altitude,
              fieldOfView: observationRef.current.fieldOfView,
            },
            simulation: { ...simulationRef.current },
            layers: { ...layersRef.current },
            displayOptions: { ...optionsRef.current },
            heading: `azimuth_${Math.round(observationRef.current.azimuth)}deg`,
          }),
          captureSnapshot: (input) => captureSnapshotRef.current(input),
          downloadRecord: (record) => downloadRecordRef.current(record),
          getSnapshots: () => snapshotsRef.current,
          getSnapshot: (snapshotId) => getSnapshotRef.current(snapshotId),
          isCloudSnapshot: (snapshotId) => isCloudSnapshotRef.current(snapshotId),
          getSnapshotStoragePath: (snapshotId) => getSnapshotStoragePathRef.current(snapshotId),
          getSnapshotAccessUrl: (snapshotId) => getSnapshotAccessUrlRef.current(snapshotId),
        },
        { signal: controller.signal },
      ))
      .then(() => registerGuideTools(
        modelContext,
        {
          getMissions: () => missionsRef.current,
          getSelectedGuide: () => selectedGuideRef.current,
          prepareGuide: (missionId, options) => prepareGuideRef.current(missionId, options),
          generatePdfForGuide: (guide) => generatePdfForGuideRef.current(guide),
          openGuide: () => setViewRef.current("guide"),
          getSnapshotInfo: (missionId) => getCloudSnapshotInfoRef.current(missionId),
        },
        { signal: controller.signal },
      ))
      .then(() => {
        if (!disposed) setAvailability("ready");
      })
      .catch(() => {
        if (!disposed) setAvailability("error");
      });

    return () => {
      disposed = true;
      controller.abort();
    };
  }, []);

  const value = useMemo<WebMcpState>(
    () => ({ availability, registeredToolNames }),
    [availability, registeredToolNames],
  );

  return <WebMcpContext.Provider value={value}>{children}</WebMcpContext.Provider>;
}

export function useWebMcp(): WebMcpState {
  const context = useContext(WebMcpContext);
  if (context === null) throw new Error("useWebMcp must be used inside <WebMcpProvider>");
  return context;
}
