# Interactive Star Lab

Interactive Star Lab is an educational sky viewer for exploring how location, date and time, direction, daylight, light pollution, and observer sensitivity change what we can see. It includes the 88 modern constellations, 674 constellation lines, and 752 stars from the checked-in Stellarium-derived catalogs.

## Highlights

- Explore the sky from any latitude and longitude.
- Change observation date and time, direction, altitude, and field of view.
- Toggle stars, star names, constellation lines, and constellation names.
- Inspect individual stars and the Sun.
- Simulate daylight, twilight, light pollution, and observer sensitivity.
- Run What-if experiments and compare before/after sky views.
- Create Observation Missions with immutable creation-time predictions.
- Record Visible, Not Visible, or Unsure results and compare them with predictions.
- Restore a Mission on another device with a one-time Recovery Code.
- Save deterministic sky Snapshots and generate printable Observation Guides and PDFs.
- Expose sky controls, Missions, results, Snapshots, and Guides through WebMCP.

## Local setup

Requirements: Node.js 18 or newer and npm.

```bash
npm ci
npm run dev
```

Open the URL printed by Vite, usually <http://localhost:5173/>.

## Optional Supabase persistence

Set these Vite public environment variables to persist Missions, observation results, and Mission-linked sky Snapshots in Supabase:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Apply the migrations in [`supabase/migrations`](supabase/migrations), enable Anonymous Sign-Ins in Supabase Authentication, and configure the Vercel environment variables for each deployed environment. The application creates an anonymous session automatically. When a Mission is created, its Recovery Code is shown once and can later be entered in History or passed to the `restore_observation_mission` WebMCP tool.

Recovery Codes are not stored in plaintext. A Mission ID alone cannot restore a Mission from another device. If Supabase is unavailable or not configured, the application continues in local LocalStorage / IndexedDB mode.

Never put a Supabase `service_role` key in browser code or Vercel client-side environment variables.

## WebMCP demo flow

1. Call `create_observation_plan` to select visible stars and create a Mission. Store the one-time Recovery Code securely.
2. Set the returned Mission date and site in Sky, then call `capture_sky_snapshot({ missionId })`.
3. In Observe, record Visible, Not Visible, or Unsure for each target.
4. Call `get_observation_results({ missionId })` to retrieve the latest results and prediction comparison.
5. Call `get_sky_snapshot_metadata({ snapshotId })` when a short-lived signed URL is needed, or call the Guide tool to generate a PDF.
6. Use `open_observe_view`, `open_sky_view`, or `open_observation_results` to open the corresponding human-facing screen from WebMCP.

## Verification

```bash
npm run build
npm run verify
npm run verify:layout
```

`build` runs strict TypeScript checks and the production Vite build. `verify` runs deterministic astronomy, observation, Guide, Snapshot, cloud, and WebMCP checks. `verify:layout` runs the optional browser layout walkthrough when Playwright and Chromium are available. The verification suite includes an English-only scan over tracked files and `dist/`.

## Catalogs and regeneration

- `src/data/constellations.json`: English constellation names, descriptions, and line endpoints.
- `src/data/stars.json`: star coordinates, magnitudes, names, and constellation memberships.
- `data-source/stellarium-western-constellationship.v0.15.0.txt`: Stellarium Western skyculture v0.15.0 constellation lines.
- `data-source/stellarium-western-star-names.v0.15.0.txt`: Stellarium HIP identifiers and star names.
- `data-source/hipparcos-line-stars.v0.15.0.tsv`: Hipparcos line-endpoint coordinates and V magnitudes.

Regenerate the checked-in application catalogs with:

```bash
npm run import:constellations
```

## Project layout

```text
src/                 React application and domain logic
  astronomy/         Coordinates, projection, visibility, and twilight
  components/        Sky canvas and workflow screens
  data/              English star and constellation catalogs
  guides/            Observation Guide and PDF generation
  mcp/               WebMCP contracts and tools
  observation/       Mission and observation workflows
  state/              React providers and application state
scripts/             Verification and catalog generation scripts
data-source/         Checked-in source catalogs
supabase/migrations/ Database schema and RLS migrations
```

## License

This project is licensed under the [MIT License](LICENSE).
