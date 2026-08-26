# Darabiha handoff

Last updated: 2026-08-26

## Read this first

- Production is `https://darabiha.com`, deployed directly to Cloudflare Worker `darabiha-family` from `main` in `~/dev/darabiha.com`.
- The live release is **Version 48**, `BUILD_ID=b718d60`, Worker deployment `9c53fdfa-873e-4c8d-b714-8dc15e7827a5`.
- The release spans commits `6543b81..b718d60` (2026-08-26): the corrected legacy archive was imported into the live D1 tree, the canvas got a real family-tree layout with one-meaning-per-line connectors and fixed pixel geometry, and the root page was fitted into the Worker CPU budget.
- `app/authz.ts` intentionally has `TEMPORARY_OPEN_EDITOR = true`. This is the owner-requested testing exception while Nasser’s Apple account is temporarily locked. Every visitor can currently mutate the archive. The Apple implementation and allowlist remain present but are not enforced.
- Apple enforcement is restored by changing only that constant to `false`, testing all three invited family accounts, incrementing `lib/build.ts`, and deploying. The owner must first confirm that family Apple access is working.
- Production exposes its uncached identity at `/api/version` and as visible `Version 48` text at the lower-left edge.
- **The Worker CPU limit is tight** (behaves like the Workers Free plan's 10 ms): server-rendering or serializing the 410-person tree per request produced intermittent Cloudflare 1102/503s under sustained load. The root page therefore ships a light shell and fetches `/api/tree` client-side, the canvas renders after hydration, and `readTree()` keeps a 10-second serialized-JSON cache that every mutation refreshes. Under a 60-request hammer the root now returns 200 every time. Re-introducing per-request tree serialization or SSR of the canvas will bring the 503s back; alternatively a paid Workers plan removes the constraint.

## Live state verified on 2026-08-26

- `/api/version` returns `{"version":48,"build":"b718d60","deployedAt":"2026-08-26"}`.
- `/` returns 200 with `cache-control: no-store, must-revalidate` and held 200 across 60 consecutive requests.
- `/legacy-family-tree` returns the corrected 183 KB outline reconstruction; `/legacy-family-tree-data.json` returns 407 people, 680 relationships (543 parent, 137 spouse), 14 documents, nine photograph records, and zero identity warnings; `/legacy-photos/*.jpg` serves the eight unique photograph files.
- `/api/auth/apple` returns 302 to Apple with the Darabiha callback URL.
- The public D1 tree currently reports **410 people, 680 relationships (543 parent, 137 spouse), and 0 stories** — the corrected legacy archive merged with the previously hand-entered records (see “Main tree data” below).
- A case-insensitive exact-name scan reports one duplicate display name: the two genuinely distinct Abbas Darabi (generations 5 and 7). Agent operations that resolve people by exact name fail closed and ask for clarification on that name.
- `npm test`: 6 files, 16 tests passed.
- `npm run test:browser`: 24 live tests passed across Chromium and Playwright WebKit, twice consecutively. Tests that inspect cards now wait for the client-side tree fetch (`.tree-card` waitFor) before counting or clicking.
- `npm run legacy:validate`: 407 people, 680 relationships, 14 documents, and nine photographs passed graph, connectivity, and audited-family-fact validation.
- `npm run build` passes.
- `npm run lint` exits successfully with five known warnings: one unused legacy `PersonModal`, three raw `<img>` warnings, and one exhaustive-dependencies warning in the canvas focus effect.
- The git checkout was clean when this handoff was written.

## Product behavior

### Main tree data (imported 2026-08-26)

- The live D1 tree is now the corrected legacy archive merged with the family's hand-entered records. `scripts/import_legacy_tree_to_d1.mjs` performed the merge (change_log kind `import_legacy_archive`): 390 people added, 17 existing records matched to archive identities through an explicit variant-name table (`Mohammad Zehtab Darabi` = the archive's `Mohammad Darabi` G4, `Jila Darabiha` = `Jila Khosravi Saeed`, `Salmeh` = `Salameh X`, and so on), 7 birth/death year fills into NULL fields only, and 659 relationships added; the 21 pre-existing relationships all matched archive facts and were kept as-is.
- Existing people kept their ids, display names, portraits, places, and full birth dates. Archive-only people carry year-only dates (the UI renders bare years correctly) and, where relevant, a biography note with archive aliases or a placeholder-code explanation.
- Untouched leftovers with no archive counterpart: `Mehdi Zehtab`, `Haj Mirza Agha Masoudi` (both disconnected), and a junk person literally named `unused` — candidates for family cleanup through the normal UI.
- The one known data conflict is resolved: Parissima Darabiha's birth date was a typo (`1983-09-09`) and was corrected to `1987-09-09` on 2026-08-26 through the audited update path, matching the archive's 1987.
- Re-running the import script after a successful import is a no-op; `--execute` runs wrangler against the remote database, without it the script only writes SQL and a report.

### Reconstructed legacy archive

