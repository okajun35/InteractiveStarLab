# English-Only Conversion Plan

## 1. Objective

Convert Interactive Star Lab from its current Japanese-first/bilingual presentation into an English-only application for the hackathon.

This is not an internationalization project. The finished `main` branch will have:

- no language selector;
- no translation runtime or locale catalog;
- no Japanese-only model fields such as `nameJa` or `descriptionJa`;
- no Japanese text in the shipped application, generated artifacts, accessibility labels, or agent-facing contracts;
- an automated check that prevents Japanese text from being reintroduced.

The current Japanese version is preserved on the `japanese-ui` branch. Before conversion work begins, that branch should be pushed to the remote repository.

## 2. Definition of Done

The conversion is complete when all of the following are true:

1. Every user-visible screen is English-only.
2. Validation, fallback, cloud, recovery, and clipboard messages are English-only.
3. Accessible names, labels, titles, placeholders, and alternative text are English-only.
4. Canvas labels, generated Observation Guides, PDFs, snapshots, and download names contain no Japanese text.
5. Star and constellation data exposed to the UI or WebMCP contains no Japanese-specific fields or values.
6. WebMCP tool descriptions, tool results, errors, and navigation behavior are English-only.
7. `README.md` and the public-facing project documentation are English-only.
8. Production source and built output pass an automated Japanese-character scan.
9. `npm run build`, `npm run verify`, and the available browser layout checks pass.
10. A manual browser walkthrough finds no Japanese text in any normal, empty, loading, success, or error state.

## 3. Scope

### 3.1 User-facing application

Translate and review all screens and shared components:

- application header and navigation;
- Sky viewer and object information;
- time, direction, magnitude, display, environment, and experiment controls;
- Observation Plan;
- Observe and result entry;
- Results and prediction comparison;
- Observation History;
- Mission recovery-code creation and restoration;
- Snapshots;
- Observation Guide and PDF output;
- empty, loading, success, validation, cloud-fallback, and failure states.

### 3.2 Non-visual application surfaces

The following are part of the product even when they are not always visible in the DOM:

- `aria-label`, `aria-labelledby`, `title`, `alt`, and form labels;
- Canvas-rendered labels and status text;
- generated SVG and PDF text;
- browser download filenames;
- LocalStorage defaults that can later appear in the UI;
- Supabase-originated errors after application-level mapping;
- WebMCP contracts, descriptions, structured results, and safe errors.

### 3.3 Data and types

Remove the bilingual data shape instead of leaving unused Japanese data in production:

- retain the existing English `name` field;
- remove `nameJa` from astronomy, observation, and WebMCP types;
- replace useful `descriptionJa` content with an English `description` field;
- remove `descriptionJa` after the English descriptions are available;
- update constellation import scripts so regenerated data remains English-only;
- regenerate checked-in application catalogs;
- remove Japanese default site and comparison labels.

### 3.4 Repository documentation

At minimum, the hackathon-facing `README.md` must be fully English. Existing Japanese design notes should either be:

- replaced by concise English documentation that remains relevant; or
- removed from `main` after confirming they remain available on `japanese-ui` and in Git history.

Source comments and verification descriptions should also be converted if the final policy is zero Japanese across all tracked text files.

## 4. Non-Goals

- adding an i18n library;
- supporting Japanese and English at runtime;
- browser-language detection;
- locale-aware content negotiation;
- changing astronomy calculations or observation prediction behavior;
- changing Mission persistence, recovery-code security, RLS, or Snapshot storage semantics;
- translating third-party proper names away from their accepted English or Latin forms.

## 5. English Terminology

Use one term consistently across UI, documentation, PDF output, and WebMCP.

