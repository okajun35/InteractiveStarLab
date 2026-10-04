/**
 * English message dictionary — the source of truth for i18n keys.
 * `ja.ts` is typed as `typeof en`, so a missing or extra key is a compile error.
 */
export const en = {
  "app.title": "Interactive Star Lab",
  "app.tagline": "Explore the sky",
  "app.taglineHint": "Change the conditions and observe",
  "nav.sky": "Sky",
  "nav.plan": "Plan",
  "nav.observe": "Observe",
  "nav.results": "Results",
  "nav.records": "Records",
  "nav.history": "History",
  "nav.snapshots": "Snapshots",
  "nav.guide": "Guide",
  "sky.mode.group": "Sky view mode",
  "sky.mode.window": "Window",
  "sky.mode.allSky": "All sky",
  "share.button": "Share",
  "share.copied": "Copied!",
  "share.prompt": "Copy this link:",
  "agent.panel.title": "Activity",
  "agent.panel.eyebrow": "Agent",
  "agent.manual": "Manual",
  "agent.close": "Close agent activity panel",
  "agent.reopen": "Show agent activity panel",
  "agent.openManual": "Open manual controls",
  "harness.toggle": "Agent harness",
  "harness.run": "Run tool",
  "harness.running": "Running…",
  "harness.tool": "Tool",
  "harness.input": "Input JSON",
  "lang.group": "Language",
  "lang.english": "English",
  "lang.japanese": "Japanese",
} as const;

export type MessageKey = keyof typeof en;
