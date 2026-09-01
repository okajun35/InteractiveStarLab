import { horizontalStars } from "../astronomy/coordinates";
import { STARS } from "../astronomy/stars";
import { reconcileSelection } from "./selection";
import { buildObservationCandidates } from "./candidates";
import type { ObservationSettings } from "../types/astronomy";
import type { ObservationMission, ObservationSite } from "../types/observation";

export interface PlanDraft {
  site: ObservationSite;
  dateTime: Date;
  maxMagnitude: number;
  selectedStarIds: string[];
}

export function createInitialPlanDraft(site: ObservationSite, dateTime: Date): PlanDraft {
  return {
    site: { ...site },
    dateTime: new Date(dateTime.getTime()),
    maxMagnitude: 2,
    selectedStarIds: [],
  };
}

export function missionToPlanDraft(mission: ObservationMission): PlanDraft {
  const draft: PlanDraft = {
    site: { ...mission.siteSnapshot },
    dateTime: new Date(mission.dateTime),
    maxMagnitude: mission.maxMagnitude,
    selectedStarIds: mission.targets.map((target) => target.starId),
  };
  return {
    ...draft,
    selectedStarIds: reconcilePlanSelection(draft),
  };
}

export function candidatesForPlanDraft(draft: PlanDraft) {
  const settings: ObservationSettings = {
    latitude: draft.site.latitude,
    longitude: draft.site.longitude,
    datetime: draft.dateTime,
    azimuth: 180,
    altitude: 30,
    fieldOfView: 80,
  };
  try {
    return buildObservationCandidates({
      horizontalStars: horizontalStars(settings, STARS),
      maxMagnitude: draft.maxMagnitude,
    });
  } catch {
    return [];
  }
}

export function reconcilePlanSelection(draft: PlanDraft): string[] {
  return reconcileSelection(
    draft.selectedStarIds,
    candidatesForPlanDraft({ ...draft, selectedStarIds: [] }).map((candidate) => candidate.starId),
  );
}
