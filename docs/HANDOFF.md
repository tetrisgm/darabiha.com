# Darabiha handoff

Last updated: 2026-08-26

## Read this first

- Production is `https://darabiha.com`, deployed directly to Cloudflare Worker `darabiha-family` from `main` in `~/dev/darabiha.com`.
- The live release is **Version 61**, `BUILD_ID=293e3a9`.
- The release spans commits `6543b81..0e1e56c` (2026-08-26): the corrected legacy archive was imported into the live D1 tree, the canvas got a real family-tree layout, the root page was fitted into the Worker CPU budget, the archive gained Family/Fan/List/Fill-in views with search, branch folding, and couple adjacency, gender was assigned across the tree, and the Family view became an Ancestry-style pedigree.
- `app/authz.ts` intentionally has `TEMPORARY_OPEN_EDITOR = true`. This is the owner-requested testing exception while Nasser’s Apple account is temporarily locked. Every visitor can currently mutate the archive. The Apple implementation and allowlist remain present but are not enforced.
- Apple enforcement is restored by changing only that constant to `false`, testing all three invited family accounts, incrementing `lib/build.ts`, and deploying. The owner must first confirm that family Apple access is working.
- Production exposes its uncached identity at `/api/version` and as visible version text at the lower-left edge.
- **The Worker CPU limit is tight** (behaves like the Workers Free plan's 10 ms): server-rendering or serializing the 410-person tree per request produced intermittent Cloudflare 1102/503s under sustained load. The root page therefore ships a light shell and fetches `/api/tree` client-side, the canvas renders after hydration, and `readTree()` keeps a 10-second serialized-JSON cache that every mutation refreshes. Under a 60-request hammer the root now returns 200 every time. Re-introducing per-request tree serialization or SSR of the canvas will bring the 503s back; alternatively a paid Workers plan removes the constraint.

## Live state verified on 2026-08-26

- `/api/version` returns `{"version":61,"build":"293e3a9","deployedAt":"2026-08-26"}`.
- `/` returns 200 with `cache-control: no-store, must-revalidate` and held 200 across 60 consecutive requests.
- `/legacy-family-tree` returns the corrected 183 KB outline reconstruction; `/legacy-family-tree-data.json` returns 407 people, 680 relationships (543 parent, 137 spouse), 14 documents, nine photograph records, and zero identity warnings; `/legacy-photos/*.jpg` serves the eight unique photograph files.
- `/api/auth/apple` returns 302 to Apple with the Darabiha callback URL.
- The public D1 tree currently reports **408 people, 682 relationships (545 parent, 137 spouse), and 0 stories** (a duplicate bare `Aydin` beside `Aydin Darabi` was removed 2026-08-26). Gender is recorded for 400 of 408 people (204 men, 196 women), assigned by `scripts/enrich_gender.mjs` from a curated given-name lexicon plus heterosexual-marriage deduction (owner-authorized assumption), with zero same-gender-marriage conflicts as cross-validation. Eight stay NULL deliberately: ambiguous names (Heshmat Ghazvini Hosseinzadeh, Karen Kamali, Meesha Darabi, Sasha Darabi, Setia Darabi, Shervine Eftekhari Rad, the coded `xAsJ 17 Bemanian`) and Ramine Darabiha, whose gender the archive should hear from Ramine rather than guess — the corrected legacy archive merged with the previously hand-entered records (see “Main tree data” below).
- A case-insensitive exact-name scan reports one duplicate display name: the two genuinely distinct Abbas Darabi (generations 5 and 7). Agent operations that resolve people by exact name fail closed and ask for clarification on that name.
- `npm test`: 17 unit tests passed. `npx tsc --noEmit` is a mandatory release gate — `npm run build` does NOT typecheck, which is how Version 54 shipped a `ReferenceError` (see the Version 55 record below).
- `npm run test:browser`: 28 live tests passed across Chromium and Playwright WebKit, twice consecutively. Canvas tests open the Full tree tab through the `openFullTree` helper (the default view is Family), and card inspections wait for the client-side tree fetch.
- `npm run legacy:validate`: 407 people, 680 relationships, 14 documents, and nine photographs passed graph, connectivity, and audited-family-fact validation.
- `npm run build` passes.
- `npm run lint` exits successfully with six known warnings: one unused legacy `PersonModal`, four raw `<img>` warnings, and one exhaustive-dependencies warning in the canvas focus effect.
- The git checkout was clean when this handoff was written.

### Versions 54–61 (2026-08-26)

- **Version 61** (`293e3a9`): self-service disconnect for linked sign-ins. The members API `unlink` action no longer requires an admin when the identity belongs to the caller's own account (resolved through `resolveMemberEmail` on both sides); unlinking someone else's identity still does. The Linked sign-ins card on `/settings` shows a disconnect × per linked identity, which unlinks and reloads. Verified live end-to-end with the owner's real link: disconnecting `leshokunin@gmail.com` immediately dropped that very session to the NO ACCESS state with the identity standing alone, and re-linking (SQL + change_log restore) returned it to the canonical `ramine@ramine.net` admin account.
- **Version 60** (`ae30884`): one account across Apple and Google. A `member_links` D1 table maps any sign-in email to its canonical account email; `resolveMemberEmail` feeds `getMemberRole`, the members API (role/remove actions accept any linked identity), and the settings "· you" marker. Linking is self-service on `/settings` ("Link an Apple sign-in" / "Link a Google sign-in"): the initiating account travels inside the HMAC-signed OAuth `state` as `linkTo` — deliberately NOT via the session cookie, because Apple's cross-site `form_post` callback arrives without SameSite=Lax cookies — and the callback links the freshly proven identity. Linking an identity that has its own member row merges the accounts (higher role wins, links re-pointed so chains never form); an identity linked to a different member is refused (`identity_linked_elsewhere`). Admins see `↪ linked identity` lines under each member with an unlink ×; `removeMember` also deletes the account's links; all link changes land in change_log (`member_link`/`member_unlink`). The owner's two identities were merged through the admin API: `ramine@ramine.net` is the canonical admin account with `leshokunin@gmail.com` (Google) linked — verified live, including a full idempotent round trip of the Google link flow. Apple sign-in/link errors now redirect to `/settings?auth_error=…` (the sign-in buttons live there).
- **Version 59** (`c4a8cb5`): Google sign-in is live. The owner signed the Browser pane into the Google Cloud console; the session then created GCP project `darabiha` (org `leshokunin-org`), configured the Google Auth Platform (app "Darabiha", support email `leshokunin@gmail.com`, contact `ramine@ramine.net`, home page + authorized domain `darabiha.com`, External audience, basic scopes openid/email/profile registered) and the OAuth client **Darabiha web** — client id `609728074887-19vq3ijncoivuu1udt6b3p2ugg6c86gr.apps.googleusercontent.com` (a `wrangler.jsonc` var), redirect URI `https://darabiha.com/api/auth/google/callback`. The shown-once client secret was filed per the fleet rule: login Keychain `darabiha-google-oauth` (verified byte-identical) and Worker secret `GOOGLE_CLIENT_SECRET`. The full flow was verified end-to-end in production: /settings → Google account chooser branded "to continue to darabiha.com" → consent → callback → session; a non-member correctly saw the NO ACCESS state, and after `leshokunin@gmail.com` (the owner's Google identity) was seeded as a second admin (change_log `member_set`), the admin member manager rendered all four members with role toggles and remove controls. **Open item:** the consent screen is still in **Testing** publishing status — the Audience page's "configuration is incomplete → visit Branding" banner kept "Publish app" disabled through ~25 minutes of retries even though every branding field, scope, and contact is saved and verified; this looks like the console's own "5 minutes to a few hours" propagation. Until it is published, only the three registered test users (`leshokunin@gmail.com`, `nasserdarabiha@gmail.com`, `parissima.d@gmail.com`) can sign in with Google, and their consent re-prompts every 7 days. Next session: open Google Auth Platform → Audience (project `darabiha`) and click **Publish app** once the banner clears — no verification is needed for these basic scopes.
- **Version 58** (`0987951`): member roles and a settings page. A `members` D1 table (email → `admin`/`editor`, with change_log entries `member_set`/`member_remove`) now decides who can edit; `ensureSchema` seeded it on first run with `ramine@ramine.net` as admin plus the old `EDITOR_EMAILS` allow-list (`nasserdarabiha@gmail.com`, `parissima.d@gmail.com`) as editors — verified in the remote database. `/settings` (server page + `SettingsClient`) offers Apple and Google sign-in, shows the signed-in identity and role badge, and gives admins a member manager: add by email, toggle role, remove, with a last-admin guard against lockout. `/api/members` (GET/POST) requires an admin via the new `requireAdmin` in `app/authz.ts`, which is deliberately NOT opened by `TEMPORARY_OPEN_EDITOR`. Sign-in is now open to any Apple or Google account — membership grants rights, so the Apple callback's invited-email gate was removed and `EDITOR_EMAILS` survives only as the one-time seed. A site-specific Google OAuth flow exists at `/api/auth/google` (+ `/callback`, full id_token signature/nonce/audience verification, sessions shared with the Apple flow) but returns 503 until `GOOGLE_CLIENT_ID` (wrangler var) and `GOOGLE_CLIENT_SECRET` (Worker secret) are configured — the settings page hides the Google button until then. The browser suite grew to 28 tests (settings page renders; `/api/members` refuses anonymous GET and POST). (The client itself was created in Version 59.)
- **Version 57** (`7172d8a`): the Fill-in view is now a sortable table — a header row (First name, Last name, Born, Gen, Missing) sorts on click and reverses on a second click, defaulting to family name; sorting by generation groups rows under generation headings, and a select filters to a single generation. Generation numbers come from the spouse-aware `buildGenerations`, so married-in relatives stand on their spouse's row. The family name is the last non-parenthesized token of the display name (parenthesized alias/marker tokens are skipped). The relatives context line moved into a row's expanded form. Clicking the **Darabiha** wordmark returns to the Family view. Data fix: `Mahtab Abarghoui (2)` was renamed to `Mahtab Abarghoui` through the audited update path — the `(2)` was the legacy archive's same-name marker, now noted in her biography; she is the only Mahtab Abarghoui in the tree.
- **Version 56** (`57e1abb`): the profile drawer opens BESIDE the chat rail (`.person-drawer-backdrop` `inset: 0 auto 0 430px`, full-width again under `main.chat-collapsed`) so the conversation stays available while a record is open. Both chats show a context chip naming the open person — the editor chat prefixes its message so shared details apply to that person, the public chat prefixes `/api/ask` so questions are answered about them, and the chip's × closes the record. The profile ‹ › history arrows were also moved into `PersonModalV2`; an earlier insert had accidentally placed them in the Add-person dialog.
- **Version 55** (`e40fd09`): fixed the user-reported List-view crash — `buildDescentModel` had been deleted along with the Fan view and the untypechecked build shipped it as a runtime `ReferenceError`, which the localStorage view persistence made sticky across refreshes. The function was restored, two latent type errors fixed, `npx tsc --noEmit` added to the release gates, and `app/error.tsx` now clears the saved view and the `?p` URL before reset so an error page can never trap the visitor.
- **Version 54** (`02432f1`): an Editorial Luxury design pass across the whole site — Plus Jakarta Sans body + Cormorant Garamond display (Inter removed), a warm paper/ink/sage token palette in `app/globals.css` `:root`, a fixed grain overlay in `app/layout.tsx`, a floating island action bar, double-bezel pedigree cards, staggered rise-in entrances, a shimmer skeleton on `[aria-busy]`, and consistent custom cubic-bezier motion. It also made person navigation real browser history: `openPerson` pushes `?p=<id>` with `pushState`, popstate walks back/forward, and a `?p` URL restores the drawer after the tree loads. Fill-in became a full searchable list of every incomplete card with seeded forms.

## Product behavior

### Main tree data (imported 2026-08-26)

- The live D1 tree is now the corrected legacy archive merged with the family's hand-entered records. `scripts/import_legacy_tree_to_d1.mjs` performed the merge (change_log kind `import_legacy_archive`): 390 people added, 17 existing records matched to archive identities through an explicit variant-name table (`Mohammad Zehtab Darabi` = the archive's `Mohammad Darabi` G4, `Jila Darabiha` = `Jila Khosravi Saeed`, `Salmeh` = `Salameh X`, and so on), 7 birth/death year fills into NULL fields only, and 659 relationships added; the 21 pre-existing relationships all matched archive facts and were kept as-is.
- Existing people kept their ids, display names, portraits, places, and full birth dates. Archive-only people carry year-only dates (the UI renders bare years correctly) and, where relevant, a biography note with archive aliases or a placeholder-code explanation.
- The former leftovers are resolved (2026-08-26): the junk `unused` person was deleted through the audited removal path, and the family biography identified the two disconnected people — `Mehdi Zehtab` (called `عاريه بند ها`/Ariyehbandha in the text, matching the archive's `Farkhondeh Ariyehbandha`) is Farrokhandeh's father and Ramazan Darabi's one-time employer, and `Haj Mirza Agha Masoudi` is Robabeh Masoudi's father; both are now connected as parents. In-law fathers sit one row above their daughters; the daughters anchor under their fathers and reach their husbands by marriage elbows.
- The one known data conflict is resolved: Parissima Darabiha's birth date was a typo (`1983-09-09`) and was corrected to `1987-09-09` on 2026-08-26 through the audited update path, matching the archive's 1987.
- Re-running the import script after a successful import is a no-op; `--execute` runs wrangler against the remote database, without it the script only writes SQL and a report.

### Profile drawer and marriage status (Version 53)

- The drawer edits everything in place: name, gender chips, birth/death dates and structured places, and the biography are click-to-edit fields saving single-field patches through `/api/people` `update` (the Edit toggle, the "Family member" eyebrow, the redundant date line, and the dead legacy `PersonModal` are gone). Names of other family members inside a biography render as clickable links.
- Spouse relationships carry an optional `status` column (`divorced` | `widowed`; NULL means married): `ensureSchema` adds it with a compatibility ALTER, `setRelationshipStatus` writes it with a change_log entry, `/api/people` action `relationship_status` exposes it, a select beside each spouse chip edits it, and ended marriages render fainter on the Tree canvas (`.spouse-connector.is-ended`).
- Tree-canvas cards use the same gendered silhouettes as the pedigree (the separate gender glyph chip was removed).
- **Fill in** is a searchable list of every incomplete card (youngest generations first): click a row to fill gender/dates/places in place or jump to the full record; the one-at-a-time queue and its localStorage skip list are gone.
- A biography-mining pass (2026-08-26) filled facts stated or strongly implied by the family biographies: Ghassem Darabi died in Tehran (the family moved there in 1326 SH/1947; he died 1358/1979), Mohammad Zehtab Darabi and Hossein Zehtab Darabi died in Qazvin (both died before the Tehran move). The biographies also name Robabeh Masoudi's siblings (Ebrahim, Esmail, Mahmoud, Fatemeh, Masoumeh) who are not yet people in the tree — a candidate future addition.

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

### Views, search, and navigation

- The header offers six views — **Family** (default), **Tree**, **List**, **Timeline**, **Map**, **Fill in** (the Fan view was removed 2026-08-26 at the owner's request) — plus a person search whose picks open the drawer, set the focal person, and (on the Tree) unfold and center on them. The chosen view persists in `localStorage` (`darabiha-view`).
- **Family** (`app/components/TreeViews.tsx FocusFamilyView`): an ancestry.com-style pedigree — the focal couple in the middle with gendered portrait silhouettes (blue male / rose female / gray unknown, photos where added), children stacked left grouped by marriage, parents and grandparents branching right with measured SVG connector elbows, dashed `＋ Add father / Add mother` ghost slots, and a collapsible sibling list. Clicking any person centers the pedigree on them AND opens their record in one action; browser-style ←/→ arrows walk the focal history (past/future stacks in the app shell). The initial focal person is Nasser Darabiha; a spouse card shows `divorced`/`widowed` when a marriage status is set.
- **List** (`OutlineView`): the whole family as an indented outline, fully expanded by default (collapsible per branch), marriages inline, names opening the drawer. It depends on `buildDescentModel` in `TreeViews.tsx` — that function was deleted once alongside the Fan view removal and crashed the view in production (Version 55 restored it); typecheck before shipping.
- **Fill in** (`MissingDataView`): a searchable list of every incomplete card — the missing fields named (gender, birth date, birth place, photo), inline inputs saved through the audited `/api/people` update path, or a jump to the full record. This list is the intended route to a fuller Timeline and Map, which can only show people with dates and places.
- **Full tree** folds deep branches: every parent card carries a chip (`▸ N` folded with the number of people inside, `▾` expanded); branches at generation row 4 and deeper start folded, a control beside the zoom buttons folds/unfolds everything, and focusing a hidden person unfolds their ancestor chain automatically.

### Tree and navigation

- The main surface is a full-height, Figma-like 2D family-tree canvas beside a 430 px left chat rail. The canvas renders after hydration (`useSyncExternalStore` gate) and the tree data arrives from `/api/tree` client-side; a light shell is server-rendered.
- Click-drag pans. Wheel/trackpad input zooms around the cursor. The lower-right controls zoom out, show/reset the percentage, and zoom in. Keyboard arrows pan; `+`, `-`, and `0` zoom/reset.
- `lib/tree-layout.ts buildFamilyLayout` lays the tree out as a classic genealogy chart: a couple sits side by side (a person with two marriages sits between the spouses), children hang directly beneath their parents, and each sibling brings their own family block. A married-in spouse (no recorded parents) joins their partner's couple row; a spouse with recorded parents anchors under them and always shares their partner's row; co-parents without a recorded marriage still stand together. Children are drawn once, under the parent with the deeper and larger recorded ancestry (so recording a bride's father never pulls her husband's family out of the main line); a rootless in-law parent sits one row above their shallowest child. The world is anchored so the page opens on the patriarch (Haj Chorok, generation 1).
- Connectors carry exactly one meaning each, named by a small legend on the canvas: dashed amber is always and only marriage, a solid blue T is always and only descent. Married couples now always stand side by side: the partner with the shallower recorded ancestry joins the deeper partner's row, their tie back to their own parents drawn as a blue descent elbow, and an in-law parent whose children all live beside spouses is placed directly above their child. 136 of 137 marriages render adjacent — the exception is a person with two spouses, who can only stand beside one. Children of a couple hang beneath them; a child drawn beside a spouse elsewhere joins the sibling bar by an elbow.
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
