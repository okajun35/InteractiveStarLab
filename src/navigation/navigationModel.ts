import type { AppView } from "../state/navigation";

export interface NavigationItem {
  readonly view: AppView;
  readonly english: string;
  readonly japanese: string;
}

/** The four views needed for the primary observation workflow. */
export const PRIMARY_NAV_ITEMS: readonly NavigationItem[] = [
  { view: "sky", english: "Sky", japanese: "星空" },
  { view: "plan", english: "Plan", japanese: "計画" },
  { view: "observe", english: "Observe", japanese: "観測" },
  { view: "results", english: "Results", japanese: "結果" },
];

/** Supporting views kept behind the Records menu to reduce header density. */
export const RECORD_NAV_ITEMS: readonly NavigationItem[] = [
  { view: "history", english: "History", japanese: "履歴" },
  { view: "snapshots", english: "Snapshots", japanese: "保存画像" },
];

export function isRecordView(view: AppView): boolean {
  return RECORD_NAV_ITEMS.some((item) => item.view === view);
}
