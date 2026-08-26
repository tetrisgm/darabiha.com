# Darabiha handoff

Last updated: 2026-08-25

## Read this first

- Production is `https://darabiha.com`, deployed directly to Cloudflare Worker `darabiha-family` from `main` in `~/dev/darabiha.com`.
- The live release is **Version 43**, `BUILD_ID=e9c4d31`, Worker deployment `5e7520bb-47cc-4231-ad82-ca979abd7098`.
- The release implementation is commit `c81b102` (`Complete archive ingestion and family data management`). The production-test and documentation follow-up is `1732627`.
- `app/authz.ts` intentionally has `TEMPORARY_OPEN_EDITOR = true`. This is the owner-requested testing exception while Nasser’s Apple account is temporarily locked. Every visitor can currently mutate the archive. The Apple implementation and allowlist remain present but are not enforced.
- Apple enforcement is restored by changing only that constant to `false`, testing all three invited family accounts, incrementing `lib/build.ts`, and deploying. The owner must first confirm that family Apple access is working.
- Production exposes its uncached identity at `/api/version` and as visible `Version 43` text at the lower-left edge.

## Live state verified on 2026-08-25

- `/api/version` returns `{"version":43,"build":"e9c4d31","deployedAt":"2026-08-25"}`.
- `/` returns 200 with `cache-control: no-store, must-revalidate`.
- `/api/auth/apple` returns 302 to Apple with the Darabiha callback URL.
- The public D1 tree currently reports **20 people, 21 relationships, and 0 stories**.
- A case-insensitive exact-name scan currently reports no duplicate display names.
- `npm test`: 6 files, 13 tests passed.
- `npm run test:browser`: 24 live tests passed across Chromium and Playwright WebKit.
- `npm run build` passes.
- `npm run lint` exits successfully with five known warnings: one unused legacy `PersonModal`, three raw `<img>` warnings, and one exhaustive-dependencies warning in the canvas focus effect.
- The git checkout was clean when this handoff was written.

## Product behavior

### Reconstructed legacy archive

- `public/legacy-family-tree.html` is a standalone, read-only reconstruction of Nasser's `Darabi_Family_Tree_RD.zip`; it does not mutate or replace the current D1 tree.
- `public/legacy-family-tree-data.json` contains 418 normalized people, 466 parent/child links, 141 marriages, five detected related-spouse marriages, 14 preserved narrative documents, and metadata for nine archive photographs. The standalone HTML embeds the photographs so it remains a single portable file.
- The source ZIP remains outside the repository and is never modified. Its SHA-256 during reconstruction was `ed5e7b3ae3686670e5e536e1ee7949174cca197f15e7cfbafc978764268138ee`. `scripts/extract_legacy_family_tree.py` reproducibly reads it into a temporary directory and regenerates the HTML, JSON, and `docs/legacy-family-tree-import-report.md`.
- Directory ancestry, generation rows, explicit links, spouse columns, child-marriage markers, and repeated subtrees are independent evidence channels. A subtree copied beneath both spouses is merged by normalized person identity plus its canonical parent union.
- Archive generation numbers are branch-relative. Where cousin marriages make the same child appear at two levels, identity resolution is independent of generation; the output retains the highest level and raises descendants as needed for a valid parent-before-child layout.
- Placeholder names such as `Xxx Darabi`, `Yyy Darabiha`, and `---` are omitted. Exact same-name people remain separate when their parents differ.
- `npm run legacy:validate` checks referential integrity, duplicate edges, parent cycles, generation order, placeholder leakage, parent cardinality, known family chains, and the standalone HTML payload.
- The audit currently has no cycles, self-links, duplicate relationships, people with more than two parents, placeholder people, or unresolved identity warnings.

### Tree and navigation

- The main surface is a full-height, Figma-like 2D family-tree canvas beside a 430 px left chat rail.
- Click-drag pans. Wheel/trackpad input zooms around the cursor. The lower-right controls zoom out, show/reset the percentage, and zoom in. Keyboard arrows pan; `+`, `-`, and `0` zoom/reset.
- Person cards are grouped by generation. Parent relationships use a shared parent junction and a bounded sibling bar; spouse relationships are separate horizontal spouse connectors.
- A sibling is not stored as a direct relationship. Siblings are inferred from shared parent edges.
- Selecting a person animates the camera toward the card, highlights it, and opens a museum-style person drawer over the chat rail. Closing or clicking away clears the highlight.
- The canvas uses an app-rendered SVG cursor layer for fine pointers. Empty space shows an open hand, active panning a closed hand, and cards a pointing hand. The layer is `pointer-events: none`; actual controls remain underneath.

### Person records

