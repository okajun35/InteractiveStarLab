/**
 * Night ephemeris: the darkness window, the Sun and the Moon for one observing night.
 *
 * A night "starting" on calendar date `nightOf` runs from local noon of that date to
 * local noon of the next one, so evening and morning events land on the same night
 * the way an observer thinks about them. Everything here is UTC and pure: no React,
 * no DOM, no network.
 */

import {
  Body,
  Equator,
  Horizon,
  Illumination,
  MoonPhase,
  Observer,
  SearchAltitude,
  SearchRiseSet,
} from "astronomy-engine";
import { isValidTimeZone, localDateTimeToInstant } from "./timezones";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const CIVIL_TWILIGHT_DEG = -6;
const NAUTICAL_TWILIGHT_DEG = -12;
const ASTRONOMICAL_TWILIGHT_DEG = -18;

/**
 * A Moon this faint (illuminated fraction) stops costing the observer anything.
 * Below it, dark time with the Moon up still counts on a ramp: see `faintMoonWeight`.
 */
export const FAINT_MOON_FRACTION = 0.15;
const SAMPLE_STEP_MS = 10 * 60_000;

/** Points awarded per usable dark hour before the cap at 100. */
export const POINTS_PER_USABLE_HOUR = 10;
export const MAX_NIGHT_SCORE = 100;
const HOUR_EPSILON = 0.05;
const MAX_RANGE_DAYS = 62;

export interface NightSite {
  latitude: number;
  longitude: number;
  /** Elevation in meters above sea level; defaults to 0. */
  elevationM?: number;
  /** IANA zone for locating local noon; falls back to longitude-based solar noon. */
  timeZone?: string;
}

export type SunStatus = "normal" | "never_sets" | "never_rises";
export type DarknessStatus = "ok" | "no_astronomical_darkness" | "continuous_darkness";

export interface NightInterval {
  startUtc: string;
  endUtc: string;
}

export interface NightEphemeris {
  nightOf: string;
  windowStartUtc: string;
  windowEndUtc: string;
  sun: {
    status: SunStatus;
    sunsetUtc: string | null;
    sunriseUtc: string | null;
    civilDuskUtc: string | null;
    nauticalDuskUtc: string | null;
    astronomicalDuskUtc: string | null;
    astronomicalDawnUtc: string | null;
    nauticalDawnUtc: string | null;
    civilDawnUtc: string | null;
  };
  darkness: {
    status: DarknessStatus;
    startUtc: string | null;
    endUtc: string | null;
    hours: number | null;
    moonFreeHours: number | null;
    moonFreeIntervals: NightInterval[];
    /** Moon free hours plus Moon-up dark hours weighted by `moon.faintMoonWeight`. */
    usableHours: number | null;
  };
  moon: {
    illuminationPct: number;
    /** Unrounded 0..1 fraction: what the faint Moon weight is computed from. */
    illuminationFraction: number;
    faintMoonWeight: number;
    phaseName: string;
    phaseAngleDeg: number;
    riseUtc: string | null;
    setUtc: string | null;
    upDuringDarknessPct: number | null;
    altitudeAtMidDarknessDeg: number | null;
  };
  /** One quotable English sentence a tool can put straight into its summary. */
  explanation: string;
}

export interface NightScore {
  nightOf: string;
  /** round(min(100, 10 * usableHours)); 0 when there is no astronomical darkness. */
  score: number;
  darkHours: number | null;
  moonFreeHours: number | null;
  usableHours: number | null;
  moonIlluminationPct: number;
  darknessStatus: DarknessStatus;
  explanation: string;
}

function roundTo(n: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(n * scale) / scale;
}

function parseIsoDate(nightOf: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nightOf);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const checkDate = new Date(Date.UTC(year, month - 1, day));
  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** 12:00 local on `nightOf`: exact via the zone when known, else solar noon from longitude. */
