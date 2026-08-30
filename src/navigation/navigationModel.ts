import type { AppView } from "../state/navigation";

export interface NavigationItem {
  readonly view: AppView;
  readonly label: string;
}

/** The four views needed for the primary observation workflow. */
export const PRIMARY_NAV_ITEMS: readonly NavigationItem[] = [
  { view: "sky", label: "Sky" },
  { view: "plan", label: "Plan" },
  { view: "observe", label: "Observe" },
  { view: "results", label: "Results" },
];

/** Supporting views kept behind the Records menu to reduce header density. */
export const RECORD_NAV_ITEMS: readonly NavigationItem[] = [
  { view: "history", label: "History" },
  { view: "snapshots", label: "Snapshots" },
];

export function isRecordView(view: AppView): boolean {
  return RECORD_NAV_ITEMS.some((item) => item.view === view);
}
