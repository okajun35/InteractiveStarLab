import { createObservationMission } from "../src/observation/mission";
import { createSupabaseMissionRepository } from "../src/cloud/missionRepository";
import type { ObservationRecord } from "../src/types/observation";

type Row = Record<string, any>;

class FakeQuery {
  private operation: "select" | "insert" | "update" = "select";
  private payload: Row | null = null;
  private id: string | null = null;
  private requireNullSnapshot = false;

  constructor(private readonly rows: Row[]) {}
  insert(payload: Row) { this.operation = "insert"; this.payload = payload; return this; }
  update(payload: Row) { this.operation = "update"; this.payload = payload; return this; }
  select(_columns?: string) { return this; }
  eq(_column: string, value: string) { this.id = value; return this; }
  is(_column: string, value: null) { this.requireNullSnapshot = value === null; return this; }
  order(_column: string, _options: { ascending: boolean }) { return this; }
  async single(): Promise<{ data: Row | null; error: null | { message: string } }> { return this.run(true); }
  async maybeSingle(): Promise<{ data: Row | null; error: null | { message: string } }> { return this.run(false); }
  then<TResult1 = { data: Row[] | null; error: null | { message: string } }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: null | { message: string } }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> { return this.runList().then(onfulfilled, onrejected); }
  private async run(single: boolean) {
    if (this.operation === "insert" && this.payload !== null) {
      const row = { ...this.payload, created_at: "2026-08-29T11:01:00.000Z", updated_at: "2026-08-29T11:01:00.000Z" };
      this.rows.push(row);
      return { data: row, error: null };
    }
    const matches = this.rows.filter((row) => (this.id === null || row.id === this.id) && (!this.requireNullSnapshot || row.sky_snapshot === null));
    if (this.operation === "update" && this.payload !== null) {
      if (matches.length === 0) return { data: null, error: { message: "no matching row" } };
      Object.assign(matches[0], this.payload);
      return { data: matches[0], error: null };
    }
    if (single && matches.length === 0) return { data: null, error: { message: "not found" } };
    return { data: matches[0] ?? null, error: null };
  }
  private async runList() {
    return { data: this.rows.slice().sort((a, b) => Date.parse(b.planned_at) - Date.parse(a.planned_at)), error: null };
  }
}

class FakeSupabase {
  public readonly rpcCalls: string[] = [];
  public readonly recoveryCode = "ISL-ABCD-1234-EF56-7890-ABCD-1234-EF56-7890";
  constructor(public readonly rows: Row[] = []) {}
  from(_table: string) { return new FakeQuery(this.rows); }
  async rpc(name: string, args: Row) {
    this.rpcCalls.push(name);
    if (name === "create_observation_mission_with_recovery") {
      const row = {
        id: args.p_id,
        user_id: "user-1",
        planned_at: args.p_planned_at,
        mission: args.p_mission,
        record: null,
        sky_snapshot: null,
        guide: null,
        created_at: "2026-08-29T11:01:00.000Z",
        updated_at: "2026-08-29T11:01:00.000Z",
      };
      this.rows.push(row);
      return { data: { ...row, recovery_code: this.recoveryCode }, error: null };
    }
    if (name === "restore_observation_mission") {
      return args.p_recovery_code === this.recoveryCode
        ? { data: this.rows[0]?.id ?? null, error: null }
        : { data: null, error: { code: "RESTORE_CODE_INVALID", message: "RESTORE_CODE_INVALID" } };
    }
    return { data: null, error: { message: `unexpected rpc: ${name}` } };
  }
}

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

const mission = createObservationMission({
  site: { id: "home", name: "Home", latitude: 35.68, longitude: 139.76 },
  dateTime: "2026-08-29T11:00:00.000Z",
  maxMagnitude: 2,
  targets: [{ starId: "vega", predictedVisible: true, predictedAltitude: 62, predictedAzimuth: 285, predictedMagnitude: 0.03 }],
}, { id: () => "mission-repo-1", now: new Date("2026-08-29T11:01:00.000Z") });
const fake = new FakeSupabase();
const repository = createSupabaseMissionRepository(fake as any, () => "user-1");
const created = await repository.createMission(mission);
check("CLOUD-REPO-1: create returns Mission", created.mission.id === mission.id);
check("CLOUD-REPO-1: create returns a one-time recovery code", created.recoveryCode === fake.recoveryCode);
check("CLOUD-REPO-1: create uses the RPC boundary", fake.rpcCalls[0] === "create_observation_mission_with_recovery");
check("CLOUD-REPO-1: create preserves fixed altitude", created.mission.targets[0]?.predictedAltitude === 62);
check("CLOUD-REPO-1: create starts without record", created.record === null);
check("CLOUD-REPO-1: recovery code is not persisted in the Mission row", !JSON.stringify(fake.rows).includes(fake.recoveryCode));
check("CLOUD-REPO-2: list returns saved Mission", (await repository.listMissions()).length === 1);
check("CLOUD-REPO-2: get returns saved Mission", (await repository.getMission(mission.id))?.mission.id === mission.id);
check("CLOUD-REPO-2: restore RPC returns the Mission", (await repository.restoreMission(fake.recoveryCode))?.mission.id === mission.id);
try {
  await repository.restoreMission("ISL-0000-0000-0000-0000-0000-0000-0000-0000");
  check("CLOUD-REPO-2: invalid recovery code is structured", false);
} catch (error) {
  check("CLOUD-REPO-2: invalid recovery code is structured", error instanceof Error && error.name === "CloudApplicationError");
}

const record: ObservationRecord = {
  missionId: mission.id,
  siteId: mission.siteId,
  siteSnapshot: { ...mission.siteSnapshot },
  dateTime: mission.dateTime,
  targets: mission.targets.map((target) => ({ ...target })),
  results: [{ starId: "vega", status: "visible" }],
  completedAt: "2026-08-29T12:00:00.000Z",
};
const saved = await repository.saveRecord(mission.id, record);
check("CLOUD-REPO-3: result save returns record", saved.record?.results[0]?.status === "visible");
const reference = { snapshotId: "snapshot-1", missionId: mission.id, storagePath: "user-1/mission-repo-1/snapshot-1.png" };
const linked = await repository.attachSnapshot(mission.id, reference);
check("CLOUD-REPO-4: Snapshot reference is linked", (linked.skySnapshot as typeof reference).storagePath === reference.storagePath);
try {
  await repository.attachSnapshot(mission.id, reference);
  check("CLOUD-REPO-4: duplicate Snapshot is rejected", false);
} catch (error) {
  check("CLOUD-REPO-4: duplicate Snapshot is rejected", error instanceof Error && error.name === "CloudApplicationError");
}

const unauthenticated = createSupabaseMissionRepository(fake as any, () => null);
try {
  await unauthenticated.listMissions();
  check("CLOUD-REPO-5: unauthenticated access is rejected", false);
} catch (error) {
  check("CLOUD-REPO-5: unauthenticated access is rejected", error instanceof Error && error.name === "CloudApplicationError");
}

if (failures > 0) process.exit(1);
console.log("\nAll cloud Repository checks passed.");
