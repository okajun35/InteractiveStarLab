# WebMCP-first Sky Workspace UX specification

- Status: Ready for implementation
- Implementation owner: Luna
- Specification date: 2026-09-01

Scope: Sky workspace. The companion Plan specification is in [`webmcp-first-plan-ux-spec.md`](webmcp-first-plan-ux-spec.md).

## 1. Decision

The Sky workspace will use a WebMCP-first, human-correctable interaction model.

- WebMCP tools remain available in both Sky presentations.
- The default Sky presentation is **Agent-assisted**: the star canvas fills the available workspace and Agent Activity floats above it.
- **Manual** is an alternate presentation that restores the existing human-control sidebar.
- Both WebMCP tools and manual controls continue to operate on the same application state.
- A successful WebMCP mutation is visibly attributed and its changed fields are temporarily highlighted.
- Manual controls remain a one-click fallback when WebMCP is unavailable, produces an unwanted result, or is not being used.

The presentation switch changes layout, not application state or permissions. Do not create separate "WebMCP state" and "manual state," and do not disable WebMCP when Manual is selected.

## 2. Product intent

The primary experience should communicate this relationship immediately:

```text
User request in an agent
        ↓
WebMCP changes structured application state
        ↓
Agent Activity explains what changed
        ↓
The human-facing sky renders the result
```

The user should be able to see the sky first and understand the latest agent change without opening a second application. If correction or exploration is needed, **Manual** restores the existing controls.

## 3. Goals

1. Make WebMCP-driven state changes obvious during a short demonstration.
2. Let a user verify the exact observation, visibility, and display state at a glance.
3. Preserve the application as a useful standalone web app.
4. Provide a manual recovery path without duplicating state or behavior.
5. Preserve all existing astronomy, Mission, Snapshot, Guide, and cloud behavior.
6. Keep WebMCP tool contracts deterministic and independent from the presentation change.

## 4. Non-goals

This change must not:

- embed a chat interface in the application;
- introduce a second copy of Sky state;
- add a permission switch such as Read-only/Edit;
- remove any existing manual control, experiment, comparison, or educational explanation;
- add an overlapping all-in-one WebMCP tool;
- change existing WebMCP tool names, required parameters, results, or annotations; the optional site `timeZone` extension is defined by the companion Plan specification;
- add application-level confirmation dialogs for low-risk Sky display changes;
- add Undo in this increment;
- persist presentation selection or WebMCP activity across a full page reload;
- infer a time zone for arbitrary coordinates or add a geocoding dependency;
- change Mission targets or creation-time prediction snapshots when the live Sky changes;
- expose raw WebMCP errors, registered tool lists, or internal diagnostics in the end-user UI.

## 5. Terminology and labels

Use these exact user-facing labels:

| Concept | Label |
| --- | --- |
| Agent presentation | `Agent-assisted` |
| Manual presentation | `Manual` |
| Activity window title | `Agent Activity` |
| WebMCP available | `WebMCP ready` |
| WebMCP detection in progress | `Checking WebMCP…` |
| WebMCP unavailable | `WebMCP unavailable` |
| WebMCP registration failure | `WebMCP unavailable` |
| Last mutation attribution | `Updated via WebMCP` |

Do not label the presentation as "Read-only mode." WebMCP can mutate the shared state in either presentation.

## 6. Information architecture

The Sky workspace has two presentation layouts:

```text
Agent-assisted
├── Full-size Star Sky
├── Agent Activity (small floating window on the left)
│   ├── WebMCP availability badge
│   ├── current observation state
│   └── latest WebMCP activity summary
└── Object Info overlay

Manual
├── Existing human-control sidebar
    ├── ObservationPanel
    ├── MagnitudeLayers
    ├── EnvironmentPanel
    ├── ExperimentPanel
    └── ComparePanel
├── Full-size Star Sky
└── Existing Object Info footer
```

The existing components remain the source of manual functionality. Refactor composition as needed, but do not reimplement their controls inside Agent Activity.