| Required English term | Usage |
| --- | --- |
| Sky | Main interactive sky viewer |
| Observation Plan | Mission-planning screen and heading |
| Observation Site | Site editor and Mission metadata |
| Observation Date and Time | Date/time controls and summaries |
| Observation History | Saved Mission and result history |
| Visible | Positive human observation status |
| Not Visible | Negative human observation status |
| Unsure | Uncertain human observation status |
| Match | Prediction and observation agree |
| Mismatch | Prediction and observation disagree |
| Undetermined | Comparison cannot yet be decided |
| Recovery Code | Mission-specific restoration capability |
| Restore Mission | Recovery action and button label |
| Magnitude Limit | Faintest allowed Mission target magnitude |
| Azimuth | Horizontal direction in degrees |
| Altitude | Height above the horizon in degrees |
| Field of View | Vertical viewing angle |
| Light Pollution | Local visibility condition |
| Civil Twilight | Civil twilight stage |
| Nautical Twilight | Nautical twilight stage |
| Astronomical Twilight | Astronomical twilight stage |

Use sentence case for headings and buttons unless an established product term is being used. Keep `Mission`, `Snapshot`, `Recovery Code`, and `Observation Guide` consistent.

## 6. TDD and Verification Strategy

### Checkpoint A: Add a failing English-only guard

Create `scripts/verify-english-only.ts` and add it to `npm run verify`.

The first version should fail against the current codebase. It should scan tracked, production-relevant text files for Japanese Unicode ranges, including Hiragana, Katakana, CJK ideographs, iteration marks, and Japanese-specific punctuation where practical.

Initial required scan targets:

- `src/**/*`;
- `public/**/*`;
- `index.html`;
- production data-generation scripts;
- `README.md`;
- built `dist/**/*` when it exists.

The test must report every matching file and line so cleanup is deterministic. Avoid a broad permanent allowlist. Any temporary exclusions must include a reason and be removed by the final checkpoint.

### Checkpoint B: Convert shared navigation and controls

Translate the application shell and reusable Sky controls first. Update tests in the same checkpoint.

Where browser tests currently select elements by Japanese accessible names, prefer stable semantic selectors. Add `data-testid` only when a role and English accessible name are insufficient.

Acceptance criteria:

- the Sky screen and all shared panels are English-only;
- keyboard and screen-reader labels remain meaningful;
- astronomy behavior is unchanged;
- existing verification scripts pass after expectation updates.

### Checkpoint C: Convert the complete observation workflow

Translate Plan, Observe, Results, History, Recovery Code, Snapshot, and Guide screens.

Review every conditional branch, including:

- no candidates;
- no Missions or results;
- anonymous cloud bootstrap in progress;
- cloud unavailable with local fallback;
- invalid recovery code;
- copy success and copy failure;
- save in progress and save failure;
- Snapshot unavailable;
- missing or malformed local data.

Acceptance criteria:

- all workflow states are English-only;
- generic recovery-code errors do not echo the submitted code;
- internal Supabase or MCP diagnostics remain outside the end-user UI;
- Mission creation-time predictions remain immutable.

### Checkpoint D: Remove Japanese data fields

Update application types, services, state, catalogs, and import scripts.

Expected model direction:

```ts
type NamedAstronomyObject = {
  name: string;
  description?: string;
};
```

Do not keep optional `nameJa` fields merely for compatibility inside the English-only branch. Update persisted-data parsing defensively so old local records containing extra Japanese fields do not crash, while ensuring those values are never rendered or returned.

Acceptance criteria:

- no production TypeScript contract contains `nameJa` or `descriptionJa`;
- regenerated star and constellation catalogs contain no Japanese values;
- WebMCP responses contain only the English shape;
- old LocalStorage data remains safely readable where structurally compatible.

### Checkpoint E: Convert generated content and agent surfaces

Review and translate:

- Observation Guide HTML and PDF;
- deterministic Mission Sky Snapshot SVG;
- Canvas labels and status overlays;
- filenames and embedded metadata;
- WebMCP tool descriptions, outputs, and application-mapped errors.

Acceptance criteria:

