# WebMCP-first Plan Workspace UX specification

- Status: Ready for implementation
- Implementation owner: Luna
- Specification date: 2026-09-01

Scope: Plan workspace. The companion Sky specification is in [`webmcp-first-sky-ux-spec.md`](webmcp-first-sky-ux-spec.md).

## 1. Decision

The Plan workspace will use a WebMCP-first, human-reviewable interaction model.

- The default Plan presentation explains the active Mission instead of presenting a form.
- An agent can choose the site, time, magnitude limit, and target stars through existing WebMCP capabilities.
- A successful WebMCP-created Mission opens the Plan summary for human review.
- The user can continue to the target Sky or Observe screen from the summary.
- Existing manual planning controls remain available behind **Edit manually**.
- A manual correction creates a new Mission. It never mutates an existing Mission or its creation-time predictions.

Plan is not a separate WebMCP state. The summary, manual editor, Observe screen, results, Guide, Snapshots, and WebMCP tools all use the same persisted Mission domain object.

## 2. Human and agent ownership

The intended interaction is:

```text
User describes an observation goal
        ↓
Agent resolves site and time
        ↓
Agent predicts candidates and selects targets
        ↓
WebMCP creates an immutable Mission
        ↓
Plan explains the Mission to the human
        ↓
Human opens the target Sky, starts observing, or creates a revision
```

Plan is **agent-operated and human-reviewed**. Observe remains **human-operated** because actual `Visible`, `Not Visible`, and `Unsure` results must come from explicit human observation.

## 3. Primary user journey

The representative request is:

> I'm planning to observe the stars from Osaka Castle Park on August 31, 2026 at 9 PM. Create a simple observation plan with three bright stars that are easy to find, then show me what the sky will look like.

The expected WebMCP workflow is:

1. Resolve the requested place to a display name, latitude, longitude, and IANA time zone.
2. Call `set_observation_site` with the resolved name, coordinates, and time zone.
3. Convert the requested local date and time to an ISO 8601 instant.
4. Call `predict_visible_stars` with that instant, `maxMagnitude: 2`, and a result limit large enough to choose three suitable targets.
5. Select three bright stars that are above the horizon. Prefer brighter magnitude first, then higher altitude when brightness is similar.
6. Call `create_observation_plan` with the same instant, `maxMagnitude: 2`, and the three selected star IDs.
7. Review is available in Plan immediately after creation.
8. To fulfill "show me what the sky will look like," set the live Sky to the Mission site and time, center it on the first target, and call `open_sky_view`.

The Mission target order is meaningful for presentation. The first star ID is the primary target used by the default **Show target sky** action.

"Bright stars" maps to a low Mission `maxMagnitude`, normally `2` for this request. This is distinct from the Sky workspace's display-layer settings.

## 4. Goals

1. Allow a novice to create a useful Mission entirely through natural language.
2. Make the resulting Mission understandable without exposing a multi-step form by default.
3. Preserve a one-click manual fallback and correction path.
4. Keep Mission creation-time site, date, altitude, azimuth, magnitude, and visibility snapshots immutable.
5. Make the transition from Plan to the corresponding Sky and Observe states explicit.
6. Preserve local fallback, cloud persistence, one-time Recovery Codes, and existing security behavior.

## 5. Non-goals

This change must not:

- let an agent submit actual observation results without explicit user-reported values;
- edit an existing Mission in place;
- recalculate an existing Mission when the live Sky later changes;
- create a second Mission representation used only by the UI;
- add an embedded chat interface;
- add an overlapping `prepare_observation_plan` or `generate_plan` tool in this increment;
- silently guess coordinates inside application code;
- add geocoding, maps, weather, or time-zone dependencies;
- claim that a target is easy to find using a new unverified scoring model;
- delete or replace an earlier Mission when creating a revision;
- expose cloud or WebMCP diagnostic details to the end user.

## 6. Intentional WebMCP contract changes

The Plan review experience requires a backward-compatible site metadata extension, one deliberate navigation behavior change, and one new navigation tool.

### 6.1 Optional site time zone

Extend `ObservationSite` with a backward-compatible optional field:

```ts
interface ObservationSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  timeZone?: string;
}
```

Extend `set_observation_site` with an optional `timeZone` string parameter.