### 6.1 Initial and navigation behavior

- Sky opens in **Agent-assisted** presentation on a full page load.
- The selected presentation survives navigation away from and back to Sky within the current SPA session.
- Presentation state is not stored in LocalStorage, IndexedDB, Supabase, or the URL.
- Agent Activity provides a `Manual` action. Manual provides an `Agent-assisted` action.
- Switching presentation does not reset or copy observation, simulation, display, comparison, selection, or activity state.
- Manual edits take effect immediately. There is no Save or Apply button.
- Agent Activity is a floating overlay in Agent-assisted presentation and does not reserve a fixed sidebar column.

### 6.2 WebMCP unavailable behavior

Agent-assisted presentation remains available when `document.modelContext` is unavailable. Show:

```text
WebMCP unavailable
Manual controls are still available.
```

`Manual` remains enabled and prominent. Do not show technical error details.

## 7. Live Observation Context fields

Agent Activity shows a compact, dynamic selection of fields writable by `set_observation_site`, `set_sky_view_settings`, or `set_sky_display_settings`. The fields affected by the latest agent action take priority; the complete set remains available through Manual controls. `Visible Stars` and compare counts are derived outputs.

### 7.1 Observation Context

| Row | State source | Required format |
| --- | --- | --- |
| Location | Derived from observation coordinates and `activeSite` | Preset name, active-site name, or `Custom location` |
| Coordinates | `ObservationSettings.latitude`, `.longitude` | `-33.8688, 151.2093` with four decimal places |
| Date & Time | `ObservationSettings.datetime` | `Sep 1, 2026, 20:00 AEST` for a known preset; see time-zone rules |
| Direction | `ObservationSettings.azimuth` | `South / 180°` using an eight-point compass label |
| Altitude | `ObservationSettings.altitude` | Rounded whole degrees, for example `30°` |
| Field of View | `ObservationSettings.fieldOfView` | Rounded whole degrees, for example `80°` |
| Visible Stars | current rendered `SkyScene` | Whole number; use `—` until scene metrics are available |

Location resolution order is fixed:

1. If the current observation coordinates match a `PLACE_PRESETS` entry within `1e-6`, use that preset name and time zone.
2. Otherwise, if the coordinates match `activeSite` within `1e-6`, use `activeSite.name`.
3. Otherwise, use `Custom location`.

Time-zone formatting is fixed:

1. For coordinates matching a preset, format in that preset's IANA time zone and include the short zone name.
2. Otherwise, if the coordinates match `activeSite` and it has a valid optional `timeZone`, use that IANA time zone.
3. For all other coordinates, format in the browser's local time zone and append `Browser time` visibly. Do not imply that browser time is local to the observation coordinates.
4. Use English month names and a 24-hour clock.
5. The underlying `Date` remains an absolute instant; formatting must not mutate it.

Direction labels use these boundaries, normalized to `[0, 360)`:

| Range center | Label |
| --- | --- |
| 0° | North |
| 45° | Northeast |
| 90° | East |
| 135° | Southeast |
| 180° | South |
| 225° | Southwest |
| 270° | West |
| 315° | Northwest |

Use the nearest 45-degree direction, with the existing `Math.round(azimuth / 45) % 8` behavior.

### 7.2 Visibility

| Row | State source | Required format |
| --- | --- | --- |
| Brightness Layers | `StarLayerState` | Comma-separated enabled labels, for example `1st, 2nd`; `None` if all are off |
| Daylight | `SimulationSettings.daylightMode` | `Real` or `Removed` |
| Light Pollution | `SimulationSettings.lightPollution` | Existing English preset label |
| Limiting Magnitude | `SimulationSettings.limitingMagnitude` | One decimal place, for example `5.5` |
| Observer Sensitivity | `SimulationSettings.observerSensitivity` | `Typical / 0.00`, `More sensitive / +0.25`, or `Less sensitive / -0.25` |
| Hidden Stars | `SimulationSettings.showHiddenStars` | `Shown faintly` or `Not shown` |