export function localNoonUtc(nightOf: string, site: NightSite): Date {
  const parts = parseIsoDate(nightOf);
  if (!parts) throw new RangeError(`localNoonUtc: "${nightOf}" is not a valid calendar date`);
  if (site.timeZone && isValidTimeZone(site.timeZone)) {
    return localDateTimeToInstant(`${nightOf}T12:00`, site.timeZone);
  }
  const nominalNoon = Date.UTC(parts.year, parts.month - 1, parts.day, 12);
  const longitude = Number.isFinite(site.longitude) ? site.longitude : 0;
  return new Date(nominalNoon - (longitude / 15) * HOUR_MS);
}

/** Inclusive list of YYYY-MM-DD dates; throws RangeError if invalid, reversed, or over maxDays. */
export function isoDateRange(fromIso: string, toIso: string, maxDays = MAX_RANGE_DAYS): string[] {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from) throw new RangeError(`isoDateRange: "${fromIso}" is not a valid calendar date`);
  if (!to) throw new RangeError(`isoDateRange: "${toIso}" is not a valid calendar date`);
  const fromMs = Date.UTC(from.year, from.month - 1, from.day);
  const toMs = Date.UTC(to.year, to.month - 1, to.day);
  if (toMs < fromMs) {
    throw new RangeError(`isoDateRange: "${toIso}" is before "${fromIso}"`);
  }
  const count = Math.round((toMs - fromMs) / DAY_MS) + 1;
  if (count > maxDays) {
    throw new RangeError(`isoDateRange: range of ${count} days exceeds the ${maxDays}-day limit`);
  }
  const dates: string[] = [];
  for (let ms = fromMs; ms <= toMs; ms += DAY_MS) {
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
    const day = `${d.getUTCDate()}`.padStart(2, "0");
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}

/**
 * Geometric (refraction free) altitude of the Sun's centre, in degrees. Twilight is
 * defined on the geometric altitude, and that is what `SearchAltitude` searches for.
 */
export function sunAltitudeDeg(date: Date, observer: Observer): number {
  const eq = Equator(Body.Sun, date, observer, true, true);
  return Horizon(date, observer, eq.ra, eq.dec).altitude;
}

/** Apparent altitude of the Moon's centre with refraction: "is the Moon in the sky". */
export function moonAltitudeDeg(date: Date, observer: Observer): number {
  const eq = Equator(Body.Moon, date, observer, true, true);
  return Horizon(date, observer, eq.ra, eq.dec, "normal").altitude;
}

/**
 * How much a Moon-up minute of darkness is still worth, 0..1. Full credit at a new
 * Moon, none from `FAINT_MOON_FRACTION` up, linear ramp in between.
 */
export function faintMoonWeight(illuminationFraction: number): number {
  if (!Number.isFinite(illuminationFraction)) return 0;
  return Math.min(1, Math.max(0, 1 - illuminationFraction / FAINT_MOON_FRACTION));
}

/**
 * The eight classic phase names from the illuminated fraction plus direction.
 * Illumination decides the noun (what an observer sees); the phase angle only
 * decides whether the Moon is waxing (0-180 degrees) or waning.
 */
export function phaseName(phaseAngleDeg: number, illuminationFraction: number): string {
  const angle = ((phaseAngleDeg % 360) + 360) % 360;
  const pct = Math.min(100, Math.max(0, illuminationFraction * 100));
  const waxing = angle < 180;
  if (pct < 2) return "new moon";
  if (pct >= 98) return "full moon";
  if (pct < 45) return waxing ? "waxing crescent" : "waning crescent";
  if (pct <= 55) return waxing ? "first quarter" : "third quarter";
  return waxing ? "waxing gibbous" : "waning gibbous";
}

