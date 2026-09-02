# Platform plan: the state-of-the-art agentic family tree

Owner decisions (2026-09-01): the platform is a **fork-and-deploy template**,
generalized **in place in this repo** (darabiha.com stays the living reference
instance deploying from `main`), and the repo will eventually be **public**
after real family data is scrubbed from the tree. Multi-tenant SaaS is out of
scope; the store is deliberately one-Worker-one-family.

## North star (owner, 2026-09-01)

The bar is pen.dev / paper.design in their categories: the agent is the
primary creator, not a feature. Concretely, three properties:

1. **Genesis by conversation.** A brand-new archive interviews its family
   into existence: people, relationships, and stories appear on the live
   canvas as the founder talks, every fact carrying interview provenance.
   No genealogy software knowledge required - the agent is the interface.
2. **The archive is itself a tool.** A hosted MCP server exposes the
   archive to whatever agent the family already uses (Claude, ChatGPT,
   Cursor). External agents read freely within visibility rules and write
   only through the existing proposal/claims/adjudication pipeline - the
   audited, reversible boundary already built is exactly the right trust
   contract for third-party agents. Raw CRUD is never exposed over MCP.
3. **Agent-runnable making.** "Talk with agents and make it" includes the
   deployment: the repo carries an agent-first setup path (AGENTS.md plus
   a setup skill/script) so a stranger tells their coding agent "set up my
   family's archive" and the agent provisions D1/R2, walks OAuth
   registration, sets OWNER_EMAIL, and deploys. Docs are written for
   agents first, humans second.

The differentiator to protect while building this: claim-level provenance,
disputed-claim adjudication, reversible audited mutations, and living-person
redaction. Mainstream products have none of these; every new agentic surface
must route through them rather than around them.

## Status (2026-09-02)

Phases 1–7 are substantially shipped (versions 199–205): config spine and
ownership, templated prompts, README/AGENTS.md/`scripts/setup.mjs`/`npm run
deploy`, tree scrub (history rewrite still the owner's call), hosted MCP with
read tools, propose-scope write tools into the editor-reviewed
`agent_proposals` queue, refresh-token rotation with replay revocation,
genesis interview on an empty archive, env-parameterized browser suites, and
the model seam in `lib/model.ts`. Still open: a second model provider behind
that seam, the production run of the MCP loop (blocked on the account D1
quota reset), i18n language-set configurability plus the fa-font conditional
(build-time constraint), a real geocoder for the map, and the public-history
decision.

A 2026-09-01 survey found the core already generic — data model, GEDCOM
import/export, auth mechanics, claims/provenance, agent tooling, `/demo`
(invented people, no network). The instance coupling is: ~30 files of brand
constants, the committed Cloudflare/OAuth identity, a seeded
`ramine@ramine.net` admin, Persian/French cultural assumptions in prompts and
i18n, and the Darabiha-only legacy-import toolchain. The only structural gap
is onboarding: a fresh deploy has no path to its first admin.

## Phase 1 — ownership and the config spine

- Replace the hardcoded admin seed in `db/store.ts` with `OWNER_EMAIL` (env),
  failing loudly when unset and the members table is empty. Scripts stop
  hardcoding the actor email the same way.
- `lib/archive-config.ts`: one module, env-fed with sensible fallbacks —
  archive name, tagline, `PUBLIC_ORIGIN` (exists), owner email, cookie/storage
  prefix, enabled languages, calendar note for prompts, mail domain.
- Thread it through the worst silent-wrong-output offenders first: GEDCOM
  export header/filename (`lib/gedcom.ts`, `app/api/export/route.ts`), digest
  email masthead/subject (`lib/digest.ts`), SMTP `EHLO`/`Message-ID` domain
  (`lib/smtp.ts` — SPF/DMARC alignment breaks for any other deployer), then
  titles/OG (`app/layout.tsx`), gate eyebrows (`app/page.tsx`), `app/error.tsx`.
- Root person becomes a `site_settings` row (`root_person_id`), admin-settable,
  falling back to the first person — replaces the
  `displayName === "Nasser Darabiha"` match in `FamilyTreeApp.tsx`.
- Cookie names keep their current values on this instance via config
  (`darabiha_session` etc.) so nobody is logged out; the template default is a
  neutral prefix.

## Phase 2 — prompts and languages

- Template the archivist/ask prompts (`lib/archivist.ts`,
  `app/api/ask/route.ts`): archive name, source languages, translation target,
  calendar guidance become config interpolations. The INTERVIEWING block is
  already generic.
- `lib/i18n.ts`: enabled languages from config; RTL becomes a per-language
  property; load the Vazirmatn font only when `fa` is enabled.
- `lib/family-facts.ts`: derive the "stories are kept in Persian" fact from
  the stories themselves, not an assertion.
- Normalize the model override: `app/api/ingest/route.ts` hardcodes `gpt-5`
  while ask/agent honor `OPENAI_MODEL`.

## Phase 3 — a stranger can deploy

- Root `README.md`: provisioning walk-through (create D1 + R2, the secrets
  list, Apple/Google OAuth registration, first deploy, first sign-in claims
  admin via `OWNER_EMAIL`), local dev, test commands.
- `npm run deploy` = build → `normalize-deploy-config.mjs` (already generic) →
  `wrangler deploy --keep-vars`; today the ritual lives only in HANDOFF.
- `wrangler.jsonc` becomes a template: neutral worker/bucket/database names, a
  `workers.dev` default instead of a zone route, placeholders instead of this
  account's D1 UUID and OAuth client IDs. A small setup script (or documented
  steps) writes the deployer's values. The Darabiha values move to an
  untracked local override so `main` still deploys production.
