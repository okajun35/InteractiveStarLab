/**
 * Deterministic mission export: ICS calendar events and CSV tables. Pure and
 * stable — the same mission always produces byte-identical output, so exports
 * can be diffed and verified.
 *
 * - ICS: one VEVENT per mission, DTSTAMP taken from `createdAt` (never the
 *   clock), CRLF endings, RFC 5545 line folding at 75 octets.
 * - CSV: one header + one row per target; the record export joins stored
 *   observation statuses onto the fixed prediction snapshot.
 */
import type { ObservationMission, ObservationRecord } from "../types/observation";

const CRLF = "\r\n";
const EVENT_DURATION_MS = 2 * 60 * 60_000;
const FOLD_LIMIT = 75;

function utcStamp(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Folds a content line at 75 characters; continuations begin with a space. */
function foldLine(line: string): string {
  if (line.length <= FOLD_LIMIT) return line;
  const parts: string[] = [line.slice(0, FOLD_LIMIT)];
  let rest = line.slice(FOLD_LIMIT);
  // Continuation lines lose one char to the leading space.
  while (rest.length > FOLD_LIMIT - 1) {
    parts.push(` ${rest.slice(0, FOLD_LIMIT - 1)}`);
    rest = rest.slice(FOLD_LIMIT - 1);
  }
  if (rest.length > 0) parts.push(` ${rest}`);
  return parts.join(CRLF);
}

export function missionToIcs(mission: ObservationMission): string {
  const start = new Date(mission.dateTime);
  const end = new Date(start.getTime() + EVENT_DURATION_MS);
  const site = mission.siteSnapshot;
  const description = [
    `Observation mission for ${mission.targets.length} target(s) ` +
      `at ${site.name} (${site.latitude}, ${site.longitude}).`,
    `Limiting magnitude <= ${mission.maxMagnitude}.`,
    ...mission.targets.map(
      (target) =>
        `${target.starId}: alt ${target.predictedAltitude} deg, az ${target.predictedAzimuth} deg, mag ${target.predictedMagnitude}`,
    ),
  ].join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Interactive Star Lab//Mission Export//EN",
    "BEGIN:VEVENT",
    `UID:${escapeText(mission.id)}@interactive-star-lab`,
    `DTSTAMP:${utcStamp(mission.createdAt)}`,
    `DTSTART:${utcStamp(mission.dateTime)}`,
    `DTEND:${utcStamp(end.toISOString())}`,
    `SUMMARY:Star observation: ${escapeText(site.name)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `GEO:${site.latitude};${site.longitude}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}

function csvCell(value: string | number | boolean): string {
  const text = `${value}`;
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(cells: readonly (string | number | boolean)[]): string {
  return cells.map(csvCell).join(",");
}

export function missionTargetsToCsv(mission: ObservationMission): string {
  const rows = [
    "starId,predictedVisible,predictedAltitude,predictedAzimuth,predictedMagnitude",
    ...mission.targets.map((target) =>
      csvRow([
        target.starId,
        target.predictedVisible,
        target.predictedAltitude,
        target.predictedAzimuth,
        target.predictedMagnitude,
      ]),
    ),
  ];
  return rows.join(CRLF) + CRLF;
}

export function missionRecordToCsv(record: ObservationRecord): string {
  const statusById = new Map(record.results.map((result) => [result.starId, result.status]));
  const rows = [
    "starId,predictedVisible,predictedAltitude,predictedAzimuth,predictedMagnitude,status",
    ...record.targets.map((target) =>
      csvRow([
        target.starId,
        target.predictedVisible,
        target.predictedAltitude,
        target.predictedAzimuth,
        target.predictedMagnitude,
        statusById.get(target.starId) ?? "",
      ]),
    ),
  ];
  return rows.join(CRLF) + CRLF;
}