export function computeNightEphemeris(nightOf: string, site: NightSite): NightEphemeris {
  const observer = new Observer(site.latitude, site.longitude, site.elevationM ?? 0);
  const windowStart = localNoonUtc(nightOf, site);
  const startMs = windowStart.getTime();
  const endMs = startMs + DAY_MS;

  const daysLeft = (from: Date): number => Math.max(0, (endMs - from.getTime()) / DAY_MS);

  const riseSet = (body: Body, direction: number, from: Date): Date | null => {
    const limit = daysLeft(from);
    if (limit <= 0) return null;
    const found = SearchRiseSet(body, observer, direction, from, limit);
    if (!found || found.date.getTime() > endMs) return null;
    return found.date;
  };

  const twilight = (direction: number, from: Date, altitudeDeg: number): Date | null => {
    const limit = daysLeft(from);
    if (limit <= 0) return null;
    const found = SearchAltitude(Body.Sun, observer, direction, from, limit, altitudeDeg);
    if (!found || found.date.getTime() > endMs) return null;
    return found.date;
  };

  const sunset = riseSet(Body.Sun, -1, windowStart);
  const sunrise = riseSet(Body.Sun, +1, sunset ?? windowStart);
  const civilDusk = twilight(-1, windowStart, CIVIL_TWILIGHT_DEG);
  const nauticalDusk = twilight(-1, windowStart, NAUTICAL_TWILIGHT_DEG);
  const astronomicalDusk = twilight(-1, windowStart, ASTRONOMICAL_TWILIGHT_DEG);
  const astronomicalDawn = twilight(+1, astronomicalDusk ?? windowStart, ASTRONOMICAL_TWILIGHT_DEG);
  const nauticalDawn = twilight(
    +1,
    astronomicalDawn ?? astronomicalDusk ?? windowStart,
    NAUTICAL_TWILIGHT_DEG,
  );
  const civilDawn = twilight(
    +1,
    nauticalDawn ?? astronomicalDawn ?? astronomicalDusk ?? windowStart,
    CIVIL_TWILIGHT_DEG,
  );

  let sunStatus: SunStatus = "normal";
  if (!sunset && !sunrise) {
    sunStatus = sunAltitudeDeg(windowStart, observer) > 0 ? "never_sets" : "never_rises";
  }

  let darknessStatus: DarknessStatus;
  let darknessStartMs: number | null = null;
  let darknessEndMs: number | null = null;

  if (astronomicalDusk && astronomicalDawn) {
    darknessStatus = "ok";
    darknessStartMs = astronomicalDusk.getTime();
    darknessEndMs = astronomicalDawn.getTime();
  } else if (!astronomicalDusk && astronomicalDawn) {
    // Darkness was already running at local noon (high latitudes only).
    darknessStatus = "ok";
    darknessStartMs = startMs;
    darknessEndMs = astronomicalDawn.getTime();
  } else if (astronomicalDusk && !astronomicalDawn) {
    darknessStatus = "ok";
    darknessStartMs = astronomicalDusk.getTime();
    darknessEndMs = endMs;
  } else {
    // No boundary inside the window: sample the deepest the Sun gets.
    let maxSunAlt = Number.NEGATIVE_INFINITY;
    for (let t = startMs; t <= endMs; t += SAMPLE_STEP_MS) {
      const alt = sunAltitudeDeg(new Date(t), observer);
      if (alt > maxSunAlt) maxSunAlt = alt;
    }
    if (maxSunAlt < ASTRONOMICAL_TWILIGHT_DEG) {
      darknessStatus = "continuous_darkness";
      darknessStartMs = startMs;
      darknessEndMs = endMs;
    } else {
      darknessStatus = "no_astronomical_darkness";
    }
  }

  const hasDarkness = darknessStartMs !== null && darknessEndMs !== null;
  const moonRise = riseSet(Body.Moon, +1, windowStart);
  const moonSet = riseSet(Body.Moon, -1, windowStart);

  // Illumination is quoted for the moment the observing night begins.
  const illuminationRef = new Date(darknessStartMs ?? sunset?.getTime() ?? startMs + DAY_MS / 2);
  const illuminationFraction = Illumination(Body.Moon, illuminationRef).phase_fraction;
  const illuminationPct = Math.round(illuminationFraction * 100);
  const phaseAngleDeg = MoonPhase(illuminationRef);
  const moonWeight = faintMoonWeight(illuminationFraction);

  const moonFreeIntervals: NightInterval[] = [];
  let moonFreeMs = 0;
  let moonUpMs = 0;
  let altitudeAtMidDarknessDeg: number | null = null;

  if (hasDarkness) {
    const from = darknessStartMs ?? 0;
    const to = darknessEndMs ?? 0;
    altitudeAtMidDarknessDeg = roundTo(moonAltitudeDeg(new Date((from + to) / 2), observer), 2);
    let runStart: number | null = null;
    for (let t = from; t < to; t += SAMPLE_STEP_MS) {
      const sliceMs = Math.min(SAMPLE_STEP_MS, to - t);
      const moonUp = moonAltitudeDeg(new Date(t + sliceMs / 2), observer) >= 0;
      if (moonUp) {
        moonUpMs += sliceMs;
        if (runStart !== null) {
          moonFreeIntervals.push({
            startUtc: new Date(runStart).toISOString(),
            endUtc: new Date(t).toISOString(),
          });
          runStart = null;
        }
      } else {
        moonFreeMs += sliceMs;
        if (runStart === null) runStart = t;
      }
    }
    if (runStart !== null) {
      moonFreeIntervals.push({
        startUtc: new Date(runStart).toISOString(),
        endUtc: new Date(to).toISOString(),
      });
    }
  }

  const darknessMs = hasDarkness ? (darknessEndMs ?? 0) - (darknessStartMs ?? 0) : 0;
  const usableMs = moonFreeMs + moonWeight * moonUpMs;

  const night: NightEphemeris = {
    nightOf,
    windowStartUtc: windowStart.toISOString(),
    windowEndUtc: new Date(endMs).toISOString(),
    sun: {
      status: sunStatus,
      sunsetUtc: sunset?.toISOString() ?? null,
      sunriseUtc: sunrise?.toISOString() ?? null,
      civilDuskUtc: civilDusk?.toISOString() ?? null,
      nauticalDuskUtc: nauticalDusk?.toISOString() ?? null,
      astronomicalDuskUtc: astronomicalDusk?.toISOString() ?? null,
      astronomicalDawnUtc: astronomicalDawn?.toISOString() ?? null,
      nauticalDawnUtc: nauticalDawn?.toISOString() ?? null,
      civilDawnUtc: civilDawn?.toISOString() ?? null,
    },
    darkness: {
      status: darknessStatus,
      startUtc: darknessStartMs === null ? null : new Date(darknessStartMs).toISOString(),
      endUtc: darknessEndMs === null ? null : new Date(darknessEndMs).toISOString(),
      hours: hasDarkness ? roundTo(darknessMs / HOUR_MS, 2) : null,
      moonFreeHours: hasDarkness ? roundTo(moonFreeMs / HOUR_MS, 2) : null,
      moonFreeIntervals,
      usableHours: hasDarkness ? roundTo(usableMs / HOUR_MS, 2) : null,
    },
    moon: {
      illuminationPct,
      illuminationFraction,
      faintMoonWeight: moonWeight,
      phaseName: phaseName(phaseAngleDeg, illuminationFraction),
      phaseAngleDeg: roundTo(phaseAngleDeg, 2),
      riseUtc: moonRise?.toISOString() ?? null,
      setUtc: moonSet?.toISOString() ?? null,
      upDuringDarknessPct:
        hasDarkness && darknessMs > 0 ? Math.round((100 * moonUpMs) / darknessMs) : null,
      altitudeAtMidDarknessDeg,
    },
    explanation: "",
  };

  night.explanation = buildExplanation(night, site);
  return night;
}

