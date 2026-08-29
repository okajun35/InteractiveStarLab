export const DEFAULT_GUIDE_TIME_ZONE = "UTC";

export function validateGuideTimeZone(timeZone: string): string {
  if (typeof timeZone !== "string" || timeZone.trim() === "") {
    throw new RangeError("timeZone must be a valid IANA time zone");
  }
  try {
    new Intl.DateTimeFormat(undefined, { timeZone }).format();
  } catch {
    throw new RangeError("timeZone must be a valid IANA time zone");
  }
  return timeZone;
}

export function formatGuideDate(dateTime: string, timeZone: string): string {
  validateGuideTimeZone(timeZone);
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) throw new RangeError("dateTime is invalid");
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatGuideTimeRange(
  dateTime: string,
  durationMinutes: number,
  timeZone: string,
): string {
  validateGuideTimeZone(timeZone);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 180) {
    throw new RangeError("durationMinutes must be an integer from 5 to 180");
  }
  const start = new Date(dateTime);
  if (Number.isNaN(start.getTime())) throw new RangeError("dateTime is invalid");
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  return `${formatter.format(start)}–${formatter.format(end)}`;
}

export function guideEndDateTime(dateTime: string, durationMinutes: number): string {
  const start = new Date(dateTime);
  if (Number.isNaN(start.getTime())) throw new RangeError("dateTime is invalid");
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 180) {
    throw new RangeError("durationMinutes must be an integer from 5 to 180");
  }
  return new Date(start.getTime() + durationMinutes * 60_000).toISOString();
}