- A person includes display/given/family names, explicit male/female/unknown, birth/death dates, legacy place text, structured birth/death city and country, biography, and an optional portrait attachment.
- Dates are shown in readable month/day/year prose but entered with clearly labeled native date controls.
- The drawer’s `Edit` button enables labeled in-place editing. Portraits can be uploaded, changed, or removed by clicking the portrait area.
- Relationship sections expose per-section `+` controls for parents, spouse, children, and siblings. Existing-person suggestions include display name, birth year, and place. A typed unmatched name creates a new person and connects it.
- Parent edges are directional: `fromPersonId` is the parent and `toPersonId` is the child. Spouse edges are treated symmetrically by readers even though one database row stores the two IDs.
- Direct relationships have removable `×` controls. Deleting a person requires confirmation and removes that person’s tree connections and story-person links.
- The redundant bottom “Add a family connection” form and the separate “Add a name” form are not part of the active drawer.

### Chat agent

- The editor chat uses the OpenAI Responses API, defaults to `gpt-5.4`, uses strict function tools, sets `store: false`, and supplies the current D1 tree on every request.
- It has create/read/update/delete behavior for people, parent/spouse relationships, stories, and private attachments.
- Agent proposals are not shown as review cards. The client applies them automatically in dependency order: people, person updates, relationships, stories, then deletions.
- The chat shows `Thinking…`, then a concise count of applied changes. Failed mutations and genuinely ambiguous conflicts appear as plain assistant text.
- Recent conversation context is the last six messages; D1 remains the source of truth and the full current tree is included in each agent request.
- People named in an answer are highlighted and the UI returns to the tree view.
- Public read-only questioning remains implemented through `/api/ask`. Under temporary open-editor mode the mutation-capable editor is shown to everyone instead.

### Reconciliation and conflicts

- Incoming people are compared by normalized, diacritic-insensitive display name plus birth/death dates and birth city/country.
- One compatible existing match becomes an `update_person`; it does not create a duplicate.
- Compatible repetitions inside one import batch are collapsed into one merged person proposal.
- Empty fields, capitalization, formatting, and more-complete incoming values are resolved automatically.
- A contradictory identity field or multiple plausible same-name people produces a focused clarification containing candidate IDs and birth/place evidence. Other unambiguous records from the same import continue processing.
- Explicit accidental-duplicate requests can merge useful facts into the canonical person and delete the duplicate through normal agent tools and audited mutations.
- Exact display-name resolution is used for relationships to people created in the same response. If more than one stored person has that exact name, the mutation fails closed and asks for disambiguation rather than choosing arbitrarily.

### Files, folders, and ZIP archives

- The composer has `Add files` and `Add folder`. The folder picker uses `webkitdirectory`/`directory` and preserves each file’s `webkitRelativePath` in the manifest.
- Individual files have no restrictive browser `accept` filter, so ZIPs and unusual evidence files remain selectable.
- Limits are **50 MB per file** and **100 MB total per request**. The UI’s friendly error repeats these values.
- ZIP traversal is recursive because nested entry paths are preserved. Supported extracted types are HTML, CSS, JavaScript, JSON, text, Markdown, CSV, XML, GEDCOM, JPEG, PNG, WebP, and GIF.
- ZIP expansion is bounded before inflation: 4 MB per selected entry, 30 MB selected extracted data, 500 selected entries, one million extracted text characters, and 40 model-visible images.
- Embedded ZIP images are saved as individual private R2 attachments and also supplied to the model. A portrait attachment ID is used only when archive evidence clearly identifies the person pictured.
- The original uploaded ZIP is retained as a private attachment in addition to extracted embedded images.
- Unsupported binary formats are still stored as evidence; the model receives filename, content type, and size rather than unreadable bytes.
- Uploads are persisted before model inference. If inference fails, the evidence attachment remains available for a later request or explicit deletion.

### Timeline and map

- `Tree`, `Timeline`, and `Map` share the same D1 tree state.
- Timeline events are generated from person birth/death dates and dated stories, sorted by their stored date strings.
- The world map uses structured city/country fields and a finite built-in coordinate dictionary in `lib/archive-views.ts`.
- Unknown map locations are listed as awaiting coordinates; there is no live geocoding service.
- Selecting a timeline person or map location opens that person’s drawer. Multiple people at one mapped location are grouped under one marker.

## Authentication and security

- The intended production editor model is Sign in with Apple plus the comma-separated `EDITOR_EMAILS` Worker value.
- The Apple identifiers are Darabiha-specific: App ID `com.darabiha.web`, Services ID `com.darabiha.family`, callback `https://darabiha.com/api/auth/apple/callback`.
- Worker secrets include the server-side OpenAI key, Apple private key, session secret, and editor allowlist. Values are not recorded in this repository.
- With `TEMPORARY_OPEN_EDITOR = false`, anonymous mutation endpoints return 401 and signed-in non-allowlisted accounts return 403.
- With the current `true` value, `requireEditor()` returns the real Apple user when present or a clearly named temporary editor identity; uploads and all mutations are therefore public during this test period.
- Uploaded evidence is private in R2. `/api/files/:id` requires editor access. Portrait delivery uses `/api/photos/:id` so selected portraits can render on the public tree.
- Every applied proposal, upload, and portrait change writes an audit entry to `change_log`.

## Storage and graph model

