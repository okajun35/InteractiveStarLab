# Roadmap — Interactive Star Lab

This document records the adopted feature roadmap: what is already shipped,
what is planned next, and why each item was chosen. Ideas are benchmarked
against Roque Nights, whose sky-rendering and agent-facing design informed
several of the shipped layers.

## Shipped

| Area | What landed |
|---|---|
| Sky rendering | Milky Way contours, B-V star colours, dense 5,044-star catalog, Moon phases, 7 planets, 110 Messier objects, continuous twilight gradient, horizon mask, cardinal points, label collision avoidance, night/red-light mode |
| Interaction | Drag-to-pan, wheel zoom, hover hit-testing with tooltips, click selection, agent-directed animated fly-to with reticle pulse |
| Dome mode | Stereographic whole-sky projection (default view), rotate/zoom/reset, `skyMode` in WebMCP and share URLs, flat star rendering and suppressed star-name labels at dome scale, amber annotation colour language |
| Interoperability | `#sky=` shareable URLs (versioned base64url fragment, full viewer state, no server), `describe_current_view` WebMCP tool with recent human-action log |
| UX fixes | Agent Activity panel is dismissible, mode toggle moved to the free corner |

## Guiding rules

- Mission predictions, altitude, and azimuth stay fixed at creation time.
- The dome is a chart of what exists; the windowed view is the visibility
  simulation. Map mode must not change mission semantics.
- No new npm dependencies without a documented reason.
- Every feature ships with a `scripts/verify-<feature>.ts` check wired into
  `npm run verify`, plus `npm run build` green.
- UI and repo text stay English-only; i18n content lives under `src/i18n/`
  (exempted from the English-only scan when it lands).

## Phase 1 — Night ephemeris and best-night ranking (recommended next)

The most natural unanswered question in an observation-planning app is
*when should I look?*

- **Night model**: one night = local noon to next noon. Compute the three
  twilight boundaries (civil/nautical/astronomical dusk and dawn), moonless
  dark hours, and polar cases (`never_sets`, `continuous_darkness`).
- **`rank_nights`**: score candidate nights over a range by moonless dark
  time (and optionally target altitude), returning the best windows to the
  user and to the agent.
- Output feeds mission creation: a mission's immutable prediction should be
  anchored to a chosen night, not just the current datetime.
- Files: `src/astronomy/night.ts`, `src/mcp/nightTools.ts`,
  `scripts/verify-night.ts`. No dependencies.

## Phase 2 — Agent harness and tool envelope hardening

- **AgentHarness panel**: an in-app surface that lists the registered WebMCP
  tools and can execute them without a WebMCP-capable browser. Doubles as a
  demo surface and as a manual test harness for every tool.
- **Additive envelope (Plan A, scoped)**: keep the existing return shapes,
  add `summary`/`caveats[]` where they pay off — starting with
  `predict_visible_stars` gaining a `rejected[]` list ("Deneb: below
  horizon") so agents can explain absences.
- **Destructive-op tokens**: `confirm: true` plus a single-use undo token
  for irreversible mission/snapshot operations.

## Phase 3 — Human-in-the-loop planning

- **Ghost proposals**: `propose_plan` produces a draft; the human accepts or
  rejects items individually; `commit_proposal` turns the accepted subset
  into a mission. Reject reasons flow back to the agent.
- **Plan staleness**: when site/time moved after mission creation, surface a
  `plan_stale` flag instead of silently showing old predictions.

## Phase 4 — Export and sharing extensions

- **ICS/CSV export** for missions and observation results (calendar import,
  classroom handouts).
- Optional `lang` in share URLs once i18n exists.

## Phase 5 — Site and weather comparison (conditional)

- Open-Meteo integration (no API key): cloud cover nowcast plus the jet
  stream → seeing and 700 hPa humidity → transparency approximations.
- Dark-sky site comparison table. Ship only after Phases 1–2; cached
  snapshots are the offline fallback.

## Phase 6 — Internationalisation (parallel track)

- Typed message dictionaries: `src/i18n/en.ts` as the key source of truth,
  `src/i18n/ja.ts` constrained by `typeof en` so missing keys are compile
  errors — no PO/gettext toolchain.
- `LocaleProvider` + `t()` helper, EN/JA header toggle, `localStorage`
  persistence, `navigator.language` initial detection.
- WebMCP tool descriptions, summaries, guide PDFs, and spec references
  remain English-only.
- Order: infrastructure + primary chrome first, then panels, missions, and
  guides. Partial translation is worse than clean English, so each phase
  lands whole.

## Explicitly out of scope

- Replacing React Context with zustand, CSS with Tailwind, or verify
  scripts with vitest — the current stack is internally consistent.
- Moving mission/prediction logic into React components or making mission
  fields mutable.
- Server-side persistence of share URLs — the fragment encoding is
  deliberately server-free; Supabase remains optional and private.

## Success signals

- An agent can answer "which night this week is best for M31?" via tools.
- Every WebMCP tool result is explainable to a human (summary + caveats).
- The sky opens on the dome, is shareable as a link, and reads like the
  reference renderer at a glance.