- `public/legacy-family-tree.html` is a read-only reconstruction of Nasser's `Darabi_Family_Tree_RD.zip`; it does not mutate or replace the current D1 tree. Version 45 replaced the first reconstruction after a full correctness audit (2026-08-25): the original had 35 people with zero relationships (the youngest generation was created but never linked), roughly ten spelling-variant duplicate people, missing marker-inferred mothers, and a canvas whose straight same-row marriage lines read as mass marriages.
- The page is now a small nested outline (about 183 KB): children indented under parents, marriages inline with `⚭`, `(1)`/`(2)` numbering multiple marriages, cousin marriages annotated with the shared ancestor and cross-referenced so nobody is listed twice, plus search, the photographs, and the 14 narrative documents. Photographs live in `public/legacy-photos/` and lazy-load; the page never draws connector lines.
- `public/legacy-family-tree-data.json` contains 407 normalized people, 543 parent/child links (256 second parents inferred from a single recorded marriage or a marker, flagged `inferred`), 137 marriages, the five related-spouse marriages, the documents, and photograph metadata with person links.
- The source ZIP remains outside the repository and is never modified. Its SHA-256 is `ed5e7b3ae3686670e5e536e1ee7949174cca197f15e7cfbafc978764268138ee`. `scripts/extract_legacy_family_tree.py` reproducibly regenerates the HTML, JSON, photographs, and `docs/legacy-family-tree-import-report.md` from it. The ZIP stores its Persian filenames without the UTF-8 flag, so the extractor repairs `zipfile`'s CP437 decoding before use.
- Folder nesting is the parent/child authority; family-table rows supply spouses and dates; `(1)`/`(2)` markers are family-scoped, never global; unlabeled grandchild columns are harvested for fuller names and markers; generation-6 dates exist only in the header name lists. A subtree copied beneath both spouses of a cousin marriage is merged by name plus parent union, iterated to a fixpoint.
- Pure placeholders (`Xxx Darabi`, `---`) are omitted; coded names (`xAsJ_17 Bemanian`, `xKoJ_41a`) are kept as the archive's deliberate unknown-name records. Spelling variants merge only under strict rules — Ali and Alireza Eftekhari Rad are different brothers and must never merge; variant spellings are preserved as `aliases`.
- Exact same-name people remain separate when their parents differ: two Mohammad Darabi (G4, G6), two Hossein Darabi (G5, G7), two Abbas Darabi (G5, G7), two Ali Jaberian (G7, G8). Paniz Darabi and Paniz Darabiha are likewise different girls.
- `npm run legacy:validate` checks referential integrity, duplicate edges, parent cycles, generation order, placeholder leakage, parent cardinality, full connectivity (no isolated people — the first reconstruction's failure mode), the audited family facts (Aria Golriz, Karen Kamali, Rojina and Afshin Khavarian, the Eftekhari Rad brothers, Farajollah's marker-split mothers), photograph files on disk, and the page payload.
- The reconstruction currently has no cycles, self-links, duplicate relationships, people with more than two parents, isolated people, placeholder leakage, or identity warnings.

### Tree and navigation

- The main surface is a full-height, Figma-like 2D family-tree canvas beside a 430 px left chat rail. The canvas renders after hydration (`useSyncExternalStore` gate) and the tree data arrives from `/api/tree` client-side; a light shell is server-rendered.
- Click-drag pans. Wheel/trackpad input zooms around the cursor. The lower-right controls zoom out, show/reset the percentage, and zoom in. Keyboard arrows pan; `+`, `-`, and `0` zoom/reset.
- `lib/tree-layout.ts buildFamilyLayout` lays the tree out as a classic genealogy chart: a couple sits side by side (a person with two marriages sits between the spouses), children hang directly beneath their parents, and each sibling brings their own family block. A married-in spouse (no recorded parents) joins their partner's couple row; co-parents without a recorded marriage still stand together. Children of a marriage between relatives are drawn once, under the parent closest to the root. The world is anchored so the page opens on the patriarch (Haj Chorok, generation 1).
- Connectors carry exactly one meaning each, named by a small legend on the canvas: a dashed amber line always and only means marriage (a short line between an adjacent couple; a raised elbow routed between rows for the five cousin marriages, so it never crosses cards), and a solid blue T always and only means descent - a drop from the couple's marriage-line midpoint (or the lone recorded parent) to a bar over the children, with a stem to each child. A parent drawn in another family block is connected by the marriage elbow alone. 132 of 137 marriages render as adjacent couples.
- The world uses fixed pixel geometry (15 rem cards, 270 px slots, 190 px rows), so couple gaps, dash patterns, and bar lengths are identical on every screen; the viewport transform provides pan and zoom. The earlier percentage-of-viewport coordinates made adjacent spouses touch on narrow panes and hid their marriage line. The view opens centered on Haj Chorok; the centering effect retries with requestAnimationFrame until the canvas measures a nonzero width.
- All canvas geometry (positions, marriage paths, parent hooks) is memoized per tree and never recomputed during pan/zoom frames.
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

- `GET /api/tree`: public current tree, served from a 10-second serialized cache refreshed by every `readTree()` (mutations always return a fresh tree directly).
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
- `scripts/import_legacy_tree_to_d1.mjs`: additive merge of the corrected archive into the live D1 tree (idempotent after success).
- `lib/tree-layout.ts`: generation depths and the classic family-block canvas layout.
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
- Version 47 keeps the cursor-layer fallback; the family-layout rewrite changed card positions and connector shapes but not the hit surface, cursor layer, or gesture handling. Automated WebKit cursor, pointer-capture, card-click, wheel containment, and pan tests pass.
- Version 47 was not separately declared physically verified in real Safari. Playwright WebKit is regression coverage, not proof of the macOS cursor or physical trackpad gesture.

## Known follow-ups and boundaries

- Re-enable Apple enforcement only after the owner confirms Nasser’s lockout is cleared and all invited accounts can complete the real flow.
- The current map coordinate dictionary is intentionally finite; new locations can appear in the unmapped list until coordinates are added or a geocoding design is chosen.
- The live tree has no stories yet, so story CRUD is implemented and unit/build validated but has little production content exercising its presentation.
- The five lint warnings listed under “Live state” are non-blocking technical debt; the unused legacy `PersonModal` can be removed separately without changing the active `PersonModalV2` drawer.
- A real Safari/macOS pass remains the final authority for visible cursor and physical gesture behavior after future canvas changes.
- Direct database deletion was not used for duplicate cleanup. The supported UI and agent deletion paths preserve auditability and relationship cleanup.
