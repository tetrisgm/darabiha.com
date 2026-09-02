# Agentic family tree

A self-hosted family archive where an AI archivist is the primary way the
family records itself. Members talk to it, hand it documents, photographs,
GEDCOM exports, or scanned letters, and it builds a provenanced genealogy:
every fact can carry a source, conflicting sources become durable disputed
claims a person adjudicates, every mutation is audited and reversible, and
likely-living people are redacted from public view.

The reference instance is [darabiha.com](https://darabiha.com), which deploys
from `main` of this repo. Try the archivist with synthetic records at
[darabiha.com/demo](https://darabiha.com/demo) — no sign-in, nothing touches a
real archive.

## What's inside

- **Next.js (vinext) on a Cloudflare Worker** — one Worker, one D1 database,
  one R2 bucket per family. No servers.
- **The archivist** — chat with full create/read/update/delete tools over the
  tree, document ingestion with a durable queue, an interviewer mode that asks
  the family about gaps, and claim-level evidence with dispute adjudication.
- **A living canvas** — pedigree, fan, list, timeline, calendar, and map views
  over the same graph, in multiple languages.
- **GEDCOM 5.5.1/7 in and out** — deterministic parsing (including inside
  ZIP/GEDZip), and a one-click export so the family's data is never captive.
- **Quota resilience** — R2 snapshots plus a circuit breaker keep the archive
  readable through Cloudflare D1 free-tier daily-read exhaustion.

## Deploy your own

The fastest path: open this repo with a coding agent (Claude Code, Codex,
Cursor) and say **"set up my family archive"** — [AGENTS.md](AGENTS.md) is the
setup contract it will follow. By hand, the same steps are:

1. **Provision** (needs a Cloudflare account and `wrangler` logged in):
   ```sh
   npx wrangler d1 create my-family
   npx wrangler r2 bucket create my-family-files
   ```
2. **Configure `wrangler.jsonc`**: set `name`, the D1 `database_name`/`database_id`
   and R2 `bucket_name` from step 1, delete the `routes` block to serve from
   `workers.dev` (or point it at your own zone), and set the `vars`:
   - `PUBLIC_ORIGIN` — your deployed URL
   - `OWNER_EMAIL` — you; seeded as the first admin when the empty database
     starts (startup refuses to run without it)
   - `ARCHIVE_NAME`, `ARCHIVE_TAGLINE` — your family's name and one line about it
   - `ARCHIVE_NAME_<LANG>` — optional per-language name (e.g. a native script)
   - `ARCHIVE_PROMPT_CONTEXT` — optional paragraph telling the archivist which
     languages, scripts, and calendars your family's records use
3. **Secrets** (`npx wrangler secret put <NAME>`):
   - `AUTH_SESSION_SECRET` — any long random string; signs session cookies
   - `OPENAI_API_KEY` — powers the archivist (`OPENAI_MODEL` var to override
     the default model); without it the site works but AI features return 503
   - Sign in with Apple: `APPLE_CLIENT_ID`/`APPLE_TEAM_ID`/`APPLE_KEY_ID` vars
     plus `APPLE_PRIVATE_KEY` secret, callback
     `<PUBLIC_ORIGIN>/api/auth/apple/callback`
   - Google sign-in: `GOOGLE_CLIENT_ID` var plus `GOOGLE_CLIENT_SECRET`
     secret, callback `<PUBLIC_ORIGIN>/api/auth/google/callback`
   - Optional weekly digest email: `SMTP_URL`, `MAIL_FROM`, `MAIL_REPLY_TO`
4. **Deploy**: `npm install && npm run deploy`. The database schema creates
   and migrates itself at first request — there is no migration step.
5. **Sign in** with the `OWNER_EMAIL` account: you arrive as admin. Configure
   visibility (public / members / password) under Settings → Members & access,
   then start talking to the archivist or import a GEDCOM.

## Connect an assistant (MCP)

The archive is itself an MCP server. In Claude, ChatGPT, or any MCP client,
add a custom connector with the URL `https://<your-archive>/api/mcp` and
approve as a signed-in member; in Claude Code:

```sh
claude mcp add --transport http family-archive https://<your-archive>/api/mcp
```

Connected agents get read-only tools (people, records, relationship paths,
stories) with the approving member's access; leaving the member list revokes
their agents. `scripts/test-oauth-mcp-loop.py` is the end-to-end regression
gate for this flow - keep it passing.

## Develop

```sh
npm install
npm run dev        # local dev server
npm run gate       # tests + typecheck + lint + build — run before every push
npm run test:browser   # Playwright against the deployed site (PLAYWRIGHT_BASE_URL to override)
```

`npm run build` does **not** typecheck and `tsc` does not lint — the gate runs
all four on purpose.

## Honest limits

- One Worker is one family. There is no multi-tenancy and none is planned;
  isolation is the design.
- The Workers/D1 free tier fits a several-hundred-person archive with normal
  family traffic. The snapshot circuit breaker keeps reads alive if the D1
  daily read quota is exhausted; a busy or very large archive should use the
  paid plan.
- The archivist currently speaks OpenAI's API. Bring-your-own-provider is on
  the roadmap ([docs/PLATFORM.md](docs/PLATFORM.md)).
