import type { AppView } from "../state/navigation";

export interface NavigationItem {
  /** The view key doubles as the i18n message suffix: `nav.${view}`. */
  readonly view: AppView;
}

/** The four views needed for the primary observation workflow. */
export const PRIMARY_NAV_ITEMS: readonly NavigationItem[] = [
  { view: "sky" },
  { view: "plan" },
  { view: "observe" },
  { view: "results" },
];

/** Supporting views kept behind the Records menu to reduce header density. */
export const RECORD_NAV_ITEMS: readonly NavigationItem[] = [
  { view: "history" },
  { view: "snapshots" },
];

export function isRecordView(view: AppView): boolean {
  return RECORD_NAV_ITEMS.some((item) => item.view === view);
}