Brightness labels are `1st`, `2nd`, `3rd`, `4th`, and `5th+`, in that order. This row describes display layers only and must not use the term `Mission maxMagnitude`.

### 7.3 Display

| Row | State source | Required format |
| --- | --- | --- |
| Stars | `DisplayOptions.stars` | `On` or `Off` |
| Star Names | `DisplayOptions.starNames` | `On` or `Off` |
| Constellation Lines | `DisplayOptions.constellationLines` | `On` or `Off` |
| Constellation Names | `DisplayOptions.constellationNames` | `On` or `Off` |

### 7.4 Compare mode

The summary must describe the rendered canvas, including existing comparison behavior.

- In a single view, show `Visible Stars` as one count.
- In compare mode, replace that value with `Base {count} · Changed {count}`.
- Add a contextual row `View Mode: Comparison — {existing compare label}` only while compare mode is active.
- Do not treat compare-only scene overrides as mutations of the shared base Observation state.

The count shown in Live Observation Context must come from the same `SkyScene` instance or scene calculation used by the visible canvas. It must match the canvas HUD. Do not use the fixed `1000 × 700` scene from `get_current_sky_state` for this UI count when the rendered canvas has different dimensions.

## 8. WebMCP activity and change highlighting

### 8.1 Scope

Track successful mutations from these tools:

- `set_observation_site`
- `set_sky_view_settings`
- `set_sky_display_settings`

Navigation-only tools may update the persistent activity text, but they do not highlight context rows. Read-only tools never create activity.

Manual edits do not produce `Updated via WebMCP` activity and do not use the agent highlight style.

### 8.2 Activity data model

Use a typed model equivalent to:

```ts
type SkyContextField =
  | "location"
  | "coordinates"
  | "dateTime"
  | "direction"
  | "altitude"
  | "fieldOfView"
  | "visibleStars"
  | "brightnessLayers"
  | "daylight"
  | "lightPollution"
  | "limitingMagnitude"
  | "observerSensitivity"
  | "hiddenStars"
  | "stars"
  | "starNames"
  | "constellationLines"
  | "constellationNames";

interface SkyFieldChange {
  field: SkyContextField;
  before: unknown;
  after: unknown;
  derived?: boolean;
}

interface SkyWebMcpActivity {
  id: string;
  source: "webmcp";
  toolNames: string[];
  startedAt: number;
  updatedAt: number;
  changes: SkyFieldChange[];
}
```

Store raw typed values in activity state. Formatting belongs to the context presentation model, not the WebMCP tool implementation.

### 8.3 Diff rules

- Record only fields whose effective value changed.
- A same-value write is successful but creates no field highlight.
- For multiple changes to the same field in one batch, preserve the first `before` value and the final `after` value.
- `set_observation_site` reports both Location and Coordinates when each changes.
- `set_sky_view_settings` reports only supplied fields whose effective values change.
- `set_sky_display_settings` reports direct changes and coupled effects. For example, changing a light-pollution preset also reports Limiting Magnitude when the preset changes it.
- A derived Visible Stars change is added after the next matching scene calculation completes.
- A canvas resize by itself must not be attributed to WebMCP and must not generate a WebMCP highlight.

### 8.4 Batching

Separate successful Sky mutation tool calls completed within 2,000 milliseconds are displayed as one activity batch.

This is presentation grouping only. Do not create a new composite tool or change the transaction semantics of existing tools.

### 8.5 Timing and presentation

- Changed rows receive a subtle accent background and border for 2.5 seconds.
- For 5 seconds, a changed row shows its new current value with an `Updated via WebMCP` marker.
- After 5 seconds, the marker disappears while the new current value remains.
- The footer `Updated via WebMCP · {localized time}` persists until another WebMCP activity or a full page reload.
- The activity header shows `{n} settings updated` when more than one field changed.
- Do not auto-scroll Agent Activity to a changed row.
- The latest activity summary remains at the top of Agent Activity, and changed fields move into the compact Current sky list.

Use examples such as:

