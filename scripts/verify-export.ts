/**
 * Verification: deterministic ICS/CSV mission export — RFC-style line endings,
 * text escaping, fixed calendar stamps, and safe handling of edge data.
 *
 * Run with: node scripts/run-verify.cjs verify-export.ts
 */
import {
  missionRecordToCsv,
  missionTargetsToCsv,
  missionToIcs,
} from "../src/export/missionExport";
import type { ObservationMission, ObservationRecord } from "../src/types/observation";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL  ${name}  ${detail}`);
}

const mission: ObservationMission = {
  id: "mission-ics-1",
  siteId: "tokyo",
  siteSnapshot: {
    id: "tokyo",
    name: "Tokyo, Shinjuku",
    latitude: 35.6812,
    longitude: 139.7671,
  },
  dateTime: "2026-08-27T12:00:00.000Z",
  maxMagnitude: 3,
  createdAt: "2026-08-01T00:00:00.000Z",
  targets: [
    { starId: "vega", predictedVisible: true, predictedAltitude: 60.5, predictedAzimuth: 250.2, predictedMagnitude: 0.03 },
    { starId: "altair", predictedVisible: true, predictedAltitude: 50.1, predictedAzimuth: 220.8, predictedMagnitude: 0.77 },
  ],
};

// ---- ICS -------------------------------------------------------------------------
{
  const ics = missionToIcs(mission);
  check("ics: uses CRLF line endings", ics.includes("\r\n") && !ics.includes("\n\n"));
  check("ics: wraps a VEVENT", ics.includes("BEGIN:VCALENDAR") && ics.includes("BEGIN:VEVENT"));
  check(
    "ics: UTC DTSTART in iCal format",
    ics.includes("DTSTART:20260827T120000Z"),
    ics.split("\r\n").find((l) => l.startsWith("DTSTART")),
  );
  check(
    "ics: deterministic DTSTAMP from createdAt, not the clock",
    ics.includes("DTSTAMP:20260801T000000Z"),
  );
  check(
    "ics: UID derives from the mission id",
    ics.includes("UID:mission-ics-1@interactive-star-lab"),
  );
  check(
    "ics: site name comma is escaped in SUMMARY",
    ics.includes("Tokyo\\, Shinjuku"),
    ics.split("\r\n").find((l) => l.startsWith("SUMMARY")),
  );
  check(
    "ics: GEO carries site coordinates",
    ics.includes("GEO:35.6812;139.7671"),
  );
  check(
    "ics: target names appear in DESCRIPTION",
    ics.includes("vega") && ics.includes("altair"),
  );
  check(
    "ics: event ends two hours after the observation starts",
    ics.includes("DTEND:20260827T140000Z"),
  );

  // Long lines must be folded at 75 octets per RFC 5545.
  const longMission = {
    ...mission,
    siteSnapshot: { ...mission.siteSnapshot, name: "A".repeat(120) },
  };
  const longIcs = missionToIcs(longMission);
  check(
    "ics: long lines are folded at <=75 chars",
    longIcs.split("\r\n").every((line) => line.length <= 75),
  );
  check(
    "ics: continuation lines start with a space",
    longIcs.split("\r\n").some((line) => line.startsWith(" ")),
  );

  const empty = missionToIcs({ ...mission, targets: [] });
  check("ics: zero targets still produces a valid event", empty.includes("BEGIN:VEVENT"));
}

// ---- CSV --------------------------------------------------------------------------
{
  const csv = missionTargetsToCsv(mission);
  const rows = csv.trimEnd().split("\r\n");
  check(
    "csv: header lists target fields",
    rows[0] === "starId,predictedVisible,predictedAltitude,predictedAzimuth,predictedMagnitude",
    rows[0],
  );
  check("csv: one row per target", rows.length === 3);
  check("csv: preserves fixed prediction values", rows[1].startsWith("vega,true,60.5,250.2,0.03"));

  const record: ObservationRecord = {
    missionId: mission.id,
    siteId: mission.siteId,
    siteSnapshot: mission.siteSnapshot,
    dateTime: mission.dateTime,
    targets: mission.targets,
    results: [
      { starId: "vega", status: "visible" },
      { starId: "altair", status: "not_visible" },
    ],
    completedAt: "2026-08-28T00:00:00.000Z",
  };
  const recordCsv = missionRecordToCsv(record);
  const recordRows = recordCsv.trimEnd().split("\r\n");
  check(
    "csv: record export includes observation status",
    recordRows[0].includes("status") && recordRows[1].endsWith("visible"),
    recordRows[0],
  );
  check(
    "csv: record rows keep prediction snapshot columns",
    recordRows[0].includes("predictedAltitude") && recordRows[1].includes("60.5"),
  );
  check(
    "csv: unmatched results are tolerated",
    missionRecordToCsv({ ...record, results: [{ starId: "unknown", status: "visible" }] })
      .trimEnd().split("\r\n").length === 3,
  );
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll export checks passed.");