function formatLatitude(latitude: number): string {
  return `${Math.abs(latitude).toFixed(2)}°${latitude >= 0 ? "N" : "S"}`;
}

/** Deepest twilight the Sun actually reaches inside the window. */
function deepestTwilight(
  sun: NightEphemeris["sun"],
): "astronomical" | "nautical" | "civil" | "none" {
  if (sun.astronomicalDuskUtc) return "astronomical";
  if (sun.nauticalDuskUtc) return "nautical";
  if (sun.civilDuskUtc) return "civil";
  return "none";
}

function buildExplanation(night: NightEphemeris, site: NightSite): string {
  const where = formatLatitude(site.latitude);
  const when = night.nightOf;
  const { darkness, moon, sun } = night;

  if (darkness.status === "continuous_darkness") {
    const sunClause =
      sun.status === "never_rises" ? "the Sun never rises" : "the Sun stays below the horizon";
    return `Continuous astronomical darkness at ${where} on ${when}: ${sunClause}, and the sky is dark for the whole 24 h window with the Moon ${moon.illuminationPct}% lit.`;
  }

  if (darkness.status === "no_astronomical_darkness") {
    if (sun.status === "never_sets") {
      return `No astronomical darkness at ${where} on ${when}: the Sun never sets.`;
    }
    const reached = deepestTwilight(sun);
    if (reached === "none") {
      return `No astronomical darkness at ${where} on ${when}: the sky never gets darker than daylight in this 24 h window.`;
    }
    return `No astronomical darkness at ${where} on ${when}: the Sun reaches ${reached} twilight but never dips below -18°.`;
  }

  const hours = darkness.hours === null ? "?" : darkness.hours.toFixed(1);
  const moonClause =
    moon.upDuringDarknessPct === null
      ? ""
      : moon.upDuringDarknessPct === 0
        ? `, Moon (${moon.illuminationPct}% lit) below the horizon all night`
        : `, Moon ${moon.illuminationPct}% lit and up for ${moon.upDuringDarknessPct}% of it`;
  return `${hours} h of astronomical darkness at ${where} on ${when}${moonClause}.`;
}

