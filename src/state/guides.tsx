import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { buildObservationGuideModel, createGuideDescriptor, type CreateGuideDescriptorInput } from "../guides/model";
import {
  loadGuideState,
  saveGuideState,
  upsertGuideDescriptor,
  type GuideStorageLike,
  type PersistedGuideState,
} from "../guides/storage";
import type { ObservationGuideDescriptor, ObservationGuideModel } from "../guides/types";
import type { ObservationGuidePdfResult } from "../guides/types";
import { createObservationGuidePdfArtifact, startGuidePdfDownload } from "../guides/pdf";
import type { ObservationMission } from "../types/observation";
import { useObservation } from "./observation";

export interface GuideState {
  descriptors: readonly ObservationGuideDescriptor[];
  selectedGuideId: string | null;
  selectedGuide: ObservationGuideModel | null;
  getGuideForMission: (missionId: string) => ObservationGuideModel | null;
  prepareGuide: (missionId: string, options?: Omit<CreateGuideDescriptorInput, "mission">) => ObservationGuideModel | null;
  selectGuide: (guideId: string | null) => void;
  generatePdfForMission: (missionId: string) => Promise<ObservationGuidePdfResult | null>;
  generatePdf: () => Promise<ObservationGuidePdfResult | null>;
  generatePdfForGuide: (guide: ObservationGuideModel) => Promise<ObservationGuidePdfResult>;
}

const GuideContext = createContext<GuideState | null>(null);

function findMission(missions: readonly ObservationMission[], missionId: string): ObservationMission | null {
  return missions.find((mission) => mission.id === missionId) ?? null;
}

export function GuideProvider({ children, storage }: { children: React.ReactNode; storage?: GuideStorageLike }) {
  const { missions } = useObservation();
  const [persisted, setPersisted] = useState<PersistedGuideState>(() => loadGuideState(storage));
  const storageRef = useRef<GuideStorageLike | undefined>(storage);
  storageRef.current = storage;

  useEffect(() => {
    saveGuideState(persisted, storageRef.current);
  }, [persisted]);

  const prepareGuide = useCallback((missionId: string, options: Omit<CreateGuideDescriptorInput, "mission"> = {}) => {
    const mission = findMission(missions, missionId);
    if (!mission) return null;
    const descriptor = createGuideDescriptor({ mission, ...options });
    setPersisted((previous) => upsertGuideDescriptor(previous, descriptor));
    return buildObservationGuideModel(mission, descriptor);
  }, [missions]);

  const selectGuide = useCallback((guideId: string | null) => {
    setPersisted((previous) => ({
      ...previous,
      selectedGuideId: guideId !== null && previous.descriptors.some((item) => item.guideId === guideId) ? guideId : null,
    }));
  }, []);

  const getGuideForMission = useCallback((missionId: string) => {
    const mission = findMission(missions, missionId);
    const descriptor = persisted.descriptors.find((item) => item.missionId === missionId);
    if (!mission || !descriptor) return null;
    try { return buildObservationGuideModel(mission, descriptor); } catch { return null; }
  }, [missions, persisted.descriptors]);

  const selectedGuide = useMemo(() => {
    if (persisted.selectedGuideId === null) return null;
    const descriptor = persisted.descriptors.find((item) => item.guideId === persisted.selectedGuideId);
    if (!descriptor) return null;
    const mission = findMission(missions, descriptor.missionId);
    if (!mission) return null;
    try { return buildObservationGuideModel(mission, descriptor); } catch { return null; }
  }, [missions, persisted.descriptors, persisted.selectedGuideId]);

  const pdfUrlsRef = useRef<Map<string, string>>(new Map());
  const generatePdfForGuide = useCallback(async (guide: ObservationGuideModel) => {
    const artifact = createObservationGuidePdfArtifact(guide);
    const previousUrl = pdfUrlsRef.current.get(guide.descriptor.guideId);
    if (previousUrl && typeof URL !== "undefined") URL.revokeObjectURL(previousUrl);
    const downloadUrl = startGuidePdfDownload(artifact);
    pdfUrlsRef.current.set(guide.descriptor.guideId, downloadUrl);
    return { guideId: guide.descriptor.guideId, missionId: guide.descriptor.missionId, fileName: artifact.fileName, downloadUrl };
  }, []);

  const generatePdfForMission = useCallback(async (missionId: string) => {
    const guide = getGuideForMission(missionId);
    if (!guide) return null;
    return generatePdfForGuide(guide);
  }, [generatePdfForGuide, getGuideForMission]);

  const generatePdf = useCallback(async () => {
    if (!selectedGuide) return null;
    return generatePdfForGuide(selectedGuide);
  }, [generatePdfForGuide, selectedGuide]);

  const value = useMemo<GuideState>(() => ({
    descriptors: persisted.descriptors,
    selectedGuideId: persisted.selectedGuideId,
    selectedGuide,
    getGuideForMission,
    prepareGuide,
    selectGuide,
    generatePdfForMission,
    generatePdf,
    generatePdfForGuide,
  }), [persisted.descriptors, persisted.selectedGuideId, selectedGuide, getGuideForMission, prepareGuide, selectGuide, generatePdfForMission, generatePdf, generatePdfForGuide]);

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>;
}

export function useGuides(): GuideState {
  const context = useContext(GuideContext);
  if (context === null) throw new Error("useGuides must be used inside <GuideProvider>");
  return context;
}
