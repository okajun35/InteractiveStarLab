import { normalizeAzimuth } from "../sky/contextModel";
import { formatDateTimeInZone, isValidTimeZone } from "../astronomy/timezones";
import { matchingPreset } from "../sky/contextModel";
import type { ObservationMission } from "../types/observation";

export interface MissionSkyView {
  site: ObservationMission["siteSnapshot"];
  observation: {
    latitude: number;
    longitude: number;
    datetime: Date;
    azimuth: number;
    altitude: number;
    fieldOfView: number;
  };
}

export function missionToSkyView(mission: ObservationMission, currentFieldOfView: number): MissionSkyView | null {
  const primary = mission.targets[0];
  if (primary === undefined) return null;
  return {
    site: { ...mission.siteSnapshot },
    observation: {
      latitude: mission.siteSnapshot.latitude,
      longitude: mission.siteSnapshot.longitude,
      datetime: new Date(mission.dateTime),
      azimuth: normalizeAzimuth(primary.predictedAzimuth),
      altitude: Math.max(0, Math.min(90, primary.predictedAltitude)),
      fieldOfView: Number.isFinite(currentFieldOfView) && currentFieldOfView >= 20 && currentFieldOfView <= 140
        ? currentFieldOfView
        : 80,
    },
  };
}

export function missionTimeZone(mission: Pick<ObservationMission, "siteSnapshot">): string {
  if (isValidTimeZone(mission.siteSnapshot.timeZone)) return mission.siteSnapshot.timeZone;
  return matchingPreset(mission.siteSnapshot)?.timeZone ?? "UTC";
}

export function formatMissionDateTime(dateTime: string, mission: Pick<ObservationMission, "siteSnapshot">): string {
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDateTimeInZone(date, missionTimeZone(mission));
}