- Existing calls containing only name, latitude, and longitude remain valid.
- Validate a supplied value as an IANA time zone using `Intl.DateTimeFormat`; reject invalid values with `INVALID_ARGUMENT`.
- Store a valid value on `activeSite` so newly created Mission snapshots retain it.
- When coordinates match a built-in preset and `timeZone` is omitted, use the preset's existing time zone.
- When coordinates do not match a preset and `timeZone` is omitted, preserve the current site's time zone only if the site coordinates are unchanged; otherwise clear it to avoid a false location-time association.
- Include `timeZone` in the successful site result when known.
- Do not add a time-zone lookup or geocoding dependency.

Update the manual `SiteEditor` with an optional **Time Zone** field accepting an IANA identifier such as `Asia/Tokyo`. Selecting a built-in preset fills this field automatically.

Legacy stored sites without `timeZone` remain valid. Storage, cloud Mission payload, Snapshot metadata, results, and Recovery flows must preserve the optional field when present without requiring a database migration.

### 6.2 `create_observation_plan`

Keep the existing tool name, input schema, Mission creation behavior, persistence behavior, and target result data. Change only its post-success navigation and corresponding result text:

- After successful creation, open `plan` instead of `observe`.
- Return `view: "plan"` instead of `view: "observe"`.
- Replace the current `nextAction` with: `Review the Mission on Plan, then open the target Sky or Observe view`.
- Continue returning `missionId`, `persistence`, `targetCount`, `snapshotStatus`, and immutable target snapshots.
- Record an ephemeral `Created via WebMCP` Plan activity after persistence succeeds.
- Do not record successful activity if cloud-backed Mission creation rejects and the tool returns an error.
- In cloud mode, do not expose a provisional Mission as the successful active summary before persistence completes. If the current provider creates provisionally, roll it back and restore the previous active Mission on rejection.

This is an intentional behavior change and must update existing WebMCP verification and README demo documentation.

Manual Mission creation retains its current behavior of opening Observe after success.

### 6.3 `open_plan_view`

Add one navigation tool:

```text
name: open_plan_view
title: Open Plan view
input: empty object, no additional properties
annotation: readOnlyHint false
```

Behavior:

- Open the human-facing Plan screen without creating or modifying a Mission.
- If an active Mission exists, return `view: "plan"` and its `activeMissionId`.
- If no active Mission exists, return `view: "plan"` and `activeMissionId: null`.
- Reject unexpected input with the existing `INVALID_ARGUMENT` envelope.

Register the tool for the full application lifetime and include it in `registeredToolNames`.

## 7. Plan screen states

The Plan screen has three presentation states.

### 7.1 No active Mission

Show a compact WebMCP-first empty state:

```text
Observation Plan                         WebMCP ready

No active Mission
Ask your AI agent to create a plan for a place and time,
or create one manually.

Example
"Create a three-star observation plan for Sydney tonight."

[ Edit manually ]
```

Requirements:

- Do not show the site, time, magnitude, and candidate forms by default.
- `Edit manually` reveals the existing planner.
- When WebMCP is unavailable, replace the helper text with `WebMCP unavailable. Manual planning is still available.`
- Do not show raw registration errors.

### 7.2 Active Mission

Show the Mission summary defined in section 8. Manual controls remain collapsed.

### 7.3 Manual editor expanded

Show the Mission summary or empty state first, followed by the existing manual planner controls.

- The disclosure label is `Edit manually` while collapsed and `Done editing` while expanded.
- Use `aria-expanded` and `aria-controls`.
- Inputs continue to update immediately as they do now.
- Mission creation still requires the explicit `Create Mission` button.
- Closing the editor does not discard the draft during the current Plan mount.
- A full page reload may reset an uncommitted manual draft.

## 8. Active Mission summary

Use the exact heading **Observation Plan** and identify the object as **Active Mission**.

### 8.1 Mission context

| Row | Source | Format |
| --- | --- | --- |
| Mission | `ObservationMission.id` | Full ID in selectable text |
| Site | `siteSnapshot.name` | Stored creation-time name |
| Coordinates | `siteSnapshot.latitude`, `.longitude` | Four decimal places |
| Date & Time | `dateTime` | `siteSnapshot.timeZone`, then matching preset zone, otherwise UTC with an explicit `UTC` suffix |
| Magnitude Limit | `maxMagnitude` | `Up to magnitude {n}` |
| Targets | `targets.length` | `{n} stars` |
| Created | `createdAt` | Localized English date and time |

