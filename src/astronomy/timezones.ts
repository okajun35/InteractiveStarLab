import type { PlacePreset } from "./directions";

export type TimeBasis = "same-local-time" | "same-utc-instant";

export const TIME_BASIS_LABELS: Record<TimeBasis, string> = {
  "same-local-time": "Same Local Time",
  "same-utc-instant": "Same UTC",
};

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || timeZone.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function validateTimeZone(timeZone: string): string {
  if (!isValidTimeZone(timeZone)) throw new RangeError("timeZone must be a valid IANA time zone");
  return timeZone;
}

export function formatDateTimeInZone(
  date: Date,
  timeZone: string,
  includeTimeZoneName = true,
): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(includeTimeZoneName ? { timeZoneName: "short" as const } : {}),
  };
  return new Intl.DateTimeFormat("en-US", options).format(date);
}

function wallClockParts(date: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
  );
}

function localWallAsUtc(date: Date, timeZone: string): number {
  const p = wallClockParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, date.getMilliseconds());
}

function sameWallClockInstant(
  date: Date,
  from: PlacePreset,
  to: PlacePreset,
): Date {
  const wallUtc = localWallAsUtc(date, from.timeZone);
  const targetWall = new Date(wallUtc);
  const targetUtcGuess = localWallAsUtc(targetWall, to.timeZone);
  const offset = targetUtcGuess - targetWall.getTime();
  return new Date(wallUtc - offset);
}

export function sameLocalTimeInstant(
  date: Date,
  from: PlacePreset,
  to: PlacePreset,
): Date {
  return sameWallClockInstant(date, from, to);
}

export function sameUtcInstant(date: Date, _place: PlacePreset): Date {
  return new Date(date.getTime());
}

export function localTimeOf(date: Date, place: PlacePreset): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: place.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