- Derive `BUILD_ID` from git at build time instead of hand-bumping
  `lib/build.ts`.

## Phase 4 — public scrub

- Unit-test fixtures with real relatives (birth dates included) become
  invented people (`tests/archive-views.test.ts`, `agent-reconcile`,
  `change-proposal`, `archive-import`).
- The legacy toolchain leaves the tree: `scripts/*legacy*`,
  `extract_legacy_family_tree.py`, enrichment scripts, all
  `*.generated.sql` (they contain real family stories), and
  `docs/legacy-family-tree-import-report.md` move to a private archive
  location; `fillcheck.mjs` is deleted. GEDCOM stays the supported import.
- `app/privacy/page.tsx` / `app/terms/page.tsx` become config-driven templates
  — today they name a specific data controller and would be false statements
  on anyone else's deploy.
- Comments citing production statistics and real people get neutralized as
  files are touched; no bulk rewrite.
- **History caveat for the owner**: family stories and fixtures live in git
  history, not just the tree. Before flipping the repo public, either rewrite
  history (`git filter-repo` — destructive, coordinate first) or re-root a
  fresh public history. Decision deferred; nothing above depends on it.

## Phase 5c — the intent layer: answer what families actually ask

Shipped in version 207. The insight (owner, 2026-09-02): incumbent services
expose record-management APIs — persons, relationships, sources — but the
questions people bring to a family tree are relational and narrative, and the
most successful features of the incumbents are exactly the ones that answer
them (Geni's path finder, WikiTree's connection finder, every "cousin
calculator"). The gap between `SELECT person WHERE` and "how am I related to
her?" is where an agentic product wins.

The questions, from what people actually ask:
- **"How am I related to X?"** — the most-asked question at any family
  gathering. Ego-aware: the member's linked person (`members.person_id`)
  anchors the answer, in kinship words ("your second cousin once removed").
- **"What was her life like?"** — a life told in order, not a field dump.
- **"Where does our family come from?"** — birth places by generation,
  oldest first, so migration reads as movement.
- **"What was the family like in 1950?"** — a year snapshot: born, died,
  alive, ages, with the honesty note that undated records are not counted.
- **"Who am I named after?"** — namesakes across generations, eldest first.
- **"Whose birthday is coming?"** — the digest's knowledge, on demand.
- Contribution is intent-shaped too: **`record_life_event`** ("Sara had a
  boy named Dara in March") composes the person + parent links as one call's
  worth of proposals, and **`suggest_correction`** files a disputed-fact
  question into the Fill-in tab — never touching the record — instead of
  demanding CRUD choreography.

`lib/family-answers.ts` is the single intent layer (pure, unit-tested); the
hosted MCP registry, the WebMCP page tools, and eventually the archivist all
answer through it. Ego reaches hosted MCP via the token's member →
`members.person_id`; WebMCP uses the page's identified viewer.

## Phase 5b — the page as a tool (WebMCP)

Shipped in version 206. Alongside the hosted MCP server (a remote agent
reaching in), the page registers tools on `navigator.modelContext` — the
W3C WebMCP API in Chrome/Edge 2026 — so a browser-side agent *driving the
page* gets the archive's tools with no token, acting as the member already
signed in. WebMCP's unique power over hosted MCP is moving the live UI:
`show_person_on_canvas` and `switch_view` operate the real canvas, next to
search/details/relationship reads and an `ask_the_archivist` passthrough.
`lib/webmcp-tools.ts` is the pure tool logic (unit-tested);
`app/components/useWebMcp.ts` adapts it to registerTool/unregisterTool with
feature detection and the mount lifecycle the spec requires (register on
mount, unregister on unmount). `tests/browser/webmcp.spec.ts` injects a mock
model-context via addInitScript and proves registration and a UI-moving call
on Chromium and WebKit. Future: editor-only WebMCP write tools that reuse the
member's session against the existing mutation routes (the browser agent is
the present editor, so direct apply is defensible there), and richer
UI-driving tools (open the record panel, start an import).

## Phase 5 — the archive as a tool (MCP)

- A hosted MCP server on the Worker (`/api/mcp` or a dedicated route) with
  OAuth connect-and-approve, so "add my archive to Claude" is paste-one-URL.
  The owner's `stack:add-mcp` pattern is the reference implementation.
- Read tools first: `find_person`, `person_record`, `relationship_path`,
  `list_stories`, `tree_summary` - all through the same visibility/redaction
  path as `/api/tree` (living-person redaction applies to agents too).
- Write tools second, and only as proposals: `propose_person`,
  `propose_relationship`, `record_story`, `attach_evidence`, `answer_question`.
  Every write lands in the existing claims/adjudication queue attributed to
  the connecting member's identity plus the agent's name; nothing an external
  agent does is un-undoable. Deletes are not exposed.
- Rate/budget limits reuse the existing fingerprint limiter.

## Phase 6 — genesis by conversation

- First-run experience on an empty archive: the archivist opens the interview
  itself ("Who are you? Tell me about your parents.") and builds the tree
  live. Interview provenance already exists; the empty-state routing does not.
- Agent-driven canvas focus: chat responses can carry a focus directive
  (person/branch) the canvas follows, so the conversation and the picture
  stay one thing. Streaming tree updates after each applied change.
- The ingestion pipeline becomes a hero flow: GEDCOM from Ancestry, a folder
  of scans, a eulogy PDF - "give me what you have and I will ask about the
  rest." Already works mechanically; needs the empty-archive path and
  progress narration.
- Voice is a later question (recording an elder is the killer version of the
  interview); not in scope until the text loop is excellent.

## Phase 7 — agent-runnable setup

- `AGENTS.md` at the repo root: a setup contract written for coding agents -
  exact provisioning commands (D1 create, R2 create, secrets list, OAuth
  registration steps with console URLs), verification probes, and the deploy
  ritual. The README points humans at it: "open this repo with your agent
  and say: set up my family archive."
- A `scripts/setup.mjs` the agent (or human) runs: checks wrangler auth,
  provisions resources, writes the instance's wrangler values, prints what
  it cannot do itself (OAuth console clicks) as a checklist.
- Model-boundary note: the archivist currently speaks OpenAI's API
  (`OPENAI_API_KEY`/`OPENAI_MODEL`). State of the art means the deployer
  brings whatever key they have; abstracting the model call behind one
  module (Anthropic/OpenAI-compatible) is a deliberate decision to make
  during this phase, not incidental drift.
- Free-tier honesty: this week's D1 daily-read quota incident proves the
  flagship runs at the edge of the free tier. The template documents the
  quota envelope, ships the R2-snapshot circuit breaker as standard, and
  recommends the paid plan for large or busy archives.

## Phase 8 — the nice example

- Onboarding: empty-archive first-run experience (claim admin, name the
  archive, add the first person or import GEDCOM), with `/demo` as the
  try-before-deploy sandbox.
- Browser tests runnable by strangers: session secret from env instead of the
  Mac Keychain; a documented local-instance mode
  (`PLAYWRIGHT_BASE_URL` already exists).
- The Iran-weighted map gazetteer gains a documented extension point (or a
  geocoding decision).
- Larger-tree CPU tuning notes: the light-shell + client-fetch design exists
  because of the Workers free-tier CPU budget; document the paid-plan
  alternative.

Each phase lands as small commits on `main` with the full gate
(test/tsc/lint/build) and production verified after deploy — the reference
instance must never notice the generalization happening under it.