Use Mission snapshot values, not current live Sky values.

For a valid `siteSnapshot.timeZone`, use English month names, a 24-hour clock, and a short zone name. Never format a custom Mission using the browser time zone unless that exact browser zone was stored in the Mission snapshot.

### 8.2 Target cards

Render targets in stored Mission order. Each target card contains:

| Field | Source | Format |
| --- | --- | --- |
| Name | star catalog lookup by `starId` | English star name; fall back to `starId` |
| Magnitude | `predictedMagnitude` | Two decimal places |
| Altitude | `predictedAltitude` | Rounded whole degrees |
| Direction | `predictedAzimuth` | Eight-point direction plus rounded azimuth, for example `Southwest / 224°` |
| Prediction | `predictedVisible` | `Visible` or `Not visible` |

Do not calculate or display a new "easy," "medium," or "hard" rating. Brightness and altitude provide the factual explanation for the agent's selection.

The first card receives a subtle **Primary target** label because it is used by the default target-sky action.

### 8.3 Actions

Show these actions in this order:

1. **Show target sky** — synchronizes live Sky to the immutable Mission context, centers the first target, and opens Sky.
2. **Start observing** — opens Observe with the active Mission.
3. **Edit manually** — expands a revision-capable manual editor.

If the Mission has no valid catalog target due to malformed legacy data, disable **Show target sky** and keep **Start observing** available if the Mission otherwise passes existing validation.

### 8.4 Recovery Code

If cloud creation produced the existing one-time Recovery Code, render the existing `RecoveryCodePanel` in the Plan summary.

- Preserve its current copy and dismiss behavior.
- Do not include the Recovery Code in WebMCP tool results or activity records.
- Do not duplicate it if the Plan and Observe components are both mounted; only the visible screen renders it.

## 9. Show target sky behavior

The **Show target sky** action applies the following live Sky changes atomically from the user's perspective:

1. Set active observation site name, coordinates, and optional time zone from `mission.siteSnapshot`.
2. Set live observation latitude and longitude from `mission.siteSnapshot`.
3. Set live observation date/time from `mission.dateTime`.
4. Set azimuth to the first target's `predictedAzimuth`, normalized to `[0, 360)`.
5. Set altitude to the first target's `predictedAltitude`, clamped to `[0, 90]`.
6. Preserve the current Field of View unless it is invalid; use `80°` only as a safe fallback.
7. Open Sky.

Do not alter display layers, daylight simulation, light pollution, observer sensitivity, or display options. Those remain live Sky preferences.

The equivalent agent workflow after Mission creation is:

1. call `set_observation_site` with the Mission site;
2. call `set_sky_view_settings` with Mission time and the first target's azimuth and altitude;
3. call `open_sky_view`.

The manually initiated action is attributed as manual, not WebMCP, even though it produces the same live Sky state.

## 10. Manual correction and Mission revision

Mission predictions are immutable. Therefore **Edit manually** never edits the active Mission.

When an active Mission exists and the user opens manual editing for the first time during the current Plan mount:

1. initialize the editor site from `mission.siteSnapshot`;
2. initialize date/time from `mission.dateTime`;
3. initialize magnitude limit from `mission.maxMagnitude`;
4. initialize selected target IDs from `mission.targets`, retaining only IDs that remain valid candidates under the copied conditions;
5. label the create action `Create revised Mission`.

If a copied target is no longer present because of malformed or changed catalog data, omit it and show a non-blocking explanation.

Creating the revision:

- creates a new Mission ID;
- preserves the earlier Mission in History;
- makes the new Mission active;
- uses newly calculated immutable target predictions;
- opens Observe after successful manual creation, matching the current manual flow.

Do not call this operation Save, Update, or Edit Mission.

## 11. WebMCP creation activity

Plan activity is simpler than Sky field-diff activity because a Mission is a newly created immutable object.

After successful WebMCP creation, show:

```text
Created via WebMCP · just now
3 targets selected for Osaka Castle Park
```

Behavior:

- Highlight the Mission summary container and target cards for 2.5 seconds.
- Keep `Created via WebMCP · {time}` visible until another Plan activity or full page reload.
- Announce once through `aria-live="polite"`: `WebMCP created an observation Mission with 3 targets.`
- Do not animate every field independently because no previous version of the new Mission exists.
- Do not persist provenance in the Mission database payload in this increment.
- After reload, show the object as `Active Mission` without claiming it was created through WebMCP.