- D1 binding: `DB`, database `darabiha-family`.
- R2 binding: `FILES`, bucket `darabiha-family-files`.
- Tables: `people`, `relationships`, `stories`, `story_people`, `attachments`, `story_attachments`, and `change_log`.
- `relationships.type` is `parent` or `spouse`; cousins and siblings are derived relationships.
- `ensureSchema()` creates missing tables and performs compatibility `ALTER TABLE` attempts for structured place columns and `gender`. Drizzle migration `drizzle/0003_person_gender.sql` records the explicit gender addition for fresh migration workflows.
- `readTree()` returns people, relationships, stories, story-person IDs, and story-attachment IDs in one `FamilyTree` payload.
- Deleting an attachment clears portrait references and story links, deletes its D1 metadata, and removes its R2 object.

## API map

- `GET /api/tree`: public current tree.
- `POST /api/ask`: public grounded questions over the current tree.
- `POST /api/agent`: multipart editor chat, files/folders/ZIP inference, reconciliation, and strict tool proposals.
- `POST /api/changes`: validates and applies one agent proposal.
- `POST /api/people`: manual person CRUD, relationship mutation, and portrait upload/removal.
- `GET /api/files/:id`: private raw attachment delivery.
- `GET /api/photos/:id`: public portrait delivery.
- `GET /api/version`: uncached deployment identity.
- `/api/auth/apple`, `/api/auth/apple/callback`, `/api/auth/signout`: Apple session flow.

## Important files

- `app/components/FamilyTreeApp.tsx`: shell, chat, auto-apply loop, add-person flow, person drawer, relationship controls.
- `app/components/FamilyTreeCanvas.tsx`: generation rendering, connectors, pan/zoom, animated focus, Safari cursor layer.
- `app/components/ArchiveViews.tsx`: timeline and map UI.
- `app/api/agent/route.ts`: file limits, archive ingestion, OpenAI tools and instructions.
- `lib/agent-reconcile.ts`: deterministic duplicate matching and conflicts.
- `lib/archive-import.ts`: bounded ZIP filtering and extraction.
- `lib/archive-views.ts`: timeline events and map coordinates.
- `db/store.ts`: schema compatibility, D1/R2 reads, audited mutations.
- `app/authz.ts`: Apple allowlist and the current temporary bypass.
- `lib/build.ts`: visible production version/build identity.
- `tests/browser/public-tree.spec.ts`: live Chromium/WebKit production coverage.
- `scripts/extract_legacy_family_tree.py`: reproducible old-archive graph reconstruction and standalone HTML generator.
- `scripts/validate_legacy_family_tree.mjs`: structural regression checks for the reconstructed archive.
- `docs/legacy-family-tree-import-report.md`: extraction rules, graph counts, complex marriages, and same-name identity audit.

## Build, deploy, and verification

The active deployment path is Cloudflare Workers, not Sites. `.openai/hosting.json` is historical project metadata.

```sh
npm test
npm run lint
npm run build
npm run test:browser
```

`npm run test:browser` targets `https://darabiha.com` by default and therefore verifies the currently deployed version. When changing the expected version, deploy before running that suite or supply an intentional preview `PLAYWRIGHT_BASE_URL`.

Production deployment:

```sh
npm run build
npx wrangler deploy --config wrangler.jsonc --keep-vars
```

Post-deploy identity check:

```sh
curl -fsS https://darabiha.com/api/version
curl -fsSI https://darabiha.com/
curl -fsSI https://darabiha.com/api/auth/apple
```

The current Worker has D1, R2, public-origin, and Apple identifier bindings in `wrangler.jsonc`; private values remain Worker secrets.

## Safari interaction fact pattern

- Versions 2–5 repeatedly changed CSS cursor declarations. Web Inspector reported correct computed cursor values and Playwright WebKit passed, while real Safari on macOS continued to draw the arrow.
- Version 6 replaced native-cursor reliance with the app-rendered cursor layer and one unambiguous canvas hit surface. Real Safari screenshots verified the open-hand and clickable-card hand on that release.
- Version 43 retains that fallback. Its automated WebKit cursor, pointer-capture, card-click, wheel containment, and pan tests pass.
- Version 43 was not separately declared physically verified in real Safari during the archive-management pass. Playwright WebKit is regression coverage, not proof of the macOS cursor or physical trackpad gesture.

## Known follow-ups and boundaries

- Re-enable Apple enforcement only after the owner confirms Nasser’s lockout is cleared and all invited accounts can complete the real flow.
- The current map coordinate dictionary is intentionally finite; new locations can appear in the unmapped list until coordinates are added or a geocoding design is chosen.
- The live tree has no stories yet, so story CRUD is implemented and unit/build validated but has little production content exercising its presentation.
- The five lint warnings listed under “Live state” are non-blocking technical debt; the unused legacy `PersonModal` can be removed separately without changing the active `PersonModalV2` drawer.
- A real Safari/macOS pass remains the final authority for visible cursor and physical gesture behavior after future canvas changes.
- Direct database deletion was not used for duplicate cleanup. The supported UI and agent deletion paths preserve auditability and relationship cleanup.
