import {
  buildObservationCandidates,
} from "../src/observation/candidates";
import {
  createObservationMission,
  targetFromCandidate,
} from "../src/observation/mission";
import { compareObservationRecord } from "../src/observation/comparison";
import {
  reconcileSelection,
  toggleTargetSelection,
} from "../src/observation/selection";
import {
  buildObservationResults,
  countCompletedResults,
} from "../src/observation/results";
import {
  findObservationRecord,
  sortObservationRecords,
} from "../src/observation/history";
import {
  DEFAULT_OBSERVATION_STATE,
  loadObservationState,
  saveObservationState,
  type StorageLike,
} from "../src/observation/storage";
import type {
  ObservationCandidate,
  ObservationRecord,
  ObservationSite,
} from "../src/types/observation";

let failures = 0;

function check(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!condition) failures += 1;
}

function expectThrow(name: string, action: () => void): void {
  try {
    action();
    check(name, false, "expected an exception");
  } catch {
    check(name, true);
  }
}

const site: ObservationSite = {
  id: "home",
  name: "Home",
  latitude: 35.6812,
  longitude: 139.7671,
};

const stars = [
  {
    id: "vega",
    name: "Vega",
    magnitude: 0.03,
    ra: 18.6156,
    dec: 38.7837,
    altitude: 62,
    azimuth: 285,
  },
  {
    id: "altair",
    name: "Altair",
    magnitude: 0.77,
    ra: 19.8464,
    dec: 8.8683,
    altitude: 48,
    azimuth: 160,
  },
  {
    id: "deneb",
    name: "Deneb",
    magnitude: 1.25,
    ra: 20.6905,
    dec: 45.2803,
    altitude: 41,
    azimuth: 320,
  },
  {
    id: "boundary",
    name: "Boundary Star",
    magnitude: 2,
    ra: 21,
    dec: 21,
    altitude: 20,
    azimuth: 10,
  },
  {
    id: "horizon",
    name: "Horizon Star",
    magnitude: 1,
    ra: 1,
    dec: 1,
    altitude: 0,
    azimuth: 90,
  },
  {
    id: "below",
    name: "Below Horizon",
    magnitude: 0.5,
    ra: 2,
    dec: 2,
    altitude: -1,
    azimuth: 90,
  },
  {
    id: "faint",
    name: "Faint Star",
    magnitude: 2.01,
    ra: 3,
    dec: 3,
    altitude: 70,
    azimuth: 90,
  },
];

const candidates = buildObservationCandidates({
  horizontalStars: stars,
  maxMagnitude: 2,
});

check("candidate requires altitude > 0", candidates.every((star) => star.altitude > 0));
check("candidate includes exact magnitude boundary", candidates.some((star) => star.starId === "deneb"));
check("candidate excludes magnitude above limit", !candidates.some((star) => star.starId === "faint"));
check("candidate excludes altitude 0", !candidates.some((star) => star.starId === "horizon"));
check("candidate excludes below-horizon star", !candidates.some((star) => star.starId === "below"));
check(
  "candidate sort is magnitude then altitude",
  candidates.map((star) => star.starId).join(",") === "vega,altair,deneb,boundary",
  candidates.map((star) => star.starId).join(","),
);

const fixedNow = new Date("2026-08-29T13:00:00.000Z");
const selected = candidates.slice(0, 3);
const mission = createObservationMission(
  {
    site,
    dateTime: fixedNow.toISOString(),
    maxMagnitude: 2,
    targets: selected.map(targetFromCandidate),
  },
  { id: () => "mission-1", now: fixedNow },
);

check("mission has a stable id", mission.id === "mission-1");
check("mission keeps site snapshot", mission.siteSnapshot.name === "Home");
check("mission keeps predicted altitude", mission.targets[0].predictedAltitude === 62);
check("mission keeps predicted azimuth", mission.targets[0].predictedAzimuth === 285);
check("mission keeps predicted visibility", mission.targets.every((target) => target.predictedVisible));
check("mission records creation time", mission.createdAt === fixedNow.toISOString());

const mutableCandidate: ObservationCandidate = { ...selected[0] };
const clonedMission = createObservationMission(
  {
    site,
    dateTime: fixedNow.toISOString(),
    maxMagnitude: 2,
    targets: [targetFromCandidate(mutableCandidate)],
  },
  { id: () => "mission-clone", now: fixedNow },
);
mutableCandidate.altitude = 1;
check(
  "mission clones predicted values",
  clonedMission.targets[0].predictedAltitude === 62,
);