If WebMCP creates another Mission, replace the visible active summary with the new Mission and leave the earlier one available in History.

## 12. State architecture

### 12.1 Required invariant

`ObservationProvider` remains the source of truth for persisted Missions and `activeMissionId`. Plan summary reads the active Mission directly from `missions`.

Do not copy an active Mission into a presentation-only state object.

### 12.2 Manual draft

The existing local Plan values may be represented as a typed `PlanDraft` to support initialization from an active Mission:

```ts
interface PlanDraft {
  site: ObservationSite;
  dateTime: Date;
  maxMagnitude: number;
  selectedStarIds: string[];
}
```

This draft is mutable and temporary. It is not a Mission and must not be persisted to Mission storage until the user creates a Mission.

The existing live Sky and `activeSite` synchronization may be retained for compatibility, but draft initialization from a Mission must be explicit and occur only when manual editing is opened. Merely viewing Plan must not change the live Sky.

### 12.3 Activity

Extend the activity architecture from the Sky companion specification or use a shared `AgentActivityProvider` capable of holding typed Sky and Plan activity variants.

Preferred shared shape:

```ts
type AgentActivity = SkyWebMcpActivity | PlanWebMcpActivity;

interface PlanWebMcpActivity {
  id: string;
  source: "webmcp";
  kind: "mission-created";
  toolName: "create_observation_plan";
  missionId: string;
  targetCount: number;
  siteName: string;
  createdAt: number;
}
```

Do not derive provenance by observing `missions`; manual creation, cloud refresh, and recovery also change that list.

## 13. Recommended components

| Module | Responsibility |
| --- | --- |
| `src/components/observation/ObservationPlanSummary.tsx` | Active Mission context, target cards, actions, and Recovery Code |
| `src/components/observation/ObservationPlanEmptyState.tsx` | WebMCP-first no-Mission presentation |
| `src/components/observation/ObservationPlanEditor.tsx` | Existing manual controls after extraction from the current screen |
| `src/observation/planDraft.ts` | Pure draft creation, Mission-to-draft initialization, and reconciliation |
| `src/observation/missionView.ts` | Pure Mission-to-live-Sky target view calculation |
| shared agent activity state | Sky and Plan WebMCP provenance presentation |

`ObservationPlanScreen` becomes the composition and state-transition boundary for these components.

## 14. Existing code impact map

Expected modifications include:

- `src/components/observation/ObservationPlanScreen.tsx`: switch default presentation to summary/empty state and extract the existing form as manual editor.
- `src/components/observation/RecoveryCodePanel.tsx`: reuse without changing secret handling.
- `src/state/observation.tsx`: preserve active Mission selection; add no mutable Mission update API.
- `src/types/observation.ts`, storage validators, cloud validators, and Snapshot validators: support and preserve optional valid site `timeZone` values while accepting legacy sites without one.
- `src/mcp/writeTools.ts`: open Plan and report Plan activity after successful WebMCP creation.
- `src/mcp/skyControlTools.ts` and `skyControlServices.ts`: accept, validate, apply, and return the optional site time zone.
- `src/mcp/skyControlTools.ts` or a focused navigation module: register `open_plan_view`.
- `src/state/webmcp.tsx`: wire `openPlan`, activity reporting, and registered tool names.
- `src/App.tsx`: provide Plan actions and shared manual-expansion state if needed.
- `src/styles.css`: summary, targets, disclosure, activity, responsive, and reduced-motion styling.
- `README.md`: update the WebMCP demo flow to reflect Plan review before Sky or Observe.
- verification scripts: update create-plan navigation expectations and add Plan UX domain checks.

Do not add npm dependencies or database migrations.

## 15. Accessibility and responsive behavior

- Use semantic headings for Mission context and Targets.
- Present Mission context as a `<dl>` or equivalent label/value structure.
- Render target cards as a semantic list.
- Use `aria-expanded` and `aria-controls` for manual disclosure.
- Announce successful WebMCP creation once; do not announce each target field.
- Keep Recovery Code accessibility behavior unchanged.
- Do not rely on the activity accent color alone; include `Created via WebMCP` text.
- Under `prefers-reduced-motion: reduce`, remove the summary reveal transition while retaining the accent border for 2.5 seconds.
- On narrow screens, stack action buttons and target cards without horizontal scrolling.

## 16. Acceptance criteria