- generated files contain no Japanese text;
- PDF generation and Snapshot capture continue to work;
- WebMCP contracts remain backward compatible except for the intentional removal of Japanese-only output fields.

### Checkpoint F: Convert public documentation and source text

Rewrite `README.md` for an English-speaking hackathon reviewer. It should cover:

- product purpose and core demo value;
- local setup;
- Supabase environment variables;
- anonymous sign-in and Mission Recovery Code behavior;
- Vercel deployment requirements;
- test commands;
- WebMCP demo flow;
- security note forbidding browser use of the Supabase `service_role` key.

Then resolve remaining Japanese text in tracked comments, verification descriptions, and active documentation. Obsolete Japanese planning documents may be removed from `main` only after verifying that `japanese-ui` preserves them.

### Checkpoint G: Final zero-Japanese verification

Run:

```bash
npm run build
npm run verify
npm run verify:layout
```

Also run a repository-wide Japanese-character scan over tracked files and a second scan over `dist/`.

Perform a browser walkthrough of:

1. Sky and every settings panel;
2. Plan with valid and invalid site input;
3. Mission creation and one-time Recovery Code display;
4. Observe and result saving;
5. Results and comparison summary;
6. History and invalid-code restoration;
7. Snapshot list and details;
8. Observation Guide and generated PDF;
9. local-only fallback;
10. Supabase-backed cloud persistence when configured.

Inspect both visible text and the accessibility tree. Confirm that browser console diagnostics do not expose Recovery Codes.

## 7. Implementation Order

Use checkpoint-sized Conventional Commits. A suggested sequence is:

1. `test: add english-only text verification`
2. `feat: convert sky controls and navigation to english`
3. `feat: convert observation workflow to english`
4. `refactor: remove japanese astronomy data fields`
5. `feat: convert guides snapshots and webmcp text`
6. `docs: publish english project documentation`
7. `test: enforce zero japanese text in production`

Run both `npm run build` and `npm run verify` before every commit, as required by the repository guidelines.

## 8. Branch and Release Procedure

Before editing `main`:

1. verify that `japanese-ui` points to the current Japanese release commit;
2. push `japanese-ui` to `origin`;
3. verify that `main` still tracks `origin/main`;
4. perform the English-only conversion on `main` in checkpoint commits;
5. push `main` only after build, verification, and browser checks pass;
6. verify the Vercel production deployment and its Supabase environment variables.

The Japanese version remains recoverable by checking out `japanese-ui`. No runtime language-switching code should be merged back into `main`.

## 9. Risks and Controls

### Hidden Japanese text

Japanese can remain in uncommon errors, accessibility labels, generated PDFs, Canvas drawing calls, and catalog values. Control this with both source scanning and browser/artifact inspection.

### Broken browser tests

Tests may rely on Japanese labels as selectors. Update them alongside each UI checkpoint and prefer role-based selectors with the new English accessible names.

### Accidental astronomy changes

Translation work can touch files that also contain calculations. Keep string-only edits separate from model refactors and rely on the complete astronomy verification suite.

### Persisted-data compatibility

Removing Japanese fields must not make old local JSON fatal. Continue parsing required structural fields and ignore unknown legacy properties.

### Incomplete catalog regeneration

Editing generated JSON without updating the importer would reintroduce Japanese later. The importer and generated catalogs must change in the same checkpoint.

### Documentation scope growth

Large historical Japanese plans do not need literal line-by-line translation. Preserve them on `japanese-ui`; keep only concise, current English documentation on `main`.

## 10. Final Handoff Report

The implementation report should include:

- commits created;
- files and product surfaces converted;
- removed Japanese-only fields;
- build and verification results;
- browser and PDF/Snapshot inspection results;
- repository and `dist/` Japanese-scan results;
- Vercel deployment URL and deployment status;
- any intentional remaining non-English proper nouns, if applicable.

The work must not be reported complete while any required scan, test, or user-visible flow is failing.