```text
Updated via WebMCP · just now
3 settings updated

Direction
South / 180°
Updated via WebMCP
```

The highlight must not rely on color alone. The textual `Updated via WebMCP` marker is required.

### 8.6 Manual interaction during a highlight

If the user manually changes a highlighted field before its timer expires:

- stop highlighting that row as soon as the current value no longer equals the recorded WebMCP `after` value;
- keep the persistent `Updated via WebMCP` footer as historical attribution;
- do not rewrite the WebMCP activity as a manual activity.

## 9. WebMCP availability presentation

Map the existing `WebMcpAvailability` values as follows:

| Value | Presentation |
| --- | --- |
| `unknown` | `Checking WebMCP…` with neutral styling |
| `ready` | `WebMCP ready` with success styling |
| `unavailable` | `WebMCP unavailable` with neutral styling and manual fallback text |
| `error` | `WebMCP unavailable` with warning styling and manual fallback text |

Do not display stack traces, tool registration failures, browser flags, or registered tool names.

## 10. Visual and responsive behavior

### 10.1 Desktop

- In Agent-assisted presentation, let the Sky canvas fill the workspace and position Agent Activity as a small floating window near the upper-left corner.
- In Manual presentation, keep the existing 320-pixel sidebar width unless layout verification demonstrates truncation.
- The default Sky view enables the 1st, 2nd, 3rd, 4th, and 5th+ brightness layers. The existing Dark Sky limiting magnitude of 5.5 is retained so the catalog's fifth-magnitude range is visible.
- Use a two-column definition-list layout for field rows: label on the left, value on the right.
- Use tabular numerals for coordinates, times, degrees, magnitudes, and counts.
- The WebMCP status and latest activity summary remain at the top of Agent Activity.
- The Sky canvas remains the dominant visual surface.

### 10.2 Narrow screens

- In Agent-assisted presentation, keep Agent Activity usable as a compact overlay that can scroll internally when necessary.
- In Manual presentation, preserve the existing breakpoint where the canvas appears before the sidebar.
- Keep context fields readable without horizontal scrolling.
- Allow long values to wrap; do not truncate coordinates, time-zone information, or change text.

### 10.3 Motion

- Use one short opacity/background transition for field highlighting.
- Under `prefers-reduced-motion: reduce`, remove the transition but retain the static accent border and textual change for the same duration.
- Do not pulse continuously and do not animate unchanged values.

## 11. Accessibility

- Implement the context rows with semantic headings and a `<dl>` or equivalent label/value structure.
- The Agent-assisted/Manual controls must be keyboard accessible and expose the selected presentation.
- Current sky reorders its compact field list after an agent action; the complete state remains available from Manual controls.
- The status badge must contain readable text; a colored dot is decorative only.
- Announce a completed WebMCP batch once through an `aria-live="polite"` region.
- Do not announce every render, every countdown update, or every scene-frame recalculation.
- Keep all existing form labels and keyboard operation in manual controls.
- Ensure highlight text meets WCAG AA contrast against the panel background.

Suggested announcement:

```text
WebMCP updated 3 sky settings: Location, Direction, and Brightness Layers.
```

## 12. State and implementation architecture

### 12.1 Required invariant

The existing providers remain the single sources of truth:

- `StarViewerProvider`: observation settings and display options;
- `SimulationProvider`: brightness layers and simulation settings;
- `ObservationProvider`: active site;
- `WebMcpProvider`: WebMCP availability and tool registration.

Agent Activity and the Manual controls read these values. They must not retain editable copies.

### 12.2 Recommended new modules

Use these module boundaries unless an equivalent organization is demonstrably simpler:

| Module | Responsibility |
| --- | --- |
| `src/components/SkySidebar.tsx` | Floating Agent Activity presentation |
| `src/components/SkyContextPanel.tsx` | Current state, status, activity, and accessible field rendering |
| `src/state/agentActivity.tsx` | WebMCP activity batching, timers, and latest activity |
| `src/sky/contextModel.ts` | Pure field derivation, formatting, and typed diff helpers |
| `src/sky/sceneMetrics.ts` | Single/compare scene metric types if they do not fit in an existing scene module |