/** Where the Moon sits during the darkness window, in the words a planner would use. */
function moonClause(night: NightEphemeris): string {
  const darkHours = night.darkness.hours ?? 0;
  const moonFreeHours = night.darkness.moonFreeHours ?? 0;
  const usableHours = night.darkness.usableHours ?? 0;
  const moonUpHours = Math.max(0, darkHours - moonFreeHours);

  let where: string;
  if (moonUpHours <= HOUR_EPSILON) {
    where = "below the horizon all night";
  } else if (moonFreeHours <= HOUR_EPSILON) {
    where = "above the horizon all night";
  } else {
    where = `above the horizon for ${moonUpHours.toFixed(1)} of the ${darkHours.toFixed(1)} dark hours`;
  }

  const weight = night.moon.faintMoonWeight;
  if (usableHours <= moonFreeHours + HOUR_EPSILON || weight <= 0) return where;
  return `${where}, and those ${moonUpHours.toFixed(1)} h count at ${Math.round(weight * 100)}% weight because it is faint`;
}

/** Score one already computed night. */
export function scoreNight(night: NightEphemeris): NightScore {
  const { darkness, moon } = night;
  const usableHours = darkness.usableHours;
  const score =
    usableHours === null
      ? 0
      : Math.round(Math.min(MAX_NIGHT_SCORE, POINTS_PER_USABLE_HOUR * usableHours));

  let explanation: string;
  if (darkness.status === "no_astronomical_darkness") {
    explanation = "0 usable hours: no astronomical darkness";
  } else {
    const usable = (usableHours ?? 0).toFixed(1);
    const moonText = `Moon ${moon.illuminationPct}%, ${moonClause(night)}`;
    explanation =
      darkness.status === "continuous_darkness"
        ? `${usable} usable hours of continuous darkness (${moonText})`
        : `${usable} usable dark hours (${moonText})`;
  }

  return {
    nightOf: night.nightOf,
    score,
    darkHours: darkness.hours,
    moonFreeHours: darkness.moonFreeHours,
    usableHours,
    moonIlluminationPct: moon.illuminationPct,
    darknessStatus: darkness.status,
    explanation,
  };
}

/**
 * Scores each date and returns them best first. Ties go to the night with more
 * Moon free darkness, then the fainter Moon, then the earlier date.
 */
export function rankNights(dates: string[], site: NightSite): NightScore[] {
  const scored = dates.map((nightOf) => scoreNight(computeNightEphemeris(nightOf, site)));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const moonFree = (b.moonFreeHours ?? 0) - (a.moonFreeHours ?? 0);
    if (Math.abs(moonFree) > 1e-9) return moonFree;
    if (a.moonIlluminationPct !== b.moonIlluminationPct) {
      return a.moonIlluminationPct - b.moonIlluminationPct;
    }
    return a.nightOf < b.nightOf ? -1 : a.nightOf > b.nightOf ? 1 : 0;
  });
  return scored;
}