expectThrow("mission rejects zero targets", () =>
  createObservationMission(
    {
      site,
      dateTime: fixedNow.toISOString(),
      maxMagnitude: 2,
      targets: [],
    },
    { id: () => "empty", now: fixedNow },
  ),
);
expectThrow("mission rejects more than five targets", () =>
  createObservationMission(
    {
      site,
      dateTime: fixedNow.toISOString(),
      maxMagnitude: 2,
      targets: Array.from({ length: 6 }, (_, index) => ({
        ...mission.targets[0],
        starId: `star-${index}`,
      })),
    },
    { id: () => "too-many", now: fixedNow },
  ),
);
expectThrow("mission rejects duplicate targets", () =>
  createObservationMission(
    {
      site,
      dateTime: fixedNow.toISOString(),
      maxMagnitude: 2,
      targets: [mission.targets[0], mission.targets[0]],
    },
    { id: () => "duplicate", now: fixedNow },
  ),
);

const record: ObservationRecord = {
  missionId: mission.id,
  siteId: mission.siteId,
  siteSnapshot: mission.siteSnapshot,
  dateTime: mission.dateTime,
  targets: mission.targets,
  results: [
    { starId: "vega", status: "visible" },
    { starId: "altair", status: "not_visible" },
    { starId: "deneb", status: "unsure" },
  ],
  completedAt: fixedNow.toISOString(),
};
const comparison = compareObservationRecord(record);
check("comparison predicted count", comparison.predicted === 3);
check("comparison visible count", comparison.visible === 1);
check("comparison not-visible count", comparison.notVisible === 1);
check("comparison unsure count", comparison.unsure === 1);

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const storage = new MemoryStorage();
const persisted = {
  version: 1 as const,
  activeSite: site,
  missions: [mission],
  records: [record],
};
check("storage save succeeds", saveObservationState(persisted, storage));
const loaded = loadObservationState(storage);
check("storage round-trip keeps mission", loaded.missions[0]?.id === mission.id);
check("storage round-trip keeps record", loaded.records[0]?.missionId === mission.id);
check("storage round-trip keeps ISO date", loaded.missions[0]?.dateTime === fixedNow.toISOString());

storage.setItem("star-view.observation.v1", "{broken json");
const corrupted = loadObservationState(storage);
check("corrupt JSON falls back safely", corrupted.missions.length === 0);
check("corrupt JSON keeps default site", corrupted.activeSite.id === DEFAULT_OBSERVATION_STATE.activeSite.id);

storage.setItem(
  "star-view.observation.v1",
  JSON.stringify({ version: 99, activeSite: site, missions: [], records: [] }),
);
const invalidVersion = loadObservationState(storage);
check("invalid version falls back safely", invalidVersion.missions.length === 0);

const selectableIds = ["vega", "altair", "deneb", "boundary", "horizon"];
let selectedIds: string[] = [];
selectedIds = toggleTargetSelection(selectedIds, "vega");
check("selection adds a target", selectedIds.join(",") === "vega");
selectedIds = toggleTargetSelection(selectedIds, "altair");
check("selection adds a second target", selectedIds.join(",") === "vega,altair");
selectedIds = toggleTargetSelection(selectedIds, "vega");
check("selection toggles a target off", selectedIds.join(",") === "altair");
selectedIds = ["vega", "altair", "deneb", "boundary", "horizon"];
check(
  "selection refuses a sixth target",
  toggleTargetSelection(selectedIds, "sixth").join(",") === selectableIds.join(","),
);
check(
  "selection reconciliation removes stale ids",
  reconcileSelection(["vega", "missing", "altair"], ["vega", "altair"]).join(",") === "vega,altair",
);

const draftResults = {
  vega: "visible" as const,
  altair: "not_visible" as const,
};
check("result completion counts only target stars", countCompletedResults(mission.targets, draftResults) === 2);
check(
  "incomplete result set cannot be built",
  buildObservationResults(mission.targets, draftResults) === null,
);
const completeResults = buildObservationResults(mission.targets, {
  ...draftResults,
  deneb: "unsure" as const,
});
check("complete result set preserves target order", completeResults?.map((result) => result.starId).join(",") === "vega,altair,deneb");
check("complete result set preserves statuses", completeResults?.map((result) => result.status).join(",") === "visible,not_visible,unsure");

const newerRecord: ObservationRecord = {
  ...record,
  missionId: "mission-2",
  completedAt: "2026-08-30T13:00:00.000Z",
};
const sortedRecords = sortObservationRecords([record, newerRecord]);
check("history sorts newest records first", sortedRecords.map((item) => item.missionId).join(",") === "mission-2,mission-1");
check("history search finds a record by mission id", findObservationRecord(sortedRecords, "mission-1")?.missionId === "mission-1");
check("history search returns null for an unknown id", findObservationRecord(sortedRecords, "missing") === null);

if (failures > 0) {
  console.log(`\n${failures} observation-flow check(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log("\nAll observation-flow checks passed");
}