Place `AgentActivityProvider` outside `WebMcpProvider` and inside the existing domain providers so both tool registration and `AppShell` descendants can consume it. One valid provider fragment is:

```tsx
<SnapshotProvider>
  <AgentActivityProvider>
    <WebMcpProvider>
      <AppShell />
    </WebMcpProvider>
  </AgentActivityProvider>
</SnapshotProvider>
```

Because the Sky workspace unmounts when another application view is selected, keep the Agent-assisted/Manual presentation boolean in `AppShell` or another component/provider above the view switch. Do not keep it only in local `SkySidebar` state.

### 12.3 Tool instrumentation

Instrument successful mutations at the WebMCP tool boundary, where validated current and next values are already available.

The preferred contract is an optional typed callback on `SkyControlToolState`, such as `reportSkyMutation(activity)`. Each mutation tool reports after its state update callbacks have been accepted. The callback must not change tool output or turn activity-rendering failure into tool-execution failure.

Do not infer WebMCP provenance by watching all React state changes. Time lapse, experiments, comparisons, manual edits, and provider initialization also change state and would create false attribution.

### 12.4 Scene metrics

Lift or publish the metrics generated by the rendered `StarCanvas` so `SkyWorkspace` can provide them to `SkySidebar`.

A suitable implementation is:

1. Add an `onMetricsChange` callback to `StarCanvas`.
2. Publish `visibleCount` and `inViewCount` only when those values change.
3. In compare mode, identify metrics as `base` or `changed`.
4. Store the latest metrics in `SkyWorkspace` and pass them to both context presentation and any existing HUD consumer as appropriate.
5. Avoid a render loop by using stable callbacks and primitive effect dependencies.

The summary and HUD must agree for the current rendered dimensions.

## 13. Existing code impact map

Expected modifications include:

- `src/App.tsx`: render the full-canvas Agent-assisted layout or the existing manual sidebar layout; connect scene metrics.
- `src/components/StarCanvas.tsx`: publish rendered scene metrics.
- `src/state/webmcp.tsx`: connect mutation reporting while preserving tool registration and current refs.
- `src/mcp/skyControlTools.ts`: emit typed successful mutation details without changing public tool contracts.
- `src/styles.css`: floating activity window, status, dynamic field list, highlight, reduced-motion, and responsive styles.
- `package.json`: add the new deterministic verification script to `npm run verify` if a separate script is created.

Do not modify persistence schemas or add npm dependencies.

## 14. Demo contract

The primary demo request is conceptually:

> Show me the southern sky over Sydney tonight, with only bright stars that are easy to see with the naked eye.

The expected agent workflow is:

1. `set_observation_site` with Sydney's name and coordinates.
2. `set_sky_view_settings` with a Sydney-night instant, azimuth `180`, and any explicitly requested view values.
3. `set_sky_display_settings` with Stars enabled, 1st- and 2nd-magnitude layers enabled, and 3rd, 4th, and faint layers disabled.
4. `open_sky_view` if Sky is not already visible.

"Bright stars only" maps to brightness display layers. It does not change a Mission's `maxMagnitude` and does not mutate an existing Mission prediction.

After the calls complete, the demonstration must visibly show:

- Location changed to Sydney;
- Coordinates changed to `-33.8688, 151.2093`;
- Date & Time shown in `Australia/Sydney` time;
- Direction changed to `South / 180°`;
- Brightness Layers shown as `1st, 2nd`;
- Visible Stars recalculated;
- corresponding rows temporarily showing their previous and new values;
- the full Sky canvas rendered from the same resulting state.

## 15. Acceptance criteria

### AC-1: Default presentation

Given a new page load on Sky, Agent-assisted is selected, the Sky canvas fills the available workspace, and Agent Activity is visible as a small left-side overlay.

### AC-2: Shared state

