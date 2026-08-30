import { PRIMARY_NAV_ITEMS, RECORD_NAV_ITEMS, isRecordView } from "../src/navigation/navigationModel";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

const primaryViews = PRIMARY_NAV_ITEMS.map((item) => item.view);
const recordViews = RECORD_NAV_ITEMS.map((item) => item.view);
check("NAV-1: primary navigation keeps the observation cycle and Sky", JSON.stringify(primaryViews) === JSON.stringify(["sky", "plan", "observe", "results"]), primaryViews.join(","));
check("NAV-1: record navigation contains history and snapshots", JSON.stringify(recordViews) === JSON.stringify(["history", "snapshots"]), recordViews.join(","));
check("NAV-2: navigation views are unique", new Set([...primaryViews, ...recordViews]).size === 6);
check("NAV-2: record view detection is limited to secondary views", isRecordView("history") && isRecordView("snapshots") && !isRecordView("sky") && !isRecordView("results"));
check("NAV-3: every item has an English label", [...PRIMARY_NAV_ITEMS, ...RECORD_NAV_ITEMS].every((item) => item.label.length > 0));

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll navigation checks passed.");
