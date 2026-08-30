# Repository Guidelines

## Project Structure & Module Organization

Interactive Star Lab is a React 18, TypeScript, and Vite application. Application code lives under `src/`: `astronomy/` contains coordinate and visibility calculations, `components/` contains UI, `state/` owns React providers, `observation/` and `guides/` implement mission workflows, `mcp/` exposes WebMCP tools, and `cloud/` contains optional Supabase persistence. Static star and constellation catalogs are in `src/data/`; their source material is in `data-source/`. Verification scripts live in `scripts/`, design notes in `docs/`, and database changes in `supabase/migrations/`.

## Build, Test, and Development Commands

- `npm ci` installs the locked dependency set.
- `npm run dev` starts the Vite development server.
- `npm run build` runs strict TypeScript checks, then creates `dist/`.
- `npm run verify` runs the complete astronomy, observation, WebMCP, guide, snapshot, and cloud verification suite.
- `npm run verify:layout` runs the optional browser layout check when Playwright is available.
- `npm run import:constellations` regenerates application constellation data from the checked-in source catalogs.

Run both `npm run build` and `npm run verify` before every commit. Do not add npm dependencies unless the change explicitly requires and documents them.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, double quotes, semicolons, and trailing commas where supported. Name React components and types in `PascalCase`, functions and variables in `camelCase`, and verification files `verify-<feature>.ts`. Keep calculation and persistence logic outside components. Preserve existing astronomy behavior; display magnitude layers and a mission's `maxMagnitude` are separate concepts. Mission predictions, altitude, and azimuth must remain fixed at creation time.

## Testing Guidelines

This repository uses focused TypeScript verification scripts rather than a unit-test framework. Add a script under `scripts/` for new behavior and include it in the `verify` command. Prefer deterministic dates, coordinates, and tolerances for astronomical assertions. Test malformed LocalStorage data and unavailable cloud configuration without crashing the app.

## Commit & Pull Request Guidelines

The current history uses Conventional Commit style, for example `feat: add cloud observation persistence and mission guide`. Keep commits checkpoint-sized and use prefixes such as `feat:`, `fix:`, `test:`, or `docs:`. Pull requests should explain user-visible behavior, architectural decisions, test results, and remaining work. Include screenshots for UI changes and call out schema, environment-variable, or WebMCP contract changes.

## Security & Configuration

Cloud persistence is optional. Use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; never expose a Supabase `service_role` key in browser code. Keep snapshot storage private and rely on short-lived signed URLs.