Selecting Manual restores the existing controls. The controls show values identical to Agent Activity, and a manual edit immediately updates the context and canvas without copying, applying, or synchronizing a second state object.

### AC-3: WebMCP mutation

Executing each Sky mutation tool updates the existing application state, context summary, and rendered sky. The tool's existing success result remains backward compatible.

### AC-4: Attribution and diff

Only effectively changed fields receive the WebMCP highlight. Each highlighted field displays its correctly formatted new value with an `Updated via WebMCP` marker, and the activity identifies WebMCP as the source.

### AC-5: Coupled values

Changing Light Pollution through WebMCP also reports and highlights Limiting Magnitude when the selected preset changes it.

### AC-6: Batched agent action

Sky mutation tools completing within the 2,000-millisecond window appear as one activity with merged changes, while remaining separate WebMCP calls internally. Calls outside the window remain separate activities.

### AC-7: Rendered counts

Visible Stars in the summary equals the current canvas HUD count for single view. Compare mode reports both rendered counts.

### AC-8: Manual fallback

When WebMCP is unavailable or registration fails, Agent-assisted still shows the sky and activity fallback, Manual remains fully usable, and no raw diagnostic is shown.

### AC-9: Mission immutability

Changing live Sky values through WebMCP or manual controls does not recalculate or overwrite existing Mission altitude, azimuth, visibility, site snapshot, date, or `maxMagnitude`.

### AC-10: Accessibility and motion

The presentation controls are keyboard accessible, the dynamic Current sky list is readable, updates are announced once, change information is not color-only, and reduced-motion mode removes transition animation.

### AC-11: Responsive behavior

At the existing mobile breakpoint, Agent Activity remains usable as a compact overlay, the canvas remains visible, and Manual controls remain reachable.

### AC-12: Regression safety

Build, the full deterministic verification suite, and optional layout verification pass without adding dependencies.

## 16. Verification plan

Add deterministic checks for:

1. location resolution for a preset, matching active site, and custom coordinates;
2. preset-zone and custom/browser-zone time formatting;
3. all direction boundaries and azimuth normalization;
4. brightness-layer, display, simulation, and sensitivity formatting;
5. omission of no-op changes;
6. first-before/final-after merging for repeated fields;
7. the 2,000-millisecond activity grouping boundary using injected deterministic time;
8. coupled Light Pollution and Limiting Magnitude changes;
9. WebMCP tool output compatibility after instrumentation;
10. manual state changes not being attributed to WebMCP;
11. single and compare scene metric presentation;
12. Mission prediction snapshots remaining unchanged.

Run before handoff:

```bash
npm run build
npm run verify
npm run verify:layout
```

`verify:layout` remains optional when Playwright or Chromium is unavailable, but Luna should capture these states when browser verification is available:

1. desktop, default Agent-assisted presentation;
2. desktop, immediately after a multi-tool WebMCP update;
3. desktop, Manual presentation with the existing controls;
4. mobile-width Agent-assisted presentation;
5. WebMCP unavailable with Manual fallback;
6. compare mode with two visible-star counts.

## 17. Implementation order for Luna

1. Add pure context formatting and activity models with deterministic verification.
2. Add `AgentActivityProvider` and WebMCP mutation reporting.
3. Add rendered scene-metric publishing.
4. Build `SkyContextPanel` and `SkySidebar` using existing providers as sources of truth.
5. Restore existing manual panels in the Manual layout without changing their behavior.
6. Add highlight, accessibility, responsive, and reduced-motion styling.
7. Add integration and layout verification.
8. Run the full build and verification suite.

## 18. Design rationale references

- [Chrome: WebMCP and AI agents](https://developer.chrome.com/docs/ai/agents)
- [Chrome: WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices)
- [Chrome: Build agentic workflows with WebMCP tools](https://developer.chrome.com/docs/ai/webmcp/build-tools)
- [Microsoft Research: Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/blog/guidelines-for-human-ai-interaction-design/)
- [Google PAIR: Feedback and Control](https://pair.withgoogle.com/chapter/feedback-controls/)
