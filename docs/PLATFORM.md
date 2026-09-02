# Platform plan: from Darabiha's archive to a deployable agentic family tree

Owner decisions (2026-09-01): the platform is a **fork-and-deploy template**,
generalized **in place in this repo** (darabiha.com stays the living reference
instance deploying from `main`), and the repo will eventually be **public**
after real family data is scrubbed from the tree. Multi-tenant SaaS is out of
scope; the store is deliberately one-Worker-one-family.

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

## Phase 5 — the nice example

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