### AC-1: Default empty state

With no active Mission, Plan shows the WebMCP-first empty state and hides the manual form behind `Edit manually`.

### AC-2: WebMCP creation review

After `create_observation_plan` succeeds, the created Mission is active, Plan opens, the immutable Mission summary is visible, and the tool returns `view: "plan"`.

### AC-3: Mission summary accuracy

Every displayed site, time, magnitude, target, altitude, azimuth, and prediction value comes from the stored Mission snapshot rather than current live Sky state.

### AC-4: Plan provenance

A WebMCP-created Mission receives the transient summary highlight and `Created via WebMCP` attribution. Manual creation and cloud recovery do not receive that attribution.

### AC-5: Show target sky

**Show target sky** synchronizes the live site and date to the Mission, centers the first target, preserves a valid Field of View, opens Sky, and leaves the Mission unchanged.

### AC-6: Start observing

**Start observing** opens Observe with the active Mission and does not prefill actual observation results.

### AC-7: Manual revision

Opening manual editing from an active Mission initializes a revision draft. Creating it produces a new Mission ID and leaves the earlier Mission unchanged in History.

### AC-8: Existing manual flow

With no active Mission, manual editing exposes all current site, time, magnitude, candidate-selection, and Mission-creation capabilities.

### AC-9: Recovery Code

A newly generated one-time Recovery Code is visible and copyable in Plan after cloud-backed WebMCP creation and is never included in tool results or activity state.

### AC-10: Navigation tool

`open_plan_view` accepts only an empty object, opens Plan with or without an active Mission, and returns the active Mission ID or `null`.

### AC-11: Failure behavior

Invalid prediction or creation input creates no Mission activity. Cloud creation failure preserves the existing safe error envelope and does not falsely show a successful Plan.

### AC-12: Mission immutability

Plan review, live Sky synchronization, manual revision, and later Sky changes never mutate stored creation-time Mission predictions.

### AC-13: Standalone fallback

When WebMCP is unavailable, the empty state explains that manual planning remains available and the full manual flow works.

### AC-14: Regression safety

Build, the full deterministic verification suite, and optional layout verification pass without a new dependency or schema migration.

## 17. Verification plan

Add deterministic checks for:

1. Mission summary formatting from snapshot values;
2. target ordering and catalog-name fallback;
3. stored-zone, preset-zone, and non-zone UTC date formatting;
4. valid and invalid optional IANA zones plus legacy sites without a zone;
5. first-target Sky view derivation and clamping;
6. revision-draft initialization and stale target reconciliation;
7. original Mission immutability after revision creation;
8. WebMCP creation opening Plan and retaining existing result fields;
9. `open_plan_view` success and strict empty input;
10. successful versus failed creation activity;
11. Recovery Code exclusion from tool and activity outputs;
12. manual creation retaining its Observe transition;
13. WebMCP-unavailable manual fallback.

Run before handoff:

```bash
npm run build
npm run verify
npm run verify:layout
```

When browser verification is available, capture:

1. Plan with no active Mission and WebMCP ready;
2. Plan immediately after a three-target WebMCP creation;
3. active Mission with manual revision controls expanded;
4. Plan with WebMCP unavailable;
5. narrow-screen Mission summary and stacked actions;
6. Sky after **Show target sky**.

## 18. Implementation order for Luna

1. Add pure Mission summary, Plan draft, and Mission-to-Sky view helpers with verification.
2. Extract the existing manual form without behavior changes.
3. Add Plan empty and active-summary presentations.
4. Change WebMCP creation navigation to Plan and add typed Plan activity.
5. Add `open_plan_view` and update tool registration documentation and checks.
6. Add Show target sky, Start observing, and revision initialization behavior.
7. Reuse Recovery Code presentation on Plan.
8. Add accessibility, responsive, and reduced-motion styling.
9. Run full build, verification, layout checks, and the primary agent prompt walkthrough.

## 19. Relationship to the Sky specification

The two workspaces share these principles:

- default to an explanatory state presentation;
- keep manual controls available through progressive disclosure;
- preserve one domain state rather than creating WebMCP-specific data;
- make successful agent actions visible and attributable;
- provide human correction without weakening domain invariants.

They differ in one important way:

- Sky state is mutable, so its activity shows field-level `before → after` changes.
- A Mission is immutable, so Plan activity highlights the newly created Mission as one object; correction creates a revision.
